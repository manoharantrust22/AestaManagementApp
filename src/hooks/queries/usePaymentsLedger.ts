import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { PaymentsLedgerRow } from "@/components/payments/PaymentsLedger";

export interface UsePaymentsLedgerArgs {
  siteId: string | undefined;
  dateFrom: string | null;
  dateTo: string | null;
  status?: "all" | "pending" | "completed";
  type?: "all" | "daily-market" | "weekly";
}

export function usePaymentsLedger(args: UsePaymentsLedgerArgs) {
  const supabase = createClient();
  const { siteId, dateFrom, dateTo, status = "all", type = "all" } = args;
  return useQuery<PaymentsLedgerRow[]>({
    queryKey: ["payments-ledger", siteId, dateFrom, dateTo, status, type],
    enabled: Boolean(siteId),
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_payments_ledger", {
        p_site_id:   siteId,
        p_date_from: dateFrom,
        p_date_to:   dateTo,
        p_status:    status,
        p_type:      type,
      });
      if (error) throw error;
      const rows = (data ?? []) as Array<{
        id: string;
        settlement_ref: string | null;
        row_type: "daily-market" | "weekly";
        date_or_week_start: string;
        week_end: string | null;
        for_label: string;
        amount: number | string;
        is_paid: boolean;
        is_pending: boolean;
        laborer_id: string | null;
      }>;
      return rows.map<PaymentsLedgerRow>((r) => ({
        id:            r.id,
        settlementRef: r.settlement_ref,
        type:          r.row_type,
        date:          r.date_or_week_start,
        weekEnd:       r.week_end ?? undefined,
        forLabel:      r.for_label,
        amount:        Number(r.amount) || 0,
        isPaid:        Boolean(r.is_paid),
        isPending:     Boolean(r.is_pending),
        laborerId:     r.laborer_id ?? undefined,
        siteId:        siteId as string,
      }));
    },
  });
}
