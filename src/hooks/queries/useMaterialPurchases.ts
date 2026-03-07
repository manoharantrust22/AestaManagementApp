"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient, ensureFreshSession } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/cache/keys";
import type {
  MaterialPurchaseExpense,
  MaterialPurchaseExpenseWithDetails,
  MaterialPurchaseType,
  MaterialBatchStatus,
  MaterialPurchaseExpenseFormData,
  GroupStockBatch,
  CompleteBatchFormData,
  ConvertToOwnSiteFormData,
  MaterialPaymentMode,
} from "@/types/material.types";
import type { PayerSource } from "@/types/settlement.types";

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if error is due to missing table or query issues
 */
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
// FETCH MATERIAL PURCHASES
// ============================================

/**
 * Fetch all material purchases for a site
 */
export function useMaterialPurchases(
  siteId: string | undefined,
  options?: {
    type?: MaterialPurchaseType;
    status?: MaterialBatchStatus;
    limit?: number;
  }
) {
  const supabase = createClient();

  return useQuery({
    queryKey: options?.type === "own_site"
      ? queryKeys.materialPurchases.ownSite(siteId || "")
      : queryKeys.materialPurchases.bySite(siteId || ""),
    queryFn: async () => {
      if (!siteId) return [] as MaterialPurchaseExpenseWithDetails[];

      try {
        let query = (supabase as any)
          .from("material_purchase_expenses")
          .select(`
            *,
            site:sites!site_id(id, name),
            vendor:vendors(id, name, qr_code_url, upi_id),
            site_group:site_groups(id, name),
            items:material_purchase_expense_items(
              *,
              material:materials(id, name, code, unit),
              brand:material_brands(id, brand_name)
            )
          `)
          .eq("site_id", siteId)
          .order("purchase_date", { ascending: false });

        if (options?.type) {
          query = query.eq("purchase_type", options.type);
        }

        if (options?.status) {
          query = query.eq("status", options.status);
        }

        if (options?.limit) {
          query = query.limit(options.limit);
        }

        const { data, error } = await query;
        if (error) {
          if (isQueryError(error)) {
            console.warn("Material purchases query failed:", error.message);
            return [] as MaterialPurchaseExpenseWithDetails[];
          }
          throw error;
        }
        return (data || []) as MaterialPurchaseExpenseWithDetails[];
      } catch (err) {
        if (isQueryError(err)) {
          console.warn("Material purchases query failed:", err);
          return [] as MaterialPurchaseExpenseWithDetails[];
        }
        throw err;
      }
    },
    enabled: !!siteId,
  });
}

/**
 * Fetch material purchases for a group (group stock only)
 */
export function useGroupMaterialPurchases(
  groupId: string | undefined,
  options?: {
    status?: MaterialBatchStatus;
    limit?: number;
  }
) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.materialPurchases.groupStock(groupId || ""),
    queryFn: async () => {
      if (!groupId) return [] as MaterialPurchaseExpenseWithDetails[];

      try {
        let query = (supabase as any)
          .from("material_purchase_expenses")
          .select(`
            *,
            site:sites!site_id(id, name),
            vendor:vendors(id, name, qr_code_url, upi_id),
            site_group:site_groups(id, name),
            items:material_purchase_expense_items(
              *,
              material:materials(id, name, code, unit),
              brand:material_brands(id, brand_name)
            )
          `)
          .eq("site_group_id", groupId)
          .eq("purchase_type", "group_stock")
          .order("purchase_date", { ascending: false });

        if (options?.status) {
          query = query.eq("status", options.status);
        }

        if (options?.limit) {
          query = query.limit(options.limit);
        }

        const { data, error } = await query;
        if (error) {
          if (isQueryError(error)) {
            console.warn("Group material purchases query failed:", error.message);
            return [] as MaterialPurchaseExpenseWithDetails[];
          }
          throw error;
        }
        return (data || []) as MaterialPurchaseExpenseWithDetails[];
      } catch (err) {
        if (isQueryError(err)) {
          console.warn("Group material purchases query failed:", err);
          return [] as MaterialPurchaseExpenseWithDetails[];
        }
        throw err;
      }
    },
    enabled: !!groupId,
  });
}

/**
 * Fetch a single material purchase by ID
 */
export function useMaterialPurchaseById(id: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: id
      ? queryKeys.materialPurchases.byId(id)
      : ["material-purchases", "detail"],
    queryFn: async () => {
      if (!id) return null;

      const { data, error } = await (supabase as any)
        .from("material_purchase_expenses")
        .select(`
          *,
          site:sites!site_id(id, name),
          vendor:vendors(id, name, qr_code_url, upi_id),
          site_group:site_groups(id, name),
          items:material_purchase_expense_items(
            *,
            material:materials(id, name, code, unit),
            brand:material_brands(id, brand_name)
          )
        `)
        .eq("id", id)
        .single();

      if (error) throw error;
      return data as MaterialPurchaseExpenseWithDetails;
    },
    enabled: !!id,
  });
}

/**
 * Fetch a material purchase by reference code
 */
export function useMaterialPurchaseByRefCode(refCode: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: refCode
      ? queryKeys.materialPurchases.byRefCode(refCode)
      : ["material-purchases", "ref"],
    queryFn: async () => {
      if (!refCode) return null;

      const { data, error } = await (supabase as any)
        .from("material_purchase_expenses")
        .select(`
          *,
          site:sites!site_id(id, name),
          vendor:vendors(id, name, qr_code_url, upi_id),
          site_group:site_groups(id, name),
          items:material_purchase_expense_items(
            *,
            material:materials(id, name, code, unit),
            brand:material_brands(id, brand_name)
          )
        `)
        .eq("ref_code", refCode)
        .single();

      if (error) throw error;
      return data as MaterialPurchaseExpenseWithDetails;
    },
    enabled: !!refCode,
  });
}

