"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient, ensureFreshSession } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/cache/keys";
import type {
  StockInventory,
  StockInventoryWithDetails,
  StockLocation,
  StockTransaction,
  StockAdjustmentFormData,
  LowStockAlert,
} from "@/types/material.types";

// ============================================
// STOCK LOCATIONS
// ============================================

/**
 * Fetch stock locations for a site
 */
export function useStockLocations(siteId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: siteId
      ? ["stock-locations", siteId]
      : ["stock-locations", "unknown"],
    queryFn: async () => {
      if (!siteId) return [];

      const { data, error } = await supabase
        .from("stock_locations")
        .select("*")
        .eq("site_id", siteId)
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      return data as StockLocation[];
    },
    enabled: !!siteId,
  });
}

/**
 * Create a stock location
 */
export function useCreateStockLocation() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (data: Partial<StockLocation>) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      const { data: result, error } = await (
        supabase.from("stock_locations") as any
      )
        .insert(data)
        .select()
        .single();

      if (error) throw error;
      return result as StockLocation;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["stock-locations", variables.site_id],
      });
    },
  });
}

// ============================================
// STOCK INVENTORY
// ============================================

/**
 * Extended stock type that includes shared/group stock information and pricing mode
 */
export type ExtendedStockInventory = StockInventoryWithDetails & {
  is_shared: boolean;
  is_dedicated?: boolean;
  paid_by_site_id?: string | null;
  paid_by_site_name?: string | null;
  batch_code?: string | null;
  pricing_mode?: "per_piece" | "per_kg";
  total_weight?: number | null;
  batch_unit_cost?: number | null; // Original unit cost from batch purchase (for shared stock)
  batch_raw_unit_price?: number | null; // Raw per-unit price before GST (e.g., ₹52.12/kg)
  batch_tax_ratio?: number | null; // GST multiplier (e.g., 1.18 for 18% GST)
  batch_total_amount?: number | null; // Total batch purchase amount incl. GST
  batch_original_qty?: number | null; // Original qty purchased for this material
  is_vendor_paid?: boolean | null; // Whether vendor has been paid for this batch
};

/**
 * Fetch site stock inventory with material details
 * Includes both:
 * 1. Site's own inventory (site_id = current site)
 * 2. Shared group stock from other paying sites in the same group (if siteGroupId provided)
 *
 * Determines is_shared based on:
 * - Items from other sites = is_shared: true (group stock)
 * - Items with batch_code on own site = is_shared: true (self-paid group purchase)
 * - Items without batch_code on own site = is_shared: false (site purchase)
 */
