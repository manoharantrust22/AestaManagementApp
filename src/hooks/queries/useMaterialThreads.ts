"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useMaterialRequests } from "@/hooks/queries/useMaterialRequests";
import { usePurchaseOrders } from "@/hooks/queries/usePurchaseOrders";
import type {
  MaterialRequestWithDetails,
  PurchaseOrderWithDetails,
} from "@/types/material.types";
import type {
  MaterialThread,
  ThreadStage,
  ThreadKind,
  ThreadDeliveryBatch,
  ThreadInventory,
} from "@/lib/material-hub/threadTypes";
import { parseGroupMeta } from "@/lib/material-hub/groupMeta";

// ----------------------------------------------------------------------------
// Deliveries per site (joined with delivery_items so we can group by PO + material)
// ----------------------------------------------------------------------------

export interface DeliveryRow {
  id: string;
  grn_number: string;
  po_id: string;
  site_id: string;
  delivery_date: string;
  delivery_status: string;
  verified: boolean | null;
  vehicle_number: string | null;
  notes: string | null;
  invoice_url: string | null;
  challan_url: string | null;
  items: Array<{
    material_id: string;
    received_qty: number | string;
    accepted_qty: number | string;
  }>;
}

function useSiteDeliveries(
  siteId: string | undefined,
  siteGroupId: string | null | undefined
) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["deliveries", "for-site", siteId ?? null, siteGroupId ?? null],
    enabled: !!siteId,
    queryFn: async () => {
      // For cluster-mate group threads to render their delivery batches on
      // the consumer site, we need deliveries from ALL sites in the group.
      // deliveries doesn't store site_group_id, so resolve sibling site IDs
      // first then filter by site_id IN (this site, sibling sites).
      let siteIds: string[] = siteId ? [siteId] : [];
      if (siteGroupId) {
        const { data: sites, error: sitesErr } = await (supabase as any)
          .from("sites")
          .select("id")
          .eq("site_group_id", siteGroupId);
        if (sitesErr) throw sitesErr;
        const ids = ((sites ?? []) as Array<{ id: string }>).map((s) => s.id);
        if (ids.length > 0) siteIds = ids;
      }

      let query = (supabase as any)
        .from("deliveries")
        .select(
          `
          id, grn_number, po_id, site_id, delivery_date, delivery_status,
          verified, vehicle_number, notes, invoice_url, challan_url,
          items:delivery_items(material_id, received_qty, accepted_qty)
          `
        )
        .in("site_id", siteIds)
        .order("delivery_date", { ascending: false });

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as DeliveryRow[];
    },
    staleTime: 60000,
  });
}

// ----------------------------------------------------------------------------
// Stock inventory + usage totals per (site, material)
// ----------------------------------------------------------------------------

export interface StockRow {
  id: string;
  site_id: string;
  material_id: string;
  current_qty: number | string;
  available_qty: number | string;
  batch_code: string | null;
  last_received_date: string | null;
}

export interface UsageTotalRow {
  inventory_id: string;
  total_used: number;
}

function useSiteStockInventory(
  siteId: string | undefined,
  siteGroupId: string | null | undefined
) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["stock-inventory", "for-hub-site", siteId ?? null, siteGroupId ?? null],
    enabled: !!siteId,
    queryFn: async () => {
      // Fetch stock across the whole cluster (not just this site) so a group
      // thread's shared batch — which physically lands at the originating
      // (cluster-mate) site — resolves on any site that views the thread.
      // stock_inventory has no site_group_id, so resolve sibling site IDs first
      // then filter by site_id IN (...). Mirrors useSiteDeliveries above.
      let siteIds: string[] = siteId ? [siteId] : [];
      if (siteGroupId) {
        const { data: sites, error: sitesErr } = await (supabase as any)
          .from("sites")
          .select("id")
          .eq("site_group_id", siteGroupId);
        if (sitesErr) throw sitesErr;
        const ids = ((sites ?? []) as Array<{ id: string }>).map((s) => s.id);
        if (ids.length > 0) siteIds = ids.includes(siteId!) ? ids : [...ids, siteId!];
      }

      const { data: stock, error: stockErr } = await (supabase as any)
        .from("stock_inventory")
        .select(
          "id, site_id, material_id, current_qty, available_qty, batch_code, last_received_date"
        )
        .in("site_id", siteIds);
      if (stockErr) throw stockErr;
      const stockRows = (stock ?? []) as StockRow[];

      // Sum usage transactions per inventory_id (for the "used so far" figure).
      const invIds = stockRows.map((s) => s.id);
      let usageMap = new Map<string, number>();
      if (invIds.length > 0) {
        const { data: txs, error: txErr } = await (supabase as any)
          .from("stock_transactions")
          .select("inventory_id, quantity")
          .eq("transaction_type", "usage")
          .in("inventory_id", invIds);
        if (txErr) throw txErr;
        for (const row of (txs ?? []) as Array<{
          inventory_id: string;
          quantity: number | string;
        }>) {
          // stock_transactions.quantity for usage rows is stored as a negative
          // delta (e.g. -10 for 10 consumed). Take abs so the running total is
          // "amount used so far" — the consumer Math.max(0, used) downstream
          // assumes a non-negative number.
          usageMap.set(
            row.inventory_id,
            (usageMap.get(row.inventory_id) ?? 0) + Math.abs(Number(row.quantity))
          );
        }
      }
      return { stockRows, usageMap };
    },
    staleTime: 60000,
  });
}

