import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { ContractClosureReason } from "@/types/trade.types";

/**
 * "End contract early" (contractor left before finishing) + its exact reverse.
 * Server logic lives in `end_subcontract_early` / `reopen_subcontract`
 * (migration 20261108130000); the dialog previews it via `planEarlyClosure`.
 */

export interface EndContractEarlyInput {
  contractId: string;
  /** YYYY-MM-DD — the contractor's last working day. */
  endDate: string;
  reason: ContractClosureReason;
  note?: string | null;
  /** Section ids (or the contract id for its direct remainder) to hand over to In-house. */
  handoverIds: string[];
}

export interface EndContractEarlyResult {
  contract_id: string;
  final_value: number;
  written_off: number;
  handed_over_total: number;
  in_house_id: string | null;
  handovers: Array<{ from: string; to: string; title: string; amount: number }>;
}

function invalidateAfterClosure(qc: ReturnType<typeof useQueryClient>, siteId: string | undefined) {
  for (const key of [
    ["trades", "site", siteId],
    ["trade-reconciliations", "site", siteId],
    ["trade-activity", "site", siteId],
    ["subcontracts", "site", siteId],
    ["mesthri-home-contract", siteId],
  ]) {
    void qc.invalidateQueries({ queryKey: key });
  }
  // Expense bands + the money breakdown read contract links/values.
  void qc.invalidateQueries({
    predicate: (q) => {
      const k0 = String(q.queryKey[0] ?? "");
      return /expense|section-spend|task-work|contract-payments|payments-history/i.test(k0);
    },
  });
  if (typeof BroadcastChannel !== "undefined") {
    const bc = new BroadcastChannel("subcontracts-changed");
    bc.postMessage({ siteId, kind: "closure", at: Date.now() });
    bc.close();
  }
}

export function useEndContractEarly(siteId: string | undefined) {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: EndContractEarlyInput): Promise<EndContractEarlyResult> => {
      const { data, error } = await (supabase as any).rpc("end_subcontract_early", {
        p_contract_id: input.contractId,
        p_end_date: input.endDate,
        p_reason: input.reason,
        p_note: input.note?.trim() || null,
        p_handover_ids: input.handoverIds,
      });
      if (error) throw error;
      return data as EndContractEarlyResult;
    },
    onSuccess: () => invalidateAfterClosure(qc, siteId),
  });
}

export function useReopenContract(siteId: string | undefined) {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (contractId: string): Promise<void> => {
      const { error } = await (supabase as any).rpc("reopen_subcontract", {
        p_contract_id: contractId,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateAfterClosure(qc, siteId),
  });
}
