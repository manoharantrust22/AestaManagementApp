"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/cache/keys";
import { wrapQueryFn } from "@/lib/utils/timeout";
import type {
  BatchUsageRecord,
  BatchUsageRecordWithDetails,
  BatchSettlementSummary,
  BatchSiteAllocation,
  BatchVariantSummary,
  RecordBatchUsageFormData,
  InitiateBatchSettlementFormData,
  BatchSettlementResult,
} from "@/types/material.types";
import type { GroupStockBatchAllocation } from "@/lib/utils/fifoAllocator";

// ============================================
// HELPER FUNCTIONS
// ============================================

function isQueryError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: string; message?: string };
  return (
    err.code === "42P01" ||
    err.code === "PGRST" ||
    (err.message?.includes("relation") ?? false) ||
    (err.message?.includes("does not exist") ?? false) ||
    (err.message?.includes("Could not find") ?? false)
  );
}

// ============================================
// FETCH BATCH USAGE RECORDS
// ============================================

/**
 * Fetch all usage records for a specific batch
 */
export function useBatchUsageRecords(batchRefCode: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.batchUsage.byBatch(batchRefCode || ""),
    queryFn: wrapQueryFn(async () => {
      if (!batchRefCode) return [] as BatchUsageRecordWithDetails[];

      try {
        const { data, error } = await (supabase as any)
          .from("batch_usage_records")
          .select(`
            *,
            usage_site:sites!batch_usage_records_usage_site_id_fkey(id, name),
            material:materials(id, name, code, unit),
            brand:material_brands(id, brand_name)
          `)
          .eq("batch_ref_code", batchRefCode)
          .order("usage_date", { ascending: false });

        if (error) {
          if (isQueryError(error)) {
            console.warn("Batch usage records query failed:", error.message);
            return [] as BatchUsageRecordWithDetails[];
          }
          throw error;
        }
        return (data || []) as BatchUsageRecordWithDetails[];
      } catch (err) {
        if (isQueryError(err)) {
          console.warn("Batch usage records query failed:", err);
          return [] as BatchUsageRecordWithDetails[];
        }
        throw err;
      }
    }, { operationName: "useBatchUsageRecords" }),
    enabled: !!batchRefCode,
  });
}

/**
 * Fetch usage records for a site
 */
export function useSiteBatchUsageRecords(siteId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.batchUsage.bySite(siteId || ""),
    queryFn: async () => {
      if (!siteId) return [] as BatchUsageRecordWithDetails[];

      try {
        const { data, error } = await (supabase as any)
          .from("batch_usage_records")
          .select(`
            *,
            usage_site:sites!batch_usage_records_usage_site_id_fkey(id, name),
            material:materials(id, name, code, unit),
            brand:material_brands(id, brand_name)
          `)
          .eq("usage_site_id", siteId)
          .order("usage_date", { ascending: false });

        if (error) {
          if (isQueryError(error)) {
            console.warn("Site batch usage records query failed:", error.message);
            return [] as BatchUsageRecordWithDetails[];
          }
          throw error;
        }
        return (data || []) as BatchUsageRecordWithDetails[];
      } catch (err) {
        if (isQueryError(err)) {
          console.warn("Site batch usage records query failed:", err);
          return [] as BatchUsageRecordWithDetails[];
        }
        throw err;
      }
    },
    enabled: !!siteId,
  });
}

/**
 * Fetch all usage records for a group
 */
export function useGroupBatchUsageRecords(groupId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.batchUsage.byGroup(groupId || ""),
    queryFn: async () => {
      if (!groupId) return [] as BatchUsageRecordWithDetails[];

      try {
        const { data, error } = await (supabase as any)
          .from("batch_usage_records")
          .select(`
            *,
            usage_site:sites!batch_usage_records_usage_site_id_fkey(id, name),
            material:materials(id, name, code, unit),
            brand:material_brands(id, brand_name)
          `)
          .eq("site_group_id", groupId)
          .order("usage_date", { ascending: false });

        if (error) {
          if (isQueryError(error)) {
            console.warn("Group batch usage records query failed:", error.message);
            return [] as BatchUsageRecordWithDetails[];
          }
          throw error;
        }
        return (data || []) as BatchUsageRecordWithDetails[];
      } catch (err) {
        if (isQueryError(err)) {
          console.warn("Group batch usage records query failed:", err);
          return [] as BatchUsageRecordWithDetails[];
        }
        throw err;
      }
    },
    enabled: !!groupId,
  });
}

// ============================================
// BATCH SETTLEMENT SUMMARY
// ============================================

/**
 * Get settlement summary for a batch including site-wise allocations
 */
export function useBatchSettlementSummary(batchRefCode: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.batchUsage.summary(batchRefCode || ""),
    queryFn: async () => {
      if (!batchRefCode) return null;

      try {
        // Call the database function
        const { data, error } = await (supabase as any).rpc("get_batch_settlement_summary", {
          p_batch_ref_code: batchRefCode,
        });

        if (error) {
          if (isQueryError(error)) {
            console.warn("Batch settlement summary query failed:", error.message);
            return null;
          }
          throw error;
        }

        if (!data || data.length === 0) return null;

        const row = data[0];
        return {
          batch_ref_code: row.batch_ref_code,
          paying_site_id: row.paying_site_id,
          paying_site_name: row.paying_site_name,
          total_amount: Number(row.total_amount),
          original_qty: Number(row.original_qty),
          used_qty: Number(row.used_qty),
          remaining_qty: Number(row.remaining_qty),
          site_allocations: (row.site_allocations || []) as BatchSiteAllocation[],
        } as BatchSettlementSummary;
      } catch (err) {
        if (isQueryError(err)) {
          console.warn("Batch settlement summary query failed:", err);
          return null;
        }
        throw err;
      }
    },
    enabled: !!batchRefCode,
  });
}

// ============================================
// BATCH VARIANT SUMMARY (per-variant breakdown)
// ============================================

/**
 * Per-(material, brand) original/used/remaining for a group-stock batch.
 * Used by the variant-aware Log Usage dialog and the hub variant chips.
 * Returns [] when batch is not group_stock or RPC isn't deployed yet.
 */
export function useBatchVariantSummary(batchRefCode: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["batch-variant-summary", batchRefCode || ""],
    queryFn: async () => {
      if (!batchRefCode) return [] as BatchVariantSummary[];

      try {
        const { data, error } = await (supabase as any).rpc("get_batch_variant_summary", {
          p_batch_ref_code: batchRefCode,
        });

        if (error) {
          if (isQueryError(error)) {
            console.warn("Batch variant summary RPC unavailable:", error.message);
            return [] as BatchVariantSummary[];
          }
          throw error;
        }

        return ((data || []) as Array<{
          material_id: string;
          brand_id: string | null;
          material_name: string;
          brand_name: string | null;
          unit: string;
          unit_cost: number | string;
          original_qty: number | string;
          used_qty: number | string;
          remaining_qty: number | string;
        }>).map((row) => ({
          material_id: row.material_id,
          brand_id: row.brand_id,
          material_name: row.material_name,
          brand_name: row.brand_name,
          unit: row.unit,
          unit_cost: Number(row.unit_cost),
          original_qty: Number(row.original_qty),
          used_qty: Number(row.used_qty),
          remaining_qty: Number(row.remaining_qty),
        })) as BatchVariantSummary[];
      } catch (err) {
        if (isQueryError(err)) {
          console.warn("Batch variant summary query failed:", err);
          return [] as BatchVariantSummary[];
        }
        throw err;
      }
    },
    enabled: !!batchRefCode,
  });
}

