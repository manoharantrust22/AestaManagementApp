"use client";

/**
 * Tasks + bug reports — React Query hooks.
 *
 * Two backends, one set of hook names (picked at build time):
 *  - NEXT_PUBLIC_FF_NERAM_TASKS=true → Neram's task hub via /api/neram/*
 *    (useNeramTasks.ts).
 *  - otherwise → Aesta's own tables (the "Local" hooks below). RLS (see
 *    20261108100000_tasks.sql) limits rows to tasks the caller created, is
 *    assigned to, or (admin) everything. Notifications are emitted by DB
 *    triggers, so these hooks never write to `notifications` directly.
 */

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/cache/keys";
import { useAuth } from "@/contexts/AuthContext";
import { hardenedUpload } from "@/lib/storage/uploadHelpers";
import { NERAM_TASKS_ENABLED } from "@/lib/neram-hub/flag";
import { sortTasks } from "@/lib/tasks/sortTasks";
import * as hub from "./useNeramTasks";
import {
  TASK_OPEN_STATUSES,
  type AddTaskUpdateInput,
  type CreateTaskInput,
  type PendingAttachment,
  type Task,
  type TaskAttachment,
  type TaskStatus,
  type TaskUpdate,
  type TaskUserRef,
  type UpdateTaskStatusInput,
} from "@/types/task.types";

export const TASK_BUCKET = "task-attachments";

const TASK_SELECT = `
  *,
  creator:users!tasks_created_by_fkey(id, name, role),
  assignee:users!tasks_assignee_id_fkey(id, name, role),
  site:sites(id, name)
`;

export type TaskScope = "mine" | "assigned_by_me" | "all";

export interface TaskListFilters {
  statuses?: TaskStatus[];
  /** Only tasks due on/before this date (YYYY-MM-DD) or with no due date. */
  dueOnOrBefore?: string;
  sourceBugOnly?: boolean;
  limit?: number;
}

function db() {
  // Tables are newer than the generated types; keep the cast local.
  return createClient() as any;
}

function extFor(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")) return "m4a";
  if (mime.includes("mpeg")) return "mp3";
  if (mime.includes("wav")) return "wav";
  return "bin";
}

/** Upload pending files into `<taskId>/…` and register task_attachments rows. */
export async function uploadTaskAttachments(
  taskId: string,
  attachments: PendingAttachment[] | undefined,
  updateId: string | null = null
): Promise<void> {
  if (!attachments?.length) return;
  const supabase = createClient();
  const rows: Array<Partial<TaskAttachment>> = [];
  for (const att of attachments) {
    // Strip codec params ("audio/webm;codecs=opus") — bucket mime allowlist is exact.
    const mime = att.mime.split(";")[0].trim() || "application/octet-stream";
    const path = `${taskId}/${crypto.randomUUID()}.${extFor(mime)}`;
    await hardenedUpload({
      supabase,
      bucketName: TASK_BUCKET,
      filePath: path,
      file: att.blob,
      contentType: mime,
    });
    rows.push({ task_id: taskId, update_id: updateId, kind: att.kind, storage_path: path, mime });
  }
  const { error } = await db().from("task_attachments").insert(rows);
  if (error) throw error;
}

export { sortTasks };

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

function useTasksLocal(scope: TaskScope, filters: TaskListFilters = {}) {
  const { userProfile } = useAuth();
  const userId = userProfile?.id;
  const isAdmin = userProfile?.role === "admin";
  const enabled = !!userId && (scope !== "all" || isAdmin);

  return useQuery({
    queryKey: [...queryKeys.tasks.list(scope, userId ?? "anon"), filters],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<Task[]> => {
      let q = db().from("tasks").select(TASK_SELECT);
      if (scope === "mine") q = q.eq("assignee_id", userId);
      if (scope === "assigned_by_me") q = q.eq("created_by", userId).neq("assignee_id", userId);
      if (filters.statuses?.length) q = q.in("status", filters.statuses);
      if (filters.dueOnOrBefore) {
        q = q.or(`due_date.is.null,due_date.lte.${filters.dueOnOrBefore}`);
      }
      if (filters.sourceBugOnly) q = q.eq("source", "bug_report");
      q = q.order("updated_at", { ascending: false }).limit(filters.limit ?? 200);
      const { data, error } = await q;
      if (error) throw error;
      return sortTasks((data ?? []) as Task[]);
    },
  });
}

/** Open tasks assigned to me that are due today or earlier (or undated). */
export function useMyTasksToday() {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return useTasks("mine", { statuses: TASK_OPEN_STATUSES, dueOnOrBefore: today });
}

