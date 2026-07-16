/**
 * useContractLaborLedgerWeekly
 *
 * Every week a contract's crew worked, one row per (week, laborer), from
 * get_contract_labor_ledger_weekly. Powers the Week tab's list of separate weeks.
 *
 * gross/commission/net are the WEEK's earnings. netTotal/netPaid/netUnpaid are
 * PROJECT-scoped — payments are not recorded against a week. Read-only.
 */

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { withTimeout, TIMEOUTS } from "@/lib/utils/timeout";
import type { ContractLedgerKind } from "./useContractLaborLedger";
import type { WeeklyLedgerRow } from "@/lib/workforce/ledgerWeeks";

function toNumber(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function useContractLaborLedgerWeekly(
  kind: ContractLedgerKind | null,
  refId: string | null,
  enabled = true,
) {
  const supabase = createClient();
  return useQuery<WeeklyLedgerRow[]>({
    queryKey: ["contract-labor-ledger-weekly", kind, refId],
    enabled: Boolean(enabled && kind && refId),
    staleTime: 30_000,
    queryFn: async ({ signal }): Promise<WeeklyLedgerRow[]> => {
      const { data, error } = await withTimeout(
        Promise.resolve(
          (supabase as any)
            .rpc("get_contract_labor_ledger_weekly", { p_kind: kind, p_ref_id: refId })
            .abortSignal(signal),
        ),
        TIMEOUTS.QUERY,
        "Weekly contract labor ledger query timed out. Please retry.",
      );
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        weekStart: String(r.week_start ?? ""),
        laborerId: String(r.laborer_id ?? ""),
        laborerName: String(r.laborer_name ?? "Unknown"),
        roleName: String(r.role_name ?? "Unknown"),
        manDays: toNumber(r.man_days),
        dayCount: toNumber(r.day_count),
        gross: toNumber(r.gross),
        commission: toNumber(r.commission),
        net: toNumber(r.net),
        netTotal: toNumber(r.net_total),
        netPaid: toNumber(r.net_paid),
        netUnpaid: toNumber(r.net_unpaid),
        isMesthri: Boolean(r.is_mesthri),
      }));
    },
  });
}
