/**
 * Pure split math for contract-aware tea filling.
 *
 * The engineer enters ONE tea total for a day and includes a set of crews — the
 * implicit "Regular crew (mesthri)" row per site plus one row per *activated*
 * contract that worked. The total splits across the INCLUDED rows in proportion
 * to each crew's man-days; a row may carry an explicit amount override (then the
 * remaining auto rows share what's left). Money conserves: Σ row amounts == total
 * (whenever there is at least one auto row to absorb the remainder).
 *
 * This is intentionally dependency-free so it can be unit-tested in isolation.
 * The weighted rounding mirrors `allocateAmounts` in useGroupTeaShop.ts.
 */

export interface TeaSplitRow {
  /** Stable id for the row (e.g. `${kind}:${refId}` or `mesthri:${siteId}`). */
  key: string;
  siteId: string;
  /** Worker-days driving this row's share. */
  manDays: number;
  included: boolean;
  /** When set on an included row, the row is fixed at this rupee amount. */
  overrideAmount?: number | null;
}

export interface TeaSplitResultRow {
  key: string;
  siteId: string;
  /** Rupee share (0 when excluded). */
  amount: number;
  isOverride: boolean;
}

export interface TeaSplitResult {
  rows: TeaSplitResultRow[];
  /** Sum of included row amounts per site (what gets written to allocations). */
  bySite: Record<string, number>;
  /** Σ of all row amounts (== input total when an auto row can absorb remainder). */
  total: number;
}

/** Split `total` across `weights` (proportional, integer, conserving). */
function allocateByWeights(total: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  if (total <= 0) return weights.map(() => 0);
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    // No man-days to weigh by → split as evenly as possible.
    const base = Math.floor(total / n);
    const out = weights.map(() => base);
    const rem = total - base * n;
    for (let i = 0; i < rem; i++) out[i]++;
    return out;
  }
  const raw = weights.map((w) => (w / sum) * total);
  const floored = raw.map((x) => Math.floor(x));
  const rem = total - floored.reduce((a, b) => a + b, 0);
  const frac = raw
    .map((x, i) => ({ i, f: x - floored[i] }))
    .sort((a, b) => b.f - a.f);
  for (let k = 0; k < rem; k++) floored[frac[k].i]++;
  return floored;
}

export function computeContractTeaSplit(
  totalInput: number,
  rows: TeaSplitRow[]
): TeaSplitResult {
  const total = Math.max(0, Math.round(totalInput || 0));
  const amountByKey = new Map<string, number>();
  const overrideKeys = new Set<string>();
  for (const r of rows) amountByKey.set(r.key, 0);

  const included = rows.filter((r) => r.included);
  const overrides = included.filter(
    (r) => r.overrideAmount != null && Number.isFinite(r.overrideAmount)
  );
  const autoRows = included.filter(
    (r) => !(r.overrideAmount != null && Number.isFinite(r.overrideAmount))
  );

  let overrideSum = 0;
  for (const r of overrides) {
    const amt = Math.max(0, Math.round(r.overrideAmount as number));
    amountByKey.set(r.key, amt);
    overrideKeys.add(r.key);
    overrideSum += amt;
  }

  if (autoRows.length > 0) {
    const remainder = Math.max(0, total - overrideSum);
    const amounts = allocateByWeights(
      remainder,
      autoRows.map((r) => Math.max(0, r.manDays))
    );
    autoRows.forEach((r, i) => amountByKey.set(r.key, amounts[i]));
  }
  // If there are no auto rows, the overrides stand as-is (engineer set every row).

  const resultRows: TeaSplitResultRow[] = rows.map((r) => ({
    key: r.key,
    siteId: r.siteId,
    amount: amountByKey.get(r.key) ?? 0,
    isOverride: overrideKeys.has(r.key),
  }));

  const bySite: Record<string, number> = {};
  let grand = 0;
  for (const r of resultRows) {
    if (r.amount === 0) continue;
    bySite[r.siteId] = (bySite[r.siteId] ?? 0) + r.amount;
    grand += r.amount;
  }

  return { rows: resultRows, bySite, total: grand };
}
