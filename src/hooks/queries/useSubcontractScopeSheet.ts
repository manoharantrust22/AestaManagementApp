import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { wrapQueryFn } from "@/lib/utils/timeout";
import { sumScopeValues, type ScopeItem } from "@/types/scopeSheet.types";

/**
 * Read the agreed scope sheet (work items + before/after photos) for a subcontract.
 * One row per subcontract in `subcontract_scope_sheet`; returns the items array
 * (empty when no row yet).
 */
export function useSubcontractScopeSheet(subcontractId: string | undefined) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["scope-sheet", subcontractId],
    enabled: !!subcontractId,
    staleTime: 60 * 1000,
    queryFn: wrapQueryFn(
      async (): Promise<ScopeItem[]> => {
        if (!subcontractId) return [];
        const sb = supabase as any;
        const { data, error } = await sb
          .from("subcontract_scope_sheet")
          .select("items")
          .eq("subcontract_id", subcontractId)
          .maybeSingle();
        if (error) throw error;
        return (data?.items ?? []) as ScopeItem[];
      },
      { operationName: "useSubcontractScopeSheet" }
    ),
  });
}

interface SaveScopeSheetInput {
  subcontractId: string;
  items: ScopeItem[];
  userId?: string;
}

/**
 * Upsert the whole items array (one row per subcontract).
 *
 * Auto-sum rule: while the contract is a DRAFT lump-sum (a Future plan), its
 * total_value tracks Σ point values so the Planned-value tile and all money
 * rollups stay live without any extra plumbing. Sync stops forever once the
 * plan is handed to a crew (status leaves 'draft').
 */
export function useSaveSubcontractScopeSheet() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: SaveScopeSheetInput
    ): Promise<{ siteId?: string; synced: boolean }> => {
      const sb = supabase as any;
      const { error } = await sb.from("subcontract_scope_sheet").upsert(
        {
          subcontract_id: input.subcontractId,
          items: input.items,
          created_by: input.userId ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "subcontract_id" }
      );
      if (error) throw error;

      const { data: sc, error: scError } = await sb
        .from("subcontracts")
        .select("site_id, status, is_rate_based")
        .eq("id", input.subcontractId)
        .single();
      if (scError) throw scError;

      let synced = false;
      if (sc?.status === "draft" && sc.is_rate_based === false) {
        const { error: syncError } = await sb
          .from("subcontracts")
          .update({
            total_value: sumScopeValues(input.items),
            updated_at: new Date().toISOString(),
          })
          .eq("id", input.subcontractId)
          // Re-guard against a handover racing this save.
          .eq("status", "draft");
        if (syncError) throw syncError;
        synced = true;
      }
      return { siteId: sc?.site_id as string | undefined, synced };
    },
    onSuccess: (result, input) => {
      queryClient.invalidateQueries({ queryKey: ["scope-sheet", input.subcontractId] });
      if (result.synced && result.siteId) {
        const siteId = result.siteId;
        queryClient.invalidateQueries({ queryKey: ["trades", "site", siteId] });
        queryClient.invalidateQueries({ queryKey: ["trade-reconciliations", "site", siteId] });
        queryClient.invalidateQueries({ queryKey: ["subcontracts", "site", siteId] });
        if (typeof BroadcastChannel !== "undefined") {
          const bc = new BroadcastChannel("subcontracts-changed");
          bc.postMessage({ siteId, at: Date.now() });
          bc.close();
        }
      }
    },
  });
}
