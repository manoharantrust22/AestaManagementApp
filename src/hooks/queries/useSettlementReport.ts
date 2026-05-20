"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/cache/keys";
import { wrapQueryFn } from "@/lib/utils/timeout";
import type { SettlementReportRow } from "@/types/settlementReport.types";

export interface UseSettlementReportArgs {
  siteIds: string[];
  dateFrom: string; // YYYY-MM-DD
  dateTo: string;   // YYYY-MM-DD
  categoryId: string | null;
}

export function useSettlementReport(args: UseSettlementReportArgs) {
  const supabase = createClient();
  const { siteIds, dateFrom, dateTo, categoryId } = args;

  return useQuery({
    queryKey: queryKeys.settlementReport.byScope(siteIds, dateFrom, dateTo, categoryId),
    enabled: siteIds.length > 0 && !!dateFrom && !!dateTo,
    queryFn: wrapQueryFn(async () => {
      const { data, error } = await (supabase as any).rpc("get_multi_site_settlement_report", {
        p_site_ids: siteIds,
        p_date_from: dateFrom,
        p_date_to: dateTo,
        p_category_id: categoryId,
      });
      if (error) throw error;
      return (data ?? []) as SettlementReportRow[];
    }, { operationName: "useSettlementReport" }),
  });
}

// Labor categories for the trade filter dropdown. Stable list, long stale time.
export function useLaborCategoriesForReport() {
  const supabase = createClient();
  return useQuery({
    queryKey: queryKeys.laborCategories.list(),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("labor_categories")
        .select("id, name")
        .eq("is_active", true)
        .order("display_order");
      if (error) throw error;
      return (data || []) as { id: string; name: string }[];
    },
    staleTime: 10 * 60 * 1000,
  });
}

// Active sites that are NOT in any site_group. Used by the report toolbar so
// the user can pick an ungrouped site (e.g. a one-off site not yet clustered).
export function useUngroupedActiveSites() {
  const supabase = createClient();
  return useQuery({
    queryKey: ["sites", "active", "ungrouped"] as const,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sites")
        .select("id, name")
        .eq("status", "active")
        .is("site_group_id", null)
        .order("name");
      if (error) throw error;
      return (data || []) as { id: string; name: string }[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