// ============================================
// RECORD BATCH USAGE MUTATION
// ============================================

/**
 * Record usage from a batch for a specific site
 */
export function useRecordBatchUsage() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    retry: false, // Not idempotent - modifies stock and usage records
    mutationFn: async (data: RecordBatchUsageFormData & { created_by?: string }) => {
      if (!data.material_id) {
        throw new Error("material_id is required to record batch usage (variant-aware)");
      }
      // Call the database function — variant-aware signature (2026-05-25)
      const { data: result, error } = await (supabase as any).rpc("record_batch_usage", {
        p_batch_ref_code: data.batch_ref_code,
        p_usage_site_id: data.usage_site_id,
        p_material_id: data.material_id,
        p_brand_id: data.brand_id ?? null,
        p_quantity: data.quantity,
        p_usage_date: data.usage_date,
        p_work_description: data.work_description || null,
        p_created_by: data.created_by || null,
      });

      if (error) {
        throw new Error(error.message);
      }

      return result as string; // Returns the usage ID
    },
    onSuccess: (_, variables) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({
        queryKey: queryKeys.batchUsage.byBatch(variables.batch_ref_code),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.batchUsage.bySite(variables.usage_site_id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.batchUsage.summary(variables.batch_ref_code),
      });
      queryClient.invalidateQueries({
        queryKey: ["batch-variant-summary", variables.batch_ref_code],
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.materialPurchases.byRefCode(variables.batch_ref_code),
      });
      // Invalidate batches list
      queryClient.invalidateQueries({
        queryKey: ["material-purchases", "batches"],
      });
      // Auto-complete may create self-use expense, so invalidate expenses
      queryClient.invalidateQueries({
        queryKey: ["material-purchases"],
      });
      queryClient.invalidateQueries({
        queryKey: ["all-expenses"],
      });
      queryClient.invalidateQueries({
        queryKey: ["expenses"],
      });
      // Hub threads consume per-variant data
      queryClient.invalidateQueries({
        queryKey: ["material-threads"],
      });
      // Hub thread is composed of granular sub-queries — invalidate the ones a
      // usage record changes so the INVENTORY·STOCK, INTER-SITE and usage-log
      // blocks refresh immediately (mirrors useDeleteBatchUsage / useUpdateBatchUsage).
      queryClient.invalidateQueries({ queryKey: ["usage-history"] });
      queryClient.invalidateQueries({ queryKey: ["batch-usage-summary"] });
      queryClient.invalidateQueries({ queryKey: ["stock-inventory"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.materialStock.all });
      // Per-GRN usage bar (Hub) reads batch_usage_delivery_allocations.
      queryClient.invalidateQueries({ queryKey: ["delivery-usage-allocations"] });
    },
  });
}

// ============================================
// PROCESS BATCH SETTLEMENT MUTATION
// ============================================

/**
 * Process settlement for a batch - creates settlement record and debtor expense
 * Now supports optional settlement_amount for bargaining (vendor negotiations)
 */
export function useProcessBatchSettlement() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (data: InitiateBatchSettlementFormData & {
      created_by?: string;
      settlement_amount?: number; // Optional: Override amount for bargaining
    }) => {
      // Call the database function with optional settlement_amount for bargaining
      const { data: result, error } = await (supabase as any).rpc("process_batch_settlement", {
        p_batch_ref_code: data.batch_ref_code,
        p_debtor_site_id: data.debtor_site_id,
        p_payment_mode: data.payment_mode,
        p_payment_date: data.payment_date,
        p_payment_reference: data.payment_reference || null,
        p_settlement_amount: data.settlement_amount || null, // bargaining amount
        p_created_by: data.created_by || null,
        // Debtor's payer source for this settlement — captured on the BEXP-* row.
        p_settlement_payer_source: data.settlement_payer_source || null,
        p_settlement_payer_name: data.settlement_payer_name || null,
        // Phase 4: per-source breakdown (2-3 rows). When non-null, the RPC
        // validates and overrides settlement_payer_source/_name above.
        p_payer_source_split: data.payer_source_split ?? null,
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!result || result.length === 0) {
        throw new Error("Settlement processing failed - no result returned");
      }

      const row = result[0];
      return {
        settlement_id: row.settlement_id,
        debtor_expense_id: row.debtor_expense_id,
        settlement_code: row.settlement_code,
      } as BatchSettlementResult;
    },
    onSuccess: (result, variables) => {
      // Invalidate all relevant queries
      queryClient.invalidateQueries({
        queryKey: queryKeys.batchUsage.byBatch(variables.batch_ref_code),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.batchUsage.bySite(variables.debtor_site_id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.batchUsage.summary(variables.batch_ref_code),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.materialPurchases.byRefCode(variables.batch_ref_code),
      });
      // Invalidate settlements
      queryClient.invalidateQueries({
        queryKey: ["inter-site-settlements"],
      });
      // Invalidate material purchases
      queryClient.invalidateQueries({
        queryKey: ["material-purchases"],
      });
      // Invalidate batches
      queryClient.invalidateQueries({
        queryKey: ["material-purchases", "batches"],
      });
      // Invalidate all expenses (debtor expense now appears in v_all_expenses)
      queryClient.invalidateQueries({
        queryKey: ["all-expenses"],
      });
      queryClient.invalidateQueries({
        queryKey: ["expenses"],
      });
    },
  });
}

// ============================================
// DELETE BATCH USAGE MUTATION
// ============================================

/**
 * Delete a batch usage record (only if not yet settled)
 */
