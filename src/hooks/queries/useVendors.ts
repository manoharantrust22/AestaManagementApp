"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient, ensureFreshSession } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/cache/keys";
import type {
  Vendor,
  VendorWithCategories,
  VendorFormData,
  MaterialCategory,
  VendorType,
} from "@/types/material.types";

// ============================================
// VENDORS
// ============================================

/**
 * Fetch all vendors with optional category filter
 */
export function useVendors(categoryId?: string | null) {
  const supabase = createClient();

  return useQuery({
    queryKey: categoryId
      ? [...queryKeys.vendors.list(), categoryId]
      : queryKeys.vendors.list(),
    queryFn: async () => {
      let query = supabase
        .from("vendors")
        .select(
          `
          *,
          vendor_material_categories(
            category_id,
            is_primary,
            category:material_categories(id, name, code)
          )
        `
        )
        .eq("is_active", true)
        .order("name");

      const { data, error } = await query;
      if (error) throw error;

      // Transform to include categories array
      const vendors = data.map((v: any) => ({
        ...v,
        categories:
          v.vendor_material_categories?.map((vc: any) => vc.category) || [],
      })) as VendorWithCategories[];

      // Filter by category if specified
      if (categoryId) {
        return vendors.filter((v) =>
          v.categories?.some((c) => c?.id === categoryId)
        );
      }

      return vendors;
    },
  });
}

/**
 * Pagination parameters for server-side pagination
 */
export interface PaginationParams {
  pageIndex: number;
  pageSize: number;
}

/**
 * Paginated result with total count
 */
export interface PaginatedResult<T> {
  data: T[];
  totalCount: number;
  pageCount: number;
}

/**
 * Fetch vendors with server-side pagination
 * Use this for large datasets where client-side pagination is not efficient
 */
export function usePaginatedVendors(
  pagination: PaginationParams,
  categoryId?: string | null,
  searchTerm?: string,
  vendorType?: VendorType,
  categoryNames?: string[] // Filter by category name patterns (case-insensitive partial match)
) {
  const supabase = createClient();
  const { pageIndex, pageSize } = pagination;
  const offset = pageIndex * pageSize;

  return useQuery({
    queryKey: ["vendors", "paginated", { pageIndex, pageSize, categoryId, searchTerm, vendorType, categoryNames }],
    queryFn: async (): Promise<PaginatedResult<VendorWithCategories>> => {
      // First, get total count (without category filter for now since it's in-memory)
      let countQuery = supabase
        .from("vendors")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true);

      if (vendorType) {
        countQuery = countQuery.eq("vendor_type", vendorType);
      }

      if (searchTerm && searchTerm.length >= 2) {
        countQuery = countQuery.or(
          `name.ilike.%${searchTerm}%,code.ilike.%${searchTerm}%,city.ilike.%${searchTerm}%`
        );
      }

      // For category filtering, we need to fetch more and filter in memory
      // This is a trade-off for simplicity
      const needsCategoryFilter = categoryId || (categoryNames && categoryNames.length > 0);

      const { count: rawTotalCount, error: countError } = await countQuery;
      if (countError) throw countError;

      // Then, get paginated data (fetch more if we need to filter by category)
      let dataQuery = supabase
        .from("vendors")
        .select(
          `
          *,
          vendor_material_categories(
            category_id,
            is_primary,
            category:material_categories(id, name, code)
          )
        `
        )
        .eq("is_active", true)
        .order("name");

      // If we need category filtering, fetch all and paginate in memory
      if (!needsCategoryFilter) {
        dataQuery = dataQuery.range(offset, offset + pageSize - 1);
      }

      if (vendorType) {
        dataQuery = dataQuery.eq("vendor_type", vendorType);
      }

      if (searchTerm && searchTerm.length >= 2) {
        dataQuery = dataQuery.or(
          `name.ilike.%${searchTerm}%,code.ilike.%${searchTerm}%,city.ilike.%${searchTerm}%`
        );
      }

      const { data, error: dataError } = await dataQuery;
      if (dataError) throw dataError;

      // Transform to include categories array
      let vendors = data.map((v: any) => ({
        ...v,
        categories:
          v.vendor_material_categories?.map((vc: any) => vc.category) || [],
      })) as VendorWithCategories[];

      // Filter by category ID if specified
      if (categoryId) {
        vendors = vendors.filter((v) =>
          v.categories?.some((c) => c?.id === categoryId)
        );
      }

      // Filter by category names if specified (partial match, case-insensitive)
      if (categoryNames && categoryNames.length > 0) {
        vendors = vendors.filter((v) =>
          v.categories?.some((c) =>
            categoryNames.some((name) =>
              c?.name?.toLowerCase().includes(name.toLowerCase())
            )
          )
        );
      }

      // Get actual total count after category filtering
      const totalCount = needsCategoryFilter ? vendors.length : (rawTotalCount || 0);

      // Paginate in memory if we filtered by category
      if (needsCategoryFilter) {
        vendors = vendors.slice(offset, offset + pageSize);
      }

      return {
        data: vendors,
        totalCount,
        pageCount: Math.ceil(totalCount / pageSize),
      };
    },
    placeholderData: (previousData) => previousData, // Keep previous data while loading
  });
}

