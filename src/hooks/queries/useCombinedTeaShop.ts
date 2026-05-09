"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/cache/keys";
import { wrapQueryFn } from "@/lib/utils/timeout";
import type { Database } from "@/types/database.types";

type TeaShopEntry = Database["public"]["Tables"]["tea_shop_entries"]["Row"];
type TeaShopSettlement = Database["public"]["Tables"]["tea_shop_settlements"]["Row"];

// =============================================================================
// TYPES
// =============================================================================

export interface CombinedTeaShopEntry extends TeaShopEntry {
  site_id: string;
  site_name: string;
  source: "individual" | "group";
  /** Display amount - for group entries, shows allocated amount for current site filter */
  display_amount?: number;
  /** Original total amount before allocation */
  original_total_amount?: number;
  /** Whether this is a group entry with allocations */
  isGroupEntry?: boolean;
}

export interface CombinedTeaShopSettlement extends TeaShopSettlement {
  site_id: string;
  site_name: string;
  source: "individual" | "group";
}

interface SiteWithShop {
  id: string;
  name: string;
  tea_shop_id: string | null;
}

// =============================================================================
// COMBINED TEA SHOP ENTRIES
// Fetches entries from ALL sites in a group
// =============================================================================

export function useCombinedTeaShopEntries(
  siteGroupId: string | undefined,
  options?: { dateFrom?: string; dateTo?: string; filterBySiteId?: string }
) {
  const supabase = createClient();

  return useQuery({
    queryKey: siteGroupId
      ? [...queryKeys.combinedTeaShop.entries(siteGroupId), options]
      : ["combined-tea-shop", "entries"],
    queryFn: wrapQueryFn(async (): Promise<CombinedTeaShopEntry[]> => {
      if (!siteGroupId) return [];

      // 1. Get all sites in the group
      const { data: sites, error: sitesError } = await (supabase as any)
        .from("sites")
        .select("id, name")
        .eq("site_group_id", siteGroupId)
        .order("name");

      if (sitesError) throw sitesError;
      if (!sites || sites.length === 0) return [];

      // Build a map of site_id -> site_name
      const siteIds = sites.map((s: any) => s.id);
      const siteNameMap = new Map<string, string>();
      sites.forEach((s: any) => siteNameMap.set(s.id, s.name));

      // 2. Fetch entries for all sites in the group
      // This includes:
      // - Individual site entries (site_id in siteIds)
      // - Group entries (site_group_id matches, site_id is null)
      let query = (supabase as any)
        .from("tea_shop_entries")
        .select("*, entered_by_user:users!tea_shop_entries_entered_by_user_id_fkey(name, avatar_url)");

      // Handle empty siteIds to avoid invalid .or() clause
      if (siteIds.length > 0) {
        query = query.or(`site_id.in.(${siteIds.join(",")}),site_group_id.eq.${siteGroupId}`);
      } else {
        query = query.eq("site_group_id", siteGroupId);
      }

      query = query.order("date", { ascending: false });

      if (options?.dateFrom) {
        query = query.gte("date", options.dateFrom);
      }
      if (options?.dateTo) {
        query = query.lte("date", options.dateTo);
      }

      const { data: entries, error: entriesError } = await query;
      if (entriesError) throw entriesError;

      // 3. Fetch allocations for group entries (is_group_entry=true)
      const groupEntryIds = (entries || [])
        .filter((e: any) => e.is_group_entry === true)
        .map((e: any) => e.id);

      // Build allocation map: entry_id -> { site_id -> { amount, siteName, amountPaid, isFullyPaid } }
      const allocationMap = new Map<string, Map<string, {
        amount: number;
        siteName: string;
        amountPaid: number;
        isFullyPaid: boolean;
      }>>();

      if (groupEntryIds.length > 0) {
        const { data: allocations, error: allocError } = await (supabase as any)
          .from("tea_shop_entry_allocations")
          .select("entry_id, site_id, allocated_amount, amount_paid, is_fully_paid, site:sites(id, name)")
          .in("entry_id", groupEntryIds);

        if (allocError) {
          console.warn("Error fetching allocations:", allocError.message);
        }

        (allocations || []).forEach((a: any) => {
          if (!allocationMap.has(a.entry_id)) {
            allocationMap.set(a.entry_id, new Map());
          }
          allocationMap.get(a.entry_id)!.set(a.site_id, {
            amount: a.allocated_amount,
            siteName: a.site?.name || "Unknown",
            amountPaid: a.amount_paid || 0,
            isFullyPaid: a.is_fully_paid || false,
          });
        });
      }

      // 4. Map entries with site names and handle group entry allocations
      const combinedEntries: CombinedTeaShopEntry[] = [];

      (entries || []).forEach((entry: any) => {
        const isGroupEntry = entry.is_group_entry === true;

        // For group entries, check if we have allocations
        if (isGroupEntry && allocationMap.has(entry.id)) {
          const siteAllocs = allocationMap.get(entry.id)!;

          // If filtering by a specific site
          if (options?.filterBySiteId) {
            // Only include if this site has an allocation
            if (siteAllocs.has(options.filterBySiteId)) {
              const alloc = siteAllocs.get(options.filterBySiteId)!;

              // Calculate per-allocation paid amount
              // Priority: use allocation-level amount_paid if set, otherwise calculate from entry-level
              // This handles the case where settlements update entry-level but not allocation-level
              let effectiveAmountPaid = alloc.amountPaid;
              let effectiveIsFullyPaid = alloc.isFullyPaid;

              // If allocation's amount_paid is 0 but entry has payments, calculate proportionally
              if (effectiveAmountPaid === 0 && entry.amount_paid > 0 && entry.total_amount > 0) {
                const ratio = alloc.amount / entry.total_amount;
                effectiveAmountPaid = Math.round(entry.amount_paid * ratio);
                effectiveIsFullyPaid = effectiveAmountPaid >= alloc.amount;
              }

              combinedEntries.push({
                ...entry,
                site_id: options.filterBySiteId, // Set site_id to filtered site for consistency
                site_name: alloc.siteName || siteNameMap.get(options.filterBySiteId) || "Unknown Site",
                source: "individual" as const,
                display_amount: alloc.amount,
                original_total_amount: entry.total_amount,
                isGroupEntry: true,
                // Use calculated per-site allocation payment status
                amount_paid: effectiveAmountPaid,
                is_fully_paid: effectiveIsFullyPaid,
              });
            }
            // Skip this entry if the filtered site doesn't have an allocation
            return;
          }

          // No filter - show full amount with group marker
          combinedEntries.push({
            ...entry,
            site_name: "Group Entry",
            source: "individual" as const,
            display_amount: entry.total_amount,
            original_total_amount: entry.total_amount,
            isGroupEntry: true,
          });
          return;
        }

        // For group entries WITHOUT allocations
        // FIXED: Show ₹0 for sites without allocations instead of equal split
        // This ensures sites with no laborers (holidays) show ₹0, not an equal portion
        if (isGroupEntry) {
          if (options?.filterBySiteId) {
            // When filtering by site and no allocation exists, show ₹0
            // This means either: the site had no laborers, or the entry predates the allocation system
            combinedEntries.push({
              ...entry,
              site_id: options.filterBySiteId,
              site_name: siteNameMap.get(options.filterBySiteId) || "Unknown Site",
              source: "individual" as const,
              display_amount: 0, // FIXED: Show 0 instead of equal split for missing allocations
              original_total_amount: entry.total_amount,
              isGroupEntry: true,
              hasNoAllocation: true, // Flag to indicate missing allocation
              // FIXED: Set amount_paid to 0 for entries without allocations
              // (entry-level amount_paid is for the whole group, not this site)
              amount_paid: 0,
              is_fully_paid: true, // No allocation means nothing to pay for this site
            });
          } else {
            // No filter - show full amount with group marker
            // Keep entry-level amount_paid since we're showing the full group entry
            combinedEntries.push({
              ...entry,
              site_name: "Group Entry",
              source: "individual" as const,
              display_amount: entry.total_amount,
              original_total_amount: entry.total_amount,
              isGroupEntry: true,
            });
          }
          return;
        }

        // For non-group entries, filter by site_id if filter is specified
        if (options?.filterBySiteId && entry.site_id !== options.filterBySiteId) {
          return; // Skip entries from other sites
        }

        // Non-group entry - show total_amount as display_amount
        combinedEntries.push({
          ...entry,
          site_name: siteNameMap.get(entry.site_id) || "Unknown Site",
          source: "individual" as const,
          display_amount: entry.total_amount,
          isGroupEntry: false,
        });
      });

      // 4. Also fetch any legacy group entries (for backward compat)
      const { data: groupEntries } = await (supabase as any)
        .from("tea_shop_group_entries")
        .select(`
          *,
          allocations:tea_shop_group_allocations(
            site_id,
            allocated_amount,
            site:sites(id, name)
          )
        `)
        .eq("site_group_id", siteGroupId)
        .order("date", { ascending: false });

      // Convert group entries to combined format
      if (groupEntries && groupEntries.length > 0) {
        groupEntries.forEach((ge: any) => {
          // Add one combined entry per group entry (showing as "Group" source)
          // Use unknown cast since group entries have different structure
          combinedEntries.push({
            id: ge.id,
            tea_shop_id: ge.tea_shop_id,
            date: ge.date,
            tea_count: null,
            tea_rate: null,
            tea_total: null,
            snacks_count: null,
            snacks_rate: null,
            snacks_total: null,
            total_amount: ge.total_amount,
            notes: ge.notes,
            entered_by: ge.entered_by,
            created_at: ge.created_at,
            updated_at: ge.updated_at,
            site_id: siteGroupId, // Use group ID for group entries
            site_name: "All Sites (Group)",
            source: "group" as const,
            // Include payment status from group entry
            amount_paid: ge.amount_paid,
            is_fully_paid: ge.is_fully_paid,
            // New fields for display
            display_amount: ge.total_amount,
            original_total_amount: ge.total_amount,
            isGroupEntry: true,
          } as unknown as CombinedTeaShopEntry);
        });
      }

      // Sort all entries by date descending
      combinedEntries.sort((a, b) => b.date.localeCompare(a.date));

      return combinedEntries;
    }, { operationName: "useCombinedTeaShopEntries" }),
    enabled: !!siteGroupId,
  });
}