// ----------------------------------------------------------------------------
// Spot purchases for site (own + group)
// ----------------------------------------------------------------------------

export interface SpotPurchaseExpense {
  id: string;
  ref_code: string;
  purchase_date: string;
  total_amount: number | string;
  site_id: string;
  site_group_id: string | null;
  payment_mode: string | null;
  purchase_type: "spot" | "own_site" | "group_stock";
  is_historical: boolean | null;
  used_qty_at_entry: number | string | null;
  vendor: { id: string; name: string; is_draft: boolean | null } | null;
  items: Array<{
    id: string;
    material_id: string;
    quantity: number | string;
    unit_price: number | string;
    total_price: number | string;
    material: {
      id: string;
      name: string;
      unit: string;
      is_draft: boolean | null;
    } | null;
  }>;
  allocations: Array<{
    site_id: string;
    percentage: number | string;
    is_final: boolean;
  }>;
}

function useSiteSpotPurchases(
  siteId: string | undefined,
  siteGroupId: string | null | undefined
) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["spot-purchases", "for-site", siteId ?? null, siteGroupId ?? null],
    enabled: !!siteId,
    queryFn: async () => {
      // Picks up spot purchases AND historical backfill entries (own_site /
      // group_stock with is_historical=true). Regular MR→PO settlement rows
      // (purchase_type='own_site'|'group_stock' without is_historical) are
      // excluded because they're already represented via the MR/PO joined
      // thread above — including them here would double-count.
      let query = (supabase as any)
        .from("material_purchase_expenses")
        .select(
          `
          id, ref_code, purchase_date, total_amount, site_id, site_group_id, payment_mode,
          purchase_type, is_historical, used_qty_at_entry,
          vendor:vendors(id, name, is_draft),
          items:material_purchase_expense_items(
            id, material_id, quantity, unit_price, total_price,
            material:materials(id, name, unit, is_draft)
          ),
          allocations:spot_purchase_allocations(site_id, percentage, is_final)
          `
        )
        .or("purchase_type.eq.spot,is_historical.eq.true");

      if (siteGroupId) {
        query = query.or(`site_id.eq.${siteId},site_group_id.eq.${siteGroupId}`);
      } else {
        query = query.eq("site_id", siteId);
      }

      query = query.order("purchase_date", { ascending: false });

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as SpotPurchaseExpense[];
    },
    staleTime: 60000,
  });
}

// ----------------------------------------------------------------------------
// Settlement (material_purchase_expenses) lookup per PO
// ----------------------------------------------------------------------------

export interface SettlementSnapshot {
  id: string;
  ref_code: string | null;
  purchase_order_id: string;
  site_id: string;
  is_paid: boolean;
  paid_date: string | null;
  status: string | null;
  payment_channel: string | null;
  total_amount: number | string;
  /** Actual cash paid to the vendor (incl. transport/extra). May exceed
      total_amount when transport is recorded only here. Null until paid. */
  amount_paid: number | string | null;
  payment_screenshot_url: string | null;
  bill_url: string | null;
  payment_mode: string | null;
}

// ----------------------------------------------------------------------------
// Sites in this group (for "Shared from <site>" mirror-thread labels)
// ----------------------------------------------------------------------------

function useGroupSiteNames(siteGroupId: string | null | undefined) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["group-site-names", siteGroupId ?? null],
    enabled: !!siteGroupId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sites")
        .select("id, name")
        .eq("site_group_id", siteGroupId);
      if (error) throw error;
      const map = new Map<string, string>();
      for (const s of (data ?? []) as Array<{ id: string; name: string }>) {
        map.set(s.id, s.name);
      }
      return map;
    },
    staleTime: 5 * 60 * 1000,
  });
}

interface GroupBatchUsageSummary {
  /** batch_ref_code → total ₹ of unsettled cross-site (non-self) usage. */
  pendingCrossSiteByBatch: Map<string, number>;
  /** batch_ref_codes that have at least one cross-site (non-self) usage row. */
  hasCrossSiteByBatch: Set<string>;
}

function useGroupBatchUsageSummary(siteGroupId: string | null | undefined) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["batch-usage-summary", "for-hub", siteGroupId ?? null],
    enabled: !!siteGroupId,
    queryFn: async (): Promise<GroupBatchUsageSummary> => {
      const { data, error } = await (supabase as any)
        .from("batch_usage_records")
        .select("batch_ref_code, is_self_use, settlement_status, total_cost")
        .eq("site_group_id", siteGroupId);
      if (error) throw error;
      const pendingCrossSiteByBatch = new Map<string, number>();
      const hasCrossSiteByBatch = new Set<string>();
      for (const r of (data ?? []) as Array<{
        batch_ref_code: string;
        is_self_use: boolean;
        settlement_status: string;
        total_cost: number | string;
      }>) {
        if (r.is_self_use) continue;
        hasCrossSiteByBatch.add(r.batch_ref_code);
        if (r.settlement_status === "pending") {
          pendingCrossSiteByBatch.set(
            r.batch_ref_code,
            (pendingCrossSiteByBatch.get(r.batch_ref_code) ?? 0) +
              Number(r.total_cost ?? 0)
          );
        }
      }
      return { pendingCrossSiteByBatch, hasCrossSiteByBatch };
    },
    staleTime: 60000,
  });
}

interface SelfUseExpenseInfo {
  ref_code: string;
  amount: number;
}

