"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient, ensureFreshSession } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/cache/keys";
import { wrapQueryFn } from "@/lib/utils/timeout";
import type { Database } from "@/types/database.types";

type TeaShopAccount = Database["public"]["Tables"]["tea_shop_accounts"]["Row"];
type TeaShopGroupEntry = Database["public"]["Tables"]["tea_shop_group_entries"]["Row"];
type TeaShopGroupAllocation = Database["public"]["Tables"]["tea_shop_group_allocations"]["Row"];
type TeaShopGroupSettlement = Database["public"]["Tables"]["tea_shop_group_settlements"]["Row"];
type TeaShopGroupSettlementAllocation = Database["public"]["Tables"]["tea_shop_group_settlement_allocations"]["Row"];

// Extended types - these might need to be defined if they don't exist in database
interface TeaShopGroupEntryWithAllocations extends TeaShopGroupEntry {
  allocations?: TeaShopGroupAllocation[];
}
interface TeaShopGroupAllocationWithSite extends TeaShopGroupAllocation {
  site?: { id: string; name: string };
}
interface SiteAttendanceData {
  siteId: string;
  siteName: string;
  totalCount: number;
  namedLaborerCount: number;
  marketLaborerCount: number;
  percentage: number;
  allocatedAmount: number;
}
interface LaborGroupPercentageSplit {
  daily: number;
  contract: number;
  market: number;
}

// =============================================================================
// GROUP TEA SHOP ACCOUNT
// =============================================================================

/**
 * Fetch the tea shop account for a site group
 */
export function useGroupTeaShopAccount(siteGroupId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: siteGroupId
      ? queryKeys.groupTeaShop.byGroup(siteGroupId)
      : ["group-tea-shop", "account"],
    queryFn: wrapQueryFn(async () => {
      if (!siteGroupId) return null;

      const { data, error } = await (supabase as any)
        .from("tea_shop_accounts")
        .select("*")
        .eq("site_group_id", siteGroupId)
        .eq("is_group_shop", true)
        .eq("is_active", true)
        .maybeSingle();

      if (error) throw error;
      return data as TeaShopAccount | null;
    }, { operationName: "useGroupTeaShopAccount" }),
    enabled: !!siteGroupId,
  });
}

// =============================================================================
// GROUP TEA SHOP ENTRIES
// =============================================================================

/**
 * Fetch group tea shop entries for a site group
 */
export function useGroupTeaShopEntries(
  siteGroupId: string | undefined,
  options?: { dateFrom?: string; dateTo?: string }
) {
  const supabase = createClient();

  return useQuery({
    queryKey: siteGroupId
      ? [...queryKeys.groupTeaShop.entries(siteGroupId), options]
      : ["group-tea-shop", "entries"],
    queryFn: wrapQueryFn(async () => {
      if (!siteGroupId) return [];

      let query = (supabase as any)
        .from("tea_shop_group_entries")
        .select(`
          *,
          allocations:tea_shop_group_allocations(
            *,
            site:sites(id, name)
          )
        `)
        .eq("site_group_id", siteGroupId)
        .order("date", { ascending: false });

      if (options?.dateFrom) {
        query = query.gte("date", options.dateFrom);
      }
      if (options?.dateTo) {
        query = query.lte("date", options.dateTo);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as TeaShopGroupEntryWithAllocations[];
    }, { operationName: "useGroupTeaShopEntries" }),
    enabled: !!siteGroupId,
  });
}

/**
 * Fetch a single group entry with allocations
 * This queries tea_shop_entries (with is_group_entry=true) and tea_shop_entry_allocations
 */
export function useGroupTeaShopEntry(entryId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: entryId
      ? ["group-tea-shop", "entry", entryId]
      : ["group-tea-shop", "entry"],
    queryFn: async () => {
      if (!entryId) return null;

      // Fetch entry from tea_shop_entries
      const { data: entry, error: entryError } = await (supabase as any)
        .from("tea_shop_entries")
        .select("*")
        .eq("id", entryId)
        .single();

      if (entryError) throw entryError;
      if (!entry) return null;

      // Fetch allocations from tea_shop_entry_allocations
      const { data: allocations, error: allocError } = await (supabase as any)
        .from("tea_shop_entry_allocations")
        .select("*, site:sites(id, name)")
        .eq("entry_id", entryId);

      if (allocError) {
        console.warn("Error fetching allocations:", allocError.message);
      }

      // Transform to the expected format
      const transformedAllocations = (allocations || []).map((alloc: any) => ({
        id: alloc.id,
        group_entry_id: entryId,
        site_id: alloc.site_id,
        site: alloc.site,
        // Use worker_count for attendance_count
        named_laborer_count: alloc.worker_count || 0,
        market_laborer_count: 0,
        attendance_count: alloc.worker_count || 0,
        allocation_percentage: alloc.allocation_percentage,
        allocated_amount: alloc.allocated_amount,
      }));

      return {
        id: entry.id,
        tea_shop_id: entry.tea_shop_id,
        site_group_id: entry.site_group_id || null,
        date: entry.date,
        total_amount: entry.total_amount,
        is_percentage_override: entry.is_percentage_override || false,
        percentage_split: entry.percentage_split || null,
        notes: entry.notes,
        entered_by: entry.entered_by,
        entered_by_user_id: entry.entered_by_user_id,
        created_at: entry.created_at,
        updated_at: entry.updated_at,
        allocations: transformedAllocations,
      } as TeaShopGroupEntryWithAllocations;
    },
    enabled: !!entryId,
  });
}