// =============================================================================
// COMBINED TEA SHOP PENDING BALANCE
// Calculates pending from ALL sites in group
// =============================================================================

export function useCombinedTeaShopPendingBalance(
  siteGroupId: string | undefined
) {
  const supabase = createClient();

  return useQuery({
    queryKey: siteGroupId
      ? queryKeys.combinedTeaShop.pending(siteGroupId)
      : ["combined-tea-shop", "pending"],
    queryFn: async () => {
      if (!siteGroupId)
        return { entriesTotal: 0, paidTotal: 0, pending: 0 };

      // Get all sites in the group
      const { data: sites } = await (supabase as any)
        .from("sites")
        .select("id")
        .eq("site_group_id", siteGroupId);

      if (!sites || sites.length === 0)
        return { entriesTotal: 0, paidTotal: 0, pending: 0 };

      const siteIds = sites.map((s: any) => s.id);

      // Get total entries amount from entries
      // This includes:
      // - Individual site entries (site_id in siteIds)
      // - Group entries (site_group_id matches, site_id is null)
      let entriesQuery = (supabase as any)
        .from("tea_shop_entries")
        .select("total_amount");

      // Handle empty siteIds to avoid invalid .or() clause
      if (siteIds.length > 0) {
        entriesQuery = entriesQuery.or(`site_id.in.(${siteIds.join(",")}),site_group_id.eq.${siteGroupId}`);
      } else {
        entriesQuery = entriesQuery.eq("site_group_id", siteGroupId);
      }

      const { data: entries } = await entriesQuery;

      const individualEntriesTotal =
        entries?.reduce(
          (sum: number, e: { total_amount: number }) =>
            sum + (e.total_amount || 0),
          0
        ) || 0;

      // Get total from group entries
      const { data: groupEntries } = await (supabase as any)
        .from("tea_shop_group_entries")
        .select("total_amount")
        .eq("site_group_id", siteGroupId);

      const groupEntriesTotal =
        groupEntries?.reduce(
          (sum: number, e: { total_amount: number }) =>
            sum + (e.total_amount || 0),
          0
        ) || 0;

      const entriesTotal = individualEntriesTotal + groupEntriesTotal;

      // Get ALL tea shop accounts for sites in group (including inactive - for historical settlements)
      const { data: shops } = await (supabase as any)
        .from("tea_shop_accounts")
        .select("id")
        .in("site_id", siteIds);

      const shopIds = (shops || []).map((s: any) => s.id);

      // Get total settled amount from individual settlements (need tea_shop_id since settlements don't have site_id)
      const { data: settlements } = shopIds.length > 0
        ? await (supabase as any)
            .from("tea_shop_settlements")
            .select("amount_paid")
            .in("tea_shop_id", shopIds)
        : { data: [] };

      const individualPaidTotal =
        settlements?.reduce(
          (sum: number, s: { amount_paid: number }) =>
            sum + (s.amount_paid || 0),
          0
        ) || 0;

      // Get total from group settlements
      const { data: groupSettlements } = await (supabase as any)
        .from("tea_shop_group_settlements")
        .select("amount_paid")
        .eq("site_group_id", siteGroupId)
        .eq("is_cancelled", false);

      const groupPaidTotal =
        groupSettlements?.reduce(
          (sum: number, s: { amount_paid: number }) =>
            sum + (s.amount_paid || 0),
          0
        ) || 0;

      const paidTotal = individualPaidTotal + groupPaidTotal;

      return {
        entriesTotal,
        paidTotal,
        pending: entriesTotal - paidTotal,
      };
    },
    enabled: !!siteGroupId,
  });
}

