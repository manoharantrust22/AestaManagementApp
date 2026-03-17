"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient, ensureFreshSession } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/cache/keys";
import { generateOptimisticId } from "@/lib/optimistic";
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
 * Fetch purchase orders for a site with optional status filter
 */
export function usePurchaseOrders(
  siteId: string | undefined,
  status?: POStatus | null
) {
  const supabase = createClient() as any;

  return useQuery({
    queryKey: siteId
      ? status
        ? [...queryKeys.purchaseOrders.bySite(siteId), status]
        : queryKeys.purchaseOrders.bySite(siteId)
      : ["purchase-orders", "unknown"],
    queryFn: async () => {
      if (!siteId) return [];

      let query = supabase
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
        .order("created_at", { ascending: false });

      if (status) {
        query = query.eq("status", status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as PurchaseOrderWithDetails[];
    },
    enabled: !!siteId,
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
      console.log("[useCreatePurchaseOrder] Starting mutation with data:", {
        site_id: data.site_id,
        vendor_id: data.vendor_id,
        itemsCount: data.items?.length,
        items: data.items,
      });

      // Ensure fresh session before mutation
      console.log("[useCreatePurchaseOrder] Checking session...");
      await ensureFreshSession();
      console.log("[useCreatePurchaseOrder] Session check complete, proceeding...");

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
      // When price includes GST: total = subtotal (GST already inside)
      const totalAmount = priceIncGst
        ? Math.round(subtotal)
        : Math.round(subtotal + taxAmount);
      subtotal = Math.round(subtotal);
      taxAmount = Math.round(taxAmount);

      // Generate PO number
      const timestamp = Date.now().toString(36).toUpperCase();
      const random = Math.random().toString(36).substring(2, 6).toUpperCase();
      const poNumber = `PO-${timestamp}-${random}`;

      // Insert PO
      console.log("[useCreatePurchaseOrder] Inserting PO...", { poNumber, subtotal, taxAmount, totalAmount, source_request_id: data.source_request_id });
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
          transport_cost: data.transport_cost || null,
          vendor_bill_url: data.vendor_bill_url || null,
          subtotal,
          tax_amount: taxAmount,
          total_amount: totalAmount,
          source_request_id: data.source_request_id || null,
        })
        .select()
        .single();

      console.log("[useCreatePurchaseOrder] PO insert result:", { po, poError });

      if (poError) {
        console.error("[useCreatePurchaseOrder] PO insert error:", poError);
        throw poError;
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

      console.log("[useCreatePurchaseOrder] Inserting PO items...", { count: poItems.length });
      const { data: insertedItems, error: itemsError } = await supabase
        .from("purchase_order_items")
        .insert(poItems)
        .select("id, material_id");

      console.log("[useCreatePurchaseOrder] PO items insert result:", { itemsError, insertedCount: insertedItems?.length });

      if (itemsError) {
        console.error("[useCreatePurchaseOrder] PO items insert error:", itemsError);
        throw itemsError;
      }

      console.log("[useCreatePurchaseOrder] PO created successfully:", po.po_number);

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
        console.log("[useCreatePurchaseOrder] Creating request item links...", { count: requestItemLinks.length });
        const { error: linkError } = await supabase
          .from("purchase_order_request_items")
          .insert(requestItemLinks);

        if (linkError) {
          console.warn("[useCreatePurchaseOrder] Failed to create request item links:", linkError);
          // Don't fail PO creation for this - the source_request_id link still works
        } else {
          console.log("[useCreatePurchaseOrder] Request item links created successfully");
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
        total_amount: Math.round(subtotal + taxAmount),
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
      // Also invalidate price history queries
      queryClient.invalidateQueries({
        queryKey: ["price-history"],
      });
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
        .single();

      if (error) throw error;
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
        .single();

      if (error) throw error;
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
        .single();

      if (error) throw error;
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
        .single();

      if (error) {
        throw new Error(error.message || "Failed to cancel purchase order. You may not have permission to perform this action.");
      }
      if (!data) {
        throw new Error("Purchase order not found or you do not have permission to cancel it.");
      }
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
    staleTime: 0, // Always fetch fresh data
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
    }) => {
      await ensureFreshSession();

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
      return { po_id: data.po_id, site_id: data.site_id };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.purchaseOrders.bySite(result.site_id),
      });
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.materialPurchases.bySite(result.site_id), "expenses"],
      });
    },
  });
}

