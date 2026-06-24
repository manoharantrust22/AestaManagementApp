"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient, ensureFreshSession } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/cache/keys";
import { recordSpend } from "@/lib/services/engineerWalletV2";
import { buildAdvanceExpensePayload } from "@/lib/materials/advanceExpensePayload";
import type { PayerSource, PayerSourceSplitRow } from "@/types/settlement.types";
import { ENGINEER_WALLET_KEYS } from "@/hooks/queries/useEngineerWalletV2";
import { generateOptimisticId } from "@/lib/optimistic";
import { wrapQueryFn } from "@/lib/utils/timeout";
import { StaleStateError } from "@/lib/utils/staleState";
import type {
  PurchaseOrder,
  PurchaseOrderWithDetails,
  PurchaseOrderFormData,
  PurchaseOrderItem,
  PurchaseOrderItemFormData,
  POStatus,
  Delivery,
  DeliveryWithDetails,
  DeliveryFormData,
  DeliveryItem,
  DeliveryItemFormData,
  RecordAndVerifyDeliveryFormData,
  DeliveryDiscrepancy,
} from "@/types/material.types";
// Note: Stock creation is handled by DB trigger "trg_update_stock_on_delivery"
// Do NOT import createStockFromDeliveryItems here to avoid duplicate stock entries

// ============================================
// PURCHASE ORDERS
// ============================================

/**
 * Fetch purchase orders for a site with optional status filter.
 * When siteGroupId is provided, also fetches group stock POs from other sites in the same group.
 */
export function usePurchaseOrders(
  siteId: string | undefined,
  status?: POStatus | null,
  options?: { siteGroupId?: string }
) {
  const supabase = createClient() as any;
  const siteGroupId = options?.siteGroupId;

  return useQuery({
    queryKey: siteId
      ? status
        ? [...queryKeys.purchaseOrders.bySite(siteId), status, siteGroupId]
        : [...queryKeys.purchaseOrders.bySite(siteId), siteGroupId]
      : ["purchase-orders", "unknown"],
    queryFn: wrapQueryFn(async () => {
      if (!siteId) return [];

      let query = supabase
        .from("purchase_orders")
        .select(
          `
          *,
          vendor:vendors(id, name, phone, email),
          site:sites(id, name),
          items:purchase_order_items(
            *,
            material:materials(id, name, code, unit, weight_per_unit, weight_unit, length_per_piece, length_unit, image_url),
            brand:material_brands(id, brand_name, variant_name, image_url)
          )
        `
        )
        .order("created_at", { ascending: false });

      // When siteGroupId is available, fetch both own-site POs and group stock POs from other sites
      if (siteGroupId) {
        query = query.or(`site_id.eq.${siteId},site_group_id.eq.${siteGroupId}`);
      } else {
        query = query.eq("site_id", siteId);
      }

      if (status) {
        query = query.eq("status", status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as PurchaseOrderWithDetails[];
    }, { operationName: "usePurchaseOrders" }),
    enabled: !!siteId,
    staleTime: 60000,
  });
}

/**
 * Lightweight PO list for the Material Hub.
 *
 * The Hub renders a derived thread list — it never needs the full PO row. The
 * shared `usePurchaseOrders` above pulls `purchase_orders.*` plus a deep
 * `items → material(10 cols) + brand(3 cols)` embed for the WHOLE cluster, which
 * makes it the single largest response on the page (~10× the other Hub queries).
 * On the production proxy that big payload is the one most likely to stall
 * mid-transfer and trip the 30s timeout — even though the server returns the
 * rows in <1ms (verified: 67 POs, 0.3ms). This projection selects ONLY the
 * columns `useMaterialThreads` actually reads, shrinking the payload to a small
 * fraction so it transfers fast and rarely stalls.
 *
 * The full PO (for the settle / record-delivery dialogs) is fetched fresh by id
 * via `usePurchaseOrder` when a dialog opens — so trimming this list cannot
 * starve a dialog of fields.
 *
 * Key note: `[...bySite(siteId), "hub-light", siteGroupId]` sits under the
 * `purchaseOrders.bySite` prefix, so every existing PO mutation invalidation
 * (create / approve / deliver / settle — all target that prefix) refreshes it
 * automatically, while the distinct "hub-light" segment avoids colliding with
 * the heavy `usePurchaseOrders` cache used by /site/purchase-orders.
 */
export function usePurchaseOrdersForHub(
  siteId: string | undefined,
  options?: { siteGroupId?: string }
) {
  const supabase = createClient() as any;
  const siteGroupId = options?.siteGroupId;

  return useQuery({
    queryKey: siteId
      ? [...queryKeys.purchaseOrders.bySite(siteId), "hub-light", siteGroupId ?? null]
      : ["purchase-orders", "hub-light", "unknown"],
    queryFn: wrapQueryFn(async () => {
      if (!siteId) return [];

      let query = supabase
        .from("purchase_orders")
        .select(
          `
          id, po_number, site_id, site_group_id, source_request_id, vendor_id,
          status, order_date, expected_delivery_date, total_amount,
          payment_timing, advance_paid, vendor_bill_url, quotation_url,
          notes, internal_notes,
          vendor:vendors(id, name),
          items:purchase_order_items(
            id, material_id, brand_id, quantity, received_qty, unit_price,
            pricing_mode, calculated_weight, actual_weight, tax_rate,
            material:materials(id, name, unit, image_url),
            brand:material_brands(id, brand_name, variant_name, image_url)
          )
        `
        )
        .order("created_at", { ascending: false });

      if (siteGroupId) {
        query = query.or(`site_id.eq.${siteId},site_group_id.eq.${siteGroupId}`);
      } else {
        query = query.eq("site_id", siteId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as PurchaseOrderWithDetails[];
    }, { operationName: "usePurchaseOrdersForHub" }),
    enabled: !!siteId,
    staleTime: 60000,
  });
}

/**
 * Fetch a single purchase order by ID
 */
export function usePurchaseOrder(id: string | undefined) {
  const supabase = createClient() as any;

  return useQuery({
    queryKey: id
      ? ["purchase-orders", "detail", id]
      : ["purchase-orders", "detail", "unknown"],
    queryFn: async () => {
      if (!id) return null;

      const { data, error } = await supabase
        .from("purchase_orders")
        .select(
          `
          *,
          vendor:vendors(*),
          items:purchase_order_items(
            *,
            material:materials(id, name, code, unit, gst_rate, weight_per_unit, weight_unit, length_per_piece, length_unit, image_url),
            brand:material_brands(id, brand_name, variant_name, image_url)
          ),
          deliveries(
            id, grn_number, delivery_date, delivery_status,
            challan_number, invoice_amount
          ),
          source_request:material_requests!purchase_orders_source_request_id_fkey(
            id, request_number, status, priority, required_by_date,
            requested_by_user:users!material_requests_requested_by_fkey(name)
          )
        `
        )
        .eq("id", id)
        .single();

      if (error) throw error;

      // Transform source_request from array to single object (FK returns array by default)
      const transformed = {
        ...data,
        source_request: Array.isArray(data.source_request)
          ? data.source_request[0] || null
          : data.source_request,
      };

      return transformed as unknown as PurchaseOrderWithDetails;
    },
    enabled: !!id,
  });
}

/**
 * Create a new purchase order with items
 */
export function useCreatePurchaseOrder() {
  const queryClient = useQueryClient();
  const supabase = createClient() as any;

  return useMutation({
    mutationFn: async (data: PurchaseOrderFormData) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      // Calculate totals - supports both per_piece and per_kg pricing
      let subtotal = 0;
      let taxAmount = 0;

      const priceIncGst = !!data.price_includes_gst;

      const itemsWithTotals = data.items.map((item: any) => {
        // Calculate item total based on pricing mode
        let itemTotal: number;
        if (item.pricing_mode === 'per_kg') {
          // Per kg pricing: use actual_weight if available, fallback to calculated_weight
          const weight = item.actual_weight ?? item.calculated_weight ?? 0;
          itemTotal = weight * item.unit_price;
        } else {
          // Per piece pricing: quantity × unit_price (default)
          itemTotal = item.quantity * item.unit_price;
        }

        const discount = item.discount_percent
          ? (itemTotal * item.discount_percent) / 100
          : 0;
        const taxableAmount = itemTotal - discount;
        // When price includes GST: extract tax from the inclusive amount
        // When not: calculate tax on top of the amount
        const itemTax = item.tax_rate
          ? priceIncGst
            ? (taxableAmount * item.tax_rate) / (100 + item.tax_rate)
            : (taxableAmount * item.tax_rate) / 100
          : 0;

        subtotal += taxableAmount;
        taxAmount += itemTax;

        return {
          ...item,
          discount_amount: Math.round(discount),
          tax_amount: Math.round(itemTax),
          // When price includes GST: total = taxableAmount (GST already inside)
          // When not: total = taxableAmount + tax
          total_amount: priceIncGst
            ? Math.round(taxableAmount)
            : Math.round(taxableAmount + itemTax),
        };
      });

      // Round final totals to whole numbers
      // When price includes GST: total = subtotal (GST already inside) + transport
      const transport = data.transport_cost || 0;
      const totalAmount = priceIncGst
        ? Math.round(subtotal + transport)
        : Math.round(subtotal + taxAmount + transport);
      subtotal = Math.round(subtotal);
      taxAmount = Math.round(taxAmount);

      // Generate PO number
      const timestamp = Date.now().toString(36).toUpperCase();
      const random = Math.random().toString(36).substring(2, 6).toUpperCase();
      const poNumber = `PO-${timestamp}-${random}`;

      // Insert PO
      const { data: po, error: poError } = await (
        supabase.from("purchase_orders") as any
      )
        .insert({
          site_id: data.site_id,
          vendor_id: data.vendor_id,
          po_number: poNumber,
          status: data.status || "draft",
          order_date: data.order_date || new Date().toISOString().split("T")[0],
          expected_delivery_date: data.expected_delivery_date,
          delivery_address: data.delivery_address,
          delivery_location_id: data.delivery_location_id,
          payment_terms: data.payment_terms,
          payment_timing: data.payment_timing || "on_delivery",
          notes: data.notes,
          internal_notes: data.internal_notes,
          site_group_id: (data as any).site_group_id || null,
          transport_cost: data.transport_cost || null,
          vendor_bill_url: data.vendor_bill_url || null,
          subtotal,
          tax_amount: taxAmount,
          total_amount: totalAmount,
          source_request_id: data.source_request_id || null,
        })
        .select()
        .single();

      if (poError) {
        throw poError;
      }

      // PROBLEM-A FIX (going forward): a GROUP PO created from an own_site
      // request must stamp the source material_request with the same group.
      // The Hub fetches threads via .or(site_id, site_group_id); without the
      // stamp the thread only surfaces on the requesting site and never on
      // sibling cluster sites. The backfill migration 20260602110000 repairs
      // historical rows — this keeps newly-created ones correct.
      if ((po as any)?.site_group_id && data.source_request_id) {
        await (supabase as any)
          .from("material_requests")
          .update({
            site_group_id: (po as any).site_group_id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", data.source_request_id)
          .is("site_group_id", null);
      }

      // Insert PO items
      const poItems = itemsWithTotals.map((item: any) => {
        // Calculate actual weight per piece for brand weight learning
        const actualWeightPerPiece = item.actual_weight && item.quantity > 0
          ? item.actual_weight / item.quantity
          : null;

        return {
          po_id: po.id,
          material_id: item.material_id,
          brand_id: item.brand_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          tax_rate: item.tax_rate,
          tax_amount: item.tax_amount,
          discount_percent: item.discount_percent,
          discount_amount: item.discount_amount,
          total_amount: item.total_amount,
          notes: item.notes,
          received_qty: 0,
          // Pricing mode and weight tracking
          pricing_mode: item.pricing_mode || 'per_piece',
          calculated_weight: item.calculated_weight || null,
          actual_weight: item.actual_weight || null,
          actual_weight_per_piece: actualWeightPerPiece,
        };
      });

      const { data: insertedItems, error: itemsError } = await supabase
        .from("purchase_order_items")
        .insert(poItems)
        .select("id, material_id");

      if (itemsError) {
        throw itemsError;
      }

      // Create junction entries for items linked to material request items
      // Match inserted items with original data items by material_id (order preserved)
      const requestItemLinks: { po_item_id: string; request_item_id: string; quantity_allocated: number }[] = [];

      if (insertedItems && data.source_request_id) {
        data.items.forEach((originalItem, index) => {
          // Items from requests have request_item_id set
          if ('request_item_id' in originalItem && originalItem.request_item_id) {
            const insertedItem = insertedItems[index];
            if (insertedItem) {
              requestItemLinks.push({
                po_item_id: insertedItem.id,
                request_item_id: originalItem.request_item_id as string,
                quantity_allocated: originalItem.quantity,
              });
            }
          }
        });
      }

      // Insert junction entries if any
      if (requestItemLinks.length > 0) {
        const { error: linkError } = await supabase
          .from("purchase_order_request_items")
          .insert(requestItemLinks);

        if (linkError) {
          // Don't fail PO creation for this - the source_request_id link still works
        }
      }

      // Auto-record prices to price_history for each item
      const priceRecords = itemsWithTotals.map((item: any) => ({
        vendor_id: data.vendor_id,
        material_id: item.material_id,
        brand_id: item.brand_id || null,
        price: item.unit_price,
        price_includes_gst: priceIncGst,
        gst_rate: item.tax_rate || null,
        transport_cost: null,
        loading_cost: null,
        unloading_cost: null,
        total_landed_cost: item.unit_price,
        recorded_date: new Date().toISOString().split("T")[0],
        source: "purchase",
        source_reference: poNumber,
        quantity: item.quantity,
        unit: null,
        recorded_by: null,
        notes: `Auto-recorded from PO ${poNumber}`,
      }));

      // Insert price history records (don't fail PO creation if this fails)
      try {
        await supabase.from("price_history").insert(priceRecords);
      } catch (priceError) {
        console.warn("Failed to record price history:", priceError);
      }

      return po as PurchaseOrder;
    },
    // Optimistic update: Show new PO immediately
    onMutate: async (variables) => {
      const queryKey = queryKeys.purchaseOrders.bySite(variables.site_id);

      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey });

      // Snapshot the previous value
      const previousData = queryClient.getQueryData<PurchaseOrderWithDetails[]>(queryKey);

      // Generate optimistic ID
      const optimisticId = generateOptimisticId();

      // Calculate totals for display
      let subtotal = 0;
      let taxAmount = 0;
      variables.items.forEach((item: any) => {
        const itemTotal = item.quantity * item.unit_price;
        const discount = item.discount_percent ? (itemTotal * item.discount_percent) / 100 : 0;
        const taxableAmount = itemTotal - discount;
        const itemTax = item.tax_rate ? (taxableAmount * item.tax_rate) / 100 : 0;
        subtotal += taxableAmount;
        taxAmount += itemTax;
      });

      // Optimistically add the new PO
      const optimisticPO = {
        id: optimisticId,
        site_id: variables.site_id,
        vendor_id: variables.vendor_id,
        po_number: `PO-PENDING-${optimisticId.slice(-6).toUpperCase()}`,
        status: variables.status || "draft",
        order_date: variables.order_date || new Date().toISOString().split("T")[0],
        expected_delivery_date: variables.expected_delivery_date || null,
        delivery_address: variables.delivery_address || null,
        delivery_location_id: variables.delivery_location_id || null,
        payment_terms: variables.payment_terms || null,
        payment_timing: variables.payment_timing || "on_delivery",
        transport_cost: variables.transport_cost || null,
        notes: variables.notes || null,
        internal_notes: variables.internal_notes || null,
        vendor_bill_url: variables.vendor_bill_url || null,
        subtotal: Math.round(subtotal),
        tax_amount: Math.round(taxAmount),
        total_amount: Math.round(subtotal + taxAmount + (variables.transport_cost || 0)),
        // Missing PurchaseOrder fields
        discount_amount: null,
        other_charges: null,
        advance_paid: null,
        quotation_url: null,
        po_document_url: null,
        approved_by: null,
        approved_at: null,
        cancelled_by: null,
        cancelled_at: null,
        cancellation_reason: null,
        created_by: null,
        bill_verified: false,
        bill_verified_by: null,
        bill_verified_at: null,
        bill_verification_notes: null,
        source_request_id: variables.source_request_id || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        vendor: undefined,
        site: undefined,
        deliveries: undefined,
        source_request: undefined,
        items: variables.items.map((item, idx) => {
          const itemTotal = item.quantity * item.unit_price;
          const discountAmt = item.discount_percent ? (itemTotal * item.discount_percent) / 100 : 0;
          const taxableAmount = itemTotal - discountAmt;
          const itemTaxAmt = item.tax_rate ? (taxableAmount * item.tax_rate) / 100 : 0;
          return {
            id: `${optimisticId}-item-${idx}`,
            po_id: optimisticId,
            material_id: item.material_id,
            brand_id: item.brand_id || null,
            description: null,
            quantity: item.quantity,
            unit_price: item.unit_price,
            tax_rate: item.tax_rate || null,
            tax_amount: itemTaxAmt,
            discount_percent: item.discount_percent || null,
            discount_amount: discountAmt,
            total_amount: taxableAmount + itemTaxAmt,
            received_qty: 0,
            pending_qty: item.quantity,
            notes: null,
            created_at: new Date().toISOString(),
            pricing_mode: 'per_piece' as const,
            calculated_weight: null,
            actual_weight: null,
            actual_weight_per_piece: null,
            material: undefined,
            brand: undefined,
          };
        }),
        // Mark as pending optimistic update
        isPending: true,
        optimisticId,
      } as unknown as PurchaseOrderWithDetails & { isPending: boolean; optimisticId: string };

      queryClient.setQueryData<PurchaseOrderWithDetails[]>(queryKey, (old) => {
        return [optimisticPO, ...(old || [])];
      });

      return { previousData, optimisticId, siteId: variables.site_id };
    },
    // Rollback on error
    onError: (err, variables, context) => {
      if (context?.previousData !== undefined) {
        queryClient.setQueryData(
          queryKeys.purchaseOrders.bySite(context.siteId),
          context.previousData
        );
      }
    },
    // Refetch on success to reconcile
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.purchaseOrders.bySite(variables.site_id),
      });
      // Also invalidate price history queries for this vendor
      queryClient.invalidateQueries({
        queryKey: queryKeys.priceHistory.byVendor(variables.vendor_id),
      });
      // A group PO may have just stamped the source MR's site_group_id — refresh
      // the requests list so the thread surfaces on sibling cluster sites too.
      if ((variables as any).site_group_id) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.materialRequests.bySite(variables.site_id),
        });
      }
    },
    // Note: Removed duplicate onSettled invalidation - onSuccess already handles this
  });
}

