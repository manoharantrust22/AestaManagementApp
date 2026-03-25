"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient, ensureFreshSession } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/cache/keys";
import type {
  Delivery,
  DeliveryWithVerification,
  DeliveryVerificationFormData,
  DeliveryDiscrepancy,
} from "@/types/material.types";

// Type for pending verification view
interface PendingDeliveryVerification {
  id: string;
  grn_number: string | null;
  po_number: string | null;
  vendor_name: string | null;
  site_id: string;
  delivery_date: string;
  total_value: number | null;
  item_count: number;
  vehicle_number: string | null;
  driver_name: string | null;
}

// Type for POs awaiting delivery
export interface POAwaitingDelivery {
  id: string;
  po_number: string;
  vendor_name: string | null;
  vendor_id: string | null;
  site_id: string;
  order_date: string;
  expected_delivery_date: string | null;
  total_amount: number;
  item_count: number;
  status: string;
  is_group_stock: boolean;
  site_group_id: string | null;
  items: Array<{
    id: string;
    material_id: string;
    material_name: string;
    material_image_url: string | null;
    brand_id: string | null;
    brand_name: string | null;
    brand_image_url: string | null;
    quantity: number;
    received_qty: number;
    unit: string;
    unit_price: number;
    pricing_mode: "per_piece" | "per_kg";
    calculated_weight: number | null;
    actual_weight: number | null;
    tax_rate: number | null;
  }>;
}

// ============================================
// DELIVERY VERIFICATION
// ============================================

/**
 * Fetch POs awaiting delivery (status = ordered or partial_delivered)
 * These are POs that need delivery to be recorded by site engineer
 */
export function usePOsAwaitingDelivery(siteId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: siteId
      ? [...queryKeys.purchaseOrders.bySite(siteId), "awaiting-delivery"]
      : ["purchase-orders", "awaiting-delivery"],
    queryFn: async () => {
      if (!siteId) return [] as POAwaitingDelivery[];

      const { data, error } = await supabase
        .from("purchase_orders")
        .select(`
          id,
          po_number,
          site_id,
          vendor_id,
          order_date,
          expected_delivery_date,
          total_amount,
          status,
          internal_notes,
          vendor:vendors(name),
          items:purchase_order_items(
            id,
            material_id,
            quantity,
            received_qty,
            unit_price,
            pricing_mode,
            calculated_weight,
            actual_weight,
            tax_rate,
            material:materials(id, name, code, unit, image_url),
            brand:material_brands(id, brand_name, image_url)
          )
        `)
        .eq("site_id", siteId)
        .in("status", ["ordered", "partial_delivered"])
        .order("order_date", { ascending: false });

      if (error) throw error;

      // Transform data
      const transformed: POAwaitingDelivery[] = (data || []).map((po: any) => {
        // Parse internal_notes to check if group stock
        let isGroupStock = false;
        let siteGroupId: string | null = null;
        if (po.internal_notes) {
          try {
            const notes = typeof po.internal_notes === "string"
              ? JSON.parse(po.internal_notes)
              : po.internal_notes;
            isGroupStock = notes?.is_group_stock === true;
            siteGroupId = notes?.site_group_id || null;
          } catch {
            // Ignore parse errors
          }
        }

        return {
          id: po.id,
          po_number: po.po_number,
          vendor_name: po.vendor?.name || null,
          vendor_id: po.vendor_id,
          site_id: po.site_id,
          order_date: po.order_date,
          expected_delivery_date: po.expected_delivery_date,
          total_amount: Number(po.total_amount || 0),
          item_count: po.items?.length || 0,
          status: po.status,
          is_group_stock: isGroupStock,
          site_group_id: siteGroupId,
          items: (po.items || []).map((item: any) => ({
            id: item.id,
            material_id: item.material_id,
            material_name: item.material?.name || "Unknown",
            material_image_url: item.material?.image_url || null,
            brand_id: item.brand?.id || null,
            brand_name: item.brand?.brand_name || null,
            brand_image_url: item.brand?.image_url || null,
            quantity: Number(item.quantity || 0),
            received_qty: Number(item.received_qty || 0),
            unit: item.material?.unit || "nos",
            unit_price: Number(item.unit_price || 0),
            pricing_mode: item.pricing_mode || "per_piece",
            calculated_weight: item.calculated_weight ? Number(item.calculated_weight) : null,
            actual_weight: item.actual_weight ? Number(item.actual_weight) : null,
            tax_rate: item.tax_rate ? Number(item.tax_rate) : null,
          })),
        };
      });

      return transformed;
    },
    enabled: !!siteId,
  });
}

