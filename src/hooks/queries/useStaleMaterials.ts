"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { cacheTTL } from "@/lib/cache/keys";

export interface StaleMaterial {
  inventory_id: string;
  material_name: string;
  brand_name: string | null;
  unit: string | null;
  current_qty: number;
  last_used: string | null; // YYYY-MM-DD or null (never logged)
  days_since: number | null;
}

/**
 * In-stock materials that haven't had usage logged in `days` days (or ever).
 * Powers the non-blocking "not used in a while" reminder under the usage item —
 * a gentle nudge, NOT a per-material requirement.
 */
export function useStaleMaterials(
  siteId: string | undefined,
  days: number = 4,
  limit: number = 8
) {
  const supabase: any = createClient();

  return useQuery({
    queryKey: ["checklist", "stale-materials", siteId ?? "none", days],
    queryFn: async () => {
      if (!siteId) return [] as StaleMaterial[];
      const { data, error } = await supabase
        .from("stock_inventory")
        .select(
          `id, current_qty, last_issued_date,
           material:materials(name, unit),
           brand:material_brands(brand_name)`
        )
        .eq("site_id", siteId)
        .gt("current_qty", 0)
        .order("last_issued_date", { ascending: true, nullsFirst: true });
      if (error) throw error;

      const now = Date.now();
      const cutoffMs = days * 24 * 60 * 60 * 1000;
      const rows: StaleMaterial[] = (data ?? [])
        .map((r: any) => {
          const last = r.last_issued_date as string | null;
          const daysSince = last
            ? Math.floor((now - new Date(last).getTime()) / (24 * 60 * 60 * 1000))
            : null;
          return {
            inventory_id: r.id,
            material_name: r.material?.name ?? "Material",
            brand_name: r.brand?.brand_name ?? null,
            unit: r.material?.unit ?? null,
            current_qty: Number(r.current_qty ?? 0),
            last_used: last,
            days_since: daysSince,
          };
        })
        .filter(
          (m: StaleMaterial) =>
            m.last_used === null || now - new Date(m.last_used).getTime() >= cutoffMs
        )
        .slice(0, limit);

      return rows;
    },
    enabled: !!siteId,
    staleTime: cacheTTL.transactional,
  });
}
