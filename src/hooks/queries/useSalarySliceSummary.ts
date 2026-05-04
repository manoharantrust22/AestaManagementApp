import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { withTimeout, TIMEOUTS } from "@/lib/utils/timeout";
import type { AuditPeriod } from "./useSiteAuditState";

export interface SalarySliceSummary {
  wagesDue: number;
  settlementsTotal: number;
  advancesTotal: number;
  paidToWeeks: number;
  futureCredit: number;
  mestriOwed: number;
  weeksCount: number;
  settlementCount: number;
  advanceCount: number;
}

export interface UseSalarySliceSummaryArgs {
  siteId: string | undefined;
  subcontractId: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  /** Period scope. Defaults to 'all'. Non-auditing sites ignore this. */
  period?: AuditPeriod;
}

const ZERO: SalarySliceSummary = {
  wagesDue: 0,
  settlementsTotal: 0,
  advancesTotal: 0,
  paidToWeeks: 0,
  futureCredit: 0,
  mestriOwed: 0,
  weeksCount: 0,
  settlementCount: 0,
  advanceCount: 0,
};

export function useSalarySliceSummary(args: UseSalarySliceSummaryArgs) {
  const supabase = createClient();
  const { siteId, subcontractId, dateFrom, dateTo, period = "all" } = args;
  return useQuery<SalarySliceSummary>({
    queryKey: ["salary-slice-summary", siteId, subcontractId, dateFrom, dateTo, period],
    enabled: Boolean(siteId),
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await withTimeout(
        Promise.resolve((supabase as any).rpc("get_salary_slice_summary", {
          p_site_id:        siteId,
          p_subcontract_id: subcontractId,
          p_date_from:      dateFrom,
          p_date_to:        dateTo,
          p_period:         period,
        })),
        TIMEOUTS.QUERY,
        "Salary summary query timed out. Please retry.",
      );
      if (error) throw error;
      const row = (data && data.length > 0 ? data[0] : null) as any;
      if (!row) return ZERO;
      return {
        wagesDue:         Number(row.wages_due) || 0,
        settlementsTotal: Number(row.settlements_total) || 0,
        advancesTotal:    Number(row.advances_total) || 0,
        paidToWeeks:      Number(row.paid_to_weeks) || 0,
        futureCredit:     Number(row.future_credit) || 0,
        mestriOwed:       Number(row.mestri_owed) || 0,
        weeksCount:       Number(row.weeks_count) || 0,
        settlementCount:  Number(row.settlement_count) || 0,
        advanceCount:     Number(row.advance_count) || 0,
      };
    },
  });
}