// ============================================
// GROUP STOCK BATCHES
// ============================================

/**
 * Fetch group stock batches for a site group
 */
export function useGroupStockBatches(
  groupId: string | undefined,
  options?: {
    status?: MaterialBatchStatus | MaterialBatchStatus[];
    limit?: number;
    enabled?: boolean;
  }
) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.materialPurchases.batches(groupId || ""),
    queryFn: async () => {
      if (!groupId) return [] as GroupStockBatch[];

      try {
        // Get group stock purchases
        let query = (supabase as any)
          .from("material_purchase_expenses")
          .select(`
            *,
            site:sites!site_id(id, name),
            vendor:vendors(id, name, qr_code_url, upi_id),
            items:material_purchase_expense_items(
              *,
              material:materials(id, name, code, unit),
              brand:material_brands(id, brand_name)
            )
          `)
          .eq("site_group_id", groupId)
          .eq("purchase_type", "group_stock")
          .order("purchase_date", { ascending: false });

        if (options?.status) {
          if (Array.isArray(options.status)) {
            query = query.in("status", options.status);
          } else {
            query = query.eq("status", options.status);
          }
        }

        if (options?.limit) {
          query = query.limit(options.limit);
        }

        const { data: purchases, error } = await query;
        if (error) {
          if (isQueryError(error)) {
            console.warn("Group stock batches query failed:", error.message);
            return [] as GroupStockBatch[];
          }
          throw error;
        }

        if (!purchases || purchases.length === 0) return [] as GroupStockBatch[];

        // Fetch usage records for all batches
        const batchRefCodes = purchases.map((p: any) => p.ref_code);
        const { data: usageRecords, error: usageError } = await (supabase as any)
          .from("batch_usage_records")
          .select("batch_ref_code, quantity")
          .in("batch_ref_code", batchRefCodes);

        // Group usage by batch ref code
        const usageByBatch = new Map<string, number>();
        (usageRecords || []).forEach((u: any) => {
          const current = usageByBatch.get(u.batch_ref_code) || 0;
          usageByBatch.set(u.batch_ref_code, current + Number(u.quantity || 0));
        });

        // Transform to GroupStockBatch format
        const batches: GroupStockBatch[] = (purchases || []).map((p: any) => {
          const original_quantity = p.items?.reduce((sum: number, item: any) => sum + Number(item.quantity), 0) || 0;
          const used_quantity = usageByBatch.get(p.ref_code) || 0;
          const remaining_quantity = original_quantity - used_quantity;

          return {
            batch_code: p.ref_code, // Use ref_code as batch_code
            ref_code: p.ref_code,
            purchase_date: p.purchase_date,
            vendor_id: p.vendor_id,
            vendor_name: p.vendor_name || p.vendor?.name,
            payment_source_site_id: p.site_id,
            payment_source_site_name: p.site?.name,
            total_amount: p.total_amount,
            amount_paid: p.amount_paid,
            is_paid: p.is_paid,
            original_quantity,
            remaining_quantity,
            status: p.status,
            bill_url: p.bill_url,
            payment_mode: p.payment_mode,
            payment_reference: p.payment_reference,
            payment_screenshot_url: p.payment_screenshot_url,
            notes: p.notes,
            items: (p.items || []).map((item: any) => ({
              material_id: item.material_id,
              material_name: item.material?.name || "Unknown Material",
              material_code: item.material?.code || "",
              brand_id: item.brand_id,
              brand_name: item.brand?.brand_name || "",
              quantity: item.quantity,
              unit: item.material?.unit || "nos",
              unit_price: item.unit_price,
            })),
            allocations: [], // Calculated by useBatchesWithUsage hook
          };
        });

        return batches;
      } catch (err) {
        if (isQueryError(err)) {
          console.warn("Group stock batches query failed:", err);
          return [] as GroupStockBatch[];
        }
        throw err;
      }
    },
    enabled: options?.enabled !== false && !!groupId,
  });
}

// ============================================
// MUTATIONS
// ============================================

/**
 * Generate a reference code for a material purchase
 */
export function useGenerateMaterialRefCode() {
  const supabase = createClient();

  return useMutation({
    mutationFn: async (type: MaterialPurchaseType) => {
      const functionName = type === "own_site"
        ? "generate_material_purchase_reference"
        : "generate_group_stock_purchase_reference";

      const { data, error } = await (supabase as any).rpc(functionName);

      if (error) throw error;
      return data as string;
    },
  });
}

/**
 * Generate a fallback reference code if RPC function doesn't exist
 */
function generateFallbackRefCode(type: MaterialPurchaseType): string {
  const date = new Date();
  const dateStr = date.toISOString().slice(2, 10).replace(/-/g, "");
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  const prefix = type === "own_site" ? "MAT" : "GSP";
  return `${prefix}-${dateStr}-${random}`;
}

/**
 * Create a new material purchase expense
 */