/**
 * Fetch a single vendor by ID
 */
export function useVendor(id: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: id
      ? queryKeys.vendors.byId(id)
      : [...queryKeys.vendors.all, "detail"],
    queryFn: async () => {
      if (!id) return null;

      const { data, error } = await supabase
        .from("vendors")
        .select(
          `
          *,
          vendor_material_categories(
            category_id,
            is_primary,
            category:material_categories(id, name, code)
          )
        `
        )
        .eq("id", id)
        .single();

      if (error) throw error;

      return {
        ...data,
        categories:
          data.vendor_material_categories?.map((vc: any) => vc.category) || [],
      } as unknown as VendorWithCategories;
    },
    enabled: !!id,
  });
}

/**
 * Vendor with material supply info for conversion dialog
 */
export interface VendorForMaterials extends Vendor {
  suppliedMaterialCount: number;
  suppliedMaterials: string[];
  isPreferred: boolean;
  purchaseCount: number;
}

/**
 * Fetch vendors that supply specific materials
 * Used in Convert to PO dialog to show only relevant vendors
 * Prioritized by: number of materials supplied > is_preferred > purchase frequency
 */
export function useVendorsForMaterials(materialIds: string[] | undefined, siteId?: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["vendors", "for-materials", materialIds, siteId],
    queryFn: async (): Promise<VendorForMaterials[]> => {
      if (!materialIds || materialIds.length === 0) {
        return [];
      }

      // ================================================================
      // Expand material IDs to include parent-child relationships
      // This ensures vendors mapped at parent level show up for child
      // material request items (and vice versa)
      // ================================================================
      const { data: requestMaterials, error: matError } = await supabase
        .from("materials")
        .select("id, parent_id")
        .in("id", materialIds);

      if (matError) throw matError;

      const expandedMaterialIds = new Set(materialIds);
      // Build coverage map: expanded material_id -> set of original request material_ids it covers
      const materialCoverageMap = new Map<string, Set<string>>();

      // Each original material covers itself
      for (const id of materialIds) {
        if (!materialCoverageMap.has(id)) materialCoverageMap.set(id, new Set());
        materialCoverageMap.get(id)!.add(id);
      }

      // If a request material has a parent, include parent in lookup
      // (vendor mapped to parent can supply the child)
      for (const mat of (requestMaterials || [])) {
        if (mat.parent_id) {
          expandedMaterialIds.add(mat.parent_id);
          if (!materialCoverageMap.has(mat.parent_id)) materialCoverageMap.set(mat.parent_id, new Set());
          materialCoverageMap.get(mat.parent_id)!.add(mat.id);
        }
      }

      // If a request material is a parent, include its children in lookup
      // (vendor mapped to a child/variant can supply the parent category)
      const { data: childMaterials, error: childError } = await supabase
        .from("materials")
        .select("id, parent_id")
        .in("parent_id", materialIds)
        .eq("is_active", true);

      if (!childError && childMaterials) {
        for (const child of childMaterials) {
          expandedMaterialIds.add(child.id);
          if (!materialCoverageMap.has(child.id)) materialCoverageMap.set(child.id, new Set());
          if (child.parent_id) {
            materialCoverageMap.get(child.id)!.add(child.parent_id);
          }
        }
      }

      const allMaterialIds = Array.from(expandedMaterialIds);

      // Get vendors that supply the requested materials from material_vendors table
      const { data: materialVendors, error: mvError } = await supabase
        .from("material_vendors")
        .select(`
          vendor_id,
          material_id,
          is_preferred,
          vendor:vendors!inner(
            id, name, code, contact_person, phone, alternate_phone,
            whatsapp_number, email, address, city, state, gst_number,
            vendor_type, is_active
          )
        `)
        .in("material_id", allMaterialIds)
        .eq("is_active", true);

      if (mvError) throw mvError;

      // Also check vendor_inventory table for additional vendor-material links
      const { data: vendorInventory, error: viError } = await supabase
        .from("vendor_inventory")
        .select(`
          vendor_id,
          material_id,
          vendor:vendors!inner(
            id, name, code, contact_person, phone, alternate_phone,
            whatsapp_number, email, address, city, state, gst_number,
            vendor_type, is_active
          )
        `)
        .in("material_id", allMaterialIds)
        .eq("is_available", true);

      if (viError) throw viError;

      // Combine and deduplicate vendors, tracking which original request materials each supplies
      const vendorMap = new Map<string, {
        vendor: any;
        suppliedMaterials: Set<string>;
        isPreferred: boolean;
      }>();

      // Helper: map a vendor's material_id to original request material IDs
      const addSuppliedMaterials = (entry: { suppliedMaterials: Set<string> }, vendorMaterialId: string) => {
        const coveredIds = materialCoverageMap.get(vendorMaterialId);
        if (coveredIds) {
          for (const reqMatId of coveredIds) {
            entry.suppliedMaterials.add(reqMatId);
          }
        }
        // Also add direct match if it's an original request material
        if (materialIds.includes(vendorMaterialId)) {
          entry.suppliedMaterials.add(vendorMaterialId);
        }
      };

      // Process material_vendors (filter out inactive vendors)
      for (const mv of (materialVendors || [])) {
        const vendor = mv.vendor as any;
        if (!vendor?.is_active) continue; // Skip inactive vendors

        const vendorId = mv.vendor_id;
        if (!vendorMap.has(vendorId)) {
          vendorMap.set(vendorId, {
            vendor: vendor,
            suppliedMaterials: new Set(),
            isPreferred: false,
          });
        }
        const entry = vendorMap.get(vendorId)!;
        addSuppliedMaterials(entry, mv.material_id);
        if (mv.is_preferred) {
          entry.isPreferred = true;
        }
      }

      // Process vendor_inventory (filter out inactive vendors)
      for (const vi of (vendorInventory || [])) {
        const vendor = vi.vendor as any;
        if (!vendor?.is_active) continue; // Skip inactive vendors

        const vendorId = vi.vendor_id;
        if (!vendorMap.has(vendorId)) {
          vendorMap.set(vendorId, {
            vendor: vendor,
            suppliedMaterials: new Set(),
            isPreferred: false,
          });
        }
        const entry = vendorMap.get(vendorId)!;
        if (vi.material_id) {
          addSuppliedMaterials(entry, vi.material_id);
        }
      }

      // Get all vendor IDs for purchase count query
      const vendorIds = Array.from(vendorMap.keys());

      if (vendorIds.length === 0) {
        return [];
      }

      // Get purchase order counts for these vendors (to prioritize frequently used)
      let purchaseCountQuery = supabase
        .from("purchase_orders")
        .select("vendor_id")
        .in("vendor_id", vendorIds);

      // Optionally filter by site for more relevant results
      if (siteId) {
        purchaseCountQuery = purchaseCountQuery.eq("site_id", siteId);
      }

      const { data: purchaseOrders, error: poError } = await purchaseCountQuery;

      if (poError) {
        console.warn("Error fetching purchase counts:", poError);
      }

      // Count purchases per vendor
      const purchaseCounts = new Map<string, number>();
      for (const po of (purchaseOrders || [])) {
        const count = purchaseCounts.get(po.vendor_id) || 0;
        purchaseCounts.set(po.vendor_id, count + 1);
      }

      // Build final vendor list
      const vendors: VendorForMaterials[] = [];
      for (const [vendorId, entry] of vendorMap) {
        vendors.push({
          ...entry.vendor,
          suppliedMaterialCount: entry.suppliedMaterials.size,
          suppliedMaterials: Array.from(entry.suppliedMaterials),
          isPreferred: entry.isPreferred,
          purchaseCount: purchaseCounts.get(vendorId) || 0,
        });
      }

      // Sort vendors:
      // 1. By number of materials they supply (descending) - vendors supplying more materials first
      // 2. By preferred status (preferred vendors first)
      // 3. By purchase count (descending) - frequently used vendors first
      // 4. By name (alphabetical)
      vendors.sort((a, b) => {
        // More materials supplied = higher priority
        if (b.suppliedMaterialCount !== a.suppliedMaterialCount) {
          return b.suppliedMaterialCount - a.suppliedMaterialCount;
        }
        // Preferred vendors first
        if (a.isPreferred !== b.isPreferred) {
          return a.isPreferred ? -1 : 1;
        }
        // More purchases = higher priority
        if (b.purchaseCount !== a.purchaseCount) {
          return b.purchaseCount - a.purchaseCount;
        }
        // Alphabetical by name
        return a.name.localeCompare(b.name);
      });

      return vendors;
    },
    enabled: !!materialIds && materialIds.length > 0,
  });
}