export function useSiteStock(
  siteId: string | undefined,
  options?: {
    locationId?: string;
    siteGroupId?: string | null;
  }
) {
  const supabase = createClient();
  const locationId = options?.locationId;
  const siteGroupId = options?.siteGroupId;

  return useQuery({
    queryKey: siteId
      ? locationId
        ? [...queryKeys.materialStock.bySite(siteId), locationId, ...(siteGroupId ? [siteGroupId] : [])]
        : [...queryKeys.materialStock.bySite(siteId), ...(siteGroupId ? [siteGroupId] : [])]
      : ["site-stock", "unknown"],
    queryFn: async () => {
      if (!siteId) return [];

      // 1. Query stock_inventory for this site's own stock
      let ownStockQuery = supabase
        .from("stock_inventory")
        .select(
          `
          *,
          pricing_mode,
          total_weight,
          material:materials(id, name, code, unit, category_id, reorder_level, weight_per_unit, length_per_piece, gst_rate),
          brand:material_brands(id, brand_name),
          location:stock_locations(id, name)
        `
        )
        .eq("site_id", siteId)
        .gt("current_qty", 0);

      if (locationId) {
        ownStockQuery = ownStockQuery.eq("location_id", locationId);
      }

      const { data: ownStockData, error: ownError } = await ownStockQuery.order("material(name)");
      if (ownError) throw ownError;

      // Collect batch codes from own stock for unit cost lookup
      const ownBatchCodes = (ownStockData || [])
        .map((item: any) => item.batch_code)
        .filter((code: string | null) => code && code.trim().length > 0);

      // Fetch per-material GST-inclusive batch unit costs for own stock batch codes
      const ownBatchUnitCosts = new Map<string, number>(); // Key: "ref_code|material_id"
      const ownBatchRawUnitPrice = new Map<string, number>();
      const ownBatchTaxRatio = new Map<string, number>();
      const ownBatchTotalAmount = new Map<string, number>(); // Key: "ref_code" (batch-level)
      const ownBatchOriginalQty = new Map<string, number>();
      const ownBatchIsPaid = new Map<string, boolean>(); // Vendor settlement status per batch
      if (ownBatchCodes.length > 0) {
        // Step 1: Get expense records (for total_amount which includes GST)
        const { data: ownExpenses, error: expenseError } = await supabase
          .from("material_purchase_expenses")
          .select("id, ref_code, total_amount, is_paid")
          .in("ref_code", ownBatchCodes);

        if (expenseError) {
          console.warn("[useSiteStock] Failed to fetch batch expenses:", expenseError);
        }

        // Build is_paid map for own batch vendor settlement status
        if (ownExpenses) {
          ownExpenses.forEach((e: any) => {
            if (e.ref_code) ownBatchIsPaid.set(e.ref_code, !!e.is_paid);
          });
        }

        if (ownExpenses && ownExpenses.length > 0) {
          const expenseIds = ownExpenses.map((e: any) => e.id);
          const expenseMap = new Map(ownExpenses.map((e: any) => [e.id, e]));

          // Step 2: Get per-material unit prices from expense items
          const { data: expenseItems, error: itemsError } = await supabase
            .from("material_purchase_expense_items")
            .select("purchase_expense_id, material_id, unit_price, total_price, quantity")
            .in("purchase_expense_id", expenseIds);

          if (itemsError) {
            console.warn("[useSiteStock] Failed to fetch expense items:", itemsError);
          }

          if (expenseItems) {
            // Calculate GST ratio per expense: total_amount / sum(item.total_price)
            const itemsTotalByExpense = new Map<string, number>();
            expenseItems.forEach((item: any) => {
              const prev = itemsTotalByExpense.get(item.purchase_expense_id) || 0;
              itemsTotalByExpense.set(item.purchase_expense_id, prev + Number(item.total_price || 0));
            });

            expenseItems.forEach((item: any) => {
              const expense = expenseMap.get(item.purchase_expense_id);
              if (expense && item.material_id && item.unit_price != null) {
                const refCode = expense.ref_code;
                const itemsTotal = itemsTotalByExpense.get(item.purchase_expense_id) || 0;
                // GST ratio = total_amount (incl tax) / sum of item totals (excl tax)
                const taxRatio = itemsTotal > 0 ? Number(expense.total_amount) / itemsTotal : 1;
                const gstInclusiveUnitPrice = Number(item.unit_price) * taxRatio;
                const key = `${refCode}|${item.material_id}`;
                ownBatchUnitCosts.set(key, gstInclusiveUnitPrice);
                ownBatchRawUnitPrice.set(key, Number(item.unit_price));
                ownBatchTaxRatio.set(key, taxRatio);
                ownBatchTotalAmount.set(refCode, Number(expense.total_amount));
                if (item.quantity != null) {
                  ownBatchOriginalQty.set(key, Number(item.quantity));
                }
                console.log(`[useSiteStock] Batch ${refCode} material ${item.material_id}: unit_price=${item.unit_price}, taxRatio=${taxRatio.toFixed(2)}, gst_inclusive=${gstInclusiveUnitPrice.toFixed(2)}`);
              }
            });
          }
        }
      }

      // Map site's own stock items
      const ownStock: ExtendedStockInventory[] = ((ownStockData || []) as any[]).map(
        (item) => {
          const hasBatchCode = item.batch_code && item.batch_code.trim().length > 0;
          return {
            ...item,
            is_shared: hasBatchCode, // Own stock with batch_code = shared (self-paid group purchase)
            is_dedicated: false,
            paid_by_site_id: siteId,
            paid_by_site_name: null, // Own site paid
            batch_code: item.batch_code || null,
            pricing_mode: item.pricing_mode || "per_piece",
            total_weight: item.total_weight ? Number(item.total_weight) : null,
            batch_unit_cost: hasBatchCode && item.material_id
              ? ownBatchUnitCosts.get(`${item.batch_code}|${item.material_id}`) || null
              : null,
            batch_raw_unit_price: hasBatchCode && item.material_id
              ? ownBatchRawUnitPrice.get(`${item.batch_code}|${item.material_id}`) || null
              : null,
            batch_tax_ratio: hasBatchCode && item.material_id
              ? ownBatchTaxRatio.get(`${item.batch_code}|${item.material_id}`) || null
              : null,
            batch_total_amount: hasBatchCode
              ? ownBatchTotalAmount.get(item.batch_code) || null
              : null,
            batch_original_qty: hasBatchCode && item.material_id
              ? ownBatchOriginalQty.get(`${item.batch_code}|${item.material_id}`) || null
              : null,
            is_vendor_paid: hasBatchCode
              ? ownBatchIsPaid.get(item.batch_code) ?? null
              : null,
          };
        }
      );

      // 2. If site is in a group, also fetch shared group stock from other sites
      let sharedStock: ExtendedStockInventory[] = [];

      if (siteGroupId) {
        // Query group stock from material_purchase_expenses with batch_code
        // This gets stock from OTHER paying sites in the same group
        const { data: sharedStockData, error: sharedError } = await supabase
          .from("stock_inventory")
          .select(
            `
            *,
            pricing_mode,
            total_weight,
            material:materials(id, name, code, unit, category_id, reorder_level, weight_per_unit, length_per_piece, gst_rate),
            brand:material_brands(id, brand_name),
            location:stock_locations(id, name),
            site:sites(id, name)
          `
          )
          .neq("site_id", siteId) // NOT from current site
          .gt("current_qty", 0)
          .not("batch_code", "is", null); // Must have batch_code (group purchase)

        if (sharedError) {
          console.warn("Failed to fetch shared group stock:", sharedError);
        } else {
          // Filter to only include stock from group purchases in the same site_group
          // We need to verify the batch_code links to a group purchase in this group
          const batchCodes = [...new Set((sharedStockData || []).map((s: any) => s.batch_code).filter(Boolean))];

          if (batchCodes.length > 0) {
            console.log(`[useSiteStock] Looking up batch codes:`, batchCodes);

            // Query by batch codes only - removed purchase_type filter as it was too restrictive
            const { data: groupPurchases, error: gpError } = await supabase
              .from("material_purchase_expenses")
              .select("id, ref_code, paying_site_id, site_group_id, total_amount, is_paid, paying_site:sites!material_purchase_expenses_paying_site_id_fkey(name)")
              .in("ref_code", batchCodes);

            if (gpError) {
              console.warn("[useSiteStock] Failed to fetch group purchase expenses:", gpError);
            }
            console.log(`[useSiteStock] Shared stock: Found ${batchCodes.length} batch codes, matched ${(groupPurchases || []).length} expenses`);

            // Log which batch codes were not found
            if (groupPurchases) {
              const foundCodes = new Set(groupPurchases.map((p: any) => p.ref_code));
              const missingCodes = batchCodes.filter(code => !foundCodes.has(code));
              if (missingCodes.length > 0) {
                console.warn(`[useSiteStock] Missing expense records for batch codes:`, missingCodes);
              }
            }

            const validBatchCodes = new Set((groupPurchases || []).map((p: any) => p.ref_code));
            const batchToPayingSite = new Map((groupPurchases || []).map((p: any) => [p.ref_code, p.paying_site_id]));
            const batchIsPaid = new Map<string, boolean>(
              (groupPurchases || []).map((p: any) => [p.ref_code, !!p.is_paid])
            );
            const batchToPayingSiteName = new Map<string, string>(
              (groupPurchases || [])
                .filter((p: any) => p.paying_site?.name)
                .map((p: any) => [p.ref_code, p.paying_site.name])
            );

            // Calculate per-material GST-inclusive unit costs
            const batchMaterialUnitCost = new Map<string, number>(); // Key: "ref_code|material_id"
            const sharedBatchRawUnitPrice = new Map<string, number>();
            const sharedBatchTaxRatio = new Map<string, number>();
            const sharedBatchTotalAmount = new Map<string, number>(); // Key: "ref_code"
            const sharedBatchOriginalQty = new Map<string, number>();

            if (groupPurchases && groupPurchases.length > 0) {
              const gpExpenseIds = groupPurchases.map((p: any) => p.id);
              const gpExpenseMap = new Map(groupPurchases.map((p: any) => [p.id, p]));

              const { data: sharedExpenseItems, error: sharedItemsError } = await supabase
                .from("material_purchase_expense_items")
                .select("purchase_expense_id, material_id, unit_price, total_price, quantity")
                .in("purchase_expense_id", gpExpenseIds);

              if (sharedItemsError) {
                console.warn("[useSiteStock] Failed to fetch shared expense items:", sharedItemsError);
              }

              if (sharedExpenseItems) {
                // Calculate items_total per expense for GST ratio
                const sharedItemsTotalByExpense = new Map<string, number>();
                sharedExpenseItems.forEach((item: any) => {
                  const prev = sharedItemsTotalByExpense.get(item.purchase_expense_id) || 0;
                  sharedItemsTotalByExpense.set(item.purchase_expense_id, prev + Number(item.total_price || 0));
                });

                sharedExpenseItems.forEach((item: any) => {
                  const expense = gpExpenseMap.get(item.purchase_expense_id);
                  if (expense && item.material_id && item.unit_price != null) {
                    const refCode = expense.ref_code;
                    const itemsTotal = sharedItemsTotalByExpense.get(item.purchase_expense_id) || 0;
                    const taxRatio = itemsTotal > 0 ? Number(expense.total_amount) / itemsTotal : 1;
                    const gstInclusiveUnitPrice = Number(item.unit_price) * taxRatio;
                    batchMaterialUnitCost.set(`${refCode}|${item.material_id}`, gstInclusiveUnitPrice);
                    sharedBatchRawUnitPrice.set(`${refCode}|${item.material_id}`, Number(item.unit_price));
                    sharedBatchTaxRatio.set(`${refCode}|${item.material_id}`, taxRatio);
                    sharedBatchTotalAmount.set(refCode, Number(expense.total_amount));
                    if (item.quantity != null) {
                      sharedBatchOriginalQty.set(`${refCode}|${item.material_id}`, Number(item.quantity));
                    }
                    console.log(`[useSiteStock] Shared batch ${refCode} material ${item.material_id}: unit_price=${item.unit_price}, taxRatio=${taxRatio.toFixed(2)}, gst_inclusive=${gstInclusiveUnitPrice.toFixed(2)}`);
                  }
                });
              }
            }

            sharedStock = ((sharedStockData || []) as any[])
              .filter((item) => validBatchCodes.has(item.batch_code))
              .map((item) => ({
                ...item,
                is_shared: true,
                is_dedicated: false,
                paid_by_site_id: batchToPayingSite.get(item.batch_code) || item.site_id,
                paid_by_site_name: batchToPayingSiteName.get(item.batch_code) || item.site?.name || null,
                batch_code: item.batch_code,
                pricing_mode: item.pricing_mode || "per_piece",
                total_weight: item.total_weight ? Number(item.total_weight) : null,
                batch_unit_cost: item.material_id
                  ? batchMaterialUnitCost.get(`${item.batch_code}|${item.material_id}`) || null
                  : null,
                batch_raw_unit_price: item.material_id
                  ? sharedBatchRawUnitPrice.get(`${item.batch_code}|${item.material_id}`) || null
                  : null,
                batch_tax_ratio: item.material_id
                  ? sharedBatchTaxRatio.get(`${item.batch_code}|${item.material_id}`) || null
                  : null,
                batch_total_amount: sharedBatchTotalAmount.get(item.batch_code) || null,
                batch_original_qty: item.material_id
                  ? sharedBatchOriginalQty.get(`${item.batch_code}|${item.material_id}`) || null
                  : null,
                is_vendor_paid: batchIsPaid.get(item.batch_code) ?? null,
              }));
          }
        }
      }

      // Combine own stock and shared group stock
      return [...ownStock, ...sharedStock];
    },
    enabled: !!siteId,
  });
}