/**
 * Fetch pending delivery verifications for a site
 */
export function usePendingDeliveryVerifications(siteId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: siteId
      ? queryKeys.deliveries.pendingVerification(siteId)
      : ["deliveries", "pending-verification"],
    queryFn: async () => {
      if (!siteId) return [] as PendingDeliveryVerification[];

      // Query deliveries table with joins instead of view
      const { data, error } = await supabase
        .from("deliveries")
        .select(`
          id,
          grn_number,
          site_id,
          delivery_date,
          vehicle_number,
          driver_name,
          verification_status,
          po:purchase_orders(po_number),
          vendor:vendors(name)
        `)
        .eq("site_id", siteId)
        .eq("delivery_status", "delivered")
        .eq("verification_status", "pending")
        .order("delivery_date", { ascending: false });

      if (error) throw error;

      // Transform data to match expected shape
      const transformed: PendingDeliveryVerification[] = (data || []).map((d) => ({
        id: d.id,
        grn_number: d.grn_number,
        po_number: (d.po as { po_number: string } | null)?.po_number || null,
        vendor_name: (d.vendor as { name: string } | null)?.name || null,
        site_id: d.site_id,
        delivery_date: d.delivery_date,
        total_value: null,
        item_count: 0,
        vehicle_number: d.vehicle_number,
        driver_name: d.driver_name,
      }));

      return transformed;
    },
    enabled: !!siteId,
  });
}

/**
 * Fetch all pending verifications (for admin/office)
 */
export function useAllPendingVerifications() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["deliveries", "all-pending-verification"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deliveries")
        .select(`
          id,
          grn_number,
          site_id,
          delivery_date,
          vehicle_number,
          driver_name,
          verification_status,
          po:purchase_orders(po_number),
          vendor:vendors(name)
        `)
        .eq("delivery_status", "delivered")
        .eq("verification_status", "pending")
        .order("delivery_date", { ascending: false });

      if (error) throw error;

      // Transform data to match expected shape
      const transformed: PendingDeliveryVerification[] = (data || []).map((d) => ({
        id: d.id,
        grn_number: d.grn_number,
        po_number: (d.po as { po_number: string } | null)?.po_number || null,
        vendor_name: (d.vendor as { name: string } | null)?.name || null,
        site_id: d.site_id,
        delivery_date: d.delivery_date,
        total_value: null,
        item_count: 0,
        vehicle_number: d.vehicle_number,
        driver_name: d.driver_name,
      }));

      return transformed;
    },
  });
}

/**
 * Fetch delivery verification details
 */
export function useDeliveryVerificationDetails(deliveryId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: deliveryId
      ? queryKeys.deliveries.byId(deliveryId)
      : ["deliveries", "detail"],
    queryFn: async () => {
      if (!deliveryId) return null;

      // Fetch delivery with relations
      const { data: delivery, error: deliveryError } = await supabase
        .from("deliveries")
        .select(`
          *,
          vendor:vendors(*),
          site:sites(name),
          po:purchase_orders(*)
        `)
        .eq("id", deliveryId)
        .single();

      if (deliveryError) throw deliveryError;

      // Fetch items
      const { data: items, error: itemsError } = await supabase
        .from("delivery_items")
        .select(`
          *,
          material:materials(id, name, code, unit),
          brand:material_brands(id, brand_name)
        `)
        .eq("delivery_id", deliveryId);

      if (itemsError) throw itemsError;

      return {
        ...delivery,
        vendor: delivery.vendor,
        site: delivery.site,
        po: delivery.po,
        items,
      } as DeliveryWithVerification;
    },
    enabled: !!deliveryId,
  });
}

