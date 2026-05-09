"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient, ensureFreshSession } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/cache/keys";
import { wrapQueryFn } from "@/lib/utils/timeout";

// ============================================
// TYPES
// ============================================

export interface CompanyTeaShop {
  id: string;
  name: string;
  owner_name: string | null;
  contact_phone: string | null;
  address: string | null;
  upi_id: string | null;
  qr_code_url: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface TeaShopSiteAssignment {
  id: string;
  tea_shop_id: string;
  site_id: string | null;
  site_group_id: string | null;
  is_active: boolean;
  assigned_at: string;
  assigned_by: string | null;
  // Joined data
  site?: { id: string; name: string } | null;
  site_group?: { id: string; name: string } | null;
}

export interface CompanyTeaShopWithAssignments extends CompanyTeaShop {
  assignments: TeaShopSiteAssignment[];
}

export interface TeaShopEntryAllocation {
  id: string;
  entry_id: string;
  site_id: string;
  day_units_sum: number;
  worker_count: number;
  allocation_percentage: number;
  allocated_amount: number;
  is_manual_override: boolean;
  created_at: string;
  // Joined data
  site?: { id: string; name: string } | null;
}

export interface SiteDayUnitsData {
  siteId: string;
  siteName: string;
  namedLaborerUnits: number;
  marketLaborerUnits: number;
  totalUnits: number;
  workerCount: number;
  percentage: number;
  allocatedAmount: number;
}

export interface CompanyTeaShopFormData {
  name: string;
  owner_name?: string | null;
  contact_phone?: string | null;
  address?: string | null;
  upi_id?: string | null;
  qr_code_url?: string | null;
  notes?: string | null;
  is_active?: boolean;
}

// ============================================
// COMPANY TEA SHOPS QUERIES
// ============================================

/**
 * Fetch all company tea shops
 */
export function useCompanyTeaShops() {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.companyTeaShops.list(),
    queryFn: wrapQueryFn(async () => {
      const { data, error } = await (supabase as any)
        .from("tea_shops")
        .select("*, tea_shop_site_assignments(id, site_id, site_group_id, is_active, assigned_at, site:sites(id, name), site_group:site_groups(id, name))")
        .eq("is_active", true)
        .order("name");

      if (error) {
        console.warn("Error fetching company tea shops:", error.message);
        return [];
      }

      return (data || []).map((shop: any) => ({
        ...shop,
        assignments: shop.tea_shop_site_assignments || [],
      })) as CompanyTeaShopWithAssignments[];
    }, { operationName: "useCompanyTeaShops" }),
  });
}

/**
 * Fetch a single company tea shop by ID
 */
export function useCompanyTeaShop(id: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: id ? queryKeys.companyTeaShops.byId(id) : ["company-tea-shops", "none"],
    queryFn: async () => {
      if (!id) return null;

      const { data, error } = await (supabase as any)
        .from("tea_shops")
        .select("*, tea_shop_site_assignments(id, site_id, site_group_id, is_active, assigned_at, site:sites(id, name), site_group:site_groups(id, name))")
        .eq("id", id)
        .maybeSingle();

      if (error) {
        console.warn("Error fetching company tea shop:", error.message);
        return null;
      }

      if (!data) return null;

      return {
        ...data,
        assignments: data.tea_shop_site_assignments || [],
      } as CompanyTeaShopWithAssignments;
    },
    enabled: !!id,
  });
}

/**
 * Get tea shop assigned to a specific site (or its group)
 */
