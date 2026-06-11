"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient, ensureFreshSession } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/cache/keys";
import type {
  DailyMaterialUsage,
  DailyMaterialUsageWithDetails,
  UsageEntryFormData,
  GroupedUsageRecord,
} from "@/types/material.types";
import type { BatchAllocation } from "@/lib/utils/fifoAllocator";
import dayjs from "dayjs";

// Timeout for database operations (30 seconds)
const DB_OPERATION_TIMEOUT = 30000;

/**
 * Wraps a promise or thenable with a timeout to prevent indefinite hangs.
 * Throws an error if the operation takes longer than the specified timeout.
 * Works with Supabase PostgrestBuilder which is thenable but not a full Promise.
 */
async function withTimeout<T>(
  promiseOrThenable: Promise<T> | PromiseLike<T>,
  timeoutMs: number,
  operationName: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  // Wrap thenable in a proper Promise for compatibility
  const wrappedPromise = Promise.resolve(promiseOrThenable);

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      const err = new Error(`Operation '${operationName}' timed out after ${timeoutMs / 1000} seconds. Please try again.`);
      err.name = "TimeoutError";
      reject(err);
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([wrappedPromise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

// ============================================
// DAILY MATERIAL USAGE
// ============================================

/**
 * Fetch material usage for a site within a date range
 * Includes both:
 * 1. Regular usage from site's own stock (site_id = current site)
 * 2. ALL batch usage from the site's group (so both sites see all shared stock usage)
 */
export function useMaterialUsage(
  siteId: string | undefined,
  options?: {
    startDate?: string;
    endDate?: string;
    sectionId?: string;
    materialId?: string;
    siteGroupId?: string | null; // For fetching ALL group batch usage
  }
) {
  const supabase = createClient();

  return useQuery({
    queryKey: siteId
      ? [...queryKeys.materialUsage.bySite(siteId), options]
      : ["material-usage", "unknown"],
    queryFn: async () => {
      if (!siteId) return [];

      // 1. Get regular usage from daily_material_usage (own stock usage - non-group)
      let query = supabase
        .from("daily_material_usage")
        .select(
          `
          *,
          material:materials(id, name, code, unit),
          brand:material_brands(id, brand_name),
          section:building_sections(id, name),
          created_by_user:users!daily_material_usage_created_by_fkey(name)
        `
        )
        .eq("site_id", siteId)
        .order("usage_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (options?.startDate) {
        query = query.gte("usage_date", options.startDate);
      }
      if (options?.endDate) {
        query = query.lte("usage_date", options.endDate);
      }
      if (options?.sectionId) {
        query = query.eq("section_id", options.sectionId);
      }
      if (options?.materialId) {
        query = query.eq("material_id", options.materialId);
      }

      const { data: ownUsage, error: ownError } = await query;
      if (ownError) throw ownError;

      // 2. Get ALL batch usage from the site group (so both sites see all shared stock usage)
      // This includes usage from ALL sites in the group with "Used by [Site]" tag
      let groupBatchUsage: any[] = [];
      if (options?.siteGroupId) {
        let batchQuery = supabase
          .from("batch_usage_records")
          .select(
            `
            *,
            material:materials(id, name, code, unit),
            brand:material_brands(id, brand_name),
            usage_site:sites!batch_usage_records_usage_site_id_fkey(id, name)
          `
          )
          .eq("site_group_id", options.siteGroupId) // ALL usage in the group
          .order("usage_date", { ascending: false })
          .order("created_at", { ascending: false });

        if (options?.startDate) {
          batchQuery = batchQuery.gte("usage_date", options.startDate);
        }
        if (options?.endDate) {
          batchQuery = batchQuery.lte("usage_date", options.endDate);
        }
        if (options?.materialId) {
          batchQuery = batchQuery.eq("material_id", options.materialId);
        }

        const { data: batchData, error: batchError } = await batchQuery;
        if (batchError) {
          console.warn("Failed to fetch group batch usage:", batchError);
        } else {
          groupBatchUsage = batchData || [];
        }
      }

      // 3. Map own usage (non-batch) to include is_shared_usage = false
      // Filter out any records that are already covered by batch_usage_records
      const ownUsageWithFlag: DailyMaterialUsageWithDetails[] = ((ownUsage || []) as any[]).map(
        (item) => ({
          ...item,
          is_shared_usage: false,
          paid_by_site_name: null,
        })
      );

      // 4. Map group batch usage to match DailyMaterialUsageWithDetails format
      // Shows "Used by [Site Name]" for all batch usage in the group
      const groupBatchMapped: DailyMaterialUsageWithDetails[] = groupBatchUsage.map(
        (item: any) => ({
          // Map batch_usage_records fields to daily_material_usage format
          id: item.id,
          site_id: item.usage_site_id, // Usage site
          section_id: null, // batch_usage_records doesn't have section
          usage_date: item.usage_date,
          usage_date_end: item.usage_date_end ?? null,
          material_id: item.material_id,
          brand_id: item.brand_id,
          quantity: item.quantity,
          unit_cost: item.unit_cost,
          total_cost: item.total_cost,
          work_description: item.work_description,
          work_area: null,
          used_by: null,
          is_verified: false,
          verified_by: null,
          verified_at: null,
          notes: null,
          created_at: item.created_at || new Date().toISOString(),
          updated_at: item.updated_at || new Date().toISOString(),
          created_by: item.created_by,
          usage_group_id: item.usage_group_id || null,
          // Include related data
          material: item.material,
          brand: item.brand,
          section: undefined, // Use undefined to match optional type
          created_by_user: undefined, // Use undefined to match optional type
          // Shared stock indicators - shows which site used this material
          is_shared_usage: true,
          paid_by_site_name: item.usage_site?.name || "Unknown Site", // "Used by [Site Name]"
        })
      );

      // 5. Combine and sort by date (newest first)
      // Note: ownUsage is for non-group stock, groupBatchMapped is for all group batch usage
      const combined = [...ownUsageWithFlag, ...groupBatchMapped].sort((a, b) => {
        const dateCompare = new Date(b.usage_date).getTime() - new Date(a.usage_date).getTime();
        if (dateCompare !== 0) return dateCompare;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      return combined;
    },
    enabled: !!siteId,
  });
}

/**
 * Groups flat usage records by usage_group_id.
 * Records without a usage_group_id are treated as standalone (ungrouped) entries.
 * Records with the same usage_group_id are combined into a single GroupedUsageRecord
 * with aggregated totals.
 */
export function groupUsageRecords(
  records: DailyMaterialUsageWithDetails[]
): GroupedUsageRecord[] {
  const groupMap = new Map<string, DailyMaterialUsageWithDetails[]>();
  const ungrouped: DailyMaterialUsageWithDetails[] = [];

  for (const record of records) {
    const groupId = record.usage_group_id;
    if (groupId) {
      const existing = groupMap.get(groupId);
      if (existing) {
        existing.push(record);
      } else {
        groupMap.set(groupId, [record]);
      }
    } else {
      ungrouped.push(record);
    }
  }

  const result: GroupedUsageRecord[] = [];

  // Process grouped records
  for (const [groupId, children] of groupMap) {
    const rep = children[0];
    result.push({
      group_id: groupId,
      is_grouped: children.length > 1,
      child_count: children.length,
      representative: rep,
      children,
      total_quantity: children.reduce((sum, c) => sum + c.quantity, 0),
      total_cost: children.reduce((sum, c) => sum + (c.total_cost || 0), 0),
      usage_date: rep.usage_date,
      material_id: rep.material_id,
      material: rep.material,
      brand: rep.brand,
      brand_id: rep.brand_id,
      work_description: rep.work_description,
      section: rep.section,
      section_id: rep.section_id,
      is_shared_usage: rep.is_shared_usage || false,
      paid_by_site_name: rep.paid_by_site_name || null,
      site_id: rep.site_id,
      created_by: rep.created_by,
      created_at: rep.created_at,
    });
  }

  // Process ungrouped records (each becomes its own "group" of 1)
  for (const record of ungrouped) {
    result.push({
      group_id: record.id,
      is_grouped: false,
      child_count: 1,
      representative: record,
      children: [record],
      total_quantity: record.quantity,
      total_cost: record.total_cost || 0,
      usage_date: record.usage_date,
      material_id: record.material_id,
      material: record.material,
      brand: record.brand,
      brand_id: record.brand_id,
      work_description: record.work_description,
      section: record.section,
      section_id: record.section_id,
      is_shared_usage: record.is_shared_usage || false,
      paid_by_site_name: record.paid_by_site_name || null,
      site_id: record.site_id,
      created_by: record.created_by,
      created_at: record.created_at,
    });
  }

  // Sort by date (newest first), then by created_at
  result.sort((a, b) => {
    const dateCompare =
      new Date(b.usage_date).getTime() - new Date(a.usage_date).getTime();
    if (dateCompare !== 0) return dateCompare;
    return (
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  });

  return result;
}

/**
 * Fetch today's usage for a site
 */
export function useTodayUsage(siteId: string | undefined) {
  const today = dayjs().format("YYYY-MM-DD");

  return useMaterialUsage(siteId, {
    startDate: today,
    endDate: today,
  });
}

/**
 * Fetch usage summary for a site (today's totals)
 */
export function useTodayUsageSummary(siteId: string | undefined) {
  const supabase = createClient();
  const today = dayjs().format("YYYY-MM-DD");

  return useQuery({
    queryKey: siteId
      ? [...queryKeys.materialUsage.byDate(siteId, today), "summary"]
      : ["material-usage", "summary"],
    queryFn: async () => {
      if (!siteId) return null;

      const { data, error } = await supabase
        .from("daily_material_usage")
        .select("quantity, total_cost, material:materials(unit)")
        .eq("site_id", siteId)
        .eq("usage_date", today);

      if (error) throw error;

      const totalEntries = data.length;
      const totalCost = data.reduce((sum, d) => sum + (d.total_cost || 0), 0);
      const uniqueMaterials = new Set(data.map((d) => d.material)).size;

      return {
        totalEntries,
        totalCost,
        uniqueMaterials,
      };
    },
    enabled: !!siteId,
  });
}

/**
 * Create a new material usage entry
 * This function:
 * 1. Finds the relevant stock inventory record
 * 2. Validates sufficient stock is available
 * 3. Reduces the stock inventory quantity
 * 4. Creates a stock transaction record
 * 5. Creates the daily usage record
 */
export function useCreateMaterialUsage() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    // IMPORTANT: Disable retry for this mutation since it's not idempotent
    // Retrying would cause double stock reduction or 409 Conflict errors
    retry: false,
    mutationFn: async (
      data: UsageEntryFormData & {
        unit_cost?: number;
        total_cost?: number;
        inventory_id?: string; // Optional: specific inventory record to use
      }
    ) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      // Get current user for tracking who created the usage record
      // Note: auth.users.id != public.users.id, need to look up by auth_id
      let userId: string | null = null;
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser?.id) {
          const { data: dbUser } = await supabase
            .from("users")
            .select("id")
            .eq("auth_id", authUser.id)
            .maybeSingle();
          userId = dbUser?.id || null;
        }
      } catch (userError) {
        // Non-critical - continue without user ID
        console.warn("Could not fetch user for created_by:", userError);
      }

      console.log("[useCreateMaterialUsage] Starting mutation with data:", {
        site_id: data.site_id,
        material_id: data.material_id,
        inventory_id: data.inventory_id,
        quantity: data.quantity,
      });

      // 1. Find the stock inventory record for this material
      // Build query to find matching inventory
      // Also select batch_code to check if it came from group stock
      let inventoryQuery = supabase
        .from("stock_inventory")
        .select("id, current_qty, avg_unit_cost, brand_id, batch_code")
        .eq("site_id", data.site_id)
        .eq("material_id", data.material_id)
        .gt("current_qty", 0);

      // If specific inventory_id provided, use it
      if (data.inventory_id) {
        inventoryQuery = supabase
          .from("stock_inventory")
          .select("id, current_qty, avg_unit_cost, brand_id, batch_code")
          .eq("id", data.inventory_id);
      } else if (data.brand_id) {
        // If brand specified, find that specific brand's stock
        inventoryQuery = inventoryQuery.eq("brand_id", data.brand_id);
      }

      console.log("[useCreateMaterialUsage] Fetching inventory...");
      const { data: inventory, error: inventoryError } = await withTimeout(
        inventoryQuery.maybeSingle(),
        DB_OPERATION_TIMEOUT,
        "Fetch inventory"
      ) as { data: any; error: any };
      console.log("[useCreateMaterialUsage] Inventory result:", { inventory, inventoryError });

      if (inventoryError) {
        throw new Error(`Failed to check stock: ${inventoryError.message}`);
      }

      // 2. Validate sufficient stock exists
      if (!inventory) {
        throw new Error("No stock available for this material. Please ensure material has been delivered and settled.");
      }

      if (inventory.current_qty < data.quantity) {
        throw new Error(
          `Insufficient stock. Available: ${inventory.current_qty}, Requested: ${data.quantity}`
        );
      }

      // 3. Calculate costs
      const unitCost = data.unit_cost || inventory.avg_unit_cost || 0;
      const totalCost = data.total_cost || (data.quantity * unitCost);

      // NOTE: Stock inventory update and stock_transaction creation are handled by
      // the database trigger 'trg_update_stock_on_usage' which fires on daily_material_usage insert.
      // This prevents duplicate transactions and ensures atomic updates.

      // 4. Create the daily usage record (trigger will update stock and create transaction)
      console.log("[useCreateMaterialUsage] Creating daily usage record...");
      const { data: result, error } = await withTimeout(
        supabase
          .from("daily_material_usage")
          .insert({
            site_id: data.site_id,
            usage_date: data.usage_date,
            material_id: data.material_id,
            brand_id: data.brand_id || inventory.brand_id || null,
            quantity: data.quantity,
            unit_cost: unitCost,
            total_cost: totalCost,
            section_id: data.section_id || null,
            work_description: data.work_description || null,
            created_by: userId,
          })
          .select()
          .single(),
        DB_OPERATION_TIMEOUT,
        "Create daily usage record"
      ) as { data: any; error: any };

      if (error) {
        // No manual rollback needed - the trigger only runs on successful insert
        throw error;
      }

      // 7. If inventory has batch_code (came from group stock), sync to batch_usage_records
      // This enables inter-site settlement tracking
      if (inventory.batch_code) {
        console.log("[useCreateMaterialUsage] Syncing to batch_usage_records for batch:", inventory.batch_code);

        try {
          // Use the database function record_batch_usage which handles everything:
          // - Validates remaining quantity
          // - Creates batch_usage_record
          // - Updates material_purchase_expenses quantities
          const usageDate = data.usage_date || new Date().toISOString().split("T")[0];

          const { data: batchUsageId, error: batchUsageError } = await supabase
            .rpc("record_batch_usage", {
              p_batch_ref_code: inventory.batch_code,
              p_usage_site_id: data.site_id,
              // Variant-aware RPC matches (material_id, brand_id) against the
              // batch's line items. Passing these keeps the brand on the batch
              // usage row instead of dropping it to NULL ("Brand not set").
              p_material_id: data.material_id,
              p_brand_id: data.brand_id || inventory.brand_id || null,
              p_quantity: data.quantity,
              p_usage_date: usageDate,
              p_work_description: data.work_description ?? undefined,
              p_created_by: userId ?? undefined,
            });

          if (batchUsageError) {
            // Log but don't fail - batch_usage is for inter-site settlement, not critical
            // Common errors: batch not found, insufficient quantity, completed batch
            console.warn("[useCreateMaterialUsage] Failed to create batch_usage_record via RPC:", batchUsageError.message);
          } else {
            console.log("[useCreateMaterialUsage] Created batch_usage_record via RPC, id:", batchUsageId);
          }
        } catch (batchSyncError) {
          // Non-critical - log but don't fail
          console.warn("[useCreateMaterialUsage] Error syncing to batch_usage_records:", batchSyncError);
        }
      }

      return result as DailyMaterialUsage;
    },
    onSuccess: (_, variables) => {
      const todayStr = dayjs().format("YYYY-MM-DD");
      queryClient.invalidateQueries({
        queryKey: queryKeys.materialUsage.bySite(variables.site_id),
        exact: false, // Match all queries starting with this key (including those with options)
      });
      queryClient.invalidateQueries({
        queryKey: [
          ...queryKeys.materialUsage.byDate(variables.site_id, todayStr),
          "summary",
        ],
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.materialStock.bySite(variables.site_id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.materialStock.lowStock(variables.site_id),
      });
      // Also invalidate stock transactions
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.materialStock.bySite(variables.site_id), "transactions"],
      });
      // Invalidate batch usage and inter-site settlement queries
      // to reflect the new usage in inter-site settlement page
      queryClient.invalidateQueries({
        queryKey: queryKeys.batchUsage.bySite(variables.site_id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.batchUsage.all,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.interSiteSettlements.all,
      });
    },
  });
}