/**
 * Update a purchase order with optimistic update
 */
export function useUpdatePurchaseOrder() {
  const queryClient = useQueryClient();
  const supabase = createClient() as any;

  return useMutation({
    mutationFn: async ({
      id,
      data,
      siteId,
    }: {
      id: string;
      data: Partial<PurchaseOrderFormData>;
      siteId: string; // Added for optimistic update
    }) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      // If transport cost is being changed, recompute total_amount from current items
      let newTotalAmount: number | undefined = undefined;
      if (data.transport_cost !== undefined) {
        const { data: poItems } = await supabase
          .from("purchase_order_items")
          .select("total_amount")
          .eq("po_id", id);
        const itemsSum = (poItems || []).reduce(
          (s: number, i: any) => s + Number(i.total_amount || 0), 0
        );
        newTotalAmount = Math.round(itemsSum + (data.transport_cost || 0));
      }

      const { data: result, error } = await supabase
        .from("purchase_orders")
        .update({
          vendor_id: data.vendor_id,
          expected_delivery_date: data.expected_delivery_date,
          delivery_address: data.delivery_address,
          delivery_location_id: data.delivery_location_id,
          payment_terms: data.payment_terms,
          payment_timing: data.payment_timing,
          transport_cost: data.transport_cost ?? undefined,
          notes: data.notes,
          vendor_bill_url: data.vendor_bill_url ?? undefined,
          internal_notes: data.internal_notes || null,
          updated_at: new Date().toISOString(),
          ...(newTotalAmount !== undefined && { total_amount: newTotalAmount }),
        })
        .eq("id", id)
        .select()
        .single();

      // If an expense record exists for this PO, update it to match new group stock settings
      if (data.internal_notes !== undefined) {
        let parsedNotes: { is_group_stock?: boolean; site_group_id?: string; payment_source_site_id?: string } | null = null;
        try {
          parsedNotes = data.internal_notes
            ? typeof data.internal_notes === "string" ? JSON.parse(data.internal_notes) : data.internal_notes
            : null;
        } catch { /* ignore */ }

        const isGroupStock = parsedNotes?.is_group_stock === true;

        const { data: existingExpense } = await supabase
          .from("material_purchase_expenses")
          .select("id, purchase_type, ref_code, site_group_id")
          .eq("purchase_order_id", id)
          .maybeSingle();

        if (existingExpense) {
          const oldPurchaseType = existingExpense.purchase_type;
          const typeChanged = (isGroupStock && oldPurchaseType === "own_site") ||
                              (!isGroupStock && oldPurchaseType === "group_stock");

          // Fetch PO items for quantity calculation and cascade updates
          const { data: poItems } = await supabase
            .from("purchase_order_items")
            .select("material_id, brand_id, quantity, unit_price")
            .eq("po_id", id);
          const totalQuantity = (poItems || []).reduce(
            (sum: number, item: any) => sum + Number(item.quantity || 0), 0
          );

          await supabase
            .from("material_purchase_expenses")
            .update({
              purchase_type: isGroupStock ? "group_stock" : "own_site",
              site_group_id: isGroupStock ? (parsedNotes?.site_group_id || null) : null,
              paying_site_id: isGroupStock ? (parsedNotes?.payment_source_site_id || result.site_id) : null,
              original_qty: isGroupStock ? totalQuantity : null,
              remaining_qty: isGroupStock ? totalQuantity : null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingExpense.id);

          // CASCADE: Update related records when purchase_type changed OR
          // when isGroupStock but stock_inventory records may be missing batch_code
          // (handles retroactive fix for POs edited before cascade logic existed)
          if (existingExpense.ref_code && (typeChanged || isGroupStock)) {
            const refCode = existingExpense.ref_code;
            const siteGroupId = parsedNotes?.site_group_id;

            try {
              if (isGroupStock && (oldPurchaseType === "own_site" || !typeChanged)) {
                // === own_site → group_stock (or ensure consistency for existing group_stock) ===
                console.log("[useUpdatePurchaseOrder] Ensuring group_stock consistency for ref:", refCode);

                // 1. Set batch_code on stock_inventory records created from THIS PO's deliveries only
                // Trace through deliveries → stock_transactions to avoid stamping batch_code on other POs' stock
                const { data: poDeliveriesForUpdate } = await supabase
                  .from("deliveries")
                  .select("id")
                  .eq("po_id", id);

                if (poDeliveriesForUpdate && poDeliveriesForUpdate.length > 0) {
                  const deliveryIdsForUpdate = poDeliveriesForUpdate.map((d: any) => d.id);
                  const { data: stockTxsForUpdate } = await supabase
                    .from("stock_transactions")
                    .select("inventory_id")
                    .eq("reference_type", "delivery")
                    .in("reference_id", deliveryIdsForUpdate);

                  if (stockTxsForUpdate && stockTxsForUpdate.length > 0) {
                    const inventoryIdsForUpdate = [...new Set(stockTxsForUpdate.map((t: any) => t.inventory_id))];
                    await supabase
                      .from("stock_inventory")
                      .update({ batch_code: refCode, updated_at: new Date().toISOString() })
                      .in("id", inventoryIdsForUpdate)
                      .is("batch_code", null);
                    console.log("[useUpdatePurchaseOrder] Backfilled batch_code on", inventoryIdsForUpdate.length, "stock rows");
                  }
                }

                // 2. Create group_stock_inventory and group_stock_transactions if site_group_id available
                // Skip if transactions already exist for this batch (prevents duplicates on re-save)
                if (siteGroupId) {
                  const { data: existingTx } = await supabase
                    .from("group_stock_transactions")
                    .select("id")
                    .eq("batch_ref_code", refCode)
                    .limit(1);

                  if (!existingTx || existingTx.length === 0) {
                    const transactionsToInsert: any[] = [];

                    for (const item of (poItems || [])) {
                      // Check if group_stock_inventory exists
                      let invQuery = supabase
                        .from("group_stock_inventory")
                        .select("id, current_qty, avg_unit_cost")
                        .eq("site_group_id", siteGroupId)
                        .eq("material_id", item.material_id);

                      if (item.brand_id) {
                        invQuery = invQuery.eq("brand_id", item.brand_id);
                      } else {
                        invQuery = invQuery.is("brand_id", null);
                      }

                      const { data: existingInv } = await invQuery.maybeSingle();
                      let inventoryId: string;

                      if (existingInv) {
                        inventoryId = existingInv.id;
                        const newQty = Number(existingInv.current_qty) + Number(item.quantity);
                        const newAvgCost = newQty > 0
                          ? ((Number(existingInv.current_qty) * Number(existingInv.avg_unit_cost || 0)) +
                             (Number(item.quantity) * Number(item.unit_price))) / newQty
                          : Number(item.unit_price);

                        await supabase
                          .from("group_stock_inventory")
                          .update({
                            current_qty: newQty,
                            avg_unit_cost: newAvgCost,
                            last_received_date: new Date().toISOString().split("T")[0],
                            updated_at: new Date().toISOString(),
                            batch_code: refCode,
                          })
                          .eq("id", existingInv.id);
                      } else {
                        const { data: newInv, error: invInsertError } = await supabase
                          .from("group_stock_inventory")
                          .insert({
                            site_group_id: siteGroupId,
                            material_id: item.material_id,
                            brand_id: item.brand_id || null,
                            current_qty: Number(item.quantity),
                            avg_unit_cost: Number(item.unit_price),
                            last_received_date: new Date().toISOString().split("T")[0],
                            batch_code: refCode,
                          })
                          .select("id")
                          .single();

                        if (invInsertError) {
                          console.warn("[useUpdatePurchaseOrder] Failed to insert group_stock_inventory:", invInsertError);
                          continue;
                        }
                        inventoryId = newInv.id;
                      }

                      const unitCost = Number(item.unit_price) || 0;
                      const totalCost = Number(item.quantity) * unitCost;
                      transactionsToInsert.push({
                        site_group_id: siteGroupId,
                        inventory_id: inventoryId,
                        transaction_type: "purchase",
                        transaction_date: result.order_date || new Date().toISOString().split("T")[0],
                        material_id: item.material_id,
                        brand_id: item.brand_id || null,
                        quantity: Number(item.quantity),
                        unit_cost: unitCost,
                        total_cost: totalCost,
                        payment_source_site_id: result.site_id,
                        batch_ref_code: refCode,
                        reference_id: existingExpense.id,
                        notes: `Type changed from own_site to group_stock on PO edit`,
                      });
                    }

                    if (transactionsToInsert.length > 0) {
                      const { error: txInsertError } = await supabase
                        .from("group_stock_transactions")
                        .insert(transactionsToInsert);
                      if (txInsertError) {
                        console.warn("[useUpdatePurchaseOrder] Failed to create group_stock_transactions:", txInsertError);
                      }
                    }
                  } else {
                    console.log("[useUpdatePurchaseOrder] group_stock_transactions already exist for ref:", refCode, "- skipping");
                  }
                }

                console.log("[useUpdatePurchaseOrder] Cascade group_stock consistency complete");

              } else if (!isGroupStock && oldPurchaseType === "group_stock") {
                // === group_stock → own_site ===
                console.log("[useUpdatePurchaseOrder] Cascading group_stock → own_site for ref:", refCode);

                // 1. Clear batch_code on stock_inventory
                await supabase
                  .from("stock_inventory")
                  .update({ batch_code: null, updated_at: new Date().toISOString() })
                  .eq("batch_code", refCode);

                // 2. Delete batch_usage_records
                await supabase
                  .from("batch_usage_records")
                  .delete()
                  .eq("batch_ref_code", refCode);

                // 3. Delete group_stock_transactions
                await supabase
                  .from("group_stock_transactions")
                  .delete()
                  .eq("batch_ref_code", refCode);

                // 4. Clean up group_stock_inventory for matching materials
                const oldSiteGroupId = existingExpense.site_group_id;
                if (oldSiteGroupId) {
                  for (const item of (poItems || [])) {
                    let invQuery = supabase
                      .from("group_stock_inventory")
                      .select("id, current_qty")
                      .eq("site_group_id", oldSiteGroupId)
                      .eq("material_id", item.material_id);

                    if (item.brand_id) {
                      invQuery = invQuery.eq("brand_id", item.brand_id);
                    } else {
                      invQuery = invQuery.is("brand_id", null);
                    }

                    const { data: groupInv } = await invQuery.maybeSingle();
                    if (groupInv) {
                      const newQty = Number(groupInv.current_qty) - Number(item.quantity);
                      if (newQty <= 0) {
                        await supabase
                          .from("group_stock_inventory")
                          .delete()
                          .eq("id", groupInv.id);
                      } else {
                        await supabase
                          .from("group_stock_inventory")
                          .update({ current_qty: newQty, updated_at: new Date().toISOString() })
                          .eq("id", groupInv.id);
                      }
                    }
                  }
                }

                console.log("[useUpdatePurchaseOrder] Cascade group_stock → own_site complete");
              }
            } catch (cascadeError) {
              console.warn("[useUpdatePurchaseOrder] Cascade update error (non-fatal):", cascadeError);
            }
          }
        }
      }

      if (error) throw error;
      return result as PurchaseOrder;
    },
    // Optimistic update: Update PO fields immediately
    onMutate: async (variables) => {
      const queryKey = queryKeys.purchaseOrders.bySite(variables.siteId);

      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey });

      // Snapshot the previous value
      const previousData = queryClient.getQueryData<PurchaseOrderWithDetails[]>(queryKey);

      // Optimistically update the PO
      // Exclude items from the spread since they have different types (form data vs full data)
      const { items: _items, ...updateFields } = variables.data;
      queryClient.setQueryData<PurchaseOrderWithDetails[]>(queryKey, (old) => {
        if (!old) return [];
        return old.map((po: any) => {
          if (po.id === variables.id) {
            return {
              ...po,
              ...updateFields,
              updated_at: new Date().toISOString(),
              isPending: true,
            } as PurchaseOrderWithDetails;
          }
          return po;
        });
      });

      return { previousData, siteId: variables.siteId };
    },
    // Rollback on error
    onError: (err, variables, context) => {
      if (context?.previousData !== undefined) {
        queryClient.setQueryData(
          queryKeys.purchaseOrders.bySite(context.siteId),
          context.previousData
        );
      }
    },
    // Refetch on success to reconcile
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.purchaseOrders.bySite(variables.siteId),
      });
      queryClient.invalidateQueries({
        queryKey: ["purchase-orders", "detail", result.id],
      });
      // Invalidate material settlements/expenses cache since it reads PO total_amount via join
      queryClient.invalidateQueries({
        queryKey: queryKeys.materialPurchases.bySite(variables.siteId),
      });
    },
    // Note: Removed duplicate onSettled invalidation - onSuccess already handles this
  });
}

/**
 * Submit PO for approval
 */
export function useSubmitPOForApproval() {
  const queryClient = useQueryClient();
  const supabase = createClient() as any;

  return useMutation({
    mutationFn: async (id: string) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      const { data, error } = await supabase
        .from("purchase_orders")
        .update({
          status: "pending_approval",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("status", "draft")
        .select()
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new StaleStateError("purchase order");
      return data as PurchaseOrder;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.purchaseOrders.bySite(result.site_id),
      });
      queryClient.invalidateQueries({
        queryKey: ["purchase-orders", "detail", result.id],
      });
    },
  });
}

/**
 * Approve a purchase order
 */
export function useApprovePurchaseOrder() {
  const queryClient = useQueryClient();
  const supabase = createClient() as any;

  return useMutation({
    mutationFn: async ({ id, userId }: { id: string; userId: string }) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      const { data, error } = await supabase
        .from("purchase_orders")
        .update({
          status: "approved",
          approved_by: userId,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("status", "pending_approval")
        .select()
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new StaleStateError("purchase order");
      return data as PurchaseOrder;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.purchaseOrders.bySite(result.site_id),
      });
      queryClient.invalidateQueries({
        queryKey: ["purchase-orders", "detail", result.id],
      });
    },
  });
}

/**
 * Mark PO as ordered (sent to vendor)
 * Works from both "draft" and "approved" status (approval step is optional)
 */
export function useMarkPOAsOrdered() {
  const queryClient = useQueryClient();
  const supabase = createClient() as any;

  return useMutation({
    mutationFn: async (id: string) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      const { data, error } = await supabase
        .from("purchase_orders")
        .update({
          status: "ordered",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .in("status", ["draft", "approved"]) // Allow from draft or approved
        .select()
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new StaleStateError("purchase order");
      return data as PurchaseOrder;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.purchaseOrders.bySite(result.site_id),
      });
      queryClient.invalidateQueries({
        queryKey: ["purchase-orders", "detail", result.id],
      });
    },
  });
}

/**
 * Cancel a purchase order
 */
export function useCancelPurchaseOrder() {
  const queryClient = useQueryClient();
  const supabase = createClient() as any;

  return useMutation({
    mutationFn: async ({
      id,
      userId,
      reason,
    }: {
      id: string;
      userId: string;
      reason?: string;
    }) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      // Try to set cancelled_by, but don't fail if foreign key doesn't exist
      const { data, error } = await supabase
        .from("purchase_orders")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancellation_reason: reason,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .maybeSingle();

      if (error) {
        throw new Error(error.message || "Failed to cancel purchase order. You may not have permission to perform this action.");
      }
      if (!data) throw new StaleStateError("purchase order");
      return data as PurchaseOrder;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.purchaseOrders.bySite(result.site_id),
      });
      queryClient.invalidateQueries({
        queryKey: ["purchase-orders", "detail", result.id],
      });
    },
  });
}

