/**
 * useDailyMarketWeeklyList
 *
 * Aggregates daily+market ledger rows into per-week roll-ups for the
 * new "By Week" view of the Daily + Market salary settlement tab.
 *
 * Why client-side group-by (vs a new RPC):
 *   - usePaymentsLedger already returns every per-date row (paid + pending)
 *     scoped to the site/period the page filters on.
 *   - A second RPC would duplicate filter/scoping logic and add a round-trip.
 *   - The aggregation is a small in-memory reduction over already-fetched data.
 *
 * Week boundary is Sun-Sat (per project memory: weeks were reverted to
 * Sun-Sat across the stack on 2026-05-01). All week math goes through
 * weekStartOf / weekEndOf in src/lib/utils/weekUtils.ts — never
 * dayjs().startOf("week"), which is locale-dependent.
 */

import { useMemo } from "react";
import {
  usePaymentsLedger,
  type UsePaymentsLedgerArgs,
} from "./usePaymentsLedger";
import { weekStartStr, weekEndStr } from "@/lib/utils/weekUtils";

export type DayStatus = "settled" | "pending" | "none";

export interface DailyMarketWeekRow {
  weekStart: string;            // YYYY-MM-DD (Sunday)
  weekEnd: string;              // YYYY-MM-DD (Saturday)
  datesWorked: number;          // distinct dates with any row
  settledDates: number;         // distinct dates where every row is paid
  pendingDates: number;         // distinct dates where any row is pending
  wagesDue: number;             // sum of all amounts (paid + pending)
  paid: number;                 // sum where isPaid
  pendingAmount: number;        // sum where isPending
  // YYYY-MM-DD -> per-date status, for the 7-dot Sun-Sat strip on each row.
  dayStatus: Record<string, DayStatus>;
}

export function useDailyMarketWeeklyList(
  args: Omit<UsePaymentsLedgerArgs, "type" | "status">
) {
  const ledger = usePaymentsLedger({
    siteId: args.siteId,
    dateFrom: args.dateFrom,
    dateTo: args.dateTo,
    type: "daily-market",
    status: "all",
    period: args.period,
  });

  const data = useMemo<DailyMarketWeekRow[]>(() => {
    const rows = ledger.data ?? [];
    if (rows.length === 0) return [];

    // First pass: bucket rows by week, accumulate per-date stats.
    const weekMap = new Map<
      string,
      {
        weekStart: string;
        weekEnd: string;
        wagesDue: number;
        paid: number;
        pendingAmount: number;
        // date -> { hasPending, hasPaid }
        perDate: Map<string, { hasPending: boolean; hasPaid: boolean }>;
      }
    >();

    for (const r of rows) {
      const ws = weekStartStr(r.date);
      const we = weekEndStr(r.date);
      const w =
        weekMap.get(ws) ?? {
          weekStart: ws,
          weekEnd: we,
          wagesDue: 0,
          paid: 0,
          pendingAmount: 0,
          perDate: new Map<string, { hasPending: boolean; hasPaid: boolean }>(),
        };
      w.wagesDue += r.amount;
      if (r.isPaid) w.paid += r.amount;
      if (r.isPending) w.pendingAmount += r.amount;
      const d = w.perDate.get(r.date) ?? { hasPending: false, hasPaid: false };
      if (r.isPending) d.hasPending = true;
      if (r.isPaid) d.hasPaid = true;
      w.perDate.set(r.date, d);
      weekMap.set(ws, w);
    }

    // Second pass: derive per-date status + dates counters.
    const out: DailyMarketWeekRow[] = [];
    for (const w of weekMap.values()) {
      const dayStatus: Record<string, DayStatus> = {};
      let settledDates = 0;
      let pendingDates = 0;
      for (const [date, dStat] of w.perDate.entries()) {
        // "pending" wins if any row for that date is pending.
        const status: DayStatus = dStat.hasPending ? "pending" : "settled";
        dayStatus[date] = status;
        if (status === "pending") pendingDates += 1;
        else settledDates += 1;
      }
      out.push({
        weekStart: w.weekStart,
        weekEnd: w.weekEnd,
        datesWorked: w.perDate.size,
        settledDates,
        pendingDates,
        wagesDue: w.wagesDue,
        paid: w.paid,
        pendingAmount: w.pendingAmount,
        dayStatus,
      });
    }

    // Newest week first.
    out.sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1));
    return out;
  }, [ledger.data]);

  return {
    data,
    isLoading: ledger.isLoading,
    error: (ledger.error as Error | null) ?? null,
  };
}