/**
 * Posted SELF-USE material expenses keyed by their source group batch
 * (original_batch_code → { ref_code, amount }). Drives the Hub's "Recorded ·
 * <ref>" deep-link vs the "Push to material expense" action for a group batch
 * that was fully consumed by its own paying site.
 *
 * These rows carry site_id = the paying (creditor) site and a NULL
 * site_group_id (create_self_use_expense_if_needed doesn't stamp the group), so
 * the `.or(site_id, site_group_id)` scope effectively matches the viewer's own
 * site — exactly the case where the Hub offers the push. A sibling-paid batch's
 * self-use expense won't surface here for a different cluster site, which is the
 * acceptable v1 limitation (the push RPC is idempotent if it ever double-fires).
 */
function useSelfUseExpenses(
  siteId: string | undefined,
  siteGroupId: string | null | undefined
) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["material-purchases", "self-use-for-hub", siteId ?? null, siteGroupId ?? null],
    enabled: !!siteId,
    queryFn: async (): Promise<Map<string, SelfUseExpenseInfo>> => {
      let query = (supabase as any)
        .from("material_purchase_expenses")
        .select("ref_code, original_batch_code, total_amount, site_id, site_group_id")
        .eq("settlement_reference", "SELF-USE")
        .not("original_batch_code", "is", null);
      if (siteGroupId) {
        query = query.or(`site_id.eq.${siteId},site_group_id.eq.${siteGroupId}`);
      } else {
        query = query.eq("site_id", siteId);
      }
      const { data, error } = await query;
      if (error) throw error;
      const map = new Map<string, SelfUseExpenseInfo>();
      for (const r of (data ?? []) as Array<{
        ref_code: string;
        original_batch_code: string | null;
        total_amount: number | string;
      }>) {
        if (!r.original_batch_code) continue;
        map.set(r.original_batch_code, {
          ref_code: r.ref_code,
          amount: Number(r.total_amount ?? 0),
        });
      }
      return map;
    },
    staleTime: 60000,
  });
}

function useSiteSettlements(
  siteId: string | undefined,
  siteGroupId: string | null | undefined
) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["material-settlements", "for-hub-site", siteId ?? null, siteGroupId ?? null],
    enabled: !!siteId,
    queryFn: async () => {
      let query = (supabase as any)
        .from("material_purchase_expenses")
        .select(
          "id, ref_code, purchase_order_id, site_id, is_paid, paid_date, status, payment_channel, total_amount, amount_paid, payment_screenshot_url, bill_url, payment_mode"
        )
        .not("purchase_order_id", "is", null);

      if (siteGroupId) {
        query = query.or(`site_id.eq.${siteId},site_group_id.eq.${siteGroupId}`);
      } else {
        query = query.eq("site_id", siteId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as SettlementSnapshot[];
    },
    staleTime: 60000,
  });
}

// ----------------------------------------------------------------------------
// Stage derivation
// ----------------------------------------------------------------------------

function deriveStandardStage(
  mr: MaterialRequestWithDetails,
  po: PurchaseOrderWithDetails | undefined,
  settlement: SettlementSnapshot | undefined,
  inventoryUsed: number,
  inventoryRemaining: number
): ThreadStage {
  if (mr.status === "rejected") return "rejected";
  if (mr.status === "cancelled") return "rejected";

  if (!po) {
    if (mr.status === "approved") return "approved";
    if (mr.status === "pending" || mr.status === "draft") return "requested";
    return "requested";
  }

  // PO exists — go by its status, then layer on settlement + usage state.
  let base: ThreadStage;
  switch (po.status) {
    case "delivered":
      base = "delivered";
      break;
    case "partial_delivered":
      // Partial delivery: still in 'ordered' stage from the lifecycle POV.
      // The pipeline + row UI render the partial progress separately so the
      // engineer knows to record the next batch (not chase settlement).
      base = "ordered";
      break;
    case "ordered":
    case "approved":
    case "pending_approval":
      base = "ordered";
      break;
    case "cancelled":
      return "rejected";
    case "draft":
      base = "approved";
      break;
    default:
      base = "ordered";
  }

  // If a settlement row exists and is paid AND the PO is fully delivered,
  // advance to "settled". Partial deliveries (advance-paid bulk) stay in
  // "ordered" so the engineer's next action remains "Record next batch" —
  // the pipeline still marks SETTLE as done via the advance-paid override.
  const isSettled = !!settlement && settlement.is_paid === true;
  if (isSettled && base === "delivered") {
    base = "settled";
  }

  // Once settled AND the stock is exhausted (nothing remaining + some used),
  // mark as "exhausted" — the CONSUMPTION lifecycle is done the moment stock
  // runs out. Inter-site settlement is a separate, independent concern (tracked
  // on batch_usage_records.settlement_status and surfaced as its own pipeline
  // step + "Settle inter-site" action), so a still-owed cross-site portion no
  // longer forces the batch back to "in-use". `hasPendingInterSite` is kept as
  // a parameter only so callers can read it onto the thread.
  if (base === "settled") {
    if (inventoryUsed > 0 && inventoryRemaining <= 0) return "exhausted";
    if (inventoryUsed > 0) return "in-use";
  }

  return base;
}