/**
 * Fetch all stock for a site (including zero stock)
 */
export function useSiteStockAll(siteId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: siteId
      ? [...queryKeys.materialStock.bySite(siteId), "all"]
      : ["site-stock", "all"],
    queryFn: async () => {
      if (!siteId) return [];

      const { data, error } = await supabase
        .from("stock_inventory")
        .select(
          `
          *,
          material:materials(id, name, code, unit, category_id, reorder_level),
          brand:material_brands(id, brand_name),
          location:stock_locations(id, name)
        `
        )
        .eq("site_id", siteId)
        .order("material(name)");

      if (error) throw error;
      return (data as unknown) as StockInventoryWithDetails[];
    },
    enabled: !!siteId,
  });
}

/**
 * Completed stock type for historical view
 */
export interface CompletedStockItem {
  id: string;
  material_id: string;
  material_name: string;
  material_code?: string;
  brand_name?: string;
  original_qty: number;
  unit: string;
  total_value: number;
  avg_unit_cost: number;
  completion_date: string | null;
  last_received_date: string | null;
  is_shared: boolean;
  batch_code?: string | null;
  po_reference?: string | null;
}

/**
 * Fetch completed/consumed stocks for a site (current_qty = 0)
 * Shows historical view of materials that were fully used
 */
export function useCompletedStock(siteId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: siteId
      ? [...queryKeys.materialStock.bySite(siteId), "completed"]
      : ["site-stock", "completed"],
    queryFn: async () => {
      if (!siteId) return [] as CompletedStockItem[];

      // Get completed site stock (qty = 0 but has history)
      const { data: completedStock, error } = await supabase
        .from("stock_inventory")
        .select(
          `
          id,
          material_id,
          brand_id,
          current_qty,
          avg_unit_cost,
          last_received_date,
          last_issued_date,
          batch_code,
          material:materials(id, name, code, unit),
          brand:material_brands(brand_name)
        `
        )
        .eq("site_id", siteId)
        .eq("current_qty", 0)
        .order("last_issued_date", { ascending: false });

      if (error) throw error;

      // Fetch original delivered quantities from stock_transactions
      const inventoryIds = (completedStock || []).map((item: any) => item.id);
      const batchCodes = (completedStock || [])
        .filter((item: any) => item.batch_code?.trim())
        .map((item: any) => item.batch_code);
      let originalQtyMap: Record<string, number> = {};

      if (inventoryIds.length > 0) {
        const { data: purchaseTransactions } = await supabase
          .from("stock_transactions")
          .select("inventory_id, quantity")
          .in("inventory_id", inventoryIds)
          .eq("transaction_type", "purchase");

        if (purchaseTransactions) {
          for (const txn of purchaseTransactions) {
            originalQtyMap[txn.inventory_id] = (originalQtyMap[txn.inventory_id] || 0) + txn.quantity;
          }
        }

        // For batch-coded items without stock_transactions, fall back to material_purchase_expenses
        if (batchCodes.length > 0) {
          const { data: mpeRecords } = await supabase
            .from("material_purchase_expenses")
            .select("ref_code, original_qty")
            .in("ref_code", batchCodes);

          if (mpeRecords) {
            const mpeMap: Record<string, number> = {};
            for (const mpe of mpeRecords) {
              if (mpe.ref_code) mpeMap[mpe.ref_code] = mpe.original_qty ?? 0;
            }
            // Fill in missing original_qty from MPE for batch-coded items
            for (const item of completedStock || []) {
              const si = item as any;
              if (si.batch_code?.trim() && !originalQtyMap[si.id] && mpeMap[si.batch_code]) {
                originalQtyMap[si.id] = mpeMap[si.batch_code];
              }
            }
          }
        }
      }

      // Transform to CompletedStockItem format
      const completedItems: CompletedStockItem[] = ((completedStock || []) as any[]).map((item) => {
        const hasBatchCode = !!(item.batch_code && item.batch_code.trim().length > 0);
        return {
          id: item.id,
          material_id: item.material_id,
          material_name: item.material?.name || "Unknown Material",
          material_code: item.material?.code,
          brand_name: item.brand?.brand_name,
          original_qty: originalQtyMap[item.id] || 0,
          unit: item.material?.unit || "nos",
          total_value: (originalQtyMap[item.id] || 0) * (item.avg_unit_cost || 0),
          avg_unit_cost: item.avg_unit_cost || 0,
          completion_date: item.last_issued_date,
          last_received_date: item.last_received_date,
          is_shared: hasBatchCode,
          batch_code: item.batch_code,
          po_reference: null,
        };
      });

      return completedItems;
    },
    enabled: !!siteId,
  });
}