export function useTeaShopForSite(siteId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: siteId ? queryKeys.companyTeaShops.forSite(siteId) : ["company-tea-shops", "for-site", "none"],
    queryFn: async () => {
      if (!siteId) return null;

      // First check direct site assignment
      const { data: directAssignment, error: directError } = await (supabase as any)
        .from("tea_shop_site_assignments")
        .select("tea_shop_id, tea_shop:tea_shops(*)")
        .eq("site_id", siteId)
        .eq("is_active", true)
        .maybeSingle();

      if (directError) {
        console.warn("Error fetching direct tea shop assignment:", directError.message);
      }

      if (directAssignment?.tea_shop) {
        return directAssignment.tea_shop as CompanyTeaShop;
      }

      // Check if site is in a group with assigned tea shop
      const { data: site, error: siteError } = await (supabase as any)
        .from("sites")
        .select("site_group_id")
        .eq("id", siteId)
        .maybeSingle();

      if (siteError) {
        console.warn("Error fetching site:", siteError.message);
      }

      if (site?.site_group_id) {
        const { data: groupAssignment, error: groupError } = await (supabase as any)
          .from("tea_shop_site_assignments")
          .select("tea_shop_id, tea_shop:tea_shops(*)")
          .eq("site_group_id", site.site_group_id)
          .eq("is_active", true)
          .maybeSingle();

        if (groupError) {
          console.warn("Error fetching group tea shop assignment:", groupError.message);
        }

        if (groupAssignment?.tea_shop) {
          return groupAssignment.tea_shop as CompanyTeaShop;
        }
      }

      return null;
    },
    enabled: !!siteId,
  });
}

/**
 * Get tea shop assigned to a site group
 */
export function useTeaShopForGroup(groupId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: groupId ? queryKeys.companyTeaShops.forGroup(groupId) : ["company-tea-shops", "for-group", "none"],
    queryFn: async () => {
      if (!groupId) return null;

      const { data, error } = await (supabase as any)
        .from("tea_shop_site_assignments")
        .select("tea_shop_id, tea_shop:tea_shops(*)")
        .eq("site_group_id", groupId)
        .eq("is_active", true)
        .maybeSingle();

      if (error) {
        console.warn("Error fetching group tea shop:", error.message);
      }

      return data?.tea_shop as CompanyTeaShop | null;
    },
    enabled: !!groupId,
  });
}

/**
 * Get assignments for a tea shop
 */
export function useTeaShopAssignments(teaShopId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: teaShopId ? queryKeys.companyTeaShops.assignments(teaShopId) : ["company-tea-shops", "assignments", "none"],
    queryFn: async () => {
      if (!teaShopId) return [];

      const { data, error } = await (supabase as any)
        .from("tea_shop_site_assignments")
        .select("*, site:sites(id, name), site_group:site_groups(id, name)")
        .eq("tea_shop_id", teaShopId)
        .eq("is_active", true)
        .order("assigned_at", { ascending: false });

      if (error) {
        console.warn("Error fetching tea shop assignments:", error.message);
        return [];
      }
      return (data || []) as TeaShopSiteAssignment[];
    },
    enabled: !!teaShopId,
  });
}

// ============================================
// DAY UNITS CALCULATION
// ============================================

/**
 * Calculate day units for all sites in a group for a specific date
 * Used for automatic allocation of T&S costs
 */
