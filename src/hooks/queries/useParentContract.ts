import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

/**
 * "Combine into one contract" — promotes a contractor's separate contracts (e.g.
 * Jithin's floor sub-contracts) into a single named PARENT contract, with the floors
 * kept as optional children. Optionally re-points every existing record (expenses,
 * salary, attendance…) from the children onto the parent so the whole contract reads
 * as one. Backed by the SECURITY DEFINER `promote_to_parent_contract` RPC, which is a
 * pure FK re-point (no amount ever changes) and is journalled so `undo_reparent` can
 * fully reverse it.
 */

export interface PromoteParentInput {
  siteId: string;
  tradeCategoryId: string;
  parentTitle: string;
  /** The contracts to fold under the new parent (their `subcontracts.id`). */
  childIds: string[];
  /** Re-point existing records from the children onto the parent. Default true. */
  moveRecords: boolean;
}

function invalidateTradeViews(
  qc: ReturnType<typeof useQueryClient>,
  siteId: string | undefined
) {
  qc.invalidateQueries({ queryKey: ["trades", "site", siteId] });
  qc.invalidateQueries({ queryKey: ["trade-reconciliations", "site", siteId] });
  qc.invalidateQueries({ queryKey: ["trade-activity", "site", siteId] });
  qc.invalidateQueries({ queryKey: ["subcontracts", "site", siteId] });
}

export function usePromoteToParentContract(siteId: string | undefined) {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PromoteParentInput): Promise<string> => {
      const { data, error } = await (supabase as any).rpc("promote_to_parent_contract", {
        p_site_id: input.siteId,
        p_trade_category_id: input.tradeCategoryId,
        p_parent_title: input.parentTitle.trim(),
        p_child_ids: input.childIds,
        p_move_records: input.moveRecords,
      });
      if (error) throw error;
      return data as string; // the new parent's id
    },
    onSuccess: () => invalidateTradeViews(qc, siteId),
  });
}

export function useUndoReparent(siteId: string | undefined) {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (batchId: string): Promise<void> => {
      const { error } = await (supabase as any).rpc("undo_reparent", {
        p_batch_id: batchId,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateTradeViews(qc, siteId),
  });
}