/**
 * Reverse a single recorded delivery (Material Hub DELIVERY "Correct" → redo).
 * Calls the atomic reverse_delivery RPC, which rolls back the stock this
 * delivery added, decrements PO-item received quantities, drops the derived
 * expense/group-stock artifacts when it's the sole delivery, and recomputes
 * the PO status. The RPC refuses (success:false) when usage has been logged or
 * a settlement exists — the message is surfaced so the caller can clear the
 * blocker first.
 */
export function useReverseDelivery() {
  const queryClient = useQueryClient();
  const supabase = createClient() as any;

  return useMutation({
    retry: false, // Not idempotent — reverses stock
    mutationFn: async ({
      deliveryId,
      siteId,
      reason,
      actorId,
    }: {
      deliveryId: string;
      siteId: string;
      reason?: string;
      actorId?: string;
    }) => {
      await ensureFreshSession();

      const { data, error } = await supabase.rpc("reverse_delivery", {
        p_delivery_id: deliveryId,
        p_reason: reason ?? null,
        p_actor: actorId ?? null,
      });

      if (error) throw error;
      if (data && !data.success) {
        throw new Error(data.error || "Failed to reverse delivery");
      }
      return { siteId, ...data };
    },
    onSuccess: (result) => {
      const siteId = result.siteId as string;
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.bySite(siteId) });
      queryClient.invalidateQueries({ queryKey: ["deliveries", siteId] });
      queryClient.invalidateQueries({ queryKey: queryKeys.materialPurchases.bySite(siteId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.materialPurchases.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.materialStock.all });
      queryClient.invalidateQueries({ queryKey: ["batch-usage-records"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.batchUsage.all });
      queryClient.invalidateQueries({ queryKey: ["group-stock-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["site-material-expenses"] });
      queryClient.invalidateQueries({ queryKey: ["all-expenses"] });
      queryClient.invalidateQueries({ queryKey: ["material-threads"] });
      queryClient.invalidateQueries({ queryKey: ["usage-history"] });
    },
  });
}

/**
 * Delete a purchase order (draft, cancelled, or delivered)
 */
export function useDeletePurchaseOrder() {
  const queryClient = useQueryClient();
  const supabase = createClient() as any;

  return useMutation({
    mutationFn: async ({ id, siteId }: { id: string; siteId: string }) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      // First, get all deliveries for this PO
      const { data: deliveries } = await supabase
        .from("deliveries")
        .select("id")
        .eq("po_id", id);

      // Delete delivery items for all deliveries
      if (deliveries && deliveries.length > 0) {
        const deliveryIds = deliveries.map((d: any) => d.id);
        const { error: deliveryItemsError } = await supabase
          .from("delivery_items")
          .delete()
          .in("delivery_id", deliveryIds);

        if (deliveryItemsError) throw deliveryItemsError;

        // Delete deliveries
        const { error: deliveriesError } = await supabase
          .from("deliveries")
          .delete()
          .eq("po_id", id);

        if (deliveriesError) throw deliveriesError;
      }

      // Delete material purchase expense items linked to this PO
      const { data: materialExpenses } = await (supabase as any)
        .from("material_purchase_expenses")
        .select("id")
        .eq("purchase_order_id", id);

      if (materialExpenses && materialExpenses.length > 0) {
        const expenseIds = materialExpenses.map((e: { id: string }) => e.id);

        // Delete material purchase expense items
        const { error: expenseItemsError } = await (supabase as any)
          .from("material_purchase_expense_items")
          .delete()
          .in("purchase_expense_id", expenseIds);

        if (expenseItemsError) {
          console.warn("Failed to delete material expense items:", expenseItemsError);
        }

        // Delete material purchase expenses
        const { error: expensesError } = await (supabase as any)
          .from("material_purchase_expenses")
          .delete()
          .eq("purchase_order_id", id);

        if (expensesError) {
          console.warn("Failed to delete material expenses:", expensesError);
        }
      }

      // Delete PO items
      const { error: itemsError } = await supabase
        .from("purchase_order_items")
        .delete()
        .eq("po_id", id);

      if (itemsError) throw itemsError;

      // Delete PO
      const { error } = await supabase
        .from("purchase_orders")
        .delete()
        .eq("id", id);

      if (error) throw error;
      return { id, siteId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.purchaseOrders.bySite(result.siteId),
      });
      // Also invalidate deliveries cache
      queryClient.invalidateQueries({
        queryKey: ["deliveries", result.siteId],
      });
      // Invalidate material purchases cache
      queryClient.invalidateQueries({
        queryKey: queryKeys.materialPurchases.bySite(result.siteId),
      });
    },
  });
}

/**
 * Deletion impact summary type
 */
export interface PODeletionImpact {
  deliveries: { id: string; grn_number: string; delivery_date: string }[];
  deliveryItemsCount: number;
  materialExpenses: { id: string; ref_code: string; total_amount: number; purchase_type: string }[];
  materialExpenseItemsCount: number;
  batchUsageRecords: { id: string; usage_site_id: string; quantity: number; site_name?: string }[];
  interSiteSettlements: { id: string; settlement_code: string; total_amount: number; debtor_site_name?: string }[];
  derivedExpenses: { id: string; ref_code: string; total_amount: number; site_name?: string }[];
  poItemsCount: number;
  hasGroupStockBatch: boolean;
  batchRefCode: string | null;
}

/**
 * Fetch the impact of deleting a PO - shows all related records that will be affected
 */
export function usePODeletionImpact(poId: string | undefined) {
  const supabase = createClient() as any;

  return useQuery({
    queryKey: poId ? ["po-deletion-impact", poId] : ["po-deletion-impact"],
    queryFn: async (): Promise<PODeletionImpact> => {
      if (!poId) {
        return {
          deliveries: [],
          deliveryItemsCount: 0,
          materialExpenses: [],
          materialExpenseItemsCount: 0,
          batchUsageRecords: [],
          interSiteSettlements: [],
          derivedExpenses: [],
          poItemsCount: 0,
          hasGroupStockBatch: false,
          batchRefCode: null,
        };
      }

      // Get deliveries for this PO
      const { data: deliveries } = await supabase
        .from("deliveries")
        .select("id, grn_number, delivery_date")
        .eq("po_id", poId);

      // Count delivery items
      let deliveryItemsCount = 0;
      if (deliveries && deliveries.length > 0) {
        const deliveryIds = deliveries.map((d: any) => d.id);
        const { count } = await supabase
          .from("delivery_items")
          .select("id", { count: "exact", head: true })
          .in("delivery_id", deliveryIds);
        deliveryItemsCount = count || 0;
      }

      // Get material purchase expenses linked to this PO
      const { data: materialExpenses } = await (supabase as any)
        .from("material_purchase_expenses")
        .select("id, ref_code, total_amount, purchase_type")
        .eq("purchase_order_id", poId);

      // Count material expense items
      let materialExpenseItemsCount = 0;
      if (materialExpenses && materialExpenses.length > 0) {
        const expenseIds = materialExpenses.map((e: { id: string }) => e.id);
        const { count } = await (supabase as any)
          .from("material_purchase_expense_items")
          .select("id", { count: "exact", head: true })
          .in("expense_id", expenseIds);
        materialExpenseItemsCount = count || 0;
      }

      // Check if this is a group stock batch
      const groupStockExpense = materialExpenses?.find(
        (e: { purchase_type: string }) => e.purchase_type === "group_stock"
      );
      const hasGroupStockBatch = !!groupStockExpense;
      const batchRefCode = groupStockExpense?.ref_code || null;

      // Get batch usage records if it's a group stock
      let batchUsageRecords: { id: string; usage_site_id: string; quantity: number; site_name?: string }[] = [];
      if (batchRefCode) {
        const { data: usageRecords } = await (supabase as any)
          .from("batch_usage_records")
          .select("id, usage_site_id, quantity, sites:usage_site_id(name)")
          .eq("batch_ref_code", batchRefCode);

        if (usageRecords) {
          batchUsageRecords = usageRecords.map((r: any) => ({
            id: r.id,
            usage_site_id: r.usage_site_id,
            quantity: r.quantity,
            site_name: r.sites?.name,
          }));
        }
      }

      // Get inter-site settlements for this batch
      let interSiteSettlements: { id: string; settlement_code: string; total_amount: number; debtor_site_name?: string }[] = [];
      if (batchRefCode) {
        const { data: settlements } = await (supabase as any)
          .from("inter_site_material_settlements")
          .select("id, settlement_code, total_amount, debtor_site:debtor_site_id(name)")
          .eq("batch_ref_code", batchRefCode);

        if (settlements) {
          interSiteSettlements = settlements.map((s: any) => ({
            id: s.id,
            settlement_code: s.settlement_code,
            total_amount: s.total_amount,
            debtor_site_name: s.debtor_site?.name,
          }));
        }
      }

      // Get derived expenses (debtor expenses and self-use expenses) that reference this batch
      let derivedExpenses: { id: string; ref_code: string; total_amount: number; site_name?: string }[] = [];
      if (batchRefCode) {
        const { data: derived } = await (supabase as any)
          .from("material_purchase_expenses")
          .select("id, ref_code, total_amount, site:site_id(name)")
          .eq("original_batch_code", batchRefCode);

        if (derived) {
          derivedExpenses = derived.map((e: any) => ({
            id: e.id,
            ref_code: e.ref_code,
            total_amount: e.total_amount,
            site_name: e.site?.name,
          }));
        }
      }

      // Count PO items
      const { count: poItemsCount } = await supabase
        .from("purchase_order_items")
        .select("id", { count: "exact", head: true })
        .eq("po_id", poId);

      return {
        deliveries: deliveries || [],
        deliveryItemsCount,
        materialExpenses: materialExpenses || [],
        materialExpenseItemsCount,
        batchUsageRecords,
        interSiteSettlements,
        derivedExpenses,
        poItemsCount: poItemsCount || 0,
        hasGroupStockBatch,
        batchRefCode,
      };
    },
    enabled: !!poId,
    staleTime: 60 * 1000,
  });
}

/**
 * Delete a purchase order with full cascade (includes group stock cleanup)
 * This enhanced version uses an atomic server-side RPC function that handles:
 * - batch usage records, settlements, and derived expenses (for group stock)
 * - stock_inventory and stock_transactions (for site stock)
 * - ALL linked records in a single atomic transaction
 */
export function useDeletePurchaseOrderCascade() {
  const queryClient = useQueryClient();
  const supabase = createClient() as any;

  return useMutation({
    retry: false, // Cascade delete is not idempotent
    mutationFn: async ({ id, siteId }: { id: string; siteId: string }) => {
      await ensureFreshSession();

      console.log("[useDeletePurchaseOrderCascade] Starting atomic cascade delete for PO:", id);

      // Use atomic RPC function instead of 30+ sequential queries
      const { data, error } = await supabase.rpc("cascade_delete_purchase_order", {
        p_po_id: id,
        p_site_id: siteId,
      });

      if (error) {
        console.error("[useDeletePurchaseOrderCascade] RPC error:", error);
        throw error;
      }

      // Check for function-level errors
      if (data && !data.success) {
        console.error("[useDeletePurchaseOrderCascade] Function error:", data.error);
        throw new Error(data.error || "Cascade delete failed");
      }

      console.log("[useDeletePurchaseOrderCascade] Cascade delete complete:", data);

      return { id, siteId, ...data };
    },
    onSuccess: (result) => {
      // Invalidate all related caches comprehensively
      queryClient.invalidateQueries({
        queryKey: queryKeys.purchaseOrders.bySite(result.siteId),
      });
      queryClient.invalidateQueries({
        queryKey: ["deliveries", result.siteId],
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.materialPurchases.bySite(result.siteId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.materialPurchases.all,
      });
      // Invalidate all settlement-related queries
      queryClient.invalidateQueries({
        queryKey: ["inter-site-settlements"],
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.interSiteSettlements.all,
      });
      // Invalidate batch usage queries
      queryClient.invalidateQueries({
        queryKey: ["batch-usage-records"],
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.batchUsage.all,
      });
      // Invalidate expense queries
      queryClient.invalidateQueries({
        queryKey: ["site-material-expenses"],
      });
      queryClient.invalidateQueries({
        queryKey: ["all-expenses"],
      });
      queryClient.invalidateQueries({
        queryKey: ["expenses"],
      });
      // Invalidate material purchases batches
      queryClient.invalidateQueries({
        queryKey: ["material-purchases", "batches"],
      });
      queryClient.invalidateQueries({
        queryKey: ["group-stock-transactions"],
      });
      // Invalidate stock inventory and low stock alerts (prevents stale summary cards)
      queryClient.invalidateQueries({
        queryKey: queryKeys.materialStock.all,
      });
    },
  });
}

// ============================================
// PURCHASE ORDER ITEMS
// ============================================

/**
 * Add item to a purchase order
 */
export function useAddPOItem() {
  const queryClient = useQueryClient();
  const supabase = createClient() as any;

  return useMutation({
    mutationFn: async ({
      poId,
      item,
    }: {
      poId: string;
      item: PurchaseOrderItemFormData;
    }) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      // Calculate item total based on pricing mode (per_piece or per_kg)
      let itemTotal: number;
      if (item.pricing_mode === 'per_kg') {
        // Use actual_weight if available, otherwise calculated_weight
        const weight = item.actual_weight ?? item.calculated_weight ?? 0;
        itemTotal = weight * item.unit_price;
      } else {
        itemTotal = item.quantity * item.unit_price;
      }
      const discount = item.discount_percent
        ? (itemTotal * item.discount_percent) / 100
        : 0;
      const taxableAmount = itemTotal - discount;
      const itemTax = item.tax_rate ? (taxableAmount * item.tax_rate) / 100 : 0;

      const { data, error } = await supabase
        .from("purchase_order_items")
        .insert({
          po_id: poId,
          material_id: item.material_id,
          brand_id: item.brand_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          tax_rate: item.tax_rate,
          tax_amount: Math.round(itemTax),
          discount_percent: item.discount_percent,
          discount_amount: Math.round(discount),
          total_amount: Math.round(taxableAmount + itemTax),
          notes: item.notes,
          received_qty: 0,
          // Pricing mode and weight tracking
          pricing_mode: item.pricing_mode || 'per_piece',
          calculated_weight: item.calculated_weight || null,
          actual_weight: item.actual_weight || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Update PO totals
      await updatePOTotals(supabase, poId);

      return data as PurchaseOrderItem;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["purchase-orders", "detail", variables.poId],
      });
    },
  });
}

/**
 * Update a PO item
 */
export function useUpdatePOItem() {
  const queryClient = useQueryClient();
  const supabase = createClient() as any;

  return useMutation({
    mutationFn: async ({
      id,
      poId,
      item,
    }: {
      id: string;
      poId: string;
      item: Partial<PurchaseOrderItemFormData>;
    }) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      let updateData: Record<string, unknown> = { ...item };

      if (item.quantity !== undefined && item.unit_price !== undefined) {
        // Calculate item total based on pricing mode (per_piece or per_kg)
        let itemTotal: number;
        if (item.pricing_mode === 'per_kg') {
          // Use actual_weight if available, otherwise calculated_weight
          const weight = item.actual_weight ?? item.calculated_weight ?? 0;
          itemTotal = weight * item.unit_price;
        } else {
          itemTotal = item.quantity * item.unit_price;
        }
        const discount = item.discount_percent
          ? (itemTotal * item.discount_percent) / 100
          : 0;
        const taxableAmount = itemTotal - discount;
        const itemTax = item.tax_rate
          ? (taxableAmount * item.tax_rate) / 100
          : 0;

        updateData = {
          ...updateData,
          discount_amount: Math.round(discount),
          tax_amount: Math.round(itemTax),
          total_amount: Math.round(taxableAmount + itemTax),
          // Update pricing mode and weight tracking
          pricing_mode: item.pricing_mode || 'per_piece',
          calculated_weight: item.calculated_weight || null,
          actual_weight: item.actual_weight || null,
        };
      }

      const { data, error } = await supabase
        .from("purchase_order_items")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      // Update PO totals
      await updatePOTotals(supabase, poId);

      return data as PurchaseOrderItem;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["purchase-orders", "detail", variables.poId],
      });
    },
  });
}

/**
 * Remove an item from PO
 */
export function useRemovePOItem() {
  const queryClient = useQueryClient();
  const supabase = createClient() as any;

  return useMutation({
    mutationFn: async ({ id, poId }: { id: string; poId: string }) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      const { error } = await supabase
        .from("purchase_order_items")
        .delete()
        .eq("id", id);

      if (error) throw error;

      // Update PO totals
      await updatePOTotals(supabase, poId);

      return { id, poId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: ["purchase-orders", "detail", result.poId],
      });
    },
  });
}

