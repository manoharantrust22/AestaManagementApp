"use client";

/**
 * Per-batch inventory view sourced from material_purchase_expenses + items.
 *
 * Each PO line item = one batch card. For OWN POs the trigger merges
 * stock_inventory by (site, material, brand) so we can't show exact per-batch
 * remaining qty. We still surface the batch visibility (vendor, brand, qty,
 * price, date) and join to stock_inventory by (site, material, brand) when
 * possible so users see the bucket's current remaining.
 *
 * For GROUP POs we match by batch_code = expense.ref_code, which gives an
 * exact per-batch remaining.
 *
 * This hook is READ-ONLY. It does NOT change how usage is logged — that still
 * runs through the existing stock_inventory bucket logic. The cards exist so
 * engineers can see "which TNPL Cement batch did I buy and from whom"
 * regardless of whether that batch is still in stock.
 */

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface PurchasedBatchView {
  /** Synthetic id = expense_item.id (one card per expense item). */
  id: string;
  kind: "own" | "group";
  expense_id: string;
  /** ref_code of the bill (e.g. MAT-260214-6805) — copy/paste into /site/expenses to find it. */
  expense_ref: string | null;
  purchase_date: string;
  vendor_id: string | null;
  vendor_name: string | null;
  /** Pay-by site (for group purchases). */
  payer_site_name: string | null;
  material_id: string;
  material_name: string;
  material_unit: string;
  material_image_url: string | null;
  brand_id: string | null;
  brand_name: string | null;
  brand_variant: string | null;
  brand_image_url: string | null;
  /** Quantity originally purchased on this line. */
  received_qty: number;
  /** Per-unit price (excl. GST). */
  unit_price: number;
  /** Line total = quantity × unit_price. */
  total_value: number;
  /** Best-effort remaining qty:
   *  - GROUP: matched stock_inventory row by batch_code (exact)
   *  - OWN:   matched stock_inventory row by (site, material, brand) — bucket-level
   *  - null:  no matching row found (legacy data / never reached inventory) */
  remaining_qty: number | null;
  /** True when remaining_qty represents a shared pool (own POs), false for batch-exact (group). */
  remaining_is_pooled: boolean;
}

interface ExpenseRow {
  id: string;
  ref_code: string | null;
  purchase_date: string;
  site_id: string;
  site_group_id: string | null;
  purchase_type: string;
  vendor: { id: string; name: string } | null;
  items: Array<{
    id: string;
    material_id: string;
    brand_id: string | null;
    quantity: number | string;
    unit_price: number | string;
    total_price: number | string;
    material: {
      id: string;
      name: string;
      unit: string;
      image_url: string | null;
    } | null;
    brand: {
      id: string;
      brand_name: string;
      variant_name: string | null;
      image_url: string | null;
    } | null;
  }>;
}

interface StockRow {
  id: string;
  site_id: string;
  material_id: string;
  brand_id: string | null;
  current_qty: number | string;
  batch_code: string | null;
}

interface SiteRow {
  id: string;
  name: string;
}