/**
 * Bulk create material usage entries
 * Processes entries sequentially (DB trigger fires per INSERT)
 * Returns both successful and failed entries for partial success handling
 */
export function useBulkCreateMaterialUsage() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    retry: false, // Not idempotent
    mutationFn: async (
      entries: Array<{
        site_id: string; // Site where inventory lives (for DB trigger)
        usage_site_id?: string; // Actual site using material (for shared stock)
        usage_date: string;
        material_id: string;
        brand_id?: string;
        inventory_id: string;
        quantity: number;
        unit_cost?: number;
        total_cost?: number;
        work_description?: string;
        usage_group_id?: string; // Links FIFO-split records from same user action
      }>
    ) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      // Get current user for tracking
      // Note: daily_material_usage.created_by references public.users(id)
      // Note: batch_usage_records.created_by references auth.users(id)
      let userId: string | null = null;  // For daily_material_usage
      let authUserId: string | null = null;  // For batch_usage_records
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        authUserId = authUser?.id || null;  // Store auth.users.id for batch_usage_records
        if (authUser?.id) {
          const { data: dbUser } = await supabase
            .from("users")
            .select("id")
            .eq("auth_id", authUser.id)
            .maybeSingle();
          userId = dbUser?.id || null;  // Store public.users.id for daily_material_usage
        }
      } catch (userError) {
        console.warn("Could not fetch user for created_by:", userError);
      }

      const results: DailyMaterialUsage[] = [];
      const errors: { stockId: string; message: string }[] = [];
      const batchSyncWarnings: string[] = []; // Track batch sync issues

      // Process entries sequentially (DB trigger fires per INSERT)
      for (const entry of entries) {
        try {
          // 1. Fetch inventory to validate stock and get batch_code
          const { data: inventory, error: inventoryError } = await withTimeout(
            supabase
              .from("stock_inventory")
              .select("id, current_qty, avg_unit_cost, brand_id, batch_code")
              .eq("id", entry.inventory_id)
              .single(),
            DB_OPERATION_TIMEOUT,
            "Fetch inventory for bulk usage"
          ) as { data: any; error: any };

          if (inventoryError || !inventory) {
            errors.push({
              stockId: entry.inventory_id,
              message: `Failed to find inventory: ${inventoryError?.message || "Not found"}`,
            });
            continue;
          }

          // 2. Validate stock availability
          if (inventory.current_qty < entry.quantity) {
            errors.push({
              stockId: entry.inventory_id,
              message: `Insufficient stock. Available: ${inventory.current_qty}, Requested: ${entry.quantity}`,
            });
            continue;
          }

          // 3. Calculate costs
          const unitCost = entry.unit_cost || inventory.avg_unit_cost || 0;
          const totalCost = entry.total_cost || (entry.quantity * unitCost);

          // 4. For shared stock (batch_code exists), ONLY use batch_usage_records
          //    For own stock (no batch_code), use daily_material_usage
          if (inventory.batch_code) {
            // Shared stock: Insert directly to batch_usage_records and update stock manually
            try {
              // Fetch batch info
              const { data: batchInfo, error: batchError } = await (supabase as any)
                .from("material_purchase_expenses")
                .select("paying_site_id, site_id, site_group_id")
                .eq("ref_code", inventory.batch_code)
                .maybeSingle();

              if (batchError) {
                errors.push({
                  stockId: entry.inventory_id,
                  message: `Batch lookup failed: ${batchError.message}`,
                });
                continue;
              }

              if (!batchInfo?.site_group_id) {
                errors.push({
                  stockId: entry.inventory_id,
                  message: `No site_group_id for batch ${inventory.batch_code}`,
                });
                continue;
              }

              // Get material unit
              const { data: materialInfo } = await supabase
                .from("materials")
                .select("unit")
                .eq("id", entry.material_id)
                .single();

              const unit = materialInfo?.unit || "nos";
              const actualUsageSiteId = entry.usage_site_id || entry.site_id;
              const payingSiteId = batchInfo.paying_site_id || batchInfo.site_id;
              const isSelfUse = payingSiteId === actualUsageSiteId;

              // Insert into batch_usage_records
              const insertData: Record<string, unknown> = {
                batch_ref_code: inventory.batch_code,
                site_group_id: batchInfo.site_group_id,
                usage_site_id: actualUsageSiteId,
                material_id: entry.material_id,
                brand_id: entry.brand_id || inventory.brand_id || null,
                quantity: entry.quantity,
                unit: unit,
                unit_cost: unitCost,
                // total_cost is GENERATED ALWAYS AS (quantity * unit_cost) — do not insert explicitly
                usage_date: entry.usage_date,
                work_description: entry.work_description || null,
                is_self_use: isSelfUse,
                settlement_status: isSelfUse ? "self_use" : "pending",
                usage_group_id: entry.usage_group_id || null,
              };
              if (authUserId) {
                insertData.created_by = authUserId;
              }

              const { data: batchResult, error: batchInsertError } = await (supabase as any)
                .from("batch_usage_records")
                .insert(insertData)
                .select()
                .single();

              if (batchInsertError) {
                errors.push({
                  stockId: entry.inventory_id,
                  message: `Batch record insert failed: ${batchInsertError.message}`,
                });
                continue;
              }

              // Manually update stock inventory (since no trigger on batch_usage_records)
              // Also reduce total_weight proportionally to keep weightPerPiece consistent
              const stockUpdateData: Record<string, unknown> = {
                current_qty: inventory.current_qty - entry.quantity,
              };
              if (inventory.total_weight && inventory.current_qty > 0) {
                const weightPerPiece = inventory.total_weight / inventory.current_qty;
                stockUpdateData.total_weight = inventory.total_weight - (entry.quantity * weightPerPiece);
              }
              const { error: stockUpdateError } = await supabase
                .from("stock_inventory")
                .update(stockUpdateData)
                .eq("id", entry.inventory_id);

              if (stockUpdateError) {
                batchSyncWarnings.push(`Stock update failed for ${entry.inventory_id}: ${stockUpdateError.message}`);
              }

              // Create a compatible result object for tracking
              results.push({
                id: batchResult.id,
                site_id: entry.site_id,
                usage_date: entry.usage_date,
                material_id: entry.material_id,
                brand_id: entry.brand_id || inventory.brand_id || null,
                quantity: entry.quantity,
                unit_cost: unitCost,
                total_cost: batchResult.total_cost || (entry.quantity * unitCost),
                work_description: entry.work_description || null,
                created_by: userId,
                created_at: batchResult.created_at,
                updated_at: batchResult.updated_at,
              } as DailyMaterialUsage);

            } catch (batchError) {
              errors.push({
                stockId: entry.inventory_id,
                message: batchError instanceof Error ? batchError.message : "Batch sync failed",
              });
            }
          } else {
            // Own stock: Use daily_material_usage (trigger will update stock)
            const { data: result, error: insertError } = await withTimeout(
              supabase
                .from("daily_material_usage")
                .insert({
                  site_id: entry.site_id,
                  usage_date: entry.usage_date,
                  material_id: entry.material_id,
                  brand_id: entry.brand_id || inventory.brand_id || null,
                  quantity: entry.quantity,
                  unit_cost: unitCost,
                  total_cost: totalCost,
                  work_description: entry.work_description || null,
                  created_by: userId,
                  usage_group_id: entry.usage_group_id || null,
                })
                .select()
                .single(),
              DB_OPERATION_TIMEOUT,
              "Create bulk usage record"
            ) as { data: any; error: any };

            if (insertError) {
              errors.push({
                stockId: entry.inventory_id,
                message: `Failed to create usage: ${insertError.message}`,
              });
              continue;
            }

            results.push(result as DailyMaterialUsage);
          }
        } catch (err) {
          errors.push({
            stockId: entry.inventory_id,
            message: err instanceof Error ? err.message : "Unknown error",
          });
        }
      }

      // If all entries failed, throw an error
      if (results.length === 0 && errors.length > 0) {
        throw new Error(`All entries failed: ${errors.map((e) => e.message).join(", ")}`);
      }

      return {
        successful: results,
        failed: errors,
        batchSyncWarnings: batchSyncWarnings,
        totalCreated: results.length,
        totalFailed: errors.length,
      };
    },
    onSuccess: (result, variables) => {
      // Get unique site IDs from entries (both inventory sites and usage sites)
      const siteIds = new Set<string>();
      variables.forEach((v) => {
        siteIds.add(v.site_id); // Inventory owner site
        if (v.usage_site_id) siteIds.add(v.usage_site_id); // Actual usage site
      });
      const todayStr = dayjs().format("YYYY-MM-DD");

      siteIds.forEach((siteId) => {
        queryClient.invalidateQueries({
          queryKey: queryKeys.materialUsage.bySite(siteId),
          exact: false, // Match all queries starting with this key (including those with options)
        });
        queryClient.invalidateQueries({
          queryKey: [...queryKeys.materialUsage.byDate(siteId, todayStr), "summary"],
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.materialStock.bySite(siteId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.materialStock.lowStock(siteId),
        });
        queryClient.invalidateQueries({
          queryKey: [...queryKeys.materialStock.bySite(siteId), "transactions"],
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.batchUsage.bySite(siteId),
        });
      });

      queryClient.invalidateQueries({
        queryKey: queryKeys.batchUsage.all,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.interSiteSettlements.all,
      });
    },
  });
}

