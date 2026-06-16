"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { wrapQueryFn } from "@/lib/utils/timeout";
import type { AuditAllocation } from "@/lib/wallet/walletSettlementAudit";

export interface WalletAuditSpend {
  amount: number;
  transaction_date: string;
  payment_mode: string | null;
  recorded_by: string | null;
  created_at: string;
  edited_at: string | null;
  edited_by: string | null;
  edit_reason: string | null;
  settlement_reference: string | null;
  settlement_group_id: string | null;
}

export interface WalletSettlementAudit {
  spend: WalletAuditSpend;
  allocations: AuditAllocation[];
}

/**
 * Audit of a wallet-funded settlement: the engineer-wallet spend row plus its
 * FIFO source allocations (each joined to the funding deposit's date). Used by
 * the wallet-settlement audit dialog opened from the Miscellaneous list.
 *
 * Pass the misc expense's `engineer_transaction_id` (the spend id); `null` keeps
 * the query dormant. RLS already lets site members read both tables.
 */
export function useWalletSettlementAudit(spendId: string | null) {
  const supabase = createClient();
  return useQuery<WalletSettlementAudit | null>({
    queryKey: spendId
      ? ["wallet-settlement-audit", spendId]
      : ["wallet-settlement-audit", "_disabled"],
    enabled: !!spendId,
    staleTime: 30_000,
    queryFn: wrapQueryFn(
      async () => {
        const [{ data: spend, error: spendErr }, { data: allocs, error: allocErr }] =
          await Promise.all([
            (supabase.from("site_engineer_transactions") as any)
              .select(
                "amount, transaction_date, payment_mode, recorded_by, created_at, edited_at, edited_by, edit_reason, settlement_reference, settlement_group_id"
              )
              .eq("id", spendId as string)
              .maybeSingle(),
            ((supabase as any).from("engineer_wallet_spend_allocations"))
              .select(
                "payer_source, payer_name, amount, kind, deposit:site_engineer_transactions!deposit_id(transaction_date)"
              )
              .eq("spend_id", spendId as string),
          ]);
        if (spendErr) throw spendErr;
        if (allocErr) throw allocErr;
        if (!spend) return null;

        const allocations: AuditAllocation[] = (allocs ?? []).map(
          (a: Record<string, any>) => ({
            payer_source: a.payer_source as string,
            payer_name: (a.payer_name as string | null) ?? null,
            amount: Number(a.amount ?? 0),
            kind: a.kind as "source" | "pending",
            deposit_date:
              (a.deposit?.transaction_date as string | undefined) ?? null,
          })
        );

        return {
          spend: { ...spend, amount: Number(spend.amount ?? 0) } as WalletAuditSpend,
          allocations,
        };
      },
      { operationName: "useWalletSettlementAudit" }
    ),
  });
}
