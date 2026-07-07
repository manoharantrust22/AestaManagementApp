/**
 * useContractCrewCommissionDays
 *
 * Raw company-laborer ("contract" type) attendance days for ONE contract, used by
 * the package/subcontract dialog to preview how a chosen commission start date
 * splits the crew's already-worked days (see splitCrewCommissionByDate).
 *
 * Reads v_daily_attendance_commission (NOT daily_attendance directly): the view
 * already joins laborers and exposes laborer_type + commission_per_day, so we avoid
 * the two-FK embed ambiguity on daily_attendance→laborers. We pull only the RAW
 * per-day columns (date, work_days_eff, daily_earnings, commission_per_day) and
 * recompute the split on the client, so the current effective_from does not bias
 * the preview. The maistry (collector) is excluded — his own days earn no commission.
 */

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { withTimeout, TIMEOUTS } from "@/lib/utils/timeout";
import type { CommissionDayRow } from "@/lib/workforce/commission";

export type ContractCrewKind = "task_work" | "subcontract";

export interface ContractCrewCommissionDays {
  rows: CommissionDayRow[];
  earliestDate: string | null;
}

export function useContractCrewCommissionDays(
  kind: ContractCrewKind | null,
  refId: string | null,
  maistryId: string | null,
  enabled = true,
) {
  const supabase = createClient();
  return useQuery<ContractCrewCommissionDays>({
    queryKey: ["contract-crew-commission-days", kind, refId, maistryId],
    enabled: Boolean(enabled && kind && refId),
    staleTime: 30_000,
    queryFn: async ({ signal }): Promise<ContractCrewCommissionDays> => {
      const col = kind === "task_work" ? "task_work_package_id" : "subcontract_id";
      let q = (supabase as any)
        .from("v_daily_attendance_commission")
        .select("date, work_days_eff, daily_earnings, commission_per_day")
        .eq(col, refId)
        .eq("laborer_type", "contract");
      if (maistryId) q = q.neq("laborer_id", maistryId);
      const { data, error } = await withTimeout(
        Promise.resolve(q.abortSignal(signal)),
        TIMEOUTS.QUERY,
        "Crew commission days query timed out. Please retry.",
      );
      if (error) throw error;
      const rows: CommissionDayRow[] = (data ?? []).map((r: any) => ({
        date: String(r.date),
        workDays: Number(r.work_days_eff ?? 1),
        dailyEarnings: Number(r.daily_earnings ?? 0),
        commissionPerDay: Number(r.commission_per_day ?? 50),
      }));
      const earliestDate = rows.reduce<string | null>(
        (min, r) => (min === null || r.date < min ? r.date : min),
        null,
      );
      return { rows, earliestDate };
    },
  });
}
