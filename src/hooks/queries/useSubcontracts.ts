import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { wrapQueryFn } from "@/lib/utils/timeout";

export interface Subcontract {
  id: string;
  site_id: string;
  title: string;
  laborer_id: string | null; // Head mestri (wage recipient); null = no mestri attached
  laborer_name: string | null; // From joined laborer
  trade_category_id: string | null; // Trade (e.g. Civil) — used to suggest a mestri
  status: "draft" | "active" | "on_hold" | "completed" | "cancelled";
  total_value: number;
  created_at: string;
  /** Self-reference: set when this contract is a child (floor) of a combined parent. */
  parent_subcontract_id: string | null;
  /** Crew weekly pay (Salary Settlements "By laborer" view) — see 20260717120000. */
  crew_pay_enabled: boolean;
  crew_pay_effective_from: string | null;
}

/**
 * Fetch all subcontracts for a specific site
 */
export function useSiteSubcontracts(siteId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["subcontracts", "site", siteId],
    queryFn: wrapQueryFn(async () => {
      if (!siteId) return [];

      const { data, error } = await supabase
        .from("subcontracts")
        .select(`
          id,
          site_id,
          title,
          status,
          total_value,
          created_at,
          laborer_id,
          trade_category_id,
          parent_subcontract_id,
          crew_pay_enabled,
          crew_pay_effective_from,
          laborer:laborers(name)
        `)
        .eq("site_id", siteId)
        .in("status", ["draft", "active", "on_hold"]) // Only active/pending contracts
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching site subcontracts:", error);
        throw error;
      }

      // Transform to flatten laborer name
      return (data || []).map((item: any) => ({
        id: item.id,
        site_id: item.site_id,
        title: item.title,
        laborer_id: item.laborer_id ?? null,
        laborer_name: item.laborer?.name || null,
        trade_category_id: item.trade_category_id ?? null,
        status: item.status,
        total_value: item.total_value,
        created_at: item.created_at,
        parent_subcontract_id: item.parent_subcontract_id ?? null,
        crew_pay_enabled: Boolean(item.crew_pay_enabled),
        crew_pay_effective_from: item.crew_pay_effective_from ?? null,
      })) as Subcontract[];
    }, { operationName: "useSiteSubcontracts" }),
    enabled: !!siteId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
