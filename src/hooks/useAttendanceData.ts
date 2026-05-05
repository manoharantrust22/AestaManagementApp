/**
 * useAttendanceData Hook
 *
 * React Query-based hook for fetching attendance data.
 * Properly integrates with the cache system for automatic invalidation on site change.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys, cacheTTL } from "@/lib/cache/keys";
import { useSelectedSite } from "@/contexts/SiteContext";
import { withTimeout, TIMEOUTS } from "@/lib/utils/timeout";
import { useEffect, useRef } from "react";

export interface AttendanceQueryParams {
  dateFrom: string | null;
  dateTo: string | null;
  isAllTime?: boolean;
}

export interface RawAttendanceData {
  dailyAttendance: any[];
  marketAttendance: any[];
  workSummaries: any[];
  teaShopEntries: any[];
  teaShopAllocations: any[]; // Allocations for group tea shop entries
}

async function fetchAttendanceData(
  supabase: ReturnType<typeof createClient>,
  siteId: string,
  params: AttendanceQueryParams
): Promise<RawAttendanceData> {
  const { dateFrom, dateTo, isAllTime } = params;

  // Build daily attendance query
  let attendanceQuery = supabase
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
    .order("date", { ascending: false });

  // Only apply date filters if not "All Time"
  if (!isAllTime && dateFrom && dateTo) {
    attendanceQuery = attendanceQuery.gte("date", dateFrom).lte("date", dateTo);
  }

  // Build market laborer attendance query
  let marketQuery = (supabase.from("market_laborer_attendance") as any)
    .select(
      "id, role_id, date, count, work_days, rate_per_person, total_cost, day_units, snacks_per_person, total_snacks, in_time, out_time, is_paid, payment_notes, engineer_transaction_id, expense_id, labor_roles(name)"
    )
    .eq("site_id", siteId);

  if (!isAllTime && dateFrom && dateTo) {
    marketQuery = marketQuery.gte("date", dateFrom).lte("date", dateTo);
  }

  // Build work summaries query
  let summaryQuery = (supabase.from("daily_work_summary") as any)
    .select("*")
    .eq("site_id", siteId);

  if (!isAllTime && dateFrom && dateTo) {
    summaryQuery = summaryQuery.gte("date", dateFrom).lte("date", dateTo);
  }

  // Build tea shop entries query (direct entries for this site)
  let teaShopQuery = (supabase.from("tea_shop_entries") as any)
    .select(
      "id, date, tea_total, snacks_total, total_amount, is_group_entry, site_group_id, working_laborer_count, working_laborer_total, nonworking_laborer_count, nonworking_laborer_total, market_laborer_count, market_laborer_total"
    )
    .eq("site_id", siteId);

  if (!isAllTime && dateFrom && dateTo) {
    teaShopQuery = teaShopQuery.gte("date", dateFrom).lte("date", dateTo);
  }

  // Build tea shop allocations query (this site's share of group entries from other sites)
  // Note: We fetch all allocations and filter by date client-side since Supabase
  // doesn't support filtering on nested relation fields like entry.date
  const teaShopAllocationsQuery = ((supabase as any).from("tea_shop_entry_allocations"))
    .select("allocated_amount, allocation_percentage, entry_id, entry:tea_shop_entries!inner(id, date, total_amount, is_group_entry, site_group_id)")
    .eq("site_id", siteId);

  // Execute all queries in parallel, with a hard timeout so a hung
  // upstream (e.g. saturated Cloudflare proxy connection pool) surfaces as
  // an error instead of an indefinite loading spinner.
  const [attendanceResult, marketResult, summaryResult, teaShopResult, teaShopAllocationsResult] =
    await withTimeout(
      Promise.all([
        attendanceQuery,
        marketQuery,
        summaryQuery,
        teaShopQuery,
        teaShopAllocationsQuery,
      ]),
      TIMEOUTS.QUERY,
      "Attendance data fetch timed out. Please refresh and try again."
    );

  // Check for critical errors
  if (attendanceResult.error) {
    throw new Error(
      `Failed to fetch attendance: ${attendanceResult.error.message}`
    );
  }

  // Log non-critical errors but continue
  if (marketResult.error) {
    console.warn("Market laborer query failed:", marketResult.error);
  }
  if (summaryResult.error) {
    console.warn("Work summary query failed:", summaryResult.error);
  }
  if (teaShopResult.error) {
    console.warn("Tea shop query failed:", teaShopResult.error);
  }
  if (teaShopAllocationsResult.error) {
    console.warn("Tea shop allocations query failed:", teaShopAllocationsResult.error);
  }

  // Filter tea shop allocations by date client-side (since Supabase doesn't support nested field filtering)
  let filteredAllocations = teaShopAllocationsResult.data || [];
  if (!isAllTime && dateFrom && dateTo) {
    filteredAllocations = filteredAllocations.filter((allocation: any) => {
      const entryDate = allocation.entry?.date;
      return entryDate && entryDate >= dateFrom && entryDate <= dateTo;
    });
  }

  return {
    dailyAttendance: attendanceResult.data || [],
    marketAttendance: marketResult.data || [],
    workSummaries: summaryResult.data || [],
    teaShopEntries: teaShopResult.data || [],
    teaShopAllocations: filteredAllocations,
  };
}

export interface UseAttendanceDataOptions {
  dateFrom: string | null;
  dateTo: string | null;
  isAllTime?: boolean;
  enabled?: boolean;
}

export interface UseAttendanceDataResult {
  data: RawAttendanceData | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  /** True when site is changing and we're waiting for new data */
  isTransitioning: boolean;
}

