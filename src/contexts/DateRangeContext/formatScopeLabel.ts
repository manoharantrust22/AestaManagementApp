import dayjs from "dayjs";

/**
 * Format a date range as a human-readable label that is identical between the
 * top-bar picker pill and the in-page <ScopeChip />. Spec §5.3 requires both
 * places to read identically.
 *
 * Examples:
 *   formatScopeLabel(null, null, null)                          → "All Time"
 *   formatScopeLabel(Apr 24, Apr 24, 1)                         → "Apr 24, 2026"
 *   formatScopeLabel(Apr 5, Apr 20, 16)                         → "Apr 5 – Apr 20 · 16 days"
 *   formatScopeLabel(Dec 20 2025, Jan 5 2026, 17)               → "Dec 20, 2025 – Jan 5, 2026 · 17 days"
 */
export function formatScopeLabel(
  startDate: Date | null,
  endDate: Date | null,
  days: number | null
): string {
  if (!startDate || !endDate || days == null) {
    return "All Time";
  }

  const start = dayjs(startDate);
  const end = dayjs(endDate);
  const dayLabel = days === 1 ? "1 day" : `${days} days`;

  let rangeText: string;
  if (start.isSame(end, "day")) {
    rangeText = start.format("MMM D, YYYY");
  } else if (start.year() !== end.year()) {
    rangeText = `${start.format("MMM D, YYYY")} – ${end.format("MMM D, YYYY")}`;
  } else {
    rangeText = `${start.format("MMM D")} – ${end.format("MMM D")}`;
  }

  return `${rangeText} · ${dayLabel}`;
}
