"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient, ensureFreshSession } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/cache/keys";
import type {
  VendorInventory,
  VendorInventoryWithDetails,
  VendorInventoryFormData,
  PriceHistory,
  PriceHistoryWithDetails,
  PriceEntryFormData,
} from "@/types/material.types";

// ============================================
// VENDOR INVENTORY
// Note: Using type assertions because vendor_inventory and price_history tables
// may not be in generated types until regeneration
// ============================================

/**
 * Fetch vendor inventory (all materials a vendor sells)
 */
export function useVendorInventory(vendorId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: vendorId
      ? queryKeys.vendorInventory.byVendor(vendorId)
      : ["vendor-inventory", "vendor"],
    queryFn: async () => {
      if (!vendorId) return [] as VendorInventoryWithDetails[];

      const { data, error } = await (supabase as any)
        .from("vendor_inventory")
        .select(
          `
          *,
          vendor:vendors(id, name, vendor_type, shop_name),
          material:materials(id, name, code, unit, category_id),
          brand:material_brands(id, brand_name)
        `
        )
        .eq("vendor_id", vendorId)
        .eq("is_available", true)
        .order("material_id");

      if (error) throw error;

      // Calculate total landed cost for each item
      return ((data || []) as any[]).map((item) => ({
        ...item,
        total_landed_cost:
          (item.current_price || 0) +
          (item.price_includes_transport ? 0 : item.transport_cost || 0) +
          (item.loading_cost || 0) +
          (item.unloading_cost || 0),
      })) as VendorInventoryWithDetails[];
    },
    enabled: !!vendorId,
  });
}

/**
 * Fetch all vendors that sell a specific material
 */
export function useMaterialVendors(materialId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: materialId
      ? queryKeys.vendorInventory.byMaterial(materialId)
      : ["vendor-inventory", "material"],
    queryFn: async () => {
      if (!materialId) return [] as VendorInventoryWithDetails[];

      const { data, error} = await (supabase as any)
        .from("vendor_inventory")
        .select(
          `
          id,
          vendor_id,
          material_id,
          custom_material_name,
          brand_id,
          current_price,
          price_includes_gst,
          gst_rate,
          price_includes_transport,
          transport_cost,
          loading_cost,
          unloading_cost,
          is_available,
          min_order_qty,
          unit,
          lead_time_days,
          notes,
          updated_at,
          vendor:vendors(id, name, vendor_type, shop_name, phone, contact_person),
          material:materials(id, name, code, unit, category_id),
          brand:material_brands(id, brand_name)
        `
        )
        .eq("material_id", materialId)
        .eq("is_available", true)
        .order("current_price");

      if (error) throw error;

      // Calculate total landed cost for each item
      return ((data || []) as any[]).map((item) => ({
        ...item,
        total_landed_cost:
          (item.current_price || 0) +
          (item.price_includes_transport ? 0 : item.transport_cost || 0) +
          (item.loading_cost || 0) +
          (item.unloading_cost || 0),
      })) as VendorInventoryWithDetails[];
    },
    enabled: !!materialId,
  });
}

/**
 * Fetch vendor inventory for multiple material variants (batch query)
 * Used when displaying vendors for a parent material with variants
 */
