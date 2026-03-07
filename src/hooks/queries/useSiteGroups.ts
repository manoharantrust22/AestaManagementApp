"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient, ensureFreshSession } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/cache/keys";
import type {
  SiteGroup,
  SiteGroupWithSites,
  SiteGroupFormData,
  GroupStockInventory,
  GroupStockInventoryWithDetails,
  GroupStockTransaction,
  GroupStockTransactionWithDetails,
} from "@/types/material.types";

// ============================================
// SITE GROUPS
// Note: Using type assertions because site_groups table
// may not be in generated types until regeneration
// ============================================

/**
 * Fetch all site groups
 */
export function useSiteGroups() {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.siteGroups.list(),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("site_groups")
        .select("*")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      return (data || []) as SiteGroup[];
    },
  });
}

/**
 * Fetch all site groups with their sites
 */
export function useSiteGroupsWithSites() {
  const supabase = createClient();

  return useQuery({
    queryKey: [...queryKeys.siteGroups.list(), "with-sites"],
    queryFn: async () => {
      // Get all groups
      const { data: groups, error: groupsError } = await (supabase as any)
        .from("site_groups")
        .select("*")
        .eq("is_active", true)
        .order("name");

      if (groupsError) throw groupsError;
      if (!groups || groups.length === 0) return [] as SiteGroupWithSites[];

      // Get all sites with their group assignments
      const { data: sites, error: sitesError } = await (supabase as any)
        .from("sites")
        .select("id, name, site_group_id")
        .not("site_group_id", "is", null);

      if (sitesError) throw sitesError;

      // Map sites to their groups
      const sitesByGroup: Record<string, Array<{ id: string; name: string }>> = {};
      (sites || []).forEach((site: { id: string; name: string; site_group_id: string }) => {
        if (!sitesByGroup[site.site_group_id]) {
          sitesByGroup[site.site_group_id] = [];
        }
        sitesByGroup[site.site_group_id].push({ id: site.id, name: site.name });
      });

      // Combine groups with their sites
      return groups.map((group: SiteGroup) => ({
        ...group,
        sites: sitesByGroup[group.id] || [],
      })) as SiteGroupWithSites[];
    },
  });
}

/**
 * Fetch a single site group with its sites
 */
export function useSiteGroup(id: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: id ? queryKeys.siteGroups.byId(id) : ["site-groups", "detail"],
    queryFn: async () => {
      if (!id) return null;

      const { data: group, error: groupError } = await (supabase as any)
        .from("site_groups")
        .select("*")
        .eq("id", id)
        .single();

      if (groupError) throw groupError;

      // Get sites in this group
      const { data: sites, error: sitesError } = await (supabase as any)
        .from("sites")
        .select("id, name")
        .eq("site_group_id", id);

      if (sitesError) throw sitesError;

      return {
        ...group,
        sites: sites || [],
      } as SiteGroupWithSites;
    },
    enabled: !!id,
  });
}

/**
 * Fetch sites for a site group
 */
export function useSiteGroupSites(groupId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: groupId
      ? queryKeys.siteGroups.sites(groupId)
      : ["site-groups", "sites"],
    queryFn: async () => {
      if (!groupId) return [];

      const { data, error } = await (supabase as any)
        .from("sites")
        .select("id, name, address, city")
        .eq("site_group_id", groupId)
        .order("name");

      if (error) throw error;
      return data || [];
    },
    enabled: !!groupId,
  });
}

/**
 * Create a new site group
 */
export function useCreateSiteGroup() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (data: SiteGroupFormData) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      const { data: group, error } = await (supabase as any)
        .from("site_groups")
        .insert(data)
        .select()
        .single();

      if (error) throw error;
      return group as SiteGroup;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.siteGroups.list() });
    },
  });
}

/**
 * Update a site group
 */
export function useUpdateSiteGroup() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<SiteGroupFormData>;
    }) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      const { data: group, error } = await (supabase as any)
        .from("site_groups")
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return group as SiteGroup;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.siteGroups.list() });
      queryClient.invalidateQueries({
        queryKey: queryKeys.siteGroups.byId(variables.id),
      });
    },
  });
}

/**
 * Add a site to a group
 */
export function useAddSiteToGroup() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      siteId,
      groupId,
    }: {
      siteId: string;
      groupId: string;
    }) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      const { error } = await (supabase as any)
        .from("sites")
        .update({ site_group_id: groupId })
        .eq("id", siteId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.siteGroups.byId(variables.groupId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.siteGroups.sites(variables.groupId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.sites.list() });
    },
  });
}

/**
 * Remove a site from its group
 */
