"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/cache/keys";

// ----------------------------------------------------------------------------
// Payload types — match record_historical_batch(payload jsonb) RPC contract.
// ----------------------------------------------------------------------------

export type HistoricalKind = "own" | "group";
export type HistoricalPaymentStatus = "settled" | "pending";
export type HistoricalPaidBy = "office" | "wallet" | "site";

export interface HistoricalRecordItem {
  /** Existing material id. Omit when creating a draft via new_material. */
  material_id?: string;
  /** Mint a draft material on insert. Used when material_id is absent. */
  new_material?: { name: string; unit?: string; category_id?: string };
  qty: number;
  /** Total amount for this line in INR. Per-unit rate = amount / qty (server-derived). */
  amount: number;
}

export interface HistoricalRecord {
  purchase_date: string; // YYYY-MM-DD; server validates 2025-11-09 <= d <= 2026-05-09
  vendor: { id?: string; name?: string };
  items: HistoricalRecordItem[];
  /**
   * Grand total actually paid in INR = Σ item.amount + transport_cost (or an
   * editable override). Server stores this in material_purchase_expenses.total_amount.
   * When omitted, the server derives it from the item amounts + transport_cost.
   */
  amount?: number;
  /**
   * Record-level transportation/delivery charge in INR for the whole entry.
   * Stored in material_purchase_expenses.transport_cost; NOT folded into per-item rates.
   */
  transport_cost?: number;
  kind: HistoricalKind;
  /** Required when kind='group'. Must sum to 100. */
  group_split?: { site_id: string; pct: number }[];
  payment_status: HistoricalPaymentStatus;
  paid_by?: HistoricalPaidBy;
  /** Total quantity consumed at backfill time across all items. Drives stage. */
  used_qty?: number;
  payment_mode?: "cash" | "upi" | "bank_transfer" | "cheque" | "credit";
  section?: string;
  notes?: string;
}

export interface HistoricalBatchPayload {
  site_id: string;
  records: HistoricalRecord[];
}

export interface HistoricalBatchResult {
  batch_ids: string[];
  drafts_created: { vendors: number; materials: number };
  count: number;
}

// ----------------------------------------------------------------------------
// Hook
// ----------------------------------------------------------------------------

/**
 * Wraps the atomic `record_historical_batch(payload jsonb)` RPC. The RPC
 * inserts an array of back-dated material purchase records in one transaction
 * (drafts + expenses + items + group allocations). On success we invalidate
 * any cache that could surface the new rows: material threads, spot-purchase
 * queries (which now include historical), material purchases, plus the
 * vendor + material catalogs (since drafts may have been minted).
 *
 * Does NOT invalidate engineer wallet keys — back-dated entries deliberately
 * skip the wallet ledger.
 */
export function useRecordHistoricalBatch() {
  const qc = useQueryClient();
  const supabase = createClient();
  return useMutation<HistoricalBatchResult, Error, HistoricalBatchPayload>({
    mutationFn: async (payload) => {
      const { data, error } = await (supabase as any).rpc(
        "record_historical_batch",
        { payload },
      );
      if (error) throw error;
      return data as HistoricalBatchResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["spot-purchases"] });
      qc.invalidateQueries({ queryKey: queryKeys.materialPurchases.all });
      qc.invalidateQueries({ queryKey: queryKeys.materials.all });
      qc.invalidateQueries({ queryKey: queryKeys.vendors.all });
    },
  });
}