export function useCreateMaterialPurchase() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: MaterialPurchaseExpenseFormData) => {
      await ensureFreshSession();

      // Generate reference code (with fallback if RPC doesn't exist)
      let refCode: string;
      try {
        const functionName = data.purchase_type === "own_site"
          ? "generate_material_purchase_reference"
          : "generate_group_stock_purchase_reference";

        const { data: rpcRefCode, error: refError } = await (supabase as any).rpc(functionName);
        if (refError) {
          console.warn("RPC function not found, using fallback:", refError);
          refCode = generateFallbackRefCode(data.purchase_type);
        } else {
          refCode = rpcRefCode;
        }
      } catch {
        refCode = generateFallbackRefCode(data.purchase_type);
      }

      // Calculate total amount from items
      const totalAmount = data.items.reduce(
        (sum, item) => sum + item.quantity * item.unit_price,
        0
      ) + (data.transport_cost || 0);

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      // Insert purchase expense
      const { data: purchase, error: purchaseError } = await (supabase as any)
        .from("material_purchase_expenses")
        .insert({
          site_id: data.site_id,
          ref_code: refCode,
          purchase_type: data.purchase_type,
          vendor_id: data.vendor_id,
          vendor_name: data.vendor_name,
          purchase_date: data.purchase_date,
          total_amount: totalAmount,
          transport_cost: data.transport_cost || 0,
          payment_mode: data.payment_mode,
          payment_reference: data.payment_reference,
          payment_screenshot_url: data.payment_screenshot_url,
          is_paid: data.is_paid || false,
          paid_date: data.paid_date,
          bill_url: data.bill_url,
          status: data.purchase_type === "own_site" ? "completed" : "recorded",
          site_group_id: data.site_group_id,
          purchase_order_id: data.purchase_order_id || null,
          notes: data.notes,
          created_by: user?.id,
        })
        .select()
        .single();

      if (purchaseError) {
        // Check if it's a table not found error
        if (purchaseError.code === "42P01" || purchaseError.message?.includes("does not exist")) {
          throw new Error("Database migration required: material_purchase_expenses table does not exist. Please run database migrations.");
        }
        throw purchaseError;
      }

      // Insert items
      if (data.items.length > 0) {
        const items = data.items.map((item) => ({
          purchase_expense_id: purchase.id,
          material_id: item.material_id,
          brand_id: item.brand_id || null,
          quantity: item.quantity,
          unit_price: item.unit_price,
          notes: item.notes,
        }));

        const { error: itemsError } = await (supabase as any)
          .from("material_purchase_expense_items")
          .insert(items);

        if (itemsError) throw itemsError;
      }

      return purchase as MaterialPurchaseExpense;
    },
    onSuccess: (_, variables) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: queryKeys.materialPurchases.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.materialPurchases.bySite(variables.site_id),
      });
      if (variables.site_group_id) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.materialPurchases.byGroup(variables.site_group_id),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.materialPurchases.batches(variables.site_group_id),
        });
      }
    },
  });
}

/**
 * Update a material purchase expense
 */
export function useUpdateMaterialPurchase() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<MaterialPurchaseExpenseFormData>;
    }) => {
      await ensureFreshSession();

      // Calculate total amount if items are provided
      let totalAmount = data.items
        ? data.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0) +
          (data.transport_cost || 0)
        : undefined;

      // Update purchase expense
      const updateData: Record<string, any> = {};
      if (data.vendor_id !== undefined) updateData.vendor_id = data.vendor_id;
      if (data.vendor_name !== undefined) updateData.vendor_name = data.vendor_name;
      if (data.purchase_date !== undefined) updateData.purchase_date = data.purchase_date;
      if (totalAmount !== undefined) updateData.total_amount = totalAmount;
      if (data.transport_cost !== undefined) updateData.transport_cost = data.transport_cost;
      if (data.payment_mode !== undefined) updateData.payment_mode = data.payment_mode;
      if (data.payment_reference !== undefined) updateData.payment_reference = data.payment_reference;
      if (data.payment_screenshot_url !== undefined) updateData.payment_screenshot_url = data.payment_screenshot_url;
      if (data.is_paid !== undefined) updateData.is_paid = data.is_paid;
      if (data.paid_date !== undefined) updateData.paid_date = data.paid_date;
      if (data.bill_url !== undefined) updateData.bill_url = data.bill_url;
      if (data.notes !== undefined) updateData.notes = data.notes;

      if (Object.keys(updateData).length > 0) {
        const { error: updateError } = await (supabase as any)
          .from("material_purchase_expenses")
          .update(updateData)
          .eq("id", id);

        if (updateError) throw updateError;
      }

      // Update items if provided
      if (data.items) {
        // Delete existing items
        await (supabase as any)
          .from("material_purchase_expense_items")
          .delete()
          .eq("purchase_expense_id", id);

        // Insert new items
        if (data.items.length > 0) {
          const items = data.items.map((item) => ({
            purchase_expense_id: id,
            material_id: item.material_id,
            brand_id: item.brand_id || null,
            quantity: item.quantity,
            unit_price: item.unit_price,
            notes: item.notes,
          }));

          const { error: itemsError } = await (supabase as any)
            .from("material_purchase_expense_items")
            .insert(items);

          if (itemsError) throw itemsError;
        }
      }

      return { id };
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.materialPurchases.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.materialPurchases.byId(id) });
    },
  });
}

/**
 * Delete a material purchase expense (with two-way cascade to linked PO)
 */
export function useDeleteMaterialPurchase() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await ensureFreshSession();

      // Get the material expense to find linked PO and site_id
      const { data: expense } = await (supabase as any)
        .from("material_purchase_expenses")
        .select("purchase_order_id, site_id")
        .eq("id", id)
        .single();

      const siteId = expense?.site_id;
      const linkedPoId = expense?.purchase_order_id;

      // Items will be deleted automatically via ON DELETE CASCADE
      const { error } = await (supabase as any)
        .from("material_purchase_expenses")
        .delete()
        .eq("id", id);

      if (error) throw error;

      // Two-way cascade: Also delete linked PO if exists
      if (linkedPoId) {
        try {
          // Get deliveries for this PO
          const { data: deliveries } = await supabase
            .from("deliveries")
            .select("id")
            .eq("po_id", linkedPoId);

          // Delete delivery items first
          if (deliveries && deliveries.length > 0) {
            const deliveryIds = deliveries.map((d) => d.id);
            await supabase
              .from("delivery_items")
              .delete()
              .in("delivery_id", deliveryIds);

            // Delete deliveries
            await supabase
              .from("deliveries")
              .delete()
              .eq("po_id", linkedPoId);
          }

          // Delete PO items
          await supabase
            .from("purchase_order_items")
            .delete()
            .eq("po_id", linkedPoId);

          // Delete the PO
          await supabase
            .from("purchase_orders")
            .delete()
            .eq("id", linkedPoId);
        } catch (poDeleteError) {
          console.warn("Failed to delete linked PO:", poDeleteError);
        }
      }

      return { id, siteId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.materialPurchases.all });
      // Also invalidate PO and deliveries caches
      if (result.siteId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.purchaseOrders.bySite(result.siteId),
        });
        queryClient.invalidateQueries({
          queryKey: ["deliveries", result.siteId],
        });
      }
    },
  });
}

