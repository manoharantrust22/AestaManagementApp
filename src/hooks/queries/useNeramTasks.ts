"use client";

/**
 * Task hooks backed by Neram's task hub (through /api/neram/*). Same names,
 * arguments and return shapes as the Supabase hooks in useTasks.ts, which
 * picks one set or the other with NEXT_PUBLIC_FF_NERAM_TASKS.
 *
 * Realtime becomes a refetch when the window gets focus and every 60 seconds
 * while a task screen is open.
 */

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/cache/keys";
import { useAuth } from "@/contexts/AuthContext";
import { sortTasks } from "@/lib/tasks/sortTasks";
import { neramApi, NeramTaskError, isNotLinked } from "@/lib/neram-hub/browser";
import {
  BUG_TITLE_PREFIX,
  composeText,
  hubCommentsToUpdates,
  hubPhotosToAttachments,
  hubTaskToTask,
  statusChangeAction,
  toHubPriority,
  toHubSize,
} from "@/lib/neram-hub/mapping";
import { photoForHub } from "@/lib/neram-hub/photo";
import type { HubPage, HubState, HubTaskDetail, HubView } from "@/lib/neram-hub/types";
import {
  TASK_OPEN_STATUSES,
  type AddTaskUpdateInput,
  type CreateTaskInput,
  type PendingAttachment,
  type Task,
  type TaskAttachment,
  type TaskUpdate,
  type TaskUserRef,
  type UpdateTaskStatusInput,
} from "@/types/task.types";
import type { TaskListFilters, TaskScope } from "./useTasks";

type AttachmentWithUrl = TaskAttachment & { url: string | null };

const VIEW: Record<TaskScope, HubView> = { mine: "mine", assigned_by_me: "given", all: "all" };
const REFRESH_MS = 60_000;

const detailKey = (id: string) => [...queryKeys.tasks.all, "hub-detail", id] as const;

/** Don't hammer the server on answers that won't change by asking again. */
function retry(count: number, err: Error): boolean {
  if (err instanceof NeramTaskError && err.status >= 400 && err.status < 500) return false;
  return count < 2;
}

const todayIST = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

function statesFor(filters: TaskListFilters): HubState[] {
  const s = filters.statuses;
  if (!s?.length) return ["open", "closed"];
  const wantsOpen = s.some((x) => TASK_OPEN_STATUSES.includes(x));
  const wantsClosed = s.some((x) => x === "done" || x === "cancelled");
  return [...(wantsOpen ? (["open"] as const) : []), ...(wantsClosed ? (["closed"] as const) : [])];
}

async function fetchList(scope: TaskScope, filters: TaskListFilters): Promise<Task[]> {
  const lists = await Promise.all(statesFor(filters).map((st) => neramApi.tasks(VIEW[scope], st)));
  const seen = new Set<string>();
  let tasks = lists
    .flatMap((l) => l.tasks)
    .filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)))
    .map(hubTaskToTask);
  if (filters.statuses?.length) tasks = tasks.filter((t) => filters.statuses!.includes(t.status));
  if (filters.dueOnOrBefore) {
    const d = filters.dueOnOrBefore;
    tasks = tasks.filter((t) => !t.due_date || t.due_date <= d);
  }
  if (filters.sourceBugOnly) tasks = tasks.filter((t) => t.source === "bug_report");
  return sortTasks(tasks).slice(0, filters.limit ?? 200);
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useTasksHub(scope: TaskScope, filters: TaskListFilters = {}) {
  const { userProfile } = useAuth();
  const userId = userProfile?.id;
  const isAdmin = userProfile?.role === "admin";
  return useQuery({
    queryKey: [...queryKeys.tasks.list(scope, userId ?? "anon"), "hub", filters],
    enabled: !!userId && (scope !== "all" || isAdmin),
    staleTime: 30_000,
    retry,
    queryFn: () => fetchList(scope, filters),
  });
}

export function useMyOpenTaskCountHub() {
  const { userProfile } = useAuth();
  const userId = userProfile?.id;
  return useQuery({
    queryKey: [...queryKeys.tasks.list("mine-count", userId ?? "anon"), "hub"],
    enabled: !!userId,
    staleTime: 60_000,
    retry,
    queryFn: async (): Promise<number> => {
      try {
        return (await neramApi.tasks("mine", "open")).tasks.length;
      } catch (err) {
        if (isNotLinked(err)) return 0; // not connected yet: no badge, the Tasks page explains
        throw err;
      }
    },
  });
}