// =============================================================================
// GROUP ATTENDANCE FOR PERCENTAGE CALCULATION
// =============================================================================

/**
 * Fetch attendance counts for all sites in a group on a specific date
 * Used for auto-calculating percentage split
 */
export function useGroupAttendanceCounts(
  siteGroupId: string | undefined,
  date: string | undefined
) {
  const supabase = createClient();

  return useQuery({
    queryKey:
      siteGroupId && date
        ? queryKeys.groupTeaShop.attendance(siteGroupId, date)
        : ["group-tea-shop", "attendance"],
    queryFn: async (): Promise<SiteAttendanceData[]> => {
      if (!siteGroupId || !date) return [];

      // Get sites in the group
      const { data: sites, error: sitesError } = await (supabase as any)
        .from("sites")
        .select("id, name")
        .eq("site_group_id", siteGroupId)
        .order("name");

      if (sitesError) throw sitesError;
      if (!sites || sites.length === 0) return [];

      // Get attendance for each site
      const attendanceData: SiteAttendanceData[] = [];

      for (const site of sites) {
        // Get named laborer count
        const { data: namedData } = await (supabase as any)
          .from("daily_attendance")
          .select("id", { count: "exact" })
          .eq("site_id", site.id)
          .eq("date", date)
          .eq("is_deleted", false);

        // Get market laborer count
        const { data: marketData } = await (supabase as any)
          .from("market_laborer_attendance")
          .select("count")
          .eq("site_id", site.id)
          .eq("date", date);

        const namedCount = namedData?.length || 0;
        const marketCount =
          marketData?.reduce(
            (sum: number, m: { count: number }) => sum + (m.count || 0),
            0
          ) || 0;

        attendanceData.push({
          siteId: site.id,
          siteName: site.name,
          namedLaborerCount: namedCount,
          marketLaborerCount: marketCount,
          totalCount: namedCount + marketCount,
          percentage: 0, // Will be calculated
          allocatedAmount: 0, // Will be calculated
        });
      }

      // Calculate percentages
      const totalWorkers = attendanceData.reduce(
        (sum, s) => sum + s.totalCount,
        0
      );

      if (totalWorkers > 0) {
        attendanceData.forEach((site) => {
          site.percentage = Math.round((site.totalCount / totalWorkers) * 100);
        });

        // Adjust to ensure sum is 100
        const totalPercentage = attendanceData.reduce(
          (sum, s) => sum + s.percentage,
          0
        );
        if (totalPercentage !== 100 && attendanceData.length > 0) {
          // Add remainder to the site with the most workers
          const maxSite = attendanceData.reduce((max, s) =>
            s.totalCount > max.totalCount ? s : max
          );
          maxSite.percentage += 100 - totalPercentage;
        }
      } else {
        // Equal split if no attendance
        const equalPercentage = Math.floor(100 / attendanceData.length);
        attendanceData.forEach((site, index) => {
          site.percentage =
            index === 0
              ? 100 - equalPercentage * (attendanceData.length - 1)
              : equalPercentage;
        });
      }

      return attendanceData;
    },
    enabled: !!siteGroupId && !!date,
  });
}