/** Badge count: open tasks assigned to me (any due date). */
function useMyOpenTaskCountLocal() {
  const { userProfile } = useAuth();
  const userId = userProfile?.id;
  return useQuery({
    queryKey: [...queryKeys.tasks.list("mine-count", userId ?? "anon")],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<number> => {
      const { count, error } = await db()
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("assignee_id", userId)
        .in("status", TASK_OPEN_STATUSES);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

/** Admin dashboard summary across everyone. */
function useTeamTaskSummaryLocal(enabled: boolean) {
  const { userProfile } = useAuth();
  return useQuery({
    queryKey: [...queryKeys.tasks.list("team-summary", userProfile?.id ?? "anon")],
    enabled: enabled && !!userProfile?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
      const startOfDay = new Date(`${today}T00:00:00+05:30`).toISOString();
      const { data, error } = await db()
        .from("tasks")
        .select("id, status, due_date, source, completed_at")
        .or(`status.in.(todo,in_progress,blocked),completed_at.gte.${startOfDay}`)
        .limit(1000);
      if (error) throw error;
      const rows = (data ?? []) as Array<Pick<Task, "id" | "status" | "due_date" | "source" | "completed_at">>;
      const open = rows.filter((r) => TASK_OPEN_STATUSES.includes(r.status));
      return {
        open: open.length,
        blocked: open.filter((r) => r.status === "blocked").length,
        overdue: open.filter((r) => r.due_date && r.due_date < today).length,
        openBugs: open.filter((r) => r.source === "bug_report").length,
        doneToday: rows.filter((r) => r.status === "done" && r.completed_at && r.completed_at >= startOfDay).length,
      };
    },
  });
}

function useTaskLocal(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.tasks.byId(id ?? "none"),
    enabled: !!id,
    queryFn: async (): Promise<Task | null> => {
      const { data, error } = await db().from("tasks").select(TASK_SELECT).eq("id", id).maybeSingle();
      if (error) throw error;
      return (data ?? null) as Task | null;
    },
  });
}

function useTaskUpdatesLocal(taskId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.tasks.updates(taskId ?? "none"),
    enabled: !!taskId,
    queryFn: async (): Promise<TaskUpdate[]> => {
      const { data, error } = await db()
        .from("task_updates")
        .select("*, author:users!task_updates_author_id_fkey(id, name, role)")
        .eq("task_id", taskId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TaskUpdate[];
    },
  });
}

export interface TaskAttachmentWithUrl extends TaskAttachment {
  url: string | null;
}

function useTaskAttachmentsLocal(taskId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.tasks.attachments(taskId ?? "none"),
    enabled: !!taskId,
    staleTime: 30 * 60_000, // signed URLs live 1h
    queryFn: async (): Promise<TaskAttachmentWithUrl[]> => {
      const supabase = createClient();
      const { data, error } = await db()
        .from("task_attachments")
        .select("*")
        .eq("task_id", taskId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as TaskAttachment[];
      if (!rows.length) return [];
      const { data: signed } = await supabase.storage
        .from(TASK_BUCKET)
        .createSignedUrls(
          rows.map((r) => r.storage_path),
          3600
        );
      const byPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
      return rows.map((r) => ({ ...r, url: byPath.get(r.storage_path) ?? null }));
    },
  });
}

/** Everyone active in the app — anyone can assign a task to anyone. */
function useAssignableUsersLocal() {
  return useQuery({
    queryKey: queryKeys.tasks.assignableUsers(),
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<TaskUserRef[]> => {
      const { data, error } = await db()
        .from("users")
        .select("id, name, role, status")
        .order("name", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as Array<TaskUserRef & { status?: string }>)
        .filter((u) => !u.status || u.status === "active")
        .map(({ id, name, role }) => ({ id, name, role }));
    },
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

function useInvalidateTasks() {
  const queryClient = useQueryClient();
  return (taskId?: string) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    if (taskId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.byId(taskId) });
    }
  };
}

function useCreateTaskLocal() {
  const { userProfile } = useAuth();
  const invalidate = useInvalidateTasks();

  return useMutation({
    mutationFn: async (input: CreateTaskInput): Promise<Task> => {
      if (!userProfile?.id) throw new Error("Not signed in");
      const { attachments, page, ...fields } = input;
      const { data, error } = await db()
        .from("tasks")
        .insert({
          ...fields,
          title: fields.title.trim(),
          created_by: userProfile.id,
          context: page ? { ...(fields.context ?? {}), page } : fields.context ?? {},
        })
        .select("*")
        .single();
      if (error) throw error;
      const task = data as Task;
      await uploadTaskAttachments(task.id, attachments);
      return task;
    },
    onSuccess: (task) => invalidate(task.id),
  });
}

function useUpdateTaskStatusLocal() {
  const { userProfile } = useAuth();
  const invalidate = useInvalidateTasks();

  return useMutation({
    mutationFn: async (input: UpdateTaskStatusInput) => {
      if (!userProfile?.id) throw new Error("Not signed in");
      const note = input.note?.trim() || input.transcript_en || input.transcript || null;
      if (input.to === "blocked" && !note && !input.attachments?.length) {
        throw new Error("Please explain what is blocking you");
      }

      const patch: Record<string, unknown> = { status: input.to };
      if (input.to === "blocked") patch.blocker_note = note;
      const { error } = await db().from("tasks").update(patch).eq("id", input.taskId);
      if (error) throw error;

      const { data: upd, error: updErr } = await db()
        .from("task_updates")
        .insert({
          task_id: input.taskId,
          author_id: userProfile.id,
          kind: input.to === "blocked" ? "blocker" : input.to === "done" ? "resolution" : "status_change",
          body: input.note?.trim() || null,
          from_status: input.from,
          to_status: input.to,
          transcript: input.transcript ?? null,
          transcript_en: input.transcript_en ?? null,
        })
        .select("id")
        .single();
      if (updErr) throw updErr;
      await uploadTaskAttachments(input.taskId, input.attachments, upd.id);
    },
    onSuccess: (_d, input) => invalidate(input.taskId),
  });
}