// Helper function to update PO totals
async function updatePOTotals(
  supabase: ReturnType<typeof createClient>,
  poId: string
) {
  const { data: items } = await supabase
    .from("purchase_order_items")
    .select("total_amount, tax_amount")
    .eq("po_id", poId);

  if (items) {
    const subtotal = Math.round(items.reduce(
      (sum, item) => sum + (item.total_amount - (item.tax_amount || 0)),
      0
    ));
    const taxAmount = Math.round(items.reduce(
      (sum, item) => sum + (item.tax_amount || 0),
      0
    ));
    const totalAmount = Math.round(subtotal + taxAmount);

    await supabase
      .from("purchase_orders")
      .update({
        subtotal,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", poId);
  }
}

/**
 * Generate a settlement reference code (PSET-…). Mirrors the format used by the
 * canonical settle path (useMaterialPurchases.generateSettlementRef) so a final
 * settlement made via the advance path reads "settled" on SettlementsTab.
 */
function generateSettlementRef(): string {
  return `PSET-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
}

/**
 * Record advance payment for a PO
 * Updates the advance_paid field and marks payment details
 */
export function useRecordAdvancePayment() {
  const supabase = createClient() as any;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      po_id: string;
      site_id: string;
      amount_paid: number;
      payment_date: string;
      payment_mode?: string;
      payment_reference?: string;
      payment_screenshot_url?: string;
      notes?: string;
      // Wallet debit fields — only for group_stock POs paid by site engineer via wallet
      engineer_id?: string;
      wallet_site_id?: string;
      recorded_by_user_id?: string;
      recorded_by_name?: string;
      site_group_id?: string | null;
      paying_site_id?: string;
      // Payer source (already normalized by the dialog via toRpcArgs)
      payer_source?: PayerSource | "split";
      payer_name?: string | null;
      payer_source_split?: PayerSourceSplitRow[] | null;
      /** True for a full bulk settlement (isGroupStockAdvancePO) — forces is_paid. */
      is_complete?: boolean;
      /** Optional subcontract this material was bought under (null = unlinked). */
      subcontract_id?: string | null;
      /**
       * Defense-in-depth: true when a site engineer is recording this payment.
       * The mutation then refuses to proceed unless the wallet fields resolved
       * (isWalletPath), so an engineer payment can never silently land as
       * "direct" and skip My Wallet. DB trigger mpe_enforce_engineer_wallet is
       * the authoritative backstop; this just fails loud with a clear message.
       */
      actor_is_site_engineer?: boolean;
    }) => {
      await ensureFreshSession();

      const isWalletPath = !!(
        data.engineer_id &&
        data.wallet_site_id &&
        data.recorded_by_user_id &&
        data.recorded_by_name
      );

      if (data.actor_is_site_engineer && !isWalletPath) {
        throw new Error(
          "Engineer payments must be made from your wallet. No wallet was available for this site — please contact the office.",
        );
      }

      // Fetch PO details needed to materialize the expense row.
      const { data: po } = await supabase
        .from("purchase_orders")
        .select(`
          id, po_number, site_id, site_group_id, vendor_id, total_amount, transport_cost, internal_notes,
          vendor:vendors(id, name),
          items:purchase_order_items(id, material_id, brand_id, quantity, unit_price)
        `)
        .eq("id", data.po_id)
        .single();

      // Current auth user → created_by (references auth.users(id)).
      const { data: authData } = await supabase.auth.getUser();
      const authUserId = authData?.user?.id ?? null;

      // Idempotency: reuse an existing expense row for this PO if one exists.
      const { data: existingExpense } = await supabase
        .from("material_purchase_expenses")
        .select("id")
        .eq("purchase_order_id", data.po_id)
        .maybeSingle();

      let expenseId: string | null = existingExpense?.id ?? null;
      const insertedThisCall = !existingExpense;
      let walletDebited = false;
      // Describe the wallet spend per purchase type — own-site advances now also
      // debit the wallet, so the old hardcoded "Group stock advance payment"
      // would mislabel them in My Wallet.
      let walletDescription = "Material payment";

      if (po) {
        // Only mint a new ref code when we're actually inserting a row.
        let refCode: string | null = null;
        if (!expenseId) {
          const { data: generatedRef } = await supabase.rpc("generate_material_purchase_reference");
          refCode = generatedRef ?? null;
        }
        // A FINAL settlement (is_complete — full bulk OR a delivered-PO bargain)
        // mints a fresh settlement reference so the row reads "settled", not just
        // "paid". A re-settle after a reverse mints a NEW code — the reverse
        // nulled the old one. Genuine partial advances get none.
        const settlementReference = data.is_complete ? generateSettlementRef() : null;
        const built = buildAdvanceExpensePayload(
          po,
          {
            amount_paid: data.amount_paid,
            payment_date: data.payment_date,
            payment_mode: data.payment_mode,
            payment_reference: data.payment_reference,
            payment_screenshot_url: data.payment_screenshot_url,
            notes: data.notes,
            payer_source: data.payer_source,
            payer_name: data.payer_name ?? null,
            payer_source_split: data.payer_source_split ?? null,
            is_complete: data.is_complete,
            settlement_reference: settlementReference,
            payment_channel: isWalletPath ? "engineer_wallet" : "direct",
            paying_site_id: data.paying_site_id ?? null,
            site_group_id: data.site_group_id ?? null,
            subcontract_id: data.subcontract_id ?? null,
          },
          refCode || `MAT-${Date.now()}`,
          authUserId,
        );

        // "advance" only belongs on a true bulk-advance buy (vendor paid upfront,
        // delivered part-by-part). A regular group buy is "Group stock payment",
        // not "Group stock advance payment".
        const isAdvanceBuy = (po as { payment_timing?: string }).payment_timing === "advance";
        walletDescription = built.isGroupStock
          ? isAdvanceBuy
            ? "Group stock advance payment"
            : "Group stock payment"
          : `Material payment: ${po.vendor?.name ?? "vendor"}${po.po_number ? ` (${po.po_number})` : ""}`;

        if (expenseId) {
          // Idempotent update: refresh paid + payer fields on the existing row.
          const { error: updErr } = await supabase
            .from("material_purchase_expenses")
            .update({
              is_paid: built.expenseRow.is_paid,
              paid_date: built.expenseRow.paid_date,
              payment_mode: built.expenseRow.payment_mode,
              payment_reference: built.expenseRow.payment_reference,
              payment_screenshot_url: built.expenseRow.payment_screenshot_url,
              amount_paid: built.expenseRow.amount_paid,
              // Promote a FINAL settlement to "settled" everywhere: stamp the ref
              // + date (null for a partial advance). Without this a re-settle via
              // the Hub stayed "pending" because the advance path never set them.
              settlement_reference: built.expenseRow.settlement_reference,
              settlement_date: built.expenseRow.settlement_date,
              settlement_payer_source: built.expenseRow.settlement_payer_source,
              settlement_payer_name: built.expenseRow.settlement_payer_name,
              payer_source_split: built.expenseRow.payer_source_split,
              // Advance flow rebuilds the row wholesale, so it always overwrites
              // the link with the dialog's current selection (unlike the
              // settle/edit path, which preserves an existing link when omitted).
              subcontract_id: built.expenseRow.subcontract_id,
              payment_channel: built.expenseRow.payment_channel,
              // Clear a STALE audit stamp left by a prior (reversed) settle so the
              // BEFORE-UPDATE mpe_stamp_settled trigger re-stamps WHO/WHEN on this
              // fresh false->true transition. Only when (re)marking paid; a still-
              // unpaid advance writes the same NULLs the reverse already left.
              ...(built.expenseRow.is_paid ? { settled_at: null, settled_by: null } : {}),
              updated_at: new Date().toISOString(),
            })
            .eq("id", expenseId);
          if (updErr) throw updErr;
        } else {
          const { data: inserted, error: insErr } = await supabase
            .from("material_purchase_expenses")
            .insert(built.expenseRow)
            .select("id")
            .single();
          if (insErr) throw insErr;
          expenseId = inserted?.id ?? null;

          // Create line items so landed cost / material detail are complete.
          if (expenseId && built.expenseItems.length > 0) {
            const itemsPayload = built.expenseItems.map((it) => ({
              purchase_expense_id: expenseId,
              ...it,
            }));
            const { error: itemsErr } = await supabase
              .from("material_purchase_expense_items")
              .insert(itemsPayload);
            if (itemsErr) {
              // Non-fatal by design: the paid expense header is still valid and
              // re-recording hits the update path — we intentionally do not roll back.
              console.warn("[useRecordAdvancePayment] Failed to create expense items:", itemsErr);
            }
          }
        }
      } else {
        // A missing PO would otherwise stamp advance_paid with no expense row
        // (and no payer source) — abort instead of progressing silently.
        throw new Error(
          `Purchase order ${data.po_id} not found — cannot record advance payment.`,
        );
      }

      // Engineer-wallet path: debit the wallet and link the spend.
      if (isWalletPath && expenseId) {
        try {
          const spend = await recordSpend(supabase, {
            engineer_id: data.engineer_id!,
            site_id: data.wallet_site_id!,
            amount: data.amount_paid,
            transaction_date: data.payment_date,
            payment_mode: "cash",
            proof_url: data.payment_screenshot_url || null,
            notes: data.notes || null,
            recorded_by: data.recorded_by_name!,
            recorded_by_user_id: data.recorded_by_user_id!,
            description: walletDescription,
          });

          if (spend?.id) {
            await supabase
              .from("material_purchase_expenses")
              .update({ engineer_transaction_id: spend.id })
              .eq("id", expenseId);
          }
          walletDebited = true;
        } catch (walletErr) {
          // Roll back ONLY a row this call inserted — never delete a pre-existing one.
          if (insertedThisCall && expenseId) {
            await supabase.from("material_purchase_expenses").delete().eq("id", expenseId);
          }
          throw walletErr;
        }
      }

      // Record advance_paid on the PO.
      const { error } = await supabase
        .from("purchase_orders")
        .update({
          advance_paid: data.amount_paid,
          payment_terms: data.notes
            ? `${data.payment_mode || "Advance"} payment on ${data.payment_date}. ${data.notes}`
            : `${data.payment_mode || "Advance"} payment on ${data.payment_date}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.po_id);

      if (error) throw error;
      return { po_id: data.po_id, site_id: data.site_id, walletDebited };
    },
    onSuccess: (result) => {
      // Invalidate ALL material purchase caches — the PO site_id (ordering site)
      // differs from the paying site shown on screen, so a site-scoped invalidation
      // misses the settlement page the user is actually looking at.
      queryClient.invalidateQueries({ queryKey: queryKeys.materialPurchases.all });
      // Broad PO prefix, not bySite(result.site_id): for a group PO the result
      // site is the originating site, which misses the viewing site's
      // "hub-light" PO list (payment_timing/advance_paid feed the SETTLE step).
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all });
      // Hub sub-queries: useMaterialThreads has no umbrella key — its
      // settlement snapshot lives under ["material-settlements","for-hub-site",…].
      queryClient.invalidateQueries({ queryKey: ["material-settlements"] });
      queryClient.invalidateQueries({ queryKey: ["stock-inventory"] });
      queryClient.invalidateQueries({ queryKey: ["batch-usage-summary"] });
      if (result.walletDebited) {
        queryClient.invalidateQueries({ queryKey: ENGINEER_WALLET_KEYS.all });
      }
    },
  });
}

// ============================================
// DELIVERIES (GRN)
// ============================================

/**
 * Fetch deliveries for a site. When siteGroupId is provided, also includes
 * deliveries recorded for group-stock POs in sibling sites — needed so a
 * partial delivery recorded on one site is visible to all group members.
 */