// =============================================================================
// COMBINED TEA SHOP UNSETTLED ENTRIES
// Returns unsettled entries from ALL sites (oldest first for waterfall)
// =============================================================================

export function useCombinedTeaShopUnsettledEntries(
  siteGroupId: string | undefined
) {
  const supabase = createClient();

  return useQuery({
    queryKey: siteGroupId
      ? queryKeys.combinedTeaShop.unsettled(siteGroupId)
      : ["combined-tea-shop", "unsettled"],
    queryFn: async (): Promise<CombinedTeaShopEntry[]> => {
      if (!siteGroupId) return [];

      // Get all sites in the group
      const { data: sites } = await (supabase as any)
        .from("sites")
        .select("id, name")
        .eq("site_group_id", siteGroupId)
        .order("name");

      if (!sites || sites.length === 0) return [];

      const siteIds = sites.map((s: any) => s.id);
      const siteNameMap = new Map<string, string>();
      sites.forEach((s: any) => siteNameMap.set(s.id, s.name));

      // FIXED: Fetch entries with proper filtering
      // Step 1: Fetch individual site entries (site_id is set)
      const { data: siteEntries } = await (supabase as any)
        .from("tea_shop_entries")
        .select("*")
        .in("site_id", siteIds)
        .eq("is_group_entry", false)
        .order("date", { ascending: true });

      // Step 2: Fetch group entries (is_group_entry = true) with allocations including payment status
      const { data: groupEntriesNew } = await (supabase as any)
        .from("tea_shop_entries")
        .select(`
          *,
          allocations:tea_shop_entry_allocations(
            site_id,
            allocated_amount,
            amount_paid,
            is_fully_paid
          )
        `)
        .eq("is_group_entry", true)
        .eq("site_group_id", siteGroupId)
        .order("date", { ascending: true });

      // Step 3: Filter for unpaid status in JavaScript (to avoid PostgREST OR chaining issues)
      const unpaidSiteEntries = (siteEntries || []).filter((entry: any) => {
        const totalAmount = entry.total_amount || 0;
        const amountPaid = entry.amount_paid || 0;
        return entry.is_fully_paid !== true && amountPaid < totalAmount;
      });

      // For group entries, check if ANY allocation is unpaid (per-site basis)
      // An entry is considered "has unpaid" if at least one site allocation is not fully paid
      const groupEntriesWithUnpaid = (groupEntriesNew || []).filter((entry: any) => {
        const allocations = entry.allocations || [];
        // Check if any allocation for sites in this group is unpaid
        return allocations.some((alloc: any) => {
          if (!siteIds.includes(alloc.site_id)) return false;
          const allocAmount = alloc.allocated_amount || 0;
          const allocPaid = alloc.amount_paid || 0;
          return alloc.is_fully_paid !== true && allocPaid < allocAmount && allocAmount > 0;
        });
      });

      // Step 4: Build combined entries list
      const combinedEntries: CombinedTeaShopEntry[] = unpaidSiteEntries.map(
        (entry: any) => {
          return {
            ...entry,
            site_name: siteNameMap.get(entry.site_id) || "Unknown Site",
            source: "individual" as const,
          };
        }
      );

      // Add group entries - expand each unpaid allocation as a separate entry
      groupEntriesWithUnpaid.forEach((entry: any) => {
        const allocations = entry.allocations || [];
        // For each site with an unpaid allocation, add a combined entry
        allocations.forEach((alloc: any) => {
          if (!siteIds.includes(alloc.site_id)) return;
          const allocAmount = alloc.allocated_amount || 0;
          const allocPaid = alloc.amount_paid || 0;
          const isUnpaid = alloc.is_fully_paid !== true && allocPaid < allocAmount && allocAmount > 0;
          if (!isUnpaid) return;

          combinedEntries.push({
            ...entry,
            allocations: undefined, // Remove the nested allocations
            site_id: alloc.site_id,
            site_name: siteNameMap.get(alloc.site_id) || "Unknown Site",
            source: "group" as const,
            isGroupEntry: true,
            display_amount: allocAmount,
            original_total_amount: entry.total_amount,
            amount_paid: allocPaid,
            is_fully_paid: alloc.is_fully_paid,
          } as unknown as CombinedTeaShopEntry);
        });
      });

      // Also fetch legacy group entries from tea_shop_group_entries (for backwards compatibility)
      const { data: legacyGroupEntries } = await (supabase as any)
        .from("tea_shop_group_entries")
        .select("*")
        .eq("site_group_id", siteGroupId)
        .order("date", { ascending: true });

      // Filter and add legacy entries (avoid duplicates)
      const existingDates = new Set(combinedEntries.map((e) => e.date));
      (legacyGroupEntries || []).forEach((ge: any) => {
        // Skip if fully paid
        if (ge.is_fully_paid === true) return;
        const totalAmount = ge.total_amount || 0;
        const amountPaid = ge.amount_paid || 0;
        if (amountPaid >= totalAmount) return;

        // Skip if we already have a group entry for this date (avoid migration duplicates)
        if (existingDates.has(ge.date)) return;

        combinedEntries.push({
          id: ge.id,
          tea_shop_id: ge.tea_shop_id,
          date: ge.date,
          tea_count: null,
          tea_rate: null,
          tea_total: null,
          snacks_count: null,
          snacks_rate: null,
          snacks_total: null,
          total_amount: ge.total_amount,
          notes: ge.notes,
          entered_by: ge.entered_by,
          created_at: ge.created_at,
          updated_at: ge.updated_at,
          site_id: siteGroupId,
          site_name: "All Sites (Group)",
          source: "group" as const,
          amount_paid: ge.amount_paid,
          is_fully_paid: ge.is_fully_paid,
        } as unknown as CombinedTeaShopEntry);
      });

      // Sort by date ascending for waterfall (oldest first)
      combinedEntries.sort((a, b) => a.date.localeCompare(b.date));

      return combinedEntries;
    },
    enabled: !!siteGroupId,
  });
}

