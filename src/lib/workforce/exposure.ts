/**
 * Workforce exposure model — the hero metric of the redesigned Workforce "Workspace".
 *
 * Question it answers: have you paid a crew AHEAD of the work they've actually done
 * (you're exposed if they walk off) or are you holding money back (safe)?
 *
 *   workValue = quoted * work            // ₹ value of work actually done (work is a 0–1 fraction)
 *   exposure  = paid - workValue         // + = paid ahead of work (risk); − = held back (safe)
 *   ratio     = exposure / quoted        // normalised so the verdict is size-independent
 *
 * Spec: docs/design_handoff_workforce/README.md ("The exposure model").
 *
 * This module is PURE (no React, no styling). Severity → colour/icon/tint mapping lives in
 * `workspaceTokens.ts`; here we only decide the severity key and the numbers.
 */

/** App severity keys. `untracked` is our addition for "progress not set yet" (work === null). */
export type Severity =
  | "untracked"
  | "none"
  | "high"
  | "watch"
  | "instep"
  | "safe";

export const MAX_RATIO = 0.3;

export interface ExposureInput {
  /** Agreed lump-sum total, ₹. */
  quoted: number;
  /** ₹ paid so far. */
  paid: number;
  /** Fraction complete (0–1), or null when progress is not tracked yet. */
  work: number | null;
}

export interface ExposureResult {
  tracked: boolean;
  severity: Severity;
  /** ₹ value of work done, or null when untracked. */
  workValue: number | null;
  /** paid − workValue, or null when untracked. */
  exposure: number | null;
  /** exposure / quoted, or null when untracked. */
  ratio: number | null;
}

/**
 * Decide severity from the normalised ratio. Bands (from the README):
 *   work==0 && paid==0 → none   (nothing started)
 *   ratio >  0.15      → high    (paid well ahead)
 *   ratio >  0.04      → watch   (slightly ahead)
 *   ratio ∈ [-0.04, .04] → instep (in step)
 *   ratio < -0.04      → safe    (money still in hand)
 */
export function severityFor(
  ratio: number,
  paid: number,
  work: number
): Exclude<Severity, "untracked"> {
  if (work === 0 && paid === 0) return "none";
  if (ratio > 0.15) return "high";
  if (ratio > 0.04) return "watch";
  if (ratio >= -0.04) return "instep";
  return "safe";
}

export function computeExposure({
  quoted,
  paid,
  work,
}: ExposureInput): ExposureResult {
  if (work === null || work === undefined) {
    return {
      tracked: false,
      severity: "untracked",
      workValue: null,
      exposure: null,
      ratio: null,
    };
  }
  const workValue = quoted * work;
  const exposure = paid - workValue;
  const ratio = quoted > 0 ? exposure / quoted : 0;
  return {
    tracked: true,
    severity: severityFor(ratio, paid, work),
    workValue,
    exposure,
    ratio,
  };
}

export interface MeterGeometry {
  /** % from the left where the fill bar starts. */
  fillLeftPct: number;
  /** width of the fill bar, in %. */
  fillWidthPct: number;
  /** % from the left of the end marker. */
  markerPct: number;
}

/**
 * Geometry for the diverging balance meter. Centre (50%) = "in step". The fill grows
 * RIGHT into the exposed (paid-ahead) half when exposure ≥ 0, LEFT into the safe half
 * when exposure < 0. Ratio is clamped to ±MAX_RATIO so extreme values stay on-track.
 */
export function meterGeometry(ratio: number): MeterGeometry {
  const cl = Math.max(-MAX_RATIO, Math.min(MAX_RATIO, ratio));
  const w = (Math.abs(cl) / MAX_RATIO) * 50;
  if (cl >= 0) {
    return { fillLeftPct: 50, fillWidthPct: w, markerPct: 50 + w };
  }
  return { fillLeftPct: 50 - w, fillWidthPct: w, markerPct: 50 - w };
}

export interface RollupTask {
  quoted: number;
  paid: number;
  work: number | null;
}

export interface RollupResult {
  /** Σ paid over ALL tasks (paid is always known). */
  paid: number;
  /** Σ quoted over ALL tasks. */
  quoted: number;
  /** Σ quoted over TRACKED tasks only. */
  quotedTracked: number;
  /** Σ paid over TRACKED tasks only. */
  paidTracked: number;
  /** Σ (quoted × work) over tracked tasks = total ₹ value of work done. */
  workValue: number;
  /** paidTracked − workValue (rollup exposure over tracked tasks). */
  exposure: number;
  /** exposure / quotedTracked, or 0. */
  ratio: number;
  /** Σ max(0, per-task exposure) over tracked tasks — the site/trade "At risk" number. */
  atRisk: number;
  trackedCount: number;
  untrackedCount: number;
  total: number;
}

/**
 * Trade / site rollup. Sums quoted, paid and workValue, then runs the same formula on the
 * totals. Untracked tasks (work === null) contribute to `paid`/`quoted` but are EXCLUDED
 * from the exposure aggregates (workValue / exposure / atRisk) — so historical, never-tracked
 * contracts don't manufacture a day-one wall of red. `untrackedCount` surfaces how many.
 */
export function rollupTasks(tasks: RollupTask[]): RollupResult {
  let paid = 0;
  let quoted = 0;
  let quotedTracked = 0;
  let paidTracked = 0;
  let workValue = 0;
  let atRisk = 0;
  let trackedCount = 0;
  let untrackedCount = 0;

  for (const t of tasks) {
    paid += t.paid;
    quoted += t.quoted;
    if (t.work === null || t.work === undefined) {
      untrackedCount += 1;
      continue;
    }
    trackedCount += 1;
    quotedTracked += t.quoted;
    paidTracked += t.paid;
    const wv = t.quoted * t.work;
    workValue += wv;
    const exp = t.paid - wv;
    if (exp > 0) atRisk += exp;
  }

  const exposure = paidTracked - workValue;
  const ratio = quotedTracked > 0 ? exposure / quotedTracked : 0;

  return {
    paid,
    quoted,
    quotedTracked,
    paidTracked,
    workValue,
    exposure,
    ratio,
    atRisk,
    trackedCount,
    untrackedCount,
    total: tasks.length,
  };
}

/** Severity for a trade/site rollup (untracked when nothing is tracked yet). */
export function rollupSeverity(r: RollupResult): Severity {
  if (r.trackedCount === 0) return "untracked";
  // work=1 so the "not started" branch never fires at the rollup level.
  return severityFor(r.ratio, r.paidTracked, 1);
}

/** The "good deal" check (secondary): day-wage benchmark vs the agreed price. */
export function goodDealSaving(
  benchmark: number | null,
  quoted: number
): number | null {
  if (benchmark === null || benchmark <= 0) return null;
  return Math.max(0, benchmark - quoted);
}
