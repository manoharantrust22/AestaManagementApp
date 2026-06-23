import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { wrapQueryFn } from "@/lib/utils/timeout";
import type { ScopeItem } from "@/types/scopeSheet.types";

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

/** Upsert the whole items array (one row per subcontract). */
export function useSaveSubcontractScopeSheet() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveScopeSheetInput) => {
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
    },
    onSuccess: (_, input) => {
      queryClient.invalidateQueries({ queryKey: ["scope-sheet", input.subcontractId] });
    },
  });
}
