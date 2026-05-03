import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export type ContractPaymentType =
  | "weekly_advance"
  | "milestone"
  | "part_payment"
  | "final_settlement";

export type PaymentMode = "cash" | "upi" | "bank_transfer" | "cheque" | "other";

export type PaymentChannel =
  | "via_site_engineer"
  | "mesthri_at_office"
  | "company_direct_online";

export interface ContractPayment {
  id: string;
  contractId: string;
  amount: number;
  paymentDate: string;
  paymentType: ContractPaymentType;
  paymentMode: PaymentMode | null;
  paymentChannel: PaymentChannel | null;
  referenceNumber: string | null;
  comments: string | null;
  balanceAfterPayment: number | null;
  createdAt: string;
}

interface RawPaymentRow {
  id: string;
  contract_id: string;
  amount: number | string;
  payment_date: string;
  payment_type: ContractPaymentType;
  payment_mode: PaymentMode | null;
  payment_channel: PaymentChannel | null;
  reference_number: string | null;
  comments: string | null;
  balance_after_payment: number | string | null;
  created_at: string;
}

/**
 * List non-deleted payments for a single contract, sorted by date desc.
 * Used by the inline payments list and recent-activity preview on the trade card.
 */
export function useContractPayments(contractId: string | undefined) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["contract-payments", contractId],
    enabled: !!contractId,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<ContractPayment[]> => {
      if (!contractId) return [];
      const sb = supabase as any;
      const { data, error } = await sb
        .from("subcontract_payments")
        .select(
          "id, contract_id, amount, payment_date, payment_type, payment_mode, payment_channel, reference_number, comments, balance_after_payment, created_at"
        )
        .eq("contract_id", contractId)
        .eq("is_deleted", false)
        .order("payment_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as RawPaymentRow[]).map((r) => ({
        id: r.id,
        contractId: r.contract_id,
        amount: Number(r.amount ?? 0),
        paymentDate: r.payment_date,
        paymentType: r.payment_type,
        paymentMode: r.payment_mode,
        paymentChannel: r.payment_channel,
        referenceNumber: r.reference_number,
        comments: r.comments,
        balanceAfterPayment:
          r.balance_after_payment == null ? null : Number(r.balance_after_payment),
        createdAt: r.created_at,
      }));
    },
  });
}