/**
 * Delete an allocated expense and cancel the associated inter-site settlement
 * This allows deleting from Material Expenses page directly
 */
export function useDeleteAllocatedExpense() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      expenseId: string;
      settlementReference: string;
    }) => {
      await ensureFreshSession();

      // Get expense details for cache invalidation
      const { data: expense } = await (supabase as any)
        .from("material_purchase_expenses")
        .select("site_id, site_group_id, original_batch_code")
        .eq("id", data.expenseId)
        .single();

      // Find the settlement by settlement_reference (settlement_code)
      const { data: settlement, error: settlementError } = await (supabase as any)
        .from("inter_site_material_settlements")
        .select("id, site_group_id, from_site_id, to_site_id, status")
        .eq("settlement_code", data.settlementReference)
        .single();

      if (settlementError && settlementError.code !== "PGRST116") {
        console.warn("Error finding settlement:", settlementError);
      }

      // If settlement found, cancel it and reset usage records
      if (settlement) {
        // Reset batch_usage_records to pending
        const { error: resetBatchError } = await (supabase as any)
          .from("batch_usage_records")
          .update({
            settlement_id: null,
            settlement_status: "pending",
            updated_at: new Date().toISOString(),
          })
          .eq("settlement_id", settlement.id);

        if (resetBatchError) {
          console.warn("Error resetting batch usage records:", resetBatchError);
        }

        // Reset group_stock_transactions
        const { error: resetTxError } = await (supabase as any)
          .from("group_stock_transactions")
          .update({
            settlement_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq("settlement_id", settlement.id);

        if (resetTxError) {
          console.warn("Error resetting transactions:", resetTxError);
        }

        // Delete settlement items
        await (supabase as any)
          .from("inter_site_settlement_items")
          .delete()
          .eq("settlement_id", settlement.id);

        // Delete settlement payments (if any)
        await (supabase as any)
          .from("inter_site_settlement_payments")
          .delete()
          .eq("settlement_id", settlement.id);

        // Delete settlement expense allocations
        await (supabase as any)
          .from("settlement_expense_allocations")
          .delete()
          .eq("settlement_id", settlement.id);

        // DELETE the settlement entirely (so usage records go back to Unsettled Balances)
        // This allows the usage to be re-settled fresh, rather than showing as "Cancelled"
        const { error: deleteSettlementError } = await (supabase as any)
          .from("inter_site_material_settlements")
          .delete()
          .eq("id", settlement.id);

        if (deleteSettlementError) {
          console.warn("Error deleting settlement:", deleteSettlementError);
        }
      }

      // Delete the allocated expense
      const { error: deleteError } = await (supabase as any)
        .from("material_purchase_expenses")
        .delete()
        .eq("id", data.expenseId);

      if (deleteError) throw deleteError;

      return {
        expenseId: data.expenseId,
        settlementId: settlement?.id,
        siteGroupId: settlement?.site_group_id || expense?.site_group_id,
        fromSiteId: settlement?.from_site_id,
        toSiteId: settlement?.to_site_id || expense?.site_id,
        batchRefCode: expense?.original_batch_code,
      };
    },
    onSuccess: (result) => {
      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.materialPurchases.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.interSiteSettlements.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.batchUsage.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all });

      if (result.siteGroupId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.interSiteSettlements.balances(result.siteGroupId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.groupStock.byGroup(result.siteGroupId),
        });
      }
      if (result.fromSiteId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.materialPurchases.bySite(result.fromSiteId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.interSiteSettlements.bySite(result.fromSiteId),
        });
      }
      if (result.toSiteId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.materialPurchases.bySite(result.toSiteId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.interSiteSettlements.bySite(result.toSiteId),
        });
      }
    },
  });
}

// ============================================
// SETTLEMENT
// ============================================

/**
 * Generate a settlement reference code
 */
function generateSettlementRef(): string {
  const shortId = Math.random().toString(36).substring(2, 10).toUpperCase();
  return `PSET-${shortId}`;
}

/**
 * Form data for settling a material purchase
 */
export interface SettleMaterialPurchaseData {
  id: string;
  settlement_date: string;
  payment_mode: MaterialPaymentMode;
  payer_source: PayerSource;
  payer_name?: string;
  payment_reference?: string;
  bill_url?: string;
  payment_screenshot_url?: string;
  notes?: string;
  /** Actual amount paid after bargaining (may differ from total_amount) */
  amount_paid?: number;
  /** Set to true for group stock vendor payments (no settlement reference) */
  isVendorPaymentOnly?: boolean;
}

/**
 * Settle a material purchase expense
 * Generates a settlement reference and marks the purchase as settled
 * For group stock (isVendorPaymentOnly=true), only marks vendor as paid without settlement reference
 * Also proportionally adjusts inventory values if amount_paid differs from total_amount (bargaining discount)
 */