/**
 * Fetch low stock alerts for a site
 */
export function useLowStockAlerts(siteId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: siteId
      ? queryKeys.materialStock.lowStock(siteId)
      : ["material-stock", "low"],
    queryFn: async () => {
      if (!siteId) return [];

      const { data, error } = await supabase
        .from("v_low_stock_alerts")
        .select("*")
        .eq("site_id", siteId);

      if (error) throw error;
      return data as LowStockAlert[];
    },
    enabled: !!siteId,
  });
}

/**
 * Fetch stock summary across all sites
 */
export function useStockSummary() {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.materialStock.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_site_stock_summary")
        .select("*")
        .order("site_name");

      if (error) throw error;
      return data;
    },
  });
}

/**
 * Manual stock adjustment
 */
export function useStockAdjustment() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    retry: false, // Not idempotent - modifies stock quantity
    mutationFn: async (data: StockAdjustmentFormData) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      const { inventory_id, adjustment_qty, adjustment_type, notes } = data;

      // Get current inventory
      const { data: inventory, error: fetchError } = await supabase
        .from("stock_inventory")
        .select("*, material:materials(name)")
        .eq("id", inventory_id)
        .single();

      if (fetchError) throw fetchError;

      const newQty = inventory.current_qty + adjustment_qty;
      if (newQty < 0) {
        throw new Error("Cannot reduce stock below zero");
      }

      // Update inventory
      const { error: updateError } = await supabase
        .from("stock_inventory")
        .update({
          current_qty: newQty,
          updated_at: new Date().toISOString(),
        })
        .eq("id", inventory_id);

      if (updateError) throw updateError;

      // Create transaction record
      const { error: txError } = await supabase
        .from("stock_transactions")
        .insert({
          site_id: inventory.site_id,
          inventory_id: inventory_id,
          transaction_type: adjustment_type,
          transaction_date: new Date().toISOString().split("T")[0],
          quantity: adjustment_qty,
          unit_cost: inventory.avg_unit_cost,
          total_cost: Math.abs(adjustment_qty) * (inventory.avg_unit_cost || 0),
          notes,
        });

      if (txError) console.error("Failed to create transaction:", txError);

      return { success: true, newQty, siteId: inventory.site_id };
    },
    onSuccess: (result) => {
      const siteKey = result.siteId
        ? queryKeys.materialStock.bySite(result.siteId)
        : ["site-stock"];

      queryClient.invalidateQueries({ queryKey: siteKey });
      if (result.siteId) {
        queryClient.invalidateQueries({ queryKey: [...siteKey, "all"] });
        queryClient.invalidateQueries({
          queryKey: queryKeys.materialStock.lowStock(result.siteId),
        });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.materialStock.all });
    },
  });
}

