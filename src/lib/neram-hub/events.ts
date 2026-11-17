import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { hubConfig, listEvents } from "./client";
import { verifyHubRequest } from "./signing";
import type { HubEvent, HubEventKind } from "./types";

/**
 * Events from Neram Admin (TASK_HUB_CONTRACT.md > Events).
 *
 * Two ways in, one way to store:
 *  - push: Admin POSTs signed events to /api/neram/events (receiveHubEvents)
 *  - pull: when the Tasks page opens we ask GET /api/hub/v1/events?after=<cursor>
 *    (pullHubEvents), so a push that never arrived is still caught.
 * Both call neram_hub_record_event() (migration 20261117100000), which stores
 * each event id once and writes one Aesta notification per person in `to`.
 */

export const EVENTS_PATH = "/api/neram/events";
const CURSOR_KEY = "events_cursor";
const KINDS: readonly HubEventKind[] = [
  "assigned",
  "sent_back",
  "check",
  "check_ok",
  "done",
  "blocked",
  "waiting_on_you",
  "comment",
  "changed",
];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface HubEventStore {
  /** true the first time a nonce is seen, false for a replay. */
  claimNonce(nonce: string): Promise<boolean>;
  /** true when stored now, false when that event id was already stored. */
  recordEvent(event: HubEvent, via: "push" | "pull"): Promise<boolean>;
}

/** Keeps only well-formed events; `to` keeps only uuids (Aesta users.id). */
export function readEvents(raw: unknown): HubEvent[] | null {
  const list = (raw && typeof raw === "object" ? (raw as { events?: unknown }).events : null) as unknown;
  if (!Array.isArray(list)) return null;
  const out: HubEvent[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") return null;
    const e = item as Record<string, unknown>;
    const id = typeof e.id === "number" ? e.id : Number(e.id);
    if (!Number.isSafeInteger(id) || id <= 0) return null;
    const kind = (KINDS as readonly string[]).includes(e.kind as string) ? (e.kind as HubEventKind) : "changed";
    out.push({
      id,
      kind,
      taskId: typeof e.taskId === "string" && e.taskId ? e.taskId : null,
      to: Array.isArray(e.to) ? e.to.filter((x): x is string => typeof x === "string" && UUID_RE.test(x)) : [],
      subject: typeof e.subject === "string" ? e.subject : "",
      message: typeof e.message === "string" ? e.message : "",
      at: typeof e.at === "string" ? e.at : new Date().toISOString(),
    });
  }
  return out;
}

export type ReceiveResult =
  | { status: 200; body: { ok: true; stored: number; duplicates: number } }
  | { status: 400 | 401 | 503; body: { error: string; code: string } };

/**
 * The checks for a pushed batch, in order: configured, signature + app + time,
 * nonce never seen, body shape. Then each event is stored (a repeated event id
 * is counted, not an error). A storage failure throws, so the route answers
 * 500 and Admin keeps the event for the pull.
 */
export async function receiveHubEvents(input: {
  headers: { get(name: string): string | null };
  method: string;
  pathAndQuery: string;
  body: string;
  store: HubEventStore;
  now?: number;
}): Promise<ReceiveResult> {
  const config = hubConfig();
  if (!config) {
    return { status: 503, body: { error: "Tasks are not set up on this server yet.", code: "not_configured" } };
  }

  const check = verifyHubRequest({
    headers: input.headers,
    secret: config.secret,
    app: config.app,
    method: input.method,
    pathAndQuery: input.pathAndQuery,
    body: input.body,
    now: input.now,
  });
  if (!check.ok) {
    console.warn(`[neram-hub] event push refused: ${check.reason}`);
    return { status: 401, body: { error: "The signature check failed.", code: "unsigned" } };
  }
  if (input.pathAndQuery.split("?")[0] !== EVENTS_PATH) {
    return { status: 401, body: { error: "The signature check failed.", code: "unsigned" } };
  }

  if (!(await input.store.claimNonce(check.nonce))) {
    console.warn("[neram-hub] event push refused: nonce already seen");
    return { status: 401, body: { error: "The signature check failed.", code: "unsigned" } };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(input.body);
  } catch {
    return { status: 400, body: { error: "The body is not JSON.", code: "invalid" } };
  }
  const events = readEvents(parsed);
  if (!events) return { status: 400, body: { error: "Send { events: [...] }.", code: "invalid" } };

  let stored = 0;
  let duplicates = 0;
  for (const e of [...events].sort((a, b) => a.id - b.id)) {
    if (await input.store.recordEvent(e, "push")) stored++;
    else duplicates++;
  }
  return { status: 200, body: { ok: true, stored, duplicates } };
}

// ---------------------------------------------------------------------------
// Supabase-backed store (service role) and the pull
// ---------------------------------------------------------------------------

export function supabaseEventStore(): HubEventStore {
  // The hub tables/functions are newer than the generated types.
  const db = createAdminClient() as any;
  return {
    async claimNonce(nonce) {
      const { data, error } = await db.rpc("neram_hub_claim_nonce", { p_nonce: nonce });
      if (error) throw new Error(`claim nonce: ${error.message}`);
      return data === true;
    },
    async recordEvent(e, via) {
      const { data, error } = await db.rpc("neram_hub_record_event", {
        p_id: e.id,
        p_kind: e.kind,
        p_task_id: e.taskId,
        p_to: e.to,
        p_subject: e.subject,
        p_message: e.message,
        p_at: e.at,
        p_via: via,
      });
      if (error) throw new Error(`record event ${e.id}: ${error.message}`);
      return data === true;
    },
  };
}

const PULL_PAGE = 200;
const PULL_MAX_PAGES = 5;
/** Several people opening Tasks at once need only one pull. */
const PULL_MIN_INTERVAL_MS = 20_000;

/**
 * Pulls every event after our cursor and stores it. Skips when another pull
 * ran in the last 20 seconds. Returns how many were new.
 */
export async function pullHubEvents(opts: { force?: boolean } = {}): Promise<{
  stored: number;
  cursor: number;
  skipped: boolean;
}> {
  const db = createAdminClient() as any;
  const { data: row, error } = await db
    .from("neram_hub_state")
    .select("value, updated_at")
    .eq("key", CURSOR_KEY)
    .maybeSingle();
  if (error) throw new Error(`read cursor: ${error.message}`);

  let cursor = Number(row?.value ?? 0) || 0;
  if (!opts.force && row?.updated_at && Date.now() - new Date(row.updated_at).getTime() < PULL_MIN_INTERVAL_MS) {
    return { stored: 0, cursor, skipped: true };
  }

  const store = supabaseEventStore();
  let stored = 0;
  for (let page = 0; page < PULL_MAX_PAGES; page++) {
    const { events, next } = await listEvents(cursor, PULL_PAGE);
    for (const e of readEvents({ events }) ?? []) {
      if (await store.recordEvent(e, "pull")) stored++;
    }
    const { data: moved, error: curErr } = await db.rpc("neram_hub_advance_cursor", {
      p_key: CURSOR_KEY,
      p_value: Math.max(cursor, next),
    });
    if (curErr) throw new Error(`advance cursor: ${curErr.message}`);
    const newCursor = Number(moved ?? next);
    if (events.length < PULL_PAGE || newCursor <= cursor) {
      cursor = newCursor;
      break;
    }
    cursor = newCursor;
  }
  return { stored, cursor, skipped: false };
}