/**
 * Search vendors by name
 */
export function useVendorSearch(searchTerm: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["vendorSearch", searchTerm],
    queryFn: async () => {
      if (!searchTerm || searchTerm.length < 2) return [];

      const { data, error } = await supabase
        .from("vendors")
        .select("id, name, code, phone, city")
        .eq("is_active", true)
        .or(`name.ilike.%${searchTerm}%,code.ilike.%${searchTerm}%`)
        .limit(20);

      if (error) throw error;
      return data;
    },
    enabled: searchTerm.length >= 2,
  });
}

/**
 * Generate a vendor code based on vendor type
 * Format: Type prefix + 4-digit sequence
 * Example: SHP-0001 for Shop, DLR-0001 for Dealer
 */
async function generateVendorCode(
  supabase: ReturnType<typeof createClient>,
  vendorType?: string
): Promise<string> {
  // Get prefix based on vendor type
  const prefixMap: Record<string, string> = {
    shop: "SHP",
    dealer: "DLR",
    manufacturer: "MFR",
    individual: "IND",
  };
  const prefix = prefixMap[vendorType || ""] || "VEN";

  // Get count of vendors with same prefix
  const { count } = await supabase
    .from("vendors")
    .select("*", { count: "exact", head: true })
    .ilike("code", `${prefix}-%`);

  const sequence = ((count || 0) + 1).toString().padStart(4, "0");
  return `${prefix}-${sequence}`;
}

