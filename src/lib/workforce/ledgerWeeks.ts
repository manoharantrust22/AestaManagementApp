/**
 * Week bucketing for the contract labor ledger.
 *
 * `weekStart` is produced Sunday-aligned by get_contract_labor_ledger_weekly; this
 * module only groups and labels. `net` is the week's EARNINGS (windowed, honest);
 * netTotal/netPaid/netUnpaid are PROJECT-scoped and must be labelled as such in the UI —
 * payments are not recorded against a week, so a per-week "remaining" cannot exist.
 */

import dayjs from "dayjs";
import { weekEndOf } from "@/lib/utils/weekUtils";

export interface WeeklyLedgerRow {
  /** Sunday of the week, YYYY-MM-DD. */
  weekStart: string;
  laborerId: string;
  laborerName: string;
  roleName: string;
  /** Windowed to this week. */
  manDays: number;
  dayCount: number;
  gross: number;
  commission: number;
  net: number;
  /** Project-scoped — NOT this week's. */
  netTotal: number;
  netPaid: number;
  netUnpaid: number;
  isMesthri: boolean;
}

export interface LedgerWeekBucket {
  weekStart: string;
  /** e.g. "Sun 28 Jun – Sat 4 Jul" */
  label: string;
  /** Σ net earned in this week. */
  totalNet: number;
  rows: WeeklyLedgerRow[];
}

export function formatWeekRange(weekStart: string): string {
  const start = dayjs(weekStart);
  return `${start.format("ddd D MMM")} – ${weekEndOf(start).format("ddd D MMM")}`;
}

export function groupRowsByWeek(rows: WeeklyLedgerRow[]): LedgerWeekBucket[] {
  const byWeek = new Map<string, WeeklyLedgerRow[]>();
  for (const r of rows) {
    const bucket = byWeek.get(r.weekStart);
    if (bucket) bucket.push(r);
    else byWeek.set(r.weekStart, [r]);
  }

  return [...byWeek.entries()]
    .map(([weekStart, weekRows]) => ({
      weekStart,
      label: formatWeekRange(weekStart),
      totalNet: weekRows.reduce((sum, r) => sum + r.net, 0),
      rows: [...weekRows].sort(
        (a, b) =>
          Number(b.isMesthri) - Number(a.isMesthri) ||
          b.net - a.net ||
          a.laborerName.localeCompare(b.laborerName),
      ),
    }))
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart));
}