export function useDeleteBatchUsage() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (data: { usageId: string; batchRefCode: string; siteId: string }) => {
      // First check if it's settled
      const { data: record, error: fetchError } = await (supabase as any)
        .from("batch_usage_records")
        .select("settlement_status, quantity, is_self_use, unit_cost")
        .eq("id", data.usageId)
        .single();

      if (fetchError) throw new Error(fetchError.message);

      if (record.settlement_status === "settled") {
        throw new Error("Cannot delete settled usage record");
      }

      // Check batch status BEFORE deleting (needed for self-use cleanup)
      const { data: batchBefore } = await (supabase as any)
        .from("material_purchase_expenses")
        .select("status, remaining_qty, paying_site_id, site_id")
        .eq("ref_code", data.batchRefCode)
        .single();

      const wasCompleted = batchBefore?.status === "completed";

      // Delete the record — the DB trigger (update_batch_quantities_on_usage_change)
      // will automatically recalculate used_qty, remaining_qty, self_used_qty,
      // self_used_amount, and status from remaining batch_usage_records
      const { error: deleteError } = await (supabase as any)
        .from("batch_usage_records")
        .delete()
        .eq("id", data.usageId);

      if (deleteError) throw new Error(deleteError.message);

      // ── Reverse the stock side ──────────────────────────────────────────
      // Recording usage from the inventory page writes THREE places: the
      // batch_usage_records row (whose AFTER-DELETE trigger above already
      // fixed the material_purchase_expenses roll-up), a manual
      // stock_inventory.current_qty decrement, and a stock_transactions
      // 'usage' audit row (reference_type='batch_usage_records'). The trigger
      // does NOT touch stock_inventory/stock_transactions, so without this the
      // Hub INVENTORY·STOCK block — which reads current_qty (Remaining) and the
      // sum of usage transactions (Used) — stays stuck on "used / 0 remaining"
      // even after a refresh. Reverse exactly what the audit row recorded,
      // keyed by reference_id, so a usage recorded via the record_batch_usage
      // RPC (which never touched stock) is left untouched — no over-restore.
      const { data: usageTxs } = await (supabase as any)
        .from("stock_transactions")
        .select("id, inventory_id, quantity")
        .eq("reference_type", "batch_usage_records")
        .eq("reference_id", data.usageId);

      for (const tx of (usageTxs ?? []) as Array<{
        id: string;
        inventory_id: string | null;
        quantity: number | string;
      }>) {
        const restoreQty = Math.abs(Number(tx.quantity ?? 0));
        if (restoreQty > 0 && tx.inventory_id) {
          const { data: inv } = await (supabase as any)
            .from("stock_inventory")
            .select("id, current_qty")
            .eq("id", tx.inventory_id)
            .maybeSingle();
          if (inv) {
            // available_qty is a GENERATED column derived from current_qty — it
            // must not be written directly; it re-derives on this update.
            await (supabase as any)
              .from("stock_inventory")
              .update({
                current_qty: Number(inv.current_qty ?? 0) + restoreQty,
                updated_at: new Date().toISOString(),
              })
              .eq("id", inv.id);
          }
        }
        // Drop the orphaned audit row so "Used" (Σ usage tx) reflects reality.
        await (supabase as any)
          .from("stock_transactions")
          .delete()
          .eq("id", tx.id);
      }

      // If batch was completed and now the trigger has re-opened it,
      // clean up auto-created self-use expenses
      if (wasCompleted) {
        // Re-fetch batch to see new status after trigger
        const { data: batchAfter } = await (supabase as any)
          .from("material_purchase_expenses")
          .select("status")
          .eq("ref_code", data.batchRefCode)
          .single();

        if (batchAfter && batchAfter.status !== "completed") {
          const payingSiteId = batchBefore.paying_site_id || batchBefore.site_id;

          // Delete auto-created self-use expense
          const { data: selfUseExpenses } = await (supabase as any)
            .from("material_purchase_expenses")
            .select("id")
            .eq("original_batch_code", data.batchRefCode)
            .eq("settlement_reference", "SELF-USE")
            .eq("site_id", payingSiteId);

          if (selfUseExpenses && selfUseExpenses.length > 0) {
            for (const exp of selfUseExpenses) {
              // Items cascade-delete due to FK constraint
              await (supabase as any)
                .from("material_purchase_expenses")
                .delete()
                .eq("id", exp.id);
            }
          }

          // Delete auto-created self-use batch_usage_records
          // (trigger will fire again and recalculate)
          await (supabase as any)
            .from("batch_usage_records")
            .delete()
            .eq("batch_ref_code", data.batchRefCode)
            .eq("is_self_use", true)
            .eq("work_description", "Self-use (batch completion)");
        }
      }

      return { success: true };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.batchUsage.byBatch(variables.batchRefCode),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.batchUsage.bySite(variables.siteId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.batchUsage.summary(variables.batchRefCode),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.materialPurchases.byRefCode(variables.batchRefCode),
      });
      queryClient.invalidateQueries({
        queryKey: ["material-purchases", "batches"],
      });
      // Undo of auto-complete may delete self-use expense, so invalidate expenses
      queryClient.invalidateQueries({
        queryKey: ["material-purchases"],
      });
      queryClient.invalidateQueries({
        queryKey: ["all-expenses"],
      });
      queryClient.invalidateQueries({
        queryKey: ["expenses"],
      });
      // Also invalidate settlements since batch status affects settlement display
      queryClient.invalidateQueries({
        queryKey: ["inter-site-settlements"],
      });
      // Hub surfaces — the usage-log list, the variant chips, and the
      // INVENTORY·STOCK block (driven by stock_inventory + batch_usage_summary)
      // all read state this delete just changed. Without these the Hub stays
      // stale until a manual reload.
      queryClient.invalidateQueries({ queryKey: ["usage-history"] });
      queryClient.invalidateQueries({ queryKey: ["batch-variant-summary"] });
      queryClient.invalidateQueries({ queryKey: ["batch-usage-summary"] });
      queryClient.invalidateQueries({ queryKey: ["stock-inventory"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.batchUsage.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.materialStock.all });
      queryClient.invalidateQueries({ queryKey: ["material-usage"] });
      // Per-GRN usage bar (Hub) reads batch_usage_delivery_allocations; the FK
      // cascade-deleted its rows, so the cached allocation map is now stale.
      queryClient.invalidateQueries({ queryKey: ["delivery-usage-allocations"] });
      // Usage Ledger pages and UsageDetailDrawer
      queryClient.invalidateQueries({ queryKey: ["material-usage-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["usage-ledger-detail"] });
    },
  });
}

// ============================================
// UPDATE BATCH USAGE MUTATION
// ============================================

/**
 * Update a batch usage record (only if not yet settled)
 * Supports editing work_description and quantity
 */
