/**
 * Group-stock metadata stored on `purchase_orders.internal_notes`.
 *
 * When a PO is created/edited as a group (cluster) purchase, the PO dialog
 * stashes a small JSON blob into `internal_notes`:
 *   { is_group_stock, site_group_id, payment_source_site_id }
 * (see UnifiedPurchaseOrderDialog.tsx). `payment_source_site_id` is the REAL
 * payer — the site whose money funded the buy — which can differ from the PO's
 * `site_id` (the originating / requesting / debtor site).
 *
 * `internal_notes` is a free-text column: older rows hold plain prose, group
 * rows hold this JSON. `parseGroupMeta` is the single tolerant reader used by
 * the thread mapper and the PO dialog so the parsing rules live in one place.
 */

export interface GroupStockMeta {
  is_group_stock?: boolean;
  site_group_id?: string;
  payment_source_site_id?: string;
}

/**
 * Parse the group-stock metadata out of a PO's `internal_notes`.
 *
 * Accepts a raw JSON string, an already-parsed object, or null/garbage.
 * Returns `null` when the value isn't group-stock JSON (e.g. plain-text notes),
 * so callers can safely `parseGroupMeta(...)?.payment_source_site_id`.
 */
export function parseGroupMeta(
  notes: string | Record<string, unknown> | null | undefined
): GroupStockMeta | null {
  if (!notes) return null;

  let obj: Record<string, unknown> | null = null;
  if (typeof notes === "string") {
    const trimmed = notes.trim();
    if (!trimmed.startsWith("{")) return null; // plain prose, not JSON
    try {
      const parsed = JSON.parse(trimmed);
      obj = parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  } else if (typeof notes === "object") {
    obj = notes;
  }

  if (!obj) return null;

  const meta: GroupStockMeta = {};
  if (typeof obj.is_group_stock === "boolean") meta.is_group_stock = obj.is_group_stock;
  if (typeof obj.site_group_id === "string") meta.site_group_id = obj.site_group_id;
  if (typeof obj.payment_source_site_id === "string")
    meta.payment_source_site_id = obj.payment_source_site_id;

  // Nothing recognizable → treat as non-group notes.
  if (
    meta.is_group_stock === undefined &&
    meta.site_group_id === undefined &&
    meta.payment_source_site_id === undefined
  ) {
    return null;
  }

  return meta;
}
