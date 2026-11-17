import "server-only";
import { signHubRequest } from "./signing";
import type {
  HubAction,
  HubErrorBody,
  HubErrorCode,
  HubEventsPage,
  HubFileUpload,
  HubNewTask,
  HubPerson,
  HubRunning,
  HubState,
  HubTask,
  HubTaskDetail,
  HubView,
} from "./types";

/**
 * Server-to-server client for Neram's task hub (TASK_HUB_CONTRACT.md).
 *
 * Env (server only, never NEXT_PUBLIC_):
 *   NERAM_HUB_URL     https://admin.neramclasses.com (staging: https://staging-admin.neramclasses.com)
 *   NERAM_HUB_APP     aesta
 *   NERAM_HUB_SECRET  32+ characters, the same value Admin has for "aesta"
 *
 * Every request is signed over the method, the exact path and query, and the
 * exact body text. Each call times out after 10 seconds. Failures throw
 * HubError, whose `error` is a plain sentence to show the person.
 *
 * `as` is always Aesta's users.id of the signed-in person, looked up on the
 * server. Never pass an id the browser sent.
 */

export const HUB_TIMEOUT_MS = 10_000;
const MIN_SECRET_LENGTH = 32;

const KNOWN_CODES: readonly HubErrorCode[] = [
  "invalid",
  "proof",
  "unsigned",
  "not_linked",
  "forbidden",
  "not_found",
  "not_ready",
  "error",
  "not_configured",
  "timeout",
  "unreachable",
];

const DEFAULT_MESSAGE: Record<HubErrorCode, string> = {
  invalid: "Something in that request is not right.",
  proof: "This task needs a photo or a note to close.",
  unsigned: "Tasks could not confirm this request came from Aesta.",
  not_linked: "Your account is not connected to tasks yet. Ask Hari.",
  forbidden: "You can't do that to this task.",
  not_found: "That task was not found.",
  not_ready: "Tasks are not ready yet. Please try again later.",
  error: "Something went wrong with tasks. Please try again.",
  not_configured: "Tasks are not set up on this server yet.",
  timeout: "Tasks did not answer in time. Please try again.",
  unreachable: "Could not reach tasks. Check the connection and try again.",
};

export class HubError extends Error {
  readonly status: number;
  readonly code: HubErrorCode;
  readonly field?: string;

  constructor(status: number, code: HubErrorCode, error?: string, field?: string) {
    super(error || DEFAULT_MESSAGE[code]);
    this.name = "HubError";
    this.status = status;
    this.code = code;
    this.field = field;
  }

  /** `{ error, code, field? }`, the shape our own routes answer with. */
  toBody(): HubErrorBody {
    return { error: this.message, code: this.code, ...(this.field ? { field: this.field } : {}) };
  }
}

interface HubConfig {
  origin: string;
  app: string;
  secret: string;
}

/** Reads the env each call (cheap) so tests and env changes need no reset. */
export function hubConfig(): HubConfig | null {
  const url = process.env.NERAM_HUB_URL?.trim();
  const app = process.env.NERAM_HUB_APP?.trim();
  const secret = process.env.NERAM_HUB_SECRET?.trim();
  if (!url || !app || !secret) return null;
  if (secret.length < MIN_SECRET_LENGTH) {
    console.error("[neram-hub] NERAM_HUB_SECRET is shorter than 32 characters");
    return null;
  }
  let origin: string;
  try {
    // Only the origin: the signed path must be exactly the path requested.
    origin = new URL(url).origin;
  } catch {
    console.error("[neram-hub] NERAM_HUB_URL is not a valid URL");
    return null;
  }
  return { origin, app, secret };
}

export function isHubConfigured(): boolean {
  return hubConfig() !== null;
}

type Query = Record<string, string | number | undefined | null>;

