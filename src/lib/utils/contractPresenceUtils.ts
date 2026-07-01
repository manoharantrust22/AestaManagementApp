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

import type { TaskWorkDayLog } from "@/types/taskWork.types";

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
  /** labor_categories.id of the package/subcontract's trade; null if unset. */
  tradeCategoryId: string | null;
  /**
   * Estimated labour VALUE for this contract on this date = Σ(count × rate) from
   * the package day-log's worker_lines. 0 for headcount subcontracts / legacy
   * logs with no per-type rates. Display-only (an estimate, never a payment).
   */
  labourValue: number;
  /** site_id — needed to open/delete the package day-log. Package items only. */
  siteId?: string;
  /**
   * The underlying package Day Log, so the attendance/tea rows can open the
   * shared TaskWorkDayLogDialog in edit mode. Present for `kind: "package"` only.
   */
  dayLog?: TaskWorkDayLog | null;
}

export interface ContractPresenceDay {
  /** YYYY-MM-DD. */
  date: string;
  /** Σ units across the day's contracts (drives the "N workers" chip). */
  totalUnits: number;
  /** Σ labourValue across the day's contracts (drives the est. Salary cell). */
  totalValue: number;
  items: ContractPresenceItem[];
}

/**
 * Restrict a contract-presence map to a single trade.
 *
 * When `scope` is null (the plain Civil view) the input map is returned
 * UNCHANGED — same reference — so Civil behaviour stays byte-for-byte identical.
 * Otherwise a new map is built keeping only items whose `tradeCategoryId`
 * matches the scope; each day's `totalUnits` is recomputed from the kept items,
 * and days that lose all their items are dropped entirely.
 */
export function scopeContractPresence(
  map: ReadonlyMap<string, ContractPresenceDay>,
  scope: { tradeCategoryId: string } | null
): ReadonlyMap<string, ContractPresenceDay> {
  if (!scope) return map;
  const out = new Map<string, ContractPresenceDay>();
  for (const [date, day] of map) {
    const items = day.items.filter(
      (i) => i.tradeCategoryId === scope.tradeCategoryId
    );
    if (items.length === 0) continue;
    const totalUnits = items.reduce((sum, i) => sum + i.units, 0);
    const totalValue = items.reduce((sum, i) => sum + (i.labourValue || 0), 0);
    out.set(date, { date: day.date, totalUnits, totalValue, items });
  }
  return out;
}

/**
 * Drop contract-presence items whose trade's per-site workspace is OFF.
 *
 * The owner's rule for the tea-shop surfaces: a trade that is *not* activated
 * (its per-site Workspace toggle is OFF — its crew is handled by the mesthri as
 * part of regular labour) should NOT show as a separate contract; it's understood
 * to be inside the regular crew. Only *activated* contracts are surfaced.
 *
 * We pass the set of EXPLICITLY-deactivated trade category ids (resolved from
 * `category.hasWorkspace === false`) and drop only those — everything else is
 * kept by default: `tradeCategoryId === null` (uncategorised task work = real
 * crew, no workspace concept) and any trade not explicitly OFF.
 *
 * When the set is undefined/empty (still loading, or no trade is OFF) the input
 * map is returned UNCHANGED — same reference — so the common case and the loading
 * window stay byte-for-byte identical (mirrors `scopeContractPresence(map, null)`).
 */
export function filterContractPresenceToActivated(
  map: ReadonlyMap<string, ContractPresenceDay>,
  deactivatedTradeIds: ReadonlySet<string> | undefined
): ReadonlyMap<string, ContractPresenceDay> {
  if (!deactivatedTradeIds || deactivatedTradeIds.size === 0) return map;
  const out = new Map<string, ContractPresenceDay>();
  for (const [date, day] of map) {
    const items = day.items.filter(
      (i) => i.tradeCategoryId === null || !deactivatedTradeIds.has(i.tradeCategoryId)
    );
    if (items.length === 0) continue;
    const totalUnits = items.reduce((sum, i) => sum + i.units, 0);
    const totalValue = items.reduce((sum, i) => sum + (i.labourValue || 0), 0);
    out.set(date, { date: day.date, totalUnits, totalValue, items });
  }
  return out;
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

/**
 * Estimated labour value for a contract day, e.g. "~₹8,000 est".
 * Returns "–" when there's no value (headcount subcontracts / legacy logs), so
 * the Salary/Expense cells stay honest — this is an estimate, not a payment.
 */
export function formatContractDayValue(value: number): string {
  if (!value || value <= 0) return "–";
  return `~₹${Math.round(value).toLocaleString("en-IN")} est`;
}
