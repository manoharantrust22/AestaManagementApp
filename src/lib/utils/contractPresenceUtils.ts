/**
 * Contract presence on the attendance sheet.
 *
 * A day can have documented contract / task-work crew (logged via a fixed-price
 * package "Day Log" or a headcount-mode subcontract) even when no regular
 * `daily_attendance` row exists. Those days should read as "Contract work" —
 * not as a red "unfilled" nag — and link through to the contract.
 *
 * This module holds the shared shapes + pure formatting helpers. The data is
 * loaded by `useContractPresence`; the attendance sheet consumes both.
 */

export type ContractPresenceKind = "package" | "subcontract";

export interface ContractPresenceItem {
  kind: ContractPresenceKind;
  /** package_id (fixed-price package) or subcontract_id (headcount subcontract). */
  id: string;
  /** Contract / package name, e.g. "All civil Work & elevation - Barun". */
  title: string;
  /** Worker-days on this date for this contract (man_days / Σ units). */
  units: number;
  /** Per-type breakdown for packages, e.g. "Mason ×2 · Helper ×1" ("" otherwise). */
  workerSummary: string;
}

export interface ContractPresenceDay {
  /** YYYY-MM-DD. */
  date: string;
  /** Σ units across the day's contracts (drives the "N workers" chip). */
  totalUnits: number;
  items: ContractPresenceItem[];
}

/** "3 workers" / "1 worker" (rounds fractional man-days for display). */
export function formatContractWorkerCount(units: number): string {
  const n = Math.max(0, Math.round(units));
  return `${n} ${n === 1 ? "worker" : "workers"}`;
}

/** Day label: the contract name, with "+N more" when several ran the same day. */
export function formatContractDayLabel(day: ContractPresenceDay): string {
  if (day.items.length === 0) return "Contract work logged";
  const first = day.items[0].title?.trim() || "Contract work";
  if (day.items.length === 1) return first;
  return `${first} +${day.items.length - 1} more`;
}

/** Worker breakdown for the day (joins package summaries; "" when none). */
export function formatContractWorkerSummary(day: ContractPresenceDay): string {
  return day.items
    .map((i) => i.workerSummary?.trim())
    .filter(Boolean)
    .join(" · ");
}

/** Deep-link to the contract on the workforce page. */
export function contractItemHref(item: ContractPresenceItem): string {
  const param = item.kind === "package" ? "package" : "contract";
  return `/site/trades?${param}=${item.id}`;
}