export function useVendorsByVariants(variantIds: string[]) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["vendor-inventory", "variants", variantIds],
    queryFn: async () => {
      if (!variantIds || variantIds.length === 0) return [];

      const { data, error } = await (supabase as any)
        .from("vendor_inventory")
        .select(
          `
          id,
          vendor_id,
          material_id,
          brand_id,
          current_price,
          pricing_mode,
          price_includes_gst,
          gst_rate,
          price_includes_transport,
          is_available,
          min_order_qty,
          unit,
          lead_time_days,
          vendor:vendors(id, name, vendor_type, shop_name, phone, whatsapp_number, city, accepts_credit, provides_transport),
          material:materials(id, name, code, unit, weight_per_unit, length_per_piece, length_unit, rods_per_bundle),
          brand:material_brands(id, brand_name, variant_name)
        `
        )
        .in("material_id", variantIds)
        .eq("is_available", true);

      if (error) throw error;
      return (data || []) as Array<{
        id: string;
        vendor_id: string;
        material_id: string;
        brand_id: string | null;
        current_price: number | null;
        pricing_mode: 'per_piece' | 'per_kg' | null;
        price_includes_gst: boolean;
        gst_rate: number;
        price_includes_transport: boolean;
        is_available: boolean;
        min_order_qty: number | null;
        unit: string | null;
        lead_time_days: number | null;
        vendor: {
          id: string;
          name: string;
          vendor_type: string;
          shop_name: string | null;
          phone: string | null;
          whatsapp_number: string | null;
          city: string | null;
          accepts_credit: boolean;
          provides_transport: boolean;
        } | null;
        material: {
          id: string;
          name: string;
          code: string | null;
          unit: string;
          weight_per_unit: number | null;
          length_per_piece: number | null;
          length_unit: string | null;
          rods_per_bundle: number | null;
        } | null;
        brand: {
          id: string;
          brand_name: string;
          variant_name: string | null;
        } | null;
      }>;
    },
    enabled: variantIds.length > 0,
  });
}

/**
 * Fetch brand prices for a material
 * Returns a map of brandId -> { bestPrice, vendorName, vendorCount, includesGst }
 */
export function useMaterialBrandPrices(materialId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["vendor-inventory", "brand-prices", materialId],
    queryFn: async () => {
      if (!materialId) return new Map<string, { bestPrice: number; vendorName: string; vendorCount: number; includesGst: boolean }>();

      const { data, error } = await (supabase as any)
        .from("vendor_inventory")
        .select(
          `
          brand_id,
          current_price,
          price_includes_gst,
          vendor:vendors(id, name)
        `
        )
        .eq("material_id", materialId)
        .eq("is_available", true)
        .not("brand_id", "is", null);

      if (error) throw error;

      // Group by brand and find best price
      // Track unique vendors per brand to avoid counting duplicates
      const brandPriceMap = new Map<string, { bestPrice: number; vendorName: string; vendorCount: number; includesGst: boolean }>();
      const brandVendorSets = new Map<string, Set<string>>(); // brandId -> Set of vendor IDs

      for (const inv of data || []) {
        if (!inv.brand_id) continue;

        const vendorId = inv.vendor?.id;
        const existing = brandPriceMap.get(inv.brand_id);
        const currentPrice = inv.current_price || 0;

        // Track unique vendors for this brand
        if (!brandVendorSets.has(inv.brand_id)) {
          brandVendorSets.set(inv.brand_id, new Set());
        }
        if (vendorId) {
          brandVendorSets.get(inv.brand_id)!.add(vendorId);
        }

        if (!existing) {
          brandPriceMap.set(inv.brand_id, {
            bestPrice: currentPrice,
            vendorName: inv.vendor?.name || "Unknown",
            vendorCount: 1, // Will be updated below
            includesGst: inv.price_includes_gst || false,
          });
        } else {
          if (currentPrice > 0 && (existing.bestPrice === 0 || currentPrice < existing.bestPrice)) {
            existing.bestPrice = currentPrice;
            existing.vendorName = inv.vendor?.name || "Unknown";
            existing.includesGst = inv.price_includes_gst || false;
          }
        }
      }

      // Update vendor counts to use unique vendor count
      for (const [brandId, vendorSet] of brandVendorSets) {
        const priceInfo = brandPriceMap.get(brandId);
        if (priceInfo) {
          priceInfo.vendorCount = vendorSet.size;
        }
      }

      return brandPriceMap;
    },
    enabled: !!materialId,
  });
}

/**
 * Search vendor inventory across all vendors
 */
