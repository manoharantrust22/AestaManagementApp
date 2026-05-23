"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/cache/keys";
import {
  ENGINEER_WALLET_KEYS,
  broadcastWalletChange,
} from "@/hooks/queries/useEngineerWalletV2";
import type {
  SpotPurchaseAllocation,
  SpotPurchasePayload,
  SpotPurchaseResult,
} from "@/types/material.types";

// ----------------------------------------------------------------------------
// Query keys
// ----------------------------------------------------------------------------

const SPOT_PURCHASES_ROOT = ["spot-purchases"] as const;

const UNALLOCATED_KEY = (siteGroupId: string | null) =>
  [...SPOT_PURCHASES_ROOT, "unallocated", siteGroupId] as const;

const ALLOCATIONS_KEY = (batchId: string | null) =>
  [...SPOT_PURCHASES_ROOT, "allocations", batchId] as const;

// ----------------------------------------------------------------------------
// useCreateSpotPurchase — record_spot_purchase RPC
// ----------------------------------------------------------------------------

/**
 * Records a spot purchase via the atomic `record_spot_purchase(payload jsonb)`
 * RPC. The RPC creates draft vendor/material rows if needed, inserts the
 * material_purchase_expenses batch + items, upserts stock_inventory + a
 * stock_transactions row, and debits the engineer wallet via
 * atomic_record_wallet_spend. On success we invalidate the broad query keys
 * that any of those writes could have touched.
 */
export function useCreateSpotPurchase() {
  const qc = useQueryClient();
  const supabase = createClient();
  return useMutation<SpotPurchaseResult, Error, SpotPurchasePayload>({
    mutationFn: async (payload) => {
      const { data, error } = await (supabase as any).rpc(
        "record_spot_purchase",
        { payload },
      );
      if (error) throw error;
      return data as SpotPurchaseResult;
    },
    onSuccess: () => {
      // Stock + inventory: useBatchUsage / useMaterialRequests invalidate
      // ["stock-inventory"] as a bare prefix — match that shape.
      qc.invalidateQueries({ queryKey: ["stock-inventory"] });
      // Wallet balances + pools + ledger across this engineer/site.
      qc.invalidateQueries({ queryKey: ENGINEER_WALLET_KEYS.all });
      broadcastWalletChange();
      // Anything else that reads spot purchases or batches.
      qc.invalidateQueries({ queryKey: SPOT_PURCHASES_ROOT });
      qc.invalidateQueries({ queryKey: queryKeys.materialPurchases.all });
      // Catalogs: draft vendor/material may have been auto-inserted.
      qc.invalidateQueries({ queryKey: queryKeys.materials.all });
      qc.invalidateQueries({ queryKey: queryKeys.vendors.all });
    },
  });
}

// ----------------------------------------------------------------------------
// useUnallocatedSpotBatches — batches awaiting final allocation
// ----------------------------------------------------------------------------

export interface UnallocatedSpotBatch {
  batch_id: string;
  ref_code: string;
  purchase_date: string;
  total_amount: number;
  remaining_qty: number | null;
  age_days: number;
}

/**
 * Fetches spot purchase batches for a site group that still have provisional
 * (is_final=false) allocation rows. Used by the Office reconciliation surface
 * (Task M) to flag batches that need finalization. Filters in-memory to
 * batches >= 7 days old OR with no remaining quantity — the remaining_qty
 * column is not currently tracked at the batch level, so the second predicate
 * is a no-op until a future migration adds it (kept here to match the plan).
 */
export function useUnallocatedSpotBatches(
  siteGroupId: string | null | undefined,
) {
  const supabase = createClient();
  return useQuery({
    queryKey: UNALLOCATED_KEY(siteGroupId ?? null),
    enabled: !!siteGroupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("material_purchase_expenses")
        .select(
          `id, ref_code, purchase_date, total_amount, site_group_id,
           spot_purchase_allocations!inner(is_final)`,
        )
        .eq("purchase_type", "spot")
        .eq("site_group_id", siteGroupId as string)
        .eq("spot_purchase_allocations.is_final", false);

      if (error) throw error;
      const today = Date.now();
      const rows = (data ?? []) as unknown as Array<{
        id: string;
        ref_code: string;
        purchase_date: string;
        total_amount: number | string;
      }>;
      return rows
        .map((row) => {
          const ageDays = Math.floor(
            (today - new Date(row.purchase_date).getTime()) /
              (1000 * 60 * 60 * 24),
          );
          return {
            batch_id: row.id,
            ref_code: row.ref_code,
            purchase_date: row.purchase_date,
            total_amount: Number(row.total_amount),
            remaining_qty: null,
            age_days: ageDays,
          } satisfies UnallocatedSpotBatch;
        })
        .filter((b) => b.age_days >= 7 || (b.remaining_qty ?? 0) <= 0);
    },
  });
}

// ----------------------------------------------------------------------------
// useFinalizeSpotPurchaseAllocation — finalize_spot_purchase_allocation RPC
// ----------------------------------------------------------------------------

/**
 * Locks provisional allocations on a spot batch. Server validates percentages
 * sum to 100 (±0.01). Invalidates spot-purchase reads and inter-site
 * settlements (downstream reconciliation consumes the now-final rows).
 */
export function useFinalizeSpotPurchaseAllocation() {
  const qc = useQueryClient();
  const supabase = createClient();
  return useMutation<
    void,
    Error,
    {
      batchId: string;
      allocations: Array<{ site_id: string; percentage: number }>;
    }
  >({
    mutationFn: async ({ batchId, allocations }) => {
      const { error } = await (supabase as any).rpc(
        "finalize_spot_purchase_allocation",
        {
          p_batch_id: batchId,
          p_allocations: allocations,
        },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SPOT_PURCHASES_ROOT });
      qc.invalidateQueries({ queryKey: queryKeys.interSiteSettlements.all });
    },
  });
}

// ----------------------------------------------------------------------------
// useBatchAllocations — read allocations for one batch
// ----------------------------------------------------------------------------

/**
 * Fetches the spot_purchase_allocations rows for a single batch. Used by the
 * supervisor finalize dialog (Task L) to preload the provisional split.
 */
export function useBatchAllocations(batchId: string | null | undefined) {
  const supabase = createClient();
  return useQuery({
    queryKey: ALLOCATIONS_KEY(batchId ?? null),
    enabled: !!batchId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("spot_purchase_allocations")
        .select("*")
        .eq("batch_id", batchId as string);
      if (error) throw error;
      return (data ?? []) as SpotPurchaseAllocation[];
    },
  });
}
