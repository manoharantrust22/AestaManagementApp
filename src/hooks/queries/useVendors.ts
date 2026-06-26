"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient, ensureFreshSession } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/cache/keys";
import { wrapQueryFn } from "@/lib/utils/timeout";
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
 * Standalone fetch — usable outside React hooks (e.g. queryClient.prefetchQuery / fetchQuery).
 * Returns the full vendor list with categories, keyed by queryKeys.vendors.list().
 */
export async function fetchVendorCatalog(): Promise<VendorWithCategories[]> {
  const supabase = createClient();
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
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return (data ?? []).map((v: any) => ({
    ...v,
    categories: v.vendor_material_categories?.map((vc: any) => vc.category) || [],
  })) as VendorWithCategories[];
}

/**
 * Options for useVendors.
 * Use `includeDrafts: true` on office/admin surfaces that need to see
 * draft (`is_draft=true`) vendors (e.g. /company/vendors, the spot
 * purchase form which lets supervisors re-pick their own quick-adds).
 * All other pickers keep the default `false` so drafts stay hidden.
 */
export interface UseVendorsOptions {
  categoryId?: string | null;
  includeDrafts?: boolean;
}

/**
 * Fetch all vendors with optional category filter.
 *
 * Accepts either a legacy `categoryId` string for back-compat, or an
 * options object `{ categoryId?, includeDrafts? }`.
 */
export function useVendors(
  options?: string | null | UseVendorsOptions,
) {
  const normalized: UseVendorsOptions =
    typeof options === "string" || options === null || options === undefined
      ? { categoryId: options ?? null }
      : options;
  const { categoryId = null, includeDrafts = false } = normalized;

  return useQuery({
    queryKey: [
      ...queryKeys.vendors.list(),
      ...(categoryId ? [categoryId] : []),
      includeDrafts ? "withDrafts" : "noDrafts",
    ],
    queryFn: wrapQueryFn(async () => {
      const vendors = await fetchVendorCatalog();
      const afterDrafts = includeDrafts
        ? vendors
        : vendors.filter((v) => v.is_draft !== true);
      if (categoryId) {
        return afterDrafts.filter((v) =>
          v.categories?.some((c) => c?.id === categoryId)
        );
      }
      return afterDrafts;
    }, { operationName: "useVendors" }),
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
    queryFn: wrapQueryFn<PaginatedResult<VendorWithCategories>>(async () => {
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
    }, { operationName: "usePaginatedVendors" }),
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

  // Take the highest existing numeric suffix and add 1. Using MAX (not COUNT)
  // is gap-proof: deleted or non-contiguous codes (e.g. SHP-0005/0006 missing)
  // would make COUNT collide with an existing code and fail the unique
  // constraint on every insert. Non-numeric codes are ignored defensively.
  const { data } = await supabase
    .from("vendors")
    .select("code")
    .ilike("code", `${prefix}-%`);

  const maxSeq = (data ?? []).reduce((max, row) => {
    const n = parseInt(String(row.code ?? "").replace(`${prefix}-`, ""), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);

  const sequence = (maxSeq + 1).toString().padStart(4, "0");
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

      // Auto-generate code if not provided. Retry on a unique-violation so a
      // concurrent insert (two users at once landing on the same next code)
      // self-heals by regenerating. A code the user typed themselves is never
      // silently changed — that collision is surfaced so they can fix it.
      let code = vendorData.code?.trim() || null;
      const userProvidedCode = !!code;
      let vendor: Vendor | undefined;

      for (let attempt = 0; attempt < 5; attempt++) {
        if (!code) {
          code = await generateVendorCode(supabase, vendorData.vendor_type);
        }
        const { data: inserted, error } = await supabase
          .from("vendors")
          .insert({ ...vendorData, code })
          .select()
          .single();

        if (!error) {
          vendor = inserted as Vendor;
          break;
        }
        if (error.code === "23505" && !userProvidedCode) {
          code = null; // regenerate and retry
          continue;
        }
        throw error;
      }

      if (!vendor) {
        throw new Error(
          "Couldn't generate a unique vendor code — please set one manually under Customize."
        );
      }

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
