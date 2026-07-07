"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { settleContractLaborer } from "@/lib/services/settlementService";
import type { SettlementResult } from "@/lib/services/settlementService";
import type { PaymentMode, PaymentChannel } from "@/types/payment.types";
import type { PayerSource } from "@/types/settlement.types";
import { broadcastWalletChange } from "@/hooks/queries/useEngineerWalletV2";

export interface SettleContractLaborerArgs {
  siteId: string;
  kind: "task_work" | "subcontract";
  refId: string;
  laborerId: string;
  laborerName?: string;
  dateFrom: string | null;
  dateTo: string | null;
  amount: number;
  settlementDate?: string;
  paymentMode: PaymentMode;
  paymentChannel: PaymentChannel;
  payerSource: PayerSource;
  customPayerName?: string;
  engineerId?: string;
  proofUrl?: string;
  notes?: string;
  userId: string;
  userName: string;
}

/**
 * Pay one company laborer their net contract wages directly from the pane
 * (direct-pay mode). Invalidates the ledger, the contract payment feed, and the
 * settlement/expense/wallet caches on success.
 */
export function useSettleContractLaborer() {
  const qc = useQueryClient();
  const supabase = createClient();
  return useMutation<SettlementResult, Error, SettleContractLaborerArgs>({
    mutationFn: (args) => settleContractLaborer(supabase, args),
    onSuccess: (_res, args) => {
      qc.invalidateQueries({ queryKey: ["contract-labor-ledger"] });
      qc.invalidateQueries({ queryKey: ["contract-payment-history"] });
      qc.invalidateQueries({ queryKey: ["mesthri-commission-payable"] });
      qc.invalidateQueries({ queryKey: ["settlements"] });
      qc.invalidateQueries({ queryKey: ["payments-ledger"] });
      if (args.paymentChannel === "engineer_wallet") broadcastWalletChange();
    },
  });
}
