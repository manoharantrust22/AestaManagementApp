"use client";

/**
 * Shared usage-log query for a single inventory item (one material pool or one
 * group batch). Powers both the inline "Usage log" panel on the Material Hub
 * (MaterialThreadExpanded) and the standalone UsageHistoryDialog so the two
 * never drift.
 *
 * Two sources, chosen by what the item represents:
 *   - GROUP batch (batch_code = expense.ref_code, kind="group")
 *       → batch_usage_records filtered by batch_ref_code. One row per event.
 *         usage_site embeds cleanly; recorder name must be resolved through
 *         public.users.auth_id because batch_usage_records.created_by points at
 *         auth.users (which PostgREST cannot embed).
 *   - OWN / pooled ((site, material[, brand]), kind="own")
 *       → daily_material_usage filtered by site + material (+ brand). created_by
 *         points at public.users, so the recorder embeds directly.
 *
 * Returned rows carry everything the edit/delete affordances need (unit_cost,
 * total_cost, settlement_status, batch_ref_code, material/brand) so callers
 * don't have to re-fetch the full record.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface UsageLogItem {
  material_id?: string;
  brand_id?: string | null;
  material_name: string;
  material_unit: string;
  batch_code: string | null;
  kind: "own" | "group";
}

export interface UsageLogRow {
  id: string;
  source: "batch" | "pool";
  usage_date: string;
  quantity: number;
  unit: string;
  work_description: string | null;
  recorded_by_name: string | null;
  usage_site_id: string | null;
  usage_site_name: string | null;
  /** batch source only; null for pooled rows */
  settlement_status: string | null;
  unit_cost: number | null;
  total_cost: number | null;
  batch_ref_code: string | null;
  material_id: string | null;
  brand_id: string | null;
  material_name: string | null;
  brand_name: string | null;
}

export function usageLogQueryKey(
  item: UsageLogItem | null | undefined,
  siteId: string | undefined
) {
  const isBatchExact = !!item?.batch_code && item.kind === "group";
  return [
    "usage-history",
    isBatchExact ? "batch" : "pool",
    item?.batch_code ?? null,
    siteId ?? null,
    item?.material_id ?? null,
    item?.brand_id ?? null,
  ] as const;
}

export function useUsageLog(
  item: UsageLogItem | null | undefined,
  siteId: string | undefined,
  enabled = true
) {
  const supabase = createClient();
  const isBatchExact = !!item?.batch_code && item?.kind === "group";

  const query = useQuery<UsageLogRow[]>({
    queryKey: usageLogQueryKey(item, siteId),
    enabled: enabled && !!item && !!siteId,
    queryFn: async () => {
      if (!item || !siteId) return [];

      // ---- GROUP batch ----------------------------------------------------
      if (isBatchExact && item.batch_code) {
        const { data, error } = await (supabase as any)
          .from("batch_usage_records")
          .select(
            `id, usage_date, quantity, unit, work_description, unit_cost,
             total_cost, settlement_status, batch_ref_code, material_id,
             brand_id, usage_site_id, created_by,
             usage_site:sites!batch_usage_records_usage_site_id_fkey(id, name),
             material:materials!batch_usage_records_material_id_fkey(name, unit),
             brand:brands!batch_usage_records_brand_id_fkey(brand_name)`
          )
          .eq("batch_ref_code", item.batch_code)
          .order("usage_date", { ascending: false });
        if (error) throw error;

        const rows = (data ?? []) as any[];

        // Resolve recorder names: created_by -> auth.users(id), mapped to
        // public.users via auth_id (cannot embed the auth schema directly).
        const authIds = Array.from(
          new Set(rows.map((r) => r.created_by).filter(Boolean))
        );
        const nameByAuthId = new Map<string, string>();
        if (authIds.length > 0) {
          const { data: users } = await (supabase as any)
            .from("users")
            .select("auth_id, name")
            .in("auth_id", authIds);
          for (const u of (users ?? []) as any[]) {
            if (u.auth_id) nameByAuthId.set(u.auth_id, u.name);
          }
        }

        return rows.map((r) => ({
          id: r.id,
          source: "batch" as const,
          usage_date: r.usage_date,
          quantity: Number(r.quantity ?? 0),
          unit: r.unit || r.material?.unit || item.material_unit,
          work_description: r.work_description ?? null,
          recorded_by_name: r.created_by
            ? nameByAuthId.get(r.created_by) ?? null
            : null,
          usage_site_id: r.usage_site_id ?? null,
          usage_site_name: r.usage_site?.name ?? null,
          settlement_status: r.settlement_status ?? null,
          unit_cost: r.unit_cost != null ? Number(r.unit_cost) : null,
          total_cost: r.total_cost != null ? Number(r.total_cost) : null,
          batch_ref_code: r.batch_ref_code ?? null,
          material_id: r.material_id ?? null,
          brand_id: r.brand_id ?? null,
          material_name: r.material?.name ?? item.material_name,
          brand_name: r.brand?.brand_name ?? null,
        }));
      }

      // ---- OWN / pooled ---------------------------------------------------
      let q = (supabase as any)
        .from("daily_material_usage")
        .select(
          `id, usage_date, quantity, work_description, brand_id, material_id,
           unit_cost, total_cost, site_id,
           created_by_user:users!daily_material_usage_created_by_fkey(name)`
        )
        .eq("site_id", siteId)
        .order("usage_date", { ascending: false });
      if (item.material_id) q = q.eq("material_id", item.material_id);
      const { data, error } = await q;
      if (error) throw error;

      // Brand-side filter client-side so brand_id=null entries also surface
      // when the card's brand is null (the bucket has merged variants).
      const brandFilter = item.brand_id ?? null;
      return ((data ?? []) as any[])
        .filter(
          (r) => (r.brand_id ?? null) === brandFilter || brandFilter === null
        )
        .map((r) => ({
          id: r.id,
          source: "pool" as const,
          usage_date: r.usage_date,
          quantity: Number(r.quantity ?? 0),
          unit: item.material_unit,
          work_description: r.work_description ?? null,
          recorded_by_name: r.created_by_user?.name ?? null,
          usage_site_id: r.site_id ?? null,
          usage_site_name: null,
          settlement_status: null,
          unit_cost: r.unit_cost != null ? Number(r.unit_cost) : null,
          total_cost: r.total_cost != null ? Number(r.total_cost) : null,
          batch_ref_code: null,
          material_id: r.material_id ?? null,
          brand_id: r.brand_id ?? null,
          material_name: item.material_name,
          brand_name: null,
        }));
    },
  });

  const totalUsed = useMemo(
    () => (query.data ?? []).reduce((s, r) => s + r.quantity, 0),
    [query.data]
  );

  return { ...query, rows: query.data ?? [], totalUsed, isBatchExact };
}