/**
 * Fetch deliveries by site with verification status
 */
export function useDeliveriesWithVerification(
  siteId: string | undefined,
  options?: {
    verificationStatus?: string;
    limit?: number;
  }
) {
  const supabase = createClient();

  return useQuery({
    queryKey: siteId
      ? [...queryKeys.deliveries.bySite(siteId), "verification", options]
      : ["deliveries", "site", "verification"],
    queryFn: async () => {
      if (!siteId) return [] as PendingDeliveryVerification[];

      let query = supabase
        .from("deliveries")
        .select(`
          id,
          grn_number,
          site_id,
          delivery_date,
          vehicle_number,
          driver_name,
          verification_status,
          po:purchase_orders(po_number),
          vendor:vendors(name),
          delivery_items(
            material:materials(name, image_url),
            brand:material_brands(image_url)
          )
        `)
        .eq("site_id", siteId)
        .order("delivery_date", { ascending: false });

      if (options?.limit) {
        query = query.limit(options.limit);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Transform data - use type assertion since schema is correct
      const transformed = ((data || []) as Array<{
        id: string;
        grn_number: string | null;
        site_id: string;
        delivery_date: string;
        vehicle_number: string | null;
        driver_name: string | null;
        verification_status: string | null;
        po: { po_number: string } | null;
        vendor: { name: string } | null;
        delivery_items: Array<{
          material: { name: string; image_url: string | null } | null;
          brand: { image_url: string | null } | null;
        }> | null;
      }>).map((d) => ({
        id: d.id,
        grn_number: d.grn_number,
        po_number: d.po?.po_number || null,
        vendor_name: d.vendor?.name || null,
        site_id: d.site_id,
        delivery_date: d.delivery_date,
        verification_status: d.verification_status || "pending",
        total_value: null,
        item_count: d.delivery_items?.length || 0,
        vehicle_number: d.vehicle_number,
        driver_name: d.driver_name,
        material_images: (d.delivery_items || []).map((di) => ({
          material_image_url: di.material?.image_url || null,
          brand_image_url: di.brand?.image_url || null,
          material_name: di.material?.name || null,
        })),
      }));

      return transformed;
    },
    enabled: !!siteId,
  });
}

/**
 * Helper function to create/update stock inventory from delivery items
 * This is needed because the database trigger only fires on INSERT,
 * but delivery isn't verified at INSERT time
 *
 * Exported for use by useRecordAndVerifyDelivery hook
 */
export async function createStockFromDeliveryItems(
  supabase: ReturnType<typeof createClient>,
  deliveryId: string
) {
  console.log("[Stock Creation] Starting for delivery:", deliveryId);

  // Get delivery details including PO info for group stock detection
  const { data: delivery, error: deliveryError } = await supabase
    .from("deliveries")
    .select("id, site_id, location_id, delivery_date, po_id, purchase_orders(internal_notes)")
    .eq("id", deliveryId)
    .single();

  if (deliveryError || !delivery) {
    const errorMsg = `Failed to fetch delivery for stock creation: ${deliveryError?.message || "Delivery not found"}`;
    console.error("[Stock Creation]", errorMsg);
    throw new Error(errorMsg);
  }

  console.log("[Stock Creation] Delivery found:", { site_id: delivery.site_id, location_id: delivery.location_id });

  // Get delivery items with tax rate from purchase order items
  const { data: items, error: itemsError } = await supabase
    .from("delivery_items")
    .select(`
      id, material_id, brand_id, received_qty, accepted_qty, unit_price, po_item_id,
      purchase_order_item:purchase_order_items!po_item_id(tax_rate)
    `)
    .eq("delivery_id", deliveryId);

  if (itemsError || !items) {
    const errorMsg = `Failed to fetch delivery items for stock creation: ${itemsError?.message || "No items found"}`;
    console.error("[Stock Creation]", errorMsg);
    throw new Error(errorMsg);
  }

  console.log("[Stock Creation] Found", items.length, "delivery items");

  if (items.length === 0) {
    throw new Error("No delivery items found to create stock from");
  }

  // Check if this is a group stock PO and get batch_code
  let batchCode: string | null = null;

  if (delivery.po_id) {
    const internalNotes = (delivery.purchase_orders as { internal_notes: Record<string, unknown> } | null)?.internal_notes;
    const isGroupStock = internalNotes?.is_group_stock === true;

    if (isGroupStock) {
      // Look up the batch ref_code from material_purchase_expenses
      const { data: expenseData } = await supabase
        .from("material_purchase_expenses")
        .select("ref_code")
        .eq("purchase_order_id", delivery.po_id)
        .eq("purchase_type", "group_stock")
        .maybeSingle();

      if (expenseData?.ref_code) {
        batchCode = expenseData.ref_code;
        console.log("[Stock Creation] Group stock batch detected:", batchCode);
      }
    }
  }

  let stockCreatedCount = 0;
  let stockUpdatedCount = 0;

  // Create/update stock for each item
  for (const item of items) {
    const qty = item.accepted_qty ?? item.received_qty;
    if (!qty || qty <= 0) {
      console.log("[Stock Creation] Skipping item with zero/null qty:", item.id);
      continue;
    }

    // Get tax rate from purchase order item (GST)
    const taxRate = (item.purchase_order_item as { tax_rate: number | null } | null)?.tax_rate || 0;
    // Calculate unit price including GST
    const unitPriceWithGst = (item.unit_price || 0) * (1 + taxRate / 100);

    // Group stock with batch_code: create a separate stock_inventory row per batch.
    // Check if the DB trigger already created it (fires on delivery_items INSERT).
    // If so, skip to avoid double-counting.
    if (batchCode) {
      const { data: existingBatch } = await supabase
        .from("stock_inventory")
        .select("id")
        .eq("site_id", delivery.site_id)
        .eq("material_id", item.material_id)
        .eq("batch_code", batchCode)
        .maybeSingle();

      if (existingBatch) {
        console.log("[Stock Creation] Group stock batch already exists (trigger created it):", batchCode);
        stockUpdatedCount++;
      } else {
        const { error: insertError } = await supabase.from("stock_inventory").insert({
          site_id: delivery.site_id,
          location_id: delivery.location_id,
          material_id: item.material_id,
          brand_id: item.brand_id,
          current_qty: qty,
          avg_unit_cost: unitPriceWithGst,
          last_received_date: delivery.delivery_date,
          batch_code: batchCode,
        });

        if (insertError) {
          console.error("[Stock Creation] Error inserting group stock batch:", insertError);
          throw new Error(`Failed to create group stock inventory: ${insertError.message}`);
        }
        stockCreatedCount++;
        console.log("[Stock Creation] Created new group stock batch:", batchCode, "material:", item.material_id, "qty:", qty);
      }
    } else {
      // Non-group stock: check if inventory exists, update or insert
      // FIX: Filter by batch_code IS NULL to prevent accidentally matching/updating
      // batch-coded group stock rows when this is a non-group delivery
      let stockQuery = supabase
        .from("stock_inventory")
        .select("id, current_qty, avg_unit_cost, batch_code")
        .eq("site_id", delivery.site_id)
        .eq("material_id", item.material_id)
        .is("batch_code", null);

      if (delivery.location_id) {
        stockQuery = stockQuery.eq("location_id", delivery.location_id);
      } else {
        stockQuery = stockQuery.is("location_id", null);
      }

      if (item.brand_id) {
        stockQuery = stockQuery.eq("brand_id", item.brand_id);
      } else {
        stockQuery = stockQuery.is("brand_id", null);
      }

      const { data: existingStock, error: stockQueryError } = await stockQuery.maybeSingle();

      if (stockQueryError) {
        console.error("[Stock Creation] Error checking existing stock:", stockQueryError);
        throw new Error(`Failed to check existing stock: ${stockQueryError.message}`);
      }

      if (existingStock) {
        // Update existing stock with weighted average cost (including GST)
        const newQty = existingStock.current_qty + qty;
        const existingValue = existingStock.current_qty * (existingStock.avg_unit_cost || 0);
        const newValue = qty * unitPriceWithGst;
        const newAvgCost = newQty > 0 ? (existingValue + newValue) / newQty : 0;

        const { error: updateError } = await supabase
          .from("stock_inventory")
          .update({
            current_qty: newQty,
            avg_unit_cost: newAvgCost,
            last_received_date: delivery.delivery_date,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingStock.id);

        if (updateError) {
          console.error("[Stock Creation] Error updating stock:", updateError);
          throw new Error(`Failed to update stock inventory: ${updateError.message}`);
        }
        stockUpdatedCount++;
        console.log("[Stock Creation] Updated existing stock:", existingStock.id, "new qty:", newQty);
      } else {
        // Create new stock inventory record (with unit cost including GST)
        const { error: insertError } = await supabase.from("stock_inventory").insert({
          site_id: delivery.site_id,
          location_id: delivery.location_id,
          material_id: item.material_id,
          brand_id: item.brand_id,
          current_qty: qty,
          avg_unit_cost: unitPriceWithGst,
          last_received_date: delivery.delivery_date,
        });

        if (insertError) {
          console.error("[Stock Creation] Error inserting stock:", insertError);
          throw new Error(`Failed to create stock inventory: ${insertError.message}`);
        }
        stockCreatedCount++;
        console.log("[Stock Creation] Created new stock for material:", item.material_id, "qty:", qty);
      }
    }
  }

  console.log("[Stock Creation] Complete. Created:", stockCreatedCount, "Updated:", stockUpdatedCount);

  if (stockCreatedCount === 0 && stockUpdatedCount === 0) {
    throw new Error("No stock records were created or updated - all items may have zero quantity");
  }
}

/**
 * Verify a delivery
 */
export function useVerifyDelivery() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      deliveryId,
      userId,
      verificationPhotos,
      verificationNotes,
      discrepancies,
      verificationStatus,
    }: {
      deliveryId: string;
      userId: string;
      verificationPhotos: string[];
      verificationNotes?: string;
      discrepancies?: DeliveryDiscrepancy[];
      verificationStatus: "verified" | "disputed" | "rejected";
    }) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      // Update delivery verification status
      const { error } = await supabase
        .from("deliveries")
        .update({
          verification_status: verificationStatus,
          verification_notes: verificationNotes || null,
          verification_photos: verificationPhotos.length > 0 ? verificationPhotos : null,
          engineer_verified_by: userId,
          engineer_verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", deliveryId);

      if (error) throw error;

      // Handle discrepancies by updating delivery items
      if (discrepancies && discrepancies.length > 0) {
        for (const d of discrepancies) {
          await supabase
            .from("delivery_items")
            .update({
              accepted_qty: d.received_qty,
              rejection_reason: `${d.issue}: ${d.notes || ""}`,
            })
            .eq("id", d.item_id);
        }
      }

      // Create stock inventory if verified
      // Note: DB trigger only fires on INSERT, so we need to create stock manually here
      if (verificationStatus === "verified") {
        await createStockFromDeliveryItems(supabase, deliveryId);
      }

      return { success: true };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.deliveries.byId(variables.deliveryId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.deliveries.all,
      });
      // Invalidate stock since verification triggers stock update
      queryClient.invalidateQueries({
        queryKey: queryKeys.materialStock.all,
      });
    },
  });
}

