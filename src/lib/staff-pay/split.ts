/**
 * Mirror of the split in record_staff_payment() (20261108100300_staff_pay.sql),
 * used for the "how will this be charged" preview. Works in paise; every site
 * after the first gets floor(amount * pct) / 100 and the first site takes the
 * rounding remainder, so allocations always sum exactly to the amount.
 */
export interface SplitShare {
  siteId: string;
  pct: number;
  amount: number;
}

export function splitStaffPayment(amount: number, sites: Array<{ siteId: string; pct?: number }>): SplitShare[] {
  const n = sites.length;
  if (!n || !(amount > 0)) return [];
  const total = Math.round(amount * 100) / 100;
  const pcts = sites.map((s) => (s.pct ?? 100 / n));
  let rest = 0;
  const out: SplitShare[] = sites.map((s, i) => ({ siteId: s.siteId, pct: pcts[i], amount: 0 }));
  for (let i = 1; i < n; i++) {
    // Same as SQL: floor(amount * pct) / 100 — epsilon guards float noise (e.g. 33.33… * 1000).
    const share = Math.floor(total * pcts[i] + 1e-6) / 100;
    out[i].amount = share;
    rest += share;
  }
  out[0].amount = Math.round((total - rest) * 100) / 100;
  return out;
}

export function pctsAreValid(pcts: number[]): boolean {
  if (!pcts.length || pcts.some((p) => !(p >= 0))) return false;
  return Math.abs(pcts.reduce((a, b) => a + b, 0) - 100) <= 0.01;
}
