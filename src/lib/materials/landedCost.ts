/**
 * Landed cost — the single per-unit figure used to compare material quotes
 * across vendors on the catalog (cards + inspect pane).
 *
 * landed = current_price
 *        + gstExtra        (GST only when the vendor explicitly stated it)
 *        + transportExtra  (transport + loading + unloading, when not already in price)
 *
 * GST rule (deliberately conservative — see the design spec): most bills are
 * no-GST. We add GST ONLY when a quote carries gst_rate > 0 AND is marked
 * GST-exclusive. When gst_rate is null/0 (the common sand/aggregate case) GST
 * impact is zero and the word "GST" never surfaces in any label. Basis is
 * GST-inclusive (cash-out cost).
 *
 * This module is intentionally pure (no React, no Supabase) so the exact same
 * arithmetic can be mirrored in the get_material_vendor_summary SQL RPC.
 */

export interface LandedCostInput {
  current_price: number | null | undefined;
  price_includes_gst?: boolean | null;
  gst_rate?: number | null;
  price_includes_transport?: boolean | null;
  transport_cost?: number | null;
  loading_cost?: number | null;
  unloading_cost?: number | null;
}

export interface LandedCostBreakdown {
  /** The raw quoted price (current_price), coalesced to 0. */
  base: number;
  /** GST added on top of base (0 when included or unknown). */
  gstExtra: number;
  /** transport + loading + unloading added on top of base. */
  transportExtra: number;
  /** base + gstExtra + transportExtra. */
  landed: number;
}

const num = (v: number | null | undefined): number =>
  typeof v === "number" && Number.isFinite(v) ? v : 0;

export function computeLandedCost(row: LandedCostInput): LandedCostBreakdown {
  const base = num(row.current_price);
  const gstRate = num(row.gst_rate);

  // GST only when explicitly stated as excluded with a real rate.
  const gstExtra =
    row.price_includes_gst || gstRate <= 0 ? 0 : base * (gstRate / 100);

  const transportExtra =
    (row.price_includes_transport ? 0 : num(row.transport_cost)) +
    num(row.loading_cost) +
    num(row.unloading_cost);

  const landed = base + gstExtra + transportExtra;
  return { base, gstExtra, transportExtra, landed };
}

/**
 * Short human note describing what the landed figure bundles, e.g.
 * "incl. transport", "incl. GST", "incl. transport & GST", or "" when the
 * landed figure equals the bare quoted price.
 */
export function landedCostNote(b: LandedCostBreakdown): string {
  const parts: string[] = [];
  if (b.transportExtra > 0) parts.push("transport");
  if (b.gstExtra > 0) parts.push("GST");
  return parts.length ? `incl. ${parts.join(" & ")}` : "";
}