// =============================================================================
// CREATE GROUP ENTRY
// =============================================================================

interface CreateGroupEntryData {
  teaShopId: string;
  siteGroupId: string;
  date: string;
  totalAmount: number;
  allocations: {
    siteId: string;
    namedLaborerCount: number;
    marketLaborerCount: number;
    percentage: number;
    amount: number;
  }[];
  isPercentageOverride?: boolean;
  percentageSplit?: LaborGroupPercentageSplit;
  notes?: string;
  enteredBy?: string;
  enteredByUserId?: string;
}

export function useCreateGroupTeaShopEntry() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (data: CreateGroupEntryData) => {
      await ensureFreshSession();

      // Create the entry in tea_shop_entries with is_group_entry = true
      const { data: entry, error: entryError } = await (supabase as any)
        .from("tea_shop_entries")
        .insert({
          tea_shop_id: data.teaShopId,
          site_group_id: data.siteGroupId,
          site_id: null, // Group entries don't have a single site
          date: data.date,
          amount: data.totalAmount, // Required NOT NULL field
          total_amount: data.totalAmount,
          amount_paid: 0,
          is_fully_paid: false,
          is_group_entry: true,
          percentage_split: data.percentageSplit || null,
          notes: data.notes || null,
          entered_by: data.enteredBy || null,
          entered_by_user_id: data.enteredByUserId || null,
        })
        .select()
        .single();

      if (entryError) throw entryError;

      // Create allocations in tea_shop_entry_allocations
      const allocationsToInsert = data.allocations.map((alloc) => ({
        entry_id: entry.id,
        site_id: alloc.siteId,
        worker_count: alloc.namedLaborerCount + alloc.marketLaborerCount,
        allocation_percentage: alloc.percentage,
        allocated_amount: alloc.amount,
      }));

      const { error: allocError } = await (supabase as any)
        .from("tea_shop_entry_allocations")
        .insert(allocationsToInsert);

      if (allocError) throw allocError;

      return entry as TeaShopGroupEntry;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.groupTeaShop.entries(variables.siteGroupId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.groupTeaShop.pending(variables.siteGroupId),
      });
      // Invalidate attendance cache to refresh table with new allocations
      queryClient.invalidateQueries({
        queryKey: ['attendance'],
      });
    },
  });
}

// =============================================================================
// HELPER: Full Waterfall Recalculation
// =============================================================================

/**
 * Recalculates payment allocation for ALL entries in a site group from scratch.
 * This ensures correct waterfall allocation from oldest to newest entry
 * whenever any entry is modified.
 *
 * Steps:
 * 1. Get total amount paid from ALL settlement tables (group + individual)
 * 2. Reset all entries' payment status
 * 3. Re-apply total paid using waterfall (oldest first)
 */