export function useUpdateBatchUsage() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    retry: false,
    mutationFn: async (data: {
      usageId: string;
      batchRefCode: string;
      siteId: string;
      updates: {
        quantity?: number;
        work_description?: string;
        usage_site_id?: string;
      };
    }) => {
      // 1. Fetch the current record
      const { data: record, error: fetchError } = await (supabase as any)
        .from("batch_usage_records")
        .select(
          "quantity, unit_cost, settlement_status, is_self_use, usage_site_id"
        )
        .eq("id", data.usageId)
        .single();

      if (fetchError) throw new Error(fetchError.message);
      if (record.settlement_status === "settled") {
        throw new Error("Cannot edit settled usage record");
      }
      if (record.settlement_status === "in_settlement") {
        throw new Error(
          "Cannot edit a usage record that is part of a settlement. Reverse the settlement first."
        );
      }

      // 1b. If the consuming site is changing, route through the SECURITY DEFINER
      //     RPC. It bypasses the RLS WITH CHECK that blocks moving a row to a
      //     sibling site the caller isn't directly assigned to, and recomputes
      //     is_self_use / settlement_status atomically (the AFTER UPDATE trigger
      //     then recomputes the batch self_used totals). It also handles quantity
      //     and work_description in the same call, so we return early.
      const siteChanged =
        data.updates.usage_site_id !== undefined &&
        data.updates.usage_site_id !== record.usage_site_id;

      if (siteChanged) {
        const { data: rpcResult, error: rpcError } = await (
          supabase as any
        ).rpc("reassign_batch_usage", {
          p_usage_id: data.usageId,
          p_new_usage_site_id: data.updates.usage_site_id,
          p_new_quantity: data.updates.quantity ?? null,
          p_work_description: data.updates.work_description ?? null,
        });
        if (rpcError) throw new Error(rpcError.message);
        return { success: true, result: rpcResult };
      }

      // 2. Build update payload
      const updatePayload: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (data.updates.work_description !== undefined) {
        updatePayload.work_description = data.updates.work_description;
      }

      const quantityDelta =
        data.updates.quantity !== undefined
          ? data.updates.quantity - Number(record.quantity)
          : 0;

      if (data.updates.quantity !== undefined && quantityDelta !== 0) {
        // Validate stock availability if increasing
        if (quantityDelta > 0) {
          const { data: batch } = await (supabase as any)
            .from("material_purchase_expenses")
            .select("remaining_qty")
            .eq("ref_code", data.batchRefCode)
            .single();

          if (batch && Number(batch.remaining_qty) < quantityDelta) {
            throw new Error(
              `Not enough batch stock. Available: ${batch.remaining_qty}`
            );
          }
        }

        updatePayload.quantity = data.updates.quantity;
        // total_cost is GENERATED AS (quantity * unit_cost) in DB

        // Update batch quantities
        await (supabase as any)
          .from("material_purchase_expenses")
          .update({
            used_qty: (supabase as any).rpc ? undefined : undefined, // handled below
          })
          .eq("ref_code", data.batchRefCode);

        // Recalculate batch used_qty and remaining_qty
        const { data: batchInfo } = await (supabase as any)
          .from("material_purchase_expenses")
          .select("original_qty, used_qty, remaining_qty")
          .eq("ref_code", data.batchRefCode)
          .single();

        if (batchInfo) {
          const newUsedQty = Number(batchInfo.used_qty) + quantityDelta;
          const newRemainingQty = Number(batchInfo.original_qty) - newUsedQty;
          await (supabase as any)
            .from("material_purchase_expenses")
            .update({
              used_qty: newUsedQty,
              remaining_qty: newRemainingQty,
              status:
                newRemainingQty <= 0
                  ? "completed"
                  : newUsedQty > 0
                  ? "partial_used"
                  : "recorded",
              updated_at: new Date().toISOString(),
            })
            .eq("ref_code", data.batchRefCode);
        }

        // Update stock_inventory
        await (supabase as any)
          .from("stock_inventory")
          .update({
            current_qty: (supabase as any).sql
              ? undefined
              : undefined, // handled below
          })
          .eq("batch_code", data.batchRefCode);

        // Adjust stock_inventory.current_qty
        const { data: inventory } = await (supabase as any)
          .from("stock_inventory")
          .select("id, current_qty")
          .eq("batch_code", data.batchRefCode)
          .maybeSingle();

        if (inventory) {
          await (supabase as any)
            .from("stock_inventory")
            .update({
              current_qty: Math.max(
                Number(inventory.current_qty) - quantityDelta,
                0
              ),
              updated_at: new Date().toISOString(),
            })
            .eq("id", inventory.id);
        }

        // Update self_used_qty/amount if self-use record
        if (record.is_self_use) {
          const { data: batchForSelf } = await (supabase as any)
            .from("material_purchase_expenses")
            .select("self_used_qty, self_used_amount")
            .eq("ref_code", data.batchRefCode)
            .single();

          if (batchForSelf) {
            await (supabase as any)
              .from("material_purchase_expenses")
              .update({
                self_used_qty:
                  Number(batchForSelf.self_used_qty || 0) + quantityDelta,
                self_used_amount:
                  Number(batchForSelf.self_used_amount || 0) +
                  quantityDelta * Number(record.unit_cost),
                updated_at: new Date().toISOString(),
              })
              .eq("ref_code", data.batchRefCode);
          }
        }
      }

      // 3. Update the batch_usage_records entry
      const { error: updateError } = await (supabase as any)
        .from("batch_usage_records")
        .update(updatePayload)
        .eq("id", data.usageId);

      if (updateError) throw new Error(updateError.message);
      return { success: true };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.batchUsage.byBatch(variables.batchRefCode),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.batchUsage.bySite(variables.siteId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.batchUsage.summary(variables.batchRefCode),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.materialPurchases.byRefCode(variables.batchRefCode),
      });
      queryClient.invalidateQueries({
        queryKey: ["material-purchases", "batches"],
      });
      queryClient.invalidateQueries({
        queryKey: ["material-purchases"],
      });
      queryClient.invalidateQueries({
        queryKey: ["inter-site-settlements"],
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.batchUsage.all,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.materialStock.all,
      });
      queryClient.invalidateQueries({
        queryKey: ["stock-inventory"],
      });
      // Also invalidate material usage for inventory page
      queryClient.invalidateQueries({
        queryKey: ["material-usage"],
      });
      // Hub surfaces (usage-log list, variant chips, group usage summary).
      queryClient.invalidateQueries({ queryKey: ["usage-history"] });
      queryClient.invalidateQueries({ queryKey: ["batch-variant-summary"] });
      queryClient.invalidateQueries({ queryKey: ["batch-usage-summary"] });
      // Per-GRN usage bar (Hub): a qty edit or site reassignment re-runs the
      // FIFO allocation, so the delivery→qty map must refresh.
      queryClient.invalidateQueries({ queryKey: ["delivery-usage-allocations"] });
      // Usage Ledger pages and UsageDetailDrawer
      queryClient.invalidateQueries({ queryKey: ["material-usage-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["usage-ledger-detail"] });
    },
  });
}

/**
 * Correct ONLY the brand on a batch usage record via the SECURITY DEFINER RPC
 * `set_batch_usage_brand`. Brand is reporting-only (settlement matches on
 * material_id, never brand_id), so this is safe even on settled / in-settlement
 * rows — the RPC touches only brand_id and never any financial field. Passing
 * `brandId: null` clears the brand back to "Brand not set".
 */
export function useSetBatchUsageBrand() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    retry: false,
    mutationFn: async (data: {
      usageId: string;
      batchRefCode: string;
      siteId: string;
      brandId: string | null;
    }) => {
      const { error } = await (supabase as any).rpc("set_batch_usage_brand", {
        p_usage_id: data.usageId,
        p_brand_id: data.brandId,
      });
      if (error) throw new Error(error.message);
      return { success: true };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.batchUsage.byBatch(variables.batchRefCode),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.batchUsage.bySite(variables.siteId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.batchUsage.summary(variables.batchRefCode),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.batchUsage.all });
      // Hub surfaces (usage-log list, variant chips, group usage summary).
      queryClient.invalidateQueries({ queryKey: ["usage-history"] });
      queryClient.invalidateQueries({ queryKey: ["batch-variant-summary"] });
      queryClient.invalidateQueries({ queryKey: ["batch-usage-summary"] });
      // Usage Ledger pages and UsageDetailDrawer
      queryClient.invalidateQueries({ queryKey: ["material-usage-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["usage-ledger-detail"] });
    },
  });
}

// ============================================
// PUSH GROUP SELF-USE EXPENSE (MANUAL)
// ============================================

/**
 * Manually post a fully-self-used group batch's cost as the paying site's own
 * material expense (settlement_reference='SELF-USE').
 *
 * WHY MANUAL: the silent DB trigger that used to auto-post this on batch
 * completion (trigger_auto_self_use_on_batch_complete) was dropped in migration
 * 20260601130000 — auto-posting was hard to unwind during the hand-entered
 * historical-backfill workflow. This hook drives the deliberate, user-initiated
 * replacement from the Material Hub. The RPC is a thin SECURITY DEFINER wrapper
 * around the idempotent create_self_use_expense_if_needed() engine (same checks:
 * group_stock, fully consumed, no pending cross-site usage, self_used_amount>0,
 * idempotent) and returns the resulting expense so the Hub can deep-link to it.
 */
