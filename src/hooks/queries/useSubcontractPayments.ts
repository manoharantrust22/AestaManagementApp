import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface SubcontractPayment {
  id: string;
  amount: number;
  paymentDate: string;
  paymentMode: string | null;
  paymentType: string | null;
  payerName: string | null;
}

interface RawPaymentRow {
  id: string;
  amount: number | string | null;
  payment_date: string;
  payment_mode: string | null;
  payment_type: string | null;
  payer_name: string | null;
}

/**
 * Payment history for one task work (subcontract), newest first — feeds the detail
 * pane's "Payments" card. Note the column is `contract_id` (not subcontract_id).
 */
export function useSubcontractPayments(contractId: string | undefined) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["subcontract-payments", contractId],
    enabled: !!contractId,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<SubcontractPayment[]> => {
      if (!contractId) return [];
      const { data, error } = await (supabase as any)
        .from("subcontract_payments")
        .select("id, amount, payment_date, payment_mode, payment_type, payer_name")
        .eq("contract_id", contractId)
        .eq("is_deleted", false)
        .order("payment_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as RawPaymentRow[]).map((r) => ({
        id: r.id,
        amount: Number(r.amount ?? 0),
        paymentDate: r.payment_date,
        paymentMode: r.payment_mode,
        paymentType: r.payment_type,
        payerName: r.payer_name,
      }));
    },
  });
}
