"use client";

/**
 * useCombinedTeaShopEntriesInfinite
 *
 * Infinite-scroll variant of useCombinedTeaShopEntries. Walks back the entries
 * table one Sunday→Saturday week at a time so the /site/tea-shop page renders
 * fast even when "All Time" is selected against a site with hundreds of rows.
 *
 * Each page returns the same CombinedTeaShopEntry[] shape the existing UI
 * already consumes — flatten data.pages and feed it to the table.
 *
 * Stop conditions mirror useAttendanceWeeksInfinite:
 *   - When dateFrom is set: stop once the next week ends before dateFrom.
 *   - Otherwise: stop after MAX_EMPTY_STREAK consecutive empty weeks.
 *
 * Summary cards must NOT use this hook — they need all-time totals. Keep using
 * useCombinedTeaShopEntries (with no date filter) and useCombinedTeaShopSettlements
 * for those.
 */

import { useInfiniteQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/cache/keys";
import { wrapQueryFn } from "@/lib/utils/timeout";
import { weekStartStr, weekEndStr } from "@/lib/utils/weekUtils";
import type { CombinedTeaShopEntry } from "./useCombinedTeaShop";

export interface CombinedTeaShopWeekPage {
  weekStart: string;
  weekEnd: string;
  emptyStreak: number;
  entries: CombinedTeaShopEntry[];
}

export interface UseCombinedTeaShopEntriesInfiniteOptions {
  dateFrom?: string;
  dateTo?: string;
  filterBySiteId?: string;
  enabled?: boolean;
}

const MAX_EMPTY_STREAK = 4;

async function fetchWeek(
  supabase: ReturnType<typeof createClient>,
  siteGroupId: string,
  weekStart: string,
  weekEnd: string,
  scopeFrom: string | undefined,
  scopeTo: string | undefined,
  filterBySiteId: string | undefined
): Promise<CombinedTeaShopEntry[]> {
  // Clamp to user-selected scope so the first/last page respects the filter
  const from = scopeFrom && scopeFrom > weekStart ? scopeFrom : weekStart;
  const to = scopeTo && scopeTo < weekEnd ? scopeTo : weekEnd;

  // 1. Sites in the group
  const { data: sites } = await (supabase as any)
    .from("sites")
    .select("id, name")
    .eq("site_group_id", siteGroupId)
    .order("name");

  if (!sites || sites.length === 0) return [];
  const siteIds = sites.map((s: any) => s.id);
  const siteNameMap = new Map<string, string>();
  sites.forEach((s: any) => siteNameMap.set(s.id, s.name));

  // 2. Entries for this week — individual + group, date-bounded
  let query = (supabase as any)
    .from("tea_shop_entries")
    .select(
      "*, entered_by_user:users!tea_shop_entries_entered_by_user_id_fkey(name, avatar_url)"
    )
    .gte("date", from)
    .lte("date", to);

  if (siteIds.length > 0) {
    query = query.or(
      `site_id.in.(${siteIds.join(",")}),site_group_id.eq.${siteGroupId}`
    );
  } else {
    query = query.eq("site_group_id", siteGroupId);
  }
  query = query.order("date", { ascending: false });

  const { data: entries } = await query;

  // 3. Allocations for group entries in this page
  const groupEntryIds = (entries || [])
    .filter((e: any) => e.is_group_entry === true)
    .map((e: any) => e.id);

  const allocationMap = new Map<
    string,
    Map<
      string,
      { amount: number; siteName: string; amountPaid: number; isFullyPaid: boolean }
    >
  >();

  if (groupEntryIds.length > 0) {
    const { data: allocations } = await (supabase as any)
      .from("tea_shop_entry_allocations")
      .select(
        "entry_id, site_id, allocated_amount, amount_paid, is_fully_paid, site:sites(id, name)"
      )
      .in("entry_id", groupEntryIds);

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

  // 4. Map entries — same logic as useCombinedTeaShopEntries
  const combined: CombinedTeaShopEntry[] = [];

  (entries || []).forEach((entry: any) => {
    const isGroupEntry = entry.is_group_entry === true;

    if (isGroupEntry && allocationMap.has(entry.id)) {
      const siteAllocs = allocationMap.get(entry.id)!;

      if (filterBySiteId) {
        if (siteAllocs.has(filterBySiteId)) {
          const alloc = siteAllocs.get(filterBySiteId)!;

          // Prefer allocation-level paid; fall back to proportional from entry
          // for legacy rows where allocation paid never got synced (post-backfill
          // this branch is unreachable, but kept for resilience).
          let effectiveAmountPaid = alloc.amountPaid;
          let effectiveIsFullyPaid = alloc.isFullyPaid;
          if (
            effectiveAmountPaid === 0 &&
            entry.amount_paid > 0 &&
            entry.total_amount > 0
          ) {
            const ratio = alloc.amount / entry.total_amount;
            effectiveAmountPaid = Math.round(entry.amount_paid * ratio);
            effectiveIsFullyPaid = effectiveAmountPaid >= alloc.amount;
          }

          combined.push({
            ...entry,
            site_id: filterBySiteId,
            site_name:
              alloc.siteName || siteNameMap.get(filterBySiteId) || "Unknown Site",
            source: "individual" as const,
            display_amount: alloc.amount,
            original_total_amount: entry.total_amount,
            isGroupEntry: true,
            amount_paid: effectiveAmountPaid,
            is_fully_paid: effectiveIsFullyPaid,
          });
        }
        return;
      }

      combined.push({
        ...entry,
        site_name: "Group Entry",
        source: "individual" as const,
        display_amount: entry.total_amount,
        original_total_amount: entry.total_amount,
        isGroupEntry: true,
      });
      return;
    }

    if (isGroupEntry) {
      // Group entry without any allocation row
      if (filterBySiteId) {
        combined.push({
          ...entry,
          site_id: filterBySiteId,
          site_name: siteNameMap.get(filterBySiteId) || "Unknown Site",
          source: "individual" as const,
          display_amount: 0,
          original_total_amount: entry.total_amount,
          isGroupEntry: true,
          hasNoAllocation: true,
          amount_paid: 0,
          is_fully_paid: true,
        } as unknown as CombinedTeaShopEntry);
      } else {
        combined.push({
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

    // Non-group entry
    if (filterBySiteId && entry.site_id !== filterBySiteId) return;
    combined.push({
      ...entry,
      site_name: siteNameMap.get(entry.site_id) || "Unknown Site",
      source: "individual" as const,
      display_amount: entry.total_amount,
      isGroupEntry: false,
    });
  });

  // 5. Legacy tea_shop_group_entries (date-bounded for this week)
  const { data: legacyGroupEntries } = await (supabase as any)
    .from("tea_shop_group_entries")
    .select("*")
    .eq("site_group_id", siteGroupId)
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: false });

  (legacyGroupEntries || []).forEach((ge: any) => {
    combined.push({
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
      display_amount: ge.total_amount,
      original_total_amount: ge.total_amount,
      isGroupEntry: true,
    } as unknown as CombinedTeaShopEntry);
  });

  combined.sort((a, b) => b.date.localeCompare(a.date));
  return combined;
}

export function useCombinedTeaShopEntriesInfinite(
  siteGroupId: string | undefined,
  options: UseCombinedTeaShopEntriesInfiniteOptions = {}
) {
  const { dateFrom, dateTo, filterBySiteId, enabled = true } = options;
  const supabase = createClient();

  const anchorDate = dateTo || dayjs().format("YYYY-MM-DD");
  const initialWeekStart = weekStartStr(anchorDate);

  return useInfiniteQuery({
    queryKey: siteGroupId
      ? [
          ...queryKeys.combinedTeaShop.entries(siteGroupId),
          "infinite",
          { dateFrom, dateTo, filterBySiteId, anchor: initialWeekStart },
        ]
      : (["combined-tea-shop", "entries", "infinite", "disabled"] as const),
    enabled: enabled && !!siteGroupId,
    refetchOnWindowFocus: false,
    initialPageParam: initialWeekStart,
    queryFn: wrapQueryFn<CombinedTeaShopWeekPage>(async (ctx) => {
      const { pageParam } = ctx as { pageParam: string };
      const weekStart = pageParam;
      const weekEnd = weekEndStr(weekStart);
      const entries = await fetchWeek(
        supabase,
        siteGroupId!,
        weekStart,
        weekEnd,
        dateFrom,
        dateTo,
        filterBySiteId
      );
      return {
        weekStart,
        weekEnd,
        emptyStreak: entries.length === 0 ? 1 : 0,
        entries,
      };
    }, { operationName: "useCombinedTeaShopEntriesInfinite" }),
    getNextPageParam: (lastPage, allPages) => {
      // Empty-streak accumulator: how many trailing empty weeks?
      let streak = 0;
      for (let i = allPages.length - 1; i >= 0; i--) {
        if (allPages[i].emptyStreak > 0) streak++;
        else break;
      }
      if (!dateFrom && streak >= MAX_EMPTY_STREAK) return undefined;

      const prevWeekStart = dayjs(lastPage.weekStart)
        .subtract(1, "week")
        .format("YYYY-MM-DD");

      if (dateFrom) {
        const prevWeekEnd = weekEndStr(prevWeekStart);
        if (prevWeekEnd < dateFrom) return undefined;
      }

      return prevWeekStart;
    },
  });
}
