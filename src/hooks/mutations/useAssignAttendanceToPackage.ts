"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient, ensureFreshSession } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/cache/keys";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Retag attendance days onto (or off) a fixed-price task-work package.
 *
 * This is the ONLY column touched: `task_work_package_id`. Everything the money
 * depends on — is_paid, settlement_group_id, daily_earnings, work_days,
 * daily_rate_applied — is left exactly as it is, which is what makes this safe on
 * days that were ALREADY settled. The DB agrees: recompute_settlement_total_after_
 * attendance only fires on settlement_group_id / daily_earnings / is_deleted, so no
 * settlement total, wallet debit or expense moves.
 *
 * Two effects follow automatically from the tag, both trigger-driven:
 *   - the package's day log rebuilds (trigger_attendance_derive_task_work →
 *     recalculate_task_work_day_log_from_attendance, which recalcs the OLD and the
 *     NEW package, so un-tagging cleans up after itself);
 *   - the day drops out of every salary settlement (task_work_package_id IS NULL is
 *     part of the settleable predicate everywhere).
 *
 * Wages ALREADY paid on tagged days surface as v_task_work_profitability.
 * wages_prepaid and count against the package price, so the crew is not paid twice
 * for the same work. That is derived, so unassigning a day removes the credit too —
 * the whole operation is reversible with no compensating entries.
 */
export interface AssignAttendanceToPackageInput {
  siteId: string;
  /** Package to tag onto, or null to clear the tag (back to general site work). */
  packageId: string | null;
  /** daily_attendance row ids. */
  attendanceIds?: string[];
  /** market_laborer_attendance row ids. */
  marketIds?: string[];
  /**
   * Packages whose day logs / balances also need refreshing — the ones the moved
   * days came FROM, since their derived rollups change too.
   */
  affectedPackageIds?: string[];
}

export function useAssignAttendanceToPackage() {
  const queryClient = useQueryClient();
  const { userProfile } = useAuth();

  return useMutation({
    mutationFn: async (input: AssignAttendanceToPackageInput) => {
      const attendanceIds = input.attendanceIds ?? [];
      const marketIds = input.marketIds ?? [];
      if (attendanceIds.length === 0 && marketIds.length === 0) {
        return { daily: 0, market: 0 };
      }

      await ensureFreshSession();
      const supabase = createClient();

      if (attendanceIds.length > 0) {
        const patch: Record<string, unknown> = {
          task_work_package_id: input.packageId,
        };
        if (userProfile?.id) {
          patch.updated_by = userProfile.name;
          patch.updated_by_user_id = userProfile.id;
        }
        const { error } = await (supabase.from("daily_attendance") as any)
          .update(patch)
          // site_id belt-and-braces: ids are already site-scoped by the caller's
          // query, but this makes a cross-site write impossible.
          .eq("site_id", input.siteId)
          .in("id", attendanceIds);
        if (error) throw error;
      }

      if (marketIds.length > 0) {
        const { error } = await (
          supabase.from("market_laborer_attendance") as any
        )
          .update({ task_work_package_id: input.packageId })
          .eq("site_id", input.siteId)
          .in("id", marketIds);
        if (error) throw error;
      }

      return { daily: attendanceIds.length, market: marketIds.length };
    },
    onSuccess: (_result, input) => {
      const packageIds = new Set(
        [input.packageId, ...(input.affectedPackageIds ?? [])].filter(
          Boolean
        ) as string[]
      );
      for (const id of packageIds) {
        queryClient.invalidateQueries({ queryKey: queryKeys.taskWork.dayLogs(id) });
        queryClient.invalidateQueries({
          queryKey: queryKeys.taskWork.profitability(id),
        });
      }
      queryClient.invalidateQueries({
        queryKey: queryKeys.taskWork.profitabilityBySite(input.siteId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.taskWork.bySite(input.siteId) });
      // The moved days leave/enter the settleable pool, so every attendance and
      // salary reader needs to re-run.
      queryClient.invalidateQueries({ queryKey: queryKeys.attendance.all });
      queryClient.invalidateQueries({ queryKey: ["contract-presence"] });
      queryClient.invalidateQueries({ queryKey: ["inspect-attendance-date"] });
      queryClient.invalidateQueries({ queryKey: ["salary-waterfall"] });
      queryClient.invalidateQueries({ queryKey: ["contract-labor-ledger"] });
    },
  });
}