/**
 * Hook for fetching attendance data with React Query caching.
 *
 * Features:
 * - Automatic cache invalidation when site changes (via SyncInitializer)
 * - Proper cache keys including siteId for site-specific data isolation
 * - Automatic refetch on window focus for fresh data
 * - Loading states that properly handle site transitions
 */
export function useAttendanceData(
  options: UseAttendanceDataOptions
): UseAttendanceDataResult {
  const { dateFrom, dateTo, isAllTime = false, enabled = true } = options;
  const { selectedSite } = useSelectedSite();
  const supabase = createClient();
  const queryClient = useQueryClient();

  // Track previous site ID to detect transitions
  const previousSiteIdRef = useRef<string | null>(null);
  const isTransitioning =
    previousSiteIdRef.current !== null &&
    previousSiteIdRef.current !== selectedSite?.id;

  // Update previous site ID ref
  useEffect(() => {
    if (selectedSite?.id) {
      previousSiteIdRef.current = selectedSite.id;
    }
  }, [selectedSite?.id]);

  // Clear cache for previous site when switching
  useEffect(() => {
    if (isTransitioning && previousSiteIdRef.current) {
      // Remove old site's attendance queries from cache
      queryClient.removeQueries({
        queryKey: ["attendance", "site", previousSiteIdRef.current],
      });
    }
  }, [isTransitioning, queryClient]);

  const siteId = selectedSite?.id;

  // Use the standardized query key from keys.ts
  const queryKey = siteId
    ? dateFrom && dateTo
      ? queryKeys.attendance.dateRange(siteId, dateFrom, dateTo)
      : queryKeys.attendance.active(siteId)
    : ["attendance", "disabled"];

  const query = useQuery({
    queryKey,
    queryFn: () =>
      fetchAttendanceData(supabase, siteId!, { dateFrom, dateTo, isAllTime }),
    enabled: enabled && !!siteId,
    staleTime: cacheTTL.transactional, // 5 minutes
    gcTime: cacheTTL.transactional * 2, // 10 minutes
    refetchOnWindowFocus: true, // Refetch when user returns to tab
    refetchOnReconnect: true, // Refetch when network reconnects
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: () => query.refetch(),
    isTransitioning: isTransitioning && query.isFetching,
  };
}

/**
 * Hook to manually invalidate attendance data cache.
 * Use after mutations (add, edit, delete) to refresh the data.
 *
 * Also invalidates salary/payments caches because wages_due in
 * get_salary_waterfall is derived live from daily_attendance × rate — any
 * attendance edit can shift a week's status (Settled / Underpaid / Pending)
 * and the hero KPIs on /site/payments. Without this, the waterfall renders
 * stale numbers until the next focus refetch.
 */
export function useInvalidateAttendanceData() {
  const queryClient = useQueryClient();
  const { selectedSite } = useSelectedSite();

  return () => {
    if (selectedSite?.id) {
      queryClient.invalidateQueries({
        queryKey: ["attendance", "site", selectedSite.id],
      });
    }
    queryClient.invalidateQueries({ queryKey: ["salary-waterfall"] });
    queryClient.invalidateQueries({ queryKey: ["salary-slice-summary"] });
    queryClient.invalidateQueries({ queryKey: ["payments-ledger"] });
    queryClient.invalidateQueries({ queryKey: ["payment-summary"] });
    queryClient.invalidateQueries({ queryKey: ["settlements-list"] });
  };
}
