import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { withTimeout, TIMEOUTS } from "@/lib/utils/timeout";
import type { PaymentScopeSummary } from "@/types/payment.types";
import type { AuditPeriod } from "./useSiteAuditState";

export function usePaymentSummary(
  siteId: string | undefined,
  dateFrom: string | null,
  dateTo: string | null,
  /** Period scope. Defaults to 'all'. Non-auditing sites ignore this. */
  period: AuditPeriod = "all",
) {
  const supabase = createClient();
  return useQuery<PaymentScopeSummary>({
    queryKey: ["payment-summary", siteId, dateFrom, dateTo, period],
    enabled: Boolean(siteId),
    queryFn: async () => {
      const { data, error } = await withTimeout(
        Promise.resolve((supabase as any).rpc("get_payment_summary", {
          p_site_id:   siteId,
          p_date_from: dateFrom,
          p_date_to:   dateTo,
          p_period:    period,
        })),
        TIMEOUTS.QUERY,
        "Payment summary query timed out. Please retry.",
      );
      if (error) throw error;
      const r = (data ?? [])[0] ?? {};
      return {
        pendingAmount:       Number(r.pending_amount)        || 0,
        pendingDatesCount:   Number(r.pending_dates_count)   || 0,
        paidAmount:          Number(r.paid_amount)           || 0,
        paidCount:           Number(r.paid_count)            || 0,
        dailyMarketAmount:   Number(r.daily_market_amount)   || 0,
        dailyMarketCount:    Number(r.daily_market_count)    || 0,
        weeklyAmount:        Number(r.weekly_amount)         || 0,
        weeklyCount:         Number(r.weekly_count)          || 0,
      };
    },
    staleTime: 30_000,
  });
}
