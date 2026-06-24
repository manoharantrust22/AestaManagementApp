"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

/**
 * Per-trade counts of workspace data (attendance / market attendance / headcount /
 * settlements / labour payments / tea settlements) linked via that trade's
 * subcontracts. Read from `v_trade_workspace_usage` in ONE query for all trades.
 *
 * Trade Management uses this to lock the "Workspace" toggle ON whenever a trade
 * already holds data — turning a workspace off is hide-only and must never lose data,
 * so we don't even let an owner switch off a trade that has live entries.
 */
export interface TradeWorkspaceUsage {
  trade_category_id: string;
  attendance_count: number;
  market_attendance_count: number;
  headcount_count: number;
  settlement_count: number;
  labor_payment_count: number;
  tea_settlement_count: number;
  total_workspace_rows: number;
}

export function useTradeWorkspaceUsage() {
  const supabase: any = createClient();
  return useQuery({
    queryKey: ["trade-workspace-usage"],
    queryFn: async (): Promise<TradeWorkspaceUsage[]> => {
      const { data, error } = await supabase
        .from("v_trade_workspace_usage")
        .select(
          "trade_category_id, attendance_count, market_attendance_count, headcount_count, settlement_count, labor_payment_count, tea_settlement_count, total_workspace_rows"
        );
      if (error) throw error;
      return (data ?? []) as TradeWorkspaceUsage[];
    },
    staleTime: 60_000,
  });
}