function useAddTaskUpdateLocal() {
  const { userProfile } = useAuth();
  const invalidate = useInvalidateTasks();

  return useMutation({
    mutationFn: async (input: AddTaskUpdateInput) => {
      if (!userProfile?.id) throw new Error("Not signed in");
      if (!input.body?.trim() && !input.transcript && !input.attachments?.length) {
        throw new Error("Write or record something first");
      }
      const { data, error } = await db()
        .from("task_updates")
        .insert({
          task_id: input.taskId,
          author_id: userProfile.id,
          kind: input.kind ?? "comment",
          body: input.body?.trim() || null,
          transcript: input.transcript ?? null,
          transcript_en: input.transcript_en ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      await uploadTaskAttachments(input.taskId, input.attachments, data.id);
    },
    onSuccess: (_d, input) => invalidate(input.taskId),
  });
}

function useEditTaskLocal() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Task> }) => {
      const { error } = await db().from("tasks").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => invalidate(v.id),
  });
}

// ---------------------------------------------------------------------------
// Realtime
// ---------------------------------------------------------------------------

/** Refresh task lists/threads live. RLS filters which rows reach this client. */
function useTasksRealtimeLocal() {
  const queryClient = useQueryClient();
  const { userProfile } = useAuth();
  const userId = userProfile?.id;

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    const channel = supabase
      .channel(`tasks:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, invalidate)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "task_updates" }, invalidate)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);
}

/** Adds one photo to a task (drawer camera button; proof for Done in the hub). */
function useAddTaskPhotoLocal() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: async ({ taskId, file }: { taskId: string; file: Blob }) => {
      const mime = file.type || "image/jpeg";
      await uploadTaskAttachments(taskId, [{ kind: "photo", blob: file, mime }]);
    },
    onSuccess: (_d, v) => invalidate(v.taskId),
  });
}

/** Local tasks have no hub events to catch up on. */
function useHubEventsSyncLocal() {}

// ---------------------------------------------------------------------------
// The exported hooks: hub or local, fixed at build time (so hook order never changes)
// ---------------------------------------------------------------------------

const H = NERAM_TASKS_ENABLED;

export const useTasks: typeof useTasksLocal = H ? (hub.useTasksHub as typeof useTasksLocal) : useTasksLocal;
export const useMyOpenTaskCount: typeof useMyOpenTaskCountLocal = H ? hub.useMyOpenTaskCountHub : useMyOpenTaskCountLocal;
export const useTeamTaskSummary: typeof useTeamTaskSummaryLocal = H ? hub.useTeamTaskSummaryHub : useTeamTaskSummaryLocal;
export const useTask: typeof useTaskLocal = H ? (hub.useTaskHub as unknown as typeof useTaskLocal) : useTaskLocal;
export const useTaskUpdates: typeof useTaskUpdatesLocal = H
  ? (hub.useTaskUpdatesHub as unknown as typeof useTaskUpdatesLocal)
  : useTaskUpdatesLocal;
export const useTaskAttachments: typeof useTaskAttachmentsLocal = H
  ? (hub.useTaskAttachmentsHub as unknown as typeof useTaskAttachmentsLocal)
  : useTaskAttachmentsLocal;
export const useAssignableUsers: typeof useAssignableUsersLocal = H ? hub.useAssignableUsersHub : useAssignableUsersLocal;
export const useCreateTask: typeof useCreateTaskLocal = H ? hub.useCreateTaskHub : useCreateTaskLocal;
export const useUpdateTaskStatus: typeof useUpdateTaskStatusLocal = H ? hub.useUpdateTaskStatusHub : useUpdateTaskStatusLocal;
export const useAddTaskUpdate: typeof useAddTaskUpdateLocal = H ? hub.useAddTaskUpdateHub : useAddTaskUpdateLocal;
export const useEditTask: typeof useEditTaskLocal = H ? hub.useEditTaskHub : useEditTaskLocal;
export const useAddTaskPhoto: typeof useAddTaskPhotoLocal = H ? hub.useAddTaskPhotoHub : useAddTaskPhotoLocal;
export const useTasksRealtime: typeof useTasksRealtimeLocal = H ? hub.useTasksRealtimeHub : useTasksRealtimeLocal;
/** Call on the Tasks page: pulls hub events a push may have missed (no-op for local tasks). */
export const useHubEventsSync: () => void = H ? hub.useHubEventsSyncHub : useHubEventsSyncLocal;
