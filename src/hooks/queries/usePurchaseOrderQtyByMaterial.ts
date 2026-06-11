"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { wrapQueryFn } from "@/lib/utils/timeout";

/**
 * Ordered (purchase-order) quantity per material, split into the quantity
 * ordered on GROUP purchase orders vs OWN-site purchase orders. Surfaced as
 * columns next to "Qty Used" in the Usage Ledger.
 *
 * Counting basis (matches useMaterialOrderStats): active POs only — draft and
 * cancelled are excluded; all-time cumulative (the ledger date filter does not
 * apply to ordered totals). Variants roll up to their parent material with the
 * same COALESCE(parent_id, material_id) key the ledger uses, so PPC variants
 * line up with the usage rows.
 *
 * "Group vs own" is defined per a scope (a set of own-site ids + a set of group
 * ids), which lets the same logic serve the single-site ledger and the
 * company-wide views (all sites / one group / one site).
 */

export interface OrderedQtyByMaterial {
  group_qty: number;
  own_qty: number;
  total_qty: number;
  unit: string;
}

/** One PO line item flattened with its header + material rollup info. */
export interface POItemRecord {
  material_id: string;
  quantity: number | null;
  /** The material's own unit (e.g. "bag"). */
  unit: string | null;
  /** The material's parent id, when it is a grade/size variant. */
  parent_id: string | null;
  /** The owning PO's site. */
  po_site_id: string | null;
  /** The owning PO's group (non-null = group purchase). */
  po_site_group_id: string | null;
}

/**
 * Pure aggregator (exported for unit-testing). Buckets PO line items by the
 * rolled-up material key and splits group vs own for the given scope:
 *
 *   group_qty = items on POs whose site_group_id ∈ groupIds
 *   own_qty   = items on POs with no group, ordered by a site ∈ ownSiteIds
 *   total_qty = group_qty + own_qty
 *
 * Items outside the scope (other sites' own POs, other groups) are ignored.
 */
export function aggregateOrderedQty(
  items: POItemRecord[],
  ownSiteIds: Set<string>,
  groupIds: Set<string>,
): Map<string, OrderedQtyByMaterial> {
  const map = new Map<string, OrderedQtyByMaterial>();
  for (const it of items) {
    const key = it.parent_id ?? it.material_id;
    const qty = Number(it.quantity) || 0;

    const isGroup = it.po_site_group_id != null && groupIds.has(it.po_site_group_id);
    const isOwn =
      it.po_site_group_id == null && it.po_site_id != null && ownSiteIds.has(it.po_site_id);
    if (!isGroup && !isOwn) continue;

    const cur =
      map.get(key) ??
      { group_qty: 0, own_qty: 0, total_qty: 0, unit: it.unit ?? "" };
    if (isGroup) cur.group_qty += qty;
    if (isOwn) cur.own_qty += qty;
    cur.total_qty = cur.group_qty + cur.own_qty;
    if (!cur.unit && it.unit) cur.unit = it.unit;
    map.set(key, cur);
  }
  return map;
}

/**
 * Fetch all active PO line items once (cached globally, 5-min stale). Both the
 * site ledger and the company view aggregate this same cached list for their
 * own scope, so switching scope never refetches.
 */
export function usePurchaseOrderItems(): {
  items: POItemRecord[];
  isLoading: boolean;
} {
  const supabase = createClient();

  const { data: items = [], isLoading } = useQuery<POItemRecord[]>({
    queryKey: ["po-qty-by-material", "active-items"],
    queryFn: wrapQueryFn(
      async () => {
        const { data, error } = await supabase
          .from("purchase_order_items")
          .select(
            `material_id,
             quantity,
             material:materials(unit, parent_id),
             purchase_orders!inner(site_id, site_group_id, status)`,
          )
          .not("purchase_orders.status", "in", '("cancelled","draft")');

        if (error) {
          // Degrade gracefully — the ordered columns just won't render.
          console.warn("Could not fetch PO quantities:", error.message);
          return [];
        }

        return (data ?? []).map((row: any) => ({
          material_id: row.material_id,
          quantity: row.quantity,
          unit: row.material?.unit ?? null,
          parent_id: row.material?.parent_id ?? null,
          po_site_id: row.purchase_orders?.site_id ?? null,
          po_site_group_id: row.purchase_orders?.site_group_id ?? null,
        })) as POItemRecord[];
      },
      { operationName: "usePurchaseOrderItems" },
    ),
    staleTime: 5 * 60 * 1000,
  });

  return { items, isLoading };
}

/**
 * Single-site convenience (the site Usage Ledger): ordered qty for one site
 * plus its group, keyed by parent_id ?? material_id.
 */
export function usePurchaseOrderQtyByMaterial(
  siteId: string | undefined,
  siteGroupId: string | null | undefined,
): { data: Map<string, OrderedQtyByMaterial>; isLoading: boolean } {
  const { items, isLoading } = usePurchaseOrderItems();
  const data = useMemo(() => {
    const ownSiteIds = new Set(siteId ? [siteId] : []);
    const groupIds = new Set(siteGroupId ? [siteGroupId] : []);
    return aggregateOrderedQty(items, ownSiteIds, groupIds);
  }, [items, siteId, siteGroupId]);
  return { data, isLoading };
}

/**
 * Scoped variant for the company view. Pass the set of own-site ids and group
 * ids that define the current scope (all sites / one group / one site).
 */
export function usePurchaseOrderQtyByScope(
  ownSiteIds: string[],
  groupIds: string[],
): { data: Map<string, OrderedQtyByMaterial>; isLoading: boolean } {
  const { items, isLoading } = usePurchaseOrderItems();
  // Stable string keys so the memo doesn't rerun on new array identities; the
  // sets are rebuilt from those same keys (no array deps to satisfy linting).
  const ownKey = [...ownSiteIds].sort().join(",");
  const groupKey = [...groupIds].sort().join(",");
  const data = useMemo(() => {
    const own = new Set(ownKey ? ownKey.split(",") : []);
    const grp = new Set(groupKey ? groupKey.split(",") : []);
    return aggregateOrderedQty(items, own, grp);
  }, [items, ownKey, groupKey]);
  return { data, isLoading };
}