export function useTeamTaskSummaryHub(enabled: boolean) {
  const { userProfile } = useAuth();
  return useQuery({
    queryKey: [...queryKeys.tasks.list("team-summary", userProfile?.id ?? "anon"), "hub"],
    enabled: enabled && !!userProfile?.id,
    staleTime: 60_000,
    retry,
    queryFn: async () => {
      const today = todayIST();
      const startOfDay = new Date(`${today}T00:00:00+05:30`).toISOString();
      const [open, closed] = await Promise.all([neramApi.tasks("all", "open"), neramApi.tasks("all", "closed")]);
      const openTasks = open.tasks.map(hubTaskToTask);
      return {
        open: openTasks.length,
        blocked: openTasks.filter((t) => t.status === "blocked").length,
        overdue: openTasks.filter((t) => t.due_date && t.due_date < today).length,
        openBugs: openTasks.filter((t) => t.source === "bug_report").length,
        doneToday: closed.tasks.filter((t) => t.status === "done" && t.doneAt && t.doneAt >= startOfDay).length,
      };
    },
  });
}

function useHubDetail(id: string | null | undefined) {
  return useQuery({
    queryKey: detailKey(id ?? "none"),
    enabled: !!id,
    staleTime: 30_000,
    retry,
    queryFn: async (): Promise<HubTaskDetail | null> => {
      try {
        return (await neramApi.task(id!)).task;
      } catch (err) {
        if (err instanceof NeramTaskError && err.code === "not_found") return null;
        throw err;
      }
    },
  });
}

export function useTaskHub(id: string | null | undefined) {
  const q = useHubDetail(id);
  return { ...q, data: q.data ? hubTaskToTask(q.data) : q.data === null ? null : undefined };
}

export function useTaskUpdatesHub(taskId: string | null | undefined) {
  const q = useHubDetail(taskId);
  return { ...q, data: q.data ? hubCommentsToUpdates(q.data) : ([] as TaskUpdate[]) };
}

export function useTaskAttachmentsHub(taskId: string | null | undefined) {
  const q = useHubDetail(taskId);
  return { ...q, data: q.data ? hubPhotosToAttachments(q.data) : ([] as AttachmentWithUrl[]) };
}

/** People linked to tasks in Aesta (the hub decides who can be given a task). */
export function useAssignableUsersHub() {
  return useQuery({
    queryKey: [...queryKeys.tasks.assignableUsers(), "hub"],
    staleTime: 10 * 60_000,
    retry,
    queryFn: async (): Promise<TaskUserRef[]> => {
      const { people } = await neramApi.people();
      return people
        .map((p) => ({ id: p.externalId, name: p.name, role: p.role ?? (p.kind === "outside" ? "outside" : null) }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

function storeDetail(qc: QueryClient, task: HubTaskDetail) {
  qc.setQueryData(detailKey(task.id), task);
  qc.invalidateQueries({ queryKey: queryKeys.tasks.all, refetchType: "active" });
}

/** Photos and screenshots go to the files route (voice is kept as its words). */
async function uploadImages(taskId: string, attachments: PendingAttachment[] | undefined): Promise<HubTaskDetail | null> {
  let last: HubTaskDetail | null = null;
  for (const att of attachments ?? []) {
    if (att.kind === "voice") continue;
    const file = await photoForHub(att.blob, att.kind === "screenshot" ? "screenshot.jpg" : "photo.jpg");
    last = (await neramApi.file(taskId, file)).task;
  }
  return last;
}

function bugNotes(input: CreateTaskInput, spoken: string): string {
  const c = (input.context ?? {}) as Record<string, any>;
  const lines: string[] = [];
  if (spoken) lines.push(spoken);
  const facts: string[] = [];
  if (c.url) facts.push(`Page: ${c.url}`);
  if (c.site_name) facts.push(`Site: ${c.site_name}`);
  if (c.selector) facts.push(`Element: ${c.selector}${c.element_text ? ` ("${c.element_text}")` : ""}`);
  if (c.viewport) facts.push(`Screen: ${c.viewport.w}×${c.viewport.h} @${c.viewport.dpr}x`);
  if (c.user_agent) facts.push(`Device: ${c.user_agent}`);
  if (c.app_version) facts.push(`App version: ${c.app_version}`);
  if (facts.length) lines.push("", ...facts);
  const errs = (c.console_errors ?? []) as Array<{ level: string; message: string }>;
  if (errs.length) {
    lines.push("", "Recent console errors:");
    errs.slice(-10).forEach((e) => lines.push(`[${e.level}] ${String(e.message).slice(0, 300)}`));
  }
  return lines.join("\n").slice(0, 4000);
}

function pageFor(input: CreateTaskInput): HubPage | null {
  if (input.page?.url) return input.page;
  const c = (input.context ?? {}) as Record<string, any>;
  if (input.source === "bug_report" && typeof c.url === "string") {
    return { url: c.url, title: "Where the problem was", siteId: c.site_id ?? null, siteName: c.site_name ?? null };
  }
  return null;
}

export function useCreateTaskHub() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTaskInput): Promise<Task> => {
      const spoken = composeText({
        typed: input.description,
        transcript: input.transcript,
        transcriptEn: input.transcript_en,
      });
      const bug = input.source === "bug_report";
      const title = input.title.trim();
      const { task } = await neramApi.create({
        title: bug ? `${BUG_TITLE_PREFIX}${title}` : title,
        notes: (bug ? bugNotes(input, spoken) : spoken) || null,
        owner: input.assignee_id,
        dueDate: input.due_date ?? null,
        priority: input.priority ? toHubPriority(input.priority) : undefined,
        size: input.size ? toHubSize(input.size) : undefined,
        page: pageFor(input),
      });
      const latest = (await uploadImages(task.id, input.attachments)) ?? task;
      storeDetail(qc, latest);
      return hubTaskToTask(latest);
    },
  });
}

export function useUpdateTaskStatusHub() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateTaskStatusInput) => {
      const note =
        composeText({ typed: input.note, transcript: input.transcript, transcriptEn: input.transcript_en }) || null;
      if (input.to === "blocked" && !note) throw new Error("Please explain what is blocking you");
      // Photos first: a proof task closes only once it has one.
      await uploadImages(input.taskId, input.attachments);
      let { task } = await neramApi.action(input.taskId, statusChangeAction(input.from, input.to, note));
      if (input.to === "cancelled" && note) task = (await neramApi.comment(input.taskId, note)).task;
      storeDetail(qc, task);
    },
  });
}

