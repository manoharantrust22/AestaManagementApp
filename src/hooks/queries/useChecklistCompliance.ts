"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys, cacheTTL } from "@/lib/cache/keys";
import { wrapQueryFn } from "@/lib/utils/timeout";
import type { ChecklistComplianceRow } from "@/types/checklist.types";

/**
 * Low-level call to the get_checklist_compliance RPC.
 * Returns the full matrix (one row per responsible user × site × item × date).
 */
async function fetchCompliance(
  // checklist RPC isn't in the generated DB types yet; loosen at the call site.
  supabase: any,
  companyId: string,
  startDate: string,
  endDate: string,
  userId?: string | null
): Promise<ChecklistComplianceRow[]> {
  const { data, error } = await supabase.rpc("get_checklist_compliance", {
    p_company_id: companyId,
    p_start_date: startDate,
    p_end_date: endDate,
    p_user_id: userId ?? null,
  });
  if (error) throw error;
  return (data ?? []) as ChecklistComplianceRow[];
}

/**
 * The signed-in engineer's checklist for one date.
 * Filtered to the selected site's per-site items plus any per-user items.
 */
export function useMyChecklist(
  params: {
    userId: string | undefined;
    companyId: string | undefined;
    siteId: string | undefined;
    date: string;
  }
) {
  const { userId, companyId, siteId, date } = params;
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.checklist.mine(userId ?? "anon", siteId, date),
    queryFn: wrapQueryFn(
      async () => {
        if (!userId || !companyId) return [] as ChecklistComplianceRow[];
        const rows = await fetchCompliance(supabase, companyId, date, date, userId);
        // Engineer sees the selected site's items + their per-user items.
        return rows.filter(
          (r) => r.site_id === null || (siteId ? r.site_id === siteId : true)
        );
      },
      { operationName: "useMyChecklist" }
    ),
    enabled: !!userId && !!companyId,
    staleTime: cacheTTL.realtime,
  });
}

export interface CompanyComplianceFilters {
  companyId: string | undefined;
  startDate: string;
  endDate: string;
  siteId?: string | null;
  role?: string | null;
}

/**
 * Office overview: every tracked user's checklist across a date range.
 * Optional client-side filtering by site / role.
 */
export function useCompanyCompliance(filters: CompanyComplianceFilters) {
  const { companyId, startDate, endDate, siteId, role } = filters;
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.checklist.company(companyId ?? "none", startDate, endDate, {
      siteId,
      role,
    }),
    queryFn: wrapQueryFn(
      async () => {
        if (!companyId) return [] as ChecklistComplianceRow[];
        const rows = await fetchCompliance(supabase, companyId, startDate, endDate);
        return rows.filter((r) => {
          if (siteId && r.site_id !== siteId) return false;
          if (role && r.role !== role) return false;
          return true;
        });
      },
      { operationName: "useCompanyCompliance" }
    ),
    enabled: !!companyId,
    staleTime: cacheTTL.dashboard,
  });
}