/**
 * Quick verify delivery (no discrepancies)
 */
export function useQuickVerifyDelivery() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      deliveryId,
      userId,
      photos,
      notes,
    }: {
      deliveryId: string;
      userId: string;
      photos: string[];
      notes?: string;
    }) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      // First update delivery items to set accepted_qty = received_qty
      const { data: items, error: itemsError } = await supabase
        .from("delivery_items")
        .select("id, received_qty")
        .eq("delivery_id", deliveryId);

      if (itemsError) throw itemsError;

      // Update each item
      for (const item of items || []) {
        await supabase
          .from("delivery_items")
          .update({ accepted_qty: item.received_qty })
          .eq("id", item.id);
      }

      // Update delivery verification status
      const { error } = await supabase
        .from("deliveries")
        .update({
          verification_status: "verified",
          verification_notes: notes || null,
          verification_photos: photos.length > 0 ? photos : null,
          engineer_verified_by: userId,
          engineer_verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", deliveryId);

      if (error) throw error;

      // Create stock inventory now that delivery is verified
      // Note: DB trigger only fires on INSERT, so we need to create stock manually here
      await createStockFromDeliveryItems(supabase, deliveryId);

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.deliveries.all,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.materialStock.all,
      });
    },
  });
}

/**
 * Update delivery verification status only
 */