export function useRemoveSiteFromGroup() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      siteId,
      groupId,
    }: {
      siteId: string;
      groupId: string;
    }) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      const { error } = await (supabase as any)
        .from("sites")
        .update({ site_group_id: null })
        .eq("id", siteId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.siteGroups.byId(variables.groupId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.siteGroups.sites(variables.groupId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.sites.list() });
    },
  });
}

// ============================================
// GROUP STOCK INVENTORY
// ============================================

/**
 * Fetch group stock inventory for a site group
 * Calculates available quantity from source of truth (batches - usage records)
 * instead of relying on potentially corrupted current_qty field
 */
export function useGroupStockInventory(groupId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: groupId
      ? queryKeys.groupStock.byGroup(groupId)
      : ["group-stock", "inventory"],
    queryFn: async () => {
      if (!groupId) return [] as GroupStockInventoryWithDetails[];

      console.log("[useGroupStockInventory] Fetching inventory for groupId:", groupId);

      // Step 1: Get all group stock batches with their items
      const { data: batches, error: batchError } = await (supabase as any)
        .from("material_purchase_expenses")
        .select(`
          id,
          ref_code,
          site_group_id,
          items:material_purchase_expense_items(
            material_id,
            brand_id,
            quantity,
            unit_price,
            material:materials(id, name, code, unit, category_id),
            brand:material_brands(id, brand_name)
          )
        `)
        .eq("site_group_id", groupId)
        .eq("purchase_type", "group_stock")
        .in("status", ["in_stock", "partial_used", "recorded"]);

      if (batchError) {
        console.error("[useGroupStockInventory] Batch query error:", batchError);
        throw batchError;
      }

      if (!batches || batches.length === 0) {
        return [] as GroupStockInventoryWithDetails[];
      }

      // Step 2: Get all usage records for these batches
      const batchRefCodes = batches.map((b: any) => b.ref_code).filter(Boolean);
      const { data: usageRecords, error: usageError } = await (supabase as any)
        .from("batch_usage_records")
        .select("batch_ref_code, material_id, brand_id, quantity")
        .in("batch_ref_code", batchRefCodes);

      if (usageError) {
        console.error("[useGroupStockInventory] Usage query error:", usageError);
        // Continue without usage data - will show full quantities
      }

      // Step 3: Calculate usage per material/brand combination
      const usageMap = new Map<string, number>();
      (usageRecords || []).forEach((u: any) => {
        const key = `${u.material_id}-${u.brand_id || 'no-brand'}`;
        const current = usageMap.get(key) || 0;
        usageMap.set(key, current + Number(u.quantity || 0));
      });

      // Step 4: Aggregate inventory by material/brand, calculating remaining quantity
      const inventoryMap = new Map<string, GroupStockInventoryWithDetails>();

      for (const batch of batches) {
        for (const item of (batch.items || [])) {
          const key = `${item.material_id}-${item.brand_id || 'no-brand'}`;
          const originalQty = Number(item.quantity || 0);
          const usedQty = usageMap.get(key) || 0;

          if (inventoryMap.has(key)) {
            // Add to existing inventory
            const existing = inventoryMap.get(key)!;
            existing.current_qty += originalQty;
            existing.available_qty = existing.current_qty; // Will subtract usage later
            existing.total_value = existing.current_qty * existing.avg_unit_cost;
          } else {
            // Create new inventory entry with all required fields
            const unitCost = item.unit_price || 0;
            inventoryMap.set(key, {
              id: `${groupId}-${item.material_id}-${item.brand_id || 'none'}`,
              site_group_id: groupId,
              material_id: item.material_id,
              brand_id: item.brand_id || null,
              location_id: null,
              current_qty: originalQty,
              reserved_qty: 0,
              available_qty: originalQty,
              avg_unit_cost: unitCost,
              total_value: originalQty * unitCost,
              last_received_date: null,
              last_used_date: null,
              reorder_level: null,
              reorder_qty: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              material: item.material,
              brand: item.brand,
              site_group: undefined,
            } as GroupStockInventoryWithDetails);
          }
        }
      }

      // Step 5: Subtract used quantities and update computed fields
      inventoryMap.forEach((inv, key) => {
        const usedQty = usageMap.get(key) || 0;
        inv.current_qty = Math.max(0, inv.current_qty - usedQty);
        inv.available_qty = inv.current_qty - inv.reserved_qty;
        inv.total_value = inv.current_qty * inv.avg_unit_cost;
      });

      // Step 6: Filter out zero quantity items and return
      const result = Array.from(inventoryMap.values())
        .filter(inv => inv.current_qty > 0)
        .sort((a, b) => (a.material?.name || '').localeCompare(b.material?.name || ''));

      console.log("[useGroupStockInventory] Calculated inventory:", result);

      return result;
    },
    enabled: !!groupId,
  });
}

/**
 * Fetch group stock summary (aggregated view)
 */