// =============================================================================
// COMBINED TEA SHOP SETTLEMENTS
// Fetches settlements from ALL sites in a group
// =============================================================================

export function useCombinedTeaShopSettlements(
  siteGroupId: string | undefined
) {
  const supabase = createClient();

  return useQuery({
    queryKey: siteGroupId
      ? queryKeys.combinedTeaShop.settlements(siteGroupId)
      : ["combined-tea-shop", "settlements"],
    queryFn: async (): Promise<CombinedTeaShopSettlement[]> => {
      if (!siteGroupId) return [];

      // Get all sites in the group
      const { data: sites } = await (supabase as any)
        .from("sites")
        .select("id, name")
        .eq("site_group_id", siteGroupId)
        .order("name");

      if (!sites || sites.length === 0) return [];

      const siteIds = sites.map((s: any) => s.id);
      const siteNameMap = new Map<string, string>();
      sites.forEach((s: any) => siteNameMap.set(s.id, s.name));

      // Get ALL tea shop accounts for sites in group (including inactive - for historical settlements)
      const { data: shops } = await (supabase as any)
        .from("tea_shop_accounts")
        .select("id, site_id")
        .in("site_id", siteIds);

      const shopSiteMap = new Map<string, string>();
      (shops || []).forEach((shop: any) => {
        if (shop.site_id) {
          shopSiteMap.set(shop.id, shop.site_id);
        }
      });

      const shopIds = Array.from(shopSiteMap.keys());

      // Fetch individual settlements (settlements don't have site_id, so we query by tea_shop_id)
      // Include subcontract's site_id for proper site filtering - settlements are associated with
      // subcontracts which belong to specific sites
      const { data: settlements } = shopIds.length > 0
        ? await (supabase as any)
            .from("tea_shop_settlements")
            .select("*, subcontracts(id, title, site_id)")
            .in("tea_shop_id", shopIds)
            .order("payment_date", { ascending: false })
        : { data: [] };

      const combinedSettlements: CombinedTeaShopSettlement[] = (
        settlements || []
      ).map((s: TeaShopSettlement) => {
        // Priority: Use subcontract's site_id if available, otherwise fall back to tea shop's site
        const subcontractSiteId = (s as any).subcontracts?.site_id;
        const teaShopSiteId = shopSiteMap.get(s.tea_shop_id) || "";
        const siteId = subcontractSiteId || teaShopSiteId;
        return {
          ...s,
          site_id: siteId,
          site_name: siteNameMap.get(siteId) || "Unknown Site",
          source: "individual" as const,
        };
      });

      // Also fetch group settlements
      // Include subcontract's site_id for proper filtering - each settlement is linked to a subcontract
      // which belongs to a specific site within the group
      const { data: groupSettlements } = await (supabase as any)
        .from("tea_shop_group_settlements")
        .select("*, subcontracts(id, title, site_id)")
        .eq("site_group_id", siteGroupId)
        .eq("is_cancelled", false)
        .order("payment_date", { ascending: false });

      if (groupSettlements && groupSettlements.length > 0) {
        groupSettlements.forEach((gs: any) => {
          // Use subcontract's site_id if available for proper site filtering
          const subcontractSiteId = gs.subcontracts?.site_id;
          const effectiveSiteId = subcontractSiteId || siteGroupId;
          const effectiveSiteName = subcontractSiteId
            ? siteNameMap.get(subcontractSiteId) || "Unknown Site"
            : "All Sites (Group)";

          combinedSettlements.push({
            id: gs.id,
            tea_shop_id: gs.tea_shop_id,
            amount_paid: gs.amount_paid,
            payment_date: gs.payment_date,
            payment_mode: gs.payment_mode,
            payer_type: gs.payer_type,
            notes: gs.notes,
            created_at: gs.created_at,
            updated_at: gs.updated_at,
            site_id: effectiveSiteId,
            site_name: effectiveSiteName,
            source: subcontractSiteId ? "individual" as const : "group" as const,
            // Include additional group settlement fields
            settlement_reference: gs.settlement_reference,
            proof_url: gs.proof_url,
            is_engineer_settled: gs.is_engineer_settled,
            subcontracts: gs.subcontracts,
          } as unknown as CombinedTeaShopSettlement);
        });
      }

      // Sort by payment date descending
      combinedSettlements.sort((a, b) =>
        b.payment_date.localeCompare(a.payment_date)
      );

      return combinedSettlements;
    },
    enabled: !!siteGroupId,
  });
}