export function usePushSelfUseExpense() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    // Idempotent server-side, but a hard error shouldn't auto-retry behind the
    // user's back — surface it in place instead (preserve-form-state guidance).
    retry: false,
    mutationFn: async (data: { batchRefCode: string; siteId: string }) => {
      const { data: result, error } = await (supabase as any).rpc(
        "push_group_self_use_expense",
        { p_batch_ref_code: data.batchRefCode }
      );
      if (error) throw new Error(error.message);
      // RPC RETURNS TABLE → array of rows; take the single (latest) row.
      const row = Array.isArray(result) ? result[0] : result;
      if (!row?.ref_code) {
        throw new Error(
          "This batch isn't eligible to post as a self-use expense yet (it must be fully consumed by its own site with no pending inter-site usage)."
        );
      }
      return row as { expense_id: string; ref_code: string; amount: number };
    },
    onSuccess: (_, variables) => {
      // The new own_site expense changes the all-expenses ledger + the batch's
      // Hub state. Invalidate the REAL composing keys — note ["material-threads"]
      // is a dead no-op (the Hub thread is built from granular sub-queries), so
      // we hit usage-history / batch-usage-summary / stock-inventory / expenses
      // directly, mirroring useRecordBatchUsage / useDeleteBatchUsage.
      queryClient.invalidateQueries({
        queryKey: queryKeys.batchUsage.summary(variables.batchRefCode),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.materialPurchases.byRefCode(variables.batchRefCode),
      });
      queryClient.invalidateQueries({ queryKey: ["material-purchases"] });
      queryClient.invalidateQueries({ queryKey: ["all-expenses"] });
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["usage-history"] });
      queryClient.invalidateQueries({ queryKey: ["batch-usage-summary"] });
      queryClient.invalidateQueries({ queryKey: ["stock-inventory"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.materialStock.all });
    },
  });
}

// ============================================
// FETCH BATCHES WITH USAGE FOR GROUP
// ============================================

/**
 * Get all batches for a group with their usage breakdown
 * This is useful for the Group Purchases overview
 */
export function useBatchesWithUsage(groupId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: [...queryKeys.batchUsage.byGroup(groupId || ""), "with-batches"],
    queryFn: async () => {
      if (!groupId) return [];

      try {
        // Get all group stock purchases
        const { data: batches, error: batchError } = await (supabase as any)
          .from("material_purchase_expenses")
          .select(`
            *,
            paying_site:sites!material_purchase_expenses_paying_site_id_fkey(id, name),
            vendor:vendors(id, name),
            items:material_purchase_expense_items(
              *,
              material:materials(id, name, code, unit, weight_per_unit),
              brand:material_brands(id, brand_name, variant_name)
            ),
            purchase_order:purchase_orders(
              items:purchase_order_items(
                id, material_id, brand_id, quantity, unit_price,
                material:materials(id, name, code, unit),
                brand:material_brands(id, brand_name, variant_name)
              )
            )
          `)
          .eq("site_group_id", groupId)
          .eq("purchase_type", "group_stock")
          .order("purchase_date", { ascending: false });

        if (batchError) {
          if (isQueryError(batchError)) {
            console.warn("Batches query failed:", batchError.message);
            return [];
          }
          throw batchError;
        }

        if (!batches || batches.length === 0) return [];

        // Get usage for all batches
        const batchRefCodes = batches.map((b: any) => b.ref_code);
        const { data: usageRecords, error: usageError } = await (supabase as any)
          .from("batch_usage_records")
          .select(`
            id,
            batch_ref_code,
            usage_site_id,
            quantity,
            total_cost,
            is_self_use,
            settlement_status,
            usage_date,
            usage_site:sites!batch_usage_records_usage_site_id_fkey(id, name)
          `)
          .in("batch_ref_code", batchRefCodes);

        if (usageError && !isQueryError(usageError)) {
          throw usageError;
        }

        // Get actual delivered quantities from deliveries/delivery_items via purchase_order_id.
        // group_stock_inventory is skipped when the expense row already exists (advance-pay flow),
        // so deliveries is the only reliable source of truth for delivery progress.
        const poIds = batches
          .map((b: any) => b.purchase_order_id)
          .filter(Boolean);

        const deliveredByPO = new Map<string, number>();
        if (poIds.length > 0) {
          const { data: deliveryData } = await (supabase as any)
            .from("deliveries")
            .select(`
              po_id,
              delivery_items(accepted_qty)
            `)
            .in("po_id", poIds)
            .eq("delivery_status", "delivered");

          (deliveryData || []).forEach((del: any) => {
            const prev = deliveredByPO.get(del.po_id) || 0;
            const delQty = (del.delivery_items || []).reduce(
              (s: number, di: any) => s + Number(di.accepted_qty || 0),
              0
            );
            deliveredByPO.set(del.po_id, prev + delQty);
          });
        }

        // Group usage by batch
        const usageByBatch = new Map<string, any[]>();
        (usageRecords || []).forEach((u: any) => {
          const existing = usageByBatch.get(u.batch_ref_code) || [];
          existing.push(u);
          usageByBatch.set(u.batch_ref_code, existing);
        });

        // Combine batches with their usage
        return batches.map((batch: any) => {
          const batchUsage = usageByBatch.get(batch.ref_code) || [];

          // Use expense items if available; fall back to PO items for batches with missing items
          const effectiveItems = (batch.items || []).length > 0
            ? batch.items
            : (batch.purchase_order?.items || []);

          // Calculate original quantity from batch items
          const original_quantity = effectiveItems.reduce(
            (sum: number, item: any) => sum + Number(item.quantity || 0),
            0
          );

          // Calculate used quantity from batch_usage_records
          const used_quantity = batchUsage.reduce(
            (sum: number, u: any) => sum + Number(u.quantity || 0),
            0
          );

          // Calculate remaining quantity
          const remaining_quantity = original_quantity - used_quantity;

          // Aggregate usage by site
          const siteUsageMap = new Map<string, {
            site_id: string;
            site_name: string;
            quantity_used: number;
            amount: number;
            is_payer: boolean;
            settlement_status: string;
            usage_records: Array<{ id: string; quantity: number; total_cost: number; usage_date: string; settlement_status: string }>;
          }>();

          batchUsage.forEach((u: any) => {
            const recordDetail = {
              id: u.id,
              quantity: Number(u.quantity),
              total_cost: Number(u.total_cost),
              usage_date: u.usage_date,
              settlement_status: u.settlement_status,
            };
            const existing = siteUsageMap.get(u.usage_site_id);
            if (existing) {
              existing.quantity_used += Number(u.quantity);
              existing.amount += Number(u.total_cost);
              existing.usage_records.push(recordDetail);
              // Keep the "worse" status (pending > settled > self_use)
              if (u.settlement_status === "pending") {
                existing.settlement_status = "pending";
              }
            } else {
              siteUsageMap.set(u.usage_site_id, {
                site_id: u.usage_site_id,
                site_name: u.usage_site?.name || "Unknown",
                quantity_used: Number(u.quantity),
                amount: Number(u.total_cost),
                is_payer: u.is_self_use,
                settlement_status: u.settlement_status,
                usage_records: [recordDetail],
              });
            }
          });

          // delivered_quantity = total accepted_qty from deliveries for this batch's PO
          const delivered_quantity = deliveredByPO.get(batch.purchase_order_id) ?? 0;
          // in_stock_quantity = delivered minus what's been consumed via batch_usage_records
          const in_stock_quantity = Math.max(0, delivered_quantity - used_quantity);

          return {
            ...batch,
            items: effectiveItems,
            original_quantity,
            remaining_quantity,
            delivered_quantity,
            in_stock_quantity,
            site_allocations: Array.from(siteUsageMap.values()),
          };
        });
      } catch (err) {
        if (isQueryError(err)) {
          console.warn("Batches with usage query failed:", err);
          return [];
        }
        throw err;
      }
    },
    enabled: !!groupId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

// ============================================
// RECORD GROUP STOCK USAGE WITH FIFO
// ============================================

/**
 * @deprecated Use {@link useRecordBatchUsageWaterfall} instead.
 *
 * Records usage across multiple group stock batches by calling record_batch_usage
 * sequentially from the client — NON-ATOMIC (a mid-loop failure leaves earlier
 * batches decremented with no rollback) AND it calls a dead 6-arg record_batch_usage
 * signature (no material_id/brand_id), so it silently mis-attributes / fails on
 * variant batches. Kept only until all callers migrate to the atomic waterfall RPC.
 */
export function useRecordGroupStockUsageFIFO() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    retry: false,
    mutationFn: async (data: {
      allocations: GroupStockBatchAllocation[];
      usage_site_id: string;
      usage_date: string;
      work_description?: string;
      created_by?: string;
    }) => {
      const results: Array<{ batch_ref_code: string; usage_id: string }> = [];

      // Process sequentially — order matters (oldest first)
      for (const alloc of data.allocations) {
        const { data: usageId, error } = await (supabase as any).rpc("record_batch_usage", {
          p_batch_ref_code: alloc.batch_ref_code,
          p_usage_site_id: data.usage_site_id,
          p_quantity: alloc.quantity,
          p_usage_date: data.usage_date,
          p_work_description: data.work_description || null,
          p_created_by: data.created_by || null,
        });

        if (error) {
          throw new Error(
            `Failed to record usage for batch ${alloc.batch_ref_code}: ${error.message}`
          );
        }

        results.push({ batch_ref_code: alloc.batch_ref_code, usage_id: usageId });
      }

      return results;
    },
    onSuccess: (results, variables) => {
      // Invalidate all affected batch queries
      for (const r of results) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.batchUsage.byBatch(r.batch_ref_code),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.batchUsage.summary(r.batch_ref_code),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.materialPurchases.byRefCode(r.batch_ref_code),
        });
      }
      queryClient.invalidateQueries({
        queryKey: queryKeys.batchUsage.bySite(variables.usage_site_id),
      });
      queryClient.invalidateQueries({ queryKey: ["material-purchases", "batches"] });
      queryClient.invalidateQueries({ queryKey: ["material-purchases"] });
      queryClient.invalidateQueries({ queryKey: ["all-expenses"] });
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["inter-site-settlements"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.batchUsage.all });
      // Invalidate stock inventory - record_batch_usage now decrements stock_inventory.current_qty
      queryClient.invalidateQueries({ queryKey: queryKeys.materialStock.all });
      queryClient.invalidateQueries({ queryKey: ["stock-inventory"] });
      // Per-GRN usage bar (Hub) reads batch_usage_delivery_allocations.
      queryClient.invalidateQueries({ queryKey: ["delivery-usage-allocations"] });
    },
  });
}

