/**
 * Helpers for the inter-site "offset a debt by a purchase" flow.
 *
 * A debtor can clear an inter-site debt without cash by pointing at a material
 * purchase THEY funded for the creditor — recorded as a `payment_mode='adjustment'`
 * payment against the settlement. These pure helpers pick the eligible purchases
 * and compute the suggested offset amount so the UI logic stays testable.
 *
 * NOTE: the robust guard against double-counting (a group-stock purchase that
 * already settles on its own) needs a hard link (`offset_expense_id`) which is a
 * deferred migration. Until then the UI warns and the user is responsible for
 * picking a purchase that isn't otherwise settling.
 */

/** Minimal shape of a material_purchase_expenses row needed to offset a debt. */
export interface OffsetPurchase {
  id: string;
  ref_code: string;
  paying_site_id?: string | null;
  site_id: string;
  total_amount: number;
  status?: string | null;
  purchase_type?: string | null;
  vendor_name?: string | null;
  vendor?: { name?: string | null } | null;
  purchase_date?: string | Date | null;
}

/** Statuses whose value is real/available to offset against. */
const OFFSETTABLE_STATUSES = new Set(["completed", "partial_used", "recorded"]);

/**
 * Purchases the DEBTOR funded that can be offered as an offset: funded by the
 * debtor (paying site, falling back to owning site), with a positive value and a
 * usable status. Sorted newest first.
 */
export function eligibleOffsetPurchases(
  purchases: OffsetPurchase[],
  debtorSiteId: string
): OffsetPurchase[] {
  return purchases
    .filter((p) => {
      const funder = p.paying_site_id ?? p.site_id;
      if (funder !== debtorSiteId) return false;
      if (Number(p.total_amount) <= 0) return false;
      if (p.status && !OFFSETTABLE_STATUSES.has(p.status)) return false;
      return true;
    })
    .sort((a, b) => purchaseTime(b) - purchaseTime(a));
}

function purchaseTime(p: OffsetPurchase): number {
  if (!p.purchase_date) return 0;
  const t = new Date(p.purchase_date).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Suggested offset amount: the smaller of the purchase's value and the debt
 * still outstanding (never negative). A purchase larger than the debt offsets
 * the whole debt; a smaller one offsets partially.
 */
export function suggestedOffsetAmount(purchaseTotal: number, pending: number): number {
  return Math.max(0, Math.min(Number(purchaseTotal) || 0, Number(pending) || 0));
}

/** Reference token stored on the adjustment payment for the audit trail. */
export function offsetReference(refCode: string): string {
  return `OFFSET-${refCode}`;
}

/** Human-readable note describing the offsetting purchase. */
export function offsetNote(p: OffsetPurchase): string {
  const vendor = p.vendor_name ?? p.vendor?.name ?? "vendor";
  return `Offset against purchase ${p.ref_code} (${vendor}) — debtor funded this for the creditor in lieu of cash.`;
}