// ============================================
// DELIVERIES (GRN)
// ============================================

/**
 * Fetch deliveries for a site
 */
export function useDeliveries(
  siteId: string | undefined,
  poId?: string | null
) {
  const supabase = createClient() as any;

  return useQuery({
    queryKey: ["deliveries", siteId, poId],
    queryFn: async () => {
      if (!siteId) return [];

      let query = supabase
        .from("deliveries")
        .select(
          `
          *,
          vendor:vendors(id, name, phone),
          po:purchase_orders(id, po_number, status),
          items:delivery_items(
            id, material_id, received_qty, accepted_qty, rejected_qty, unit_price,
            material:materials(id, name, code, unit, image_url),
            brand:material_brands(id, brand_name, image_url)
          )
        `
        )
        .eq("site_id", siteId)
        .order("delivery_date", { ascending: false });

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
        console.log("[useRecordDelivery] Auth user:", authUser?.id);
        if (authUser?.id) {
          authUserId = authUser.id;  // Use auth user ID directly for recorded_by
        }
      } catch (userError) {
        console.warn("[useRecordDelivery] Could not fetch user:", userError);
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
        delivery_photos: data.delivery_photos && data.delivery_photos.length > 0 ? JSON.stringify(data.delivery_photos) : null,
        recorded_by: authUserId,  // References auth.users(id)
        recorded_at: new Date().toISOString(),
        notes: data.notes || null,
      };

      // Debug logging
      console.log("[useRecordDelivery] Inserting delivery with payload:", deliveryPayload);

      // Insert with retry logic for GRN collision (409 conflict)
      const MAX_RETRIES = 3;
      let delivery = null;
      let lastError = null;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        // Regenerate GRN on retry
        if (attempt > 0) {
          deliveryPayload.grn_number = generateGrn();
          console.log(`[useRecordDelivery] Retry ${attempt} with new GRN:`, deliveryPayload.grn_number);
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
          console.warn(`[useRecordDelivery] GRN collision on attempt ${attempt + 1}, retrying...`);
          lastError = error;
          continue;
        }

        // For other errors, throw immediately
        console.error("[useRecordDelivery] Delivery insert error:", error);
        throw error;
      }

      if (!delivery) {
        console.error("[useRecordDelivery] Failed after retries:", lastError);
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

      console.log("[useRecordDelivery] Inserting delivery items:", deliveryItems);

      const { error: itemsError } = await supabase
        .from("delivery_items")
        .insert(deliveryItems);

      if (itemsError) {
        console.error("[useRecordDelivery] Delivery items insert error:", itemsError);
        throw itemsError;
      }

      // Update PO item received quantities
      if (data.po_id) {
        for (const item of data.items) {
          if (item.po_item_id) {
            const { data: poItem } = await supabase
              .from("purchase_order_items")
              .select("received_qty")
              .eq("id", item.po_item_id)
              .single();

            if (poItem) {
              await supabase
                .from("purchase_order_items")
                .update({
                  received_qty:
                    (poItem.received_qty ?? 0) +
                    (item.accepted_qty ?? item.received_qty),
                })
                .eq("id", item.po_item_id);
            }
          }
        }

        // Check if PO is fully delivered
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
                    console.log("[useRecordDelivery] Material expense already exists for PO:", existingExpense.ref_code);
                    // Skip creation, expense already exists
                  } else {
                  // Check if PO is a group stock purchase
                  // Parse internal_notes if it's a JSON string
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
                  // Backward compatibility: check both site_group_id (new) and group_id (old)
                  const siteGroupId = parsedNotes?.site_group_id || parsedNotes?.group_id || null;

                  console.log("[useRecordDelivery] Creating material expense - PO:", po.po_number);
                  console.log("[useRecordDelivery] internal_notes:", po.internal_notes);
                  console.log("[useRecordDelivery] Parsed:", { isGroupStock, siteGroupId });
                  console.log("[useRecordDelivery] Will create expense with purchase_type:", isGroupStock ? "group_stock" : "own_site");

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
                    paying_site_id: isGroupStock ? po.site_id : null,
                    site_group_id: isGroupStock ? siteGroupId : null,
                    original_qty: isGroupStock ? totalQuantity : null,
                    remaining_qty: isGroupStock ? totalQuantity : null,
                  };

                  console.log("[useRecordDelivery] Expense payload:", JSON.stringify(expensePayload, null, 2));

                  // Create material_purchase_expense linked to PO
                  // For group stock, this becomes a batch with tracking fields
                  const { data: expense, error: expenseError } = await (supabase as any)
                    .from("material_purchase_expenses")
                    .insert(expensePayload)
                    .select()
                    .single();

                  if (expenseError) {
                    console.error("[useRecordDelivery] Failed to create material expense:", expenseError);
                    console.error("[useRecordDelivery] Error details:", JSON.stringify(expenseError, null, 2));
                    console.error("[useRecordDelivery] Error message:", expenseError.message);
                    console.error("[useRecordDelivery] Error code:", expenseError.code);
                    console.error("[useRecordDelivery] Error hint:", expenseError.hint);
                  } else if (expense) {
                    console.log("[useRecordDelivery] Material expense created successfully:", {
                      id: expense.id,
                      ref_code: expense.ref_code,
                      purchase_type: expense.purchase_type,
                      site_id: expense.site_id,
                      total_amount: expense.total_amount,
                    });

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

                            console.log("[useRecordDelivery] Backfilled batch_code on", inventoryIds.length, "stock rows for PO:", data.po_id);
                          }
                        }
                        console.log("[useRecordDelivery] Backfilled stock_inventory batch_code:", expense.ref_code);
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
                          console.warn("[useRecordDelivery] Failed to create group_stock_transactions:", txInsertError);
                        } else {
                          console.log("[useRecordDelivery] Auto-pushed to Inter-Site Settlement:", transactionsToInsert.length, "transactions");
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
        delivery_photos: data.photos.length > 0 ? JSON.stringify(data.photos) : null,
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
      };

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

      // Insert delivery items
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

      console.log("[useRecordAndVerifyDelivery] Inserting delivery items:", deliveryItems);

      const { error: itemsError } = await supabase
        .from("delivery_items")
        .insert(deliveryItems);

      if (itemsError) {
        console.error("[useRecordAndVerifyDelivery] Delivery items insert error:", itemsError);
        throw itemsError;
      }

      // Update PO item received quantities (same as useRecordDelivery)
      if (data.po_id) {
        for (const item of data.items) {
          if (item.po_item_id) {
            const { data: poItem } = await supabase
              .from("purchase_order_items")
              .select("received_qty")
              .eq("id", item.po_item_id)
              .single();

            if (poItem) {
              await supabase
                .from("purchase_order_items")
                .update({
                  received_qty:
                    (poItem.received_qty ?? 0) +
                    (item.accepted_qty ?? item.received_qty),
                })
                .eq("id", item.po_item_id);
            }
          }
        }

        // Check if PO is fully delivered
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

                  if (!existingExpense) {
                    // Parse internal_notes if it's a JSON string
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
                    const siteGroupId = parsedNotes?.site_group_id || parsedNotes?.group_id || null;
                    const purchaseType = isGroupStock ? "group_stock" : "own_site";

                    // Generate expense reference code
                    const { data: generatedRefCode } = await (supabase as any).rpc(
                      "generate_material_purchase_reference"
                    );
                    const refCode = generatedRefCode || `MPE-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

                    // Calculate total amount from items
                    let totalAmount = 0;
                    let totalQuantity = 0;
                    for (const item of po.items || []) {
                      const itemSubtotal = (item.quantity || 0) * (item.unit_price || 0);
                      const itemTax = item.tax_rate ? itemSubtotal * (item.tax_rate / 100) : 0;
                      totalAmount += itemSubtotal + itemTax;
                      totalQuantity += Number(item.quantity || 0);
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
                        paying_site_id: isGroupStock ? data.site_id : null,
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

                      // Create expense items
                      if (po.items?.length > 0) {
                        const expenseItems = po.items.map((item: any) => ({
                          purchase_expense_id: expense.id,
                          material_id: item.material_id,
                          brand_id: item.brand_id || null,
                          quantity: item.quantity,
                          unit_price: item.unit_price,
                        }));

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
                                    current_qty: Number(item.quantity),
                                    avg_unit_cost: Number(item.unit_price),
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
    staleTime: 30000,
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
    staleTime: 30000, // 30 seconds
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