// =============================================================================
// HELPER: Get attendance counts for all sites in group on a date
// =============================================================================

export function useCombinedGroupAttendance(
  siteGroupId: string | undefined,
  date: string | undefined
) {
  const supabase = createClient();

  return useQuery({
    queryKey:
      siteGroupId && date
        ? ["combined-tea-shop", "attendance", siteGroupId, date]
        : ["combined-tea-shop", "attendance"],
    queryFn: async () => {
      if (!siteGroupId || !date) return new Map<string, { named: number; market: number }>();

      // Get all sites in the group
      const { data: sites } = await (supabase as any)
        .from("sites")
        .select("id, name")
        .eq("site_group_id", siteGroupId)
        .order("name");

      if (!sites || sites.length === 0) return new Map();

      const attendanceMap = new Map<string, { named: number; market: number; siteName: string }>();

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
          .eq("date", date)
          .eq("is_deleted", false);

        const namedCount = namedData?.length || 0;
        const marketCount =
          marketData?.reduce(
            (sum: number, m: { count: number }) => sum + (m.count || 0),
            0
          ) || 0;

        attendanceMap.set(site.id, {
          named: namedCount,
          market: marketCount,
          siteName: site.name,
        });
      }

      return attendanceMap;
    },
    enabled: !!siteGroupId && !!date,
  });
}