export function useDeliveries(
  siteId: string | undefined,
  poId?: string | null,
  options?: { siteGroupId?: string | null }
) {
  const supabase = createClient() as any;
  const siteGroupId = options?.siteGroupId ?? null;

  return useQuery({
    queryKey: ["deliveries", siteId, poId, siteGroupId],
    queryFn: async () => {
      if (!siteId) return [];

      // Resolve PO ids visible to this site (own + group_stock siblings).
      // We then filter deliveries by `po_id IN (...)`. This avoids the
      // PostgREST limitation of OR-ing across a nested join column.
      let visiblePoIds: string[] | null = null;
      if (siteGroupId) {
        const { data: poRows, error: poErr } = await supabase
          .from("purchase_orders")
          .select("id")
          .or(`site_id.eq.${siteId},site_group_id.eq.${siteGroupId}`);
        if (poErr) throw poErr;
        visiblePoIds = (poRows || []).map((r: { id: string }) => r.id);
      }

      let query = supabase
        .from("deliveries")
        .select(
          `
          *,
          vendor:vendors(id, name, phone),
          po:purchase_orders(id, po_number, status, site_id, site_group_id),
          items:delivery_items(
            id, material_id, received_qty, accepted_qty, rejected_qty, unit_price,
            material:materials(id, name, code, unit, image_url),
            brand:material_brands(id, brand_name, image_url)
          )
        `
        )
        .order("delivery_date", { ascending: false });

      if (visiblePoIds && visiblePoIds.length > 0) {
        // Union: deliveries recorded on this site OR on any visible group PO
        query = query.or(
          `site_id.eq.${siteId},po_id.in.(${visiblePoIds.join(",")})`
        );
      } else {
        query = query.eq("site_id", siteId);
      }

      if (poId) {
        query = query.eq("po_id", poId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as DeliveryWithDetails[];
    },
    enabled: !!siteId,
  });
}

/**
 * Fetch all deliveries for a PO regardless of which site recorded them.
 * Use this for group stock POs where deliveries may be recorded by different sites.
 */
export function useDeliveriesByPO(poId: string | undefined) {
  const supabase = createClient() as any;

  return useQuery({
    queryKey: ["deliveries-by-po", poId],
    queryFn: async () => {
      if (!poId) return [];
      const { data, error } = await supabase
        .from("deliveries")
        .select(
          `
          *,
          vendor:vendors(id, name, phone),
          items:delivery_items(
            id, material_id, received_qty, accepted_qty, rejected_qty, unit_price,
            material:materials(id, name, code, unit, image_url),
            brand:material_brands(id, brand_name, image_url)
          )
        `
        )
        .eq("po_id", poId)
        .order("delivery_date", { ascending: false });
      if (error) throw error;
      return data as DeliveryWithDetails[];
    },
    enabled: !!poId,
  });
}

/**
 * Fetch a single delivery by ID
 */
export function useDelivery(id: string | undefined) {
  const supabase = createClient() as any;

  return useQuery({
    queryKey: ["delivery", id],
    queryFn: async () => {
      if (!id) return null;

      const { data, error } = await supabase
        .from("deliveries")
        .select(
          `
          *,
          vendor:vendors(*),
          po:purchase_orders(id, po_number, status, expected_delivery_date),
          items:delivery_items(
            *,
            material:materials(id, name, code, unit, image_url),
            brand:material_brands(id, brand_name, image_url)
          )
        `
        )
        .eq("id", id)
        .single();

      if (error) throw error;
      return data as DeliveryWithDetails;
    },
    enabled: !!id,
  });
}

/**
 * Record a new delivery (GRN)
 */
export function useRecordDelivery() {
  const queryClient = useQueryClient();
  const supabase = createClient() as any;

  return useMutation({
    retry: false, // Not idempotent - creates stock and expenses
    mutationFn: async (data: DeliveryFormData) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      // Generate GRN number using UUID for collision resistance
      const generateGrn = () => {
        const uuid = crypto.randomUUID().replace(/-/g, '').substring(0, 12).toUpperCase();
        return `GRN-${uuid}`;
      };
      let grnNumber = generateGrn();

      // Validate and get vendor_id - it's required in the database
      let vendorId = data.vendor_id && data.vendor_id.trim() !== "" ? data.vendor_id : null;

      // If vendor_id is missing but we have a PO, fetch it from the PO
      if (!vendorId && data.po_id) {
        const { data: po } = await supabase
          .from("purchase_orders")
          .select("vendor_id")
          .eq("id", data.po_id)
          .single();

        if (po?.vendor_id) {
          vendorId = po.vendor_id;
        }
      }

      // vendor_id is required - throw error if still missing
      if (!vendorId) {
        throw new Error("Vendor ID is required for delivery. Please ensure the PO has a vendor.");
      }

      // Handle empty strings as null for optional UUID fields
      const locationId = data.location_id && data.location_id.trim() !== "" ? data.location_id : null;

      // Get current user for tracking who recorded the delivery
      // IMPORTANT: recorded_by references auth.users(id), so use auth user ID directly
      let authUserId: string | null = null;
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser?.id) {
          authUserId = authUser.id;  // Use auth user ID directly for recorded_by
        }
      } catch (userError) {
        // Could not fetch user
      }

      // Build the insert payload
      // Set requires_verification=false so the DB trigger creates stock immediately
      // on delivery_items INSERT. Previously this was true/pending which caused
      // delivered PO quantities to NOT appear in inventory until a separate
      // verification step was completed.
      const deliveryPayload = {
        po_id: data.po_id || null,
        site_id: data.site_id,
        vendor_id: vendorId,
        location_id: locationId,
        grn_number: grnNumber,
        delivery_date: data.delivery_date,
        delivery_status: "delivered",
        verification_status: "verified",
        requires_verification: false,
        challan_number: data.challan_number || null,
        challan_date: data.challan_date || null,
        vehicle_number: data.vehicle_number || null,
        driver_name: data.driver_name || null,
        driver_phone: data.driver_phone || null,
        delivery_photos: data.delivery_photos && data.delivery_photos.length > 0 ? data.delivery_photos : null,
        recorded_by: authUserId,  // References auth.users(id)
        recorded_at: new Date().toISOString(),
        notes: data.notes || null,
      };

      // OVER-RECEIPT GUARD — runs BEFORE any insert so a fully/over-delivered PO
      // is rejected with ZERO side effects. received_qty (and stock) are owned by
      // the DB trigger `update_stock_on_verified_delivery`, which increments them
      // on the delivery_items INSERT below. Checking AFTER the insert double-counts
      // the trigger's own increment and throws a false error on the final
      // legitimate delivery — the bug that turned one 3-unit delivery into 4 GRNs.
      if (data.po_id) {
        for (const item of data.items) {
          if (!item.po_item_id) continue;
          const { data: poItem } = await supabase
            .from("purchase_order_items")
            .select("quantity, received_qty")
            .eq("id", item.po_item_id)
            .single();
          if (poItem) {
            const ordered = Number(poItem.quantity ?? 0);
            const alreadyReceived = Number(poItem.received_qty ?? 0);
            const incoming = Number(item.accepted_qty ?? item.received_qty ?? 0);
            const pending = Math.max(0, ordered - alreadyReceived);
            if (incoming > pending + 0.001) {
              throw new Error(
                pending <= 0
                  ? `This PO is already fully delivered (${alreadyReceived}/${ordered} received). It looks like the delivery was already recorded — refresh the list before recording again.`
                  : `Cannot receive ${incoming} — only ${pending} of ${ordered} still pending. Adjust the delivery qty or amend the PO.`
              );
            }
          }
        }
      }

      // Insert with retry logic for GRN collision (409 conflict)
      const MAX_RETRIES = 3;
      let delivery = null;
      let lastError = null;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        // Regenerate GRN on retry
        if (attempt > 0) {
          deliveryPayload.grn_number = generateGrn();
          // Retry with new GRN
        }

        const { data, error } = await (
          supabase.from("deliveries") as any
        )
          .insert(deliveryPayload)
          .select()
          .single();

        if (!error) {
          delivery = data;
          break;
        }

        // Only retry on unique constraint violation (409/23505)
        if (error.code === '23505' || error.message?.includes('duplicate') || error.message?.includes('unique')) {
          // GRN collision, retrying
          lastError = error;
          continue;
        }

        // For other errors, throw immediately
        throw error;
      }

      if (!delivery) {
        // Failed after retries
        throw lastError || new Error('Failed to create delivery after retries');
      }

      // Insert delivery items
      // Handle empty strings as null for UUID fields
      const deliveryItems = data.items.map((item: any) => ({
        delivery_id: delivery.id,
        po_item_id: item.po_item_id || null,
        material_id: item.material_id,
        brand_id: item.brand_id || null,
        ordered_qty: item.ordered_qty,
        received_qty: item.received_qty,
        accepted_qty: item.accepted_qty ?? item.received_qty,
        rejected_qty: item.rejected_qty ?? 0,
        rejection_reason: item.rejection_reason || null,
        unit_price: item.unit_price,
        notes: item.notes || null,
      }));

      // Insert delivery items

      const { error: itemsError } = await supabase
        .from("delivery_items")
        .insert(deliveryItems);

      if (itemsError) {
        // Delivery items insert error
        throw itemsError;
      }

      // NOTE: purchase_order_items.received_qty is incremented by the DB trigger
      // `update_stock_on_verified_delivery` (fires on the delivery_items INSERT
      // above). We deliberately do NOT update received_qty here — the over-receipt
      // capacity check already ran before the insert. Touching received_qty again
      // would double-count the trigger's increment (the historical "2× ordered" drift).
      if (data.po_id) {
        // Check if PO is fully delivered (re-read reflects the trigger's update)
        const { data: poItems } = await supabase
          .from("purchase_order_items")
          .select("quantity, received_qty")
          .eq("po_id", data.po_id);

        if (poItems) {
          const allDelivered = poItems.every(
            (item: any) => (item.received_qty ?? 0) >= item.quantity
          );
          const someDelivered = poItems.some(
            (item: any) => (item.received_qty ?? 0) > 0
          );

          const newStatus = allDelivered
            ? "delivered"
            : someDelivered
            ? "partial_delivered"
            : undefined;

          if (newStatus) {
            await supabase
              .from("purchase_orders")
              .update({
                status: newStatus,
                updated_at: new Date().toISOString(),
              })
              .eq("id", data.po_id);

            // When PO gets any delivery (partial or full), auto-create Material Settlement record
            // Creating expense early ensures batch_code is available when deliveries are verified,
            // preventing group stock batches from merging into a single stock_inventory row
            if (newStatus === "delivered" || newStatus === "partial_delivered") {
              try {
                // Get full PO details with vendor and items
                const { data: po } = await supabase
                  .from("purchase_orders")
                  .select(`
                    *,
                    vendor:vendors(id, name),
                    items:purchase_order_items(
                      id, material_id, brand_id, quantity, unit_price, tax_rate
                    )
                  `)
                  .eq("id", data.po_id)
                  .single();

                if (po) {
                  // Check if expense already exists for this PO (prevent duplicates)
                  const { data: existingExpense } = await (supabase as any)
                    .from("material_purchase_expenses")
                    .select("id, ref_code")
                    .eq("purchase_order_id", data.po_id)
                    .maybeSingle();

                  if (existingExpense) {
                    // Skip creation, expense already exists
                  } else {
                  // Check if PO is a group stock purchase
                  // Parse internal_notes if it's a JSON string
                  let parsedNotes: { is_group_stock?: boolean; site_group_id?: string; group_id?: string; payment_source_site_id?: string } | null = null;
                  if (po.internal_notes) {
                    try {
                      parsedNotes = typeof po.internal_notes === "string"
                        ? JSON.parse(po.internal_notes)
                        : po.internal_notes;
                    } catch {
                      // Ignore parse errors
                    }
                  }
                  const isGroupStock = parsedNotes?.is_group_stock === true;
                  // Backward compatibility: check both site_group_id (new) and group_id (old)
                  const siteGroupId = parsedNotes?.site_group_id || parsedNotes?.group_id || null;

                  // Generate reference code for material purchase
                  const { data: refCode } = await (supabase as any).rpc(
                    "generate_material_purchase_reference"
                  );

                  // Use PO's total_amount directly (already includes subtotal + tax + transport)
                  // This ensures the expense matches the PO amount exactly
                  const totalAmount = po.total_amount || 0;

                  // Calculate total quantity for batch tracking (for group stock)
                  const totalQuantity = (po.items || []).reduce(
                    (sum: number, item: any) => sum + Number(item.quantity),
                    0
                  );

                  // Get current user
                  const { data: { user } } = await supabase.auth.getUser();

                  // Build expense payload
                  const expensePayload = {
                    site_id: po.site_id,
                    ref_code: refCode || `MAT-${Date.now()}`,
                    purchase_type: isGroupStock ? "group_stock" : "own_site",
                    purchase_order_id: po.id,
                    vendor_id: po.vendor_id,
                    vendor_name: po.vendor?.name || null,
                    purchase_date: new Date().toISOString().split("T")[0],
                    total_amount: totalAmount,
                    transport_cost: po.transport_cost || 0,
                    status: "recorded", // Use "recorded" for both group stock and own site
                    is_paid: false,
                    created_by: authUserId,  // References auth.users(id)
                    notes: isGroupStock
                      ? `Group stock batch from PO ${po.po_number}`
                      : `Auto-created from PO ${po.po_number}`,
                    // Group stock batch tracking fields
                    paying_site_id: isGroupStock ? (parsedNotes?.payment_source_site_id || po.site_id) : null,
                    site_group_id: isGroupStock ? siteGroupId : null,
                    original_qty: isGroupStock ? totalQuantity : null,
                    remaining_qty: isGroupStock ? totalQuantity : null,
                  };

                  // Create material_purchase_expense linked to PO
                  // For group stock, this becomes a batch with tracking fields
                  const { data: expense, error: expenseError } = await (supabase as any)
                    .from("material_purchase_expenses")
                    .insert(expensePayload)
                    .select()
                    .single();

                  if (expenseError) {
                    console.error("[useRecordDelivery] Failed to create material expense:", expenseError);
                  } else if (expense) {

                    // FIX: Backfill batch_code on stock_inventory for prior verified deliveries
                    // In the two-step flow, partial deliveries may have been verified and created
                    // stock records BEFORE this expense existed. Now update them with batch_code.
                    // IMPORTANT: Only update stock rows created from THIS PO's deliveries
                    // (traced via stock_transactions.reference_id → deliveries.po_id)
                    // to prevent accidentally stamping batch_code on other POs' stock.
                    if (isGroupStock && expense.ref_code) {
                      try {
                        // 1. Find all deliveries for this PO
                        const { data: poDeliveries } = await (supabase as any)
                          .from("deliveries")
                          .select("id")
                          .eq("po_id", data.po_id);

                        if (poDeliveries && poDeliveries.length > 0) {
                          const deliveryIds = poDeliveries.map((d: any) => d.id);

                          // 2. Find stock_inventory IDs created from these deliveries
                          const { data: stockTxs } = await (supabase as any)
                            .from("stock_transactions")
                            .select("inventory_id")
                            .eq("reference_type", "delivery")
                            .in("reference_id", deliveryIds);

                          if (stockTxs && stockTxs.length > 0) {
                            const inventoryIds = [...new Set(stockTxs.map((t: any) => t.inventory_id))];

                            // 3. Update only THOSE stock rows (not all rows with same material)
                            await (supabase as any)
                              .from("stock_inventory")
                              .update({ batch_code: expense.ref_code, updated_at: new Date().toISOString() })
                              .in("id", inventoryIds)
                              .is("batch_code", null);

                          }
                        }
                      } catch (batchErr) {
                        console.warn("[useRecordDelivery] Error backfilling stock batch_code (non-fatal):", batchErr);
                      }
                    }

                    if (po.items?.length > 0) {
                      // Create expense items from PO items (ordered quantity)
                      const expenseItems = po.items.map((item: any) => ({
                      purchase_expense_id: expense.id,
                      material_id: item.material_id,
                      brand_id: item.brand_id || null,
                      quantity: item.quantity, // Ordered quantity
                      unit_price: item.unit_price,
                    }));

                    const { error: itemsInsertError } = await (supabase as any)
                      .from("material_purchase_expense_items")
                      .insert(expenseItems);

                    if (itemsInsertError) {
                      console.warn("Failed to create material expense items:", itemsInsertError);
                    }

                    // For group stock, also populate group_stock_inventory and group_stock_transactions
                    // This auto-pushes to Inter-Site Settlement immediately on delivery
                    if (isGroupStock && siteGroupId) {
                      const transactionsToInsert = [];

                      for (const item of po.items) {
                        try {
                          // Check if inventory record exists
                          // Use .is() for null brand_id to properly match NULL values in PostgreSQL
                          let invQuery = (supabase as any)
                            .from("group_stock_inventory")
                            .select("id, current_qty, avg_unit_cost")
                            .eq("site_group_id", siteGroupId)
                            .eq("material_id", item.material_id);

                          if (item.brand_id) {
                            invQuery = invQuery.eq("brand_id", item.brand_id);
                          } else {
                            invQuery = invQuery.is("brand_id", null);
                          }

                          const { data: existingInv } = await invQuery.maybeSingle();
                          let inventoryId: string;

                          if (existingInv) {
                            inventoryId = existingInv.id;
                            // Update existing inventory - add quantity and recalculate avg cost
                            const newQty = Number(existingInv.current_qty) + Number(item.quantity);
                            const newAvgCost = newQty > 0
                              ? ((Number(existingInv.current_qty) * Number(existingInv.avg_unit_cost || 0)) +
                                 (Number(item.quantity) * Number(item.unit_price))) / newQty
                              : Number(item.unit_price);

                            await (supabase as any)
                              .from("group_stock_inventory")
                              .update({
                                current_qty: newQty,
                                avg_unit_cost: newAvgCost,
                                last_received_date: new Date().toISOString().split("T")[0],
                                updated_at: new Date().toISOString(),
                                batch_code: expense.ref_code, // Update batch code (latest batch)
                              })
                              .eq("id", existingInv.id);
                          } else {
                            // Insert new inventory record
                            const { data: newInv, error: invInsertError } = await (supabase as any)
                              .from("group_stock_inventory")
                              .insert({
                                site_group_id: siteGroupId,
                                material_id: item.material_id,
                                brand_id: item.brand_id || null,
                                current_qty: Number(item.quantity),
                                avg_unit_cost: Number(item.unit_price),
                                last_received_date: new Date().toISOString().split("T")[0],
                                batch_code: expense.ref_code, // Store batch code for usage tracking
                              })
                              .select("id")
                              .single();

                            if (invInsertError) {
                              console.warn("Failed to insert group_stock_inventory:", invInsertError);
                              continue;
                            }
                            inventoryId = newInv.id;
                          }

                          // Prepare transaction record for this item
                          const unitCost = Number(item.unit_price) || 0;
                          const totalCost = Number(item.quantity) * unitCost;

                          transactionsToInsert.push({
                            site_group_id: siteGroupId,
                            inventory_id: inventoryId,
                            transaction_type: "purchase",
                            transaction_date: po.order_date || new Date().toISOString().split("T")[0],
                            material_id: item.material_id,
                            brand_id: item.brand_id || null,
                            quantity: Number(item.quantity),
                            unit_cost: unitCost,
                            total_cost: totalCost,
                            payment_source_site_id: po.site_id,
                            batch_ref_code: expense.ref_code,
                            reference_id: expense.id,
                            notes: `Auto-created from delivery of PO ${po.po_number}`,
                          });
                        } catch (invError) {
                          console.warn("Failed to update group_stock_inventory:", invError);
                        }
                      }

                      // Insert all purchase transactions
                      if (transactionsToInsert.length > 0) {
                        const { error: txInsertError } = await (supabase as any)
                          .from("group_stock_transactions")
                          .insert(transactionsToInsert);

                        if (txInsertError) {
                          console.error("[useRecordDelivery] Failed to create group_stock_transactions:", txInsertError);
                        } else {
                          // Auto-pushed to Inter-Site Settlement
                        }
                      }
                    }
                  }
                }
                }
                  } // end else (expense doesn't exist)
              } catch (autoCreateError) {
                // Don't fail the delivery if material expense creation fails
                console.warn("Failed to auto-create material expense:", autoCreateError);
              }
            }
          }
        }
      }

      return delivery as Delivery;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["deliveries", variables.site_id],
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.materialStock.bySite(variables.site_id),
      });
      // Invalidate material purchases cache (for auto-created settlement/batch)
      queryClient.invalidateQueries({
        queryKey: queryKeys.materialPurchases.bySite(variables.site_id),
      });
      // Invalidate all material purchases (for group stock batches that show on inter-site settlement)
      queryClient.invalidateQueries({
        queryKey: queryKeys.materialPurchases.all,
      });
      // Invalidate batch usage queries (for inter-site settlement batches tab)
      queryClient.invalidateQueries({
        queryKey: queryKeys.batchUsage.all,
      });
      // Invalidate group stock sync status (for push to settlement button)
      queryClient.invalidateQueries({
        queryKey: ["group-stock-pos-sync-status"],
      });
      // Invalidate group stock inventory (for inventory page Group Purchases tab)
      queryClient.invalidateQueries({
        queryKey: ["group-stock-inventory"],
      });
      if (variables.po_id) {
        queryClient.invalidateQueries({
          queryKey: ["purchase-orders", "detail", variables.po_id],
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.purchaseOrders.bySite(variables.site_id),
        });
        // Invalidate sync status for this specific PO
        queryClient.invalidateQueries({
          queryKey: ["po-batch-sync-status", variables.po_id],
        });
      }
    },
  });
}

/**
 * Record and Verify Delivery in a single step
 * This hook combines the recording and verification into one operation,
 * creating delivery + expense + stock in a single step.
 *
 * Key differences from useRecordDelivery:
 * - Sets verification_status to "verified" (or "disputed" if hasIssues)
 * - Creates stock inventory immediately (no separate verification step needed)
 * - Requires at least one photo (serves dual purpose)
 */
