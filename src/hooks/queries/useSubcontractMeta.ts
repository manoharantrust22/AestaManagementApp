import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface SubcontractMeta {
  id: string;
  trade_category_id: string | null;
  labor_tracking_mode: string | null;
  is_in_house: boolean;
}

/** Minimal meta for a subcontract — used to decide trade-scoping of the attendance/payments pages. */
export function useSubcontractMeta(contractId: string | null | undefined) {
  const supabase: any = createClient();
  return useQuery({
    queryKey: ["subcontract-meta", contractId],
    enabled: !!contractId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<SubcontractMeta | null> => {
      const { data, error } = await supabase
        .from("subcontracts")
        .select("id, trade_category_id, labor_tracking_mode, is_in_house")
        .eq("id", contractId)
        .maybeSingle();
      if (error) throw error;
      return (data as SubcontractMeta | null) ?? null;
    },
  });
}
