/**
 * Default price-scoping declaration per material category.
 *
 * Answers, for a newly created material: does a vendor's price depend on the
 * BRAND, and does it depend on the VARIANT? The quote form uses the material's
 * own flags (materials.price_varies_by_brand / _by_variant) — this table only
 * seeds them, so a wrong guess here is one toggle away from being fixed rather
 * than a permanent mistake.
 *
 * MUST stay in sync with the backfill table in
 * supabase/migrations/20260716100100_materials_price_scoping.sql.
 */

export interface PriceScopingDefaults {
  price_varies_by_brand: boolean;
  price_varies_by_variant: boolean;
}

const DEFAULTS_BY_CODE: Record<string, PriceScopingDefaults> = {
  // Ramco vs Dalmia matters; every bag is 50 kg
  CEM: { price_varies_by_brand: true, price_varies_by_variant: false },
  'CEM-PPC': { price_varies_by_brand: true, price_varies_by_variant: false },
  'CEM-OPC53': { price_varies_by_brand: true, price_varies_by_variant: false },

  // 8mm vs 20mm is a different price entirely
  STL: { price_varies_by_brand: true, price_varies_by_variant: true },
  'STL-TMT': { price_varies_by_brand: true, price_varies_by_variant: true },
  'STL-WIRE': { price_varies_by_brand: true, price_varies_by_variant: false },

  // Sand is sand. (Jalli is the exception — it has real size variants, which the
  // migration's evidence pass catches. New aggregate materials start false and
  // get toggled if they turn out to be sized.)
  AGG: { price_varies_by_brand: false, price_varies_by_variant: false },
  'AGG-MSAND': { price_varies_by_brand: false, price_varies_by_variant: false },
  'AGG-PSAND': { price_varies_by_brand: false, price_varies_by_variant: false },
  'AGG-BM20': { price_varies_by_brand: false, price_varies_by_variant: false },

  // Local kilns; no brand to speak of
  BRK: { price_varies_by_brand: false, price_varies_by_variant: false },
  'BRK-RED': { price_varies_by_brand: false, price_varies_by_variant: false },
  'BRK-CMT': { price_varies_by_brand: false, price_varies_by_variant: false },
  'BRK-AAC': { price_varies_by_brand: false, price_varies_by_variant: false },

  PLB: { price_varies_by_brand: true, price_varies_by_variant: true }, // diameter
  ELC: { price_varies_by_brand: true, price_varies_by_variant: true }, // gauge

  // Teak encodes size in its BRANDS (Palagai 4", Log ...), not in variants
  WOD: { price_varies_by_brand: true, price_varies_by_variant: false },
  // Sheet goods: brand AND thickness both move the price
  'WOD-PLY': { price_varies_by_brand: true, price_varies_by_variant: true },

  TIL: { price_varies_by_brand: true, price_varies_by_variant: true }, // size
  // Can size is a PACK, not a variant
  PNT: { price_varies_by_brand: true, price_varies_by_variant: false },

  HRD: { price_varies_by_brand: false, price_varies_by_variant: false },
  GLS: { price_varies_by_brand: false, price_varies_by_variant: true }, // cut to size
  WPF: { price_varies_by_brand: true, price_varies_by_variant: false },
  MSC: { price_varies_by_brand: false, price_varies_by_variant: false },
  CTR: { price_varies_by_brand: false, price_varies_by_variant: false },

  PMP: { price_varies_by_brand: true, price_varies_by_variant: true }, // HP
  'PMP-SUB': { price_varies_by_brand: true, price_varies_by_variant: true },
  'PMP-PNL': { price_varies_by_brand: true, price_varies_by_variant: false },
};

const NEITHER: PriceScopingDefaults = {
  price_varies_by_brand: false,
  price_varies_by_variant: false,
};

/**
 * Seed values for a material in the given category. Falls back to "depends on
 * neither" for unknown/absent codes — the permissive option, matching the
 * columns' own DEFAULT false. Tries the subcategory code first, then its
 * top-level prefix (so a future 'PLB-CPVC' inherits Plumbing).
 */
export function defaultsForCategoryCode(
  code: string | null | undefined
): PriceScopingDefaults {
  if (!code) return NEITHER;
  const upper = code.toUpperCase();
  if (DEFAULTS_BY_CODE[upper]) return DEFAULTS_BY_CODE[upper];

  const topLevel = upper.split('-')[0];
  return DEFAULTS_BY_CODE[topLevel] ?? NEITHER;
}
