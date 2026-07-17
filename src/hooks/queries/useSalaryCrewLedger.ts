import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { withTimeout, TIMEOUTS } from "@/lib/utils/timeout";
import { mapCrewLedger, type CrewLedgerResult } from "@/lib/payments/crewLedger";

/**
 * The Salary Settlements "By laborer" read model (get_salary_crew_ledger):
 * every Sun–Sat week of the Civil slice with per-laborer gross/commission/net,
 * paid state, the mesthri block, project totals, and the pool reconciliation.
 * Returns { enabled: false } for sites without a crew-pay contract.
 */
export function useSalaryCrewLedger(args: {
  siteId: string | undefined;
  subcontractId: string | null;
  /** Gate the fetch — the view is only rendered when crew mode is on. */
  enabled?: boolean;
}) {
  const supabase = createClient();
  const { siteId, subcontractId, enabled = true } = args;
  return useQuery<CrewLedgerResult>({
    queryKey: ["salary-crew-ledger", siteId, subcontractId],
    enabled: Boolean(siteId) && enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await withTimeout(
        Promise.resolve(
          (supabase as any).rpc("get_salary_crew_ledger", {
            p_site_id: siteId,
            p_subcontract_id: subcontractId,
          }),
        ),
        TIMEOUTS.QUERY,
        "Crew ledger query timed out. Please retry.",
      );
      if (error) throw error;
      return mapCrewLedger(data);
    },
  });
}
