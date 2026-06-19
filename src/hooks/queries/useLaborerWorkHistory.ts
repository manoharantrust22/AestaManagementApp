/**
 * useLaborerWorkHistory
 *
 * Powers the "Work history" section of the LaborerProfileDrawer. Calls the
 * get_laborer_work_history RPC (migration 20260619180200) which returns
 * lifetime (or range-scoped) totals plus work "stints" reconstructed from gaps
 * in daily_attendance -- laborers cycle active/inactive as they come and go and
 * there is no status-history table, so a new stint starts after a >30-day gap.
 *
 * Also surfaces the estimated mesthri commission (rate x days, gated on a
 * resolvable mesthri). paid_total / outstanding are 0 for contract laborers by
 * design (they settle via the mesthri's subcontract).
 */

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { withTimeout, TIMEOUTS } from "@/lib/utils/timeout";

export interface WorkStint {
  startDate: string;
  endDate: string;
  days: number;
  earned: number;
  commissionEst: number;
}

export interface WorkHistorySite {
  siteId: string;
  siteName: string;
  days: number;
  earnings: number;
}

export interface LaborerWorkHistory {
  laborerType: string;
  hasMesthri: boolean;
  mesthriName: string | null;
  commissionPerDay: number;
  daysWorked: number;
  earningsTotal: number;
  paidTotal: number;
  outstanding: number;
  commissionEst: number;
  firstDay: string | null;
  lastDay: string | null;
  stintCount: number;
  sites: WorkHistorySite[];
  stints: WorkStint[];
}

function toNumber(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function useLaborerWorkHistory(laborerId: string | null) {
  const supabase = createClient();
  return useQuery<LaborerWorkHistory>({
    queryKey: ["laborer-work-history", laborerId],
    enabled: Boolean(laborerId),
    staleTime: 60_000,
    queryFn: async ({ signal }): Promise<LaborerWorkHistory> => {
      const { data, error } = await withTimeout(
        Promise.resolve(
          (supabase as any)
            .rpc("get_laborer_work_history", {
              p_laborer_id: laborerId,
              p_date_from: null,
              p_date_to: null,
            })
            .abortSignal(signal),
        ),
        TIMEOUTS.QUERY,
        "Laborer work history query timed out. Please retry.",
      );
      if (error) throw error;
      const r: any = data || {};
      return {
        laborerType: String(r.laborer_type ?? ""),
        hasMesthri: Boolean(r.has_mesthri),
        mesthriName: r.mesthri_name ? String(r.mesthri_name) : null,
        commissionPerDay: toNumber(r.commission_per_day),
        daysWorked: toNumber(r.days_worked),
        earningsTotal: toNumber(r.earnings_total),
        paidTotal: toNumber(r.paid_total),
        outstanding: toNumber(r.outstanding),
        commissionEst: toNumber(r.commission_est),
        firstDay: r.first_day ? String(r.first_day) : null,
        lastDay: r.last_day ? String(r.last_day) : null,
        stintCount: toNumber(r.stint_count),
        sites: (r.sites ?? []).map((s: any) => ({
          siteId: String(s.site_id ?? ""),
          siteName: String(s.site_name ?? ""),
          days: toNumber(s.days),
          earnings: toNumber(s.earnings),
        })),
        stints: (r.stints ?? []).map((s: any) => ({
          startDate: String(s.start_date),
          endDate: String(s.end_date),
          days: toNumber(s.days),
          earned: toNumber(s.earned),
          commissionEst: toNumber(s.commission_est),
        })),
      };
    },
  });
}