export function useVendorInventorySearch(searchTerm: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.vendorInventory.search(searchTerm),
    queryFn: async () => {
      if (!searchTerm || searchTerm.length < 2) return [];

      const { data, error } = await (supabase as any)
        .from("vendor_inventory")
        .select(
          `
          *,
          vendor:vendors(id, name, vendor_type, shop_name),
          material:materials(id, name, code, unit, category_id),
          brand:material_brands(id, brand_name)
        `
        )
        .eq("is_available", true)
        .order("current_price")
        .limit(50);

      if (error) throw error;

      // Filter by material name client-side since we can't use ilike on joins
      const filtered = ((data || []) as any[]).filter(
        (item) =>
          item.material?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.custom_material_name?.toLowerCase().includes(searchTerm.toLowerCase())
      );

      return filtered.map((item) => ({
        ...item,
        total_landed_cost:
          (item.current_price || 0) +
          (item.price_includes_transport ? 0 : item.transport_cost || 0) +
          (item.loading_cost || 0) +
          (item.unloading_cost || 0),
      }));
    },
    enabled: searchTerm.length >= 2,
  });
}

/**
 * Get vendor count for a material
 */
export function useVendorCountForMaterial(materialId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["vendor-count", "material", materialId],
    queryFn: async () => {
      if (!materialId) return 0;

      const { count, error } = await (supabase as any)
        .from("vendor_inventory")
        .select("*", { count: "exact", head: true })
        .eq("material_id", materialId)
        .eq("is_available", true);

      if (error) throw error;
      return count || 0;
    },
    enabled: !!materialId,
  });
}

/**
 * Get material count for a vendor (shop inventory size)
 */
export function useMaterialCountForVendor(vendorId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["material-count", "vendor", vendorId],
    queryFn: async () => {
      if (!vendorId) return 0;

      const { count, error } = await (supabase as any)
        .from("vendor_inventory")
        .select("*", { count: "exact", head: true })
        .eq("vendor_id", vendorId)
        .eq("is_available", true);

      if (error) throw error;
      return count || 0;
    },
    enabled: !!vendorId,
  });
}

/**
 * Add/update vendor inventory item
 */
export function useUpsertVendorInventory() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (data: VendorInventoryFormData) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      // Check if item exists
      // Note: For null comparisons, we must use .is() not .eq() (Supabase/PostgREST requirement)
      let existingQuery = (supabase as any)
        .from("vendor_inventory")
        .select("id")
        .eq("vendor_id", data.vendor_id)
        .eq("material_id", data.material_id);

      // Handle brand_id: use .is() for null, .eq() for actual values
      if (data.brand_id) {
        existingQuery = existingQuery.eq("brand_id", data.brand_id);
      } else {
        existingQuery = existingQuery.is("brand_id", null);
      }

      const { data: existing } = await existingQuery.maybeSingle();

      if (existing) {
        // Update existing
        const { data: result, error } = await (supabase as any)
          .from("vendor_inventory")
          .update({
            ...data,
            last_price_update: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
          .select()
          .single();

        if (error) throw error;
        return result as VendorInventory;
      } else {
        // Insert new
        const { data: result, error } = await (supabase as any)
          .from("vendor_inventory")
          .insert({
            ...data,
            last_price_update: new Date().toISOString(),
          })
          .select()
          .single();

        if (error) throw error;
        return result as VendorInventory;
      }
    },
    onSuccess: (_, variables) => {
      // Invalidate ALL vendor-inventory queries to ensure VendorDrawer updates
      // This is necessary because variants query uses a different key structure
      queryClient.invalidateQueries({
        queryKey: queryKeys.vendorInventory.all,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.vendorInventory.byVendor(variables.vendor_id),
      });
      if (variables.material_id) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.vendorInventory.byMaterial(variables.material_id),
        });
      }
    },
  });
}

/**
 * Update vendor inventory availability
 */
