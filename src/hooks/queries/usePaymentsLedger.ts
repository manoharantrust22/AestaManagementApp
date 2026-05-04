import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { withTimeout, TIMEOUTS } from "@/lib/utils/timeout";
import type { PaymentsLedgerRow } from "@/components/payments/PaymentsLedger";
import type { AuditPeriod } from "./useSiteAuditState";

export interface UsePaymentsLedgerArgs {
  siteId: string | undefined;
  dateFrom: string | null;
  dateTo: string | null;
  status?: "all" | "pending" | "completed";
  type?: "all" | "daily-market" | "weekly";
  /** Period scope. Defaults to 'all'. Non-auditing sites ignore this. */
  period?: AuditPeriod;
}

export function usePaymentsLedger(args: UsePaymentsLedgerArgs) {
  const supabase = createClient();
  const { siteId, dateFrom, dateTo, status = "all", type = "all", period = "all" } = args;
  return useQuery<PaymentsLedgerRow[]>({
    queryKey: ["payments-ledger", siteId, dateFrom, dateTo, status, type, period],
    enabled: Boolean(siteId),
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await withTimeout(
        Promise.resolve((supabase as any).rpc("get_payments_ledger", {
          p_site_id:   siteId,
          p_date_from: dateFrom,
          p_date_to:   dateTo,
          p_status:    status,
          p_type:      type,
          p_period:    period,
        })),
        TIMEOUTS.QUERY,
        "Payments ledger query timed out. Please retry.",
      );
      if (error) throw error;
      const rows = (data ?? []) as Array<{
        id: string;
        settlement_ref: string | null;
        row_type: "daily-market" | "weekly";
        subtype: string | null;
        date_or_week_start: string;
        week_end: string | null;
        for_label: string;
        amount: number | string;
        is_paid: boolean;
        is_pending: boolean;
        laborer_id: string | null;
        period: string | null;
      }>;
      return rows.map<PaymentsLedgerRow>((r) => ({
        id:            r.id,
        settlementRef: r.settlement_ref,
        type:          r.row_type,
        subtype:       r.subtype ?? r.row_type,
        date:          r.date_or_week_start,
        weekEnd:       r.week_end ?? undefined,
        forLabel:      r.for_label,
        amount:        Number(r.amount) || 0,
        isPaid:        Boolean(r.is_paid),
        isPending:     Boolean(r.is_pending),
        laborerId:     r.laborer_id ?? undefined,
        siteId:        siteId as string,
        period:        (r.period === "legacy" ? "legacy" : "current"),
      }));
    },
  });
}
