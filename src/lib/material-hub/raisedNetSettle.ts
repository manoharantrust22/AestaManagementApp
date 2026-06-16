/**
 * Net-settle for ALREADY-RAISED reciprocal inter-site settlements.
 *
 * When a cluster pair has a raised settlement in BOTH directions (e.g. Srini owes
 * Padma ₹18,200 AND Padma owes Srini ₹5,600), the smaller cancels into the
 * larger: offset ₹5,600 on both (an `adjustment` payment), settle the smaller in
 * full, leaving a single net ₹12,600 on the larger to pay. This pure helper
 * picks the reciprocal pairs and the offset/net amounts; the actual writes reuse
 * the existing `useRecordSettlementPayment` (no new settle engine).
 *
 * Deliberately handles only the clean "exactly one settlement per direction"
 * case — messier pairs (multiple settlements one way) are left to be paid
 * individually so we never guess which to cancel.
 */

export interface RaisedSettlementLike {
  id: string;
  settlement_code: string;
  creditor_site_id: string;
  creditor_site_name: string;
  debtor_site_id: string;
  debtor_site_name: string;
  pending_amount: number;
}

export interface ReciprocalPair<T extends RaisedSettlementLike> {
  /** Higher-pending settlement (keeps the net remainder to pay). */
  larger: T;
  /** Lower-pending settlement (fully cancelled by the offset). */
  smaller: T;
  /** ₹ cancelled on both sides = min(pending). */
  offsetAmount: number;
  /** ₹ left to pay after the offset = |difference|. 0 when equal. */
  netAmount: number;
  /** Net direction: ower owes owed `netAmount` (the larger's direction). */
  owerSiteId: string;
  owerName: string;
  owedSiteId: string;
  owedName: string;
}

export function reciprocalRaisedPairs<T extends RaisedSettlementLike>(
  items: T[]
): ReciprocalPair<T>[] {
  const byPair = new Map<string, T[]>();
  for (const s of items) {
    const key = [s.creditor_site_id, s.debtor_site_id].sort().join("|");
    const arr = byPair.get(key);
    if (arr) arr.push(s);
    else byPair.set(key, [s]);
  }

  const pairs: ReciprocalPair<T>[] = [];
  for (const group of byPair.values()) {
    if (group.length !== 2) continue; // only the clean 1-each-direction case
    const [a, b] = group;
    if (a.debtor_site_id === b.debtor_site_id) continue; // same direction, not reciprocal
    const larger = a.pending_amount >= b.pending_amount ? a : b;
    const smaller = larger === a ? b : a;
    pairs.push({
      larger,
      smaller,
      offsetAmount: Math.min(a.pending_amount, b.pending_amount),
      netAmount: Math.abs(a.pending_amount - b.pending_amount),
      owerSiteId: larger.debtor_site_id,
      owerName: larger.debtor_site_name,
      owedSiteId: larger.creditor_site_id,
      owedName: larger.creditor_site_name,
    });
  }
  return pairs;
}