export function useUpdateVendorInventoryAvailability() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      id,
      isAvailable,
    }: {
      id: string;
      isAvailable: boolean;
    }) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      const { error } = await (supabase as any)
        .from("vendor_inventory")
        .update({
          is_available: isAvailable,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.vendorInventory.all,
      });
    },
  });
}

// ============================================
// PRICE HISTORY
// ============================================

/**
 * Fetch price history for a vendor + material combination
 */
export function usePriceHistory(
  vendorId: string | undefined,
  materialId: string | undefined
) {
  const supabase = createClient();

  return useQuery({
    queryKey:
      vendorId && materialId
        ? queryKeys.priceHistory.byVendorMaterial(vendorId, materialId)
        : ["price-history", "vendor-material"],
    queryFn: async () => {
      if (!vendorId || !materialId) return [] as PriceHistoryWithDetails[];

      const { data, error } = await (supabase as any)
        .from("price_history")
        .select(
          `
          *,
          vendor:vendors(id, name, vendor_type),
          material:materials(id, name, code, unit),
          brand:material_brands(id, brand_name)
        `
        )
        .eq("vendor_id", vendorId)
        .eq("material_id", materialId)
        .order("recorded_date", { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data || []) as PriceHistoryWithDetails[];
    },
    enabled: !!vendorId && !!materialId,
  });
}

/**
 * Fetch price history for a material across all vendors
 */
export function useMaterialPriceHistory(materialId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: materialId
      ? queryKeys.priceHistory.byMaterial(materialId)
      : ["price-history", "material"],
    queryFn: async () => {
      if (!materialId) return [] as PriceHistoryWithDetails[];

      const { data, error } = await (supabase as any)
        .from("price_history")
        .select(
          `
          *,
          vendor:vendors(id, name, vendor_type),
          material:materials(id, name, code, unit),
          brand:material_brands(id, brand_name)
        `
        )
        .eq("material_id", materialId)
        .order("recorded_date", { ascending: false })
        .limit(100);

      if (error) throw error;
      return (data || []) as PriceHistoryWithDetails[];
    },
    enabled: !!materialId,
  });
}

/**
 * Fetch price history for a vendor across all materials
 */
export function useVendorPriceHistory(vendorId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: vendorId
      ? queryKeys.priceHistory.byVendor(vendorId)
      : ["price-history", "vendor"],
    queryFn: async () => {
      if (!vendorId) return [] as PriceHistoryWithDetails[];

      const { data, error } = await (supabase as any)
        .from("price_history")
        .select(
          `
          *,
          vendor:vendors(id, name, vendor_type),
          material:materials(id, name, code, unit),
          brand:material_brands(id, brand_name)
        `
        )
        .eq("vendor_id", vendorId)
        .order("recorded_date", { ascending: false })
        .limit(100);

      if (error) throw error;
      return (data || []) as PriceHistoryWithDetails[];
    },
    enabled: !!vendorId,
  });
}

/**
 * Record a new price entry (also updates vendor inventory)
 */
