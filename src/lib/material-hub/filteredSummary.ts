import type { MaterialThread } from "./threadTypes";

export interface FilteredSummary {
  /** Σ ordered qty across unique POs in the filtered set. */
  ordered: number;
  /** Σ received qty across unique POs (total delivered so far). */
  delivered: number;
  /** Σ used qty across unique batch-scoped inventory rows. */
  used: number;
  /** Σ remaining qty across unique batch-scoped inventory rows. */
  remaining: number;
  /** The shared unit when every contributing thread agrees, else null
   *  (a parent-material filter can span multiple units). */
  unit: string | null;
  /** Per-site used breakdown (site name → qty) for cross-checking the ledger. */
  perSiteUsed: Array<{ site_name: string; used: number }>;
  /** How many threads fed the summary. */
  threadCount: number;
}

/**
 * Aggregate a filtered Hub thread list into purchased / delivered / used /
 * remaining totals plus a per-site used breakdown.
 *
 * Dedup rules avoid double counting when more than one thread points at the
 * same artefact:
 *   - ordered/delivered are summed once per PO id.
 *   - used/remaining are summed once per inventory batch code (the cluster-wide
 *     figure already lives on each thread's inventory).
 *   - per-site used uses `inventory.per_site` (cluster split, carries names)
 *     once per batch; threads without a split attribute their used to the
 *     viewing site (own-site or single-site-here group batches).
 *
 * Used/remaining come only from batch-scoped inventory (group/historical
 * batches); own-site shared-bucket POs deliberately have no per-PO inventory,
 * so for those filters delivered/ordered are the meaningful figures.
 */
export function summarizeFilteredThreads(
  threads: MaterialThread[],
  viewingSiteName: string
): FilteredSummary {
  const seenPo = new Set<string>();
  const seenBatch = new Set<string>();
  const units = new Set<string>();
  const perSite = new Map<string, number>();

  let ordered = 0;
  let delivered = 0;
  let used = 0;
  let remaining = 0;

  for (const t of threads) {
    if (t.po && !seenPo.has(t.po.id)) {
      seenPo.add(t.po.id);
      ordered += t.po.qty ?? 0;
      delivered += t.po.received_qty ?? 0;
      if (t.material_unit) units.add(t.material_unit);
    }

    const inv = t.inventory;
    if (inv && inv.batch && !seenBatch.has(inv.batch)) {
      seenBatch.add(inv.batch);
      used += inv.used ?? 0;
      remaining += inv.remaining ?? 0;
      if (t.material_unit) units.add(t.material_unit);

      if (inv.per_site && inv.per_site.length > 1) {
        for (const ps of inv.per_site) {
          perSite.set(ps.site_name, (perSite.get(ps.site_name) ?? 0) + ps.used);
        }
      } else if ((inv.used ?? 0) > 0) {
        // Single-site / own batch — its usage belongs to the viewing site.
        perSite.set(
          viewingSiteName,
          (perSite.get(viewingSiteName) ?? 0) + (inv.used ?? 0)
        );
      }
    }
  }

  const perSiteUsed = Array.from(perSite.entries())
    .map(([site_name, u]) => ({ site_name, used: u }))
    .sort((a, b) => b.used - a.used);

  return {
    ordered,
    delivered,
    used,
    remaining,
    unit: units.size === 1 ? Array.from(units)[0] : null,
    perSiteUsed,
    threadCount: threads.length,
  };
}