export function useUpdateVerificationStatus() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      deliveryId,
      status,
      notes,
    }: {
      deliveryId: string;
      status: "pending" | "verified" | "disputed" | "rejected";
      notes?: string;
    }) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      const { error } = await supabase
        .from("deliveries")
        .update({
          verification_status: status,
          verification_notes: notes || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", deliveryId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.deliveries.byId(variables.deliveryId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.deliveries.all,
      });
    },
  });
}

/**
 * Update delivery item received quantities (for discrepancies)
 */
export function useUpdateDeliveryItemQuantities() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      deliveryId,
      items,
    }: {
      deliveryId: string;
      items: Array<{
        id: string;
        receivedQty: number;
        acceptedQty: number;
        rejectedQty?: number;
        rejectionReason?: string;
      }>;
    }) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      for (const item of items) {
        const { error } = await supabase
          .from("delivery_items")
          .update({
            received_qty: item.receivedQty,
            accepted_qty: item.acceptedQty,
            rejected_qty: item.rejectedQty || 0,
            rejection_reason: item.rejectionReason || null,
          })
          .eq("id", item.id);

        if (error) throw error;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.deliveries.byId(variables.deliveryId),
      });
    },
  });
}

/**
 * Upload verification photos
 */
export function useUploadVerificationPhotos() {
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      deliveryId,
      files,
    }: {
      deliveryId: string;
      files: File[];
    }) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      const uploadedUrls: string[] = [];

      for (const file of files) {
        const fileExt = file.name.split(".").pop();
        const fileName = `${deliveryId}/${Date.now()}.${fileExt}`;

        const { data, error } = await supabase.storage
          .from("delivery-verifications")
          .upload(fileName, file);

        if (error) throw error;

        // Get public URL
        const {
          data: { publicUrl },
        } = supabase.storage
          .from("delivery-verifications")
          .getPublicUrl(data.path);

        uploadedUrls.push(publicUrl);
      }

      return uploadedUrls;
    },
  });
}