function deriveKind(
  mr: MaterialRequestWithDetails,
  po: PurchaseOrderWithDetails | undefined
): ThreadKind {
  // The PO is the source of truth for group vs own — v1 /site/purchase-orders
  // parses `notes` for "[GROUP STOCK]" and shows the chip from that. We mirror
  // that here AND fall back to `po.site_group_id` being set. `mr.purchase_type`
  // is unreliable: many MRs were created as own_site but converted to group
  // stock at PO creation time, leaving the MR's flag stale.
  if (po) {
    const notes = ((po as any).notes ?? "") as string;
    const hasGroupMarker = notes.includes("[GROUP STOCK]") || notes.includes("[GROUP_STOCK]");
    const hasGroupId = !!(po as any).site_group_id;
    if (hasGroupMarker || hasGroupId) return "group";
    return "own";
  }
  return mr.purchase_type === "group_stock" ? "group" : "own";
}

// ----------------------------------------------------------------------------
// Mapping: MaterialRequest → MaterialThread
// ----------------------------------------------------------------------------

interface StandardThreadDeps {
  deliveriesByPo: Map<string, DeliveryRow[]>;
  /** All inventory rows for a (site, material) pair — multiple rows when the
   *  material has per-batch separation (group stock). The mapper picks the row
   *  matching the thread's expense ref_code; falls back to the unnamed bucket. */
  stockBySiteMaterial: Map<string, Array<{ stock: StockRow; used: number }>>;
  /** All inventory rows for a (site, batch_code) pair, regardless of material.
   *  Used to aggregate multi-material bills (e.g. one steel PO with 16mm + 8mm
   *  + 12mm rods, all tagged with the same batch_code) so the Hub Inventory
   *  block reports the bill's full received/used/remaining instead of just the
   *  primary material's row. */
  stockBySiteBatch: Map<string, Array<{ stock: StockRow; used: number }>>;
  settlementByPo: Map<string, SettlementSnapshot>;
  /** Pending cross-site debt (₹) per batch_ref_code — keeps a group thread
   *  from reading DONE until the cross-site portion is settled. */
  pendingInterSiteByBatch: Map<string, number>;
  /** Batches that have ANY cross-site (non-self) usage row, settled or not —
   *  distinguishes a truly own-used group buy from shared-and-settled. */
  hasCrossSiteByBatch: Set<string>;
  /** batch_ref_code → posted SELF-USE expense ({ ref_code, amount }) for a
   *  fully-self-used group batch. Present → Hub shows a "Recorded · <ref>"
   *  deep-link; absent → Hub shows the "Push to material expense" action. */
  selfUseExpenseByBatch: Map<string, { ref_code: string; amount: number }>;
  /** Site name lookup for "Shared from <site>" mirror chips. */
  siteNameById: Map<string, string>;
  /** The site currently being viewed — threads with mr.site_id ≠ this are
   *  marked as mirror (read-only) on the consumer side. */
  currentSiteId: string | undefined;
  /** The viewer's cluster. A group thread whose site_group matches this is
   *  editable everywhere in the cluster (full parity) — NOT a read-only mirror. */
  currentSiteGroupId: string | null | undefined;
}

function makeStockKey(siteId: string, materialId: string) {
  return `${siteId}::${materialId}`;
}

function makeBatchKey(siteId: string, batchCode: string) {
  return `${siteId}::batch::${batchCode}`;
}

