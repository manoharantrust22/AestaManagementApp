import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { wrapQueryFn } from "@/lib/utils/timeout";

export interface LedgerRow {
  id: string;
  site_id: string;
  site_group_id: string | null;
  material_id: string;
  brand_id: string | null;
  section_id: string | null;
  quantity: number;
  unit: string;
  unit_cost: number | null;
  total_cost: number | null;
  usage_date: string;
  work_description: string | null;
  source: "batch" | "own";
  // Flat columns from the view (UNION views don't support PostgREST FK embeds)
  material_name: string | null;
  section_name: string | null;
  // Provenance columns added in migration 20260603090000
  batch_ref_code: string | null;
  created_by: string | null;
  created_at: string | null;
  is_self_use: boolean | null;
  settlement_status: string | null;
  is_verified: boolean | null;
  // Convenience accessors shaped like embedded joins (derived from flat cols)
  material: { id: string; name: string } | null;
  section: { id: string; name: string } | null;
}

export interface MaterialGroup {
  material_id: string;
  material_name: string;
  unit: string;
  total_qty: number;
  total_cost: number;
  avg_unit_cost: number;
  untagged_count: number;
  section_breakdown: SectionBreakdown[];
}

export interface SectionBreakdown {
  section_id: string | null;
  section_name: string;
  total_qty: number;
  total_cost: number;
}

export interface SectionGroup {
  section_id: string | null;
  section_name: string;
  total_cost: number;
  total_qty: number;
  material_breakdown: MaterialBreakdown[];
}

export interface MaterialBreakdown {
  material_id: string;
  material_name: string;
  unit: string;
  total_qty: number;
  total_cost: number;
}

export interface LedgerFilters {
  site_id?: string;
  site_group_id?: string;
  from_date?: string;
  to_date?: string;
  all?: boolean;
}

export function groupByMaterial(rows: LedgerRow[]): MaterialGroup[] {
  const map = new Map<string, { rows: LedgerRow[]; material_name: string; unit: string }>();
  for (const row of rows) {
    if (!map.has(row.material_id)) {
      map.set(row.material_id, {
        rows: [],
        material_name: row.material?.name ?? row.material_id,
        unit: row.unit,
      });
    }
    map.get(row.material_id)!.rows.push(row);
  }

  return Array.from(map.entries()).map(([material_id, { rows: mRows, material_name, unit }]) => {
    const total_qty = mRows.reduce((s, r) => s + r.quantity, 0);
    const total_cost = mRows.reduce((s, r) => s + (r.total_cost ?? 0), 0);
    const avg_unit_cost = total_qty > 0 ? total_cost / total_qty : 0;
    const untagged_count = mRows.filter((r) => r.section_id === null).length;

    const sectionMap = new Map<string | null, { qty: number; cost: number; name: string }>();
    for (const r of mRows) {
      const key = r.section_id ?? null;
      if (!sectionMap.has(key)) {
        sectionMap.set(key, { qty: 0, cost: 0, name: r.section?.name ?? "Untagged" });
      }
      const s = sectionMap.get(key)!;
      s.qty += r.quantity;
      s.cost += r.total_cost ?? 0;
    }

    const section_breakdown: SectionBreakdown[] = Array.from(sectionMap.entries()).map(
      ([section_id, { qty, cost, name }]) => ({
        section_id,
        section_name: name,
        total_qty: qty,
        total_cost: cost,
      })
    );

    return {
      material_id,
      material_name,
      unit,
      total_qty,
      total_cost,
      avg_unit_cost,
      untagged_count,
      section_breakdown,
    };
  });
}

export function groupBySection(rows: LedgerRow[]): SectionGroup[] {
  const map = new Map<string | null, { rows: LedgerRow[]; section_name: string }>();
  for (const row of rows) {
    const key = row.section_id ?? null;
    if (!map.has(key)) {
      map.set(key, { rows: [], section_name: row.section?.name ?? "Untagged" });
    }
    map.get(key)!.rows.push(row);
  }

  return Array.from(map.entries()).map(([section_id, { rows: sRows, section_name }]) => {
    const total_cost = sRows.reduce((s, r) => s + (r.total_cost ?? 0), 0);
    const total_qty = sRows.reduce((s, r) => s + r.quantity, 0);

    const matMap = new Map<string, { qty: number; cost: number; name: string; unit: string }>();
    for (const r of sRows) {
      if (!matMap.has(r.material_id)) {
        matMap.set(r.material_id, {
          qty: 0,
          cost: 0,
          name: r.material?.name ?? r.material_id,
          unit: r.unit,
        });
      }
      const m = matMap.get(r.material_id)!;
      m.qty += r.quantity;
      m.cost += r.total_cost ?? 0;
    }

    const material_breakdown: MaterialBreakdown[] = Array.from(matMap.entries()).map(
      ([material_id, { qty, cost, name, unit }]) => ({
        material_id,
        material_name: name,
        unit,
        total_qty: qty,
        total_cost: cost,
      })
    );

    return { section_id, section_name, total_cost, total_qty, material_breakdown };
  });
}

export function useMaterialUsageLedger(filters: LedgerFilters) {
  const supabase = createClient();
  const { site_id, site_group_id, from_date, to_date, all } = filters;

  return useQuery<LedgerRow[]>({
    queryKey: ["material-usage-ledger", site_id, site_group_id, from_date, to_date, all],
    enabled: !!(site_id || site_group_id || all),
    queryFn: wrapQueryFn(async () => {
      // v_material_usage_ledger is a UNION view — PostgREST can't resolve FK
      // embeds on UNION views, so we select flat columns and shape them here.
      // eslint-disable-next-line -- supabase client cast; view not yet in generated types
      let query = (supabase as any)
        .from("v_material_usage_ledger")
        .select(
          `id, site_id, site_group_id, material_id, brand_id, section_id,
           quantity, unit, unit_cost, total_cost, usage_date, work_description, source,
           material_name, section_name,
           batch_ref_code, created_by, created_at, is_self_use, settlement_status, is_verified`
        )
        .order("usage_date", { ascending: false });

      if (site_id) query = query.eq("site_id", site_id);
      if (site_group_id && !site_id) query = query.eq("site_group_id", site_group_id);
      if (from_date) query = query.gte("usage_date", from_date);
      if (to_date) query = query.lte("usage_date", to_date);

      const { data, error } = await query;
      if (error) throw error;

      // Shape flat columns into the expected nested accessors
      return ((data ?? []) as any[]).map((row) => ({
        ...row,
        material: row.material_name ? { id: row.material_id, name: row.material_name } : null,
        section: row.section_name ? { id: row.section_id, name: row.section_name } : null,
      })) as LedgerRow[];
    }, { timeoutMs: 25000, operationName: "useMaterialUsageLedger" }),
  });
}
