/**
 * useMesthriCommissionSummary
 *
 * Powers the "Commissions" report (project/month rollup of the informal mesthri
 * commission). Calls get_mesthri_commission_summary (migration 20260619180300):
 * for each mesthri, the estimated commission their laborers pass to them
 * (rate x days) plus the mesthri's own attendance salary -> total.
 *
 * Estimate/reporting only -- no money movement.
 */

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { withTimeout, TIMEOUTS } from "@/lib/utils/timeout";

export interface MesthriCommissionLaborer {
  laborerId: string;
  laborerName: string;
  days: number;
  rate: number;
  commissionEst: number;
}

export interface MesthriCommissionRow {
  mesthriKey: string;
  mesthriName: string;
  leaderLaborerId: string | null;
  ownSalary: number;
  ownDays: number;
  commissionCollected: number;
  total: number;
  laborers: MesthriCommissionLaborer[];
}

export interface MesthriCommissionSummary {
  dateFrom: string;
  dateTo: string;
  grandTotalCommission: number;
  mesthris: MesthriCommissionRow[];
}

function toNumber(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function useMesthriCommissionSummary(
  dateFrom: string | null,
  dateTo: string | null,
  siteId: string | null = null,
  enabled = true,
) {
  const supabase = createClient();
  return useQuery<MesthriCommissionSummary>({
    queryKey: ["mesthri-commission-summary", dateFrom, dateTo, siteId],
    enabled: Boolean(enabled && dateFrom && dateTo),
    staleTime: 60_000,
    queryFn: async ({ signal }): Promise<MesthriCommissionSummary> => {
      const { data, error } = await withTimeout(
        Promise.resolve(
          (supabase as any)
            .rpc("get_mesthri_commission_summary", {
              p_date_from: dateFrom,
              p_date_to: dateTo,
              p_site_id: siteId,
            })
            .abortSignal(signal),
        ),
        TIMEOUTS.QUERY,
        "Mesthri commission summary query timed out. Please retry.",
      );
      if (error) throw error;
      const r: any = data || {};
      return {
        dateFrom: String(r.date_from ?? dateFrom ?? ""),
        dateTo: String(r.date_to ?? dateTo ?? ""),
        grandTotalCommission: toNumber(r.grand_total_commission),
        mesthris: (r.mesthris ?? []).map((m: any) => ({
          mesthriKey: String(m.mesthri_key ?? ""),
          mesthriName: String(m.mesthri_name ?? "Unknown"),
          leaderLaborerId: m.leader_laborer_id
            ? String(m.leader_laborer_id)
            : null,
          ownSalary: toNumber(m.own_salary),
          ownDays: toNumber(m.own_days),
          commissionCollected: toNumber(m.commission_collected),
          total: toNumber(m.total),
          laborers: (m.laborers ?? []).map((l: any) => ({
            laborerId: String(l.laborer_id ?? ""),
            laborerName: String(l.laborer_name ?? ""),
            days: toNumber(l.days),
            rate: toNumber(l.rate),
            commissionEst: toNumber(l.commission_est),
          })),
        })),
      };
    },
  });
}
