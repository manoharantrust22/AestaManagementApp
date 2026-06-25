"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient, ensureFreshSession } from "@/lib/supabase/client";

/**
 * Per-site trade settings (`site_trade_settings`) — site-specific OVERRIDES of a
 * trade's WORKSPACE surface (attendance/salary/tea/holidays) and OFFERED-for-new-
 * contracts state. A trade is still defined company-wide in `labor_categories`;
 * a missing row / NULL column here means "inherit the company default" (workspace
 * on, offered) — i.e. today's behaviour. Resolved into `useSiteTrades`.
 */
export interface SiteTradeSetting {
  trade_category_id: string;
  has_workspace: boolean | null;
  is_offered: boolean | null;
}

/** One row of `v_site_trade_workspace_usage` — workspace-data count for a (site, trade). */
export interface SiteTradeWorkspaceUsage {
  site_id: string;
  trade_category_id: string;
  total_workspace_rows: number;
}

/** Raw override rows for one site (keyed for the settings tab + the merge in useSiteTrades). */
export function useSiteTradeSettings(siteId: string | undefined) {
  const supabase: any = createClient();
  return useQuery({
    queryKey: ["site-trade-settings", siteId],
    enabled: !!siteId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_trade_settings")
        .select("trade_category_id, has_workspace, is_offered")
        .eq("site_id", siteId);
      if (error) throw error;
      return (data ?? []) as SiteTradeSetting[];
    },
  });
}

/** Per-(site,trade) workspace-data counts — locks "switch workspace OFF" when this site holds data. */
export function useSiteTradeWorkspaceUsage(siteId: string | undefined) {
  const supabase: any = createClient();
  return useQuery({
    queryKey: ["site-trade-workspace-usage", siteId],
    enabled: !!siteId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_site_trade_workspace_usage")
        .select("site_id, trade_category_id, total_workspace_rows")
        .eq("site_id", siteId);
      if (error) throw error;
      return (data ?? []) as SiteTradeWorkspaceUsage[];
    },
  });
}

export interface UpsertSiteTradeSettingInput {
  siteId: string;
  tradeCategoryId: string;
  /** Only the flag(s) being changed are passed; the other inherits/keeps its value. */
  has_workspace?: boolean | null;
  is_offered?: boolean | null;
}

/**
 * Upsert one site's override for a trade. Writes only the changed flag(s); the
 * `(site_id, trade_category_id)` unique key makes repeated toggles update in place.
 * Invalidates the settings list AND the site workspace so the live tree reflects it.
 */
export function useUpsertSiteTradeSetting() {
  const queryClient = useQueryClient();
  const supabase: any = createClient();

  return useMutation({
    mutationFn: async (input: UpsertSiteTradeSettingInput) => {
      await ensureFreshSession();
      const payload: Record<string, unknown> = {
        site_id: input.siteId,
        trade_category_id: input.tradeCategoryId,
        updated_at: new Date().toISOString(),
      };
      if (input.has_workspace !== undefined) payload.has_workspace = input.has_workspace;
      if (input.is_offered !== undefined) payload.is_offered = input.is_offered;
      const { error } = await supabase
        .from("site_trade_settings")
        .upsert(payload, { onConflict: "site_id,trade_category_id" });
      if (error) throw error;
    },
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: ["site-trade-settings", input.siteId] });
      // The site workspace resolves effective hasWorkspace/isActive from these rows.
      queryClient.invalidateQueries({ queryKey: ["trades", "site", input.siteId] });
    },
  });
}
