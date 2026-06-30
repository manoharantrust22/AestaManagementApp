/**
 * useTeaEntryBreakdown
 *
 * Read-only breakdown of a single GROUP tea entry, for the verification view on
 * the tea-shop settlement page. Given an entry id, returns:
 *   - the per-site split (amount, %, man-days, worker count) from
 *     `tea_shop_entry_allocations`, and
 *   - the per-contract lines per site (which crews/contracts were included and
 *     for how much) from `tea_shop_entry_contract_selections`.
 *
 * The site engineer cross-checks the original total + this split against the tea
 * shop's handwritten notebook. Lazy by design — pass `enabled: false` until the
 * row is actually expanded so we never fetch for collapsed rows.
 *
 * NB: this reads `allocated_amount` (the split), which is independent of the paid
 * waterfall, so it stays correct regardless of the per-shop/group-pooled
 * `amount_paid` disagreement noted elsewhere in the tea-shop code.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { cacheTTL } from "@/lib/cache/keys";
import {
  useTeaEntryContractSelections,
  type TeaEntryContractSelectionRow,
} from "@/hooks/queries/useTeaEntryContractSelections";

export interface TeaSiteBreakdown {
  site_id: string;
  site_name: string;
  allocated_amount: number;
  allocation_percentage: number;
  day_units_sum: number;
  worker_count: number;
}

export type TeaContractLine = TeaEntryContractSelectionRow;

export interface TeaEntryBreakdown {
  /** Per-site split rows (one per participating site). */
  allocations: TeaSiteBreakdown[];
  /** Per-contract lines, grouped by site_id. */
  selectionsBySite: Map<string, TeaContractLine[]>;
  /** Σ of allocated_amount across sites — used for the reconcile-to-total check. */
  allocationsTotal: number;
  isLoading: boolean;
}

export function useTeaEntryBreakdown(
  entryId: string | null | undefined,
  opts?: { enabled?: boolean }
): TeaEntryBreakdown {
  const supabase = createClient();
  const enabled = !!entryId && (opts?.enabled ?? true);

  const allocQuery = useQuery({
    queryKey: ["tea-entry-breakdown-allocations", entryId],
    enabled,
    staleTime: cacheTTL.transactional,
    queryFn: async (): Promise<TeaSiteBreakdown[]> => {
      const { data, error } = await (supabase as any)
        .from("tea_shop_entry_allocations")
        .select(
          "site_id, allocated_amount, allocation_percentage, day_units_sum, worker_count, site:sites(id, name)"
        )
        .eq("entry_id", entryId);
      if (error) {
        console.warn("Tea entry allocation breakdown lookup failed:", error.message);
        return [];
      }
      return (data ?? []).map((a: any) => ({
        site_id: a.site_id,
        site_name: a.site?.name ?? "Unknown site",
        allocated_amount: Number(a.allocated_amount) || 0,
        allocation_percentage: Number(a.allocation_percentage) || 0,
        day_units_sum: Number(a.day_units_sum) || 0,
        worker_count: Number(a.worker_count) || 0,
      }));
    },
  });

  const { data: selections } = useTeaEntryContractSelections(
    enabled ? entryId : null
  );

  return useMemo(() => {
    const allocations = (allocQuery.data ?? [])
      .slice()
      .sort((a, b) => b.allocated_amount - a.allocated_amount);

    const selectionsBySite = new Map<string, TeaContractLine[]>();
    for (const sel of selections ?? []) {
      const arr = selectionsBySite.get(sel.site_id) ?? [];
      arr.push(sel);
      selectionsBySite.set(sel.site_id, arr);
    }

    const allocationsTotal = allocations.reduce(
      (s, a) => s + a.allocated_amount,
      0
    );

    return {
      allocations,
      selectionsBySite,
      allocationsTotal,
      isLoading: allocQuery.isLoading,
    };
  }, [allocQuery.data, allocQuery.isLoading, selections]);
}