export function useGroupStockSummary(groupId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: groupId
      ? queryKeys.groupStock.summary(groupId)
      : ["group-stock", "summary"],
    queryFn: async () => {
      if (!groupId) return null;

      // Query from the actual table with aggregation since view may not exist
      const { data, error } = await (supabase as any)
        .from("group_stock_inventory")
        .select("*")
        .eq("site_group_id", groupId);

      if (error) throw error;
      return data;
    },
    enabled: !!groupId,
  });
}

// ============================================
// GROUP STOCK TRANSACTIONS
// ============================================

/**
 * Fetch group stock transactions
 */
export function useGroupStockTransactions(
  groupId: string | undefined,
  options?: {
    limit?: number;
    transactionType?: string;
    usageSiteId?: string;
  }
) {
  const supabase = createClient();

  return useQuery({
    queryKey: groupId
      ? [...queryKeys.groupStock.transactions(groupId), options]
      : ["group-stock", "transactions"],
    queryFn: async () => {
      if (!groupId) return [] as GroupStockTransactionWithDetails[];

      let query = (supabase as any)
        .from("group_stock_transactions")
        .select(
          `
          *,
          material:materials(id, name, code, unit),
          brand:material_brands(id, brand_name),
          site_group:site_groups(id, name),
          usage_site:sites!group_stock_transactions_usage_site_id_fkey(id, name),
          payment_source_site:sites!group_stock_transactions_payment_source_site_id_fkey(id, name)
        `
        )
        .eq("site_group_id", groupId)
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (options?.transactionType) {
        query = query.eq("transaction_type", options.transactionType);
      }

      if (options?.usageSiteId) {
        query = query.eq("usage_site_id", options.usageSiteId);
      }

      if (options?.limit) {
        query = query.limit(options.limit);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as GroupStockTransactionWithDetails[];
    },
    enabled: !!groupId,
  });
}

/**
 * Fetch usage by site for a group (expense allocation view)
 */
export function useGroupUsageBySite(groupId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: groupId
      ? queryKeys.groupStock.usageBySite(groupId)
      : ["group-stock", "usage-by-site"],
    queryFn: async () => {
      if (!groupId) return [];

      // Query from transactions table with aggregation since view may not exist
      const { data, error } = await (supabase as any)
        .from("group_stock_transactions")
        .select(`
          *,
          usage_site:sites!group_stock_transactions_usage_site_id_fkey(id, name)
        `)
        .eq("site_group_id", groupId)
        .eq("transaction_type", "usage")
        .order("transaction_date", { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!groupId,
  });
}

/**
 * Add purchase to group stock
 */
export function useAddGroupStockPurchase() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (data: {
      groupId: string;
      materialId: string;
      brandId?: string;
      quantity: number;
      unitCost: number;
      paymentSource: string;
      paymentSiteId?: string;
      referenceType?: string;
      referenceId?: string;
      userId?: string;
    }) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      // Insert transaction record directly
      const totalCost = data.quantity * data.unitCost;

      const { data: transaction, error: txError } = await (supabase as any)
        .from("group_stock_transactions")
        .insert({
          site_group_id: data.groupId,
          material_id: data.materialId,
          brand_id: data.brandId || null,
          transaction_type: "purchase",
          transaction_date: new Date().toISOString().split("T")[0],
          quantity: data.quantity,
          unit_cost: data.unitCost,
          total_cost: totalCost,
          payment_source: data.paymentSource,
          payment_source_site_id: data.paymentSiteId || null,
          reference_type: data.referenceType || "manual",
          reference_id: data.referenceId || null,
          created_by: data.userId || null,
        })
        .select()
        .single();

      if (txError) throw txError;

      // Update or insert inventory record
      const { data: existingInventory } = await (supabase as any)
        .from("group_stock_inventory")
        .select("*")
        .eq("site_group_id", data.groupId)
        .eq("material_id", data.materialId)
        .eq("brand_id", data.brandId || null)
        .maybeSingle();

      if (existingInventory) {
        // Update with weighted average
        const newQty = (existingInventory.current_qty || 0) + data.quantity;
        const existingValue = (existingInventory.current_qty || 0) * (existingInventory.avg_unit_cost || 0);
        const newAvgCost = (existingValue + totalCost) / newQty;

        await (supabase as any)
          .from("group_stock_inventory")
          .update({
            current_qty: newQty,
            avg_unit_cost: newAvgCost,
            last_received_date: new Date().toISOString().split("T")[0],
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingInventory.id);
      } else {
        // Insert new inventory record
        await (supabase as any)
          .from("group_stock_inventory")
          .insert({
            site_group_id: data.groupId,
            material_id: data.materialId,
            brand_id: data.brandId || null,
            current_qty: data.quantity,
            avg_unit_cost: data.unitCost,
            last_received_date: new Date().toISOString().split("T")[0],
          });
      }

      return transaction;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.groupStock.byGroup(variables.groupId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.groupStock.transactions(variables.groupId),
      });
    },
  });
}

