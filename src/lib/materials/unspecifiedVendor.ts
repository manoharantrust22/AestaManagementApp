import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Stable code for the single reusable "house" vendor that backs catalog
 * list-prices entered without a real vendor (e.g. tile thickness prices for a
 * one-time site buy). The UI suppresses/relabels this vendor as "List price"
 * so no fake vendor noise appears on cards or the vendor inspect tab.
 */
export const UNSPECIFIED_VENDOR_CODE = "UNSPEC";
export const UNSPECIFIED_VENDOR_NAME = "List price (no vendor)";

/**
 * Look up the house "List price" vendor by its stable code, creating it once
 * if it does not exist. Returns the vendor id. Used by flows that capture a
 * plain price with no vendor selected, so the price can still land in
 * vendor_inventory (which the catalog card + inspect pane read from).
 */
export async function getOrCreateUnspecifiedVendor(
  supabase: SupabaseClient,
): Promise<string> {
  const { data: existing, error: lookupError } = await (supabase as any)
    .from("vendors")
    .select("id")
    .eq("code", UNSPECIFIED_VENDOR_CODE)
    .limit(1)
    .maybeSingle();

  if (lookupError) throw lookupError;
  if (existing?.id) return existing.id as string;

  const { data: created, error: insertError } = await (supabase as any)
    .from("vendors")
    .insert({
      name: UNSPECIFIED_VENDOR_NAME,
      code: UNSPECIFIED_VENDOR_CODE,
      vendor_type: "individual",
      is_active: true,
    })
    .select("id")
    .single();

  if (insertError) throw insertError;
  return created.id as string;
}
