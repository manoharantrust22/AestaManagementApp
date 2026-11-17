/**
 * One-time move of Aesta's open tasks into Neram's task hub.
 *
 *   Dry run (default, writes nothing, needs no hub settings):
 *     npx dotenv -e .env.cloud.local -- npx tsx --conditions=react-server scripts/move-tasks-to-hub.ts
 *   Real run (needs NERAM_HUB_URL / NERAM_HUB_APP / NERAM_HUB_SECRET):
 *     npx dotenv -e .env.cloud.local -- npx tsx --conditions=react-server scripts/move-tasks-to-hub.ts --apply
 *
 * For each open task (To do, In progress, Blocked):
 *   1. create it in the hub as its creator, given to its assignee;
 *   2. the action for its status (in progress → start, blocked → waiting);
 *   3. its updates as comments (as their author; as the creator, with the
 *      author's name, when the author isn't linked);
 *   4. its photos and screenshots (≤ 3 MB each; voice notes go as their words).
 * Prints old id → hub id. Safe to run twice: the hub id is stored in the old
 * task's context (context.hub_task_id) right after step 1, and tasks that
 * have one are skipped.
 * (`--conditions=react-server` lets the hub client's `server-only` guard load
 * outside Next.)
 */
import { createClient } from "@supabase/supabase-js";
import {
  addComment,
  addFile,
  createTask,
  HubError,
  isHubConfigured,
  taskAction,
} from "../src/lib/neram-hub/client";
import { BUG_TITLE_PREFIX, composeText, toHubPriority, toHubSize } from "../src/lib/neram-hub/mapping";
import type { HubAction, HubPage } from "../src/lib/neram-hub/types";

const APPLY = process.argv.includes("--apply");
const ORIGIN = (process.env.AESTA_APP_ORIGIN || "https://app.aesta.co.in").replace(/\/+$/, "");
const BUCKET = "task-attachments";
const MAX_PHOTO = 3 * 1024 * 1024;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (e.g. run through dotenv -e .env.cloud.local).");
  process.exit(1);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) as any;

interface OldTask {
  id: string;
  title: string;
  description: string | null;
  created_by: string;
  assignee_id: string;
  site_id: string | null;
  priority: "high" | "medium" | "low";
  size: "small" | "medium" | "large";
  status: "todo" | "in_progress" | "blocked";
  due_date: string | null;
  blocker_note: string | null;
  source: "manual" | "assistant" | "bug_report";
  context: Record<string, any> | null;
  transcript: string | null;
  transcript_en: string | null;
  created_at: string;
  site: { name: string } | null;
}

interface OldUpdate {
  id: string;
  task_id: string;
  author_id: string;
  kind: string;
  body: string | null;
  transcript: string | null;
  transcript_en: string | null;
  created_at: string;
  author: { name: string } | null;
}

interface OldAttachment {
  task_id: string;
  kind: "screenshot" | "photo" | "voice";
  storage_path: string;
  mime: string | null;
}

const short = (id: string) => id.slice(0, 8);

function statusAction(t: OldTask): HubAction | null {
  if (t.status === "in_progress") return { action: "start" };
  if (t.status === "blocked") return { action: "waiting", reason: t.blocker_note || "Blocked (moved from Aesta)" };
  return null;
}

function pageOf(t: OldTask): HubPage | null {
  const c = t.context ?? {};
  if (c.page?.url) {
    const u = new URL(c.page.url, ORIGIN);
    return { url: `${ORIGIN}${u.pathname}${u.search}`, title: c.page.title ?? null, siteId: c.page.siteId ?? null, siteName: c.page.siteName ?? null };
  }
  if (t.site_id) {
    return {
      url: `${ORIGIN}/site/dashboard?site=${t.site_id}`,
      title: t.site?.name ? `${t.site.name} dashboard` : "Site dashboard",
      siteId: t.site_id,
      siteName: t.site?.name ?? null,
    };
  }
  return null;
}

function notesOf(t: OldTask): string | null {
  const parts = [composeText({ typed: t.description, transcript: t.transcript, transcriptEn: t.transcript_en })];
  if (t.source === "bug_report" && t.context?.url) parts.push(`Page: ${t.context.url}`);
  parts.push(`(Moved from Aesta task ${short(t.id)}, created ${t.created_at.slice(0, 10)})`);
  return parts.filter(Boolean).join("\n\n").slice(0, 4000);
}

function hubWhy(err: unknown): string {
  return err instanceof HubError ? `${err.code}: ${err.message}` : err instanceof Error ? err.message : String(err);
}

