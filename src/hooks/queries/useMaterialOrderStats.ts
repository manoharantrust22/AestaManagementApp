"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { wrapQueryFn } from "@/lib/utils/timeout";
import {
  computeLandedCost,
  landedCostNote,
  type LandedCostInput,
} from "@/lib/materials/landedCost";

/**
 * Material order statistics - frequency of orders for each material
 */
export interface MaterialOrderStats {
  material_id: string;
  order_count: number;
  total_qty_ordered: number;
  last_ordered: string | null;
}

/**
 * Best price info for a material from vendor inventory
 * Key is composite of material_id + brand_id to compare within same brand only
 */
export interface MaterialBestPrice {
  material_id: string;
  brand_id: string | null;
  brand_name: string | null;
  vendor_id: string;
  vendor_name: string;
  /** Raw quoted price (current_price) of the cheapest-landed quote. */
  unit_price: number;
  /** The comparison/display figure: price + transport/loading/unloading + GST (when stated). */
  landed_cost: number;
  /** GST added on top of unit_price (0 when none stated). */
  gst_extra: number;
  /** Transport + loading + unloading added on top of unit_price. */
  transport_extra: number;
  /** Short note for the tooltip, e.g. "incl. transport"; "" when landed == unit_price. */
  price_note: string;
  price_includes_gst: boolean;
}

/**
 * Chronologically-latest purchase per material, from
 * material_purchase_expense_items joined to material_purchase_expenses.
 * Distinct from "best price" (cheapest across vendors) — this is the most
 * recent in time and carries a bill_url when one was attached at ingest.
 * Sourced from the v_material_latest_purchase SQL view.
 */
export interface MaterialLatestPurchase {
  material_id: string;
  last_purchase_date: string;
  last_unit_price: number;
  last_vendor_id: string | null;
  last_vendor_name: string | null;
  last_bill_url: string | null;
}

/**
 * Fetch order statistics for all materials
 * Used for sorting by frequency (frequently ordered materials first)
 */
export function useMaterialOrderStats() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["materials", "order-stats"],
    queryFn: wrapQueryFn(async () => {
      // Get order stats from purchase_order_items joined with purchase_orders
      const { data, error } = await supabase
        .from("purchase_order_items")
        .select(`
          material_id,
          quantity,
          purchase_orders!inner(
            id,
            status,
            created_at
          )
        `)
        .not("purchase_orders.status", "in", '("cancelled","draft")');

      if (error) {
        // If table doesn't exist or query fails, return empty map
        console.warn("Could not fetch order stats:", error.message);
        return new Map<string, MaterialOrderStats>();
      }

      // Aggregate by material_id
      const statsMap = new Map<string, MaterialOrderStats>();

      for (const item of data || []) {
        const materialId = item.material_id;
        const existing = statsMap.get(materialId);
        const po = item.purchase_orders as { id: string; status: string; created_at: string };

        if (existing) {
          existing.order_count += 1;
          existing.total_qty_ordered += item.quantity || 0;
          if (!existing.last_ordered || po.created_at > existing.last_ordered) {
            existing.last_ordered = po.created_at;
          }
        } else {
          statsMap.set(materialId, {
            material_id: materialId,
            order_count: 1,
            total_qty_ordered: item.quantity || 0,
            last_ordered: po.created_at,
          });
        }
      }

      return statsMap;
    }, { operationName: "useMaterialOrderStats" }),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Fetch best prices for all materials from vendor inventory
 * Groups by material_id + brand_id to ensure comparison within same brand only
 */
