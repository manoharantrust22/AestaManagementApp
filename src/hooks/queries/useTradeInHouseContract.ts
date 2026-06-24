import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

/** Resolve (creating on first use) the {Trade} — In-house DETAILED contract for a site.
 *  Drives per-trade attendance + salary. Idempotent server-side. */
export function useEnsureTradeInHouseContract(siteId: string | undefined) {
  const supabase: any = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tradeCategoryId: string): Promise<string> => {
      const { data, error } = await supabase.rpc("ensure_trade_in_house_contract", {
        p_site_id: siteId,
        p_trade_category_id: tradeCategoryId,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trades", "site", siteId] });
    },
  });
}
