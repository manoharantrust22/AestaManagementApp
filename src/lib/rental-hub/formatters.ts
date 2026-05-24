/**
 * Re-export the Material Hub's formatters so the Rental Hub uses the same
 * primitives. If the rentals surface ever needs a domain-specific formatter
 * (e.g. days vs hours pluralization), add it here so it lives alongside the
 * generic re-exports.
 */

export { fmtDateShort, inr, inrInt, inrK, pct } from "@/lib/material-hub/formatters";

/**
 * "20d elapsed" / "1d elapsed" — pluralization helper used in the row subline
 * (vendor + items block, third line). Returns "—" when not started.
 */
export function elapsedLabel(days: number, started: boolean): string {
  if (!started) return "—";
  if (days <= 0) return "today";
  if (days === 1) return "1d elapsed";
  return `${days}d elapsed`;
}

/** "due 25 Apr" (or "no due date" when null). */
export function dueLabel(expectedEnd: string | null): string {
  if (!expectedEnd) return "no due date";
  const dt = new Date(expectedEnd);
  if (Number.isNaN(dt.getTime())) return "no due date";
  return (
    "due " +
    dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
  );
}

/** "OVERDUE 3d" or "OVERDUE 1d" badge text. */
export function overdueLabel(daysOverdue: number): string {
  return `OVERDUE ${Math.max(1, daysOverdue)}d`;
}