/**
 * Record usage from group stock
 */
export function useRecordGroupStockUsage() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (data: {
      groupId: string;
      materialId: string;
      brandId?: string;
      quantity: number;
      usageSiteId: string;
      workDescription?: string;
      referenceType?: string;
      referenceId?: string;
      userId?: string;
      transactionDate?: string; // Optional for historical entries
    }) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      // Get current inventory to calculate cost
      const { data: inventory, error: invError } = await (supabase as any)
        .from("group_stock_inventory")
        .select("*")
        .eq("site_group_id", data.groupId)
        .eq("material_id", data.materialId)
        .eq("brand_id", data.brandId || null)
        .single();

      if (invError) throw new Error("Material not found in group stock");
      if (inventory.current_qty < data.quantity) {
        throw new Error("Insufficient stock");
      }

      const unitCost = inventory.avg_unit_cost || 0;
      const totalCost = data.quantity * unitCost;
      const transactionDate = data.transactionDate || new Date().toISOString().split("T")[0];

      // Insert usage transaction
      const { data: transaction, error: txError } = await (supabase as any)
        .from("group_stock_transactions")
        .insert({
          site_group_id: data.groupId,
          material_id: data.materialId,
          brand_id: data.brandId || null,
          transaction_type: "usage",
          transaction_date: transactionDate,
          quantity: -data.quantity, // Negative for usage
          unit_cost: unitCost,
          total_cost: -totalCost,
          usage_site_id: data.usageSiteId,
          work_description: data.workDescription || null,
          reference_type: data.referenceType || "manual",
          reference_id: data.referenceId || null,
          created_by: data.userId || null,
        })
        .select()
        .single();

      if (txError) throw txError;

      // Update inventory
      await (supabase as any)
        .from("group_stock_inventory")
        .update({
          current_qty: inventory.current_qty - data.quantity,
          last_used_date: transactionDate,
          updated_at: new Date().toISOString(),
        })
        .eq("id", inventory.id);

      return transaction;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.groupStock.byGroup(variables.groupId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.groupStock.transactions(variables.groupId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.groupStock.usageBySite(variables.groupId),
      });
    },
  });
}

// ============================================
// SITE GROUP MEMBERSHIP CHECK
// ============================================

/**
 * Check if a site belongs to a group and return group details
 */
export function useSiteGroupMembership(siteId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: siteId
      ? ["site-group-membership", siteId]
      : ["site-group-membership"],
    queryFn: async () => {
      if (!siteId) {
        return {
          isInGroup: false,
          groupId: null,
          groupName: null,
          otherSites: [],
        };
      }

      // Get the site's group membership
      const { data: site, error: siteError } = await (supabase as any)
        .from("sites")
        .select("id, name, site_group_id")
        .eq("id", siteId)
        .single();

      if (siteError || !site?.site_group_id) {
        if (siteError) {
          console.warn("[useSiteGroupMembership] Error fetching site:", siteError.message);
        }
        return {
          isInGroup: false,
          groupId: null,
          groupName: null,
          otherSites: [],
        };
      }

      // Get the group details
      const { data: group, error: groupError } = await (supabase as any)
        .from("site_groups")
        .select("id, name")
        .eq("id", site.site_group_id)
        .eq("is_active", true)
        .single();

      if (groupError || !group) {
        if (groupError) {
          console.warn("[useSiteGroupMembership] Error fetching group:", groupError.message, "for site_group_id:", site.site_group_id);
        }
        return {
          isInGroup: false,
          groupId: null,
          groupName: null,
          otherSites: [],
        };
      }

      // Get all sites in this group (including current site for context)
      const { data: groupSites, error: sitesError } = await (supabase as any)
        .from("sites")
        .select("id, name")
        .eq("site_group_id", site.site_group_id)
        .order("name");

      if (sitesError) {
        return {
          isInGroup: true,
          groupId: group.id,
          groupName: group.name,
          otherSites: [],
        };
      }

      // Filter out current site from otherSites
      const otherSites = (groupSites || []).filter(
        (s: { id: string }) => s.id !== siteId
      );

      return {
        isInGroup: true,
        groupId: group.id as string,
        groupName: group.name as string,
        allSites: groupSites as Array<{ id: string; name: string }>,
        otherSites: otherSites as Array<{ id: string; name: string }>,
      };
    },
    enabled: !!siteId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2, // Retry on transient errors to prevent hiding group toggle
  });
}

