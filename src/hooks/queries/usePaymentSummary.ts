import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { PaymentScopeSummary } from "@/types/payment.types";

export function usePaymentSummary(
  siteId: string | undefined,
  dateFrom: string | null,
  dateTo: string | null,
) {
  const supabase = createClient();
  return useQuery<PaymentScopeSummary>({
    queryKey: ["payment-summary", siteId, dateFrom, dateTo],
    enabled: Boolean(siteId),
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_payment_summary", {
        p_site_id:   siteId,
        p_date_from: dateFrom,
        p_date_to:   dateTo,
      });
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