/**
 * Create a new vendor
 */
export function useCreateVendor() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (data: VendorFormData) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      const { category_ids, ...vendorData } = data;

      // Auto-generate code if not provided
      let code = vendorData.code?.trim() || null;
      if (!code) {
        code = await generateVendorCode(supabase, vendorData.vendor_type);
      }

      // Create vendor with auto-generated code
      const { data: vendor, error } = await supabase
        .from("vendors")
        .insert({ ...vendorData, code })
        .select()
        .single();

      if (error) throw error;

      // Add category associations
      if (category_ids && category_ids.length > 0) {
        const categoryAssociations = category_ids.map((catId, index) => ({
          vendor_id: vendor.id,
          category_id: catId,
          is_primary: index === 0, // First one is primary
        }));

        const { error: catError } = await supabase
          .from("vendor_material_categories")
          .insert(categoryAssociations);

        if (catError) console.error("Failed to add categories:", catError);
      }

      return vendor as Vendor;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vendors.list() });
    },
  });
}

/**
 * Update an existing vendor
 */
export function useUpdateVendor() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<VendorFormData>;
    }) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      const { category_ids, ...vendorData } = data;

      // Update vendor
      const { data: vendor, error } = await supabase
        .from("vendors")
        .update({ ...vendorData, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      // Update category associations if provided
      if (category_ids !== undefined) {
        // Delete existing
        await supabase
          .from("vendor_material_categories")
          .delete()
          .eq("vendor_id", id);

        // Add new
        if (category_ids.length > 0) {
          const categoryAssociations = category_ids.map((catId, index) => ({
            vendor_id: id,
            category_id: catId,
            is_primary: index === 0,
          }));

          await supabase
            .from("vendor_material_categories")
            .insert(categoryAssociations);
        }
      }

      return vendor as Vendor;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vendors.list() });
      queryClient.invalidateQueries({
        queryKey: queryKeys.vendors.byId(variables.id),
      });
    },
  });
}

/**
 * Delete (soft delete) a vendor
 */
export function useDeleteVendor() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      const { error } = await supabase
        .from("vendors")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vendors.list() });
    },
  });
}