export function useRecordPriceEntry() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (data: PriceEntryFormData & { userId?: string }) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      const totalLandedCost =
        data.price +
        (data.transport_cost || 0) +
        (data.loading_cost || 0) +
        (data.unloading_cost || 0);

      // Insert price history record
      const { data: result, error } = await (supabase as any)
        .from("price_history")
        .insert({
          vendor_id: data.vendor_id,
          material_id: data.material_id,
          brand_id: data.brand_id || null,
          price: data.price,
          price_includes_gst: data.price_includes_gst || false,
          gst_rate: data.gst_rate || null,
          transport_cost: data.transport_cost || null,
          loading_cost: data.loading_cost || null,
          unloading_cost: data.unloading_cost || null,
          total_landed_cost: totalLandedCost,
          recorded_date: new Date().toISOString().split("T")[0],
          source: data.source,
          source_reference: data.source_reference || null,
          quantity: data.quantity || null,
          unit: data.unit || null,
          recorded_by: data.userId || null,
          notes: data.notes || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Also update vendor inventory current price
      // Note: For null comparisons, we must use .is() not .eq() (Supabase/PostgREST requirement)
      let inventoryQuery = (supabase as any)
        .from("vendor_inventory")
        .select("id")
        .eq("vendor_id", data.vendor_id)
        .eq("material_id", data.material_id);

      if (data.brand_id) {
        inventoryQuery = inventoryQuery.eq("brand_id", data.brand_id);
      } else {
        inventoryQuery = inventoryQuery.is("brand_id", null);
      }

      const { data: existingInventory } = await inventoryQuery.maybeSingle();

      if (existingInventory) {
        await (supabase as any)
          .from("vendor_inventory")
          .update({
            current_price: data.price,
            price_includes_gst: data.price_includes_gst || false,
            gst_rate: data.gst_rate || null,
            transport_cost: data.transport_cost || null,
            loading_cost: data.loading_cost || null,
            unloading_cost: data.unloading_cost || null,
            last_price_update: new Date().toISOString(),
            price_source: data.source,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingInventory.id);
      }

      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.priceHistory.byVendorMaterial(
          variables.vendor_id,
          variables.material_id
        ),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.priceHistory.byMaterial(variables.material_id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.priceHistory.byVendor(variables.vendor_id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.vendorInventory.byVendor(variables.vendor_id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.vendorInventory.byMaterial(variables.material_id),
      });
    },
  });
}

/**
 * Get the latest price for a vendor + material
 */
export function useLatestPrice(
  vendorId: string | undefined,
  materialId: string | undefined,
  brandId?: string | null
) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["latest-price", vendorId, materialId, brandId],
    queryFn: async () => {
      if (!vendorId || !materialId) return null;

      let query = (supabase as any)
        .from("price_history")
        .select("*")
        .eq("vendor_id", vendorId)
        .eq("material_id", materialId)
        .order("recorded_date", { ascending: false })
        .limit(1);

      if (brandId) {
        query = query.eq("brand_id", brandId);
      } else {
        // When no brand is specified, look for prices without brand (base material price)
        query = query.is("brand_id", null);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data?.[0] || null) as PriceHistory | null;
    },
    enabled: !!vendorId && !!materialId,
  });
}

/**
 * Get price trend for a material (average price over time)
 */
export function usePriceTrend(
  materialId: string | undefined,
  vendorId?: string | null,
  months: number = 6
) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["price-trend", materialId, vendorId, months],
    queryFn: async () => {
      if (!materialId) return [];

      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - months);

      let query = (supabase as any)
        .from("price_history")
        .select("recorded_date, price, total_landed_cost, vendor_id")
        .eq("material_id", materialId)
        .gte("recorded_date", startDate.toISOString().split("T")[0])
        .order("recorded_date");

      if (vendorId) {
        query = query.eq("vendor_id", vendorId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!materialId,
  });
}

// ============================================
// VENDOR INVENTORY CRUD OPERATIONS
// ============================================

/**
 * Create a new vendor inventory item
 * Use this when adding a material to a vendor's catalog
 */
export function useAddVendorInventory() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (data: VendorInventoryFormData) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      const { data: result, error } = await (supabase as any)
        .from("vendor_inventory")
        .insert({
          ...data,
          price_source: data.price_source || "manual",
          last_price_update: new Date().toISOString(),
          is_available: data.is_available ?? true,
        })
        .select()
        .single();

      if (error) throw error;
      return result as VendorInventory;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.vendorInventory.byVendor(variables.vendor_id),
      });
      if (variables.material_id) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.vendorInventory.byMaterial(variables.material_id),
        });
      }
      queryClient.invalidateQueries({
        queryKey: ["vendorInventory", "counts"],
      });
      queryClient.invalidateQueries({
        queryKey: ["vendorInventory", "materialCounts"],
      });
    },
  });
}