export function useDayUnitsForDate(
  siteGroupId: string | undefined,
  date: string | undefined,
  totalAmount?: number,
  fallbackSites?: { id: string; name: string }[] // Fallback sites if query fails
) {
  const supabase = createClient();

  return useQuery({
    queryKey: siteGroupId && date
      ? queryKeys.companyTeaShops.dayUnits(siteGroupId, date)
      : ["company-tea-shops", "day-units", "none"],
    queryFn: async (): Promise<SiteDayUnitsData[]> => {
      if (!siteGroupId || !date) return [];

      // Get all sites in the group
      let sites: { id: string; name: string }[] = [];

      try {
        const { data: sitesData, error: sitesError } = await (supabase as any)
          .from("sites")
          .select("id, name")
          .eq("site_group_id", siteGroupId)
          .eq("status", "active");

        if (sitesError) {
          console.warn("Failed to fetch sites for group, using fallback:", sitesError.message);
          // Use fallback sites if provided
          if (fallbackSites && fallbackSites.length > 0) {
            sites = fallbackSites;
          } else {
            return [];
          }
        } else {
          sites = sitesData || [];
        }
      } catch (err: any) {
        console.warn("Error fetching sites:", err.message);
        if (fallbackSites && fallbackSites.length > 0) {
          sites = fallbackSites;
        } else {
          return [];
        }
      }

      if (sites.length === 0) return [];

      const results: SiteDayUnitsData[] = [];

      // For each site, get attendance data
      for (const site of sites) {
        // Get named laborers' day units
        const { data: namedAttendance } = await (supabase as any)
          .from("daily_attendance")
          .select("day_units")
          .eq("site_id", site.id)
          .eq("date", date)
          .eq("is_deleted", false);

        const namedUnits = namedAttendance?.reduce((sum: number, a: any) => sum + (a.day_units || 1), 0) || 0;
        const namedCount = namedAttendance?.length || 0;

        // Get market laborers (each counts as 1 unit)
        const { data: marketAttendance } = await (supabase as any)
          .from("market_laborer_attendance")
          .select("count")
          .eq("site_id", site.id)
          .eq("date", date);

        const marketUnits = marketAttendance?.reduce((sum: number, m: any) => sum + (m.count || 0), 0) || 0;

        results.push({
          siteId: site.id,
          siteName: site.name,
          namedLaborerUnits: namedUnits,
          marketLaborerUnits: marketUnits,
          totalUnits: namedUnits + marketUnits,
          workerCount: namedCount + marketUnits,
          percentage: 0, // Will be calculated below
          allocatedAmount: 0, // Will be calculated below
        });
      }

      // Calculate percentages and allocated amounts
      const totalUnits = results.reduce((sum, r) => sum + r.totalUnits, 0);

      if (totalUnits > 0) {
        // Calculate raw percentages
        results.forEach(r => {
          r.percentage = Math.round((r.totalUnits / totalUnits) * 10000) / 100; // 2 decimal precision
        });

        // Normalize percentages to sum to 100
        const percentSum = results.reduce((sum, r) => sum + r.percentage, 0);
        if (percentSum !== 100 && results.length > 0) {
          // Add/subtract difference from largest site
          const diff = 100 - percentSum;
          const largestSite = results.reduce((max, r) => r.totalUnits > max.totalUnits ? r : max, results[0]);
          largestSite.percentage = Math.round((largestSite.percentage + diff) * 100) / 100;
        }

        // Calculate allocated amounts if total provided
        if (totalAmount && totalAmount > 0) {
          results.forEach(r => {
            r.allocatedAmount = Math.round((r.percentage / 100) * totalAmount);
          });

          // Ensure allocated amounts sum to total (adjust largest site)
          const allocSum = results.reduce((sum, r) => sum + r.allocatedAmount, 0);
          if (allocSum !== totalAmount && results.length > 0) {
            const diff = totalAmount - allocSum;
            const largestSite = results.reduce((max, r) => r.totalUnits > max.totalUnits ? r : max, results[0]);
            largestSite.allocatedAmount += diff;
          }
        }
      } else {
        // FIXED: No attendance data (unfilled date) = zero allocation for all sites
        // Previously did equal split which was incorrect - unfilled dates should show 0
        results.forEach(r => {
          r.percentage = 0;
          r.allocatedAmount = 0;
          // Keep workerCount and totalUnits at 0 as already set
        });
      }

      return results;
    },
    enabled: !!siteGroupId && !!date,
  });
}

/**
 * Get entry allocations for a specific entry
 */
export function useEntryAllocations(entryId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: entryId ? queryKeys.companyTeaShops.entryAllocations(entryId) : ["company-tea-shops", "entry-allocations", "none"],
    queryFn: async () => {
      if (!entryId) return [];

      const { data, error } = await (supabase as any)
        .from("tea_shop_entry_allocations")
        .select("*, site:sites(id, name)")
        .eq("entry_id", entryId)
        .order("allocated_amount", { ascending: false });

      if (error) {
        console.warn("Error fetching entry allocations:", error.message);
        return [];
      }
      return (data || []) as TeaShopEntryAllocation[];
    },
    enabled: !!entryId,
  });
}

// ============================================
// MUTATIONS
// ============================================

/**
 * Create a new company tea shop
 */
