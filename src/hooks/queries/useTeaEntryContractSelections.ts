/**
 * useTeaEntryContractSelections
 *
 * Loads the per-contract breakdown the engineer saved for a tea entry, so the
 * contract-aware allocator can repopulate its include/exclude + amount-override
 * state when EDITING an existing entry (otherwise a re-save would silently revert
 * to all-included auto split).
 */

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { cacheTTL } from "@/lib/cache/keys";

export interface TeaEntryContractSelectionRow {
  site_id: string;
  presence_kind: "package" | "subcontract" | "mesthri";
  ref_id: string | null;
  trade_category_id: string | null;
  man_days: number;
  allocated_amount: number;
  is_included: boolean;
  is_amount_override: boolean;
}

export function useTeaEntryContractSelections(entryId: string | null | undefined) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["tea-entry-contract-selections", entryId],
    enabled: !!entryId,
    staleTime: cacheTTL.transactional,
    queryFn: async (): Promise<TeaEntryContractSelectionRow[]> => {
      const { data, error } = await (supabase as any)
        .from("tea_shop_entry_contract_selections")
        .select(
          "site_id, presence_kind, ref_id, trade_category_id, man_days, allocated_amount, is_included, is_amount_override"
        )
        .eq("entry_id", entryId);
      if (error) {
        console.warn("Tea entry contract selections lookup failed:", error.message);
        return [];
      }
      return (data ?? []) as TeaEntryContractSelectionRow[];
    },
  });
}