async function recalculateWaterfallForGroup(
  supabase: any,
  siteGroupId: string
): Promise<void> {
  console.log("[Waterfall] Starting recalculation for siteGroupId:", siteGroupId);
  if (!siteGroupId) {
    console.log("[Waterfall] No siteGroupId provided, skipping");
    return;
  }

  // 1a. Get total from GROUP settlements
  const { data: groupSettlements } = await (supabase as any)
    .from("tea_shop_group_settlements")
    .select("amount_paid")
    .eq("site_group_id", siteGroupId)
    .eq("is_cancelled", false);

  const groupPaid = (groupSettlements || []).reduce(
    (sum: number, s: { amount_paid: number }) => sum + (s.amount_paid || 0),
    0
  );

  // 1b. Get sites in this group to fetch individual settlements
  const { data: sites } = await (supabase as any)
    .from("sites")
    .select("id")
    .eq("site_group_id", siteGroupId);

  const siteIds = (sites || []).map((s: { id: string }) => s.id);

  // 1c. Get total from INDIVIDUAL settlements for sites in this group
  let individualPaid = 0;
  if (siteIds.length > 0) {
    // Get tea shop accounts for these sites
    const { data: shopAccounts } = await (supabase as any)
      .from("tea_shop_accounts")
      .select("id")
      .in("site_id", siteIds);

    const shopIds = (shopAccounts || []).map((s: { id: string }) => s.id);

    if (shopIds.length > 0) {
      const { data: individualSettlements } = await (supabase as any)
        .from("tea_shop_settlements")
        .select("amount_paid")
        .in("tea_shop_id", shopIds)
        .eq("is_cancelled", false);

      individualPaid = (individualSettlements || []).reduce(
        (sum: number, s: { amount_paid: number }) => sum + (s.amount_paid || 0),
        0
      );
    }
  }

  const totalPaid = groupPaid + individualPaid;
  console.log("[Waterfall] Total paid:", totalPaid, "group:", groupPaid, "individual:", individualPaid);

  // 2. Get ALL entries for this group (ordered by date, oldest first)
  // Include both group entries AND individual entries for sites in the group
  let entriesQuery = (supabase as any)
    .from("tea_shop_entries")
    .select("id, total_amount, date");

  if (siteIds.length > 0) {
    entriesQuery = entriesQuery.or(`site_group_id.eq.${siteGroupId},site_id.in.(${siteIds.join(",")})`);
  } else {
    entriesQuery = entriesQuery.eq("site_group_id", siteGroupId);
  }

  const { data: allEntries, error: entriesError } = await entriesQuery.order("date", { ascending: true });

  console.log("[Waterfall] Entries found:", allEntries?.length, "Error:", entriesError?.message);

  if (entriesError || !allEntries || allEntries.length === 0) {
    console.error("Error fetching entries:", entriesError);
    return;
  }

  console.log("[Waterfall] Entries found:", allEntries.length);

  // OPTIMIZED: Fetch all allocations upfront in ONE query
  const entryIds = allEntries.map((e: any) => e.id);
  const { data: allAllocations } = await (supabase as any)
    .from("tea_shop_entry_allocations")
    .select("id, entry_id, allocated_amount")
    .in("entry_id", entryIds);

  // Group allocations by entry_id for quick lookup
  const allocsByEntry = new Map<string, any[]>();
  (allAllocations || []).forEach((a: any) => {
    if (!allocsByEntry.has(a.entry_id)) {
      allocsByEntry.set(a.entry_id, []);
    }
    allocsByEntry.get(a.entry_id)!.push(a);
  });

  // Calculate all updates in memory first
  const entryUpdates: { id: string; amount_paid: number; is_fully_paid: boolean }[] = [];
  const allocUpdates: { id: string; amount_paid: number; is_fully_paid: boolean }[] = [];

  let remaining = totalPaid;
  for (const entry of allEntries) {
    const entryTotal = entry.total_amount || 0;
    const toAllocate = remaining > 0 ? Math.min(remaining, entryTotal) : 0;
    const isFullyPaid = toAllocate >= entryTotal && entryTotal > 0;

    entryUpdates.push({ id: entry.id, amount_paid: toAllocate, is_fully_paid: isFullyPaid });

    // Calculate allocation updates
    const entryAllocs = allocsByEntry.get(entry.id) || [];
    let allocRemaining = toAllocate;
    for (const alloc of entryAllocs) {
      const allocAmount = alloc.allocated_amount || 0;
      const allocPaid = Math.min(allocRemaining, allocAmount);
      const allocFullyPaid = allocPaid >= allocAmount && allocAmount > 0;

      allocUpdates.push({ id: alloc.id, amount_paid: allocPaid, is_fully_paid: allocFullyPaid });
      allocRemaining -= allocPaid;
    }

    remaining -= toAllocate;
  }

  // OPTIMIZED: Execute all updates in parallel batches
  const BATCH_SIZE = 10;

  // Update entries in parallel batches
  for (let i = 0; i < entryUpdates.length; i += BATCH_SIZE) {
    const batch = entryUpdates.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(upd =>
      (supabase as any)
        .from("tea_shop_entries")
        .update({ amount_paid: upd.amount_paid, is_fully_paid: upd.is_fully_paid })
        .eq("id", upd.id)
    ));
  }

  // Update allocations in parallel batches
  for (let i = 0; i < allocUpdates.length; i += BATCH_SIZE) {
    const batch = allocUpdates.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(upd =>
      (supabase as any)
        .from("tea_shop_entry_allocations")
        .update({ amount_paid: upd.amount_paid, is_fully_paid: upd.is_fully_paid })
        .eq("id", upd.id)
    ));
  }

  console.log("[Waterfall] Complete. Entries updated:", entryUpdates.length, "Allocations updated:", allocUpdates.length);
}

