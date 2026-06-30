"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient, ensureFreshSession } from "@/lib/supabase/client";
import { wrapQueryFn } from "@/lib/utils/timeout";
import { useAuth } from "@/contexts/AuthContext";
import { useInvalidateAttendanceData } from "@/hooks/useAttendanceData";

export type CopyDayStatus =
  | "copied"
  | "skipped_existing"
  | "skipped_settled"
  | "skipped_holiday"
  | "error";

export interface CopyDayResult {
  date: string;
  status: CopyDayStatus;
  named?: number;
  market?: number;
  message?: string;
}

export interface CopyDayInput {
  siteId: string;
  sourceDate: string;
  targetDates: string[];
  /** non-null => trade workspace (scope daily by subcontract_id) */
  subcontractId: string | null;
  /** non-null => scope market rows by role category */
  tradeCategoryId: string | null;
  overwrite: boolean;
}

/** Per-target-date conflict state used to drive the "warn & choose" UI. */
export interface CopyTargetPrecheck {
  date: string;
  existing: boolean;
  settled: boolean;
  holiday: boolean;
}

/**
 * Copy a day's laborers (named + market) onto one or more target dates via the
 * copy_day_attendance RPC. Returns the per-date result list; the caller renders
 * the outcome (copied / skipped_* / error). Settled and holiday dates are always
 * protected server-side regardless of `overwrite`.
 */
export function useCopyDayAttendance() {
  const queryClient = useQueryClient();
  const { userProfile } = useAuth();
  const invalidateAttendance = useInvalidateAttendanceData();

  return useMutation({
    mutationFn: async (input: CopyDayInput): Promise<CopyDayResult[]> => {
      await ensureFreshSession();
      const supabase = createClient();
      const { data, error } = await (supabase.rpc as any)("copy_day_attendance", {
        p_site_id: input.siteId,
        p_source_date: input.sourceDate,
        p_target_dates: input.targetDates,
        p_subcontract_id: input.subcontractId,
        p_trade_category_id: input.tradeCategoryId,
        p_overwrite: input.overwrite,
        p_user_id: userProfile?.id ?? null,
        p_user_name: userProfile?.name ?? null,
      });
      if (error) throw error;
      const results = (data as { results?: CopyDayResult[] })?.results ?? [];
      return results;
    },
    onSuccess: () => {
      // The query layer ignores the invalidate's queued promises; firing it is
      // enough for the date-wise table, weekly summaries and payments KPIs.
      invalidateAttendance();
      queryClient.invalidateQueries({ queryKey: ["copy-day-precheck"] });
    },
  });
}

/**
 * Read-only pre-check of the chosen target dates, scoped to the same workspace as
 * the copy. Powers the warn step: which dates already have attendance, which are
 * settled (always protected), which are holidays (always protected). The RPC
 * re-checks authoritatively, so this is advisory only.
 */
export function usePrecheckCopyTargets(params: {
  siteId: string;
  dates: string[];
  subcontractId: string | null;
  tradeCategoryId: string | null;
  enabled: boolean;
}) {
  const { siteId, dates, subcontractId, tradeCategoryId, enabled } = params;
  const sorted = [...dates].sort();

  return useQuery({
    queryKey: [
      "copy-day-precheck",
      siteId,
      subcontractId ?? "civil",
      tradeCategoryId ?? "civil",
      sorted.join(","),
    ],
    enabled: enabled && !!siteId && sorted.length > 0,
    staleTime: 15 * 1000,
    queryFn: wrapQueryFn(
      async (): Promise<CopyTargetPrecheck[]> => {
        const supabase = createClient();
        const isTrade = !!subcontractId;

        // Daily rows in scope (drives both existing + settled).
        let dailyQuery = (supabase.from("daily_attendance") as any)
          .select("date,is_paid,settlement_group_id")
          .eq("site_id", siteId)
          .in("date", sorted)
          .eq("is_deleted", false)
          .eq("is_archived", false);
        if (isTrade) dailyQuery = dailyQuery.eq("subcontract_id", subcontractId);

        // Market rows in scope. In a trade workspace, market is scoped by role
        // category, so resolve the role ids first.
        let roleIds: string[] | null = null;
        if (isTrade && tradeCategoryId) {
          const { data: roleRows } = await (supabase.from("labor_roles") as any)
            .select("id")
            .eq("category_id", tradeCategoryId);
          roleIds = (roleRows ?? []).map((r: any) => r.id as string);
        }
        let marketQuery = (supabase.from("market_laborer_attendance") as any)
          .select("date,is_paid,settlement_group_id")
          .eq("site_id", siteId)
          .in("date", sorted);
        if (isTrade) {
          marketQuery = marketQuery.in(
            "role_id",
            roleIds && roleIds.length
              ? roleIds
              : ["00000000-0000-0000-0000-000000000000"]
          );
        }

        const holidayQuery = (supabase.from("site_holidays") as any)
          .select("date,trade_category_id")
          .eq("site_id", siteId)
          .in("date", sorted);

        const [dailyRes, marketRes, holidayRes] = await Promise.all([
          dailyQuery,
          marketQuery,
          holidayQuery,
        ]);

        const existing = new Set<string>();
        const settled = new Set<string>();
        const holiday = new Set<string>();

        const ingestAttendance = (rows: any[] | null | undefined) => {
          for (const r of rows ?? []) {
            existing.add(r.date as string);
            if (r.is_paid === true || r.settlement_group_id != null) {
              settled.add(r.date as string);
            }
          }
        };
        ingestAttendance(dailyRes?.data);
        ingestAttendance(marketRes?.data);

        for (const h of holidayRes?.data ?? []) {
          const cat = (h.trade_category_id ?? null) as string | null;
          // A Civil holiday (null) covers everyone; a trade holiday only its trade.
          if (cat === null || cat === tradeCategoryId) {
            holiday.add(h.date as string);
          }
        }

        return sorted.map((d) => ({
          date: d,
          existing: existing.has(d),
          settled: settled.has(d),
          holiday: holiday.has(d),
        }));
      },
      { operationName: "usePrecheckCopyTargets" }
    ),
  });
}
