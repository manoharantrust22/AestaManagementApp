"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import {
  reverseSettlement,
  type ReverseSettlementResult,
} from "@/lib/services/settlementService";
import { broadcastWalletChange } from "@/hooks/queries/useEngineerWalletV2";

export interface ReverseSettlementArgs {
  settlementGroupId: string;
  reason?: string | null;
  /** The spend's engineer (user_id) — kept for callers; invalidation is broad. */
  engineerId?: string | null;
}

/**
 * Reverse a whole settlement via the reverse_settlement RPC (atomic: resets
 * attendance, soft-cancels the linked wallet debit, cancels the group, frees the
 * idempotency key). Authorization (recorder or office/admin) is enforced inside
 * the RPC. On success, invalidate broadly — the reversal touches the wallet
 * ledger/balance, settlement/expense lists and attendance.
 */
export function useReverseSettlement() {
  const qc = useQueryClient();
  const supabase = createClient();
  return useMutation<ReverseSettlementResult, Error, ReverseSettlementArgs>({
    mutationFn: (args) =>
      reverseSettlement(supabase, {
        settlementGroupId: args.settlementGroupId,
        reason: args.reason ?? null,
      }),
    onSuccess: () => {
      // Reverse is a rare, deliberate action; a full invalidation guarantees the
      // cancelled spend disappears and the restored balance + settlement/expense
      // lists are fresh everywhere.
      qc.invalidateQueries();
      broadcastWalletChange();
    },
  });
}
