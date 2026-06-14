"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { OwnStockRow } from "@/lib/material-hub/scopedMaterialSummary";

/**
 * The viewing site's own stock for a material family (parent + grade variants).
 *
 * Powers the OWN side of the Hub filtered-material summary: own-site used /
 * remaining are NOT carried on the threads (own-bucket POs have no per-PO
 * inventory by design), so we read the live `stock_inventory` rows directly.
 * Scoped to the single viewing site — sibling sites' own stock is private.
 *
 * Returns the family ids too, so the caller can filter the site's usage rows
 * (`useSiteBatchUsageRecords`) down to the same material family.
 */
export function useOwnMaterialStock({
  siteId,
  materialId,
  enabled = true,
}: {
  siteId: string | undefined;
  materialId: string | undefined;
  enabled?: boolean;
}): { ownStockRows: OwnStockRow[]; familyIds: string[]; isLoading: boolean } {
  const supabase = createClient();
  const on = enabled && !!siteId && !!materialId;

  const { data, isLoading } = useQuery({
    queryKey: ["own-material-stock", siteId, materialId],
    enabled: on,
    queryFn: async (): Promise<{ ownStockRows: OwnStockRow[]; familyIds: string[] }> => {
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

      return {
        ownStockRows: ((stock ?? []) as OwnStockRow[]).map((r) => ({
          current_qty: Number(r.current_qty) || 0,
          batch_code: r.batch_code ?? null,
        })),
        familyIds,
      };
    },
  });

  return {
    ownStockRows: data?.ownStockRows ?? [],
    familyIds: data?.familyIds ?? [],
    isLoading: on && isLoading,
  };
}