/**
 * Update an existing vendor inventory item by ID
 */
export function useUpdateVendorInventory() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<VendorInventoryFormData>;
    }) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      const { data: result, error } = await (supabase as any)
        .from("vendor_inventory")
        .update({
          ...data,
          last_price_update: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return result as VendorInventory;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.vendorInventory.byVendor(result.vendor_id),
      });
      if (result.material_id) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.vendorInventory.byMaterial(result.material_id),
        });
      }
      queryClient.invalidateQueries({
        queryKey: queryKeys.vendorInventory.all,
      });
    },
  });
}

/**
 * Delete (soft delete) a vendor inventory item
 * Sets is_available to false instead of hard delete
 */
export function useDeleteVendorInventory() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      id,
      vendorId,
      materialId,
    }: {
      id: string;
      vendorId: string;
      materialId?: string;
    }) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      const { error } = await (supabase as any)
        .from("vendor_inventory")
        .update({
          is_available: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;
      return { id, vendorId, materialId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.vendorInventory.byVendor(result.vendorId),
      });
      if (result.materialId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.vendorInventory.byMaterial(result.materialId),
        });
      }
      queryClient.invalidateQueries({
        queryKey: ["vendorInventory", "counts"],
      });
      queryClient.invalidateQueries({
        queryKey: ["vendorInventory", "materialCounts"],
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.vendorInventory.all,
      });
    },
  });
}

// ============================================
// BATCH COUNT QUERIES (for list views)
// ============================================

/**
 * Get material counts for all vendors (batch query for list view)
 * Returns a map of vendorId -> count
 */
export function useVendorMaterialCounts() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["vendorInventory", "counts"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vendor_inventory")
        .select("vendor_id")
        .eq("is_available", true);

      if (error) throw error;

      // Group by vendor_id and count
      const counts: Record<string, number> = {};
      (data || []).forEach((item: { vendor_id: string }) => {
        counts[item.vendor_id] = (counts[item.vendor_id] || 0) + 1;
      });
      return counts;
    },
  });
}

/**
 * Get vendor counts for all materials (batch query for list view)
 * Returns a map of materialId -> unique vendor count
 * Also aggregates variant vendor counts to parent materials
 */
export function useMaterialVendorCounts() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["vendorInventory", "materialCounts"],
    queryFn: async () => {
      // Fetch vendor_id along with material_id to count unique vendors
      const { data: inventoryData, error: invError } = await (supabase as any)
        .from("vendor_inventory")
        .select("material_id, vendor_id")
        .eq("is_available", true)
        .not("material_id", "is", null);

      if (invError) throw invError;

      // Fetch materials with parent_id to aggregate variant counts to parents
      const { data: materialsData, error: matError } = await supabase
        .from("materials")
        .select("id, parent_id")
        .not("parent_id", "is", null);

      if (matError) throw matError;

      // Build parent lookup map: childId -> parentId
      const parentMap = new Map<string, string>();
      for (const mat of materialsData || []) {
        if (mat.parent_id) {
          parentMap.set(mat.id, mat.parent_id);
        }
      }

      // Track unique vendors per material using Sets
      const vendorSets: Record<string, Set<string>> = {};
      // Also track unique vendors for parent materials (aggregated from variants)
      const parentVendorSets: Record<string, Set<string>> = {};

      for (const item of inventoryData || []) {
        if (!item.material_id || !item.vendor_id) continue;

        // Count for the material itself
        if (!vendorSets[item.material_id]) {
          vendorSets[item.material_id] = new Set();
        }
        vendorSets[item.material_id].add(item.vendor_id);

        // Also aggregate to parent if this is a variant
        const parentId = parentMap.get(item.material_id);
        if (parentId) {
          if (!parentVendorSets[parentId]) {
            parentVendorSets[parentId] = new Set();
          }
          parentVendorSets[parentId].add(item.vendor_id);
        }
      }

      // Convert Sets to counts
      const counts: Record<string, number> = {};

      // Add counts for materials with direct vendors
      for (const [materialId, vendorSet] of Object.entries(vendorSets)) {
        counts[materialId] = vendorSet.size;
      }

      // Add/update counts for parent materials (aggregated from variants)
      for (const [parentId, vendorSet] of Object.entries(parentVendorSets)) {
        // Use the aggregated count (parent may also have direct vendors, so take max)
        counts[parentId] = Math.max(counts[parentId] || 0, vendorSet.size);
      }

      return counts;
    },
  });
}