/**
 * Batch record multiple usage entries from group stock
 * Used for weekly usage reports
 */
export function useBatchRecordGroupStockUsage() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (data: {
      groupId: string;
      entries: Array<{
        materialId: string;
        brandId?: string;
        quantity: number;
        usageSiteId: string;
        workDescription?: string;
        transactionDate?: string;
      }>;
      userId?: string;
    }) => {
      console.log("[useBatchRecordGroupStockUsage] Starting mutation", { data });

      try {
        // Ensure fresh session before mutation
        console.log("[useBatchRecordGroupStockUsage] Ensuring fresh session...");
        await ensureFreshSession();
        console.log("[useBatchRecordGroupStockUsage] Session refreshed");

        const results = [];

        for (const entry of data.entries) {
          console.log("[useBatchRecordGroupStockUsage] Processing entry", { entry });

          // Get current inventory to calculate cost
          // Note: There may be multiple inventory records for the same material (batch-specific and general)
          // We fetch all and select the best one (prefer batch with stock, FIFO order)
          let query = (supabase as any)
            .from("group_stock_inventory")
            .select("*")
            .eq("site_group_id", data.groupId)
            .eq("material_id", entry.materialId)
            .gt("current_qty", 0) // Only get inventory with stock
            .order("created_at", { ascending: true }); // FIFO - oldest first

        // Handle null brand_id correctly - use .is() for null values
        if (entry.brandId) {
          query = query.eq("brand_id", entry.brandId);
        } else {
          query = query.is("brand_id", null);
        }

        console.log("[useBatchRecordGroupStockUsage] Querying inventory", {
          groupId: data.groupId,
          materialId: entry.materialId,
          brandId: entry.brandId
        });

        console.log("[useBatchRecordGroupStockUsage] Executing query...");
        const { data: inventoryRecords, error: invError } = await query;
        console.log("[useBatchRecordGroupStockUsage] Query completed", {
          inventoryCount: inventoryRecords?.length || 0,
          inventoryRecords,
          invError
        });

        if (invError) {
          console.error("[useBatchRecordGroupStockUsage] Inventory query error", invError);
          throw new Error(`Material ${entry.materialId} not found in group stock: ${invError.message}`);
        }

        if (!inventoryRecords || inventoryRecords.length === 0) {
          throw new Error(`Material ${entry.materialId} not found in group stock or has no available quantity`);
        }

        // Select the best inventory record:
        // 1. Prefer one with batch_code (specific batch) over general inventory
        // 2. If multiple, pick the one with sufficient stock (FIFO)
        let inventory = inventoryRecords[0]; // Default to first (oldest by FIFO)

        // Check if there's one with batch_code that has sufficient stock
        const batchInventory = inventoryRecords.find(
          (inv: any) => inv.batch_code && inv.current_qty >= entry.quantity
        );
        if (batchInventory) {
          inventory = batchInventory;
        } else {
          // Find any inventory with sufficient stock
          const sufficientInventory = inventoryRecords.find(
            (inv: any) => inv.current_qty >= entry.quantity
          );
          if (sufficientInventory) {
            inventory = sufficientInventory;
          }
        }

        // Calculate total available across all inventory records
        const totalAvailable = inventoryRecords.reduce(
          (sum: number, inv: any) => sum + (inv.current_qty || 0), 0
        );

        console.log("[useBatchRecordGroupStockUsage] Inventory selected", {
          selectedInventoryId: inventory.id,
          selectedBatchCode: inventory.batch_code,
          requestedQty: entry.quantity,
          selectedInventoryQty: inventory.current_qty,
          totalAvailableAcrossAll: totalAvailable
        });

        if (inventory.current_qty < entry.quantity) {
          // Check if total across all inventory would be sufficient
          if (totalAvailable >= entry.quantity) {
            throw new Error(`Insufficient stock in single batch. Available: ${inventory.current_qty}, Requested: ${entry.quantity}. Total across all batches: ${totalAvailable}. Please record usage in smaller quantities matching batch sizes.`);
          }
          throw new Error(`Insufficient stock for material ${entry.materialId}. Available: ${totalAvailable}, Requested: ${entry.quantity}`);
        }

        const unitCost = inventory.avg_unit_cost || 0;
        const totalCost = entry.quantity * unitCost;
        const transactionDate = entry.transactionDate || new Date().toISOString().split("T")[0];

        const insertData = {
          site_group_id: data.groupId,
          inventory_id: inventory.id,
          material_id: entry.materialId,
          brand_id: entry.brandId || null,
          transaction_type: "usage",
          transaction_date: transactionDate,
          quantity: -entry.quantity,
          unit_cost: unitCost,
          total_cost: -totalCost,
          usage_site_id: entry.usageSiteId,
          work_description: entry.workDescription || null,
          reference_type: "weekly_report",
          created_by: data.userId || null,
        };

        console.log("[useBatchRecordGroupStockUsage] Inserting transaction", { insertData });

        // Insert usage transaction
        const { data: transaction, error: txError } = await (supabase as any)
          .from("group_stock_transactions")
          .insert(insertData)
          .select()
          .single();

        if (txError) {
          console.error("[useBatchRecordGroupStockUsage] Transaction insert error", txError);
          throw txError;
        }

        console.log("[useBatchRecordGroupStockUsage] Transaction inserted", { transaction });

        // Find the batch ref_code and paying_site_id for batch_usage_record and payment tracking
        console.log("[useBatchRecordGroupStockUsage] Finding batch details for usage tracking");

        let batchQuery = (supabase as any)
          .from("material_purchase_expenses")
          .select("ref_code, paying_site_id, site_id, purchase_date")
          .eq("site_group_id", data.groupId)
          .eq("purchase_type", "group_stock")
          .eq("status", "recorded")
          .order("purchase_date", { ascending: false })
          .order("created_at", { ascending: false });

        const { data: batches, error: batchError } = await batchQuery;

        if (batchError) {
          console.error("[useBatchRecordGroupStockUsage] Batch query error:", batchError);
          throw new Error(`Failed to find batch for material: ${batchError.message}`);
        }

        if (!batches || batches.length === 0) {
          console.error("[useBatchRecordGroupStockUsage] No group stock batches found");
          throw new Error("No group stock batches found for this material");
        }

        // Use the most recent batch (already ordered by date)
        const batch = batches[0];
        const batchRefCode = batch.ref_code;
        const paymentSourceSiteId = batch.paying_site_id || batch.site_id;

        console.log("[useBatchRecordGroupStockUsage] Found batch:", {
          batchRefCode,
          paymentSourceSiteId,
          purchaseDate: batch.purchase_date,
        });

        // Update transaction with payment_source_site_id AND batch_ref_code for cascade delete
        console.log("[useBatchRecordGroupStockUsage] Updating transaction with payment_source_site_id and batch_ref_code");
        const { error: txUpdateError } = await (supabase as any)
          .from("group_stock_transactions")
          .update({
            payment_source_site_id: paymentSourceSiteId,
            batch_ref_code: batchRefCode,  // Enables cascade delete when PO is deleted
          })
          .eq("id", transaction.id);

        if (txUpdateError) {
          console.error("[useBatchRecordGroupStockUsage] Failed to update transaction:", txUpdateError);
          throw txUpdateError;
        }

        // Get material unit for batch_usage_record
        const { data: material, error: matError } = await (supabase as any)
          .from("materials")
          .select("unit")
          .eq("id", entry.materialId)
          .single();

        if (matError) {
          console.error("[useBatchRecordGroupStockUsage] Material query error:", matError);
          throw new Error(`Failed to get material unit: ${matError.message}`);
        }

        // Create batch_usage_record for settlement tracking
        console.log("[useBatchRecordGroupStockUsage] Creating batch_usage_record");
        const batchUsageData = {
          batch_ref_code: batchRefCode,
          site_group_id: data.groupId,
          usage_site_id: entry.usageSiteId,
          material_id: entry.materialId,
          brand_id: entry.brandId || null,
          quantity: entry.quantity,
          unit: material.unit,
          unit_cost: unitCost,
          // total_cost is a generated column (quantity * unit_cost)
          usage_date: transactionDate,
          work_description: entry.workDescription || "Usage from weekly report",
          settlement_status: "pending",
          is_self_use: false,
          group_stock_transaction_id: transaction.id,
        };

        const { error: batchUsageError } = await (supabase as any)
          .from("batch_usage_records")
          .insert(batchUsageData);

        if (batchUsageError) {
          console.error("[useBatchRecordGroupStockUsage] Batch usage record error:", batchUsageError);
          throw new Error(`Failed to create batch usage record: ${batchUsageError.message}`);
        }

        console.log("[useBatchRecordGroupStockUsage] Batch usage record created successfully");

        // Update inventory
        const updateData = {
          current_qty: inventory.current_qty - entry.quantity,
          last_used_date: transactionDate,
          updated_at: new Date().toISOString(),
        };

        console.log("[useBatchRecordGroupStockUsage] Updating inventory", {
          inventoryId: inventory.id,
          updateData
        });

        const { error: updateError } = await (supabase as any)
          .from("group_stock_inventory")
          .update(updateData)
          .eq("id", inventory.id);

        if (updateError) {
          console.error("[useBatchRecordGroupStockUsage] Inventory update error", updateError);
          throw updateError;
        }

        console.log("[useBatchRecordGroupStockUsage] Inventory updated successfully");

        results.push(transaction);
      }

        console.log("[useBatchRecordGroupStockUsage] All entries processed successfully", { results });

        return results;
      } catch (error) {
        console.error("[useBatchRecordGroupStockUsage] Mutation failed", error);
        throw error;
      }
    },
    onSuccess: (_, variables) => {
      // Invalidate all relevant queries to ensure UI updates immediately
      queryClient.invalidateQueries({
        queryKey: queryKeys.groupStock.byGroup(variables.groupId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.groupStock.transactions(variables.groupId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.groupStock.usageBySite(variables.groupId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.interSiteSettlements.byGroup(variables.groupId),
      });
      // Invalidate ALL inter-site settlement queries (including summary) to ensure UI is in sync
      queryClient.invalidateQueries({
        queryKey: queryKeys.interSiteSettlements.all,
      });
      // Invalidate balances for unsettled balances tab
      queryClient.invalidateQueries({
        queryKey: queryKeys.interSiteSettlements.balances(variables.groupId),
      });
      // Invalidate batch usage records
      queryClient.invalidateQueries({
        queryKey: queryKeys.batchUsage.all,
      });
    },
  });
}

