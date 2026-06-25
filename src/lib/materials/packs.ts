/**
 * Helpers for "pack-only" materials — products sold only in fixed standard
 * cans/containers (see {@link MaterialPack}). Pure functions, no React.
 */
import { formatCurrency } from "@/lib/formatters";
import type { MaterialPack } from "@/types/material.types";

/**
 * Active packs sorted for display: by `display_order`, then by `contents_qty`
 * (smallest can first). Tolerates null/undefined input.
 */
export function activePacks(
  packs: MaterialPack[] | null | undefined
): MaterialPack[] {
  return (packs ?? [])
    .filter((p) => p.is_active)
    .sort(
      (a, b) =>
        a.display_order - b.display_order || a.contents_qty - b.contents_qty
    );
}

/**
 * The pack used to represent a material on cards/lists: the smallest active
 * can (tie-broken by lowest `display_order`). Returns null when no active pack.
 */
export function representativePack(
  packs: MaterialPack[] | null | undefined
): MaterialPack | null {
  const active = (packs ?? []).filter((p) => p.is_active);
  if (active.length === 0) return null;
  return active.reduce((best, p) => {
    if (p.contents_qty < best.contents_qty) return p;
    if (p.contents_qty === best.contents_qty && p.display_order < best.display_order)
      return p;
    return best;
  });
}

/**
 * "₹1,620 / 5 L can". Returns null when the pack has no price yet, so callers
 * can fall back to a per-base-unit estimate.
 */
export function formatPackPrice(pack: MaterialPack): string | null {
  if (pack.price == null) return null;
  return `${formatCurrency(pack.price)} / ${pack.label}`;
}

/**
 * Base-unit total for `count` whole cans of `pack` — the value stored in
 * requested_qty / purchase_order_items.quantity. Invalid counts → 0.
 */
export function packBaseQty(pack: MaterialPack, count: number): number {
  if (!Number.isFinite(count) || count <= 0) return 0;
  return pack.contents_qty * count;
}

/**
 * Per-base-unit price implied by a pack (e.g. ₹324/L for a 5 L can at ₹1,620).
 * Used as the PO `unit_price` so all existing money math stays per base unit.
 * Returns null when price or contents are missing/zero.
 */
export function packUnitPrice(pack: MaterialPack): number | null {
  if (pack.price == null || !pack.contents_qty) return null;
  return pack.price / pack.contents_qty;
}
