/**
 * Engineer Wallet v2 — mutation hooks (deposit / return / cancel).
 *
 * Spend writes are NOT exposed here. They flow through domain settlement services
 * (settlementService, materialService, teaShopService, ...) which call recordSpend()
 * from engineerWalletV2 themselves.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import {
  cancelTransaction,
  recordDeposit,
  recordReturn,
} from "@/lib/services/engineerWalletV2";
import {
  ENGINEER_WALLET_KEYS,
  broadcastWalletChange,
} from "@/hooks/queries/useEngineerWalletV2";
import type {
  RecordDepositInput,
  RecordReturnInput,
} from "@/types/engineer-wallet-v2.types";

function invalidateForEngineer(qc: ReturnType<typeof useQueryClient>, userId: string) {
  // Per-(userId, siteId) balance keys — invalidate the prefix so all sites refresh.
  qc.invalidateQueries({ queryKey: ["engineer-wallet", "balance", userId] });
  // Per-engineer site-balance arrays (office detail panel).
  qc.invalidateQueries({ queryKey: ["engineer-wallet", "site-balances", userId] });
  // Ledger queries are keyed by (userId, filters).
  qc.invalidateQueries({ queryKey: ["engineer-wallet", "ledger", userId] });
  // The engineer picker shows balances per row — refresh those too.
  qc.invalidateQueries({ queryKey: ["engineer-wallet", "enabled-engineers"] });
  broadcastWalletChange();
}

export function useRecordWalletDeposit() {
  const qc = useQueryClient();
  const supabase = createClient();
  return useMutation({
    mutationFn: (input: RecordDepositInput) => recordDeposit(supabase, input),
    onSuccess: (_data, vars) => invalidateForEngineer(qc, vars.engineer_id),
  });
}

export function useRecordWalletReturn() {
  const qc = useQueryClient();
  const supabase = createClient();
  return useMutation({
    mutationFn: (input: RecordReturnInput) => recordReturn(supabase, input),
    onSuccess: (_data, vars) => invalidateForEngineer(qc, vars.engineer_id),
  });
}

export function useCancelWalletTransaction() {
  const qc = useQueryClient();
  const supabase = createClient();
  return useMutation({
    mutationFn: (args: {
      id: string;
      engineer_id: string;
      reason: string;
      cancelled_by: string;
      cancelled_by_user_id: string;
    }) =>
      cancelTransaction(supabase, {
        id: args.id,
        reason: args.reason,
        cancelled_by: args.cancelled_by,
        cancelled_by_user_id: args.cancelled_by_user_id,
      }),
    onSuccess: (_data, vars) => invalidateForEngineer(qc, vars.engineer_id),
  });
}