/**
 * Get verification statistics
 */
export function useVerificationStats(siteId?: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["verification-stats", siteId],
    queryFn: async () => {
      let query = supabase
        .from("deliveries")
        .select("verification_status");

      if (siteId) {
        query = query.eq("site_id", siteId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const stats = {
        pending: 0,
        verified: 0,
        disputed: 0,
        rejected: 0,
        total: (data as unknown[])?.length || 0,
      };

      // Type the data properly
      const typedData = data as Array<{ verification_status?: string }> | null;
      for (const d of typedData || []) {
        const status = d.verification_status || "pending";
        if (status === "verified") {
          stats.verified++;
        } else if (status === "rejected") {
          stats.rejected++;
        } else if (status === "disputed") {
          stats.disputed++;
        } else {
          stats.pending++;
        }
      }

      return stats;
    },
  });
}

/**
 * Get deliveries requiring verification count for badge
 */
export function usePendingVerificationCount(siteId?: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["pending-verification-count", siteId],
    queryFn: async () => {
      let query = supabase
        .from("deliveries")
        .select("*", { count: "exact", head: true })
        .eq("delivery_status", "delivered")
        .eq("verification_status", "pending");

      if (siteId) {
        query = query.eq("site_id", siteId);
      }

      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    },
    refetchInterval: 60000, // Refetch every minute
    refetchIntervalInBackground: false, // Don't poll when tab is hidden
  });
}