function mapStandardThread(
  mr: MaterialRequestWithDetails,
  poByRequestId: Map<string, PurchaseOrderWithDetails>,
  deps: StandardThreadDeps
): MaterialThread {
  const po = poByRequestId.get(mr.id);
  const primaryItem = mr.items?.[0];
  const threadKind = deriveKind(mr, po);

  // A thread raised on a different site than the one being viewed.
  const isSiblingRequest =
    !!deps.currentSiteId && mr.site_id !== deps.currentSiteId;

  // A GROUP thread that belongs to the viewer's cluster gets FULL PARITY —
  // every cluster site can approve, PO, deliver, and settle it. We tell it
  // apart from a payer/debtor standpoint via labels, not by locking it.
  const isGroupThread = threadKind === "group";
  const inCluster =
    isGroupThread &&
    !!deps.currentSiteGroupId &&
    ((mr.site_group_id ?? undefined) === deps.currentSiteGroupId ||
      ((po as any)?.site_group_id ?? undefined) === deps.currentSiteGroupId);

  // Mirror = a NON-cluster cross-site thread (e.g. another site's own-stock
  // request that surfaced here). Those stay read-only — corrections belong to
  // the originating site. Cluster group threads are NOT mirrors.
  const isMirror = isSiblingRequest && !inCluster;
  // Origin-site name for the "Requested by <site>" / "Shared from <site>"
  // labels — populated whenever the request came from a sibling site.
  const mirroredFromSiteName = isSiblingRequest
    ? deps.siteNameById.get(mr.site_id) ?? null
    : null;

  const totalQty = (mr.items ?? []).reduce(
    (sum, it) => sum + Number(it.requested_qty ?? 0),
    0
  );

  // Look up settlement first, then pick the inventory row matching this
  // thread's batch (settlement.ref_code → stock_inventory.batch_code).
  const settlement = po ? deps.settlementByPo.get(po.id) : undefined;
  const batchCode = settlement?.ref_code ?? null;

  // Stock is keyed by the actually-purchased material (PO line), which can
  // differ from the MR's original material when the engineer picks a more
  // specific variant at PO time (e.g. MR "Jalli Gravel" → PO "Ondra 1.5 jalli").
  // Prefer the PO's primary item so the inventory/usage lookup lands on the
  // bucket that actually received the goods — otherwise invUsed/invRemaining
  // come back zero and deriveStandardStage never trips the "exhausted" path,
  // leaving fully-consumed threads stuck pulsing on IN USE.
  const poPrimaryMaterialId = ((po as any)?.items?.[0]?.material_id ?? null) as
    | string
    | null;
  const stockLookupMaterialId = poPrimaryMaterialId ?? primaryItem?.material_id;

  let invMatch: { stock: StockRow; used: number } | undefined;
  if (stockLookupMaterialId) {
    // Mirror threads (cluster-mate's group PO viewed from the consumer site)
    // do NOT have local inventory — the stock lives at the originating site.
    // Skip the lookup so we don't accidentally match this site's bucket.
    const candidates = isMirror
      ? []
      : deps.stockBySiteMaterial.get(
          makeStockKey(mr.site_id, stockLookupMaterialId)
        ) ?? [];
    if (batchCode) {
      invMatch = candidates.find((c) => c.stock.batch_code === batchCode);
    }
    // Fall back to a row with no batch_code (the site's shared bucket) for
    // own POs where deliveries merge into a single inventory row.
    if (!invMatch) {
      invMatch = candidates.find(
        (c) => !c.stock.batch_code || c.stock.batch_code === ""
      );
    }
  }
  // For batch-scoped stock (group POs / multi-variant bills) aggregate ALL
  // stock_inventory rows sharing this batch_code so a 3-variant steel bill
  // reports the whole bill. Matching only the single primary-material row
  // left fully-consumed multi-variant threads stuck pulsing on IN USE.
  let invUsed = invMatch ? Math.max(0, invMatch.used) : 0;
  let invRemaining = invMatch ? Math.max(0, Number(invMatch.stock.current_qty)) : 0;
  let aggBatch: { received: number; used: number; remaining: number } | undefined;
  if (invMatch && invMatch.stock.batch_code) {
    const batchKey = makeBatchKey(mr.site_id, invMatch.stock.batch_code);
    const sharedBatch = deps.stockBySiteBatch.get(batchKey) ?? [invMatch];
    let aggRemaining = 0;
    let aggUsed = 0;
    for (const c of sharedBatch) {
      aggRemaining += Math.max(0, Number(c.stock.current_qty));
      aggUsed += Math.max(0, c.used);
    }
    invUsed = aggUsed;
    invRemaining = aggRemaining;
    aggBatch = { received: aggRemaining + aggUsed, used: aggUsed, remaining: aggRemaining };
  }

  // Batch ref used to look up cross-site usage. When an inventory row matched,
  // its batch_code equals the settlement ref_code and the batch_usage_records
  // batch_ref_code — all three share the MAT-/GSP- code.
  const batchRefForUsage = settlement?.ref_code ?? invMatch?.stock.batch_code ?? null;
  const hasPendingInterSite =
    !!batchRefForUsage && (deps.pendingInterSiteByBatch.get(batchRefForUsage) ?? 0) > 0;

  // A group buy that was fully consumed by the paying site itself, with no
  // cross-site usage at all (distinct from shared-and-settled). Drives the
  // "used fully by own site" badge on the Hub.
  const isGroupSelfUsed =
    threadKind === "group" &&
    !!batchRefForUsage &&
    !deps.hasCrossSiteByBatch.has(batchRefForUsage) &&
    invUsed > 0 &&
    invRemaining <= 0;

  // For a fully-self-used group batch: the SELF-USE material expense already
  // posted for it, if any. Drives the Hub "Recorded · <ref>" link vs the
  // manual "Push to material expense" action.
  const selfUseExpense = batchRefForUsage
    ? deps.selfUseExpenseByBatch.get(batchRefForUsage) ?? null
    : null;

  // A group thread that has ANY cross-site usage on its batch (settled or not).
  // Drives whether the synthetic "INTER-SITE" pipeline step renders.
  const interSiteApplicable =
    threadKind === "group" &&
    !!batchRefForUsage &&
    deps.hasCrossSiteByBatch.has(batchRefForUsage);

  const stage = deriveStandardStage(mr, po, settlement, invUsed, invRemaining);

  let threadPO: MaterialThread["po"] | undefined;
  if (po) {
    // Real payer (whose money funded the buy) lives in internal_notes for group
    // POs; it can differ from the PO's site_id (the originating/debtor site).
    const groupMeta = parseGroupMeta((po as any).internal_notes ?? null);
    const payerSiteId =
      groupMeta?.payment_source_site_id ?? (po as any).site_id ?? mr.site_id;
    const debtorSiteId = mr.site_id;

    const orderedQty = (po.items ?? []).reduce(
      (sum, it) => sum + Number(it.quantity ?? 0),
      0
    );
    const receivedQty = (po.items ?? []).reduce(
      (sum, it) => sum + Number((it as any).received_qty ?? 0),
      0
    );

    // Build the per-batch delivery log (for the primary material in this PO).
    const primaryMaterialId = primaryItem?.material_id;
    const poDeliveries = deps.deliveriesByPo.get(po.id) ?? [];
    const deliveryBatches: ThreadDeliveryBatch[] = poDeliveries.map((d) => {
      const matchingItem = primaryMaterialId
        ? d.items.find((it) => it.material_id === primaryMaterialId)
        : undefined;
      const received = matchingItem
        ? Number(matchingItem.received_qty)
        : d.items.reduce((s, it) => s + Number(it.received_qty), 0);
      const accepted = matchingItem
        ? Number(matchingItem.accepted_qty)
        : d.items.reduce((s, it) => s + Number(it.accepted_qty), 0);
      return {
        id: d.id,
        grn_number: d.grn_number,
        delivery_date: d.delivery_date,
        received_qty: received,
        accepted_qty: accepted,
        verified: !!d.verified,
        vehicle_number: d.vehicle_number,
        notes: d.notes,
        invoice_url: d.invoice_url,
        challan_url: d.challan_url,
      };
    });

    threadPO = {
      id: po.id,
      po_number: po.po_number,
      vendor_id: po.vendor_id,
      vendor_name: (po as any).vendor?.name ?? undefined,
      amount: Number(po.total_amount ?? 0),
      qty: orderedQty,
      received_qty: receivedQty,
      expected: po.expected_delivery_date,
      status:
        po.status === "partial_delivered"
          ? "partial"
          : po.status === "delivered"
            ? "delivered"
            : "ordered",
      payer_site_id: payerSiteId,
      payer_site_name: deps.siteNameById.get(payerSiteId) ?? undefined,
      debtor_site_id: debtorSiteId,
      debtor_site_name: deps.siteNameById.get(debtorSiteId) ?? undefined,
      payment_timing: ((po as any).payment_timing ?? "on_delivery") as
        | "advance"
        | "on_delivery",
      advance_paid: Number((po as any).advance_paid ?? 0),
      delivery_batches: deliveryBatches,
      vendor_bill_url: (po as any).vendor_bill_url ?? null,
      quotation_url: (po as any).quotation_url ?? null,
    };
  }

  // Inventory snapshot — only populated when the stock_inventory row is
  // batch-scoped (group POs / historical batches). For the shared site bucket
  // (own-site POs that merge into a single material pool) we deliberately
  // leave `threadInventory` empty: per-PO used/remaining numbers for an
  // own-site bucket are inherently fabricated, and the previous "site-wide
  // pool" panel read as a contradiction next to "Added to stock: 10 bag"
  // when the pool's running tally was hundreds. The "Added to stock" + link
  // to Inventory is the truthful per-PO signal; pool-level state belongs on
  // the Inventory page.
  // Reuse the batch aggregation computed for the stage decision above
  // (sums all stock_inventory rows sharing this batch_code on this site, e.g.
  // one steel PO producing 8mm/12mm/16mm rows) so the Hub reports the whole
  // bill, not just the primary item.
  let threadInventory: ThreadInventory | undefined;
  if (invMatch && invMatch.stock.batch_code) {
    threadInventory = {
      batch: invMatch.stock.batch_code,
      received: aggBatch?.received ?? invRemaining + invUsed,
      used: aggBatch?.used ?? invUsed,
      remaining: aggBatch?.remaining ?? invRemaining,
    };
  }

  return {
    id: mr.request_number || mr.id,
    source: "material_request",
    source_row_id: mr.id,
    site_id: mr.site_id,
    section: (mr as any).section?.name ?? null,
    section_id: mr.section_id ?? null,
    floor: null,
    priority: mr.priority,
    stage,
    kind: threadKind,
    is_group_self_used: isGroupSelfUsed || undefined,
    self_use_expense: selfUseExpense,
    inter_site_applicable: interSiteApplicable || undefined,
    inter_site_pending: hasPendingInterSite || undefined,
    advance: po?.payment_timing === "advance",
    material_id: primaryItem?.material_id ?? "",
    material_name: (primaryItem as any)?.material?.name ?? "—",
    material_unit: (primaryItem as any)?.material?.unit ?? "nos",
    qty: totalQty || Number(primaryItem?.requested_qty ?? 0),
    request_number: mr.request_number,
    requested_by: mr.requested_by,
    requested_by_name: (mr as any).requested_by_user?.name,
    requested_at: mr.request_date || mr.created_at,
    need_by: mr.required_by_date,
    note: mr.notes,
    approved_by: mr.approved_by ?? null,
    approved_at: mr.approved_at ?? null,
    rejected_reason: mr.rejection_reason ?? null,
    is_mirror: isMirror || undefined,
    is_sibling_request: isSiblingRequest || undefined,
    mirrored_from_site_id: isSiblingRequest ? mr.site_id : undefined,
    mirrored_from_site_name: mirroredFromSiteName ?? undefined,
    po: threadPO,
    inventory: threadInventory,
    variants:
      (mr.items ?? []).length > 1
        ? (mr.items ?? []).map((it: any) => ({
            material_id: it.material_id,
            material_name: it.material?.name ?? "—",
            unit: it.material?.unit ?? "nos",
            brand_id: it.brand_id ?? null,
            brand_name: it.brand?.brand_name ?? null,
            requested_qty: Number(it.requested_qty ?? 0),
          }))
        : undefined,
    settlement: settlement
      ? {
          status: settlement.is_paid ? "settled" : "pending",
          // Actual cash paid to the vendor (incl. transport/extra), falling back
          // to the item-line total when not yet recorded. Keeps the SETTLEMENT
          // block consistent with inter-site usage, which splits the same paid
          // amount by usage %.
          amount: Number(settlement.amount_paid ?? settlement.total_amount ?? 0),
          paid_by:
            settlement.payment_channel === "engineer_wallet"
              ? "wallet"
              : settlement.payment_channel === "direct"
                ? "office"
                : settlement.payment_channel ?? null,
          settled_at: settlement.paid_date,
          expense_ref: settlement.ref_code,
          expense_id: settlement.id,
          payment_screenshot_url: settlement.payment_screenshot_url,
          bill_url: settlement.bill_url,
          payment_mode: settlement.payment_mode,
        }
      : undefined,
    // delivery / inter_site_usage populated later
  };
}

