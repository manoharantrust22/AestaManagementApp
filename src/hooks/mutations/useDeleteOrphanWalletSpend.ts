"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import {
  deleteOrphanWalletSpend,
  type DeleteOrphanWalletSpendResult,
} from "@/lib/services/walletSpendReverseService";
import { broadcastWalletChange } from "@/hooks/queries/useEngineerWalletV2";

export interface DeleteOrphanWalletSpendArgs {
  spendId: string;
  reason?: string | null;
}

/**
 * Admin-only HARD delete of an orphan wallet spend (no linked expense/settlement)
 * via the delete_orphan_wallet_spend RPC. For stuck phantom debits only — the RPC
 * refuses any spend still linked to a source. On success, invalidate broadly: it
 * changes the wallet ledger and balance.
 */
export function useDeleteOrphanWalletSpend() {
  const qc = useQueryClient();
  const supabase = createClient();
  return useMutation<
    DeleteOrphanWalletSpendResult,
    Error,
    DeleteOrphanWalletSpendArgs
  >({
    mutationFn: (args) => deleteOrphanWalletSpend(supabase, args),
    onSuccess: () => {
      qc.invalidateQueries();
      broadcastWalletChange();
    },
  });
}