/**
 * Add historical purchase to group stock (for backdating)
 */
export function useAddHistoricalGroupStockPurchase() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (data: {
      groupId: string;
      materialId: string;
      brandId?: string;
      quantity: number;
      unitCost: number;
      transportCost?: number;
      paymentSiteId: string;
      purchaseDate: string;
      vendorId?: string;
      vendorName?: string;
      notes?: string;
      userId?: string;
    }) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      // Calculate total unit cost including transport if provided
      const effectiveUnitCost = data.transportCost
        ? data.unitCost + (data.transportCost / data.quantity)
        : data.unitCost;

      const totalCost = data.quantity * effectiveUnitCost;

      // First, get or create inventory record (needed for transaction's inventory_id)
      let inventoryId: string;

      const { data: existingInventory } = await (supabase as any)
        .from("group_stock_inventory")
        .select("*")
        .eq("site_group_id", data.groupId)
        .eq("material_id", data.materialId)
        .is("brand_id", data.brandId || null)
        .maybeSingle();

      if (existingInventory) {
        inventoryId = existingInventory.id;

        // Update with weighted average
        const newQty = (existingInventory.current_qty || 0) + data.quantity;
        const existingValue = (existingInventory.current_qty || 0) * (existingInventory.avg_unit_cost || 0);
        const newAvgCost = (existingValue + totalCost) / newQty;

        const { error: updateError } = await (supabase as any)
          .from("group_stock_inventory")
          .update({
            current_qty: newQty,
            avg_unit_cost: newAvgCost,
            last_received_date: data.purchaseDate,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingInventory.id);

        if (updateError) throw updateError;
      } else {
        // Insert new inventory record
        const { data: newInventory, error: insertError } = await (supabase as any)
          .from("group_stock_inventory")
          .insert({
            site_group_id: data.groupId,
            material_id: data.materialId,
            brand_id: data.brandId || null,
            current_qty: data.quantity,
            avg_unit_cost: effectiveUnitCost,
            last_received_date: data.purchaseDate,
          })
          .select()
          .single();

        if (insertError) throw insertError;
        inventoryId = newInventory.id;
      }

      // Now insert transaction record with the inventory_id
      const { data: transaction, error: txError } = await (supabase as any)
        .from("group_stock_transactions")
        .insert({
          site_group_id: data.groupId,
          inventory_id: inventoryId,
          material_id: data.materialId,
          brand_id: data.brandId || null,
          transaction_type: "purchase",
          transaction_date: data.purchaseDate,
          quantity: data.quantity,
          unit_cost: effectiveUnitCost,
          total_cost: totalCost,
          payment_source: "site_cash",
          payment_source_site_id: data.paymentSiteId,
          reference_type: "historical",
          notes: data.notes || (data.vendorName ? `Vendor: ${data.vendorName}` : null),
          created_by: data.userId || null,
        })
        .select()
        .single();

      if (txError) throw txError;

      return transaction;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.groupStock.byGroup(variables.groupId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.groupStock.transactions(variables.groupId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.interSiteSettlements.byGroup(variables.groupId),
      });
    },
  });
}

