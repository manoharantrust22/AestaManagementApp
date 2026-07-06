/**
 * useContractLaborLedger
 *
 * Per-company-laborer earnings ledger for ONE contract (task-work package or
 * subcontract) over a date window. Powers the "who earned what + mesthri commission"
 * panel in the trade workspace and the settlement drawer.
 *
 * Calls get_contract_labor_ledger (migration 20260705120200): for each company
 * laborer (laborer_type='contract') who worked the contract in the window, returns
 * man-days, gross, mesthri commission (locked snapshot if the day is already settled,
 * else live estimate), net, and an is_mesthri flag. Read-only; no money movement.
 */

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { withTimeout, TIMEOUTS } from "@/lib/utils/timeout";

export type ContractLedgerKind = "task_work" | "subcontract";

export interface ContractLaborLedgerRow {
  laborerId: string;
  laborerName: string;
  roleName: string;
  manDays: number;
  dayCount: number;
  gross: number;
  commission: number;
  net: number;
  isMesthri: boolean;
}

export interface ContractLaborLedger {
  rows: ContractLaborLedgerRow[];
  totalGross: number;
  totalCommission: number;
  totalNet: number;
  /** The mesthri's own labour value (his own rows, no commission). */
  mesthriOwnLabour: number;
  mesthriName: string | null;
}

function toNumber(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function useContractLaborLedger(
  kind: ContractLedgerKind | null,
  refId: string | null,
  dateFrom: string | null,
  dateTo: string | null,
  enabled = true,
) {
  const supabase = createClient();
  return useQuery<ContractLaborLedger>({
    queryKey: ["contract-labor-ledger", kind, refId, dateFrom, dateTo],
    enabled: Boolean(enabled && kind && refId),
    staleTime: 30_000,
    queryFn: async ({ signal }): Promise<ContractLaborLedger> => {
      const { data, error } = await withTimeout(
        Promise.resolve(
          (supabase as any)
            .rpc("get_contract_labor_ledger", {
              p_kind: kind,
              p_ref_id: refId,
              p_date_from: dateFrom,
              p_date_to: dateTo,
            })
            .abortSignal(signal),
        ),
        TIMEOUTS.QUERY,
        "Contract labor ledger query timed out. Please retry.",
      );
      if (error) throw error;
      const rows: ContractLaborLedgerRow[] = (data ?? []).map((r: any) => ({
        laborerId: String(r.laborer_id ?? ""),
        laborerName: String(r.laborer_name ?? "Unknown"),
        roleName: String(r.role_name ?? "Unknown"),
        manDays: toNumber(r.man_days),
        dayCount: toNumber(r.day_count),
        gross: toNumber(r.gross),
        commission: toNumber(r.commission),
        net: toNumber(r.net),
        isMesthri: Boolean(r.is_mesthri),
      }));
      const mesthriRow = rows.find((r) => r.isMesthri) ?? null;
      return {
        rows,
        totalGross: rows.reduce((s, r) => s + r.gross, 0),
        totalCommission: rows.reduce((s, r) => s + r.commission, 0),
        totalNet: rows.reduce((s, r) => s + r.net, 0),
        mesthriOwnLabour: mesthriRow?.gross ?? 0,
        mesthriName: mesthriRow?.laborerName ?? null,
      };
    },
  });
}