/**
 * Update a material usage entry with cascading updates
 * This function:
 * 1. Gets the original usage record
 * 2. Calculates quantity delta
 * 3. Updates stock inventory (restore or reduce based on delta)
 * 4. Creates adjustment stock transaction
 * 5. Updates batch_usage_records if from group stock
 * 6. Updates the usage record
 */
export function useUpdateMaterialUsage() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    retry: false, // Not idempotent - modifies stock
    mutationFn: async ({
      id,
      siteId,
      data,
    }: {
      id: string;
      siteId: string;
      data: { quantity: number; work_description?: string; brand_id?: string | null };
    }) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      // Get current user for tracking
      let userId: string | null = null;
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser?.id) {
          const { data: dbUser } = await supabase
            .from("users")
            .select("id")
            .eq("auth_id", authUser.id)
            .maybeSingle();
          userId = dbUser?.id || null;
        }
      } catch (userError) {
        console.warn("Could not fetch user for created_by:", userError);
      }

      // 1. Get the original usage record
      const { data: originalRecord, error: fetchError } = await supabase
        .from("daily_material_usage")
        .select("material_id, brand_id, quantity, unit_cost, usage_date, total_cost")
        .eq("id", id)
        .single();

      if (fetchError) {
        throw new Error(`Failed to fetch usage record: ${fetchError.message}`);
      }

      // 2. Calculate delta
      const originalQuantity = originalRecord.quantity;
      const newQuantity = data.quantity;
      const quantityDelta = newQuantity - originalQuantity;

      // If no quantity change, just update the record (description and/or brand).
      if (quantityDelta === 0) {
        const noDeltaPayload: Record<string, unknown> = {
          work_description: data.work_description,
          updated_at: new Date().toISOString(),
        };
        // Brand is reporting-only — set it only when the caller passed one.
        if (data.brand_id !== undefined) noDeltaPayload.brand_id = data.brand_id;

        const { data: result, error } = await supabase
          .from("daily_material_usage")
          .update(noDeltaPayload)
          .eq("id", id)
          .select()
          .single();

        if (error) throw error;
        return result as DailyMaterialUsage;
      }

      // 3. Find stock inventory record
      let inventoryQuery = supabase
        .from("stock_inventory")
        .select("id, current_qty, batch_code, pricing_mode, total_weight")
        .eq("site_id", siteId)
        .eq("material_id", originalRecord.material_id) as any;

      if (originalRecord.brand_id) {
        inventoryQuery = inventoryQuery.eq("brand_id", originalRecord.brand_id);
      } else {
        inventoryQuery = inventoryQuery.is("brand_id", null);
      }

      const { data: inventory, error: invError } = await inventoryQuery.maybeSingle();

      if (invError) {
        throw new Error(`Failed to find stock inventory: ${invError.message}`);
      }

      // 4. Validate stock if increasing quantity
      if (quantityDelta > 0 && inventory) {
        if (inventory.current_qty < quantityDelta) {
          throw new Error(
            `Not enough stock. Available: ${inventory.current_qty}, Needed: ${quantityDelta}`
          );
        }
      }

      // 5. Update stock inventory
      if (inventory) {
        const newStockQty = inventory.current_qty - quantityDelta; // Subtract delta (positive = reduce, negative = restore)

        // For per_kg items, proportionally adjust total_weight
        const updateData: Record<string, unknown> = {
          current_qty: newStockQty,
          updated_at: new Date().toISOString(),
        };

        if (inventory.pricing_mode === "per_kg" && inventory.total_weight && inventory.current_qty > 0) {
          const weightPerPiece = inventory.total_weight / inventory.current_qty;
          updateData.total_weight = Math.round((inventory.total_weight - quantityDelta * weightPerPiece) * 1000) / 1000;
        }

        const { error: updateStockError } = await supabase
          .from("stock_inventory")
          .update(updateData)
          .eq("id", inventory.id);

        if (updateStockError) {
          throw new Error(`Failed to update stock: ${updateStockError.message}`);
        }

        // 6. Create adjustment transaction
        const transactionType = quantityDelta > 0 ? "usage" : "adjustment";
        const transactionNotes = quantityDelta > 0
          ? `Usage increased from ${originalQuantity} to ${newQuantity}`
          : `Usage reduced from ${originalQuantity} to ${newQuantity} (restored ${Math.abs(quantityDelta)})`;

        await supabase.from("stock_transactions").insert({
          site_id: siteId,
          inventory_id: inventory.id,
          material_id: originalRecord.material_id,
          brand_id: originalRecord.brand_id,
          transaction_type: transactionType,
          quantity: -quantityDelta, // Negative for usage, positive for restore
          unit_cost: originalRecord.unit_cost,
          total_cost: Math.abs(quantityDelta) * (originalRecord.unit_cost || 0),
          transaction_date: new Date().toISOString(),
          notes: transactionNotes,
          created_by: userId,
        });

        // 7. Update batch_usage_records if group stock
        if (inventory.batch_code) {
          try {
            // Find and update the batch usage record
            const { error: batchUpdateError } = await supabase
              .from("batch_usage_records")
              .update({
                quantity: newQuantity,
                total_cost: newQuantity * (originalRecord.unit_cost || 0),
                updated_at: new Date().toISOString(),
              })
              .eq("batch_ref_code", inventory.batch_code)
              .eq("usage_site_id", siteId)
              .eq("material_id", originalRecord.material_id)
              .eq("usage_date", originalRecord.usage_date);

            if (batchUpdateError) {
              console.warn("Could not update batch_usage_record:", batchUpdateError);
            }
          } catch (batchError) {
            console.warn("Error updating batch usage:", batchError);
          }
        }
      }

      // 8. Update the usage record
      const newTotalCost = newQuantity * (originalRecord.unit_cost || 0);
      const updatePayload: Record<string, unknown> = {
        quantity: newQuantity,
        total_cost: newTotalCost,
        work_description: data.work_description,
        updated_at: new Date().toISOString(),
      };
      if (data.brand_id !== undefined) updatePayload.brand_id = data.brand_id;

      const { data: result, error } = await supabase
        .from("daily_material_usage")
        .update(updatePayload)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return result as DailyMaterialUsage;
    },
    onSuccess: (result) => {
      const todayStr = dayjs().format("YYYY-MM-DD");
      // Invalidate all related caches
      queryClient.invalidateQueries({
        queryKey: queryKeys.materialUsage.bySite(result.site_id),
        exact: false, // Match all queries starting with this key (including those with options)
      });
      queryClient.invalidateQueries({
        queryKey: [
          ...queryKeys.materialUsage.byDate(result.site_id, todayStr),
          "summary",
        ],
      });
      // Stock caches
      queryClient.invalidateQueries({
        queryKey: queryKeys.materialStock.bySite(result.site_id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.materialStock.lowStock(result.site_id),
      });
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.materialStock.bySite(result.site_id), "transactions"],
      });
      // Batch usage caches
      queryClient.invalidateQueries({
        queryKey: queryKeys.batchUsage.bySite(result.site_id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.batchUsage.all,
      });
      // Settlement caches
      queryClient.invalidateQueries({
        queryKey: queryKeys.interSiteSettlements.all,
      });
      // Hub surfaces (usage-log list, stock block, group usage summary).
      queryClient.invalidateQueries({ queryKey: ["usage-history"] });
      queryClient.invalidateQueries({ queryKey: ["stock-inventory"] });
      queryClient.invalidateQueries({ queryKey: ["batch-usage-summary"] });
      queryClient.invalidateQueries({ queryKey: ["batch-variant-summary"] });
      // Usage Ledger pages and UsageDetailDrawer
      queryClient.invalidateQueries({ queryKey: ["material-usage-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["usage-ledger-detail"] });
    },
  });
}

