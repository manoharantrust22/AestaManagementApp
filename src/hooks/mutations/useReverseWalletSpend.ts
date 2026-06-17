"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import {
  reverseWalletSpend,
  type ReverseWalletSpendResult,
  type WalletReverseMode,
} from "@/lib/services/walletSpendReverseService";
import { broadcastWalletChange } from "@/hooks/queries/useEngineerWalletV2";

export interface ReverseWalletSpendArgs {
  spendId: string;
  mode: WalletReverseMode;
  reason?: string | null;
}

/**
 * Reverse a non-salary wallet spend (material/misc/rental/tea) via the
 * reverse_wallet_spend RPC. mode='undo' un-settles the source; mode='company_paid'
 * reclassifies it as company-paid. Atomic + soft-cancel in the RPC. On success,
 * invalidate broadly — it touches the wallet ledger/balance, the source record,
 * and the expense/Hub lists.
 */
export function useReverseWalletSpend() {
  const qc = useQueryClient();
  const supabase = createClient();
  return useMutation<ReverseWalletSpendResult, Error, ReverseWalletSpendArgs>({
    mutationFn: (args) => reverseWalletSpend(supabase, args),
    onSuccess: () => {
      qc.invalidateQueries();
      broadcastWalletChange();
    },
  });
}
