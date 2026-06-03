"use client";

/**
 * useUsageLedgerDetail
 *
 * Given a slice of LedgerRow[] (already fetched by useMaterialUsageLedger) and
 * a materialId, resolves recorder names and site names then returns a sorted,
 * enriched list of LedgerDetailEntry ready for display in a drill-down panel.
 *
 * Name-resolution namespace split (mirrors useUsageLog.ts):
 *   source === "batch" → created_by is an auth.users id → look up via public.users.auth_id
 *   source === "own"   → created_by is a public.users id → look up via public.users.id
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { wrapQueryFn } from "@/lib/utils/timeout";
import { useSitesData } from "@/contexts/SiteContext/SitesDataContext";
import type { LedgerRow } from "./useMaterialUsageLedger";

// ─── Public interfaces ────────────────────────────────────────────────────────

export interface LedgerDetailEntry {
  id: string;
  source: "batch" | "own";
  usage_date: string;
  quantity: number;
  unit: string;
  unit_cost: number | null;
  total_cost: number | null;
  work_description: string | null;
  batch_ref_code: string | null;
  is_self_use: boolean | null;
  settlement_status: string | null;
  is_verified: boolean | null;
  consuming_site_id: string;
  consuming_site_name: string;
  recorded_by_name: string;
  created_at: string | null;
  brand_id: string | null;
  section_id: string | null;
}

// ─── Pure builder (exported for unit-testing) ─────────────────────────────────

/**
 * Build enriched detail entries from raw LedgerRows, resolving recorder names
 * and site names from pre-fetched lookup maps.
 *
 * @param rows          Full row set (will be filtered to materialId)
 * @param materialId    The material to drill into
 * @param usersByAuthId Map of auth.users id → display name (for "batch" rows)
 * @param usersById     Map of public.users id → display name (for "own" rows)
 * @param sitesById     Map of site id → site name
 */
export function buildLedgerDetailEntries(
  rows: LedgerRow[],
  materialId: string,
  usersByAuthId: Map<string, string>,
  usersById: Map<string, string>,
  sitesById: Map<string, string>,
): LedgerDetailEntry[] {
  const filtered = rows.filter((r) => r.material_id === materialId);

  const entries: LedgerDetailEntry[] = filtered.map((row) => {
    // Resolve recorder name based on source namespace
    let recorded_by_name = "—";
    if (row.created_by) {
      if (row.source === "batch") {
        recorded_by_name = usersByAuthId.get(row.created_by) ?? "—";
      } else {
        // source === "own"
        recorded_by_name = usersById.get(row.created_by) ?? "—";
      }
    }

    return {
      id: row.id,
      source: row.source,
      usage_date: row.usage_date,
      quantity: Number(row.quantity),
      unit: row.unit,
      unit_cost: row.unit_cost,
      total_cost: row.total_cost,
      work_description: row.work_description ?? null,
      batch_ref_code: row.batch_ref_code ?? null,
      is_self_use: row.is_self_use ?? null,
      settlement_status: row.settlement_status ?? null,
      is_verified: row.is_verified ?? null,
      consuming_site_id: row.site_id,
      consuming_site_name: sitesById.get(row.site_id) ?? row.site_id,
      recorded_by_name,
      created_at: row.created_at ?? null,
      brand_id: row.brand_id ?? null,
      section_id: row.section_id ?? null,
    };
  });

  // Sort descending by usage_date (stable: equal dates keep original order)
  return entries.sort((a, b) => b.usage_date.localeCompare(a.usage_date));
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Fetches recorder names for the filtered rows and returns enriched
 * LedgerDetailEntry[]. Site names are sourced from SiteContext (no extra query).
 *
 * @param rows      Full LedgerRow[] from useMaterialUsageLedger
 * @param materialId  The material to drill into (null → disabled)
 * @param scopeKey  Opaque string identifying the current ledger scope/filters
 *                  (included in the query key so cache invalidates on scope change)
 */
export function useUsageLedgerDetail(
  rows: LedgerRow[],
  materialId: string | null,
  scopeKey: string,
): { entries: LedgerDetailEntry[]; isLoading: boolean } {
  const supabase = createClient();
  const { sites } = useSitesData();

  // Build sitesById from SiteContext (no DB query needed)
  const sitesById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sites) {
      m.set(s.id, s.name);
    }
    return m;
  }, [sites]);

  // Collect distinct created_by ids from the filtered rows, split by source
  const { batchAuthIds, ownPublicIds } = useMemo(() => {
    if (!materialId) return { batchAuthIds: [], ownPublicIds: [] };
    const filtered = rows.filter((r) => r.material_id === materialId);
    const authSet = new Set<string>();
    const ownSet = new Set<string>();
    for (const r of filtered) {
      if (!r.created_by) continue;
      if (r.source === "batch") authSet.add(r.created_by);
      else ownSet.add(r.created_by);
    }
    return {
      batchAuthIds: Array.from(authSet),
      ownPublicIds: Array.from(ownSet),
    };
  }, [rows, materialId]);

  // Include the resolved id sets in the cache key so the name lookup re-runs
  // when the rows (and therefore the recorder ids) arrive/change. Without this,
  // a first render where `rows` is still empty would cache an empty user map
  // under a stable key and recorder names would stay unresolved ("—").
  const idKey = useMemo(
    () => `${[...batchAuthIds].sort().join(",")}|${[...ownPublicIds].sort().join(",")}`,
    [batchAuthIds, ownPublicIds],
  );

  // Fetch public.users rows covering both auth-id and own-id lookups.
  // We use a single query with .or() to minimise round-trips.
  const { data: usersData, isLoading } = useQuery<
    Array<{ id: string; auth_id: string | null; name: string }>
  >({
    queryKey: ["usage-ledger-detail", scopeKey, materialId, idKey],
    enabled: !!materialId,
    queryFn: wrapQueryFn(
      async () => {
        // Build OR filter: auth_id.in.(batchAuthIds) and/or id.in.(ownPublicIds)
        const filters: string[] = [];
        if (batchAuthIds.length > 0) {
          filters.push(`auth_id.in.(${batchAuthIds.join(",")})`);
        }
        if (ownPublicIds.length > 0) {
          filters.push(`id.in.(${ownPublicIds.join(",")})`);
        }

        if (filters.length === 0) return [];

        const { data, error } = await (supabase as any)
          .from("users")
          .select("id, auth_id, name")
          .or(filters.join(","));

        if (error) throw error;
        return (data ?? []) as Array<{
          id: string;
          auth_id: string | null;
          name: string;
        }>;
      },
      { timeoutMs: 20000, operationName: "useUsageLedgerDetail" },
    ),
  });

  // Build lookup maps from query result
  const { usersByAuthId, usersById } = useMemo(() => {
    const byAuthId = new Map<string, string>();
    const byId = new Map<string, string>();
    for (const u of usersData ?? []) {
      if (u.auth_id) byAuthId.set(u.auth_id, u.name);
      byId.set(u.id, u.name);
    }
    return { usersByAuthId: byAuthId, usersById: byId };
  }, [usersData]);

  // Compute entries (falls back to "—" names while users query is loading)
  const entries = useMemo(
    () =>
      materialId
        ? buildLedgerDetailEntries(
            rows,
            materialId,
            usersByAuthId,
            usersById,
            sitesById,
          )
        : [],
    [rows, materialId, usersByAuthId, usersById, sitesById],
  );

  return { entries, isLoading };
}