/**
 * Update a group stock transaction
 */
export function useUpdateGroupStockTransaction() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (data: {
      transactionId: string;
      groupId: string;
      transactionDate?: string;
      quantity?: number;
      unitCost?: number;
      notes?: string;
    }) => {
      await ensureFreshSession();

      // Get the current transaction to calculate differences
      const { data: currentTx, error: fetchError } = await (supabase as any)
        .from("group_stock_transactions")
        .select("*")
        .eq("id", data.transactionId)
        .single();

      if (fetchError) throw fetchError;

      // Prepare update payload
      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (data.transactionDate !== undefined) {
        updateData.transaction_date = data.transactionDate;
      }
      if (data.notes !== undefined) {
        updateData.notes = data.notes;
      }

      // Handle quantity and unit cost changes - need to update total_cost
      const newQuantity = data.quantity ?? Math.abs(currentTx.quantity);
      const newUnitCost = data.unitCost ?? currentTx.unit_cost;
      const newTotalCost = newQuantity * newUnitCost;

      // For usage transactions, quantities are negative
      const isUsage = currentTx.transaction_type === "usage";
      if (data.quantity !== undefined) {
        updateData.quantity = isUsage ? -newQuantity : newQuantity;
      }
      if (data.unitCost !== undefined) {
        updateData.unit_cost = newUnitCost;
      }
      if (data.quantity !== undefined || data.unitCost !== undefined) {
        updateData.total_cost = isUsage ? -newTotalCost : newTotalCost;
      }

      // Update the transaction
      const { data: updated, error: updateError } = await (supabase as any)
        .from("group_stock_transactions")
        .update(updateData)
        .eq("id", data.transactionId)
        .select()
        .single();

      if (updateError) throw updateError;

      // Update inventory if quantity changed
      if (data.quantity !== undefined && currentTx.inventory_id) {
        const qtyDiff = newQuantity - Math.abs(currentTx.quantity);
        const inventoryQtyChange = isUsage ? -qtyDiff : qtyDiff;

        if (inventoryQtyChange !== 0) {
          const { data: inventory } = await (supabase as any)
            .from("group_stock_inventory")
            .select("*")
            .eq("id", currentTx.inventory_id)
            .single();

          if (inventory) {
            await (supabase as any)
              .from("group_stock_inventory")
              .update({
                current_qty: inventory.current_qty + inventoryQtyChange,
                updated_at: new Date().toISOString(),
              })
              .eq("id", currentTx.inventory_id);
          }
        }
      }

      return updated;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.groupStock.byGroup(variables.groupId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.groupStock.transactions(variables.groupId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.interSiteSettlements.balances(variables.groupId),
      });
    },
  });
}