// =============================================================================
// UPDATE GROUP ENTRY
// =============================================================================

interface UpdateGroupEntryData extends CreateGroupEntryData {
  id: string;
  updatedBy?: string;
  updatedByUserId?: string;
}

export function useUpdateGroupTeaShopEntry() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (data: UpdateGroupEntryData) => {
      await ensureFreshSession();

      // 1. Update the entry in tea_shop_entries (payment status will be recalculated)
      const { data: entry, error: entryError } = await (supabase as any)
        .from("tea_shop_entries")
        .update({
          date: data.date,
          amount: data.totalAmount, // Keep in sync with total_amount
          total_amount: data.totalAmount,
          percentage_split: data.percentageSplit || null,
          notes: data.notes || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.id)
        .select()
        .single();

      if (entryError) throw entryError;

      // 2. Delete existing allocations from tea_shop_entry_allocations
      await (supabase as any)
        .from("tea_shop_entry_allocations")
        .delete()
        .eq("entry_id", data.id);

      // 3. Create new allocations in tea_shop_entry_allocations
      const allocationsToInsert = data.allocations.map((alloc) => ({
        entry_id: data.id,
        site_id: alloc.siteId,
        worker_count: alloc.namedLaborerCount + alloc.marketLaborerCount,
        allocation_percentage: alloc.percentage,
        allocated_amount: alloc.amount,
      }));

      const { error: allocError } = await (supabase as any)
        .from("tea_shop_entry_allocations")
        .insert(allocationsToInsert);

      if (allocError) throw allocError;

      // 4. Full waterfall recalculation from oldest to newest
      // This ensures correct payment allocation regardless of which entry was modified
      let effectiveSiteGroupId = data.siteGroupId;
      console.log("[UpdateGroupEntry] Checking waterfall. data.siteGroupId:", data.siteGroupId, "entry.site_id:", entry.site_id);

      // If no siteGroupId provided, try to get it from the entry's site_id
      if (!effectiveSiteGroupId && entry.site_id) {
        const { data: siteData } = await (supabase as any)
          .from("sites")
          .select("site_group_id")
          .eq("id", entry.site_id)
          .single();

        effectiveSiteGroupId = siteData?.site_group_id;
        console.log("[UpdateGroupEntry] Looked up site group from site_id:", effectiveSiteGroupId);
      }

      if (effectiveSiteGroupId) {
        console.log("[UpdateGroupEntry] Triggering waterfall recalculation");
        await recalculateWaterfallForGroup(supabase, effectiveSiteGroupId);
      } else {
        console.log("[UpdateGroupEntry] No effectiveSiteGroupId, skipping waterfall");
      }

      return entry as TeaShopGroupEntry;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.groupTeaShop.entries(variables.siteGroupId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.groupTeaShop.pending(variables.siteGroupId),
      });
      // Invalidate combined tea shop queries to refresh UI with updated payment status
      queryClient.invalidateQueries({
        queryKey: queryKeys.combinedTeaShop.entries(variables.siteGroupId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.combinedTeaShop.pending(variables.siteGroupId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.combinedTeaShop.unsettled(variables.siteGroupId),
      });
      // Invalidate attendance cache to refresh table with updated allocations
      queryClient.invalidateQueries({
        queryKey: ['attendance'],
      });
    },
  });
}