function mapSpotThread(sp: SpotPurchaseExpense): MaterialThread {
  const totalAmount = Number(sp.total_amount);
  const totalQty = sp.items.reduce((sum, it) => sum + Number(it.quantity), 0);
  const primary = sp.items[0];

  const allocations = sp.allocations ?? [];
  const isFinal = allocations.length > 0 && allocations.every((a) => a.is_final);
  const isProvisional = allocations.length > 0 && !isFinal;
  const kind: ThreadKind = sp.site_group_id ? "group" : "own";

  const isHistorical = !!sp.is_historical;
  const usedQty = sp.used_qty_at_entry != null ? Number(sp.used_qty_at_entry) : 0;

  // Historical: stage depends on whether the batch was fully consumed at entry.
  // Spot (current behavior): always 'in-use'.
  const stage: MaterialThread["stage"] = isHistorical
    ? (usedQty >= totalQty && totalQty > 0 ? "exhausted" : "in-use")
    : "in-use";

  // Spot purchases get spot_stage; historical entries don't (they're never
  // "provisional" — group_split is always final at entry time).
  const spotStage = isHistorical
    ? undefined
    : (kind === "group"
        ? (isFinal ? "finalized" : isProvisional ? "provisional" : "bought")
        : "bought");

  // For group threads (spot OR historical), bridge the allocations to
  // inter_site_usage so the Hub's interSiteDebt() picks them up. The payer is
  // the source site (sp.site_id) — whoever funded the purchase. Other sites
  // in the allocation owe their share back.
  const interSiteUsage: MaterialThread["inter_site_usage"] | undefined =
    kind === "group" && allocations.length > 0
      ? allocations.map((a) => ({
          site_id: a.site_id,
          used: totalQty * (Number(a.percentage) / 100),
          value: totalAmount * (Number(a.percentage) / 100),
        }))
      : undefined;

  return {
    id: sp.ref_code || sp.id,
    source: "spot_purchase",
    // Only tag purchase_type='spot' for actual spot rows; historical own_site /
    // group_stock entries don't claim the spot UI affordances.
    purchase_type: isHistorical ? undefined : "spot",
    source_row_id: sp.id,
    is_historical: isHistorical || undefined,
    used_qty_at_entry: isHistorical ? usedQty : undefined,
    vendor_is_draft: sp.vendor?.is_draft ?? false,
    material_is_draft: primary?.material?.is_draft ?? false,
    site_id: sp.site_id,
    section: null,
    floor: null,
    priority: "normal",
    stage,
    kind,
    advance: false,
    material_id: primary?.material_id ?? "",
    material_name: primary?.material?.name ?? "—",
    material_unit: primary?.material?.unit ?? "nos",
    qty: totalQty,
    requested_by: null,
    requested_at: sp.purchase_date,
    bought_at: sp.purchase_date,
    spot_stage: spotStage,
    inter_site_usage: interSiteUsage,
    spot: {
      vendor_id: sp.vendor?.id ?? "",
      vendor_name: sp.vendor?.name ?? "—",
      vendor_is_draft: sp.vendor?.is_draft ?? false,
      items: sp.items.map((it) => ({
        material_id: it.material_id,
        name: it.material?.name ?? "—",
        qty: Number(it.quantity),
        unit: it.material?.unit ?? "nos",
        paid_rate: Number(it.unit_price),
        line_total: Number(it.total_price),
      })),
      paid_by: "",
      wallet_id: "",
      payment_mode: (sp.payment_mode === "upi" ? "upi" : "cash") as "cash" | "upi",
      amount: totalAmount,
      bill_attached: false,
      screenshot_attached: false,
      allocation: allocations.length > 0
        ? {
            kind: isFinal ? "final" : "provisional",
            split: allocations.map((a) => ({
              site_id: a.site_id,
              pct: Number(a.percentage),
            })),
          }
        : undefined,
    },
  };
}

