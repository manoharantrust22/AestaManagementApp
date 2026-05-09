import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { wrapQueryFn } from "@/lib/utils/timeout";
import type {
  ContractActivity,
  ContractReconciliation,
} from "@/types/trade.types";

interface RawReconciliationRow {
  subcontract_id: string;
  quoted_amount: number | string | null;
  amount_paid: number | string | null;
  amount_paid_subcontract_payments: number | string | null;
  amount_paid_settlements: number | string | null;
  implied_labor_value_detailed: number | string | null;
  implied_labor_value_headcount: number | string | null;
}

const num = (v: number | string | null | undefined): number =>
  v == null ? 0 : Number(v);

/**
 * Fetch reconciliation snapshots for every subcontract on a site.
 * Returns a Map keyed by subcontract id for O(1) lookup from TradeCard.
 */
export function useSiteTradeReconciliations(siteId: string | undefined) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["trade-reconciliations", "site", siteId],
    enabled: !!siteId,
    staleTime: 60 * 1000,
    queryFn: wrapQueryFn(async (): Promise<Map<string, ContractReconciliation>> => {
      if (!siteId) return new Map();
      // database.types.ts is stale (regen blocked by unrelated bug in
      // /company/sites/page.tsx). Cast through any until that lands.
      const sb = supabase as any;
      const { data, error } = await sb
        .from("v_subcontract_reconciliation")
        .select(
          "subcontract_id, quoted_amount, amount_paid, amount_paid_subcontract_payments, amount_paid_settlements, implied_labor_value_detailed, implied_labor_value_headcount"
        )
        .eq("site_id", siteId);

      if (error) throw error;

      const map = new Map<string, ContractReconciliation>();
      for (const row of (data ?? []) as unknown as RawReconciliationRow[]) {
        map.set(row.subcontract_id, {
          subcontractId: row.subcontract_id,
          quotedAmount: num(row.quoted_amount),
          amountPaid: num(row.amount_paid),
          amountPaidSubcontractPayments: num(row.amount_paid_subcontract_payments),
          amountPaidSettlements: num(row.amount_paid_settlements),
          impliedLaborValueDetailed: num(row.implied_labor_value_detailed),
          impliedLaborValueHeadcount: num(row.implied_labor_value_headcount),
        });
      }
      return map;
    }, { operationName: "useSiteTradeReconciliations" }),
  });
}

/**
 * Fetch days-worked counts per contract on a site. Two sources:
 *  - attendanceDays: distinct dates in daily_attendance (detailed mode signal)
 *  - paymentDays:    distinct dates in subcontract_payments (mesthri-only signal)
 *
 * The card picks whichever is more meaningful for the contract's mode.
 */
export function useSiteTradeActivity(siteId: string | undefined) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["trade-activity", "site", siteId],
    enabled: !!siteId,
    staleTime: 60 * 1000,
    queryFn: wrapQueryFn(async (): Promise<Map<string, ContractActivity>> => {
      if (!siteId) return new Map();

      const [attendanceRes, paymentsRes] = await Promise.all([
        supabase
          .from("daily_attendance")
          .select("subcontract_id, date")
          .eq("site_id", siteId)
          .eq("is_deleted", false)
          .not("subcontract_id", "is", null),
        // payments are joined to subcontracts; need to scope by site via the sc lookup
        supabase
          .from("subcontract_payments")
          .select("contract_id, payment_date, contract:subcontracts!inner(site_id)")
          .eq("contract.site_id", siteId)
          .eq("is_deleted", false),
      ]);

      if (attendanceRes.error) throw attendanceRes.error;
      if (paymentsRes.error) throw paymentsRes.error;

      const attendanceDates = new Map<string, Set<string>>();
      for (const row of (attendanceRes.data ?? []) as unknown as Array<{
        subcontract_id: string | null;
        date: string;
      }>) {
        if (!row.subcontract_id) continue;
        const set = attendanceDates.get(row.subcontract_id) ?? new Set();
        set.add(row.date);
        attendanceDates.set(row.subcontract_id, set);
      }

      const paymentDates = new Map<string, Set<string>>();
      for (const row of (paymentsRes.data ?? []) as unknown as Array<{
        contract_id: string;
        payment_date: string;
      }>) {
        const set = paymentDates.get(row.contract_id) ?? new Set();
        set.add(row.payment_date);
        paymentDates.set(row.contract_id, set);
      }

      const ids = new Set<string>([
        ...attendanceDates.keys(),
        ...paymentDates.keys(),
      ]);

      const map = new Map<string, ContractActivity>();
      for (const id of ids) {
        map.set(id, {
          subcontractId: id,
          attendanceDays: attendanceDates.get(id)?.size ?? 0,
          paymentDays: paymentDates.get(id)?.size ?? 0,
        });
      }
      return map;
    }, { operationName: "useSiteTradeActivity" }),
  });
}