/**
 * Atomically record usage across MANY group-stock batches in ONE transaction —
 * the engine behind the smart waterfall "Log usage" dialog. Calls the
 * record_batch_usage_waterfall RPC, which loops server-side with the EXACT
 * per-variant + landed-cost + stock-sync semantics of record_batch_usage, so it
 * is all-or-nothing: any per-batch failure (oversubscribed remaining, concurrent
 * edit) aborts the whole submission with nothing written.
 *
 * Replaces the non-atomic {@link useRecordGroupStockUsageFIFO}.
 */
export function useRecordBatchUsageWaterfall() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    retry: false, // not idempotent — modifies stock + usage records
    mutationFn: async (data: {
      usage_site_id: string;
      material_id: string;
      brand_id?: string | null;
      usage_date: string;
      work_description?: string;
      created_by?: string;
      section_id?: string | null;
      allocations: Array<{ batch_ref_code: string; quantity: number }>;
    }) => {
      if (!data.material_id) {
        throw new Error("material_id is required to record waterfall usage");
      }
      const positive = data.allocations.filter((a) => a.quantity > 0);
      if (positive.length === 0) {
        throw new Error("Enter a quantity to record");
      }

      const { data: result, error } = await (supabase as any).rpc(
        "record_batch_usage_waterfall",
        {
          p_usage_site_id: data.usage_site_id,
          p_material_id: data.material_id,
          p_brand_id: data.brand_id ?? null,
          p_usage_date: data.usage_date,
          p_work_description: data.work_description || null,
          p_created_by: data.created_by || null,
          p_section_id: data.section_id ?? null,
          p_allocations: positive,
        }
      );

      if (error) {
        throw new Error(error.message);
      }

      return result as string[]; // array of usage ids
    },
    onSuccess: (_result, variables) => {
      // Per affected batch — mirror the granular set useRecordBatchUsage fires so
      // the Hub INVENTORY·STOCK / INTER-SITE / usage-log blocks + Inventory cards
      // all refresh.
      for (const a of variables.allocations) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.batchUsage.byBatch(a.batch_ref_code),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.batchUsage.summary(a.batch_ref_code),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.materialPurchases.byRefCode(a.batch_ref_code),
        });
        queryClient.invalidateQueries({
          queryKey: ["batch-variant-summary", a.batch_ref_code],
        });
      }
      queryClient.invalidateQueries({
        queryKey: queryKeys.batchUsage.bySite(variables.usage_site_id),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.batchUsage.all });
      queryClient.invalidateQueries({ queryKey: ["material-purchases", "batches"] });
      queryClient.invalidateQueries({ queryKey: ["material-purchases"] });
      queryClient.invalidateQueries({ queryKey: ["all-expenses"] });
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["material-threads"] });
      queryClient.invalidateQueries({ queryKey: ["usage-history"] });
      queryClient.invalidateQueries({ queryKey: ["batch-usage-summary"] });
      queryClient.invalidateQueries({ queryKey: ["stock-inventory"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.materialStock.all });
      queryClient.invalidateQueries({ queryKey: ["inter-site-settlements"] });
      queryClient.invalidateQueries({ queryKey: ["material-usage"] });
      // Per-GRN usage bar (Hub) reads batch_usage_delivery_allocations.
      queryClient.invalidateQueries({ queryKey: ["delivery-usage-allocations"] });
    },
  });
}

/**
 * Atomically record a per-site usage SPLIT against a SINGLE group-stock batch in
 * ONE transaction — the engine behind the Hub "This batch" log-usage dialog (e.g.
 * a 50-bag batch where Srinivasan used 30 and Padmavathy used 20). The mirror of
 * {@link useRecordBatchUsageWaterfall}: that spreads ONE site across many batches;
 * this spreads ONE batch across many consuming sites. Calls the insert-only
 * record_batch_usage_multi_site RPC, which loops record_batch_usage_waterfall per
 * site — all-or-nothing, with the cumulative total capped at the batch remaining.
 */
