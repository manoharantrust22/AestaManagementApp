/**
 * useContractPaymentHistory
 *
 * One unified, dated payment feed for a contract (task-work package or subcontract):
 * maistry lump payments (task_work_payments) + per-laborer net settlements + maistry
 * commission payouts (both settlement_groups). Powers the pane's Payments section so all
 * "money out for this contract" lives in one list regardless of pay-mode.
 *
 * Calls get_contract_payment_history (migration 20260707120200). The `source` field
 * tells the client which reverse/delete path to use.
 */

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { withTimeout, TIMEOUTS } from "@/lib/utils/timeout";
import type { ContractLedgerKind } from "./useContractLaborLedger";

export type ContractPaymentSource =
  | "package_payment"
  | "laborer_settlement"
  | "commission";

export interface ContractPaymentRow {
  source: ContractPaymentSource;
  refId: string;
  paymentDate: string | null;
  amount: number;
  payeeName: string;
  detail: string;
  paymentMode: string | null;
  payerSource: string | null;
  payerName: string | null;
  isWallet: boolean;
  reference: string | null;
  proofUrl: string | null;
  /** When the payment was RECORDED (created_at), distinct from the user-entered paymentDate. */
  loggedAt: string | null;
  /** created_by_name — who entered the payment. */
  recordedBy: string | null;
  /** Free-text note captured when recording the payment. */
  notes: string | null;
}

function toNumber(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function useContractPaymentHistory(
  kind: ContractLedgerKind | null,
  refId: string | null,
  enabled = true,
) {
  const supabase = createClient();
  return useQuery<ContractPaymentRow[]>({
    queryKey: ["contract-payment-history", kind, refId],
    enabled: Boolean(enabled && kind && refId),
    staleTime: 15_000,
    queryFn: async ({ signal }): Promise<ContractPaymentRow[]> => {
      const { data, error } = await withTimeout(
        Promise.resolve(
          (supabase as any)
            .rpc("get_contract_payment_history", { p_kind: kind, p_ref_id: refId })
            .abortSignal(signal),
        ),
        TIMEOUTS.QUERY,
        "Contract payment history query timed out. Please retry.",
      );
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        source: r.source as ContractPaymentSource,
        refId: String(r.ref_id ?? ""),
        paymentDate: r.payment_date ?? null,
        amount: toNumber(r.amount),
        payeeName: String(r.payee_name ?? ""),
        detail: String(r.detail ?? ""),
        paymentMode: r.payment_mode ?? null,
        payerSource: r.payer_source ?? null,
        payerName: r.payer_name ?? null,
        isWallet: Boolean(r.is_wallet),
        reference: r.reference ?? null,
        proofUrl: r.proof_url ?? null,
        loggedAt: r.logged_at ?? null,
        recordedBy: r.recorded_by ?? null,
        notes: r.notes ?? null,
      }));
    },
  });
}
