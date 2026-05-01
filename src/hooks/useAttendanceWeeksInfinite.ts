/**
 * useAttendanceWeeksInfinite
 *
 * Infinite-scroll variant of useAttendanceData. Fetches the Attendance
 * table one week at a time (newest first) so the page stays fast even
 * when the user picks "All Time" — instead of one giant query, each
 * scroll triggers a small per-week query.
 *
 * Each "page" is a Sunday→Saturday window and returns the same
 * RawAttendanceData shape the rest of the page already consumes.
 *
 * Stop conditions:
 *   - When isAllTime is false: stop once the next week would start
 *     before the user-selected dateFrom.
 *   - When isAllTime is true: stop after MAX_EMPTY_STREAK consecutive
 *     empty weeks. Skipping over a fortnight of inactivity is fine,
 *     but we don't want to paginate forever for a brand-new site.
 */

import { useEffect, useRef } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { createClient } from "@/lib/supabase/client";
import { useSelectedSite } from "@/contexts/SiteContext";
import { cacheTTL } from "@/lib/cache/keys";
import { weekStartStr, weekEndStr } from "@/lib/utils/weekUtils";
import type { RawAttendanceData } from "@/hooks/useAttendanceData";

export interface AttendanceWeekPage {
  /** Sunday of the week (YYYY-MM-DD). */
  weekStart: string;
  /** Saturday of the week (YYYY-MM-DD). */
  weekEnd: string;
  /** Number of consecutive empty weeks observed up to and including this page. */
  emptyStreak: number;
  data: RawAttendanceData;
}

export interface UseAttendanceWeeksInfiniteOptions {
  dateFrom: string | null;
  dateTo: string | null;
  isAllTime?: boolean;
  enabled?: boolean;
}

const MAX_EMPTY_STREAK = 4;

function weekBoundsContaining(date: string): { start: string; end: string } {
  return {
    start: weekStartStr(date),
    end: weekEndStr(date),
  };
}

async function fetchAttendanceWeek(
  supabase: ReturnType<typeof createClient>,
  siteId: string,
  weekStart: string,
  weekEnd: string,
  scopeFrom: string | null,
  scopeTo: string | null
): Promise<RawAttendanceData> {
  // Clamp the week to the user-selected date scope so the very first
  // and very last pages respect the filter (e.g. "Month" should not
  // bleed into the prior month at the bottom edge).
  const from = scopeFrom && scopeFrom > weekStart ? scopeFrom : weekStart;
  const to = scopeTo && scopeTo < weekEnd ? scopeTo : weekEnd;

  const attendanceQuery = supabase
    .from("daily_attendance")
    .select(
      `
      id, date, laborer_id, work_days, hours_worked, daily_rate_applied, daily_earnings, is_paid, payment_notes, subcontract_id,
      in_time, lunch_out, lunch_in, out_time, work_hours, break_hours, total_hours, day_units, snacks_amount,
      attendance_status, work_progress_percent,
      engineer_transaction_id, expense_id, paid_via,
      entered_by, recorded_by, recorded_by_user_id, updated_by, updated_by_user_id, created_at, updated_at,
      laborers!inner(name, team_id, category_id, role_id, laborer_type, team:teams!laborers_team_id_fkey(name), labor_categories(name), labor_roles(name)),
      building_sections!inner(name),
      subcontracts(title),
      recorded_by_user:users!daily_attendance_recorded_by_user_id_fkey(avatar_url),
      updated_by_user:users!daily_attendance_updated_by_user_id_fkey(avatar_url)
    `
    )
    .eq("site_id", siteId)
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: false });

  const marketQuery = (supabase.from("market_laborer_attendance") as any)
    .select(
      "id, role_id, date, count, work_days, rate_per_person, total_cost, day_units, snacks_per_person, total_snacks, in_time, out_time, is_paid, payment_notes, engineer_transaction_id, expense_id, labor_roles(name)"
    )
    .eq("site_id", siteId)
    .gte("date", from)
    .lte("date", to);

  const summaryQuery = (supabase.from("daily_work_summary") as any)
    .select("*")
    .eq("site_id", siteId)
    .gte("date", from)
    .lte("date", to);

  const teaShopQuery = (supabase.from("tea_shop_entries") as any)
    .select(
      "id, date, tea_total, snacks_total, total_amount, is_group_entry, site_group_id, working_laborer_count, working_laborer_total, nonworking_laborer_count, nonworking_laborer_total, market_laborer_count, market_laborer_total"
    )
    .eq("site_id", siteId)
    .gte("date", from)
    .lte("date", to);

  // Tea-shop allocations don't filter cleanly on nested entry.date through
  // PostgREST, so we fetch this site's allocations once and trim per week
  // client-side. Allocation tables are tiny relative to attendance volume.
  const teaShopAllocationsQuery = ((supabase as any)
    .from("tea_shop_entry_allocations"))
    .select(
      "allocated_amount, allocation_percentage, entry_id, entry:tea_shop_entries!inner(id, date, total_amount, is_group_entry, site_group_id)"
    )
    .eq("site_id", siteId);

  const [
    attendanceResult,
    marketResult,
    summaryResult,
    teaShopResult,
    teaShopAllocationsResult,
  ] = await Promise.all([
    attendanceQuery,
    marketQuery,
    summaryQuery,
    teaShopQuery,
    teaShopAllocationsQuery,
  ]);

  if (attendanceResult.error) {
    throw new Error(
      `Failed to fetch attendance week: ${attendanceResult.error.message}`
    );
  }
  if (marketResult.error) console.warn("Market query failed:", marketResult.error);
  if (summaryResult.error) console.warn("Work summary query failed:", summaryResult.error);
  if (teaShopResult.error) console.warn("Tea shop query failed:", teaShopResult.error);
  if (teaShopAllocationsResult.error) {
    console.warn("Tea shop allocations query failed:", teaShopAllocationsResult.error);
  }

  const filteredAllocations = (teaShopAllocationsResult.data || []).filter(
    (allocation: any) => {
      const entryDate = allocation.entry?.date;
      return entryDate && entryDate >= from && entryDate <= to;
    }
  );

  return {
    dailyAttendance: attendanceResult.data || [],
    marketAttendance: marketResult.data || [],
    workSummaries: summaryResult.data || [],
    teaShopEntries: teaShopResult.data || [],
    teaShopAllocations: filteredAllocations,
  };
}