export function useRecordBatchUsageMultiSite() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    retry: false, // not idempotent — modifies stock + usage records
    mutationFn: async (data: {
      batch_ref_code: string;
      material_id: string;
      brand_id?: string | null;
      usage_date: string;
      work_description?: string;
      created_by?: string;
      section_id?: string | null;
      entries: Array<{ usage_site_id: string; quantity: number }>;
    }) => {
      if (!data.material_id) {
        throw new Error("material_id is required to record usage");
      }
      if (!data.batch_ref_code) {
        throw new Error("batch_ref_code is required to record usage");
      }
      const positive = data.entries.filter(
        (e) => e.usage_site_id && e.quantity > 0
      );
      if (positive.length === 0) {
        throw new Error("Enter a quantity for at least one site");
      }

      const { data: result, error } = await (supabase as any).rpc(
        "record_batch_usage_multi_site",
        {
          p_batch_ref_code: data.batch_ref_code,
          p_material_id: data.material_id,
          p_brand_id: data.brand_id ?? null,
          p_usage_date: data.usage_date,
          p_work_description: data.work_description || null,
          p_section_id: data.section_id ?? null,
          p_created_by: data.created_by || null,
          p_entries: positive,
        }
      );

      if (error) {
        throw new Error(error.message);
      }

      return result as string[]; // array of usage ids
    },
    onSuccess: (_result, variables) => {
      // One batch, many consuming sites — invalidate the batch's caches plus
      // every consuming site's, mirroring useRecordBatchUsageWaterfall so the
      // Hub INVENTORY·STOCK / INTER-SITE / usage-log blocks + ledger refresh.
      const ref = variables.batch_ref_code;
      queryClient.invalidateQueries({
        queryKey: queryKeys.batchUsage.byBatch(ref),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.batchUsage.summary(ref),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.materialPurchases.byRefCode(ref),
      });
      queryClient.invalidateQueries({
        queryKey: ["batch-variant-summary", ref],
      });
      for (const e of variables.entries) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.batchUsage.bySite(e.usage_site_id),
        });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.batchUsage.all });
      queryClient.invalidateQueries({ queryKey: ["material-purchases", "batches"] });
      queryClient.invalidateQueries({ queryKey: ["material-purchases"] });
      queryClient.invalidateQueries({ queryKey: ["all-expenses"] });
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["material-threads"] });
      queryClient.invalidateQueries({ queryKey: ["usage-history"] });
      queryClient.invalidateQueries({ queryKey: ["batch-usage-summary"] });
      queryClient.invalidateQueries({ queryKey: ["stock-inventory"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.materialStock.all });
      queryClient.invalidateQueries({ queryKey: ["inter-site-settlements"] });
      queryClient.invalidateQueries({ queryKey: ["material-usage"] });
      queryClient.invalidateQueries({ queryKey: ["delivery-usage-allocations"] });
    },
  });
}

/**
 * Atomic "delete & refill" bulk reconciliation for ONE material across a
 * cluster's group-stock pool — the commit step of the Reconcile dialog.
 * Deletes the named pending/self_use records (reversing stock) and inserts the
 * new per-batch allocations in one transaction via the SECURITY DEFINER RPC
 * record_reconciliation_usage (cross-site writes are otherwise RLS-blocked).
 */
export function useRecordReconciliationUsage() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    retry: false, // not idempotent — modifies stock + usage records
    mutationFn: async (data: {
      created_by?: string;
      delete_ids: string[];
      entries: Array<{
        usage_site_id: string;
        usage_date: string;
        work_description?: string | null;
        allocations: Array<{
          batch_ref_code: string;
          material_id: string;
          brand_id?: string | null;
          quantity: number;
        }>;
      }>;
    }) => {
      const entries = data.entries
        .map((e) => ({
          ...e,
          allocations: e.allocations.filter((a) => a.quantity > 0),
        }))
        .filter((e) => e.allocations.length > 0);
      if (entries.length === 0 && data.delete_ids.length === 0) {
        throw new Error("Nothing to reconcile");
      }

      const { data: result, error } = await (supabase as any).rpc(
        "record_reconciliation_usage",
        {
          p_created_by: data.created_by || null,
          p_delete_ids: data.delete_ids,
          p_entries: entries,
        }
      );

      if (error) {
        throw new Error(error.message);
      }
      return result as string[];
    },
    onSuccess: (_result, variables) => {
      const refCodes = new Set<string>();
      const siteIds = new Set<string>();
      for (const e of variables.entries) {
        siteIds.add(e.usage_site_id);
        for (const a of e.allocations) refCodes.add(a.batch_ref_code);
      }
      for (const ref of refCodes) {
        queryClient.invalidateQueries({ queryKey: queryKeys.batchUsage.byBatch(ref) });
        queryClient.invalidateQueries({ queryKey: queryKeys.batchUsage.summary(ref) });
        queryClient.invalidateQueries({ queryKey: queryKeys.materialPurchases.byRefCode(ref) });
        queryClient.invalidateQueries({ queryKey: ["batch-variant-summary", ref] });
      }
      for (const site of siteIds) {
        queryClient.invalidateQueries({ queryKey: queryKeys.batchUsage.bySite(site) });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.batchUsage.all });
      queryClient.invalidateQueries({ queryKey: ["material-purchases", "batches"] });
      queryClient.invalidateQueries({ queryKey: ["material-purchases"] });
      queryClient.invalidateQueries({ queryKey: ["all-expenses"] });
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["material-threads"] });
      queryClient.invalidateQueries({ queryKey: ["usage-history"] });
      queryClient.invalidateQueries({ queryKey: ["batch-usage-summary"] });
      queryClient.invalidateQueries({ queryKey: ["stock-inventory"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.materialStock.all });
      queryClient.invalidateQueries({ queryKey: ["inter-site-settlements"] });
      queryClient.invalidateQueries({ queryKey: ["material-usage"] });
      queryClient.invalidateQueries({ queryKey: ["delivery-usage-allocations"] });
      // Usage Ledger pages + UsageDetailDrawer.
      queryClient.invalidateQueries({ queryKey: ["material-usage-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["usage-ledger-detail"] });
    },
  });
}

// ============================================
// MUTATIONS
// ============================================

/**
 * Complete a batch by settling with all debtor sites and creating self-use expense
 * Calls process_batch_settlement for each site with pending usage
 * Also creates self-use expense for the paying site (creditor) for remaining materials
 */
