/**
 * useMesthriCommissionPayable
 *
 * Per-mesthri commission accrued vs paid → payable, from get_mesthri_commission_payable
 * (migration 20260705130100). Accrued uses the locked snapshot for settled days, else
 * the live estimate. Drives the "Pay mesthri commission" surface.
 */

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { withTimeout, TIMEOUTS } from "@/lib/utils/timeout";

export interface MesthriCommissionPayableRow {
  collectorId: string;
  collectorName: string;
  accrued: number;
  paid: number;
  payable: number;
  crewDayCount: number;
  /** Commission paid site-wide with no contract tag. Only set when a contract ref is
   *  passed; shown as a caveat, never subtracted from payable. */
  untaggedPaid: number;
}

function toNumber(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function useMesthriCommissionPayable(
  siteId: string | null | undefined,
  collectorId: string | null = null,
  dateFrom: string | null = null,
  dateTo: string | null = null,
  contractRefKind: "task_work" | "subcontract" | null = null,
  contractRefId: string | null = null,
  enabled = true,
) {
  const supabase = createClient();
  return useQuery<MesthriCommissionPayableRow[]>({
    queryKey: [
      "mesthri-commission-payable", siteId, collectorId, dateFrom, dateTo,
      contractRefKind, contractRefId,
    ],
    enabled: Boolean(enabled && siteId),
    staleTime: 30_000,
    queryFn: async ({ signal }): Promise<MesthriCommissionPayableRow[]> => {
      const { data, error } = await withTimeout(
        Promise.resolve(
          (supabase as any)
            .rpc("get_mesthri_commission_payable", {
              p_site_id: siteId,
              p_collector_id: collectorId,
              p_date_from: dateFrom,
              p_date_to: dateTo,
              p_contract_ref_kind: contractRefKind,
              p_contract_ref_id: contractRefId,
            })
            .abortSignal(signal),
        ),
        TIMEOUTS.QUERY,
        "Mesthri commission payable query timed out. Please retry.",
      );
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        collectorId: String(r.collector_id ?? ""),
        collectorName: String(r.collector_name ?? "Unknown"),
        accrued: toNumber(r.accrued),
        paid: toNumber(r.paid),
        payable: toNumber(r.payable),
        crewDayCount: toNumber(r.crew_day_count),
        untaggedPaid: toNumber(r.untagged_paid),
      }));
    },
  });
}
