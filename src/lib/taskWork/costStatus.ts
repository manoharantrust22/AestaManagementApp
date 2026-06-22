/**
 * "Money vs work" status for a task-work package (Phase 2).
 *
 * Ties together three numbers a site engineer cares about on a fixed-price
 * package:
 *   - effectiveAgreed = base price + approved extras (variations)
 *   - workValue       = Σ(count × rate) from the costed day logs (work done so far)
 *   - paid            = Σ payments made so far
 *
 * and answers "are we paying the maistry AHEAD of (overpaid) or BEHIND
 * (underpaid) the work he has actually done?" Pure math, no Supabase.
 */

import { OVERPAID_MARGIN_THRESHOLD } from "@/lib/workforce/taskWorkMonitor";

export type CostVerdict = "ahead" | "behind" | "fair" | "unknown";

export interface CostStatusInput {
  effectiveAgreed: number;
  workValue: number;
  paid: number;
}

export interface CostStatusResult {
  /** paid − workValue. Positive = paid ahead of the work (overpaid exposure). */
  paidVsWork: number;
  /** effectiveAgreed − workValue. How good the fixed price is vs the labour value. */
  dealMargin: number;
  /** effectiveAgreed − paid. What is still owed against the agreed amount. */
  balance: number;
  verdict: CostVerdict;
}

const clampPos = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);

export function computeCostStatus(input: CostStatusInput): CostStatusResult {
  const effectiveAgreed = clampPos(input.effectiveAgreed);
  const workValue = clampPos(input.workValue);
  const paid = clampPos(input.paid);

  const paidVsWork = paid - workValue;
  const dealMargin = effectiveAgreed - workValue;
  const balance = effectiveAgreed - paid;

  let verdict: CostVerdict = "unknown";
  if (workValue > 0) {
    const ratio = paidVsWork / workValue;
    if (ratio > OVERPAID_MARGIN_THRESHOLD) verdict = "ahead";
    else if (ratio < -OVERPAID_MARGIN_THRESHOLD) verdict = "behind";
    else verdict = "fair";
  }

  return { paidVsWork, dealMargin, balance, verdict };
}