export function useAttendanceWeeksInfinite(
  options: UseAttendanceWeeksInfiniteOptions
) {
  const { dateFrom, dateTo, isAllTime = false, enabled = true } = options;
  const { selectedSite } = useSelectedSite();
  const supabase = createClient();
  const queryClient = useQueryClient();
  const siteId = selectedSite?.id;

  // The first page anchors on dateTo (or today). When isAllTime, the lower
  // bound is null so the loader keeps walking back until the empty-streak
  // limit kicks in.
  const scopeFrom = isAllTime ? null : dateFrom;
  const scopeTo = isAllTime ? null : dateTo;
  const anchorDate = scopeTo || dayjs().format("YYYY-MM-DD");
  const initialBounds = weekBoundsContaining(anchorDate);

  // When the site changes, drop the prior site's pages. useInfiniteQuery
  // already keys on siteId so the cache is separate, but pages from a stale
  // site can briefly render during the transition without this.
  const previousSiteIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      previousSiteIdRef.current &&
      siteId &&
      previousSiteIdRef.current !== siteId
    ) {
      queryClient.removeQueries({
        queryKey: ["attendance", "site", previousSiteIdRef.current, "weeks"],
      });
    }
    if (siteId) previousSiteIdRef.current = siteId;
  }, [siteId, queryClient]);

  const queryKey = siteId
    ? ([
        "attendance",
        "site",
        siteId,
        "weeks",
        { from: scopeFrom, to: scopeTo, anchor: initialBounds.start },
      ] as const)
    : (["attendance", "weeks", "disabled"] as const);

  return useInfiniteQuery({
    queryKey,
    enabled: enabled && !!siteId,
    staleTime: cacheTTL.transactional,
    gcTime: cacheTTL.transactional * 2,
    refetchOnWindowFocus: false, // refetching every page on focus would be expensive
    initialPageParam: initialBounds.start,
    queryFn: async ({ pageParam }): Promise<AttendanceWeekPage> => {
      const weekStart = pageParam as string;
      const weekEnd = weekEndStr(weekStart);
      const data = await fetchAttendanceWeek(
        supabase,
        siteId!,
        weekStart,
        weekEnd,
        scopeFrom,
        scopeTo
      );

      // Empty-streak bookkeeping piggybacks on the page so getNextPageParam
      // can decide whether to keep walking. A week is "empty" if it brought
      // back zero attendance and zero market rows.
      // Note: previous page's streak is read in getNextPageParam, so we only
      // need to know whether THIS page is empty here. Default to 0; the
      // accumulator is computed in getNextPageParam below.
      const isEmpty =
        data.dailyAttendance.length === 0 && data.marketAttendance.length === 0;
      return {
        weekStart,
        weekEnd,
        emptyStreak: isEmpty ? 1 : 0,
        data,
      };
    },
    getNextPageParam: (lastPage, allPages) => {
      // Accumulate the empty streak across pages to decide when to stop.
      const streak = allPages.reduce(
        (acc, p) => (p.emptyStreak > 0 ? acc + 1 : 0),
        0
      );
      // When walking with no lower bound, stop after a run of empty weeks.
      if (!scopeFrom && streak >= MAX_EMPTY_STREAK) return undefined;

      const prevWeekStart = dayjs(lastPage.weekStart)
        .subtract(1, "week")
        .format("YYYY-MM-DD");

      // When a lower bound is set, stop once the next week's END would
      // already be before the bound — there's nothing left to load.
      if (scopeFrom) {
        const prevWeekEnd = weekEndStr(prevWeekStart);
        if (prevWeekEnd < scopeFrom) return undefined;
      }

      return prevWeekStart;
    },
  });
}