export function useAddTaskUpdateHub() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AddTaskUpdateInput) => {
      const text = composeText({ typed: input.body, transcript: input.transcript, transcriptEn: input.transcript_en });
      const images = (input.attachments ?? []).filter((a) => a.kind !== "voice");
      if (!text && !images.length) {
        throw new Error(
          input.attachments?.length
            ? "The voice note has no words yet. Wait for it to be written out, or type the update."
            : "Write or record something first",
        );
      }
      let latest = await uploadImages(input.taskId, images);
      if (text) latest = (await neramApi.comment(input.taskId, text)).task;
      if (latest) storeDetail(qc, latest);
    },
  });
}

/** Adds one photo to a task (the drawer's camera button, and proof for Done). */
export function useAddTaskPhotoHub() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, file }: { taskId: string; file: Blob }) => {
      const name = file instanceof File && file.name ? file.name : "photo.jpg";
      const { task } = await neramApi.file(taskId, await photoForHub(file, name));
      storeDetail(qc, task);
    },
  });
}

export function useEditTaskHub() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Task> }) => {
      const edit: Record<string, unknown> = { action: "edit" };
      if (patch.title !== undefined) edit.title = patch.title;
      if (patch.description !== undefined) edit.notes = patch.description;
      if (patch.due_date !== undefined) edit.dueDate = patch.due_date;
      if (patch.priority !== undefined) edit.priority = toHubPriority(patch.priority);
      if (patch.size !== undefined) edit.size = toHubSize(patch.size);
      if (Object.keys(edit).length === 1) return;
      const { task } = await neramApi.action(id, edit as never);
      storeDetail(qc, task);
    },
  });
}

// ---------------------------------------------------------------------------
// "Realtime": refetch on focus and every minute while open
// ---------------------------------------------------------------------------

export function useTasksRealtimeHub() {
  const qc = useQueryClient();
  const { userProfile } = useAuth();
  const userId = userProfile?.id;

  useEffect(() => {
    if (!userId) return;
    const refresh = () => qc.invalidateQueries({ queryKey: queryKeys.tasks.all, refetchType: "active" });
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, REFRESH_MS);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [userId, qc]);
}

/** When the Tasks page opens: catch any event push that never arrived. Never blocks the page. */
export function useHubEventsSyncHub() {
  const { userProfile } = useAuth();
  const userId = userProfile?.id;
  useEffect(() => {
    if (!userId) return;
    neramApi.syncEvents().catch(() => {
      /* best effort: the next open tries again */
    });
  }, [userId]);
}