export function useSettleMaterialPurchase() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: SettleMaterialPurchaseData) => {
      await ensureFreshSession();

      // For vendor-only payment (group stock), don't set settlement_reference
      const settlementRef = data.isVendorPaymentOnly ? null : generateSettlementRef();

      // First, get the expense record to check if we need to adjust inventory values
      const { data: expense, error: fetchError } = await (supabase as any)
        .from("material_purchase_expenses")
        .select(`
          id,
          site_id,
          total_amount,
          purchase_order_id,
          items:material_purchase_expense_items(
            material_id,
            brand_id,
            quantity,
            unit_price
          )
        `)
        .eq("id", data.id)
        .single();

      if (fetchError) throw fetchError;

      const updateData: Record<string, unknown> = {
        payment_mode: data.payment_mode,
        payment_reference: data.payment_reference || null,
        bill_url: data.bill_url || null,
        payment_screenshot_url: data.payment_screenshot_url || null,
        is_paid: true,
        paid_date: data.settlement_date,
        amount_paid: data.amount_paid || null,
        notes: data.notes || null,
        updated_at: new Date().toISOString(),
      };

      // Only set settlement reference/date for non-vendor-only payments
      if (!data.isVendorPaymentOnly) {
        updateData.settlement_reference = settlementRef;
        updateData.settlement_date = data.settlement_date;
      }
      // Always store payer source and payer name
      updateData.settlement_payer_source = data.payer_source;
      updateData.settlement_payer_name = data.payer_name || null;

      const { error } = await (supabase as any)
        .from("material_purchase_expenses")
        .update(updateData)
        .eq("id", data.id);

      if (error) throw error;

      // If amount_paid differs from total_amount (bargaining discount), adjust inventory values proportionally
      if (data.amount_paid && expense?.total_amount && data.amount_paid !== expense.total_amount) {
        const discountRatio = data.amount_paid / expense.total_amount;
        const siteId = expense.site_id;
        const items = expense.items || [];

        // Update avg_unit_cost for each item in stock_inventory
        for (const item of items) {
          if (!item.material_id) continue;

          // Find the stock inventory record for this material at this site
          let stockQuery = supabase
            .from("stock_inventory")
            .select("id, avg_unit_cost, current_qty")
            .eq("site_id", siteId)
            .eq("material_id", item.material_id);

          if (item.brand_id) {
            stockQuery = stockQuery.eq("brand_id", item.brand_id);
          } else {
            stockQuery = stockQuery.is("brand_id", null);
          }

          const { data: stockRecords } = await stockQuery;

          // Update each matching stock record with proportionally adjusted unit cost
          for (const stock of (stockRecords || [])) {
            if (stock.avg_unit_cost) {
              const adjustedUnitCost = stock.avg_unit_cost * discountRatio;
              await supabase
                .from("stock_inventory")
                .update({
                  avg_unit_cost: adjustedUnitCost,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", stock.id);
            }
          }
        }
      }

      return { id: data.id, settlement_reference: settlementRef };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.materialPurchases.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.materialStock.all });
    },
  });
}

/**
 * Complete a group stock batch by allocating usage to sites
 */
export function useCompleteGroupStockBatch() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CompleteBatchFormData) => {
      await ensureFreshSession();

      const { data: result, error } = await (supabase as any).rpc(
        "complete_group_stock_batch",
        {
          p_batch_code: data.batch_code,
          p_site_allocations: data.allocations,
        }
      );

      if (error) throw error;
      return { child_ref_codes: result };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.materialPurchases.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.groupStock.all });
    },
  });
}

/**
 * Convert a group stock purchase to own site purchase
 */
export function useConvertGroupToOwnSite() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: ConvertToOwnSiteFormData) => {
      await ensureFreshSession();

      const { data: newRefCode, error } = await (supabase as any).rpc(
        "convert_group_to_own_site",
        {
          p_batch_code: data.batch_code,
          p_target_site_id: data.target_site_id,
        }
      );

      if (error) throw error;
      return { new_ref_code: newRefCode };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.materialPurchases.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.groupStock.all });
    },
  });
}

// ============================================
// SITE MATERIAL EXPENSES (for Expenses Page)
// ============================================

/**
 * Fetch material expenses for a site (for display in Material Settlements page)
 * This is for VENDOR PAYMENT tracking - shows all purchases this site needs to pay vendors for.
 * Includes:
 * - Own site purchases (purchase_type = 'own_site')
 * - Allocated group stock purchases (original_batch_code IS NOT NULL) - debtor expenses
 * - Group stock parent purchases (purchase_type = 'group_stock') - for paying site to record vendor payment
 * - POs with payment_timing='advance' that need advance payment (before delivery)
 */
