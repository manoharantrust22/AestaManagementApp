import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

/**
 * Returns the distinct subcontract_ids present on contract-laborer attendance
 * rows for a given week at a site. Used by MestriSettleDialog (fill-week mode)
 * to auto-pre-select the subcontract when the whole week shares one.
 *
 * Filters to contract laborers via the joined laborers.laborer_type — daily
 * and market rows are ignored, since this hook only powers the contract
 * settle dialog. Returns an array of unique non-null subcontract ids; the
 * caller treats `length === 1` as the auto-pick signal.
 */
export function useWeekContractSubcontracts(
  siteId: string | undefined,
  weekStart: string | undefined,
  weekEnd: string | undefined,
) {
  const supabase = createClient();

  return useQuery<string[]>({
    queryKey: ["week-contract-subcontracts", siteId, weekStart, weekEnd],
    enabled: Boolean(siteId && weekStart && weekEnd),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("daily_attendance")
        .select("subcontract_id, laborer:laborers!inner(laborer_type)")
        .eq("site_id", siteId)
        .gte("date", weekStart)
        .lte("date", weekEnd)
        .eq("laborer.laborer_type", "contract")
        .not("subcontract_id", "is", null);

      if (error) throw error;

      const ids = new Set<string>();
      for (const row of (data ?? []) as Array<{ subcontract_id: string | null }>) {
        if (row.subcontract_id) ids.add(row.subcontract_id);
      }
      return Array.from(ids);
    },
  });
}
