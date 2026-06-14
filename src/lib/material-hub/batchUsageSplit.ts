/**
 * Pure helpers for the Material Hub "This batch" log-usage flow:
 *   - deriving the implicit brand of a clicked group batch, and
 *   - classifying / validating a per-consuming-site usage split against it.
 *
 * Kept framework-free so the brand-lock and self-use/inter-site rules are unit
 * testable without rendering WaterfallUsageDialog.
 */

export const NO_BRAND = "__none__";

/** Stable key for a brand id (null/empty → the NO_BRAND sentinel). */
export function brandKey(brandId: string | null | undefined): string {
  return brandId == null || brandId === "" ? NO_BRAND : brandId;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

interface BatchItemLike {
  material_id?: string;
  material?: { id?: string } | null;
  brand_id?: string | null;
  brand?: { id?: string | null } | null;
}

interface BatchLike {
  ref_code?: string;
  items?: BatchItemLike[] | null;
}

/**
 * The implicit brand of a clicked batch for a given material — the brand the
 * "This batch" usage scope must lock to so its candidate filter can't mismatch a
 * SIBLING batch's brand (which would falsely report "no remaining stock").
 * Returns the NO_BRAND sentinel for an unbranded batch item, or null when the
 * batch / material item isn't found (e.g. the batch is completed and filtered out).
 */
export function deriveBatchBrandKey(
  batches: BatchLike[],
  refCode: string | null | undefined,
  materialId: string
): string | null {
  if (!refCode) return null;
  const b = batches.find((x) => x.ref_code === refCode);
  if (!b) return null;
  for (const it of b.items ?? []) {
    const mId = it.material_id ?? it.material?.id;
    if (mId !== materialId) continue;
    return brandKey(it.brand_id ?? it.brand?.id ?? null);
  }
  return null;
}

export interface SiteSplitEntry {
  siteId: string;
  qty: number;
}

export interface SiteSplitSummary {
  total: number;
  /** Cost consumed by the paying site itself — no inter-site settlement. */
  selfUse: number;
  /** Cost other sites owe the paying site for this batch. */
  interSite: number;
  /** Distinct consuming sites (≠ payer) that owe for this batch. */
  owedSiteIds: string[];
}

/**
 * Classify a per-site split against a batch paid by `payingSiteId`. A row whose
 * site equals the payer is self-use; any other site owes the payer.
 */
export function summarizeSiteSplit(
  entries: SiteSplitEntry[],
  payingSiteId: string | null,
  landedUnitCost: number
): SiteSplitSummary {
  let total = 0;
  let selfUse = 0;
  let interSite = 0;
  const owed = new Set<string>();
  for (const e of entries) {
    const q = Number(e.qty) || 0;
    if (q <= 0) continue;
    total = round3(total + q);
    const cost = q * landedUnitCost;
    if (payingSiteId && payingSiteId === e.siteId) selfUse += cost;
    else {
      interSite += cost;
      owed.add(e.siteId);
    }
  }
  return { total, selfUse, interSite, owedSiteIds: Array.from(owed) };
}

export interface SiteSplitValidation {
  total: number;
  remainingAfter: number;
  over: boolean;
  canSubmit: boolean;
}

/**
 * Validate a split total against the batch's remaining stock. Partial usage is
 * allowed (total ≤ remaining); over-allocation is blocked. The server RPC also
 * enforces this atomically — this is the friendly pre-submit guard.
 */
export function validateSiteSplit(
  total: number,
  remaining: number,
  eps = 1e-6
): SiteSplitValidation {
  const over = total - remaining > eps;
  return {
    total,
    remainingAfter: round3(remaining - total),
    over,
    canSubmit: total > eps && !over,
  };
}