export function useSiteMaterialExpenses(siteId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: siteId
      ? [...queryKeys.materialPurchases.bySite(siteId), "expenses"]
      : ["material-expenses"],
    queryFn: async () => {
      if (!siteId) return { expenses: [], advancePOs: [], total: 0 };

      try {
        // 1. Fetch material purchase expenses for this site
        // Include:
        // - own_site purchases - direct purchases for this site
        // - original_batch_code IS NOT NULL - allocated expenses from inter-site settlements
        // - group_stock purchases - parent batches where this site paid the vendor
        // Use proper OR syntax: site_id must match AND one of the conditions
        let expensesQuery = (supabase as any)
          .from("material_purchase_expenses")
          .select(`
            *,
            vendor:vendors(id, name, qr_code_url, upi_id),
            purchase_order:purchase_orders(id, po_number, vendor_bill_url, bill_verified, total_amount, transport_cost),
            paying_site:sites!material_purchase_expenses_paying_site_id_fkey(id, name),
            items:material_purchase_expense_items(
              *,
              material:materials(id, name, code, unit),
              brand:material_brands(id, brand_name)
            )
          `)
          .eq("site_id", siteId)
          .order("purchase_date", { ascending: false });

        // Apply OR filter for purchase types - must be within the site filter
        // Include:
        // - own_site purchases with no batch code (direct purchases)
        // - group_stock purchases (parent batches for vendor payment tracking)
        // - own_site purchases WITH original_batch_code (allocated from inter-site settlements)
        //   These represent debtor-side expenses when inter-site settlement is paid
        const { data: expensesData, error: expensesError } = await expensesQuery
          .or("purchase_type.eq.group_stock,and(purchase_type.eq.own_site)");

        if (expensesError && !isQueryError(expensesError)) {
          throw expensesError;
        }

        // 2. Fetch POs with advance payment that haven't been paid yet
        const { data: advancePOsData, error: advancePOsError } = await (supabase as any)
          .from("purchase_orders")
          .select(`
            *,
            vendor:vendors(id, name, qr_code_url, upi_id),
            items:purchase_order_items(
              *,
              material:materials(id, name, code, unit),
              brand:material_brands(id, brand_name)
            )
          `)
          .eq("site_id", siteId)
          .eq("payment_timing", "advance")
          .in("status", ["ordered", "draft"])
          .is("advance_paid", null) // Not yet paid
          .order("order_date", { ascending: false });

        if (advancePOsError && !isQueryError(advancePOsError)) {
          throw advancePOsError;
        }

        const expenses = (expensesData || []) as MaterialPurchaseExpenseWithDetails[];
        const advancePOs = (advancePOsData || []) as any[];

        // Debug logging
        console.log("[useSiteMaterialExpenses] Fetched expenses:", expenses.length);
        console.log("[useSiteMaterialExpenses] Expense types:", expenses.map(e => ({
          ref_code: e.ref_code,
          purchase_type: e.purchase_type,
          is_paid: e.is_paid,
          amount: e.total_amount,
        })));
        console.log("[useSiteMaterialExpenses] Fetched advance POs:", advancePOs.length);

        // Calculate total from both expenses and advance POs (include transport costs)
        const expensesTotal = expenses.reduce((sum, exp) => {
          // For expenses with linked PO, use PO's total_amount + transport_cost
          if (exp.purchase_order?.total_amount) {
            return sum + Number(exp.purchase_order.total_amount) + Number(exp.purchase_order.transport_cost || 0);
          }
          // For direct expenses (no PO), total_amount already includes transport
          return sum + Number(exp.total_amount || 0);
        }, 0);
        const advancePOsTotal = advancePOs.reduce(
          (sum, po) => sum + Number(po.total_amount || 0) + Number(po.transport_cost || 0), 0
        );
        const total = expensesTotal + advancePOsTotal;

        return { expenses, advancePOs, total };
      } catch (err) {
        if (isQueryError(err)) {
          console.warn("Site material expenses query failed:", err);
          return { expenses: [], advancePOs: [], total: 0 };
        }
        throw err;
      }
    },
    enabled: !!siteId,
  });
}

// ============================================
// SITE MATERIAL EXPENSES (for Material Expenses Page - site-level costs)
// ============================================

/**
 * Type for site-level material expense
 */
export interface SiteMaterialExpense {
  id: string;
  ref_code: string;
  type: "own_site" | "self_use" | "allocated";
  purchase_date: string;
  material_name: string;
  material_id: string | null;
  brand_name: string | null;
  quantity: number | null;
  unit: string | null;
  amount: number;
  source_ref: string; // PO number, batch code, or settlement reference
  status: "paid" | "settled" | "pending";
  vendor_name: string | null;
  bill_url: string | null;
  // For linking
  purchase_expense_id: string | null;
  batch_ref_code: string | null;
  settlement_reference: string | null;
}

/**
 * Fetch site-level material expenses (actual costs this site bears)
 * This is for SITE EXPENSE tracking - shows only what THIS site pays for.
 * Includes:
 * - Own site purchases that are settled/paid
 * - Allocated expenses from inter-site settlements (debtor portion)
 * - Self-use portion from group batches where this site paid (creditor portion)
 */