// ----------------------------------------------------------------------------
// Public hook
// ----------------------------------------------------------------------------

export interface UseMaterialThreadsResult {
  threads: MaterialThread[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  /** MR id → original MaterialRequestWithDetails (for dialog handoff). */
  materialRequestById: Map<string, MaterialRequestWithDetails>;
  /** PO id → original PurchaseOrderWithDetails. */
  purchaseOrderById: Map<string, PurchaseOrderWithDetails>;
  /** Spot batch id → original spot expense row. */
  spotBatchById: Map<string, SpotPurchaseExpense>;
}

/**
 * Composes material_requests + purchase_orders + spot_purchase rows into a
 * single flat MaterialThread[] view.
 *
 * v1 enrichments (NOT YET populated — TODOs):
 *   - settlement: read material_purchase_expenses by po_id to know paid/unpaid
 *   - inventory: read stock_inventory keyed by ref code / po batch
 *   - inter_site_usage: read inter_site_material_settlements / spot_purchase_allocations
 *
 * Done in later steps when those surfaces are wired.
 */
export function useMaterialThreads(
  siteId: string | undefined,
  siteGroupId: string | null | undefined
): UseMaterialThreadsResult {
  const mr = useMaterialRequests(siteId, undefined, { siteGroupId });
  const po = usePurchaseOrders(siteId, undefined, {
    siteGroupId: siteGroupId ?? undefined,
  });
  const sp = useSiteSpotPurchases(siteId, siteGroupId);
  const deliveries = useSiteDeliveries(siteId, siteGroupId);
  const stock = useSiteStockInventory(siteId, siteGroupId);
  const settlements = useSiteSettlements(siteId, siteGroupId);
  const groupSiteNames = useGroupSiteNames(siteGroupId);
  const batchUsage = useGroupBatchUsageSummary(siteGroupId);
  const selfUseExpenses = useSelfUseExpenses(siteId, siteGroupId);

  const { threads, materialRequestById, purchaseOrderById, spotBatchById } = useMemo(() => {
    const mrMap = new Map<string, MaterialRequestWithDetails>();
    const poMap = new Map<string, PurchaseOrderWithDetails>();
    const spMap = new Map<string, SpotPurchaseExpense>();

    if (!mr.data || !po.data || !sp.data || !settlements.data) {
      return {
        threads: [] as MaterialThread[],
        materialRequestById: mrMap,
        purchaseOrderById: poMap,
        spotBatchById: spMap,
      };
    }

    // Index POs by source_request_id so we can attach the right PO to each MR.
    const poByRequest = new Map<string, PurchaseOrderWithDetails>();
    for (const p of po.data) {
      poMap.set(p.id, p);
      const srcId = (p as any).source_request_id as string | null;
      if (srcId) poByRequest.set(srcId, p);
    }
    for (const m of mr.data) mrMap.set(m.id, m);
    for (const s of sp.data) spMap.set(s.id, s);

    // Group deliveries by po_id and stock by (site, material).
    const deliveriesByPo = new Map<string, DeliveryRow[]>();
    for (const d of deliveries.data ?? []) {
      const list = deliveriesByPo.get(d.po_id) ?? [];
      list.push(d);
      deliveriesByPo.set(d.po_id, list);
    }
    const stockBySiteMaterial = new Map<
      string,
      Array<{ stock: StockRow; used: number }>
    >();
    const stockBySiteBatch = new Map<
      string,
      Array<{ stock: StockRow; used: number }>
    >();
    for (const s of stock.data?.stockRows ?? []) {
      const entry = { stock: s, used: stock.data?.usageMap.get(s.id) ?? 0 };
      const matKey = makeStockKey(s.site_id, s.material_id);
      const matList = stockBySiteMaterial.get(matKey) ?? [];
      matList.push(entry);
      stockBySiteMaterial.set(matKey, matList);
      if (s.batch_code) {
        const batchKey = makeBatchKey(s.site_id, s.batch_code);
        const batchList = stockBySiteBatch.get(batchKey) ?? [];
        batchList.push(entry);
        stockBySiteBatch.set(batchKey, batchList);
      }
    }
    // Index settlements by purchase_order_id (one row per PO in normal flow).
    const settlementByPo = new Map<string, SettlementSnapshot>();
    for (const s of settlements.data ?? []) {
      if (!s.purchase_order_id) continue;
      const existing = settlementByPo.get(s.purchase_order_id);
      // Prefer the "is_paid=true" row if multiple exist; else first wins.
      if (!existing || (s.is_paid && !existing.is_paid)) {
        settlementByPo.set(s.purchase_order_id, s);
      }
    }
    const deps: StandardThreadDeps = {
      currentSiteGroupId: siteGroupId,
      deliveriesByPo,
      stockBySiteMaterial,
      stockBySiteBatch,
      settlementByPo,
      pendingInterSiteByBatch:
        batchUsage.data?.pendingCrossSiteByBatch ?? new Map<string, number>(),
      hasCrossSiteByBatch:
        batchUsage.data?.hasCrossSiteByBatch ?? new Set<string>(),
      selfUseExpenseByBatch:
        selfUseExpenses.data ?? new Map<string, { ref_code: string; amount: number }>(),
      siteNameById: groupSiteNames.data ?? new Map(),
      currentSiteId: siteId,
    };

    const standardThreads = mr.data
      // Drop cancelled MRs — they're audit-only history (used by reports /
      // /site/material-requests), not actionable threads. Cluttering the Hub
      // with greyed-out "All clear" cards trains the engineer to ignore real
      // signal. Cancelled MRs remain inspectable on /site/material-requests.
      .filter((m) => m.status !== "cancelled" && m.status !== "rejected")
      .map((m) => mapStandardThread(m, poByRequest, deps));
    const spotThreads = sp.data.map(mapSpotThread);

    const sortedThreads = [...standardThreads, ...spotThreads].sort(
      (a, b) =>
        new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime()
    );

    return {
      threads: sortedThreads,
      materialRequestById: mrMap,
      purchaseOrderById: poMap,
      spotBatchById: spMap,
    };
  }, [
    mr.data,
    po.data,
    sp.data,
    deliveries.data,
    stock.data,
    settlements.data,
    groupSiteNames.data,
    batchUsage.data,
    selfUseExpenses.data,
    siteId,
  ]);

  return {
    threads,
    isLoading:
      mr.isLoading ||
      po.isLoading ||
      sp.isLoading ||
      deliveries.isLoading ||
      stock.isLoading ||
      settlements.isLoading,
    isError:
      mr.isError ||
      po.isError ||
      sp.isError ||
      deliveries.isError ||
      stock.isError ||
      settlements.isError,
    error:
      mr.error ||
      po.error ||
      sp.error ||
      deliveries.error ||
      stock.error ||
      settlements.error,
    materialRequestById,
    purchaseOrderById,
    spotBatchById,
  };
}