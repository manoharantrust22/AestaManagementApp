/**
 * useDailyMarketWeekAggregate
 *
 * Powers the per-day chip grid in the Daily + Market settlement
 * InspectPane drawer (kind: "daily-market-weekly"). Mirrors
 * useWeekAggregateAttendance for the contract side, but with three
 * differences:
 *
 *   1. PRIMARY rows = daily_attendance with laborer_type !== "contract"
 *      UNION market_laborer_attendance (different tables).
 *   2. Contract attendance is NOT fetched here — it's surfaced lazily
 *      via useAttendanceForDate when the user expands a specific day,
 *      so we don't pay the join cost on chip render.
 *   3. Holidays come from the same site_holidays source.
 *
 * The shape (days[], holidays[], totalLaborers, totalEarnings) matches
 * the contract hook so the chip grid in AttendanceTab can render the
 * same way.
 */

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { withTimeout, TIMEOUTS } from "@/lib/utils/timeout";
import type {
  WeekDayAggregate,
  WeekHoliday,
  WeekAggregate,
} from "./useWeekAggregateAttendance";

export type {
  WeekDayAggregate,
  WeekHoliday,
  WeekAggregate,
} from "./useWeekAggregateAttendance";

export function useDailyMarketWeekAggregate(
  siteId: string | undefined,
  weekStart: string | undefined,
  weekEnd: string | undefined
) {
  const supabase = createClient();
  return useQuery<WeekAggregate>({
    queryKey: ["daily-market-week-aggregate", siteId, weekStart, weekEnd],
    enabled: Boolean(siteId && weekStart && weekEnd),
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      // Daily attendance with laborer_type joined; we filter contract
      // rows out client-side so legacy NULL laborer_type rows still
      // count toward the daily bucket. Server-side .neq() would drop
      // NULLs (NULL != 'contract' is NULL, not true).
      const dailyQ = supabase
        .from("daily_attendance")
        .select(
          "date, laborer_id, daily_earnings, laborers!inner(laborer_type)"
        )
        .eq("site_id", siteId!)
        .eq("is_deleted", false)
        .gte("date", weekStart!)
        .lte("date", weekEnd!);

      // Market laborer attendance — separate table, no join needed.
      const marketQ = supabase
        .from("market_laborer_attendance")
        .select("id, date, count, total_cost")
        .eq("site_id", siteId!)
        .gte("date", weekStart!)
        .lte("date", weekEnd!);

      const holidaysQ = supabase
        .from("site_holidays")
        .select("date, reason, is_paid_holiday")
        .eq("site_id", siteId!)
        .gte("date", weekStart!)
        .lte("date", weekEnd!);

      const [dailyRes, marketRes, holidaysRes] = await withTimeout(
        Promise.all([
          dailyQ.abortSignal(signal),
          marketQ.abortSignal(signal),
          holidaysQ.abortSignal(signal),
        ]),
        TIMEOUTS.QUERY,
        "Daily+Market week aggregate query timed out. Please retry."
      );
      if (dailyRes.error) throw dailyRes.error;
      if (marketRes.error) throw marketRes.error;
      if (holidaysRes.error) throw holidaysRes.error;

      // Build per-date aggregates. Track distinct daily laborer_ids for
      // the daily portion + market entry ids for the market portion;
      // the union counts as "laborers worked that day".
      const byDate = new Map<
        string,
        {
          dailyLaborers: Set<string>;
          marketEntries: Set<string>;
          earnings: number;
        }
      >();
      const allDailyLaborers = new Set<string>();
      const allMarketEntries = new Set<string>();
      let total = 0;

      for (const r of (dailyRes.data ?? []) as Array<{
        date: string;
        laborer_id: string;
        daily_earnings: number | string | null;
        laborers: { laborer_type: string | null } | null;
      }>) {
        // Skip contract laborers — informational only in this view.
        const ltype = r.laborers?.laborer_type ?? null;
        if (ltype === "contract") continue;
        const e =
          byDate.get(r.date) ?? {
            dailyLaborers: new Set(),
            marketEntries: new Set(),
            earnings: 0,
          };
        e.dailyLaborers.add(r.laborer_id);
        const amt = Number(r.daily_earnings || 0);
        e.earnings += amt;
        byDate.set(r.date, e);
        allDailyLaborers.add(r.laborer_id);
        total += amt;
      }

      for (const m of (marketRes.data ?? []) as Array<{
        id: string;
        date: string;
        count: number | string | null;
        total_cost: number | string | null;
      }>) {
        const e =
          byDate.get(m.date) ?? {
            dailyLaborers: new Set(),
            marketEntries: new Set(),
            earnings: 0,
          };
        e.marketEntries.add(m.id);
        const amt = Number(m.total_cost || 0);
        e.earnings += amt;
        byDate.set(m.date, e);
        allMarketEntries.add(m.id);
        total += amt;
      }

      const days: WeekDayAggregate[] = Array.from(byDate.entries())
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([date, v]) => ({
          date,
          laborersWorked: v.dailyLaborers.size + v.marketEntries.size,
          totalEarnings: v.earnings,
        }));

      const holidays: WeekHoliday[] = (
        (holidaysRes.data ?? []) as Array<{
          date: string;
          reason: string | null;
          is_paid_holiday: boolean | null;
        }>
      ).map((h) => ({
        date: h.date,
        reason: h.reason,
        isPaid: Boolean(h.is_paid_holiday),
      }));

      return {
        days,
        holidays,
        totalLaborers: allDailyLaborers.size + allMarketEntries.size,
        totalEarnings: total,
      };
    },
  });
}