export function usePurchasedBatches(
  siteId: string | undefined,
  siteGroupId: string | null | undefined
) {
  const supabase = createClient();

  return useQuery({
    queryKey: [
      "purchased-batches",
      "for-site",
      siteId ?? null,
      siteGroupId ?? null,
    ],
    enabled: !!siteId,
    queryFn: async (): Promise<PurchasedBatchView[]> => {
      // 1. Pull every expense for this site (own + group, excluding spot).
      let expenseQuery = (supabase as any)
        .from("material_purchase_expenses")
        .select(
          `
          id, ref_code, purchase_date, site_id, site_group_id, purchase_type,
          vendor:vendors(id, name),
          items:material_purchase_expense_items(
            id, material_id, brand_id, quantity, unit_price, total_price,
            material:materials(id, name, unit, image_url),
            brand:material_brands(id, brand_name, variant_name, image_url)
          )
          `
        )
        .in("purchase_type", ["own_site", "group_stock"]);

      if (siteGroupId) {
        expenseQuery = expenseQuery.or(
          `site_id.eq.${siteId},site_group_id.eq.${siteGroupId}`
        );
      } else {
        expenseQuery = expenseQuery.eq("site_id", siteId);
      }

      expenseQuery = expenseQuery.order("purchase_date", { ascending: false });

      const { data: expenses, error: expensesErr } = await expenseQuery;
      if (expensesErr) throw expensesErr;
      const expenseRows = (expenses ?? []) as ExpenseRow[];

      // 2. Resolve site_id → site name for group purchases (the payer is the
      //    site that funded the bill = expense.site_id; for own POs this is
      //    the buying site itself, so we only surface the chip when it
      //    differs from the current viewing site).
      const payerSiteIds = Array.from(
        new Set(
          expenseRows
            .filter((e) => e.purchase_type === "group_stock")
            .map((e) => e.site_id)
            .filter((x): x is string => !!x)
        )
      );
      const payerNameById = new Map<string, string>();
      if (payerSiteIds.length > 0) {
        const { data: sites } = await (supabase as any)
          .from("sites")
          .select("id, name")
          .in("id", payerSiteIds);
        for (const s of (sites ?? []) as SiteRow[]) {
          payerNameById.set(s.id, s.name);
        }
      }

      // 3. Pull stock_inventory rows for the site so we can match.
      const { data: stock, error: stockErr } = await (supabase as any)
        .from("stock_inventory")
        .select("id, site_id, material_id, brand_id, current_qty, batch_code")
        .eq("site_id", siteId);
      if (stockErr) throw stockErr;

      const stockByBatch = new Map<string, StockRow>();
      const stockBySiteMatBrand = new Map<string, StockRow>();
      for (const s of (stock ?? []) as StockRow[]) {
        if (s.batch_code) stockByBatch.set(s.batch_code, s);
        const key = `${s.material_id}::${s.brand_id ?? "_"}`;
        if (!stockBySiteMatBrand.has(key)) stockBySiteMatBrand.set(key, s);
      }

      // 4. Flatten expenses → one card per (expense, expense_item).
      const cards: PurchasedBatchView[] = [];
      for (const e of expenseRows) {
        const kind: "own" | "group" =
          e.purchase_type === "group_stock" ? "group" : "own";
        const refCode = e.ref_code;
        // Only show a payer chip when it's a group purchase paid by a
        // different site (so engineers can spot "this batch was funded by
        // Padmavathy" vs the local site's own buy).
        const payerName =
          e.purchase_type === "group_stock" && e.site_id && e.site_id !== siteId
            ? payerNameById.get(e.site_id) ?? null
            : null;

        for (const item of e.items ?? []) {
          if (!item.material) continue;

          // Match logic: batch_code for group, (material, brand) for own.
          let stockMatch: StockRow | undefined;
          if (kind === "group" && refCode) {
            stockMatch = stockByBatch.get(refCode);
          }
          if (!stockMatch) {
            const key = `${item.material_id}::${item.brand_id ?? "_"}`;
            stockMatch = stockBySiteMatBrand.get(key);
          }

          cards.push({
            id: item.id,
            kind,
            expense_id: e.id,
            expense_ref: refCode,
            purchase_date: e.purchase_date,
            vendor_id: e.vendor?.id ?? null,
            vendor_name: e.vendor?.name ?? null,
            payer_site_name: payerName,
            material_id: item.material_id,
            material_name: item.material?.name ?? "—",
            material_unit: item.material?.unit ?? "nos",
            material_image_url: item.material?.image_url ?? null,
            brand_id: item.brand_id,
            brand_name: item.brand?.brand_name ?? null,
            brand_variant: item.brand?.variant_name ?? null,
            brand_image_url: item.brand?.image_url ?? null,
            received_qty: Number(item.quantity ?? 0),
            unit_price: Number(item.unit_price ?? 0),
            total_value: Number(item.total_price ?? 0),
            remaining_qty: stockMatch
              ? Math.max(0, Number(stockMatch.current_qty))
              : null,
            remaining_is_pooled: kind === "own",
          });
        }
      }
      return cards;
    },
    staleTime: 60000,
  });
}
