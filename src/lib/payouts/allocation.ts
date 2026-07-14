/**
 * Pure allocation logic for the Weekly Payout Console pay drawer.
 *
 * When the user edits the grand total, the amount is distributed across the
 * laborer's buckets deterministically, matching the ledger's oldest-dues-first
 * mental model (the same order the read-time salary waterfall uses):
 *
 *   tier 1: every bucket's EARLIER (pre-week) unpaid
 *   tier 2: every bucket's THIS-WEEK unpaid
 *   within a tier: company-salary buckets first, then contracts, ordered by
 *   (site name, title) for stability.
 *
 * Greedy sequential fill — no proportional rounding drift; the last partially
 * funded bucket simply receives the remainder. All amounts are rupees with
 * paise precision (2 decimals).
 */

import type { PayoutBucket } from "@/types/payout.types";

export interface BucketAllocation {
  key: string;
  amount: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Stable identity of a bucket within one laborer's payout. */
export function bucketKey(b: Pick<PayoutBucket, "siteId" | "kind" | "refKind" | "refId">): string {
  return [b.siteId, b.kind, b.refKind ?? "", b.refId ?? ""].join("|");
}

/** Tier-independent bucket ordering: company first, then (site, title). */
export function compareBuckets(a: PayoutBucket, b: PayoutBucket): number {
  if (a.kind !== b.kind) return a.kind === "company_salary" ? -1 : 1;
  const site = a.siteName.localeCompare(b.siteName);
  if (site !== 0) return site;
  return a.title.localeCompare(b.title);
}

/**
 * Distribute `total` rupees across the buckets. Returns one allocation per
 * bucket (zero-amount allocations included so the UI can render every row).
 * `total` above the sum of all unpaid is clamped down — the console never
 * records more than the ledgers allow.
 */
export function allocateTotal(buckets: PayoutBucket[], total: number): BucketAllocation[] {
  const ordered = [...buckets].sort(compareBuckets);
  const amounts = new Map<string, number>(ordered.map((b) => [bucketKey(b), 0]));

  let remaining = round2(Math.max(0, total));

  for (const tier of ["earlier", "thisWeek"] as const) {
    for (const b of ordered) {
      if (remaining <= 0) break;
      const capacity = tier === "earlier" ? b.earlierUnpaid : b.thisWeekUnpaid;
      if (capacity <= 0) continue;
      const key = bucketKey(b);
      const take = round2(Math.min(remaining, capacity));
      amounts.set(key, round2((amounts.get(key) ?? 0) + take));
      remaining = round2(remaining - take);
    }
  }

  return ordered.map((b) => ({ key: bucketKey(b), amount: amounts.get(bucketKey(b)) ?? 0 }));
}

/**
 * Stable content hash of an allocation set — feeds the deterministic
 * idempotency key so the same submission retried yields the same batch.
 */
export function bucketsHash(allocations: BucketAllocation[]): string {
  return [...allocations]
    .filter((a) => a.amount > 0)
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((a) => `${a.key}=${Math.round(a.amount * 100)}`)
    .join(";");
}
