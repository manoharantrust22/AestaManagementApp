/**
 * Task-work over/under-paid monitor (Ship 2a).
 *
 * Pure math, no Supabase — testable in isolation.
 *
 * Two questions a site engineer asks about a lump-sum task work:
 *  1. "Was the price a good deal?" → compare the agreed lump sum to a day-wage
 *     BENCHMARK built from a multi-worker estimate (Mason ×2 × 6d × ₹900, …).
 *     benchmark − price = expected saving (positive = lump sum beats day wages).
 *  2. "Are we over/under-paying the crew?" → compare the agreed price to the
 *     ACTUAL labour value implied by attendance/headcount (units × role rates).
 *     price − actualLaborValue = the crew's margin. A big margin means we likely
 *     overpaid; a negative margin means the crew is running at a loss (underpaid),
 *     which risks abandonment or poor quality.
 */

export interface EstimateLine {
  workerCount: number;
  days: number;
  dailyRate: number;
}

/** Day-wage benchmark for the whole job = Σ(count × days × rate). */
export function estimateBenchmark(lines: EstimateLine[]): number {
  return lines.reduce(
    (sum, l) =>
      sum +
      Math.max(0, Number(l.workerCount) || 0) *
        Math.max(0, Number(l.days) || 0) *
        Math.max(0, Number(l.dailyRate) || 0),
    0
  );
}

export type MonitorVerdict = "fair" | "overpaid" | "underpaid" | "unknown";

/** Margin above this fraction of actual labour value reads as "overpaid". */
export const OVERPAID_MARGIN_THRESHOLD = 0.2;

export interface MonitorInput {
  /** The agreed lump sum (subcontract.total_value). */
  agreedPrice: number;
  /** Day-wage benchmark from the estimate lines (0 when no estimate entered). */
  benchmark: number;
  /** Implied labour value from attendance/headcount × rates (0 when untracked). */
  actualLaborValue: number;
}

export interface MonitorResult {
  /** benchmark − price, or null when there is no benchmark. */
  expectedSaving: number | null;
  /** expectedSaving / benchmark, or null. */
  expectedSavingPct: number | null;
  /** price − actualLaborValue (the crew's margin), or null when untracked. */
  margin: number | null;
  /** margin / actualLaborValue, or null. */
  marginPct: number | null;
  verdict: MonitorVerdict;
}

export function computeMonitor(input: MonitorInput): MonitorResult {
  const price = Math.max(0, Number(input.agreedPrice) || 0);
  const benchmark = Math.max(0, Number(input.benchmark) || 0);
  const actual = Math.max(0, Number(input.actualLaborValue) || 0);

  const expectedSaving = benchmark > 0 ? benchmark - price : null;
  const expectedSavingPct =
    benchmark > 0 ? (benchmark - price) / benchmark : null;

  let margin: number | null = null;
  let marginPct: number | null = null;
  let verdict: MonitorVerdict = "unknown";

  if (actual > 0) {
    margin = price - actual;
    marginPct = margin / actual;
    if (marginPct < 0) verdict = "underpaid";
    else if (marginPct > OVERPAID_MARGIN_THRESHOLD) verdict = "overpaid";
    else verdict = "fair";
  }

  return { expectedSaving, expectedSavingPct, margin, marginPct, verdict };
}