export function useSiteLevelMaterialExpenses(siteId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: siteId
      ? [...queryKeys.materialPurchases.bySite(siteId), "site-level-expenses"]
      : ["site-level-expenses"],
    queryFn: async () => {
      if (!siteId) return { expenses: [] as SiteMaterialExpense[], total: 0 };

      try {
        const expenses: SiteMaterialExpense[] = [];

        // 1. Fetch own site purchases that are paid/settled
        // Exclude records with original_batch_code set - those are allocated expenses from inter-site settlements
        const { data: ownSitePurchases, error: ownSiteError } = await (supabase as any)
          .from("material_purchase_expenses")
          .select(`
            id,
            ref_code,
            purchase_date,
            total_amount,
            amount_paid,
            is_paid,
            settlement_reference,
            vendor_name,
            bill_url,
            purchase_order:purchase_orders(po_number),
            items:material_purchase_expense_items(
              quantity,
              material:materials(id, name, unit),
              brand:material_brands(brand_name)
            )
          `)
          .eq("site_id", siteId)
          .eq("purchase_type", "own_site")
          .eq("is_paid", true)
          .is("original_batch_code", null) // Exclude allocated expenses
          .order("purchase_date", { ascending: false });

        if (ownSiteError) {
          console.warn("Own site purchases query failed:", ownSiteError.message);
        } else {
          for (const purchase of (ownSitePurchases || [])) {
            const firstItem = purchase.items?.[0];
            // Use amount_paid (settled amount after bargaining) if available, otherwise total_amount
            const displayAmount = Number(purchase.amount_paid || purchase.total_amount || 0);
            expenses.push({
              id: purchase.id,
              ref_code: purchase.ref_code,
              type: "own_site",
              purchase_date: purchase.purchase_date,
              material_name: firstItem?.material?.name || "Materials",
              material_id: firstItem?.material?.id || null,
              brand_name: firstItem?.brand?.brand_name || null,
              quantity: purchase.items?.reduce((sum: number, i: any) => sum + Number(i.quantity || 0), 0) || null,
              unit: firstItem?.material?.unit || null,
              amount: displayAmount,
              source_ref: purchase.purchase_order?.po_number || purchase.ref_code,
              status: purchase.settlement_reference ? "settled" : "paid",
              vendor_name: purchase.vendor_name,
              bill_url: purchase.bill_url,
              purchase_expense_id: purchase.id,
              batch_ref_code: null,
              settlement_reference: purchase.settlement_reference,
            });
          }
        }

        // 2. Fetch allocated expenses from inter-site settlements
        const { data: allocatedExpenses, error: allocatedError } = await (supabase as any)
          .from("material_purchase_expenses")
          .select(`
            id,
            ref_code,
            purchase_date,
            total_amount,
            amount_paid,
            original_batch_code,
            settlement_reference,
            vendor_name,
            bill_url,
            items:material_purchase_expense_items(
              quantity,
              material:materials(id, name, unit),
              brand:material_brands(brand_name)
            )
          `)
          .eq("site_id", siteId)
          .not("original_batch_code", "is", null)
          .not("settlement_reference", "is", null)
          .neq("settlement_reference", "SELF-USE")
          .order("purchase_date", { ascending: false });

        if (allocatedError) {
          console.warn("Allocated expenses query failed:", allocatedError.message);
        } else {
          for (const expense of (allocatedExpenses || [])) {
            const firstItem = expense.items?.[0];
            // Use amount_paid (settled amount after bargaining) if available, otherwise total_amount
            const displayAmount = Number(expense.amount_paid || expense.total_amount || 0);
            expenses.push({
              id: expense.id,
              ref_code: expense.ref_code,
              type: "allocated",
              purchase_date: expense.purchase_date,
              material_name: firstItem?.material?.name || "Materials",
              material_id: firstItem?.material?.id || null,
              brand_name: firstItem?.brand?.brand_name || null,
              quantity: expense.items?.reduce((sum: number, i: any) => sum + Number(i.quantity || 0), 0) || null,
              unit: firstItem?.material?.unit || null,
              amount: displayAmount,
              source_ref: expense.settlement_reference || expense.original_batch_code,
              status: "settled",
              vendor_name: expense.vendor_name,
              bill_url: expense.bill_url,
              purchase_expense_id: expense.id,
              batch_ref_code: expense.original_batch_code,
              settlement_reference: expense.settlement_reference,
            });
          }
        }

        // 3. Fetch self-use from group batches where this site paid
        // These are created when batch settlement is complete (with settlement_reference = 'SELF-USE')
        const { data: selfUseExpenses, error: selfUseError } = await (supabase as any)
          .from("material_purchase_expenses")
          .select(`
            id,
            ref_code,
            purchase_date,
            total_amount,
            amount_paid,
            original_batch_code,
            settlement_reference,
            vendor_name,
            bill_url,
            items:material_purchase_expense_items(
              quantity,
              material:materials(id, name, unit),
              brand:material_brands(brand_name)
            )
          `)
          .eq("site_id", siteId)
          .not("original_batch_code", "is", null)
          .eq("settlement_reference", "SELF-USE")
          .order("purchase_date", { ascending: false });

        if (selfUseError) {
          console.warn("Self-use expenses query failed:", selfUseError.message);
        } else {
          for (const expense of (selfUseExpenses || [])) {
            const firstItem = expense.items?.[0];
            // Use amount_paid (settled amount after bargaining) if available, otherwise total_amount
            const displayAmount = Number(expense.amount_paid || expense.total_amount || 0);
            expenses.push({
              id: expense.id,
              ref_code: expense.ref_code,
              type: "self_use",
              purchase_date: expense.purchase_date,
              material_name: firstItem?.material?.name || "Materials",
              material_id: firstItem?.material?.id || null,
              brand_name: firstItem?.brand?.brand_name || null,
              quantity: expense.items?.reduce((sum: number, i: any) => sum + Number(i.quantity || 0), 0) || null,
              unit: firstItem?.material?.unit || null,
              amount: displayAmount,
              source_ref: `Self-use from ${expense.original_batch_code}`,
              status: "settled",
              vendor_name: expense.vendor_name,
              bill_url: expense.bill_url,
              purchase_expense_id: expense.id,
              batch_ref_code: expense.original_batch_code,
              settlement_reference: expense.settlement_reference,
            });
          }
        }

        // Sort by date descending
        expenses.sort((a, b) => new Date(b.purchase_date).getTime() - new Date(a.purchase_date).getTime());

        const total = expenses.reduce((sum, exp) => sum + exp.amount, 0);

        return { expenses, total };
      } catch (err) {
        if (isQueryError(err)) {
          console.warn("Site level material expenses query failed:", err);
          return { expenses: [] as SiteMaterialExpense[], total: 0 };
        }
        throw err;
      }
    },
    enabled: !!siteId,
  });
}

// ============================================
// DELETE BATCH WITH CASCADE
// ============================================

/**
 * Delete a batch and all related records (settlements, usage records, transactions, items)
 * Uses the delete_batch_cascade database function which handles all cascading deletes
 * Also manually deletes group_stock_transactions that reference the batch
 */