export function useCreateCompanyTeaShop() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (data: CompanyTeaShopFormData) => {
      await ensureFreshSession();

      const { data: shop, error } = await (supabase as any)
        .from("tea_shops")
        .insert(data)
        .select()
        .single();

      if (error) throw error;
      return shop as CompanyTeaShop;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companyTeaShops.list() });
    },
  });
}

/**
 * Update a company tea shop
 */
export function useUpdateCompanyTeaShop() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CompanyTeaShopFormData> }) => {
      await ensureFreshSession();

      const { data: shop, error } = await (supabase as any)
        .from("tea_shops")
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return shop as CompanyTeaShop;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companyTeaShops.list() });
      queryClient.invalidateQueries({ queryKey: queryKeys.companyTeaShops.byId(variables.id) });
    },
  });
}

/**
 * Delete (soft delete) a company tea shop
 */
export function useDeleteCompanyTeaShop() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await ensureFreshSession();

      const { error } = await (supabase as any)
        .from("tea_shops")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companyTeaShops.list() });
    },
  });
}

/**
 * Assign a tea shop to a site
 */
export function useAssignTeaShopToSite() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({ teaShopId, siteId }: { teaShopId: string; siteId: string }) => {
      await ensureFreshSession();

      // Deactivate any existing assignment for this site
      await (supabase as any)
        .from("tea_shop_site_assignments")
        .update({ is_active: false })
        .eq("site_id", siteId)
        .eq("is_active", true);

      // Create new assignment
      const { data, error } = await (supabase as any)
        .from("tea_shop_site_assignments")
        .insert({
          tea_shop_id: teaShopId,
          site_id: siteId,
          site_group_id: null,
        })
        .select()
        .single();

      if (error) throw error;
      return data as TeaShopSiteAssignment;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companyTeaShops.list() });
      queryClient.invalidateQueries({ queryKey: queryKeys.companyTeaShops.assignments(variables.teaShopId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.companyTeaShops.forSite(variables.siteId) });
    },
  });
}

/**
 * Assign a tea shop to a site group
 */
export function useAssignTeaShopToGroup() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({ teaShopId, siteGroupId }: { teaShopId: string; siteGroupId: string }) => {
      await ensureFreshSession();

      // Deactivate any existing assignment for this group
      await (supabase as any)
        .from("tea_shop_site_assignments")
        .update({ is_active: false })
        .eq("site_group_id", siteGroupId)
        .eq("is_active", true);

      // Create new assignment
      const { data, error } = await (supabase as any)
        .from("tea_shop_site_assignments")
        .insert({
          tea_shop_id: teaShopId,
          site_id: null,
          site_group_id: siteGroupId,
        })
        .select()
        .single();

      if (error) throw error;
      return data as TeaShopSiteAssignment;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companyTeaShops.list() });
      queryClient.invalidateQueries({ queryKey: queryKeys.companyTeaShops.assignments(variables.teaShopId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.companyTeaShops.forGroup(variables.siteGroupId) });
    },
  });
}

/**
 * Unassign a tea shop from a site or group
 */
export function useUnassignTeaShop() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (assignmentId: string) => {
      await ensureFreshSession();

      const { error } = await (supabase as any)
        .from("tea_shop_site_assignments")
        .update({ is_active: false })
        .eq("id", assignmentId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companyTeaShops.all });
    },
  });
}

/**
 * Create entry allocations for a group entry
 */
export function useCreateEntryAllocations() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      entryId,
      allocations
    }: {
      entryId: string;
      allocations: Array<{
        site_id: string;
        day_units_sum: number;
        worker_count: number;
        allocation_percentage: number;
        allocated_amount: number;
        is_manual_override?: boolean;
      }>;
    }) => {
      await ensureFreshSession();

      // Delete existing allocations
      await (supabase as any)
        .from("tea_shop_entry_allocations")
        .delete()
        .eq("entry_id", entryId);

      // Insert new allocations
      const { data, error } = await (supabase as any)
        .from("tea_shop_entry_allocations")
        .insert(allocations.map((a: any) => ({ ...a, entry_id: entryId })))
        .select();

      if (error) throw error;
      return data as TeaShopEntryAllocation[];
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companyTeaShops.entryAllocations(variables.entryId) });
    },
  });
}