// ============================================
// ORPHAN DETECTION QUERIES
// ============================================

/**
 * Get vendors without any materials assigned
 * Useful for dashboard alerts and data quality checks
 */
export function useOrphanedVendors() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["vendors", "orphaned"],
    queryFn: async () => {
      // Get all active vendors
      const { data: vendors, error: vendorError } = await supabase
        .from("vendors")
        .select("id, name, code, vendor_type")
        .eq("is_active", true);

      if (vendorError) throw vendorError;

      // Get vendors with active inventory
      const { data: inventory, error: invError } = await (supabase as any)
        .from("vendor_inventory")
        .select("vendor_id")
        .eq("is_available", true);

      if (invError) throw invError;

      const vendorsWithMaterials = new Set(
        (inventory || []).map((i: { vendor_id: string }) => i.vendor_id)
      );
      return (vendors || []).filter((v) => !vendorsWithMaterials.has(v.id));
    },
  });
}

/**
 * Get materials without any vendor pricing
 * Useful for dashboard alerts and data quality checks
 */
export function useMaterialsWithoutVendors() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["materials", "noVendors"],
    queryFn: async () => {
      // Get all active materials
      const { data: materials, error: matError } = await supabase
        .from("materials")
        .select("id, name, code, unit")
        .eq("is_active", true);

      if (matError) throw matError;

      // Get materials with vendor inventory
      const { data: inventory, error: invError } = await (supabase as any)
        .from("vendor_inventory")
        .select("material_id")
        .eq("is_available", true)
        .not("material_id", "is", null);

      if (invError) throw invError;

      const materialsWithVendors = new Set(
        (inventory || []).map((i: { material_id: string | null }) => i.material_id)
      );
      return (materials || []).filter((m) => !materialsWithVendors.has(m.id));
    },
  });
}

/**
 * Get vendor inventory price for a specific vendor + material combination
 * Used for auto-filling prices in PO creation
 */
export function useVendorMaterialPrice(
  vendorId: string | undefined,
  materialId: string | undefined,
  brandId?: string | null
) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["vendor-material-price", vendorId, materialId, brandId],
    queryFn: async () => {
      if (!vendorId || !materialId) return null;

      const priceFields = `
          id,
          current_price,
          pricing_mode,
          price_includes_gst,
          gst_rate,
          price_includes_transport,
          transport_cost,
          loading_cost,
          unloading_cost,
          min_order_qty,
          unit,
          updated_at
        `;

      // Helper to build and execute price query for a given material_id
      const fetchPrice = async (matId: string) => {
        let query = (supabase as any)
          .from("vendor_inventory")
          .select(priceFields)
          .eq("vendor_id", vendorId)
          .eq("material_id", matId)
          .eq("is_available", true)
          .limit(1);

        if (brandId) {
          query = query.eq("brand_id", brandId);
        } else {
          query = query.is("brand_id", null);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data && data.length > 0 ? data[0] : null;
      };

      // Try exact material first
      let item = await fetchPrice(materialId);

      // If no price found, check parent material (vendor may have price at parent level)
      if (!item) {
        const { data: mat } = await supabase
          .from("materials")
          .select("parent_id")
          .eq("id", materialId)
          .single();

        if (mat?.parent_id) {
          item = await fetchPrice(mat.parent_id);
        }
      }

      if (!item) return null;

      return {
        price: item.current_price,
        pricing_mode: item.pricing_mode || 'per_piece',
        price_includes_gst: item.price_includes_gst,
        gst_rate: item.gst_rate,
        transport_cost: item.price_includes_transport ? 0 : item.transport_cost,
        loading_cost: item.loading_cost,
        unloading_cost: item.unloading_cost,
        total_landed_cost:
          (item.current_price || 0) +
          (item.price_includes_transport ? 0 : item.transport_cost || 0) +
          (item.loading_cost || 0) +
          (item.unloading_cost || 0),
        recorded_date: item.updated_at,
      };
    },
    enabled: !!vendorId && !!materialId,
  });
}

