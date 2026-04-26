/**
 * useAttendanceSummary
 *
 * React Query hook that fetches the Attendance page summary cards
 * (Period Total / Salary / Tea Shop / Daily / Contract / Market /
 * Paid / Pending / Avg-per-day) from the get_attendance_summary RPC.
 *
 * Lives separately from the table data so the cards stay accurate at
 * any scope (including All Time) even though the table loads one
 * week at a time via infinite scroll.
 *
 * Mirrors the shape returned by the periodTotals reducer in
 * attendance-content.tsx so the consumer can swap with no UI changes.
 */

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useSelectedSite } from "@/contexts/SiteContext";
import { cacheTTL } from "@/lib/cache/keys";

export interface AttendancePeriodTotals {
  totalSalary: number;
  totalTeaShop: number;
  totalExpense: number;
  totalLaborers: number;
  avgPerDay: number;
  totalPaidCount: number;
  totalPendingCount: number;
  totalPaidAmount: number;
  totalPendingAmount: number;
  totalDailyAmount: number;
  totalContractAmount: number;
  totalMarketAmount: number;
  /** Distinct days with at least one daily/market attendance row in the scope. */
  activeDays: number;
}

export interface UseAttendanceSummaryOptions {
  dateFrom: string | null;
  dateTo: string | null;
  isAllTime?: boolean;
  enabled?: boolean;
}

const ZERO_TOTALS: AttendancePeriodTotals = {
  totalSalary: 0,
  totalTeaShop: 0,
  totalExpense: 0,
  totalLaborers: 0,
  avgPerDay: 0,
  totalPaidCount: 0,
  totalPendingCount: 0,
  totalPaidAmount: 0,
  totalPendingAmount: 0,
  totalDailyAmount: 0,
  totalContractAmount: 0,
  totalMarketAmount: 0,
  activeDays: 0,
};

function toNumber(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function useAttendanceSummary(options: UseAttendanceSummaryOptions) {
  const { dateFrom, dateTo, isAllTime = false, enabled = true } = options;
  const { selectedSite } = useSelectedSite();
  const supabase = createClient();
  const siteId = selectedSite?.id;

  // When "All Time" is selected, send NULL bounds to the RPC so it scans
  // everything for the site. Otherwise pass the explicit window.
  const effectiveFrom = isAllTime ? null : dateFrom;
  const effectiveTo = isAllTime ? null : dateTo;

  const queryKey = siteId
    ? (["attendance", "site", siteId, "summary", { from: effectiveFrom, to: effectiveTo }] as const)
    : (["attendance", "summary", "disabled"] as const);

  return useQuery({
    queryKey,
    enabled: enabled && !!siteId,
    staleTime: cacheTTL.transactional,
    gcTime: cacheTTL.transactional * 2,
    refetchOnWindowFocus: true,
    // Don't retry: a missing RPC (404) or schema mismatch won't fix itself,
    // and the consumer already has a graceful fallback (client-side sum of
    // loaded weeks) so we should fail fast and let the fallback take over.
    retry: false,
    // Don't auto-retry just because the component re-renders or remounts —
    // without this, a cached error state would re-fire the request every
    // time this hook re-runs.
    retryOnMount: false,
    queryFn: async (): Promise<AttendancePeriodTotals> => {
      if (!siteId) return ZERO_TOTALS;

      const { data, error } = await (supabase as any).rpc(
        "get_attendance_summary",
        {
          p_site_id: siteId,
          p_date_from: effectiveFrom,
          p_date_to: effectiveTo,
        }
      );

      if (error) {
        // Throw instead of returning zeros so React Query keeps `data`
        // undefined and the consumer's fallback (loaded-weeks sum) kicks
        // in. Returning ZERO_TOTALS would falsely satisfy "data exists".
        console.warn("get_attendance_summary failed:", error);
        throw error;
      }

      // RPC returns a single jsonb object.
      const r = data || {};
      return {
        totalSalary: toNumber(r.total_salary),
        totalTeaShop: toNumber(r.total_tea_shop),
        totalExpense: toNumber(r.total_expense),
        totalLaborers: toNumber(r.total_laborers),
        avgPerDay: toNumber(r.avg_per_day),
        totalPaidCount: toNumber(r.paid_count),
        totalPendingCount: toNumber(r.pending_count),
        totalPaidAmount: toNumber(r.paid_amount),
        totalPendingAmount: toNumber(r.pending_amount),
        totalDailyAmount: toNumber(r.daily_amount),
        totalContractAmount: toNumber(r.contract_amount),
        totalMarketAmount: toNumber(r.market_amount),
        activeDays: toNumber(r.active_days),
      };
    },
  });
}
