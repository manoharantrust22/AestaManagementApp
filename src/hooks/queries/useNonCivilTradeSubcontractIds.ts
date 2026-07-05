import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { fetchNonCivilTradeSubcontractIds } from "@/lib/workforce/nonCivilTradeSubcontracts";

/**
 * Set of subcontract ids for a site whose trade is explicitly non-Civil (Painting,
 * Electrical, …). Used by the /site/attendance weekly strip so the contract-pending
 * total excludes days settled in a trade's own workspace — mirroring the corrected
 * get_salary_waterfall RPC and the weekly-settle write path. Empty set = nothing to
 * exclude (byte-for-byte the old behaviour).
 */
export function useNonCivilTradeSubcontractIds(siteId: string | undefined) {
  const supabase = createClient();
  return useQuery<Set<string>>({
    queryKey: ["non-civil-trade-subcontract-ids", siteId],
    enabled: Boolean(siteId),
    staleTime: 60_000,
    queryFn: () => fetchNonCivilTradeSubcontractIds(supabase, siteId!),
  });
}
