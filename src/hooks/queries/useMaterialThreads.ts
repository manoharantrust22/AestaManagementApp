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
} from "@/lib/material-hub/threadTypes";

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
// Stage derivation
// ----------------------------------------------------------------------------

function deriveStandardStage(
  mr: MaterialRequestWithDetails,
  po: PurchaseOrderWithDetails | undefined
): ThreadStage {
  if (mr.status === "rejected") return "rejected";
  if (mr.status === "cancelled") return "rejected";

  if (!po) {
    if (mr.status === "approved") return "approved";
    if (mr.status === "pending" || mr.status === "draft") return "requested";
    return "requested";
  }

  // PO exists — go by its status.
  switch (po.status) {
    case "delivered":
    case "partial_delivered":
      // No settlement table joined yet — treat as delivered. Step 4+ will
      // enrich with settlement state.
      return "delivered";
    case "ordered":
    case "approved":
    case "pending_approval":
      return "ordered";
    case "cancelled":
      return "rejected";
    case "draft":
      return "approved";
    default:
      return "ordered";
  }
}

function deriveKind(mr: MaterialRequestWithDetails): ThreadKind {
  return mr.purchase_type === "group_stock" ? "group" : "own";
}

// ----------------------------------------------------------------------------
// Mapping: MaterialRequest → MaterialThread
// ----------------------------------------------------------------------------

function mapStandardThread(
  mr: MaterialRequestWithDetails,
  poByRequestId: Map<string, PurchaseOrderWithDetails>
): MaterialThread {
  const po = poByRequestId.get(mr.id);
  const primaryItem = mr.items?.[0];

  const totalQty = (mr.items ?? []).reduce(
    (sum, it) => sum + Number(it.requested_qty ?? 0),
    0
  );

  const stage = deriveStandardStage(mr, po);

  let threadPO: MaterialThread["po"] | undefined;
  if (po) {
    threadPO = {
      id: po.id,
      po_number: po.po_number,
      vendor_id: po.vendor_id,
      vendor_name: (po as any).vendor?.name ?? undefined,
      amount: Number(po.total_amount ?? 0),
      qty: (po.items ?? []).reduce((sum, it) => sum + Number(it.quantity ?? 0), 0),
      expected: po.expected_delivery_date,
      status:
        po.status === "partial_delivered"
          ? "partial"
          : po.status === "delivered"
            ? "delivered"
            : "ordered",
      payer_site_id: (po as any).site_id ?? mr.site_id,
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
    kind: deriveKind(mr),
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
    po: threadPO,
    // delivery / settlement / inventory / inter_site_usage are populated later
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

  const { threads, materialRequestById, purchaseOrderById, spotBatchById } = useMemo(() => {
    const mrMap = new Map<string, MaterialRequestWithDetails>();
    const poMap = new Map<string, PurchaseOrderWithDetails>();
    const spMap = new Map<string, SpotPurchaseExpense>();

    if (!mr.data || !po.data || !sp.data) {
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

    const standardThreads = mr.data.map((m) => mapStandardThread(m, poByRequest));
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
  }, [mr.data, po.data, sp.data]);

  return {
    threads,
    isLoading: mr.isLoading || po.isLoading || sp.isLoading,
    isError: mr.isError || po.isError || sp.isError,
    error: mr.error || po.error || sp.error,
    materialRequestById,
    purchaseOrderById,
    spotBatchById,
  };
}