export function useDeleteBatchCascade() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (batchRefCode: string) => {
      await ensureFreshSession();

      // First, get the batch details for cache invalidation
      const { data: batch, error: fetchError } = await (supabase as any)
        .from("material_purchase_expenses")
        .select("id, site_id, site_group_id, ref_code")
        .eq("ref_code", batchRefCode)
        .single();

      if (fetchError) throw fetchError;

      // Find inventory records linked to this batch (by batch_code)
      // Usage transactions might have batch_ref_code = NULL but share the same inventory_id
      const { data: inventoryRecords } = await (supabase as any)
        .from("group_stock_inventory")
        .select("id")
        .eq("batch_code", batchRefCode);

      const inventoryIds = (inventoryRecords || []).map((inv: { id: string }) => inv.id);
      console.log("Found inventory records for batch:", inventoryIds.length);

      // Step 1: Get settlement IDs and transaction IDs for this batch
      const { data: settlements } = await (supabase as any)
        .from("inter_site_material_settlements")
        .select("id")
        .eq("batch_ref_code", batchRefCode);

      const settlementIds = (settlements || []).map((s: { id: string }) => s.id);

      const { data: transactions } = await (supabase as any)
        .from("group_stock_transactions")
        .select("id")
        .eq("batch_ref_code", batchRefCode);

      const transactionIds = (transactions || []).map((t: { id: string }) => t.id);

      // Step 2: Delete inter_site_settlement_items FIRST (they have FK to transactions)
      // This prevents 409 Conflict when deleting transactions
      if (settlementIds.length > 0) {
        const { error: settlementItemsError } = await (supabase as any)
          .from("inter_site_settlement_items")
          .delete()
          .in("settlement_id", settlementIds);

        if (settlementItemsError) {
          console.warn("Warning: Could not delete inter_site_settlement_items by settlement_id:", settlementItemsError);
        }
      }

      // Also delete by transaction_id (some items may reference transactions directly)
      if (transactionIds.length > 0) {
        const { error: itemsByTxError } = await (supabase as any)
          .from("inter_site_settlement_items")
          .delete()
          .in("transaction_id", transactionIds);

        if (itemsByTxError) {
          console.warn("Warning: Could not delete inter_site_settlement_items by transaction_id:", itemsByTxError);
        }
      }

      // Step 3: Delete settlement payments
      if (settlementIds.length > 0) {
        await (supabase as any)
          .from("inter_site_settlement_payments")
          .delete()
          .in("settlement_id", settlementIds);
      }

      // Step 4: Delete settlement expense allocations
      if (settlementIds.length > 0) {
        await (supabase as any)
          .from("settlement_expense_allocations")
          .delete()
          .in("settlement_id", settlementIds);
      }

      // Step 5: Delete settlements
      if (settlementIds.length > 0) {
        await (supabase as any)
          .from("inter_site_material_settlements")
          .delete()
          .in("id", settlementIds);
      }

      // Step 6: Delete batch_usage_records
      const { error: usageRecordsError } = await (supabase as any)
        .from("batch_usage_records")
        .delete()
        .eq("batch_ref_code", batchRefCode);

      if (usageRecordsError) {
        console.warn("Warning: Could not delete batch_usage_records:", usageRecordsError);
      }

      // Step 7: Delete group_stock_transactions (NOW safe - FK references removed)
      const { error: txDeleteError } = await (supabase as any)
        .from("group_stock_transactions")
        .delete()
        .eq("batch_ref_code", batchRefCode);

      if (txDeleteError) {
        console.warn("Warning: Could not delete group_stock_transactions by batch_ref_code:", txDeleteError);
      }

      // Step 8: Delete transactions by inventory_id (catches usage transactions without batch_ref_code)
      if (inventoryIds.length > 0) {
        const { error: txByInvError } = await (supabase as any)
          .from("group_stock_transactions")
          .delete()
          .in("inventory_id", inventoryIds);

        if (txByInvError) {
          console.warn("Warning: Could not delete group_stock_transactions by inventory_id:", txByInvError);
        } else {
          console.log("Deleted transactions by inventory_id for", inventoryIds.length, "inventory records");
        }
      }

      // Step 9: Delete allocated expenses (debtor expenses created from this batch)
      const { error: allocatedError } = await (supabase as any)
        .from("material_purchase_expenses")
        .delete()
        .eq("original_batch_code", batchRefCode);

      if (allocatedError) {
        console.warn("Warning: Could not delete allocated expenses:", allocatedError);
      }

      // Delete inventory records linked to this batch
      if (inventoryIds.length > 0) {
        const { error: invDeleteError } = await (supabase as any)
          .from("group_stock_inventory")
          .delete()
          .in("id", inventoryIds);

        if (invDeleteError) {
          console.warn("Warning: Could not delete group_stock_inventory:", invDeleteError);
        } else {
          console.log("Deleted inventory records:", inventoryIds.length);
        }
      }

      // Call the database function to delete batch and all related records
      const { data, error } = await (supabase as any).rpc("delete_batch_cascade", {
        p_batch_ref_code: batchRefCode,
      });

      if (error) throw error;

      return { batch, deletionResult: data };
    },
    onSuccess: (result) => {
      const { batch, deletionResult } = result;

      console.log('Batch deleted with cascade:', {
        batch_ref_code: batch.ref_code,
        deleted_settlements: deletionResult[0]?.deleted_settlements,
        deleted_usage_records: deletionResult[0]?.deleted_usage_records,
        deleted_transactions: deletionResult[0]?.deleted_transactions,
        deleted_expense_items: deletionResult[0]?.deleted_expense_items,
      });

      // Invalidate all related queries
      // Material purchases queries
      queryClient.invalidateQueries({
        queryKey: queryKeys.materialPurchases.all,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.materialPurchases.bySite(batch.site_id),
      });

      // Group stock queries
      if (batch.site_group_id) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.groupStock.byGroup(batch.site_group_id),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.groupStock.transactions(batch.site_group_id),
        });
      }

      // Batch usage queries
      queryClient.invalidateQueries({
        queryKey: queryKeys.batchUsage.all,
      });

      // Settlement queries - invalidate all to ensure transactions are refreshed
      queryClient.invalidateQueries({
        queryKey: queryKeys.interSiteSettlements.all,
      });

      // Also invalidate the balances query which is used as base for transactions
      if (batch.site_group_id) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.interSiteSettlements.balances(batch.site_group_id),
        });
      }
    },
    onError: (error) => {
      console.error("Delete batch cascade error:", error);
    },
  });
}
