/**
 * Inter-site lifecycle state of a group batch, derived from the
 * `settlement_status` of its CROSS-SITE (non-self-use) `batch_usage_records`.
 *
 * This is the single source of truth for whether a group thread's cross-site
 * debt is genuinely finished. It deliberately does NOT collapse "a settlement
 * was raised" into "settled" — raising a settlement (Generate) flips the usage
 * rows `pending → in_settlement` but moves no money and posts no per-site
 * expense, so the Hub must keep showing it as unfinished until it is paid.
 *
 *  - `none`          → no cross-site usage (own-used, or nothing consumed yet).
 *  - `pending_usage` → at least one cross-site row is not yet in a settlement
 *                      (`settlement_status='pending'`). Next action: Generate /
 *                      reconcile the settlement.
 *  - `raised_unpaid` → a settlement exists (rows `in_settlement`) but is not yet
 *                      paid. Next action: record payment / net it. NOT settled.
 *  - `settled`       → every cross-site row is `settled` (debtor paid the
 *                      creditor and the per-site material expense was posted).
 *
 * Precedence matters when a batch carries a mix of statuses: an un-raised
 * `pending` row outranks a raised one (you must generate before you can pay),
 * which in turn outranks fully-settled.
 */
export type InterSiteStatus = "none" | "pending_usage" | "raised_unpaid" | "settled";

export function deriveInterSiteStatus(
  crossSiteSettlementStatuses: readonly string[]
): InterSiteStatus {
  if (crossSiteSettlementStatuses.length === 0) return "none";
  if (crossSiteSettlementStatuses.some((s) => s === "pending")) return "pending_usage";
  if (crossSiteSettlementStatuses.some((s) => s === "in_settlement")) return "raised_unpaid";
  return "settled";
}

/** A thread whose cross-site debt still needs an action (generate or pay). */
export function isInterSiteOutstanding(status: InterSiteStatus): boolean {
  return status === "pending_usage" || status === "raised_unpaid";
}
