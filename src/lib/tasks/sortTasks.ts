import { PRIORITY_META, type Task, type TaskStatus } from "@/types/task.types";

/** Blocked first, then in progress, to do, done, cancelled; then priority, due date, newest. */
export function sortTasks(tasks: Task[]): Task[] {
  const statusRank: Record<TaskStatus, number> = {
    blocked: 0,
    in_progress: 1,
    todo: 2,
    done: 3,
    cancelled: 4,
  };
  return [...tasks].sort((a, b) => {
    const s = statusRank[a.status] - statusRank[b.status];
    if (s !== 0) return s;
    const p = PRIORITY_META[a.priority].rank - PRIORITY_META[b.priority].rank;
    if (p !== 0) return p;
    const ad = a.due_date ?? "9999-12-31";
    const bd = b.due_date ?? "9999-12-31";
    if (ad !== bd) return ad < bd ? -1 : 1;
    return a.created_at < b.created_at ? 1 : -1;
  });
}