export function useCompleteBatch() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      batchRefCode: string;
      allocations: BatchSiteAllocation[];
      paymentDate?: string;
      paymentMode?: string;
      paymentReference?: string;
      createSelfUse?: boolean; // Option to create self-use expense for remaining materials
    }) => {
      const paymentDate = data.paymentDate || new Date().toISOString().split("T")[0];
      const paymentMode = data.paymentMode || "upi";

      // Filter only sites that have pending usage (not self-use)
      const debtorSites = data.allocations.filter(
        (alloc) => !alloc.is_payer && alloc.settlement_status === "pending"
      );

      const results: any[] = [];

      // Process settlement for each debtor site sequentially
      for (const debtor of debtorSites) {
        const { data: result, error } = await (supabase as any).rpc("process_batch_settlement", {
          p_batch_ref_code: data.batchRefCode,
          p_debtor_site_id: debtor.site_id,
          p_payment_mode: paymentMode,
          p_payment_date: paymentDate,
          p_payment_reference: data.paymentReference || null,
          p_settlement_amount: debtor.amount, // Use calculated amount
        });

        if (error) {
          throw new Error(`Failed to settle with ${debtor.site_name}: ${error.message}`);
        }

        results.push(result);
      }

      // Create self-use expense for the paying site if requested
      if (data.createSelfUse !== false) {
        // Get batch details to find the paying site and calculate remaining
        const { data: batch, error: batchError } = await (supabase as any)
          .from("material_purchase_expenses")
          .select(`
            id, site_id, paying_site_id, total_amount, amount_paid, site_group_id,
            paying_site:sites!material_purchase_expenses_paying_site_id_fkey(id, name),
            items:material_purchase_expense_items(
              id, material_id, brand_id, quantity, unit_price,
              material:materials(id, name, unit)
            )
          `)
          .eq("ref_code", data.batchRefCode)
          .single();

        if (batchError) {
          console.warn("[useCompleteBatch] Could not fetch batch for self-use:", batchError.message);
        } else if (batch) {
          const payingSiteId = batch.paying_site_id || batch.site_id;

          // Calculate total original quantity and used quantity
          const originalQty = batch.items?.reduce(
            (sum: number, item: any) => sum + Number(item.quantity || 0), 0
          ) || 0;

          // Get all usage records for this batch
          const { data: usageRecords, error: usageError } = await (supabase as any)
            .from("batch_usage_records")
            .select("quantity, total_cost, is_self_use")
            .eq("batch_ref_code", data.batchRefCode);

          if (usageError) {
            console.warn("[useCompleteBatch] Could not fetch usage records:", usageError.message);
          }

          const usedQty = (usageRecords || [])
            .filter((r: any) => !r.is_self_use)
            .reduce((sum: number, r: any) => sum + Number(r.quantity || 0), 0);

          // Calculate total amount used by other sites
          const totalUsedByOthers = (usageRecords || [])
            .filter((r: any) => !r.is_self_use)
            .reduce((sum: number, r: any) => sum + Number(r.total_cost || 0), 0);

          const remainingQty = originalQty - usedQty;

          // Use bargained amount (amount_paid) if available, otherwise use total_amount
          // Self-use = Total paid - Amount used by others (not percentage-based)
          const effectiveTotalAmount = Number(batch.amount_paid ?? batch.total_amount);
          const selfUseAmount = effectiveTotalAmount - totalUsedByOthers;

          // Check if self-use expense already exists
          const { data: existingSelfUse } = await (supabase as any)
            .from("material_purchase_expenses")
            .select("id")
            .eq("site_id", payingSiteId)
            .eq("settlement_reference", "SELF-USE")
            .eq("original_batch_code", data.batchRefCode)
            .limit(1);

          if (remainingQty > 0 && selfUseAmount > 0 && (!existingSelfUse || existingSelfUse.length === 0)) {
            console.log("[useCompleteBatch] Creating self-use expense:", {
              site_id: payingSiteId,
              amount: selfUseAmount,
              remaining_qty: remainingQty,
              total_amount: batch.total_amount,
              amount_paid: batch.amount_paid,
              effectiveTotalAmount,
              totalUsedByOthers,
            });

            // Generate reference code
            let selfUseRefCode: string;
            try {
              const { data: rpcRefCode } = await (supabase as any).rpc("generate_material_purchase_reference");
              selfUseRefCode = rpcRefCode || `SELF-${Date.now()}`;
            } catch {
              selfUseRefCode = `SELF-${Date.now()}`;
            }

            // Create self-use expense
            const selfUsePayload: Record<string, unknown> = {
              site_id: payingSiteId,
              ref_code: selfUseRefCode,
              purchase_type: "own_site",
              purchase_date: paymentDate,
              total_amount: selfUseAmount,
              transport_cost: 0,
              status: "completed",
              is_paid: true,
              paid_date: paymentDate,
              original_batch_code: data.batchRefCode,
              settlement_reference: "SELF-USE",
              settlement_date: paymentDate,
              site_group_id: batch.site_group_id,
              notes: `Self-use portion from group purchase. Materials used by ${batch.paying_site?.name || 'paying site'} from batch: ${data.batchRefCode}`,
            };

            const { data: selfUseExpense, error: selfUseError } = await (supabase as any)
              .from("material_purchase_expenses")
              .insert(selfUsePayload)
              .select()
              .single();

            if (selfUseError) {
              console.error("[useCompleteBatch] Error creating self-use expense:", selfUseError);
            } else {
              console.log("[useCompleteBatch] Self-use expense created:", selfUseExpense?.id);

              // Create expense items for self-use
              if (batch.items && batch.items.length > 0) {
                const selfUseItems = batch.items.map((item: any) => {
                  const itemQty = Number(item.quantity || 0);
                  const selfUseItemQty = originalQty > 0 ? (remainingQty / originalQty) * itemQty : 0;
                  return {
                    purchase_expense_id: selfUseExpense.id,
                    material_id: item.material_id,
                    brand_id: item.brand_id || null,
                    quantity: selfUseItemQty,
                    unit_price: Number(item.unit_price || 0),
                    notes: `Self-use from batch ${data.batchRefCode}`,
                  };
                });

                const { error: itemsError } = await (supabase as any)
                  .from("material_purchase_expense_items")
                  .insert(selfUseItems);

                if (itemsError) {
                  console.warn("[useCompleteBatch] Could not create self-use expense items:", itemsError.message);
                }
              }

              // Also create a batch_usage_record for self-use so it shows in site_allocations
              const unitCost = remainingQty > 0 ? selfUseAmount / remainingQty : 0;
              const { error: usageRecordError } = await (supabase as any)
                .from("batch_usage_records")
                .insert({
                  batch_ref_code: data.batchRefCode,
                  usage_site_id: payingSiteId,
                  site_group_id: batch.site_group_id,
                  material_id: batch.items?.[0]?.material_id || null,
                  brand_id: batch.items?.[0]?.brand_id || null,
                  quantity: remainingQty,
                  unit_cost: unitCost,
                  total_cost: selfUseAmount,
                  usage_date: paymentDate,
                  work_description: 'Self-use (batch completion)',
                  is_self_use: true,
                  settlement_status: 'self_use',
                });

              if (usageRecordError) {
                console.warn("[useCompleteBatch] Could not create self-use batch_usage_record:", usageRecordError.message);
              } else {
                console.log("[useCompleteBatch] Self-use batch_usage_record created");
              }

              results.push({ type: 'self_use', expense_id: selfUseExpense.id });
            }
          }

          // Update batch status to completed and set self-use quantities
          await (supabase as any)
            .from("material_purchase_expenses")
            .update({
              status: "completed",
              self_used_qty: remainingQty,
              self_used_amount: selfUseAmount,
              remaining_qty: 0, // All materials are now allocated
              used_qty: originalQty, // All materials are used
            })
            .eq("ref_code", data.batchRefCode);
        }
      }

      if (results.length === 0 && debtorSites.length === 0) {
        throw new Error("No debtor sites to settle and no self-use to create");
      }

      return results;
    },
    onSuccess: (_, variables) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: queryKeys.batchUsage.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.materialPurchases.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.interSiteSettlements.all });
    },
  });
}