export function useRecordAndVerifyDelivery() {
  const queryClient = useQueryClient();
  const supabase = createClient() as any;

  return useMutation({
    retry: false, // Not idempotent - creates stock and expenses
    mutationFn: async (data: RecordAndVerifyDeliveryFormData) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      // Validate photos (required for unified flow, optional in dev for testing)
      if ((!data.photos || data.photos.length === 0) && process.env.NODE_ENV === "production") {
        throw new Error("At least one photo is required for Record & Verify");
      }

      // Guard: never create a delivery with no positively-received line. The
      // dialog filters out 0-qty lines, so an all-zero submit arrives here as an
      // empty items array. Because we insert the `deliveries` row first and the
      // items second, an empty set would otherwise leave an orphaned 0-item GRN
      // — the "phantom 0 bag batch" bug. Refuse up-front so no row is created,
      // and build the items strictly from this filtered set below.
      const positiveItems = (data.items ?? []).filter(
        (i: any) => Number(i.received_qty) > 0
      );
      if (positiveItems.length === 0) {
        throw new Error(
          "Enter a received quantity greater than zero before recording the delivery."
        );
      }

      // Generate GRN number using UUID for collision resistance
      const generateGrn = () => {
        const uuid = crypto.randomUUID().replace(/-/g, '').substring(0, 12).toUpperCase();
        return `GRN-${uuid}`;
      };
      let grnNumber = generateGrn();

      // Validate and get vendor_id - it's required in the database
      let vendorId = data.vendor_id && data.vendor_id.trim() !== "" ? data.vendor_id : null;

      // If vendor_id is missing but we have a PO, fetch it from the PO
      if (!vendorId && data.po_id) {
        const { data: po } = await supabase
          .from("purchase_orders")
          .select("vendor_id")
          .eq("id", data.po_id)
          .single();

        if (po?.vendor_id) {
          vendorId = po.vendor_id;
        }
      }

      // vendor_id is required - throw error if still missing
      if (!vendorId) {
        throw new Error("Vendor ID is required for delivery. Please ensure the PO has a vendor.");
      }

      // Handle empty strings as null for optional UUID fields
      const locationId = data.location_id && data.location_id.trim() !== "" ? data.location_id : null;

      // Get current user for tracking who recorded and verified the delivery
      // IMPORTANT: recorded_by references auth.users(id), engineer_verified_by references public.users(id)
      let authUserId: string | null = null;  // For recorded_by (auth.users.id)
      let publicUserId: string | null = null;  // For engineer_verified_by (public.users.id)
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        console.log("[useRecordAndVerifyDelivery] Auth user:", authUser?.id);
        if (authUser?.id) {
          authUserId = authUser.id;  // Use auth user ID for recorded_by

          const { data: dbUser, error: userLookupError } = await supabase
            .from("users")
            .select("id")
            .eq("auth_id", authUser.id)
            .maybeSingle();

          if (userLookupError) {
            console.warn("[useRecordAndVerifyDelivery] User lookup error:", userLookupError);
          }

          // Use public users ID for engineer_verified_by
          if (dbUser?.id) {
            publicUserId = dbUser.id;
            console.log("[useRecordAndVerifyDelivery] Found user in DB:", publicUserId);
          } else {
            console.warn("[useRecordAndVerifyDelivery] User not found in users table for auth_id:", authUser.id);
          }
        }
      } catch (userError) {
        console.warn("[useRecordAndVerifyDelivery] Could not fetch user:", userError);
      }
      const now = new Date().toISOString();

      // Determine verification status based on whether issues were flagged
      const verificationStatus = data.hasIssues ? "disputed" : "verified";

      // Build the insert payload - set both recording AND verification fields
      const deliveryPayload = {
        po_id: data.po_id || null,
        site_id: data.site_id,
        vendor_id: vendorId,
        location_id: locationId,
        grn_number: grnNumber,
        delivery_date: data.delivery_date,
        delivery_status: "delivered",
        // KEY CHANGE: Set verified status immediately (or disputed if issues)
        verification_status: verificationStatus,
        requires_verification: false, // Already verified
        // Recording fields
        delivery_photos: data.photos.length > 0 ? data.photos : null,
        recorded_by: authUserId,  // References auth.users(id)
        recorded_at: now,
        // Verification fields (set simultaneously)
        verification_photos: data.photos, // Same photos serve both purposes
        verification_notes: data.notes || null,
        engineer_verified_by: publicUserId,  // References public.users(id)
        engineer_verified_at: now,
        discrepancies: data.issues && data.issues.length > 0 ? JSON.stringify(data.issues) : null,
        // Transport details
        challan_number: data.challan_number || null,
        challan_date: data.challan_date || null,
        challan_url: data.challan_url || null,
        vehicle_number: data.vehicle_number || null,
        driver_name: data.driver_name || null,
        driver_phone: data.driver_phone || null,
        notes: data.notes || null,
        // Yellow-bill capture (weight-based / TMT): gross bill total + GST treatment
        bill_total: data.bill_total != null ? data.bill_total : null,
        bill_includes_gst: data.bill_includes_gst != null ? data.bill_includes_gst : null,
        bill_gst_rate: data.bill_gst_rate != null ? data.bill_gst_rate : null,
      };

      // OVER-RECEIPT GUARD — runs BEFORE any insert so a fully/over-delivered PO
      // is rejected with ZERO side effects.
      //
      // WHY THIS MUST BE BEFORE THE INSERT: the DB trigger
      // `update_stock_on_verified_delivery` is the SOLE owner of
      // purchase_order_items.received_qty — it increments received_qty (and stock)
      // on the delivery_items INSERT below. The old code re-checked received_qty
      // AFTER inserting, so it saw the trigger's own increment, computed
      // "0 pending", and threw a FALSE error on the final legitimate delivery.
      // Engineers read that as "save failed" and retried, and each retry committed
      // another full delivery before throwing again — that is exactly how a single
      // 3-unit delivery became 4 GRNs / 12 units of phantom stock.
      if (data.po_id) {
        for (const item of data.items) {
          if (!item.po_item_id) continue;
          const { data: poItem } = await supabase
            .from("purchase_order_items")
            .select("quantity, received_qty")
            .eq("id", item.po_item_id)
            .single();
          if (poItem) {
            const ordered = Number(poItem.quantity ?? 0);
            const alreadyReceived = Number(poItem.received_qty ?? 0);
            const incoming = Number(item.accepted_qty ?? item.received_qty ?? 0);
            const pending = Math.max(0, ordered - alreadyReceived);
            if (incoming > pending + 0.001) {
              throw new Error(
                pending <= 0
                  ? `This PO is already fully delivered (${alreadyReceived}/${ordered} received). It looks like the delivery was already recorded — refresh the list before recording again.`
                  : `Cannot receive ${incoming} — only ${pending} of ${ordered} still pending. Adjust the delivery qty or amend the PO.`
              );
            }
          }
        }
      }

      console.log("[useRecordAndVerifyDelivery] Inserting delivery with payload:", deliveryPayload);

      // Insert with retry logic for GRN collision (409 conflict)
      const MAX_RETRIES = 3;
      let delivery = null;
      let lastError = null;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        // Regenerate GRN on retry
        if (attempt > 0) {
          deliveryPayload.grn_number = generateGrn();
          console.log(`[useRecordAndVerifyDelivery] Retry ${attempt} with new GRN:`, deliveryPayload.grn_number);
        }

        const { data, error } = await (
          supabase.from("deliveries") as any
        )
          .insert(deliveryPayload)
          .select()
          .single();

        if (!error) {
          delivery = data;
          break;
        }

        // Only retry on unique constraint violation (409/23505)
        if (error.code === '23505' || error.message?.includes('duplicate') || error.message?.includes('unique')) {
          console.warn(`[useRecordAndVerifyDelivery] GRN collision on attempt ${attempt + 1}, retrying...`);
          lastError = error;
          continue;
        }

        // For other errors, throw immediately
        console.error("[useRecordAndVerifyDelivery] Delivery insert error:", error);
        throw error;
      }

      if (!delivery) {
        console.error("[useRecordAndVerifyDelivery] Failed after retries:", lastError);
        throw lastError || new Error('Failed to create delivery after retries');
      }

      // Insert delivery items (from the positive-qty set only — see guard above)
      const deliveryItems = positiveItems.map((item: any) => ({
        delivery_id: delivery.id,
        po_item_id: item.po_item_id || null,
        material_id: item.material_id,
        brand_id: item.brand_id || null,
        ordered_qty: item.ordered_qty,
        received_qty: item.received_qty,
        accepted_qty: item.accepted_qty ?? item.received_qty,
        rejected_qty: item.rejected_qty ?? 0,
        rejection_reason: item.rejection_reason || null,
        unit_price: item.unit_price,
        notes: item.notes || null,
        // Weight-based (TMT) actuals from the yellow bill — drive stock weight + expense
        pricing_mode: item.pricing_mode ?? "per_piece",
        actual_weight: item.actual_weight ?? null,
        line_amount: item.line_amount ?? null,
      }));

      console.log("[useRecordAndVerifyDelivery] Inserting delivery items:", deliveryItems);

      const { error: itemsError } = await supabase
        .from("delivery_items")
        .insert(deliveryItems);

      if (itemsError) {
        // The `deliveries` row was already committed above. If the items insert
        // fails (e.g. a stock trigger error), roll it back so we never leave an
        // orphaned 0-item GRN behind — that was the source of the phantom
        // "0 bag" batches. Best-effort: surface the original error regardless.
        console.error("[useRecordAndVerifyDelivery] Delivery items insert error:", itemsError);
        try {
          await supabase.from("deliveries").delete().eq("id", delivery.id);
        } catch (rollbackErr) {
          console.error(
            "[useRecordAndVerifyDelivery] Failed to roll back orphaned delivery:",
            rollbackErr
          );
        }
        // PostgREST sometimes serializes to `{}` in the console; pull a real
        // message out so the dialog shows something actionable.
        const msg =
          itemsError.message ||
          itemsError.details ||
          itemsError.hint ||
          (itemsError.code ? `Database error ${itemsError.code}` : "") ||
          JSON.stringify(itemsError);
        throw new Error(`Could not save delivery items: ${msg}`);
      }

      // ESTIMATE LEARNING: write the actual kg/piece back onto the PO item so the
      // NEXT PO's weight estimate uses real delivered data, not the theoretical spec.
      // Only touches weight columns — NEVER received_qty (the trigger owns that).
      try {
        for (const item of positiveItems) {
          if (item.pricing_mode !== "per_kg") continue;
          if (!item.po_item_id) continue;
          const acceptedQty = Number(item.accepted_qty ?? item.received_qty ?? 0);
          const actualWeight = Number(item.actual_weight ?? 0);
          if (acceptedQty <= 0 || actualWeight <= 0) continue;
          await supabase
            .from("purchase_order_items")
            .update({
              actual_weight: actualWeight,
              actual_weight_per_piece: actualWeight / acceptedQty,
            })
            .eq("id", item.po_item_id);
        }
      } catch (weightWriteErr) {
        console.warn(
          "[useRecordAndVerifyDelivery] Failed to write back actual weight (non-fatal):",
          weightWriteErr
        );
      }

      // NOTE: purchase_order_items.received_qty is incremented by the DB trigger
      // `update_stock_on_verified_delivery` (fires on the delivery_items INSERT
      // above). We deliberately do NOT update received_qty here — the over-receipt
      // capacity check already ran before the insert. Touching received_qty again
      // would double-count the trigger's increment.
      if (data.po_id) {
        // Check if PO is fully delivered (re-read reflects the trigger's update)
        const { data: poItems } = await supabase
          .from("purchase_order_items")
          .select("quantity, received_qty")
          .eq("po_id", data.po_id);

        if (poItems) {
          const allDelivered = poItems.every(
            (item: any) => (item.received_qty ?? 0) >= item.quantity
          );
          const someDelivered = poItems.some(
            (item: any) => (item.received_qty ?? 0) > 0
          );

          const newStatus = allDelivered
            ? "delivered"
            : someDelivered
            ? "partial_delivered"
            : undefined;

          if (newStatus) {
            await supabase
              .from("purchase_orders")
              .update({
                status: newStatus,
                updated_at: now,
              })
              .eq("id", data.po_id);

            // When PO becomes "delivered", auto-create Material Purchase Expense
            if (newStatus === "delivered") {
              try {
                // Get full PO details with vendor and items
                const { data: po } = await supabase
                  .from("purchase_orders")
                  .select(`
                    *,
                    vendor:vendors(id, name),
                    items:purchase_order_items(
                      id, material_id, brand_id, quantity, unit_price, tax_rate,
                      pricing_mode, calculated_weight
                    )
                  `)
                  .eq("id", data.po_id)
                  .single();

                if (po) {
                  // Check if expense already exists for this PO (prevent duplicates)
                  const { data: existingExpense } = await (supabase as any)
                    .from("material_purchase_expenses")
                    .select("id, ref_code")
                    .eq("purchase_order_id", data.po_id)
                    .maybeSingle();

                  if (!existingExpense) {
                    // Parse internal_notes if it's a JSON string
                    let parsedNotes: { is_group_stock?: boolean; site_group_id?: string; group_id?: string; payment_source_site_id?: string } | null = null;
                    if (po.internal_notes) {
                      try {
                        parsedNotes = typeof po.internal_notes === "string"
                          ? JSON.parse(po.internal_notes)
                          : po.internal_notes;
                      } catch {
                        // Ignore parse errors
                      }
                    }

                    const isGroupStock = parsedNotes?.is_group_stock === true;
                    const siteGroupId = parsedNotes?.site_group_id || parsedNotes?.group_id || null;
                    const purchaseType = isGroupStock ? "group_stock" : "own_site";

                    // Generate expense reference code
                    const { data: generatedRefCode } = await (supabase as any).rpc(
                      "generate_material_purchase_reference"
                    );
                    const refCode = generatedRefCode || `MPE-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

                    // Pull EVERY delivery line of this PO (all installments) so the
                    // expense reflects the actual yellow-bill weights, not the PO
                    // estimate. For TMT (per_kg) the value is actual_weight × rate.
                    const { data: poDeliveries } = await (supabase as any)
                      .from("deliveries")
                      .select("id, bill_total")
                      .eq("po_id", data.po_id);
                    const poDeliveryIds = (poDeliveries ?? []).map((d: any) => d.id);
                    let poDeliveryItems: any[] = [];
                    if (poDeliveryIds.length > 0) {
                      const { data: di } = await (supabase as any)
                        .from("delivery_items")
                        .select(
                          "po_item_id, accepted_qty, received_qty, unit_price, pricing_mode, actual_weight, line_amount"
                        )
                        .in("delivery_id", poDeliveryIds);
                      poDeliveryItems = di ?? [];
                    }

                    const hasWeightActuals = poDeliveryItems.some(
                      (d: any) => d.pricing_mode === "per_kg" && d.actual_weight != null
                    );
                    const sumBillTotals = (poDeliveries ?? []).reduce(
                      (s: number, d: any) => s + (Number(d.bill_total) || 0),
                      0
                    );
                    const allHaveBillTotal =
                      poDeliveryIds.length > 0 &&
                      (poDeliveries ?? []).every((d: any) => Number(d.bill_total) > 0);

                    // Aggregate delivered weight + rate per PO item (for per_kg expense items).
                    const deliveredWeightByPoItem: Record<string, number> = {};
                    const rateByPoItem: Record<string, number> = {};
                    const deliveredQtyByPoItem: Record<string, number> = {};
                    for (const di of poDeliveryItems) {
                      if (!di.po_item_id) continue;
                      const qty = Number(di.accepted_qty ?? di.received_qty ?? 0);
                      deliveredQtyByPoItem[di.po_item_id] =
                        (deliveredQtyByPoItem[di.po_item_id] || 0) + qty;
                      if (di.pricing_mode === "per_kg") {
                        deliveredWeightByPoItem[di.po_item_id] =
                          (deliveredWeightByPoItem[di.po_item_id] || 0) +
                          (Number(di.actual_weight) || 0);
                      }
                      if (di.unit_price != null) rateByPoItem[di.po_item_id] = Number(di.unit_price);
                    }

                    // Calculate total amount.
                    let totalAmount = 0;
                    let totalQuantity = 0;
                    if (hasWeightActuals || allHaveBillTotal) {
                      // TMT path: total comes from the bill (gross). The editable bill
                      // total wins when present on every delivery (handling/rounding).
                      if (allHaveBillTotal) {
                        totalAmount = sumBillTotals;
                      } else {
                        for (const di of poDeliveryItems) {
                          const lineAmt =
                            di.line_amount != null
                              ? Number(di.line_amount)
                              : di.pricing_mode === "per_kg"
                                ? (Number(di.actual_weight) || 0) * (Number(di.unit_price) || 0)
                                : (Number(di.accepted_qty ?? di.received_qty) || 0) *
                                  (Number(di.unit_price) || 0);
                          totalAmount += lineAmt;
                        }
                      }
                      totalQuantity = poDeliveryItems.reduce(
                        (s: number, d: any) => s + Number(d.accepted_qty ?? d.received_qty ?? 0),
                        0
                      );
                    } else {
                      // Legacy / non-weight path: PO estimate with GST on top (unchanged).
                      for (const item of po.items || []) {
                        const itemSubtotal = (item.quantity || 0) * (item.unit_price || 0);
                        const itemTax = item.tax_rate ? itemSubtotal * (item.tax_rate / 100) : 0;
                        totalAmount += itemSubtotal + itemTax;
                        totalQuantity += Number(item.quantity || 0);
                      }
                    }

                    // Create the expense record with group stock fields if applicable
                    const { data: expense, error: expenseError } = await (supabase as any)
                      .from("material_purchase_expenses")
                      .insert({
                        ref_code: refCode,
                        site_id: data.site_id,
                        vendor_id: vendorId,
                        purchase_order_id: data.po_id,
                        purchase_type: purchaseType,
                        purchase_date: data.delivery_date,
                        total_amount: totalAmount,
                        bill_url: data.challan_url || null,
                        notes: `Auto-created from PO ${po.po_number}`,
                        created_by: authUserId,
                        // Group stock specific fields
                        paying_site_id: isGroupStock ? (parsedNotes?.payment_source_site_id || data.site_id) : null,
                        site_group_id: isGroupStock ? siteGroupId : null,
                        original_qty: isGroupStock ? totalQuantity : null,
                        remaining_qty: isGroupStock ? totalQuantity : null,
                        status: "recorded",
                      })
                      .select()
                      .single();

                    if (expenseError) {
                      console.error("[useRecordAndVerifyDelivery] Failed to create expense:", expenseError);
                    } else if (expense) {
                      console.log("[useRecordAndVerifyDelivery] Material expense created:", refCode);

                      // Weight-based (TMT) PO: the delivery bill is the REAL cost — the PO
                      // total_amount was only an estimate (Σ calculated_weight × rate). Replace
                      // it with the actual so PO list / detail / Hub all show the figure the
                      // engineer entered from the bill, and the Hub stops mislabelling the
                      // estimate-vs-actual weight variance as a "BARGAINED · saved" discount.
                      // Gated to weight-based POs on the actual/bill path so genuine per_piece
                      // negotiated discounts (estimate > settled) are preserved, and the legacy
                      // no-weight path (totalAmount = estimate) never overwrites with garbage.
                      const isWeightBasedPO = (po.items || []).some(
                        (it: any) => it.pricing_mode === "per_kg"
                      );
                      if (isWeightBasedPO && (hasWeightActuals || allHaveBillTotal)) {
                        const { error: poAmountErr } = await (supabase as any)
                          .from("purchase_orders")
                          .update({ total_amount: totalAmount })
                          .eq("id", data.po_id);
                        if (poAmountErr) {
                          console.warn(
                            "[useRecordAndVerifyDelivery] Failed to write back PO actual total (non-fatal):",
                            poAmountErr
                          );
                        }
                      }

                      // FIX: Update stock_inventory records (created by DB trigger) with batch_code
                      // The trigger fires on delivery_items INSERT and creates stock WITHOUT batch_code
                      // because the expense (which provides the ref_code) doesn't exist yet at trigger time.
                      if (isGroupStock && refCode) {
                        try {
                          for (const item of po.items || []) {
                            let batchUpdateQuery = (supabase as any)
                              .from("stock_inventory")
                              .update({ batch_code: refCode, updated_at: new Date().toISOString() })
                              .eq("site_id", data.site_id)
                              .eq("material_id", item.material_id)
                              .is("batch_code", null); // Only update if not already set

                            if (item.brand_id) {
                              batchUpdateQuery = batchUpdateQuery.eq("brand_id", item.brand_id);
                            } else {
                              batchUpdateQuery = batchUpdateQuery.is("brand_id", null);
                            }

                            await batchUpdateQuery;
                          }
                          console.log("[useRecordAndVerifyDelivery] Updated stock_inventory batch_code:", refCode);
                        } catch (batchErr) {
                          console.warn("[useRecordAndVerifyDelivery] Error updating stock batch_code (non-fatal):", batchErr);
                        }
                      }

                      // Create expense items.
                      // total_price is a GENERATED column = quantity × unit_price. For
                      // per_kg (TMT) lines we therefore store quantity = delivered KG and
                      // unit_price = rate/kg, so the generated total = kg × rate (correct).
                      // For per_piece lines, quantity = pieces, unit_price = rate as before.
                      // quantity_in_unit ALWAYS holds the count in the material's stocking
                      // unit (PIECES) so the "By variant" breakdown shows pieces, not the KG
                      // stored in `quantity` for per_kg lines (see get_batch_variant_summary).
                      if (po.items?.length > 0) {
                        const expenseItems = po.items.map((item: any) => {
                          const pieces = deliveredQtyByPoItem[item.id] ?? item.quantity;
                          if (item.pricing_mode === "per_kg") {
                            const kg =
                              deliveredWeightByPoItem[item.id] ?? item.calculated_weight ?? 0;
                            return {
                              purchase_expense_id: expense.id,
                              material_id: item.material_id,
                              brand_id: item.brand_id || null,
                              quantity: kg,
                              quantity_in_unit: pieces,
                              unit_price: rateByPoItem[item.id] ?? item.unit_price,
                            };
                          }
                          return {
                            purchase_expense_id: expense.id,
                            material_id: item.material_id,
                            brand_id: item.brand_id || null,
                            quantity: pieces,
                            quantity_in_unit: pieces,
                            unit_price: rateByPoItem[item.id] ?? item.unit_price,
                          };
                        });

                        const { error: itemsInsertError } = await (supabase as any)
                          .from("material_purchase_expense_items")
                          .insert(expenseItems);

                        if (itemsInsertError) {
                          console.warn("[useRecordAndVerifyDelivery] Failed to create expense items:", itemsInsertError);
                        }

                        // For group stock, auto-push to Inter-Site Settlement
                        if (isGroupStock && siteGroupId) {
                          const transactionsToInsert = [];

                          for (const item of po.items) {
                            try {
                              // For per_kg (TMT) group batches the unit is KG (group_stock_inventory
                              // has no separate weight column) so qty = delivered kg, cost = rate/kg.
                              const isPerKg = item.pricing_mode === "per_kg";
                              const effQty = isPerKg
                                ? (deliveredWeightByPoItem[item.id] ?? item.calculated_weight ?? 0)
                                : (deliveredQtyByPoItem[item.id] ?? item.quantity);
                              const effRate = rateByPoItem[item.id] ?? item.unit_price;

                              // Check if inventory record exists
                              let invQuery = (supabase as any)
                                .from("group_stock_inventory")
                                .select("id, current_qty, avg_unit_cost")
                                .eq("site_group_id", siteGroupId)
                                .eq("material_id", item.material_id);

                              if (item.brand_id) {
                                invQuery = invQuery.eq("brand_id", item.brand_id);
                              } else {
                                invQuery = invQuery.is("brand_id", null);
                              }

                              const { data: existingInv } = await invQuery.maybeSingle();
                              let inventoryId: string;

                              if (existingInv) {
                                inventoryId = existingInv.id;
                                const newQty = Number(existingInv.current_qty) + Number(effQty);
                                const newAvgCost = newQty > 0
                                  ? ((Number(existingInv.current_qty) * Number(existingInv.avg_unit_cost || 0)) +
                                     (Number(effQty) * Number(effRate))) / newQty
                                  : Number(effRate);

                                await (supabase as any)
                                  .from("group_stock_inventory")
                                  .update({
                                    current_qty: newQty,
                                    avg_unit_cost: newAvgCost,
                                    last_received_date: new Date().toISOString().split("T")[0],
                                    updated_at: new Date().toISOString(),
                                    batch_code: refCode,
                                  })
                                  .eq("id", existingInv.id);
                              } else {
                                const { data: newInv, error: invInsertError } = await (supabase as any)
                                  .from("group_stock_inventory")
                                  .insert({
                                    site_group_id: siteGroupId,
                                    material_id: item.material_id,
                                    brand_id: item.brand_id || null,
                                    current_qty: Number(effQty),
                                    avg_unit_cost: Number(effRate),
                                    last_received_date: new Date().toISOString().split("T")[0],
                                    batch_code: refCode,
                                  })
                                  .select("id")
                                  .single();

                                if (invInsertError) {
                                  console.warn("[useRecordAndVerifyDelivery] Failed to insert inventory:", invInsertError);
                                  continue;
                                }
                                inventoryId = newInv.id;
                              }

                              const unitCost = Number(effRate) || 0;
                              const totalCost = Number(effQty) * unitCost;

                              transactionsToInsert.push({
                                site_group_id: siteGroupId,
                                inventory_id: inventoryId,
                                transaction_type: "purchase",
                                transaction_date: po.order_date || new Date().toISOString().split("T")[0],
                                material_id: item.material_id,
                                brand_id: item.brand_id || null,
                                quantity: Number(effQty),
                                unit_cost: unitCost,
                                total_cost: totalCost,
                                payment_source_site_id: data.site_id,
                                batch_ref_code: refCode,
                                reference_id: expense.id,
                                notes: `Auto-created from delivery of PO ${po.po_number}`,
                              });
                            } catch (invError) {
                              console.warn("[useRecordAndVerifyDelivery] Inventory error:", invError);
                            }
                          }

                          if (transactionsToInsert.length > 0) {
                            const { error: txInsertError } = await (supabase as any)
                              .from("group_stock_transactions")
                              .insert(transactionsToInsert);

                            if (txInsertError) {
                              console.warn("[useRecordAndVerifyDelivery] Failed to create transactions:", txInsertError);
                            } else {
                              console.log("[useRecordAndVerifyDelivery] Auto-pushed to Inter-Site Settlement:", transactionsToInsert.length, "transactions");
                            }
                          }
                        }
                      }
                    }
                  }
                }
              } catch (expenseErr) {
                console.error("[useRecordAndVerifyDelivery] Error creating expense (non-fatal):", expenseErr);
                // Don't fail the whole transaction for expense creation failure
              }
            }
          }
        }
      }

      // NOTE: Stock creation is handled by database trigger "trg_update_stock_on_delivery"
      // which fires on delivery_items INSERT when verification_status = 'verified'
      // or requires_verification = false. DO NOT call createStockFromDeliveryItems() here
      // as it would cause DUPLICATE stock entries (10 bags becomes 20 bags).
      if (verificationStatus === "verified") {
        console.log("[useRecordAndVerifyDelivery] Stock inventory will be created by DB trigger");
      } else {
        console.log("[useRecordAndVerifyDelivery] Disputed delivery - stock created by trigger but may need review");
      }

      return { delivery, grnNumber, verificationStatus };
    },
    onSuccess: (result, variables) => {
      // Invalidate all relevant queries
      queryClient.invalidateQueries({ queryKey: queryKeys.deliveries.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.materialStock.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
      // Invalidate material purchases (for Inter-Site Settlement)
      queryClient.invalidateQueries({ queryKey: queryKeys.materialPurchases.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.batchUsage.all });
      // Invalidate group stock sync status (for push to settlement button)
      queryClient.invalidateQueries({ queryKey: ["group-stock-pos-sync-status"] });
      // Invalidate group stock inventory (for inventory page Group Purchases tab)
      queryClient.invalidateQueries({ queryKey: ["group-stock-inventory"] });

      if (variables.po_id) {
        queryClient.invalidateQueries({
          queryKey: ["purchase-orders", "detail", variables.po_id],
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.purchaseOrders.bySite(variables.site_id),
        });
        // Invalidate sync status for this specific PO
        queryClient.invalidateQueries({
          queryKey: ["po-batch-sync-status", variables.po_id],
        });
      }
    },
  });
}

/**
 * Verify a delivery
 */
export function useVerifyDelivery() {
  const queryClient = useQueryClient();
  const supabase = createClient() as any;

  return useMutation({
    mutationFn: async ({
      id,
      userId,
      notes,
    }: {
      id: string;
      userId: string;
      notes?: string;
    }) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      const { data, error } = await supabase
        .from("deliveries")
        .update({
          verified: true,
          verified_by: userId,
          verified_at: new Date().toISOString(),
          inspection_notes: notes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as Delivery;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["delivery", result.id] });
      queryClient.invalidateQueries({
        queryKey: ["deliveries", result.site_id],
      });
    },
  });
}

/**
 * Update delivery invoice details
 */
export function useUpdateDeliveryInvoice() {
  const queryClient = useQueryClient();
  const supabase = createClient() as any;

  return useMutation({
    mutationFn: async ({
      id,
      invoiceNumber,
      invoiceDate,
      invoiceAmount,
      invoiceUrl,
    }: {
      id: string;
      invoiceNumber?: string;
      invoiceDate?: string;
      invoiceAmount?: number;
      invoiceUrl?: string;
    }) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      const { data, error } = await supabase
        .from("deliveries")
        .update({
          invoice_number: invoiceNumber,
          invoice_date: invoiceDate,
          invoice_amount: invoiceAmount,
          invoice_url: invoiceUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as Delivery;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["delivery", result.id] });
      queryClient.invalidateQueries({
        queryKey: ["deliveries", result.site_id],
      });
    },
  });
}

// ============================================
// SUMMARY QUERIES
// ============================================

/**
 * Get PO summary counts by status
 */
export function usePOSummary(siteId: string | undefined) {
  const supabase = createClient() as any;

  return useQuery({
    queryKey: siteId
      ? [...queryKeys.purchaseOrders.bySite(siteId), "summary"]
      : ["purchase-orders", "summary"],
    queryFn: async () => {
      if (!siteId) return null;

      const { data, error } = await supabase
        .from("purchase_orders")
        .select("status")
        .eq("site_id", siteId);

      if (error) throw error;

      const summary = {
        draft: 0,
        pending_approval: 0,
        approved: 0,
        ordered: 0,
        partial_delivered: 0,
        delivered: 0,
        cancelled: 0,
        total: data.length,
      };

      data.forEach((po: any) => {
        summary[po.status as POStatus]++;
      });

      return summary;
    },
    enabled: !!siteId,
    staleTime: 60000,
  });
}

/**
 * Get recent deliveries
 */
export function useRecentDeliveries(siteId: string | undefined, limit = 5) {
  const supabase = createClient() as any;

  return useQuery({
    queryKey: ["recentDeliveries", siteId, limit],
    queryFn: async () => {
      if (!siteId) return [];

      const { data, error } = await supabase
        .from("deliveries")
        .select(
          `
          id, grn_number, delivery_date, delivery_status, invoice_amount,
          vendor:vendors(id, name)
        `
        )
        .eq("site_id", siteId)
        .order("delivery_date", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data;
    },
    enabled: !!siteId,
  });
}

/**
 * Get pending deliveries count
 */
export function usePendingDeliveriesCount(siteId: string | undefined) {
  const supabase = createClient() as any;

  return useQuery({
    queryKey: ["pendingDeliveriesCount", siteId],
    queryFn: async () => {
      if (!siteId) return 0;

      const { count, error } = await supabase
        .from("purchase_orders")
        .select("*", { count: "exact", head: true })
        .eq("site_id", siteId)
        .in("status", ["ordered", "partial_delivered"]);

      if (error) throw error;
      return count || 0;
    },
    enabled: !!siteId,
  });
}

// ============================================
// INTER-SITE SETTLEMENT SYNC
// ============================================

/**
 * Settlement status info for a Group Stock PO
 */
export interface GroupStockSettlementInfo {
  isSynced: boolean;
  batchRefCode: string | null;
  totalAmount: number;
  settledAmount: number;
  usedByOthersAmount: number;
}

/**
 * Batch check sync status and settlement info for multiple Group Stock POs
 * Returns a map of poId -> settlement info (sync status, settled amounts, etc.)
 */
export function useGroupStockPOsSyncStatus(poIds: string[]) {
  const supabase = createClient() as any;

  return useQuery({
    queryKey: ["group-stock-pos-sync-status", poIds.sort().join(",")],
    queryFn: async (): Promise<Map<string, GroupStockSettlementInfo>> => {
      if (poIds.length === 0) return new Map<string, GroupStockSettlementInfo>();

      // Get all group stock expenses for these POs
      // If a material_purchase_expenses record exists with purchase_type='group_stock',
      // the batch is already showing in Inter-Site Settlement, so consider it "synced"
      const { data: expenses } = await (supabase as any)
        .from("material_purchase_expenses")
        .select("id, ref_code, purchase_order_id, total_amount, paying_site_id")
        .in("purchase_order_id", poIds)
        .eq("purchase_type", "group_stock");

      if (!expenses || expenses.length === 0) {
        return new Map<string, GroupStockSettlementInfo>();
      }

      // Get ref codes for batch usage lookup
      const refCodes = expenses.map((e: any) => e.ref_code).filter(Boolean);

      // Get batch usage records to calculate "used by others" amount
      let usageByBatch = new Map<string, { usedByOthersAmount: number; settledAmount: number }>();
      if (refCodes.length > 0) {
        const { data: usageRecords } = await (supabase as any)
          .from("batch_usage_records")
          .select("batch_ref_code, total_cost, is_self_use, settlement_status")
          .in("batch_ref_code", refCodes);

        if (usageRecords) {
          for (const usage of usageRecords) {
            const existing = usageByBatch.get(usage.batch_ref_code) || { usedByOthersAmount: 0, settledAmount: 0 };
            const cost = Number(usage.total_cost || 0);
            // "Used by others" = usage that is NOT self use
            if (!usage.is_self_use) {
              existing.usedByOthersAmount += cost;
              // Settled = usage by others that has settlement_status = 'settled'
              if (usage.settlement_status === "settled") {
                existing.settledAmount += cost;
              }
            }
            usageByBatch.set(usage.batch_ref_code, existing);
          }
        }
      }

      // Build map of poId -> settlement info
      const resultMap = new Map<string, GroupStockSettlementInfo>();

      for (const expense of expenses) {
        const usageInfo = usageByBatch.get(expense.ref_code) || { usedByOthersAmount: 0, settledAmount: 0 };
        resultMap.set(expense.purchase_order_id, {
          isSynced: true,
          batchRefCode: expense.ref_code,
          totalAmount: Number(expense.total_amount || 0),
          settledAmount: usageInfo.settledAmount,
          usedByOthersAmount: usageInfo.usedByOthersAmount,
        });
      }

      return resultMap;
    },
    enabled: poIds.length > 0,
    staleTime: 60000,
  });
}

/**
 * Check if a PO's batch is synced to Inter-Site Settlement
 * Returns sync status and batch details
 */
export function usePOBatchSyncStatus(poId: string | undefined) {
  const supabase = createClient() as any;

  return useQuery({
    queryKey: ["po-batch-sync-status", poId],
    queryFn: async () => {
      if (!poId) return { isSynced: false, batchRefCode: null, hasGroupStockBatch: false };

      // Get the group stock material expense linked to this PO
      const { data: expenses } = await (supabase as any)
        .from("material_purchase_expenses")
        .select("id, ref_code, purchase_type, site_group_id, total_amount")
        .eq("purchase_order_id", poId)
        .eq("purchase_type", "group_stock");

      const groupStockExpense = expenses?.[0];
      if (!groupStockExpense) {
        return { isSynced: false, batchRefCode: null, hasGroupStockBatch: false };
      }

      const batchRefCode = groupStockExpense.ref_code;

      // Check if there are any transactions with this batch_ref_code
      const { count, error } = await (supabase as any)
        .from("group_stock_transactions")
        .select("id", { count: "exact", head: true })
        .eq("batch_ref_code", batchRefCode);

      if (error) {
        console.error("Error checking sync status:", error);
        return {
          isSynced: false,
          batchRefCode,
          hasGroupStockBatch: true,
          expenseId: groupStockExpense.id,
          siteGroupId: groupStockExpense.site_group_id,
        };
      }

      return {
        isSynced: (count || 0) > 0,
        batchRefCode,
        hasGroupStockBatch: true,
        expenseId: groupStockExpense.id,
        siteGroupId: groupStockExpense.site_group_id,
        totalAmount: groupStockExpense.total_amount,
      };
    },
    enabled: !!poId,
    staleTime: 60000,
  });
}

/**
 * Push a PO's batch to Inter-Site Settlement
 * Creates purchase transaction in group_stock_transactions
 * If the expense record was deleted, recreates it from PO data
 */
export function usePushBatchToSettlement() {
  const queryClient = useQueryClient();
  const supabase = createClient() as any;

  return useMutation({
    mutationFn: async ({ poId }: { poId: string }) => {
      await ensureFreshSession();

      // Get auth user for created_by field (references auth.users)
      let authUserId: string | null = null;
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser?.id) {
          authUserId = authUser.id;
        }
      } catch (userError) {
        console.warn("[usePushBatchToSettlement] Could not fetch user:", userError);
      }

      // Get the PO details with items
      const { data: po, error: poError } = await supabase
        .from("purchase_orders")
        .select(`
          *,
          vendor:vendors(id, name),
          items:purchase_order_items(
            id, material_id, brand_id, quantity, unit_price, tax_rate
          )
        `)
        .eq("id", poId)
        .single();

      if (poError || !po) throw new Error("Failed to fetch PO details");

      // Check if this is a Group Stock PO by looking at internal_notes
      let parsedNotes: { is_group_stock?: boolean; site_group_id?: string; group_id?: string } | null = null;
      if (po.internal_notes) {
        try {
          parsedNotes = typeof po.internal_notes === "string"
            ? JSON.parse(po.internal_notes)
            : po.internal_notes;
        } catch {
          // Ignore parse errors
        }
      }

      const isGroupStock = parsedNotes?.is_group_stock === true;
      const siteGroupIdFromNotes = parsedNotes?.site_group_id || parsedNotes?.group_id;

      if (!isGroupStock) {
        throw new Error("This PO is not marked as a Group Stock purchase. Only Group Stock POs can be pushed to Inter-Site Settlement.");
      }

      if (!siteGroupIdFromNotes) {
        throw new Error("This PO does not have a site group associated. Cannot push to Inter-Site Settlement.");
      }

      // Get the group stock material expense (simple query first)
      const { data: expenses, error: expenseError } = await (supabase as any)
        .from("material_purchase_expenses")
        .select("id, ref_code, purchase_type, site_group_id, paying_site_id, total_amount")
        .eq("purchase_order_id", poId)
        .eq("purchase_type", "group_stock");

      if (expenseError) {
        console.error("Expense fetch error:", expenseError);
        throw new Error("Failed to fetch expense details");
      }

      let groupStockExpense = expenses?.[0];
      let expenseItems: any[] = [];

      // Get PO items - if not included in the main query, fetch separately
      let poItems = po.items || [];
      if (!poItems || poItems.length === 0) {
        console.log("PO items not found in main query, fetching separately...");
        const { data: fetchedPoItems } = await supabase
          .from("purchase_order_items")
          .select("id, material_id, brand_id, quantity, unit_price, tax_rate")
          .eq("po_id", poId);
        poItems = fetchedPoItems || [];
        console.log("Fetched PO items separately:", poItems.length, "items");
      }

      if (!poItems || poItems.length === 0) {
        throw new Error(`This PO (${po.po_number}) has no items. Cannot push to Inter-Site Settlement.`);
      }

      // If no expense record exists, recreate it from PO data
      if (!groupStockExpense) {
        console.log("No expense record found, recreating from PO data...");

        // Generate a new ref_code
        const { data: refCode } = await (supabase as any).rpc(
          "generate_material_purchase_reference"
        );

        // Use PO's total_amount directly (already includes subtotal + tax + transport)
        const totalAmount = po.total_amount || 0;
        const totalQuantity = poItems.reduce(
          (sum: number, item: any) => sum + Number(item.quantity),
          0
        );

        // Get current user
        const { data: { user } } = await supabase.auth.getUser();

        // Create the expense record
        const expensePayload = {
          site_id: po.site_id,
          ref_code: refCode || `MAT-${Date.now()}`,
          purchase_type: "group_stock",
          purchase_order_id: po.id,
          vendor_id: po.vendor_id,
          vendor_name: (po.vendor as any)?.name || null,
          purchase_date: po.order_date || new Date().toISOString().split("T")[0],
          total_amount: totalAmount,
          transport_cost: po.transport_cost || 0,
          status: "recorded",
          is_paid: false,
          created_by: authUserId,  // References auth.users(id)
          notes: `Recreated for Push to Settlement from PO ${po.po_number}`,
          paying_site_id: po.site_id,
          site_group_id: siteGroupIdFromNotes,
          original_qty: totalQuantity,
          remaining_qty: totalQuantity,
        };

        const { data: newExpense, error: createExpenseError } = await (supabase as any)
          .from("material_purchase_expenses")
          .insert(expensePayload)
          .select("id, ref_code, purchase_type, site_group_id, paying_site_id, total_amount")
          .single();

        if (createExpenseError) {
          console.error("Failed to create expense:", createExpenseError);
          throw new Error("Failed to recreate expense record for this PO");
        }

        // Create expense items from PO items
        const expenseItemsPayload = poItems.map((item: any) => ({
          purchase_expense_id: newExpense.id,
          material_id: item.material_id,
          brand_id: item.brand_id || null,
          quantity: item.quantity,
          unit_price: item.unit_price,
        }));

        const { data: insertedItems, error: itemsInsertError } = await (supabase as any)
          .from("material_purchase_expense_items")
          .insert(expenseItemsPayload)
          .select("id, material_id, brand_id, quantity, unit_price");

        if (itemsInsertError) {
          console.warn("Failed to create expense items:", itemsInsertError);
          // Use PO items as fallback for transaction creation
          expenseItems = poItems.map((item: any) => ({
            material_id: item.material_id,
            brand_id: item.brand_id || null,
            quantity: item.quantity,
            unit_price: item.unit_price,
          }));
        } else {
          expenseItems = insertedItems || [];
        }

        groupStockExpense = newExpense;
        console.log("Expense record recreated:", newExpense.ref_code);
        console.log("DEBUG: Expense items after creation:", expenseItems.length, expenseItems);
      } else {
        // Expense exists, fetch items normally
        console.log("DEBUG: Expense already exists, fetching items for expense ID:", groupStockExpense.id);
        const { data: fetchedItems, error: itemsError } = await (supabase as any)
          .from("material_purchase_expense_items")
          .select("id, material_id, brand_id, quantity, unit_price")
          .eq("purchase_expense_id", groupStockExpense.id);

        console.log("DEBUG: Fetched expense items:", fetchedItems?.length || 0, "Error:", itemsError);

        if (itemsError) {
          console.error("Items fetch error:", itemsError);
        }

        expenseItems = fetchedItems || [];

        // If expense exists but has no items, create them from PO items
        if (expenseItems.length === 0 && poItems.length > 0) {
          console.log("DEBUG: Expense exists but has no items, creating from PO items...");
          const expenseItemsPayload = poItems.map((item: any) => ({
            purchase_expense_id: groupStockExpense.id,
            material_id: item.material_id,
            brand_id: item.brand_id || null,
            quantity: item.quantity,
            unit_price: item.unit_price,
          }));

          const { data: newItems, error: createItemsError } = await (supabase as any)
            .from("material_purchase_expense_items")
            .insert(expenseItemsPayload)
            .select("id, material_id, brand_id, quantity, unit_price");

          if (createItemsError) {
            console.warn("DEBUG: Failed to create expense items:", createItemsError);
          } else {
            expenseItems = newItems || [];
            console.log("DEBUG: Created expense items:", expenseItems.length);
          }
        }
      }

      const batchRefCode = groupStockExpense.ref_code;
      const siteGroupId = groupStockExpense.site_group_id || siteGroupIdFromNotes;
      const payingSiteId = groupStockExpense.paying_site_id || po.site_id;

      console.log("DEBUG: Final state - batchRefCode:", batchRefCode, "siteGroupId:", siteGroupId, "expenseItems:", expenseItems.length);

      if (!siteGroupId) {
        throw new Error("This batch is not associated with a site group");
      }

      // Check if already synced
      const { count: existingCount } = await (supabase as any)
        .from("group_stock_transactions")
        .select("id", { count: "exact", head: true })
        .eq("batch_ref_code", batchRefCode);

      if (existingCount && existingCount > 0) {
        throw new Error("This batch is already synced to Inter-Site Settlement");
      }

      // FINAL FALLBACK: If we still have no expense items, use PO items directly
      if (!expenseItems || expenseItems.length === 0) {
        console.log("DEBUG: Using PO items as final fallback for transactions");
        if (poItems.length > 0) {
          expenseItems = poItems.map((item: any) => ({
            material_id: item.material_id,
            brand_id: item.brand_id || null,
            quantity: item.quantity,
            unit_price: item.unit_price,
          }));
        } else {
          throw new Error("No items found in this expense batch and no PO items available as fallback");
        }
      }

      console.log("DEBUG: Proceeding with", expenseItems.length, "items for transaction creation");

      // Create purchase transaction for each item in the expense
      // Note: expense_items has unit_price, transactions table has unit_cost
      // IMPORTANT: group_stock_transactions requires inventory_id (NOT NULL)
      // So we need to find or create inventory records first
      const transactionsToInsert = [];

      for (const item of expenseItems) {
        const unitCost = item.unit_price || item.unit_cost || 0;
        const totalCost = (item.quantity || 0) * unitCost;

        // Try to find existing inventory record for this material/brand/site_group
        let inventoryId: string | null = null;

        let existingInventoryQuery = (supabase as any)
          .from("group_stock_inventory")
          .select("id")
          .eq("site_group_id", siteGroupId)
          .eq("material_id", item.material_id);

        if (item.brand_id) {
          existingInventoryQuery = existingInventoryQuery.eq("brand_id", item.brand_id);
        } else {
          existingInventoryQuery = existingInventoryQuery.is("brand_id", null);
        }

        const { data: existingInventory } = await existingInventoryQuery
          .eq("batch_code", batchRefCode)
          .maybeSingle();

        if (existingInventory?.id) {
          inventoryId = existingInventory.id;
          console.log("DEBUG: Found existing inventory record:", inventoryId);
        } else {
          // Try to find inventory without batch_code filter (general inventory for this material)
          let generalInventoryQuery = (supabase as any)
            .from("group_stock_inventory")
            .select("id")
            .eq("site_group_id", siteGroupId)
            .eq("material_id", item.material_id);

          if (item.brand_id) {
            generalInventoryQuery = generalInventoryQuery.eq("brand_id", item.brand_id);
          } else {
            generalInventoryQuery = generalInventoryQuery.is("brand_id", null);
          }

          const { data: generalInventory } = await generalInventoryQuery
            .is("batch_code", null)
            .maybeSingle();

          if (generalInventory?.id) {
            inventoryId = generalInventory.id;
            console.log("DEBUG: Found general inventory record:", inventoryId);
          } else {
            // Create a new inventory record for this batch
            console.log("DEBUG: Creating new inventory record for material:", item.material_id);
            const { data: newInventory, error: invError } = await (supabase as any)
              .from("group_stock_inventory")
              .insert({
                site_group_id: siteGroupId,
                material_id: item.material_id,
                brand_id: item.brand_id || null,
                batch_code: batchRefCode,
                current_qty: item.quantity || 0,
                avg_unit_cost: unitCost,
                last_received_date: po.order_date || new Date().toISOString().split("T")[0],
              })
              .select("id")
              .single();

            if (invError) {
              console.error("DEBUG: Failed to create inventory record:", invError);
              throw new Error(`Failed to create inventory record: ${invError.message}`);
            }

            inventoryId = newInventory.id;
            console.log("DEBUG: Created new inventory record:", inventoryId);
          }
        }

        transactionsToInsert.push({
          site_group_id: siteGroupId,
          inventory_id: inventoryId,
          transaction_type: "purchase",
          transaction_date: po.order_date || new Date().toISOString().split("T")[0],
          material_id: item.material_id,
          brand_id: item.brand_id,
          quantity: item.quantity,
          unit_cost: unitCost,
          total_cost: totalCost,
          payment_source_site_id: payingSiteId,
          batch_ref_code: batchRefCode,
          reference_id: groupStockExpense.id,
          notes: `Pushed from PO ${po.po_number}`,
        });
      }

      console.log("DEBUG: Inserting", transactionsToInsert.length, "transactions");

      const { data: insertedTx, error: insertError } = await (supabase as any)
        .from("group_stock_transactions")
        .insert(transactionsToInsert)
        .select();

      if (insertError) {
        console.error("DEBUG: Transaction insert error:", insertError);
        throw insertError;
      }

      return {
        success: true,
        transactionsCreated: insertedTx?.length || 0,
        batchRefCode,
      };
    },
    onSuccess: (result, variables) => {
      // Invalidate related queries
      queryClient.invalidateQueries({
        queryKey: ["po-batch-sync-status", variables.poId],
      });
      queryClient.invalidateQueries({
        queryKey: ["group-stock-pos-sync-status"],
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.interSiteSettlements.all,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.groupStock.all,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.materialPurchases.all,
      });
    },
    onError: (error) => {
      console.error("Push to settlement error:", error);
    },
  });
}

// ============================================
// PAGINATED QUERIES
// ============================================

/**
 * Pagination parameters for server-side pagination
 */
export interface POPaginationParams {
  pageIndex: number;
  pageSize: number;
}

/**
 * Paginated result with total count
 */
export interface PaginatedPOResult {
  data: PurchaseOrderWithDetails[];
  totalCount: number;
  pageCount: number;
}

/**
 * Fetch purchase orders with server-side pagination and filtering
 * Use this for large datasets where client-side pagination is not efficient
 */
export function usePaginatedPurchaseOrders(
  siteId: string | undefined,
  options: {
    pagination: POPaginationParams;
    status?: POStatus | null;
    vendorId?: string;
    searchTerm?: string;
  }
) {
  const supabase = createClient() as any;
  const { pagination, status, vendorId, searchTerm } = options;
  const { pageIndex, pageSize } = pagination;
  const offset = pageIndex * pageSize;

  return useQuery({
    queryKey: [
      ...queryKeys.purchaseOrders.bySite(siteId || ""),
      "paginated",
      { pageIndex, pageSize, status, vendorId, searchTerm },
    ],
    queryFn: async (): Promise<PaginatedPOResult> => {
      if (!siteId) return { data: [], totalCount: 0, pageCount: 0 };

      // Build count query with filters
      let countQuery = supabase
        .from("purchase_orders")
        .select("*", { count: "exact", head: true })
        .eq("site_id", siteId);

      if (status) {
        countQuery = countQuery.eq("status", status);
      }
      if (vendorId) {
        countQuery = countQuery.eq("vendor_id", vendorId);
      }
      if (searchTerm && searchTerm.length >= 2) {
        countQuery = countQuery.or(
          `po_number.ilike.%${searchTerm}%,notes.ilike.%${searchTerm}%`
        );
      }

      const { count: totalCount, error: countError } = await countQuery;
      if (countError) throw countError;

      // Build data query with pagination
      let dataQuery = supabase
        .from("purchase_orders")
        .select(
          `
          *,
          vendor:vendors(id, name, phone, email),
          items:purchase_order_items(
            *,
            material:materials(id, name, code, unit, weight_per_unit, weight_unit, length_per_piece, length_unit, image_url),
            brand:material_brands(id, brand_name, variant_name, image_url)
          )
        `
        )
        .eq("site_id", siteId)
        .range(offset, offset + pageSize - 1)
        .order("created_at", { ascending: false });

      if (status) {
        dataQuery = dataQuery.eq("status", status);
      }
      if (vendorId) {
        dataQuery = dataQuery.eq("vendor_id", vendorId);
      }
      if (searchTerm && searchTerm.length >= 2) {
        dataQuery = dataQuery.or(
          `po_number.ilike.%${searchTerm}%,notes.ilike.%${searchTerm}%`
        );
      }

      const { data, error: dataError } = await dataQuery;
      if (dataError) throw dataError;

      return {
        data: data as PurchaseOrderWithDetails[],
        totalCount: totalCount || 0,
        pageCount: Math.ceil((totalCount || 0) / pageSize),
      };
    },
    enabled: !!siteId,
    placeholderData: (previousData) => previousData, // Keep previous data while loading
  });
}
