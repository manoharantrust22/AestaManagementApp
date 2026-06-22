/**
 * Costing helpers for the per-type day log (Phase 1).
 *
 * Each day log carries a `worker_lines` breakdown — one line per worker type
 * (Mason ×2 @ ₹1000, Helper ×2 @ ₹800). A line is worth `count × daily_rate`,
 * a day is worth the sum of its lines, and a package's "work value so far" is
 * the sum across its day logs. Pure math, no Supabase — testable in isolation.
 *
 * Legacy rows have `worker_lines = null` (headcount only) and contribute 0 value
 * here; callers fall back to the stored `worker_count` for display.
 */

import type { DayWorkerLine, TaskWorkDayLog } from "@/types/taskWork.types";

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? x : 0;
};

/** Value of one worker line = count × daily_rate (negatives/garbage → 0). */
export function lineValue(line: Pick<DayWorkerLine, "count" | "daily_rate">): number {
  return n(line.count) * n(line.daily_rate);
}

/** Total worker count across the lines (may be fractional, e.g. 0.5 = half day). */
export function lineCountTotal(lines: DayWorkerLine[] | null | undefined): number {
  if (!lines?.length) return 0;
  return lines.reduce((s, l) => s + n(l.count), 0);
}

/** Labour value of a single day log (0 for legacy headcount-only rows). */
export function dayLogValue(
  log: Pick<TaskWorkDayLog, "worker_lines">
): number {
  if (!log.worker_lines?.length) return 0;
  return log.worker_lines.reduce((s, l) => s + lineValue(l), 0);
}

/** Labour value summed across day logs ("work value so far" for a package). */
export function sumDayLogValue(
  logs: Pick<TaskWorkDayLog, "worker_lines">[]
): number {
  return logs.reduce((s, l) => s + dayLogValue(l), 0);
}

/**
 * Derive the stored headcount columns from the breakdown. `worker_count` is an
 * integer column, so the headcount is rounded; `man_days` keeps the exact sum
 * (decimals preserve half-days).
 */
export function deriveCountsFromLines(lines: DayWorkerLine[]): {
  worker_count: number;
  man_days: number;
} {
  const manDays = lineCountTotal(lines);
  return { worker_count: Math.round(manDays), man_days: manDays };
}

/** One-line human summary of a breakdown, e.g. "Mason ×2 · Helper ×2". */
export function summarizeLines(lines: DayWorkerLine[] | null | undefined): string {
  if (!lines?.length) return "";
  return lines
    .filter((l) => l.label?.trim() && n(l.count) > 0)
    .map((l) => `${l.label.trim()} ×${l.count}`)
    .join(" · ");
}
