"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient, ensureFreshSession } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { softDeleteSubcontractPayment } from "@/lib/services/subcontractService";
import { broadcastWalletChange } from "@/hooks/queries/useEngineerWalletV2";

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

/**
 * Remove a wrongly-recorded contract/section payment. Refunds the engineer's wallet
 * when the payment was wallet-funded (see softDeleteSubcontractPayment).
 *
 * `contractId` is only used to target the cache — the payment itself is found by id.
 */
export function useDeleteSubcontractPayment() {
  const queryClient = useQueryClient();
  const { userProfile } = useAuth();

  return useMutation({
    mutationFn: async ({
      paymentId,
      reason,
    }: {
      paymentId: string;
      contractId: string;
      reason: string;
    }) => {
      await ensureFreshSession();
      const supabase = createClient();
      const result = await softDeleteSubcontractPayment(supabase, {
        paymentId,
        reason,
        // FK targets public.users.id — the profile id, NOT the auth uid.
        userId: userProfile?.id ?? "",
      });
      if (!result.success) {
        throw new Error(result.error || "Failed to remove the payment.");
      }
      return result;
    },
    onSuccess: (result, { contractId }) => {
      // The card itself.
      queryClient.invalidateQueries({ queryKey: ["contract-payments", contractId] });
      queryClient.invalidateQueries({ queryKey: ["subcontract-payments", contractId] });
      // The rollup pane sums subcontract_payments where is_deleted = false. Its key
      // carries a package-id fragment, so invalidate the whole prefix.
      queryClient.invalidateQueries({ queryKey: ["section-spend"] });
      queryClient.invalidateQueries({ queryKey: ["trade-reconciliations"] });
      queryClient.invalidateQueries({ queryKey: ["trade-activity"] });
      // A wallet refund moves the balance and the ledger, which live outside these keys.
      if (result.walletReversed) {
        queryClient.invalidateQueries();
        broadcastWalletChange();
      }
    },
  });
}
