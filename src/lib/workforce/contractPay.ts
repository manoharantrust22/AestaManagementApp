/**
 * Contract-laborer pay math — pure, mirrored from the SQL RPC
 * `record_contract_laborer_payment` so the dialog and the server never disagree.
 * "Paid" for a contract laborer is a rupee amount (Σ linked settlement groups),
 * NOT whole attendance-days.
 */
function n(v: number | null | undefined): number {
  return v == null || !Number.isFinite(v) ? 0 : v;
}

/** What's still owed to a contract laborer = net earned − already paid (never < 0). */
export function remainingOwed(
  netOwed: number | null | undefined,
  alreadyPaid: number | null | undefined,
): number {
  return Math.max(0, n(netOwed) - n(alreadyPaid));
}

/** A payment can never exceed the remaining or go below 0 (matches the server clamp). */
export function clampPayment(
  amount: number | null | undefined,
  remaining: number | null | undefined,
): number {
  return Math.min(Math.max(0, n(amount)), Math.max(0, n(remaining)));
}