export function useMaterialBestPrices() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["materials", "best-prices"],
    queryFn: wrapQueryFn(async () => {
      // Pull every available quote with the cost components needed to compute
      // landed cost, plus each row's parent_id so a variant's quote can roll up
      // to its parent material's card.
      const { data, error } = await supabase
        .from("vendor_inventory")
        .select(`
          material_id,
          brand_id,
          vendor_id,
          current_price,
          price_includes_gst,
          gst_rate,
          price_includes_transport,
          transport_cost,
          loading_cost,
          unloading_cost,
          vendors(name),
          material_brands(brand_name),
          material:materials(parent_id)
        `)
        .eq("is_available", true)
        .not("material_id", "is", null);

      if (error) {
        console.warn("Could not fetch best prices:", error.message);
        return new Map<string, MaterialBestPrice>();
      }

      // Keep the lowest-LANDED quote per material. Each quote is keyed under both
      // its own material_id and (when it is a variant) its parent_id, so a parent
      // card rolls up its variants' quotes while standalone/variant cards still
      // resolve directly. This also collapses the old `${id}_${brand}` composite
      // key that every consumer looked up by plain id — the bug that made every
      // card read "No price".
      const priceMap = new Map<string, MaterialBestPrice>();

      const consider = (key: string, entry: MaterialBestPrice) => {
        const existing = priceMap.get(key);
        if (!existing || entry.landed_cost < existing.landed_cost) {
          priceMap.set(key, entry);
        }
      };

      for (const item of data || []) {
        if (!item.material_id) continue;
        if (item.current_price == null) continue; // a null must never win as ₹0

        const breakdown = computeLandedCost(item as unknown as LandedCostInput);
        const vendorData = item.vendors as { name: string } | null;
        const brandData = item.material_brands as { brand_name: string } | null;
        const parentId =
          (item.material as { parent_id: string | null } | null)?.parent_id ||
          null;

        const entry: MaterialBestPrice = {
          material_id: item.material_id,
          brand_id: item.brand_id || null,
          brand_name: brandData?.brand_name || null,
          vendor_id: item.vendor_id,
          vendor_name: vendorData?.name || "Unknown",
          unit_price: breakdown.base,
          landed_cost: breakdown.landed,
          gst_extra: breakdown.gstExtra,
          transport_extra: breakdown.transportExtra,
          price_note: landedCostNote(breakdown),
          price_includes_gst: item.price_includes_gst || false,
        };

        consider(item.material_id, entry);
        if (parentId) consider(parentId, entry);
      }

      return priceMap;
    }, { operationName: "useMaterialBestPrices" }),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Fetch the chronologically-latest purchase per material from the
 * v_material_latest_purchase view. One row per material that has at least
 * one purchase line item. Returned as a Map keyed by material_id for O(1)
 * lookup from the catalog list.
 */
export function useMaterialLatestPurchases() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["materials", "latest-purchases"],
    queryFn: wrapQueryFn(async () => {
      const { data, error } = await (supabase as any)
        .from("v_material_latest_purchase")
        .select(
          "material_id, last_purchase_date, last_unit_price, last_vendor_id, last_vendor_name, last_bill_url"
        );

      if (error) {
        // View may not be deployed yet in some environments — degrade gracefully
        // rather than blowing up the whole catalog list. The chip just won't render.
        console.warn("Could not fetch material latest purchases:", error.message);
        return new Map<string, MaterialLatestPurchase>();
      }

      const map = new Map<string, MaterialLatestPurchase>();
      for (const row of (data || []) as MaterialLatestPurchase[]) {
        map.set(row.material_id, row);
      }
      return map;
    }, { operationName: "useMaterialLatestPurchases" }),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Fetch audit info for materials (created_by, updated_by user names)
 */
export function useMaterialAuditInfo() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["materials", "audit-info"],
    queryFn: wrapQueryFn(async () => {
      const { data, error } = await supabase
        .from("materials")
        .select(`
          id,
          created_at,
          updated_at,
          created_by
        `)
        .eq("is_active", true);

      if (error) {
        console.warn("Could not fetch audit info:", error.message);
        return new Map<string, { created_at: string; updated_at: string; created_by_name: string | null }>();
      }

      // Get unique user IDs
      const userIds = [...new Set((data || []).map(m => m.created_by).filter(Boolean))] as string[];

      // Fetch user names
      let userMap = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from("users")
          .select("id, name")
          .in("id", userIds);

        userMap = new Map((users || []).map(u => [u.id, u.name]));
      }

      // Create audit info map
      const auditMap = new Map<string, { created_at: string; updated_at: string; created_by_name: string | null }>();

      for (const material of data || []) {
        auditMap.set(material.id, {
          created_at: material.created_at || "",
          updated_at: material.updated_at || "",
          created_by_name: material.created_by ? userMap.get(material.created_by) || null : null,
        });
      }

      return auditMap;
    }, { operationName: "useMaterialAuditInfo" }),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
