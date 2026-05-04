import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { withTimeout, TIMEOUTS } from "@/lib/utils/timeout";

export interface OpeningBalance {
  id: string;
  laborerId: string;
  laborerName: string;
  asOfDate: string;            // ISO YYYY-MM-DD
  openingWagesOwed: number;    // net unpaid as of as_of_date
  openingPaid: number;         // gross paid before as_of_date
}

/**
 * Fetches per-laborer opening balances for the selected site. Populated by a
 * Mode B reconcile (reconcile_site_with_opening_balance RPC). Returns an
 * empty array for sites that haven't been Mode-B-reconciled.
 */
export function useOpeningBalances(siteId: string | undefined) {
  const supabase = createClient();
  return useQuery<OpeningBalance[]>({
    queryKey: ["opening-balances", siteId],
    enabled: Boolean(siteId),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await withTimeout(
        Promise.resolve(
          (supabase as any)
            .from("laborer_opening_balances")
            .select(
              `id, laborer_id, as_of_date, opening_wages_owed, opening_paid,
               laborers!laborer_opening_balances_laborer_id_fkey ( name )`
            )
            .eq("site_id", siteId)
            .order("opening_wages_owed", { ascending: false })
        ),
        TIMEOUTS.QUERY,
        "Opening balances query timed out. Please retry.",
      );
      if (error) throw error;
      return ((data ?? []) as Array<any>).map<OpeningBalance>((r) => ({
        id:               String(r.id),
        laborerId:        String(r.laborer_id),
        laborerName:      String(r.laborers?.name ?? "Unknown"),
        asOfDate:         String(r.as_of_date),
        openingWagesOwed: Number(r.opening_wages_owed) || 0,
        openingPaid:      Number(r.opening_paid)       || 0,
      }));
    },
  });
}
