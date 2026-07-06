"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { payMesthriCommission } from "@/lib/services/settlementService";
import type { SettlementResult } from "@/lib/services/settlementService";
import type { PaymentMode, PaymentChannel } from "@/types/payment.types";
import type { PayerSource } from "@/types/settlement.types";
import { broadcastWalletChange } from "@/hooks/queries/useEngineerWalletV2";

export interface PayMesthriCommissionArgs {
  siteId: string;
  collectorLaborerId: string;
  collectorName?: string;
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
 * Pay a mesthri his accrued commission (payment_type='commission' settlement_group).
 * Invalidates the payable + settlement/expense/wallet caches on success.
 */
export function usePayMesthriCommission() {
  const qc = useQueryClient();
  const supabase = createClient();
  return useMutation<SettlementResult, Error, PayMesthriCommissionArgs>({
    mutationFn: (args) => payMesthriCommission(supabase, args),
    onSuccess: (_res, args) => {
      qc.invalidateQueries({ queryKey: ["mesthri-commission-payable"] });
      qc.invalidateQueries({ queryKey: ["contract-labor-ledger"] });
      qc.invalidateQueries({ queryKey: ["settlements"] });
      qc.invalidateQueries({ queryKey: ["payments-ledger"] });
      if (args.paymentChannel === "engineer_wallet") broadcastWalletChange();
    },
  });
}
