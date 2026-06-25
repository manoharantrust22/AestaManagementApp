import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

/** Total tea attributed to a trade at a site (from the conserving v_trade_tea_share view). */
export function useTradeTeaContractShares(params: {
  siteId: string | undefined;
  tradeCategoryId: string | null | undefined;
}) {
  const { siteId, tradeCategoryId } = params;
  const supabase: any = createClient();
  return useQuery({
    queryKey: ["trade-tea-contract-shares", siteId, tradeCategoryId],
    enabled: !!siteId && !!tradeCategoryId,
    staleTime: 60_000,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase
        .from("v_trade_tea_share")
        .select("amount")
        .eq("site_id", siteId)
        .eq("trade_category_id", tradeCategoryId);
      if (error) throw error;
      return (data ?? []).reduce((a: number, r: any) => a + Number(r.amount || 0), 0);
    },
  });
}
