/**
 * Task management + bug reports.
 * Mirrors supabase/migrations/20261108100000_tasks.sql
 */

export type TaskPriority = "high" | "medium" | "low";
export type TaskSize = "small" | "medium" | "large";
export type TaskStatus = "todo" | "in_progress" | "blocked" | "done" | "cancelled";
export type TaskSource = "manual" | "assistant" | "bug_report";
export type TaskCategory = "app" | "inquiry" | "site" | "office" | "other";
export type TaskUpdateKind = "comment" | "status_change" | "blocker" | "resolution";
export type TaskAttachmentKind = "screenshot" | "photo" | "voice";

export interface TaskUserRef {
  id: string;
  name: string;
  role?: string | null;
}

export interface BugReportContext {
  url?: string;
  route?: string;
  site_id?: string | null;
  site_name?: string | null;
  viewport?: { w: number; h: number; dpr: number };
  user_agent?: string;
  app_version?: string | null;
  selector?: string | null;
  element_text?: string | null;
  element_rect?: { x: number; y: number; w: number; h: number } | null;
  console_errors?: Array<{ level: string; message: string; at: string }>;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  created_by: string;
  assignee_id: string;
  site_id: string | null;
  category: TaskCategory;
  priority: TaskPriority;
  size: TaskSize;
  status: TaskStatus;
  due_date: string | null;
  blocker_note: string | null;
  source: TaskSource;
  context: BugReportContext & Record<string, unknown>;
  transcript: string | null;
  transcript_en: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  // joined
  creator?: TaskUserRef | null;
  assignee?: TaskUserRef | null;
  site?: { id: string; name: string } | null;
}

export interface TaskUpdate {
  id: string;
  task_id: string;
  author_id: string;
  kind: TaskUpdateKind;
  body: string | null;
  from_status: TaskStatus | null;
  to_status: TaskStatus | null;
  transcript: string | null;
  transcript_en: string | null;
  created_at: string;
  author?: TaskUserRef | null;
}

export interface TaskAttachment {
  id: string;
  task_id: string;
  update_id: string | null;
  kind: TaskAttachmentKind;
  storage_path: string;
  mime: string | null;
  uploaded_by: string | null;
  created_at: string;
}

/** A recorded/attached file waiting to be uploaded with a task or update. */
export interface PendingAttachment {
  kind: TaskAttachmentKind;
  blob: Blob;
  mime: string;
}

export interface VoiceTranscription {
  transcript: string;
  language: string;
  transcript_en: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string | null;
  assignee_id: string;
  site_id?: string | null;
  category?: TaskCategory;
  priority?: TaskPriority;
  size?: TaskSize;
  due_date?: string | null;
  source?: TaskSource;
  context?: Record<string, unknown>;
  transcript?: string | null;
  transcript_en?: string | null;
  attachments?: PendingAttachment[];
}

export interface UpdateTaskStatusInput {
  taskId: string;
  from: TaskStatus;
  to: TaskStatus;
  note?: string | null;
  transcript?: string | null;
  transcript_en?: string | null;
  attachments?: PendingAttachment[];
}

export interface AddTaskUpdateInput {
  taskId: string;
  body?: string | null;
  kind?: TaskUpdateKind;
  transcript?: string | null;
  transcript_en?: string | null;
  attachments?: PendingAttachment[];
}

export const TASK_OPEN_STATUSES: TaskStatus[] = ["todo", "in_progress", "blocked"];

export const PRIORITY_META: Record<TaskPriority, { label: string; color: "error" | "warning" | "default"; rank: number }> = {
  high: { label: "High", color: "error", rank: 0 },
  medium: { label: "Medium", color: "warning", rank: 1 },
  low: { label: "Low", color: "default", rank: 2 },
};

export const SIZE_META: Record<TaskSize, { label: string; short: string }> = {
  small: { label: "Small", short: "S" },
  medium: { label: "Medium", short: "M" },
  large: { label: "Big", short: "L" },
};

export const STATUS_META: Record<TaskStatus, { label: string; color: "default" | "info" | "error" | "success" | "warning" }> = {
  todo: { label: "To do", color: "default" },
  in_progress: { label: "In progress", color: "info" },
  blocked: { label: "Blocked", color: "error" },
  done: { label: "Done", color: "success" },
  cancelled: { label: "Cancelled", color: "default" },
};

export const CATEGORY_LABELS: Record<TaskCategory, string> = {
  app: "App",
  inquiry: "Inquiry",
  site: "Site work",
  office: "Office",
  other: "Other",
};
