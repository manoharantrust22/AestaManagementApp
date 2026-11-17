/**
 * The words of Neram's task hub ↔ Aesta's task screens. Pure (browser-safe),
 * unit-tested. Aesta's components keep working on the `Task` shape; the hub
 * shapes are turned into it here.
 *
 *   status    in_progress ↔ doing, blocked ↔ waiting (todo, done, cancelled same)
 *   priority  medium ↔ normal (high, low same)
 *   size      small → short, medium → half, large → big
 *             (back: short → small, half → medium, big → large, quick → small)
 */
import type {
  Task,
  TaskAttachment,
  TaskPriority,
  TaskSize,
  TaskStatus,
  TaskUpdate,
  TaskUserRef,
} from "@/types/task.types";
import type {
  HubPersonRef,
  HubPriority,
  HubSize,
  HubStatus,
  HubTask,
  HubTaskDetail,
} from "./types";

export const STATUS_TO_HUB: Record<TaskStatus, HubStatus> = {
  todo: "todo",
  in_progress: "doing",
  blocked: "waiting",
  done: "done",
  cancelled: "cancelled",
};

export const STATUS_FROM_HUB: Record<HubStatus, TaskStatus> = {
  todo: "todo",
  doing: "in_progress",
  waiting: "blocked",
  done: "done",
  cancelled: "cancelled",
};

export const PRIORITY_TO_HUB: Record<TaskPriority, HubPriority> = {
  high: "high",
  medium: "normal",
  low: "low",
};

export const PRIORITY_FROM_HUB: Record<HubPriority, TaskPriority> = {
  high: "high",
  normal: "medium",
  low: "low",
};

export const SIZE_TO_HUB: Record<TaskSize, HubSize> = {
  small: "short",
  medium: "half",
  large: "big",
};

export const SIZE_FROM_HUB: Record<HubSize, TaskSize> = {
  quick: "small",
  short: "small",
  half: "medium",
  big: "large",
};

export const toHubStatus = (s: TaskStatus): HubStatus => STATUS_TO_HUB[s];
export const fromHubStatus = (s: HubStatus): TaskStatus => STATUS_FROM_HUB[s] ?? "todo";
export const toHubPriority = (p: TaskPriority): HubPriority => PRIORITY_TO_HUB[p];
export const fromHubPriority = (p: HubPriority): TaskPriority => PRIORITY_FROM_HUB[p] ?? "medium";
export const toHubSize = (s: TaskSize): HubSize => SIZE_TO_HUB[s];
export const fromHubSize = (s: HubSize | null | undefined): TaskSize => (s ? SIZE_FROM_HUB[s] ?? "small" : "small");

/** Bug reports sent from Aesta start with this, so both apps can tell them apart. */
export const BUG_TITLE_PREFIX = "🐞 ";

export function isBugTitle(title: string): boolean {
  return title.startsWith(BUG_TITLE_PREFIX.trim());
}

function stripBug(title: string): string {
  return isBugTitle(title) ? title.slice(BUG_TITLE_PREFIX.trim().length).trimStart() : title;
}

/**
 * A person from the hub as Aesta's TaskUserRef. Someone at Neram who is not
 * linked in Aesta (externalId null) gets a stable placeholder id and their name.
 */
export function personRef(p: HubPersonRef | null | undefined): TaskUserRef | null {
  if (!p) return null;
  return { id: p.externalId ?? `neram:${p.name}`, name: p.name };
}