// ============================================
// STOCK TRANSACTIONS
// ============================================

/**
 * Fetch stock transactions for a site
 */
export function useStockTransactions(
  siteId: string | undefined,
  options?: {
    startDate?: string;
    endDate?: string;
    materialId?: string;
    transactionType?: string;
    limit?: number;
  }
) {
  const supabase = createClient();

  return useQuery({
    queryKey: siteId
      ? [...queryKeys.materialStock.bySite(siteId), "transactions", options]
      : ["stock-transactions", "unknown"],
    queryFn: async () => {
      if (!siteId) return [];

      let query = supabase
        .from("stock_transactions")
        .select(
          `
          *,
          inventory:stock_inventory(
            material:materials(id, name, code, unit),
            brand:material_brands(brand_name)
          ),
          section:building_sections(name)
        `
        )
        .eq("site_id", siteId)
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (options?.startDate) {
        query = query.gte("transaction_date", options.startDate);
      }
      if (options?.endDate) {
        query = query.lte("transaction_date", options.endDate);
      }
      if (options?.transactionType) {
        query = query.eq("transaction_type", options.transactionType as any);
      }
      if (options?.limit) {
        query = query.limit(options.limit);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!siteId,
  });
}

// ============================================
// GROUP STOCK INVENTORY
// ============================================

/**
 * Group stock item type
 */
export interface GroupStockItem {
  id: string;
  site_group_id: string;
  material_id: string;
  brand_id: string | null;
  location_id: string | null;
  current_qty: number;
  reserved_qty: number;
  available_qty: number;
  avg_unit_cost: number;
  total_value: number;
  last_received_date: string | null;
  last_used_date: string | null;
  reorder_level: number | null;
  reorder_qty: number | null;
  batch_code: string | null;
  is_dedicated: boolean;
  dedicated_site_id: string | null;
  can_be_shared: boolean;
  created_at: string;
  updated_at: string;
  // Joined fields
  material?: {
    id: string;
    name: string;
    code?: string;
    unit: string;
  };
  brand?: {
    id: string;
    brand_name: string;
  };
  location?: {
    id: string;
    name: string;
  };
  dedicated_site?: {
    id: string;
    name: string;
  };
}

/**
 * Fetch group stock inventory for a site group
 * Shows uncompleted batches that haven't been fully allocated
 */
export function useGroupStockInventory(siteGroupId: string | undefined | null) {
  const supabase = createClient();

  return useQuery({
    queryKey: siteGroupId
      ? ["group-stock-inventory", siteGroupId]
      : ["group-stock-inventory", "unknown"],
    queryFn: async () => {
      if (!siteGroupId) return [] as GroupStockItem[];

      const { data, error } = await supabase
        .from("group_stock_inventory")
        .select(
          `
          *,
          material:materials(id, name, code, unit),
          brand:material_brands(id, brand_name),
          location:stock_locations(id, name),
          dedicated_site:sites!group_stock_inventory_dedicated_site_id_fkey(id, name)
        `
        )
        .eq("site_group_id", siteGroupId)
        .gt("current_qty", 0)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as GroupStockItem[];
    },
    enabled: !!siteGroupId,
  });
}

/**
 * Fetch all group stock for a site group (including zero stock)
 */
export function useGroupStockInventoryAll(siteGroupId: string | undefined | null) {
  const supabase = createClient();

  return useQuery({
    queryKey: siteGroupId
      ? ["group-stock-inventory", siteGroupId, "all"]
      : ["group-stock-inventory", "all"],
    queryFn: async () => {
      if (!siteGroupId) return [] as GroupStockItem[];

      const { data, error } = await supabase
        .from("group_stock_inventory")
        .select(
          `
          *,
          material:materials(id, name, code, unit),
          brand:material_brands(id, brand_name),
          location:stock_locations(id, name),
          dedicated_site:sites!group_stock_inventory_dedicated_site_id_fkey(id, name)
        `
        )
        .eq("site_group_id", siteGroupId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as GroupStockItem[];
    },
    enabled: !!siteGroupId,
  });
}

// ============================================
// INITIAL STOCK ENTRY
// ============================================

/**
 * Add initial stock to a site
 */
export function useAddInitialStock() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (data: {
      site_id: string;
      location_id?: string;
      material_id: string;
      brand_id?: string;
      quantity: number;
      unit_cost: number;
    }) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      const {
        site_id,
        location_id,
        material_id,
        brand_id,
        quantity,
        unit_cost,
      } = data;

      // Check if inventory record exists
      let query = supabase
        .from("stock_inventory")
        .select("id, current_qty, avg_unit_cost")
        .eq("site_id", site_id)
        .eq("material_id", material_id);

      if (location_id) {
        query = query.eq("location_id", location_id);
      } else {
        query = query.is("location_id", null);
      }

      if (brand_id) {
        query = query.eq("brand_id", brand_id);
      } else {
        query = query.is("brand_id", null);
      }

      const { data: existing } = await query.maybeSingle();

      let inventoryId: string;

      if (existing) {
        // Update existing
        const newQty = existing.current_qty + quantity;
        const newAvgCost =
          (existing.current_qty * (existing.avg_unit_cost || 0) +
            quantity * unit_cost) /
          newQty;

        const { error } = await supabase
          .from("stock_inventory")
          .update({
            current_qty: newQty,
            avg_unit_cost: newAvgCost,
            last_received_date: new Date().toISOString().split("T")[0],
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);

        if (error) throw error;
        inventoryId = existing.id;
      } else {
        // Create new
        const { data: newInv, error } = await supabase
          .from("stock_inventory")
          .insert({
            site_id,
            location_id,
            material_id,
            brand_id,
            current_qty: quantity,
            avg_unit_cost: unit_cost,
            last_received_date: new Date().toISOString().split("T")[0],
          })
          .select()
          .single();

        if (error) throw error;
        inventoryId = newInv.id;
      }

      // Create transaction
      await supabase.from("stock_transactions").insert({
        site_id,
        inventory_id: inventoryId,
        transaction_type: "initial",
        transaction_date: new Date().toISOString().split("T")[0],
        quantity,
        unit_cost,
        total_cost: quantity * unit_cost,
        notes: "Initial stock entry",
      });

      return { success: true };
    },
    onSuccess: (_result, variables) => {
      const siteKey = queryKeys.materialStock.bySite(variables.site_id);
      queryClient.invalidateQueries({ queryKey: siteKey });
      queryClient.invalidateQueries({ queryKey: [...siteKey, "all"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.materialStock.all });
    },
  });
}

// ============================================
// BATCH → PURCHASE ORDER LOOKUP
// ============================================

/**
 * Look up the associated Purchase Order for a given batch_code.
 * Traces: batch_code → material_purchase_expenses.ref_code → purchase_order_id
 */
export function usePOByBatchCode(batchCode: string | null) {
  const supabase = createClient();

  return useQuery({
    queryKey: batchCode
      ? ["po-by-batch-code", batchCode]
      : ["po-by-batch-code", "none"],
    queryFn: async () => {
      if (!batchCode) return null;

      // Step 1: Look up the expense record to get purchase_order_id and paying site info
      const { data: expense, error: expenseError } = await supabase
        .from("material_purchase_expenses")
        .select("purchase_order_id, paying_site_id, site_id, paying_site:sites!material_purchase_expenses_paying_site_id_fkey(id, name)")
        .eq("ref_code", batchCode)
        .maybeSingle();

      if (expenseError) {
        console.warn("[usePOByBatchCode] Error looking up expense:", expenseError);
        return null;
      }

      if (!expense?.purchase_order_id) return null;

      return {
        poId: expense.purchase_order_id as string,
        payingSiteId: (expense.paying_site_id || expense.site_id) as string | null,
        payingSiteName: (expense.paying_site as { id: string; name: string } | null)?.name || null,
      };
    },
    enabled: !!batchCode,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}
