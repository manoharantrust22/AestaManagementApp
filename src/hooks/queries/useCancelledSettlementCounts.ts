import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { withTimeout, TIMEOUTS } from "@/lib/utils/timeout";
import type { AuditPeriod } from "./useSiteAuditState";

export interface CancelledSettlementCounts {
  contract: number;
  dailyMarket: number;
  total: number;
}

export interface UseCancelledSettlementCountsArgs {
  siteId: string | undefined;
  dateFrom: string | null;
  dateTo: string | null;
  period?: AuditPeriod;
  cutoffDate?: string | null;
}

// Cancelled-only counts for the by-settlement strip + tab badges. Contract vs
// daily-market split mirrors useSettlementsList: a settlement is "contract"
// iff it has any labor_payments row with is_under_contract=true.
export function useCancelledSettlementCounts(
  args: UseCancelledSettlementCountsArgs,
) {
  const supabase = createClient();
  const { siteId, dateFrom, dateTo, period = "all", cutoffDate = null } = args;

  return useQuery<CancelledSettlementCounts>({
    queryKey: [
      "settlement-cancelled-counts",
      siteId,
      dateFrom,
      dateTo,
      period,
      cutoffDate,
    ],
    enabled: Boolean(siteId),
    staleTime: 15_000,
    queryFn: async () => {
      let q = (supabase as any)
        .from("settlement_groups")
        .select(
          `
          id,
          labor_payments!labor_payments_settlement_group_id_fkey ( is_under_contract )
          `,
        )
        .eq("site_id", siteId)
        .eq("is_archived", false)
        .eq("is_cancelled", true);

      if (dateFrom) q = q.gte("settlement_date", dateFrom);
      if (dateTo) q = q.lte("settlement_date", dateTo);

      if (cutoffDate && period === "legacy") {
        q = q.lt("settlement_date", cutoffDate);
      } else if (cutoffDate && period === "current") {
        q = q.gte("settlement_date", cutoffDate);
      }

      const { data, error } = await withTimeout(
        Promise.resolve(q),
        TIMEOUTS.QUERY,
        "Cancelled-settlement count query timed out. Please retry.",
      );
      if (error) throw error;

      let contract = 0;
      let dailyMarket = 0;
      for (const sg of data ?? []) {
        const lps: Array<{ is_under_contract: boolean | null }> = Array.isArray(
          (sg as any).labor_payments,
        )
          ? (sg as any).labor_payments
          : [];
        const isContract = lps.some((lp) => lp.is_under_contract === true);
        if (isContract) contract += 1;
        else dailyMarket += 1;
      }

      return {
        contract,
        dailyMarket,
        total: contract + dailyMarket,
      };
    },
  });
}
