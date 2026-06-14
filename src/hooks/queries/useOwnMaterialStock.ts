"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { OwnStockRow, OwnUsageRow } from "@/lib/material-hub/scopedMaterialSummary";

/**
 * The viewing site's own stock + own-site usage for a material family
 * (parent + grade variants).
 *
 * Powers the OWN side of the Hub filtered-material summary: own-site used /
 * remaining are NOT carried on the threads (own-bucket POs have no per-PO
 * inventory by design), so we read them directly:
 *  - `ownStockRows` from live `stock_inventory` (→ OWN remaining / on-hand);
 *  - `ownUsageRows` from `daily_material_usage` where `is_group_stock=false`
 *    (→ OWN used). Own-stock consumption goes to daily_material_usage, NOT to
 *    `batch_usage_records` (that's the GROUP ledger), so the OWN "Used" must
 *    read it here or it reads 0.
 * Scoped to the single viewing site — sibling sites' own stock is private.
 *
 * Returns the family ids too, for any caller that needs the resolved family.
 */
export function useOwnMaterialStock({
  siteId,
  materialId,
  enabled = true,
}: {
  siteId: string | undefined;
  materialId: string | undefined;
  enabled?: boolean;
}): {
  ownStockRows: OwnStockRow[];
  ownUsageRows: OwnUsageRow[];
  familyIds: string[];
  isLoading: boolean;
} {
  const supabase = createClient();
  const on = enabled && !!siteId && !!materialId;

  const { data, isLoading } = useQuery({
    queryKey: ["own-material-stock", siteId, materialId],
    enabled: on,
    queryFn: async (): Promise<{
      ownStockRows: OwnStockRow[];
      ownUsageRows: OwnUsageRow[];
      familyIds: string[];
    }> => {
      // Family = the material itself plus its grade variants (parent_id === it).
      const { data: fam, error: famErr } = await (supabase as any)
        .from("materials")
        .select("id, parent_id")
        .or(`id.eq.${materialId},parent_id.eq.${materialId}`);
      if (famErr) throw famErr;
      const familyIds = [
        ...new Set<string>([materialId as string, ...((fam ?? []) as Array<{ id: string }>).map((m) => m.id)]),
      ];

      const { data: stock, error: stockErr } = await (supabase as any)
        .from("stock_inventory")
        .select("current_qty, batch_code")
        .eq("site_id", siteId)
        .in("material_id", familyIds);
      if (stockErr) throw stockErr;

      // Own-site consumption: daily_material_usage rows NOT against group stock.
      const { data: usage, error: usageErr } = await (supabase as any)
        .from("daily_material_usage")
        .select("quantity")
        .eq("site_id", siteId)
        .in("material_id", familyIds)
        .eq("is_group_stock", false);
      if (usageErr) throw usageErr;

      return {
        ownStockRows: ((stock ?? []) as OwnStockRow[]).map((r) => ({
          current_qty: Number(r.current_qty) || 0,
          batch_code: r.batch_code ?? null,
        })),
        // batch_ref_code = null: is_group_stock=false already guarantees own
        // usage, so it passes scopedMaterialSummary's group-ref exclusion.
        ownUsageRows: ((usage ?? []) as Array<{ quantity: number | string }>).map((r) => ({
          quantity: Number(r.quantity) || 0,
          batch_ref_code: null,
        })),
        familyIds,
      };
    },
  });

  return {
    ownStockRows: data?.ownStockRows ?? [],
    ownUsageRows: data?.ownUsageRows ?? [],
    familyIds: data?.familyIds ?? [],
    isLoading: on && isLoading,
  };
}
