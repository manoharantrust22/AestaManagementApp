"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient, ensureFreshSession } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/cache/keys";

/**
 * Move an ALREADY-SETTLED (paid) attendance day onto a fixed-price task-work package —
 * and move the whole single-laborer settlement with it — or reverse that move.
 *
 * Unlike {@link useAssignAttendanceToPackage} (which only retags task_work_package_id
 * and leaves the paid rupees booked under their old contract), this calls the
 * `move_settled_day_to_package` RPC, which additionally re-points the settlement_groups
 * row via contract_ref. The effect:
 *   - /site/expenses relabels the line "Contract wages - <laborer> - <package>" and
 *     attributes it to the package (its parent contract) instead of the old booking;
 *   - v_task_work_profitability counts the paid amount against the package price;
 *   - the money is untouched (same total, same wallet debit) — it is a re-attribution,
 *     fully reversible: pass packageId=null to restore the original booking exactly
 *     (the RPC snapshots it in settlement_groups.package_move_prev).
 *
 * Guard: the settlement must belong ONLY to this laborer (the crew-weekly-pay-by-laborer
 * case). A shared settlement is rejected by the RPC with a clear message.
 */
export interface MoveSettledDayToPackageInput {
  siteId: string;
  laborerId: string;
  /** Any one (or more) settled daily_attendance row id(s) of the laborer's settlement. */
  attendanceIds: string[];
  /** Package to move onto, or null to reverse back to the original booking. */
  packageId: string | null;
  /** Packages whose derived rollups also change (e.g. the one being moved off). */
  affectedPackageIds?: string[];
}

export interface MoveSettledDayResult {
  settlement_refs: string[];
  moved_total: number;
  group_count: number;
}

export function useMoveSettledDayToPackage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      input: MoveSettledDayToPackageInput
    ): Promise<MoveSettledDayResult> => {
      if (!input.attendanceIds.length) {
        return { settlement_refs: [], moved_total: 0, group_count: 0 };
      }

      await ensureFreshSession();
      const supabase = createClient();

      const { data, error } = await (supabase as any).rpc(
        "move_settled_day_to_package",
        {
          p_site_id: input.siteId,
          p_laborer_id: input.laborerId,
          p_attendance_ids: input.attendanceIds,
          p_package_id: input.packageId,
        }
      );
      if (error) throw error;
      return (data ?? {
        settlement_refs: [],
        moved_total: 0,
        group_count: 0,
      }) as MoveSettledDayResult;
    },
    onSuccess: (_result, input) => {
      const packageIds = new Set(
        [input.packageId, ...(input.affectedPackageIds ?? [])].filter(
          Boolean
        ) as string[]
      );
      for (const id of packageIds) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.taskWork.dayLogs(id),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.taskWork.profitability(id),
        });
      }
      queryClient.invalidateQueries({
        queryKey: queryKeys.taskWork.profitabilityBySite(input.siteId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.taskWork.bySite(input.siteId),
      });
      // The moved day leaves/enters the settleable pool and its settlement changes
      // attribution, so attendance, salary and expense readers all need to re-run.
      queryClient.invalidateQueries({ queryKey: queryKeys.attendance.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all });
      queryClient.invalidateQueries({ queryKey: ["expense-trade-summary"] });
      queryClient.invalidateQueries({ queryKey: ["contract-presence"] });
      queryClient.invalidateQueries({ queryKey: ["inspect-attendance-date"] });
      queryClient.invalidateQueries({ queryKey: ["salary-waterfall"] });
      queryClient.invalidateQueries({ queryKey: ["contract-labor-ledger"] });
    },
  });
}
