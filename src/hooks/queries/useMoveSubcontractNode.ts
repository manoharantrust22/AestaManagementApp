import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

/**
 * Drag-and-drop re-parenting for the Workforce ladder. `move_subcontract_node` re-points
 * ONE node's `parent_subcontract_id` (NULL = make it a top-level Contract); its whole
 * subtree moves with it and its attendance/payments stay put. Validated + journalled
 * server-side so `undo_move` can fully reverse it. Tier (Contract/Section/Task) is derived
 * from depth, so the moved node re-labels itself once the tree refetches.
 */

export interface MoveNodeInput {
  nodeId: string;
  /** New parent subcontract id, or null to make the node a top-level Contract. */
  newParentId: string | null;
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

function broadcastChanged(siteId: string | undefined) {
  if (typeof BroadcastChannel === "undefined") return;
  const bc = new BroadcastChannel("subcontracts-changed");
  bc.postMessage({ siteId, kind: "move", at: Date.now() });
  bc.close();
}

export function useMoveSubcontractNode(siteId: string | undefined) {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    /** Returns the batch_id (for undo), or null when the move was a no-op. */
    mutationFn: async (input: MoveNodeInput): Promise<string | null> => {
      const { data, error } = await (supabase as any).rpc("move_subcontract_node", {
        p_node_id: input.nodeId,
        p_new_parent_id: input.newParentId,
      });
      if (error) throw error;
      return (data as string | null) ?? null;
    },
    onSuccess: () => {
      invalidateTradeViews(qc, siteId);
      broadcastChanged(siteId);
    },
  });
}

export function useUndoMove(siteId: string | undefined) {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (batchId: string): Promise<void> => {
      const { error } = await (supabase as any).rpc("undo_move", { p_batch_id: batchId });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateTradeViews(qc, siteId);
      broadcastChanged(siteId);
    },
  });
}
