import type { MaterialThread } from "./threadTypes";

/**
 * Scope-aware roll-up for the Hub's filtered-material summary strip.
 *
 * Splits the filtered threads into GROUP (shared cluster pool) and OWN
 * (the viewing site's dedicated own-site purchases) so the engineer can see,
 * for one material, what's group vs own — and for the group pool, what each
 * cluster site has used vs still holds.
 *
 * GROUP comes entirely from the threads: `inventory` is cluster-wide and
 * `inventory.per_site` is ledger-true (used by `usage_site_id`).
 *
 * OWN used/remaining are NOT on the threads (own-site shared-bucket POs carry
 * no per-PO inventory by design), so they come from the viewing site's own
 * stock rows + usage rows. A group batch the owning site self-consumed stays
 * GROUP: rows whose batch ref is in `groupRefCodes` are excluded from OWN.
 */

/** A viewing-site stock_inventory row for the material family. */
export interface OwnStockRow {
  current_qty: number;
  batch_code: string | null;
}

/** A viewing-site batch_usage_records row for the material family. */
export interface OwnUsageRow {
  quantity: number;
  batch_ref_code: string | null;
}

export interface ScopeTotals {
  ordered: number;
  delivered: number;
  used: number;
  remaining: number;
}

export interface PerSiteScope {
  site_id: string;
  site_name: string;
  used: number;
  /** Qty still physically held at this site (received − used for the batch). */
  held: number;
}

export interface GroupScope extends ScopeTotals {
  /** Per-site used/held from the batches that carry a multi-site split. */
  perSite: PerSiteScope[];
  /** Σ received across the per-site batches (so the usage bar reconciles). */
  totalReceived: number;
}

export interface OwnScope extends ScopeTotals {
  /** Whether the OWN line is worth showing (any non-zero figure). */
  present: boolean;
}

export interface ScopedMaterialSummary {
  group: GroupScope;
  own: OwnScope;
  /** Shared unit when every contributing thread agrees, else null. */
  unit: string | null;
  threadCount: number;
}

export function summarizeScopedMaterial(args: {
  threads: MaterialThread[];
  viewingSiteId: string;
  viewingSiteName: string;
  ownStockRows: OwnStockRow[];
  ownUsageRows: OwnUsageRow[];
  groupRefCodes: Set<string>;
}): ScopedMaterialSummary {
  const { threads, ownStockRows, ownUsageRows, groupRefCodes } = args;

  const units = new Set<string>();

  // ── GROUP (from threads) ──────────────────────────────────────────────
  const seenGroupPo = new Set<string>();
  const seenGroupBatch = new Set<string>();
  const perSite = new Map<string, PerSiteScope>();
  const group: GroupScope = {
    ordered: 0,
    delivered: 0,
    used: 0,
    remaining: 0,
    perSite: [],
    totalReceived: 0,
  };

  // ── OWN ordered/delivered (from threads) ──────────────────────────────
  const seenOwnPo = new Set<string>();
  let ownOrdered = 0;
  let ownDelivered = 0;

  for (const t of threads) {
    if (t.material_unit) units.add(t.material_unit);

    if (t.kind === "group") {
      if (t.po && !seenGroupPo.has(t.po.id)) {
        seenGroupPo.add(t.po.id);
        group.ordered += t.po.qty ?? 0;
        group.delivered += t.po.received_qty ?? 0;
      }
      const inv = t.inventory;
      if (inv && inv.batch && !seenGroupBatch.has(inv.batch)) {
        seenGroupBatch.add(inv.batch);
        group.used += inv.used ?? 0;
        group.remaining += inv.remaining ?? 0;
        if (inv.per_site && inv.per_site.length > 0) {
          group.totalReceived += inv.received ?? 0;
          for (const ps of inv.per_site) {
            const prev = perSite.get(ps.site_id);
            const used = ps.used ?? 0;
            // Held now = the live current_qty when the mapper supplies it (so
            // the per-site roll-up reconciles with the headline remaining);
            // fall back to received − used for older callers.
            const held =
              ps.remaining != null
                ? Math.max(0, ps.remaining)
                : Math.max(0, (ps.received ?? 0) - (ps.used ?? 0));
            if (prev) {
              prev.used += used;
              prev.held += held;
            } else {
              perSite.set(ps.site_id, {
                site_id: ps.site_id,
                site_name: ps.site_name,
                used,
                held,
              });
            }
          }
        }
      }
    } else if (t.kind === "own") {
      if (t.po && !seenOwnPo.has(t.po.id)) {
        seenOwnPo.add(t.po.id);
        ownOrdered += t.po.qty ?? 0;
        ownDelivered += t.po.received_qty ?? 0;
      }
    }
  }

  group.perSite = Array.from(perSite.values()).sort((a, b) => b.used - a.used);

  // ── OWN used/remaining (from viewing-site stock + usage, group excluded) ─
  const isGroupRef = (code: string | null) => !!code && groupRefCodes.has(code);
  const ownRemaining = ownStockRows
    .filter((r) => !isGroupRef(r.batch_code))
    .reduce((s, r) => s + Math.max(0, Number(r.current_qty) || 0), 0);
  const ownUsed = ownUsageRows
    .filter((r) => !isGroupRef(r.batch_ref_code))
    .reduce((s, r) => s + Math.max(0, Number(r.quantity) || 0), 0);

  const own: OwnScope = {
    ordered: ownOrdered,
    delivered: ownDelivered,
    used: ownUsed,
    remaining: ownRemaining,
    present: ownOrdered > 0 || ownDelivered > 0 || ownUsed > 0 || ownRemaining > 0,
  };

  return {
    group,
    own,
    unit: units.size === 1 ? Array.from(units)[0] : null,
    threadCount: threads.length,
  };
}