/** Path plus query in the order given, skipping empty values. Built once, signed and sent as is. */
export function buildPathAndQuery(path: string, query: Query = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.append(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

function requireAs(as: string): string {
  const id = typeof as === "string" ? as.trim() : "";
  if (!id) throw new HubError(400, "invalid", "Who is asking is missing.", "as");
  return id;
}

const taskPath = (id: string, rest = "") => `/api/hub/v1/tasks/${encodeURIComponent(id)}${rest}`;

async function hubRequest<T>(
  method: "GET" | "POST",
  path: string,
  query: Query,
  payload?: unknown,
): Promise<T> {
  const config = hubConfig();
  if (!config) throw new HubError(503, "not_configured");

  const pathAndQuery = buildPathAndQuery(path, query);
  const body = payload === undefined ? "" : JSON.stringify(payload);
  const headers: Record<string, string> = {
    ...signHubRequest(config.secret, config.app, method, pathAndQuery, body),
    accept: "application/json",
  };
  if (body) headers["content-type"] = "application/json";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HUB_TIMEOUT_MS);
  let res: Response;
  let text: string;
  try {
    res = await fetch(`${config.origin}${pathAndQuery}`, {
      method,
      headers,
      body: body || undefined,
      cache: "no-store",
      signal: controller.signal,
    });
    text = await res.text();
  } catch (err) {
    if (controller.signal.aborted) throw new HubError(504, "timeout");
    console.error(`[neram-hub] ${method} ${path} failed:`, err instanceof Error ? err.message : err);
    throw new HubError(502, "unreachable");
  } finally {
    clearTimeout(timer);
  }

  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }

  if (!res.ok) {
    const b = (json && typeof json === "object" ? json : {}) as Partial<HubErrorBody>;
    const code: HubErrorCode = KNOWN_CODES.includes(b.code as HubErrorCode)
      ? (b.code as HubErrorCode)
      : "error";
    if (code === "unsigned" || res.status >= 500) {
      // Worth a log line: a wrong secret / clock, or the hub having trouble.
      console.error(`[neram-hub] ${method} ${path} -> ${res.status} ${code}`);
    }
    throw new HubError(
      res.status,
      code,
      typeof b.error === "string" && b.error.trim() ? b.error : undefined,
      typeof b.field === "string" ? b.field : undefined,
    );
  }

  if (json === null || typeof json !== "object") {
    console.error(`[neram-hub] ${method} ${path} -> ${res.status} with a body that is not JSON`);
    throw new HubError(502, "error");
  }
  return json as T;
}

// ---------------------------------------------------------------------------
// One function per route
// ---------------------------------------------------------------------------

/** GET /api/hub/v1/people: everyone linked in Aesta, for the "give to" picker. */
export async function listPeople(): Promise<HubPerson[]> {
  const r = await hubRequest<{ people: HubPerson[] }>("GET", "/api/hub/v1/people", {});
  return r.people ?? [];
}

/** GET /api/hub/v1/tasks?as=&view=&state= */
export async function listTasks(
  as: string,
  opts: { view?: HubView; state?: HubState } = {},
): Promise<HubTask[]> {
  const r = await hubRequest<{ tasks: HubTask[] }>("GET", "/api/hub/v1/tasks", {
    as: requireAs(as),
    view: opts.view,
    state: opts.state,
  });
  return r.tasks ?? [];
}

/** POST /api/hub/v1/tasks?as= */
export async function createTask(as: string, task: HubNewTask): Promise<HubTaskDetail> {
  const r = await hubRequest<{ task: HubTaskDetail }>(
    "POST",
    "/api/hub/v1/tasks",
    { as: requireAs(as) },
    task,
  );
  return r.task;
}

/** GET /api/hub/v1/tasks/:id?as= */
export async function getTask(as: string, id: string): Promise<HubTaskDetail> {
  const r = await hubRequest<{ task: HubTaskDetail }>("GET", taskPath(id), { as: requireAs(as) });
  return r.task;
}

/** POST /api/hub/v1/tasks/:id/actions?as= */
export async function taskAction(as: string, id: string, action: HubAction): Promise<HubTaskDetail> {
  const r = await hubRequest<{ task: HubTaskDetail }>(
    "POST",
    taskPath(id, "/actions"),
    { as: requireAs(as) },
    action,
  );
  return r.task;
}

/** POST /api/hub/v1/tasks/:id/comments?as= (a voice note goes as its words) */
export async function addComment(as: string, id: string, text: string): Promise<HubTaskDetail> {
  const r = await hubRequest<{ task: HubTaskDetail }>(
    "POST",
    taskPath(id, "/comments"),
    { as: requireAs(as) },
    { text },
  );
  return r.task;
}

/** POST /api/hub/v1/tasks/:id/files?as= (JPEG/PNG/WebP, at most 3 MB, 6 a task) */
export async function addFile(as: string, id: string, file: HubFileUpload): Promise<HubTaskDetail> {
  const r = await hubRequest<{ task: HubTaskDetail }>(
    "POST",
    taskPath(id, "/files"),
    { as: requireAs(as) },
    file,
  );
  return r.task;
}

/** GET /api/hub/v1/running?as= */
export async function getRunning(as: string): Promise<HubRunning> {
  const r = await hubRequest<HubRunning>("GET", "/api/hub/v1/running", { as: requireAs(as) });
  return { now: r.now, running: r.running ?? [] };
}

/** GET /api/hub/v1/events?after=&limit= (Aesta's events after that id, oldest first) */
export async function listEvents(after: number, limit?: number): Promise<HubEventsPage> {
  const safeAfter = Number.isFinite(after) && after > 0 ? Math.floor(after) : 0;
  const safeLimit =
    limit === undefined ? undefined : Math.min(200, Math.max(1, Math.floor(limit)));
  const r = await hubRequest<HubEventsPage>("GET", "/api/hub/v1/events", {
    after: safeAfter,
    limit: safeLimit,
  });
  return { events: r.events ?? [], next: typeof r.next === "number" ? r.next : safeAfter };
}