// =============================================================================
// DELETE GROUP ENTRY
// =============================================================================

export function useDeleteGroupTeaShopEntry() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      id,
      siteGroupId,
    }: {
      id: string;
      siteGroupId: string;
    }) => {
      await ensureFreshSession();

      // Allocations are deleted via CASCADE
      const { error } = await (supabase as any)
        .from("tea_shop_group_entries")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.groupTeaShop.entries(variables.siteGroupId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.groupTeaShop.pending(variables.siteGroupId),
      });
      // Invalidate attendance cache to refresh table after deletion
      queryClient.invalidateQueries({
        queryKey: ['attendance'],
      });
    },
  });
}

// =============================================================================
// GROUP SETTLEMENTS
// =============================================================================

/**
 * Fetch group settlements
 */
export function useGroupTeaShopSettlements(siteGroupId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: siteGroupId
      ? queryKeys.groupTeaShop.settlements(siteGroupId)
      : ["group-tea-shop", "settlements"],
    queryFn: async () => {
      if (!siteGroupId) return [];

      const { data, error } = await (supabase as any)
        .from("tea_shop_group_settlements")
        .select("*, subcontracts(id, title)")
        .eq("site_group_id", siteGroupId)
        .eq("is_cancelled", false)
        .order("payment_date", { ascending: false });

      if (error) throw error;
      return (data || []) as TeaShopGroupSettlement[];
    },
    enabled: !!siteGroupId,
  });
}

/**
 * Calculate pending balance for group tea shop
 */
export function useGroupTeaShopPendingBalance(siteGroupId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: siteGroupId
      ? queryKeys.groupTeaShop.pending(siteGroupId)
      : ["group-tea-shop", "pending"],
    queryFn: async () => {
      if (!siteGroupId) return { entriesTotal: 0, paidTotal: 0, pending: 0 };

      // Get total entries amount
      const { data: entries } = await (supabase as any)
        .from("tea_shop_group_entries")
        .select("total_amount")
        .eq("site_group_id", siteGroupId);

      const entriesTotal =
        entries?.reduce(
          (sum: number, e: { total_amount: number }) =>
            sum + (e.total_amount || 0),
          0
        ) || 0;

      // Get total settled amount
      const { data: settlements } = await (supabase as any)
        .from("tea_shop_group_settlements")
        .select("amount_paid")
        .eq("site_group_id", siteGroupId)
        .eq("is_cancelled", false);

      const paidTotal =
        settlements?.reduce(
          (sum: number, s: { amount_paid: number }) =>
            sum + (s.amount_paid || 0),
          0
        ) || 0;

      return {
        entriesTotal,
        paidTotal,
        pending: entriesTotal - paidTotal,
      };
    },
    enabled: !!siteGroupId,
  });
}

/**
 * Get unsettled entries for waterfall allocation preview
 */
export function useGroupTeaShopUnsettledEntries(
  siteGroupId: string | undefined
) {
  const supabase = createClient();

  return useQuery({
    queryKey: siteGroupId
      ? ["group-tea-shop", "unsettled", siteGroupId]
      : ["group-tea-shop", "unsettled"],
    queryFn: async () => {
      if (!siteGroupId) return [];

      const { data, error } = await (supabase as any)
        .from("tea_shop_group_entries")
        .select(`
          *,
          allocations:tea_shop_group_allocations(
            *,
            site:sites(id, name)
          )
        `)
        .eq("site_group_id", siteGroupId)
        .or("is_fully_paid.is.null,is_fully_paid.eq.false")
        .order("date", { ascending: true }); // Oldest first for waterfall

      if (error) throw error;
      return (data || []) as TeaShopGroupEntryWithAllocations[];
    },
    enabled: !!siteGroupId,
  });
}

// =============================================================================
// CREATE GROUP SETTLEMENT
// =============================================================================

