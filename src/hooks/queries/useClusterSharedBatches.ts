"use client";

/**
 * Per-batch shared-usage rows for the v2 Inter-Site Settlement "Shared batches"
 * grid (design section 5). For each group-stock batch in the cluster, returns
 * the received qty, the per-site consumed segments (for the stacked usage bar),
 * the paying site, and the vendor/amount.
 *
 * Sourced from `material_purchase_expenses` (batch identity, single material per
 * group batch in this app) + `batch_usage_records` (per-site usage, the same
 * source of truth the settlement engine uses). Site id → label/accent mapping is
 * left to the page (it already has `siteMetaById` from useClusterInterSiteDebt).
 */

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface SharedBatchSegment {
  siteId: string;
  used: number;
  value: number;
  isSelfUse: boolean;
}

export interface SharedBatchRow {
  batchCode: string;
  materialName: string;
  unit: string;
  vendorName: string | null;
  payerSiteId: string | null;
  amount: number;
  receivedQty: number;
  totalUsed: number;
  remaining: number;
  pctUsed: number;
  crossSiteValue: number;
  segments: SharedBatchSegment[];
}

interface ExpenseRow {
  ref_code: string | null;
  site_id: string | null;
  total_amount: number | string | null;
  vendor: { name: string } | null;
  items: Array<{
    quantity: number | string | null;
    total_price: number | string | null;
    material: { name: string; unit: string } | null;
  }> | null;
}

interface UsageRow {
  batch_ref_code: string;
  usage_site_id: string | null;
  quantity: number | string | null;
  total_cost: number | string | null;
  is_self_use: boolean;
}

export function useClusterSharedBatches(groupId: string | null | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["cluster-shared-batches", groupId ?? null],
    enabled: !!groupId,
    staleTime: 60_000,
    queryFn: async (): Promise<SharedBatchRow[]> => {
      // 1. Group-stock batch identities (ref_code → material, received, vendor, payer, amount).
      const { data: expenses, error: expErr } = await (supabase as any)
        .from("material_purchase_expenses")
        .select(
          `
          ref_code, site_id, total_amount,
          vendor:vendors(name),
          items:material_purchase_expense_items(
            quantity, total_price,
            material:materials(name, unit)
          )
          `
        )
        .eq("site_group_id", groupId)
        .eq("purchase_type", "group_stock");
      if (expErr) throw expErr;

      const byRef = new Map<string, ExpenseRow>();
      for (const e of (expenses ?? []) as ExpenseRow[]) {
        if (e.ref_code) byRef.set(e.ref_code, e);
      }

      // 2. All usage rows for the cluster (per-site segments).
      const { data: usage, error: useErr } = await (supabase as any)
        .from("batch_usage_records")
        .select("batch_ref_code, usage_site_id, quantity, total_cost, is_self_use")
        .eq("site_group_id", groupId);
      if (useErr) throw useErr;

      // Aggregate per batch → per usage site.
      const perBatch = new Map<
        string,
        { totalUsed: number; crossValue: number; hasCross: boolean; seg: Map<string, SharedBatchSegment> }
      >();
      for (const u of (usage ?? []) as UsageRow[]) {
        const ref = u.batch_ref_code;
        if (!ref) continue;
        const qty = Math.abs(Number(u.quantity ?? 0));
        const val = Math.abs(Number(u.total_cost ?? 0));
        const site = u.usage_site_id ?? "unknown";
        let agg = perBatch.get(ref);
        if (!agg) {
          agg = { totalUsed: 0, crossValue: 0, hasCross: false, seg: new Map() };
          perBatch.set(ref, agg);
        }
        agg.totalUsed += qty;
        if (!u.is_self_use) {
          agg.crossValue += val;
          agg.hasCross = true;
        }
        const s = agg.seg.get(site) ?? { siteId: site, used: 0, value: 0, isSelfUse: u.is_self_use };
        s.used += qty;
        s.value += val;
        if (!u.is_self_use) s.isSelfUse = false;
        agg.seg.set(site, s);
      }

      const rows: SharedBatchRow[] = [];
      for (const [ref, agg] of perBatch) {
        if (!agg.hasCross) continue; // only batches actually shared across sites
        const exp = byRef.get(ref);
        const item = exp?.items?.[0] ?? null;
        const receivedQty = item ? Number(item.quantity ?? 0) : 0;
        if (receivedQty <= 0) continue; // can't draw a bar without a denominator
        const remaining = Math.max(0, receivedQty - agg.totalUsed);
        if (remaining <= 0) continue; // "still in use" only (handoff section 5)
        const amount = exp?.total_amount != null
          ? Number(exp.total_amount)
          : Number(item?.total_price ?? 0);
        rows.push({
          batchCode: ref,
          materialName: item?.material?.name ?? "—",
          unit: item?.material?.unit ?? "nos",
          vendorName: exp?.vendor?.name ?? null,
          payerSiteId: exp?.site_id ?? null,
          amount,
          receivedQty,
          totalUsed: agg.totalUsed,
          remaining,
          pctUsed: Math.min(100, Math.round((agg.totalUsed / receivedQty) * 100)),
          crossSiteValue: agg.crossValue,
          segments: Array.from(agg.seg.values()).sort((a, b) => b.used - a.used),
        });
      }

      // Most-shared (largest cross-site value) first.
      rows.sort((a, b) => b.crossSiteValue - a.crossSiteValue);
      return rows;
    },
  });
}