/**
 * Delete a material usage entry
 * This function:
 * 1. Gets the usage record details
 * 2. Restores the quantity back to stock inventory
 * 3. Creates a reversal stock transaction
 * 4. Deletes the usage record
 */
export function useDeleteMaterialUsage() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    retry: false, // Not idempotent - restores stock
    mutationFn: async ({
      id,
      siteId,
      is_shared_usage = false,
    }: {
      id: string;
      siteId: string;
      is_shared_usage?: boolean;
    }) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      // Get current user for tracking who made the adjustment
      // Note: auth.users.id != public.users.id, need to look up by auth_id
      let userId: string | null = null;
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser?.id) {
          const { data: dbUser } = await supabase
            .from("users")
            .select("id")
            .eq("auth_id", authUser.id)
            .maybeSingle();
          userId = dbUser?.id || null;
        }
      } catch (userError) {
        // Non-critical - continue without user ID
        console.warn("Could not fetch user for created_by:", userError);
      }

      // 1. Get the usage record to know quantity to restore
      // For batch usage, fetch from batch_usage_records; otherwise from daily_material_usage
      let usageRecord: any;
      let fetchError: any;

      if (is_shared_usage) {
        // Fetch from batch_usage_records (include site_group_id for cache invalidation)
        const { data, error } = await supabase
          .from("batch_usage_records")
          .select("material_id, brand_id, quantity, unit_cost, usage_date, batch_ref_code, usage_site_id, site_group_id")
          .eq("id", id)
          .single();
        usageRecord = data;
        fetchError = error;
      } else {
        // Fetch from daily_material_usage (include inventory_id for precise stock lookup)
        const { data, error } = await supabase
          .from("daily_material_usage")
          .select("material_id, brand_id, quantity, unit_cost, usage_date, inventory_id")
          .eq("id", id)
          .single();
        usageRecord = data;
        fetchError = error;
      }

      if (fetchError) {
        throw new Error(`Failed to fetch usage record: ${fetchError.message}`);
      }

      // 2. Find the stock inventory record to restore quantity
      // Use precise identifiers to avoid .maybeSingle() errors when multiple records exist
      let inventory: { id: string; current_qty: number; batch_code: string | null; pricing_mode: string | null; total_weight: number | null } | null = null;

      if (is_shared_usage && usageRecord.batch_ref_code) {
        // Shared usage: match by batch_code for the exact batch inventory record
        const { data } = await (supabase
          .from("stock_inventory")
          .select("id, current_qty, batch_code, pricing_mode, total_weight")
          .eq("site_id", siteId)
          .eq("material_id", usageRecord.material_id)
          .eq("batch_code", usageRecord.batch_ref_code) as any)
          .maybeSingle();
        inventory = data;
      } else if (!is_shared_usage && usageRecord.inventory_id) {
        // Non-shared with FIFO inventory_id: direct lookup by ID
        const { data } = await (supabase
          .from("stock_inventory")
          .select("id, current_qty, batch_code, pricing_mode, total_weight")
          .eq("id", usageRecord.inventory_id) as any)
          .maybeSingle();
        inventory = data;
      } else {
        // Legacy fallback: material + brand + site
        // Use array query with limit(1) instead of maybeSingle() to avoid error on multiple matches
        let inventoryQuery = supabase
          .from("stock_inventory")
          .select("id, current_qty, batch_code, pricing_mode, total_weight")
          .eq("site_id", siteId)
          .eq("material_id", usageRecord.material_id) as any;

        if (usageRecord.brand_id) {
          inventoryQuery = inventoryQuery.eq("brand_id", usageRecord.brand_id);
        } else {
          inventoryQuery = inventoryQuery.is("brand_id", null);
        }

        const { data } = await inventoryQuery.order("created_at", { ascending: true }).limit(1);
        inventory = data?.[0] || null;
      }

      if (inventory) {
        // 3. Restore quantity to inventory
        const restoredQty = inventory.current_qty + usageRecord.quantity;

        // For per_kg items, proportionally restore total_weight
        const updateData: Record<string, unknown> = {
          current_qty: restoredQty,
          updated_at: new Date().toISOString(),
        };

        if (inventory.pricing_mode === "per_kg" && inventory.total_weight && inventory.current_qty > 0) {
          const weightPerPiece = inventory.total_weight / inventory.current_qty;
          updateData.total_weight = Math.round((inventory.total_weight + usageRecord.quantity * weightPerPiece) * 1000) / 1000;
        }

        await supabase
          .from("stock_inventory")
          .update(updateData)
          .eq("id", inventory.id);

        // 4. Create reversal transaction
        await supabase
          .from("stock_transactions")
          .insert({
            site_id: siteId,
            inventory_id: inventory.id,
            transaction_type: "adjustment",
            transaction_date: new Date().toISOString().split("T")[0],
            quantity: usageRecord.quantity, // Positive to add back
            unit_cost: usageRecord.unit_cost || 0,
            total_cost: (usageRecord.unit_cost || 0) * usageRecord.quantity,
            notes: `Restored from deleted usage record (${usageRecord.usage_date})`,
            created_by: userId,
          });

        // 4.5 Delete corresponding batch_usage_record if inventory came from group stock (for non-batch deletes)
        if (inventory.batch_code && !is_shared_usage) {
          try {
            const { error: batchUsageDeleteError } = await (supabase as any)
              .from("batch_usage_records")
              .delete()
              .eq("batch_ref_code", inventory.batch_code)
              .eq("usage_site_id", siteId)
              .eq("material_id", usageRecord.material_id)
              .eq("quantity", usageRecord.quantity)
              .eq("usage_date", usageRecord.usage_date);

            if (batchUsageDeleteError) {
              console.warn("Failed to delete batch_usage_record:", batchUsageDeleteError);
            }
          } catch (err) {
            console.warn("Error deleting batch_usage_record:", err);
          }
        }
      }

      // 5. For batch usage records, check batch status before delete (for self-use cleanup)
      // NOTE: Do NOT manually update remaining_qty here — the DB trigger
      // (update_batch_quantities_on_usage_change) recalculates all batch fields
      // (used_qty, remaining_qty, self_used_qty, self_used_amount, status) automatically
      let batchWasCompleted = false;
      let batchPayingSiteId: string | null = null;
      if (is_shared_usage && usageRecord.batch_ref_code) {
        try {
          const { data: batchCheck } = await supabase
            .from("material_purchase_expenses")
            .select("status, paying_site_id, site_id")
            .eq("ref_code", usageRecord.batch_ref_code)
            .single();
          batchWasCompleted = batchCheck?.status === "completed";
          batchPayingSiteId = (batchCheck as any)?.paying_site_id || batchCheck?.site_id || null;
        } catch (err) {
          console.warn("Error checking batch status:", err);
        }
      }

      // 6. Delete the usage record from the appropriate table
      if (is_shared_usage) {
        const { error } = await supabase
          .from("batch_usage_records")
          .delete()
          .eq("id", id);

        if (error) throw error;

        // If batch was completed and now re-opened by trigger, clean up self-use artifacts
        if (batchWasCompleted && usageRecord.batch_ref_code) {
          try {
            const { data: batchAfter } = await supabase
              .from("material_purchase_expenses")
              .select("status")
              .eq("ref_code", usageRecord.batch_ref_code)
              .single();

            if (batchAfter && batchAfter.status !== "completed" && batchPayingSiteId) {
              // Delete auto-created self-use expenses
              const { data: selfUseExpenses } = await (supabase as any)
                .from("material_purchase_expenses")
                .select("id")
                .eq("original_batch_code", usageRecord.batch_ref_code)
                .eq("settlement_reference", "SELF-USE")
                .eq("site_id", batchPayingSiteId);

              if (selfUseExpenses && selfUseExpenses.length > 0) {
                for (const exp of selfUseExpenses) {
                  await (supabase as any)
                    .from("material_purchase_expenses")
                    .delete()
                    .eq("id", exp.id);
                }
              }

              // Delete auto-created self-use batch_usage_records (trigger will recalculate)
              await (supabase as any)
                .from("batch_usage_records")
                .delete()
                .eq("batch_ref_code", usageRecord.batch_ref_code)
                .eq("is_self_use", true)
                .eq("work_description", "Self-use (batch completion)");
            }
          } catch (err) {
            console.warn("Error cleaning up self-use artifacts:", err);
          }
        }
      } else {
        const { error } = await supabase
          .from("daily_material_usage")
          .delete()
          .eq("id", id);

        if (error) throw error;
      }

      return { id, siteId, siteGroupId: usageRecord.site_group_id || null };
    },
    onSuccess: async (result) => {
      const todayStr = dayjs().format("YYYY-MM-DD");

      // For shared usage records, invalidate cache for ALL sites in the group
      if (result.siteGroupId) {
        try {
          // Get all sites in the group
          const { data: groupSites } = await supabase
            .from("site_groups")
            .select("site_id")
            .eq("group_id", result.siteGroupId);

          const siteIds = groupSites?.map((gs: any) => gs.site_id) || [result.siteId];

          // Invalidate material usage cache for all sites in the group
          siteIds.forEach((siteId: string) => {
            queryClient.invalidateQueries({
              queryKey: queryKeys.materialUsage.bySite(siteId),
              exact: false,
            });
            queryClient.invalidateQueries({
              queryKey: [
                ...queryKeys.materialUsage.byDate(siteId, todayStr),
                "summary",
              ],
            });
            queryClient.invalidateQueries({
              queryKey: queryKeys.materialStock.bySite(siteId),
            });
            queryClient.invalidateQueries({
              queryKey: queryKeys.batchUsage.bySite(siteId),
            });
          });
        } catch (error) {
          console.warn("Failed to invalidate group caches:", error);
          // Fallback to invalidating only current site
          queryClient.invalidateQueries({
            queryKey: queryKeys.materialUsage.bySite(result.siteId),
            exact: false,
          });
        }
      } else {
        // For non-shared records, only invalidate current site
        queryClient.invalidateQueries({
          queryKey: queryKeys.materialUsage.bySite(result.siteId),
          exact: false,
        });
        queryClient.invalidateQueries({
          queryKey: [
            ...queryKeys.materialUsage.byDate(result.siteId, todayStr),
            "summary",
          ],
        });
      }

      // Also invalidate stock queries since we restored quantity
      // This covers useSiteStock, useCompletedStock, lowStock, transactions, etc.
      queryClient.invalidateQueries({
        queryKey: queryKeys.materialStock.bySite(result.siteId),
        exact: false,
      });
      // Invalidate batch usage and inter-site settlement queries
      queryClient.invalidateQueries({
        queryKey: queryKeys.batchUsage.all,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.interSiteSettlements.all,
      });
      // Hub surfaces (usage-log list, stock block, group usage summary).
      queryClient.invalidateQueries({ queryKey: ["usage-history"] });
      queryClient.invalidateQueries({ queryKey: ["stock-inventory"] });
      queryClient.invalidateQueries({ queryKey: ["batch-usage-summary"] });
      queryClient.invalidateQueries({ queryKey: ["batch-variant-summary"] });
      // Usage Ledger pages and UsageDetailDrawer
      queryClient.invalidateQueries({ queryKey: ["material-usage-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["usage-ledger-detail"] });
    },
  });
}