interface CreateGroupSettlementData {
  teaShopId: string;
  siteGroupId: string;
  amountPaid: number;
  paymentDate: string;
  paymentMode: string;
  payerType: string;
  siteEngineerId?: string;
  createWalletTransaction?: boolean;
  payerSource?: string;
  payerName?: string;
  proofUrl?: string;
  subcontractId?: string;
  notes?: string;
  recordedBy?: string;
  recordedByUserId?: string;
  // Waterfall allocation data
  allocations: {
    entryId: string;
    amount: number;
  }[];
  periodStart: string;
  periodEnd: string;
  entriesTotal: number;
  totalDue: number;
  balanceRemaining: number;
}

export function useCreateGroupTeaShopSettlement() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (data: CreateGroupSettlementData) => {
      await ensureFreshSession();

      // Create the settlement
      const { data: settlement, error: settlementError } = await (
        supabase as any
      )
        .from("tea_shop_group_settlements")
        .insert({
          tea_shop_id: data.teaShopId,
          site_group_id: data.siteGroupId,
          period_start: data.periodStart,
          period_end: data.periodEnd,
          entries_total: data.entriesTotal,
          total_due: data.totalDue,
          amount_paid: data.amountPaid,
          balance_remaining: data.balanceRemaining,
          payment_date: data.paymentDate,
          payment_mode: data.paymentMode,
          payer_type: data.payerType,
          site_engineer_id: data.siteEngineerId || null,
          payer_source: data.payerSource || null,
          payer_name: data.payerName || null,
          proof_url: data.proofUrl || null,
          subcontract_id: data.subcontractId || null,
          notes: data.notes || null,
          recorded_by: data.recordedBy || null,
          recorded_by_user_id: data.recordedByUserId || null,
          status: data.balanceRemaining > 0 ? "partial" : "completed",
        })
        .select()
        .single();

      if (settlementError) throw settlementError;

      // Create settlement allocations (waterfall tracking)
      const allocationsToInsert = data.allocations.map((alloc) => ({
        settlement_id: settlement.id,
        group_entry_id: alloc.entryId,
        allocated_amount: alloc.amount,
      }));

      const { error: allocError } = await (supabase as any)
        .from("tea_shop_group_settlement_allocations")
        .insert(allocationsToInsert);

      if (allocError) throw allocError;

      // Note: Entry payment status is updated via trigger

      return settlement as TeaShopGroupSettlement;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.groupTeaShop.settlements(variables.siteGroupId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.groupTeaShop.entries(variables.siteGroupId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.groupTeaShop.pending(variables.siteGroupId),
      });
    },
  });
}

// =============================================================================
// DELETE GROUP SETTLEMENT
// =============================================================================

export function useDeleteGroupTeaShopSettlement() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      id,
      siteGroupId,
    }: {
      id: string;
      siteGroupId: string;
    }) => {
      await ensureFreshSession();

      // Allocations are deleted via CASCADE, and trigger updates entry statuses
      const { error } = await (supabase as any)
        .from("tea_shop_group_settlements")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.groupTeaShop.settlements(variables.siteGroupId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.groupTeaShop.entries(variables.siteGroupId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.groupTeaShop.pending(variables.siteGroupId),
      });
    },
  });
}

// =============================================================================
// HELPER: Smart Amount Allocation (Rounding)
// =============================================================================

/**
 * Allocate a total amount across sites based on percentages
 * Uses smart rounding to avoid decimals while ensuring sum equals total
 */
export function allocateAmounts(
  total: number,
  percentages: number[]
): number[] {
  if (percentages.length === 0) return [];
  if (total <= 0) return percentages.map(() => 0);

  // Floor each amount
  const amounts = percentages.map((p) => Math.floor((p / 100) * total));

  // Calculate remainder
  const allocated = amounts.reduce((a, b) => a + b, 0);
  let remainder = total - allocated;

  // Distribute remainder to sites with largest fractional parts
  const fractionalParts = percentages.map((p, i) => ({
    index: i,
    fraction: ((p / 100) * total) - amounts[i],
  }));
  fractionalParts.sort((a, b) => b.fraction - a.fraction);

  for (let i = 0; i < remainder; i++) {
    amounts[fractionalParts[i].index]++;
  }

  return amounts;
}
