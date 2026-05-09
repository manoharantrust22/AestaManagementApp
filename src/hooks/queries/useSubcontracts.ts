import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { wrapQueryFn } from "@/lib/utils/timeout";

export interface Subcontract {
  id: string;
  site_id: string;
  title: string;
  laborer_name: string | null; // From joined laborer
  status: "draft" | "active" | "on_hold" | "completed" | "cancelled";
  total_value: number;
  created_at: string;
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
        laborer_name: item.laborer?.name || null,
        status: item.status,
        total_value: item.total_value,
        created_at: item.created_at,
      })) as Subcontract[];
    }, { operationName: "useSiteSubcontracts" }),
    enabled: !!siteId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