/**
 * Verify a usage entry
 */
export function useVerifyMaterialUsage() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({ id, userId }: { id: string; userId: string }) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      const { data: result, error } = await supabase
        .from("daily_material_usage")
        .update({
          is_verified: true,
          verified_by: userId,
          verified_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return result as DailyMaterialUsage;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: ["materialUsage", result.site_id],
      });
    },
  });
}

// ============================================
// FIFO MATERIAL USAGE (Consolidated / Material-Level)
// ============================================

/**
 * Create material usage from consolidated (material-level) selection.
 * Accepts pre-computed FIFO BatchAllocation[] and processes each allocation:
 *
 * - Own stock (no batch_code): Insert daily_material_usage with inventory_id
 *   → Updated DB trigger deducts from the correct batch
 * - Shared stock (batch_code): Insert batch_usage_records + manual stock reduction
 *   → Also insert daily_material_usage for site usage history
 */
export function useCreateMaterialUsageFIFO() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    retry: false,
    mutationFn: async (data: {
      siteId: string;
      usageDate: string;
      usageDateEnd?: string;
      workDescription?: string;
      sectionId?: string;
      allocations: BatchAllocation[];
    }) => {
      await ensureFreshSession();

      // Get user IDs
      let userId: string | null = null;
      let authUserId: string | null = null;
      try {
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();
        authUserId = authUser?.id || null;
        if (authUser?.id) {
          const { data: dbUser } = await supabase
            .from("users")
            .select("id")
            .eq("auth_id", authUser.id)
            .maybeSingle();
          userId = dbUser?.id || null;
        }
      } catch (userError) {
        console.warn("Could not fetch user for created_by:", userError);
      }

      const results: DailyMaterialUsage[] = [];
      const errors: { inventoryId: string; message: string }[] = [];
      const batchSyncWarnings: string[] = [];

      // Generate a single group ID for all FIFO allocations from this user action
      const usageGroupId = crypto.randomUUID();

      for (const alloc of data.allocations) {
        try {
          // Fetch fresh inventory state for validation
          const { data: inventory, error: invErr } = await withTimeout(
            supabase
              .from("stock_inventory")
              .select(
                "id, current_qty, avg_unit_cost, brand_id, batch_code, material_id, site_id, pricing_mode, total_weight"
              )
              .eq("id", alloc.inventory_id)
              .single(),
            DB_OPERATION_TIMEOUT,
            "Fetch inventory for FIFO allocation"
          ) as { data: any; error: any };

          if (invErr || !inventory) {
            errors.push({
              inventoryId: alloc.inventory_id,
              message: `Inventory not found: ${invErr?.message || "Not found"}`,
            });
            continue;
          }

          if (inventory.current_qty < alloc.quantity) {
            errors.push({
              inventoryId: alloc.inventory_id,
              message: `Insufficient stock. Available: ${inventory.current_qty}, Requested: ${alloc.quantity}`,
            });
            continue;
          }

          if (alloc.is_shared && inventory.batch_code) {
            // ========================
            // SHARED STOCK PATH
            // ========================
            // Insert batch_usage_records + manually update stock_inventory
            // (Same pattern as useBulkCreateMaterialUsage shared stock path)

            // Fetch batch info for settlement tracking
            const { data: batchInfo, error: batchError } = await (
              supabase as any
            )
              .from("material_purchase_expenses")
              .select("paying_site_id, site_id, site_group_id")
              .eq("ref_code", inventory.batch_code)
              .maybeSingle();

            if (batchError || !batchInfo?.site_group_id) {
              errors.push({
                inventoryId: alloc.inventory_id,
                message: `Batch lookup failed: ${batchError?.message || "No site_group_id"}`,
              });
              continue;
            }

            // Get material unit
            const { data: materialInfo } = await supabase
              .from("materials")
              .select("unit")
              .eq("id", alloc.material_id)
              .single();

            const unit = materialInfo?.unit || "nos";
            const payingSiteId =
              batchInfo.paying_site_id || batchInfo.site_id;
            const isSelfUse = payingSiteId === data.siteId;

            // Insert batch_usage_records
            const insertData: Record<string, unknown> = {
              batch_ref_code: inventory.batch_code,
              site_group_id: batchInfo.site_group_id,
              usage_site_id: data.siteId,
              material_id: alloc.material_id,
              brand_id: alloc.brand_id || inventory.brand_id || null,
              quantity: alloc.quantity,
              unit: unit,
              unit_cost: alloc.unit_cost,
              usage_date: data.usageDate,
              usage_date_end: data.usageDateEnd ?? null,
              work_description: data.workDescription || null,
              is_self_use: isSelfUse,
              settlement_status: isSelfUse ? "self_use" : "pending",
              usage_group_id: usageGroupId,
            };
            if (authUserId) {
              insertData.created_by = authUserId;
            }

            const { data: batchResult, error: batchInsertError } = await (
              supabase as any
            )
              .from("batch_usage_records")
              .insert(insertData)
              .select()
              .single();

            if (batchInsertError) {
              errors.push({
                inventoryId: alloc.inventory_id,
                message: `Batch record insert failed: ${batchInsertError.message}`,
              });
              continue;
            }

            // Manually update stock_inventory (no trigger on batch_usage_records)
            const stockUpdateData: Record<string, unknown> = {
              current_qty: inventory.current_qty - alloc.quantity,
              last_issued_date: data.usageDate,
              updated_at: new Date().toISOString(),
            };
            if (inventory.total_weight && inventory.current_qty > 0) {
              const weightPerPiece =
                inventory.total_weight / inventory.current_qty;
              stockUpdateData.total_weight = Math.round(
                (inventory.total_weight - alloc.quantity * weightPerPiece) *
                  1000
              ) / 1000;
            }
            const { error: stockUpdateError } = await supabase
              .from("stock_inventory")
              .update(stockUpdateData)
              .eq("id", alloc.inventory_id);

            if (stockUpdateError) {
              batchSyncWarnings.push(
                `Stock update failed for ${alloc.inventory_id}: ${stockUpdateError.message}`
              );
            }

            // Also create stock_transaction for audit trail
            await supabase.from("stock_transactions").insert({
              site_id: data.siteId,
              inventory_id: alloc.inventory_id,
              transaction_type: "usage",
              transaction_date: data.usageDate,
              quantity: -alloc.quantity,
              unit_cost: alloc.unit_cost,
              total_cost: alloc.total_cost,
              reference_type: "batch_usage_records",
              reference_id: batchResult.id,
              section_id: data.sectionId || null,
              created_by: userId,
            });

            // Create a compatible result for tracking
            results.push({
              id: batchResult.id,
              site_id: data.siteId,
              usage_date: data.usageDate,
              material_id: alloc.material_id,
              brand_id: alloc.brand_id || inventory.brand_id || null,
              quantity: alloc.quantity,
              unit_cost: alloc.unit_cost,
              total_cost:
                batchResult.total_cost || alloc.total_cost,
              work_description: data.workDescription || null,
              created_by: userId,
              created_at: batchResult.created_at,
              updated_at: batchResult.updated_at,
            } as DailyMaterialUsage);
          } else {
            // ========================
            // OWN STOCK PATH
            // ========================
            // Insert daily_material_usage with inventory_id
            // → Updated trigger deducts from the specific batch

            const { data: result, error: insertError } = await withTimeout(
              supabase
                .from("daily_material_usage")
                .insert({
                  site_id: data.siteId,
                  usage_date: data.usageDate,
                  usage_date_end: data.usageDateEnd ?? null,
                  material_id: alloc.material_id,
                  brand_id: alloc.brand_id || inventory.brand_id || null,
                  quantity: alloc.quantity,
                  unit_cost: alloc.unit_cost,
                  total_cost: alloc.total_cost,
                  section_id: data.sectionId || null,
                  work_description: data.workDescription || null,
                  inventory_id: alloc.inventory_id,
                  created_by: userId,
                  usage_group_id: usageGroupId,
                })
                .select()
                .single(),
              DB_OPERATION_TIMEOUT,
              "Create FIFO usage record"
            ) as { data: any; error: any };

            if (insertError) {
              errors.push({
                inventoryId: alloc.inventory_id,
                message: `Failed to create usage: ${insertError.message}`,
              });
              continue;
            }

            results.push(result as DailyMaterialUsage);

            // If own stock has batch_code (self-paid group purchase), sync to batch_usage_records
            if (inventory.batch_code) {
              try {
                const { error: batchUsageError } = await supabase.rpc(
                  "record_batch_usage",
                  {
                    p_batch_ref_code: inventory.batch_code,
                    p_usage_site_id: data.siteId,
                    p_quantity: alloc.quantity,
                    p_usage_date: data.usageDate,
                    p_work_description: data.workDescription ?? undefined,
                    p_created_by: authUserId ?? undefined,
                  }
                );
                if (batchUsageError) {
                  batchSyncWarnings.push(
                    `Batch sync for ${inventory.batch_code}: ${batchUsageError.message}`
                  );
                }
              } catch (batchSyncError) {
                batchSyncWarnings.push(
                  `Batch sync error: ${batchSyncError instanceof Error ? batchSyncError.message : "Unknown"}`
                );
              }
            }
          }
        } catch (err) {
          errors.push({
            inventoryId: alloc.inventory_id,
            message: err instanceof Error ? err.message : "Unknown error",
          });
        }
      }

      if (results.length === 0 && errors.length > 0) {
        throw new Error(
          `All allocations failed: ${errors.map((e) => e.message).join(", ")}`
        );
      }

      return {
        successful: results,
        failed: errors,
        batchSyncWarnings,
        totalCreated: results.length,
        totalFailed: errors.length,
      };
    },
    onSuccess: (_, variables) => {
      const todayStr = dayjs().format("YYYY-MM-DD");
      const siteId = variables.siteId;

      queryClient.invalidateQueries({
        queryKey: queryKeys.materialUsage.bySite(siteId),
        exact: false,
      });
      queryClient.invalidateQueries({
        queryKey: [
          ...queryKeys.materialUsage.byDate(siteId, todayStr),
          "summary",
        ],
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.materialStock.bySite(siteId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.materialStock.lowStock(siteId),
      });
      queryClient.invalidateQueries({
        queryKey: [
          ...queryKeys.materialStock.bySite(siteId),
          "transactions",
        ],
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.batchUsage.bySite(siteId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.batchUsage.all,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.interSiteSettlements.all,
      });
    },
  });
}