async function main() {
  console.log(APPLY ? "== MOVING open tasks to the task hub ==" : "== DRY RUN (nothing is written; add --apply to move) ==");
  if (APPLY && !isHubConfigured()) {
    console.error("NERAM_HUB_URL / NERAM_HUB_APP / NERAM_HUB_SECRET are not set (secret must be 32+ characters).");
    process.exit(1);
  }

  const { data: tasks, error } = await db
    .from("tasks")
    .select("*, site:sites(name)")
    .in("status", ["todo", "in_progress", "blocked"])
    .order("created_at", { ascending: true });
  if (error) throw new Error(`read tasks: ${error.message}`);
  const all = (tasks ?? []) as OldTask[];
  const todo = all.filter((t) => !t.context?.hub_task_id);
  const already = all.length - todo.length;

  const ids = todo.map((t) => t.id);
  const [{ data: updates }, { data: atts }, { data: users }] = await Promise.all([
    ids.length
      ? db.from("task_updates").select("*, author:users!task_updates_author_id_fkey(name)").in("task_id", ids).order("created_at")
      : { data: [] },
    ids.length ? db.from("task_attachments").select("task_id, kind, storage_path, mime").in("task_id", ids) : { data: [] },
    db.from("users").select("id, name"),
  ]);
  const nameOf = new Map(((users ?? []) as Array<{ id: string; name: string }>).map((u) => [u.id, u.name]));

  console.log(`Open tasks: ${all.length} · already moved: ${already} · to move: ${todo.length}`);
  const results: Array<{ old: string; hub: string; note: string }> = [];

  for (const t of todo) {
    const myUpdates = ((updates ?? []) as OldUpdate[]).filter((u) => u.task_id === t.id);
    const comments = myUpdates
      .map((u) => ({ u, text: composeText({ typed: u.body, transcript: u.transcript, transcriptEn: u.transcript_en }) }))
      .filter((c) => c.text);
    const images = ((atts ?? []) as OldAttachment[]).filter((a) => a.task_id === t.id && a.kind !== "voice");
    const act = statusAction(t);
    const plan =
      `"${t.title}" · ${nameOf.get(t.created_by) ?? "?"} → ${nameOf.get(t.assignee_id) ?? "?"} · ${t.status}` +
      `${act ? ` (then ${act.action})` : ""} · ${comments.length} comment(s) · ${images.length} photo(s)`;

    if (!APPLY) {
      results.push({ old: t.id, hub: "(would create)", note: plan });
      continue;
    }

    let hubId = "";
    try {
      const created = await createTask(t.created_by, {
        title: (t.source === "bug_report" ? BUG_TITLE_PREFIX : "") + t.title,
        notes: notesOf(t),
        owner: t.assignee_id,
        dueDate: t.due_date,
        priority: toHubPriority(t.priority),
        size: toHubSize(t.size),
        page: pageOf(t),
      });
      hubId = created.id;
      // Record it at once so a second run skips this task even if a later step fails.
      const { error: upErr } = await db
        .from("tasks")
        .update({ context: { ...(t.context ?? {}), hub_task_id: hubId, hub_moved_at: new Date().toISOString() } })
        .eq("id", t.id);
      if (upErr) console.warn(`  ! ${short(t.id)}: hub task made (${hubId}) but not recorded: ${upErr.message}`);
    } catch (err) {
      results.push({ old: t.id, hub: "FAILED", note: `create: ${hubWhy(err)}` });
      continue;
    }

    const problems: string[] = [];
    if (act) {
      try {
        await taskAction(t.assignee_id, hubId, act);
      } catch (err) {
        problems.push(`${act.action}: ${hubWhy(err)}`);
      }
    }
    for (const { u, text } of comments) {
      try {
        await addComment(u.author_id, hubId, text);
      } catch (err) {
        if (err instanceof HubError && err.code === "not_linked") {
          try {
            await addComment(t.created_by, hubId, `${u.author?.name ?? "Someone"}: ${text}`);
            continue;
          } catch (err2) {
            problems.push(`comment ${short(u.id)}: ${hubWhy(err2)}`);
            continue;
          }
        }
        problems.push(`comment ${short(u.id)}: ${hubWhy(err)}`);
      }
    }
    for (const a of images) {
      try {
        const { data: blob, error: dlErr } = await db.storage.from(BUCKET).download(a.storage_path);
        if (dlErr || !blob) throw new Error(dlErr?.message ?? "download failed");
        const buf = Buffer.from(await blob.arrayBuffer());
        if (buf.length > MAX_PHOTO) {
          problems.push(`photo ${a.storage_path}: larger than 3 MB, left in Aesta`);
          continue;
        }
        const type = (a.mime ?? "").includes("png") ? "image/png" : (a.mime ?? "").includes("webp") ? "image/webp" : "image/jpeg";
        await addFile(t.created_by, hubId, { name: a.storage_path.split("/").pop() ?? "photo.jpg", type, data: buf.toString("base64") });
      } catch (err) {
        problems.push(`photo ${a.storage_path}: ${hubWhy(err)}`);
      }
    }
    results.push({ old: t.id, hub: hubId, note: problems.length ? `moved, with problems: ${problems.join("; ")}` : "moved" });
  }

  console.log("");
  console.log("old id                                  → hub id");
  for (const r of results) console.log(`${r.old} → ${r.hub}   ${r.note}`);
  if (!results.length) console.log("(nothing to move)");
  const failed = results.filter((r) => r.hub === "FAILED").length;
  console.log("");
  console.log(APPLY ? `Done: ${results.length - failed} moved, ${failed} failed, ${already} skipped (moved before).` : `Dry run: ${results.length} would move, ${already} already moved.`);
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error("FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