/**
 * Get brands that a specific vendor supplies for a specific material
 * Used for filtering brand dropdown in PO creation
 */
export function useVendorMaterialBrands(
  vendorId: string | undefined,
  materialId: string | undefined
) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["vendor-material-brands", vendorId, materialId],
    queryFn: async () => {
      if (!vendorId || !materialId) return [];

      try {
        const brandSelect = `
            brand_id,
            brand:material_brands(id, material_id, brand_name, variant_name, is_preferred, quality_rating, notes, image_url, is_active, created_at)
          `;

        // Helper to fetch brands for a given material_id
        const fetchBrands = async (matId: string) => {
          const { data, error } = await (supabase as any)
            .from("vendor_inventory")
            .select(brandSelect)
            .eq("vendor_id", vendorId)
            .eq("material_id", matId)
            .eq("is_available", true);

          if (error) {
            console.error("[useVendorMaterialBrands] Query error:", error);
            return [];
          }
          return data || [];
        };

        // Fetch brands for exact material
        let data = await fetchBrands(materialId);

        // If no brands found, also check parent material
        if (data.length === 0) {
          const { data: mat } = await supabase
            .from("materials")
            .select("parent_id")
            .eq("id", materialId)
            .single();

          if (mat?.parent_id) {
            data = await fetchBrands(mat.parent_id);
          }
        }

        // Extract unique brands with their full details (matching MaterialBrand type)
        const brandMap = new Map<string, {
          id: string;
          material_id: string;
          brand_name: string;
          variant_name: string | null;
          is_preferred: boolean;
          quality_rating: number | null;
          notes: string | null;
          image_url: string | null;
          is_active: boolean;
          created_at: string;
        }>();

        for (const item of data || []) {
          if (item.brand && item.brand.is_active) {
            // Use brand_id as key to avoid duplicates
            if (!brandMap.has(item.brand.id)) {
              brandMap.set(item.brand.id, item.brand);
            }
          }
        }

        return Array.from(brandMap.values());
      } catch (err) {
        console.error("[useVendorMaterialBrands] Unexpected error:", err);
        return []; // Return empty array on error
      }
    },
    enabled: !!vendorId && !!materialId,
    retry: false, // Don't retry on failure - prevents stuck loading state
    staleTime: 30000, // Cache for 30 seconds to prevent unnecessary refetches
  });
}

/**
 * Get a single vendor inventory item by ID
 */
export function useVendorInventoryItem(id: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["vendorInventory", "item", id],
    queryFn: async () => {
      if (!id) return null;

      const { data, error } = await (supabase as any)
        .from("vendor_inventory")
        .select(
          `
          *,
          vendor:vendors(id, name, vendor_type, shop_name),
          material:materials(id, name, code, unit, category_id),
          brand:material_brands(id, brand_name)
        `
        )
        .eq("id", id)
        .single();

      if (error) throw error;

      return {
        ...data,
        total_landed_cost:
          (data.current_price || 0) +
          (data.price_includes_transport ? 0 : data.transport_cost || 0) +
          (data.loading_cost || 0) +
          (data.unloading_cost || 0),
      } as VendorInventoryWithDetails;
    },
    enabled: !!id,
  });
}