/** One hub task as Aesta's Task, so TaskCard / TaskDetailDrawer render it unchanged. */
export function hubTaskToTask(t: HubTask | HubTaskDetail): Task {
  const owner = personRef(t.owner) ?? { id: "", name: "Someone" };
  const creator = personRef(t.givenBy) ?? owner;
  const bug = isBugTitle(t.title);
  const detail = t as Partial<HubTaskDetail>;
  return {
    id: t.id,
    title: stripBug(t.title),
    description: t.notes,
    created_by: creator.id,
    assignee_id: owner.id,
    site_id: t.page?.siteId ?? null,
    category: bug ? "app" : "other",
    priority: fromHubPriority(t.priority),
    size: fromHubSize(t.size),
    status: fromHubStatus(t.status),
    due_date: t.dueDate,
    blocker_note: t.waitingReason ?? (t.waitingOn ? `Waiting on ${t.waitingOn.name}` : null),
    source: bug ? "bug_report" : "manual",
    context: {
      ...(t.page ? { url: t.page.url, site_id: t.page.siteId, site_name: t.page.siteName, page: t.page } : {}),
      hub: {
        checkAsked: t.checkAsked,
        proofRequired: t.proofRequired,
        dueTime: t.dueTime,
        checker: t.checker,
        checklist: t.checklist,
      },
    },
    transcript: null,
    transcript_en: null,
    started_at: detail.time?.startedAt ?? null,
    completed_at: t.doneAt,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
    creator,
    assignee: owner,
    site: t.page?.siteId && t.page.siteName ? { id: t.page.siteId, name: t.page.siteName } : null,
  };
}

/** The hub's comments as Aesta's update thread (oldest first). */
export function hubCommentsToUpdates(t: HubTaskDetail): TaskUpdate[] {
  return [...(t.comments ?? [])]
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
    .map((c) => {
      const author = personRef(c.by);
      return {
        id: c.id,
        task_id: t.id,
        author_id: author?.id ?? "",
        kind: "comment" as const,
        body: c.text,
        from_status: null,
        to_status: null,
        transcript: null,
        transcript_en: null,
        created_at: c.at,
        author,
      };
    });
}

/** The hub's photos (signed links, an hour) as task-level attachments. */
export function hubPhotosToAttachments(t: HubTaskDetail): Array<TaskAttachment & { url: string | null }> {
  return (t.photos ?? []).map((p, i) => ({
    id: `${t.id}:photo:${i}`,
    task_id: t.id,
    update_id: null,
    kind: "photo" as const,
    storage_path: p.name,
    mime: null,
    uploaded_by: null,
    created_at: t.updatedAt,
    url: p.url,
  }));
}

/**
 * A voice note's English words (and the typed text) as one text for the hub,
 * which keeps no audio. The Tamil original is kept after the English when it
 * differs, so nothing said is lost.
 */
export function composeText(parts: {
  typed?: string | null;
  transcript?: string | null;
  transcriptEn?: string | null;
}): string {
  const typed = parts.typed?.trim() || "";
  const en = parts.transcriptEn?.trim() || "";
  const orig = parts.transcript?.trim() || "";
  const spoken = en || orig;
  const lines: string[] = [];
  if (typed) lines.push(typed);
  if (spoken && spoken !== typed) lines.push(typed ? `🎤 ${spoken}` : spoken);
  if (orig && en && orig !== en) lines.push(`(Tamil: ${orig})`);
  return lines.join("\n");
}

/** The hub action for a status change made in Aesta's screens. */
export function statusChangeAction(
  from: TaskStatus,
  to: TaskStatus,
  note: string | null,
):
  | { action: "start" }
  | { action: "done"; note?: string }
  | { action: "waiting"; reason: string }
  | { action: "put_back" }
  | { action: "cancel"; reason: "other" } {
  switch (to) {
    case "in_progress":
      return { action: "start" };
    case "done":
      return note ? { action: "done", note } : { action: "done" };
    case "blocked":
      return { action: "waiting", reason: note || "Needs help" };
    case "todo":
      return { action: "put_back" };
    case "cancelled":
      return { action: "cancel", reason: "other" };
    default: {
      // Exhaustive: TaskStatus has no other values.
      const never: never = to;
      throw new Error(`No hub action for ${String(never)} (from ${from})`);
    }
  }
}