/**
 * Delete a group stock transaction
 */
export function useDeleteGroupStockTransaction() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (data: {
      transactionId: string;
      groupId: string;
    }) => {
      await ensureFreshSession();

      // Get the transaction to reverse inventory changes
      const { data: tx, error: fetchError } = await (supabase as any)
        .from("group_stock_transactions")
        .select("*")
        .eq("id", data.transactionId)
        .single();

      if (fetchError) throw fetchError;

      // Reverse inventory changes if inventory_id exists
      if (tx.inventory_id) {
        const { data: inventory } = await (supabase as any)
          .from("group_stock_inventory")
          .select("*")
          .eq("id", tx.inventory_id)
          .single();

        if (inventory) {
          // For purchase: reduce qty (tx.quantity is positive)
          // For usage: add back qty (tx.quantity is negative, so subtracting adds)
          const newQty = inventory.current_qty - tx.quantity;

          await (supabase as any)
            .from("group_stock_inventory")
            .update({
              current_qty: Math.max(0, newQty),
              updated_at: new Date().toISOString(),
            })
            .eq("id", tx.inventory_id);
        }
      }

      // MUST delete corresponding batch_usage_record FIRST (FK constraint)
      // Use group_stock_transaction_id for accurate matching
      if (tx.transaction_type === 'usage') {
        const { error: batchDeleteError } = await (supabase as any)
          .from("batch_usage_records")
          .delete()
          .eq("group_stock_transaction_id", data.transactionId);

        if (batchDeleteError) {
          console.error("Error deleting batch usage record:", batchDeleteError);
          // If batch_usage_record exists and can't be deleted, throw to prevent orphaned FK
          throw new Error(`Cannot delete transaction: ${batchDeleteError.message}`);
        }
      }

      // Delete the transaction
      const { error: deleteError } = await (supabase as any)
        .from("group_stock_transactions")
        .delete()
        .eq("id", data.transactionId);

      if (deleteError) throw deleteError;

      return { success: true };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.groupStock.byGroup(variables.groupId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.groupStock.transactions(variables.groupId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.interSiteSettlements.balances(variables.groupId),
      });
      // Invalidate ALL inter-site settlement queries (including summary) to ensure UI is in sync
      queryClient.invalidateQueries({
        queryKey: queryKeys.interSiteSettlements.all,
      });
      // Also invalidate batch queries since we might have deleted a batch usage record
      queryClient.invalidateQueries({
        queryKey: queryKeys.batchUsage.all,
      });
    },
  });
}
