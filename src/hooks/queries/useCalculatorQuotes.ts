"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { wrapQueryFn } from "@/lib/utils/timeout";
import type { VendorQuote } from "@/lib/category-calculator-templates";

/**
 * Fetches vendor prices for a given material, deduplicated to one row per vendor
 * (lowest price wins). Vendor prices are per-material — quality/brand selection
 * does NOT filter vendors because vendor_inventory has no brand_id associations
 * for most materials.
 *
 * @param materialId - Pass null to disable the query.
 * @param _brandId   - Retained in signature for call-site compatibility; unused.
 */
export function useCalculatorVendorQuotes(
  materialId: string | null,
  _brandId?: string | null,
): { quotes: VendorQuote[]; isLoading: boolean; error: Error | null } {
  const supabase = createClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["calculatorQuotes", materialId],
    enabled: materialId !== null,
    queryFn: wrapQueryFn(
      async () => {
        const { data: rows, error: queryError } = await supabase
          .from("vendor_inventory")
          .select(
            `
            vendor_id,
            current_price,
            price_includes_gst,
            last_price_update,
            updated_at,
            vendors(name)
          `,
          )
          .eq("material_id", materialId as string)
          .eq("is_available", true)
          .gt("current_price", 0)
          .order("current_price", { ascending: true });

        if (queryError) throw new Error(queryError.message);

        // Deduplicate by vendor_id — keep the row with the lowest price.
        // vendor_inventory accumulates multiple price-history rows per vendor.
        const bestByVendor = new Map<string, (typeof rows)[number]>();
        for (const row of rows ?? []) {
          if (!row.vendor_id || row.current_price == null) continue;
          const existing = bestByVendor.get(row.vendor_id);
          if (!existing || row.current_price < existing.current_price!) {
            bestByVendor.set(row.vendor_id, row);
          }
        }

        return Array.from(bestByVendor.values())
          .sort((a, b) => a.current_price! - b.current_price!)
          .map((row): VendorQuote => {
            const vendorData = row.vendors as { name: string } | null;
            return {
              vendorId: row.vendor_id,
              vendorName: vendorData?.name ?? "Unknown Vendor",
              unitPrice: row.current_price!,
              updatedAt: row.last_price_update ?? row.updated_at ?? null,
              priceIncludesGst: row.price_includes_gst ?? false,
            };
          });
      },
      { operationName: "useCalculatorVendorQuotes" },
    ),
    staleTime: 5 * 60 * 1000,
  });

  return {
    quotes: data ?? [],
    isLoading,
    error: error as Error | null,
  };
}
