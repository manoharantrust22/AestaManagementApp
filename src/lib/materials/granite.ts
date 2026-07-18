import type { GraniteLine } from "@/types/spaces.types";
import { formatFeetInches, round2 } from "@/lib/spaces/measurements";

/** A fresh empty slab line for the granite/area size editor. */
export const makeGraniteLine = (): GraniteLine => ({
  id: `g-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  label: "",
  length_in: 0,
  width_in: 0,
  count: 1,
});

/**
 * Human-readable slab-size summary, e.g.
 * "Kitchen top: 12' × 2'; Steps: 4' × 11" ×10".
 * Saved to a request item's notes / a spot-purchase batch's notes so the
 * actual sizes bought/needed are preserved alongside the computed sq.ft.
 */
export const graniteSizeNote = (lines: GraniteLine[]): string =>
  lines
    .filter((l) => l.length_in > 0 && l.width_in > 0)
    .map((l) => {
      const dims = `${formatFeetInches(l.length_in)} × ${formatFeetInches(l.width_in)}`;
      const label = l.label.trim();
      const cnt = l.count > 1 ? ` ×${l.count}` : "";
      return `${label ? `${label}: ` : ""}${dims}${cnt}`;
    })
    .join("; ");

/**
 * Area-variance threshold (%). Beyond this, the slabs bought are "drastically"
 * off what the site asked for — likely a mis-keyed dimension rather than the
 * normal bit of extra that gets cut off.
 */
export const GRANITE_AREA_VARIANCE_WARN_PCT = 10;

export interface GraniteAreaVariance {
  requestedSqft: number;
  actualSqft: number;
  /** actual − requested. Positive = extra slab bought, i.e. offcut/wastage. */
  diffSqft: number;
  /** diff as a % of requested. Null when requested is 0 (nothing to compare to). */
  diffPct: number | null;
  isLarge: boolean;
}

/**
 * Compares the slab area actually bought against what the site asked for.
 *
 * The vendor never stocks the exact sizes, so a positive diff is normal and
 * expected — it is the offcut you pay for and cut off on site. This exists to
 * make that number visible, not to flag it as an error.
 */
export function graniteAreaVariance(
  requestedSqft: number,
  actualSqft: number
): GraniteAreaVariance {
  const requested = round2(Math.max(requestedSqft || 0, 0));
  const actual = round2(Math.max(actualSqft || 0, 0));
  const diffSqft = round2(actual - requested);
  const diffPct = requested > 0 ? round2((diffSqft / requested) * 100) : null;

  return {
    requestedSqft: requested,
    actualSqft: actual,
    diffSqft,
    diffPct,
    isLarge:
      diffPct != null && Math.abs(diffPct) > GRANITE_AREA_VARIANCE_WARN_PCT,
  };
}

/**
 * How much of a request item a PO line consumes.
 *
 * Area lines may legitimately order MORE than the request still needs (bigger
 * slabs), but the allocation itself must never exceed it: the fulfilment
 * trigger caps credit at LEAST(received_qty, quantity_allocated), so
 * over-allocating claims more of the request than it ever asked for, while
 * the cap still closes the request cleanly and leaves the overage visible as
 * PO quantity vs allocation.
 */
export const graniteQuantityAllocated = (
  quantityToOrder: number,
  remainingQty: number
): number => Math.min(Math.max(quantityToOrder, 0), Math.max(remainingQty, 0));
