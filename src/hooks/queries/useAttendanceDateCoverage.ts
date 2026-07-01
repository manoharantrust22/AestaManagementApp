/**
 * useAttendanceDateCoverage
 *
 * The COMPLETE set of dates (YYYY-MM-DD) that have any `daily_attendance` for a
 * site — the whole history, not just the weeks the attendance list has lazily
 * loaded. Volume is tiny (one row per day via a DISTINCT RPC), so it loads in a
 * single query, exactly like `useContractPresence`.
 *
 * Why it exists: the attendance sheet loads one week at a time on scroll, so the
 * client-side "loaded dates" set is incomplete for older weeks. Contract-presence
 * rows load for the whole history at once, so an already-attended older day would
 * otherwise render as a stale "~₹ est" contract row until its attendance week
 * scrolls into view. Gating the est / unfilled / holiday-only logic on THIS set
 * (what exists in the DB) instead of on what's loaded keeps the sheet honest.
 */

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { cacheTTL } from "@/lib/cache/keys";

export interface UseAttendanceDateCoverageOptions {
  siteId: string | undefined;
  dateFrom: string | null;
  dateTo: string | null;
  isAllTime?: boolean;
  enabled?: boolean;
}

export function useAttendanceDateCoverage({
  siteId,
  dateFrom,
  dateTo,
  isAllTime = false,
  enabled = true,
}: UseAttendanceDateCoverageOptions) {
  const supabase = createClient();

  // "All Time" walks the whole site history; a bounded filter clamps the range.
  const from = isAllTime ? null : dateFrom;
  const to = isAllTime ? null : dateTo;

  return useQuery({
    queryKey: ["attendance-date-coverage", "site", siteId, { from, to }] as const,
    enabled: enabled && !!siteId,
    staleTime: cacheTTL.transactional,
    gcTime: cacheTTL.transactional * 2,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await (supabase.rpc as any)(
        "get_site_attendance_dates",
        { p_site_id: siteId, p_from: from, p_to: to }
      );
      if (error) {
        console.warn("Attendance date coverage failed:", error);
        return new Set<string>();
      }
      const dates = new Set<string>();
      for (const row of (data || []) as any[]) {
        const d =
          typeof row === "string" ? row : row?.attendance_date ?? row?.date;
        if (d) dates.add(String(d).slice(0, 10));
      }
      return dates;
    },
  });
}
