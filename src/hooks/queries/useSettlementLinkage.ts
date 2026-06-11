"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { wrapQueryFn } from "@/lib/utils/timeout";

/** The settlement a wallet spend belongs to, for the Spend details dialog. */
export interface SettlementLinkage {
  group_id: string;
  settlement_reference: string;
  settlement_date: string;
  actual_payment_date: string | null;
  total_amount: number;
  payment_type: string | null;
  payment_channel: string | null;
  laborer_count: number | null;
  payer_source: string | null;
  payer_name: string | null;
  is_cancelled: boolean;
  created_by_name: string | null;
  created_at: string;
}

/**
 * Resolve a wallet spend to its settlement_group via the get_settlement_linkage
 * RPC. Prefer the spend's own settlement_group_id; fall back to the spend id
 * (historical rows created before the spend carried settlement_group_id). Returns
 * null when the spend is not a settlement debit.
 *
 * Pass both as null to keep the query dormant (e.g. dialog closed / non-settlement
 * spend). The ids are the gate, so callers don't manage a separate enabled flag.
 */
export function useSettlementLinkage(
  groupId: string | null,
  spendId: string | null
) {
  const supabase = createClient();
  const enabled = !!(groupId || spendId);
  return useQuery<SettlementLinkage | null>({
    queryKey: enabled
      ? ["settlement-linkage", groupId ?? "g0", spendId ?? "s0"]
      : ["settlement-linkage", "_disabled"],
    enabled,
    staleTime: 60_000,
    queryFn: wrapQueryFn(
      async () => {
        // Cast: this RPC is newer than the committed generated Supabase types.
        const { data, error } = await (supabase.rpc as any)(
          "get_settlement_linkage",
          { p_group_id: groupId, p_spend_id: spendId }
        );
        if (error) throw error;
        return (data as SettlementLinkage | null) ?? null;
      },
      { operationName: "useSettlementLinkage" }
    ),
  });
}
