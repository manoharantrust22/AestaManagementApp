import "server-only";
import {
  addComment,
  createTask,
  getTask as hubGetTask,
  HubError,
  listTasks,
  taskAction,
} from "@/lib/neram-hub/client";
import {
  BUG_TITLE_PREFIX,
  fromHubStatus,
  hubTaskToTask,
  statusChangeAction,
  toHubPriority,
  toHubSize,
} from "@/lib/neram-hub/mapping";
import { canonicalPageUrl, NOT_LINKED_MESSAGE } from "@/lib/neram-hub/route";
import type { TaskPriority, TaskSize, TaskStatus } from "@/types/task.types";

/**
 * The assistant's task tools when tasks live in Neram's task hub
 * (NEXT_PUBLIC_FF_NERAM_TASKS=true). `meId` is always the signed-in person's
 * users.id from the server, never something the model or browser chose.
 */

function plain(err: unknown): never {
  if (err instanceof HubError) {
    throw new Error(err.code === "not_linked" ? NOT_LINKED_MESSAGE : err.message);
  }
  throw err;
}

async function hub<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    plain(err);
  }
}

type Scope = "mine" | "assigned_by_me" | "person";

/** list_tasks: same shape the model already knows. */
export async function hubListTasks(meId: string, scope: Scope, status: string, userId?: string, search?: string) {
  const view = scope === "mine" ? "mine" : scope === "assigned_by_me" ? "given" : "all";
  const states = status === "open" ? (["open"] as const) : status === "any" ? (["open", "closed"] as const)
    : status === "done" || status === "cancelled" ? (["closed"] as const) : (["open"] as const);
  const lists = await hub(() => Promise.all(states.map((state) => listTasks(meId, { view, state }))));
  let tasks = lists.flat().map(hubTaskToTask);
  if (scope === "person" && userId) tasks = tasks.filter((t) => t.assignee_id === userId);
  if (status !== "open" && status !== "any") tasks = tasks.filter((t) => t.status === status);
  if (search) {
    const q = search.toLowerCase();
    tasks = tasks.filter((t) => t.title.toLowerCase().includes(q));
  }
  return tasks.slice(0, 25).map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    size: t.size,
    due_date: t.due_date,
    blocker_note: t.blocker_note,
    assignee: { name: t.assignee?.name ?? null },
    creator: { name: t.creator?.name ?? null },
  }));
}

/** For confirm cards: id, title, status (Aesta words), or null when not visible. */
export async function hubFindTask(meId: string, id: string) {
  try {
    const t = await hubGetTask(meId, id);
    return { id: t.id, title: t.title, status: fromHubStatus(t.status) as string };
  } catch (err) {
    if (err instanceof HubError && (err.code === "not_found" || err.code === "forbidden")) return null;
    plain(err);
  }
}

export async function hubCreateTask(
  meId: string,
  args: {
    title: string;
    assignee_id: string;
    description?: string | null;
    priority: TaskPriority;
    size: TaskSize;
    due_date: string | null;
    site_id?: string | null;
    site_name?: string | null;
  },
) {
  const url = args.site_id ? canonicalPageUrl(`/site/dashboard?site=${encodeURIComponent(args.site_id)}`) : null;
  const task = await hub(() =>
    createTask(meId, {
      title: args.title,
      notes: args.description ?? null,
      owner: args.assignee_id,
      dueDate: args.due_date,
      priority: toHubPriority(args.priority),
      size: toHubSize(args.size),
      page: url
        ? { url, title: args.site_name ? `${args.site_name} dashboard` : "Site dashboard", siteId: args.site_id!, siteName: args.site_name ?? null }
        : null,
    }),
  );
  return task.id;
}

export async function hubChangeStatus(meId: string, taskId: string, from: TaskStatus, to: TaskStatus, note: string | null) {
  await hub(() => taskAction(meId, taskId, statusChangeAction(from, to, note)));
  if (to === "cancelled" && note) await hub(() => addComment(meId, taskId, note));
}

export async function hubAddComment(meId: string, taskId: string, text: string) {
  await hub(() => addComment(meId, taskId, text));
}

export async function hubCreateBug(
  meId: string,
  ownerId: string,
  args: { title: string; details: string | null; priority: TaskPriority },
) {
  const task = await hub(() =>
    createTask(meId, {
      title: `${BUG_TITLE_PREFIX}${args.title}`,
      notes: [args.details, "(reported through the assistant)"].filter(Boolean).join("\n\n"),
      owner: ownerId,
      priority: toHubPriority(args.priority),
      size: "short",
    }),
  );
  return task.id;
}
