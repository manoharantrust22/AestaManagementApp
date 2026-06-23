/**
 * Rollup for the per-worker-type daywage estimate.
 *
 * The estimate is a set of worker-type lines (Mason ×2 @ ₹1000, helper ×3 @
 * ₹600) sharing ONE `days` value. To keep `v_task_work_profitability` unchanged
 * we collapse the lines into the package's three scalar columns:
 *
 *   estimated_crew_size  = Σ count
 *   estimated_days       = days (D)
 *   benchmark_daily_rate = Σ(count × rate) / Σ count   (count-weighted average)
 *
 * so that  crew_size × days × rate = D × Σ(count × rate) = the true benchmark.
 *
 * Pure math, no Supabase — reuses lineValue/lineCountTotal from dayLogCost.
 */

import type { DayWorkerLine } from "@/types/taskWork.types";
import { lineValue, lineCountTotal } from "@/lib/taskWork/dayLogCost";

const num = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? x : 0;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface EstimateRollup {
  /** Total head-count across the lines (Σ count). */
  crewSize: number;
  /** Shared number of days for the whole crew. */
  days: number;
  /** Count-weighted average daily wage (0 when crew is 0). */
  blendedRate: number;
  /** Σ count × days. */
  manDays: number;
  /** (Σ count × rate) × days — the daywork benchmark the price is judged against. */
  benchmarkCost: number;
}

/**
 * Collapse the per-type estimate lines + shared days into the scalar summary the
 * profitability view consumes. Empty/garbage lines contribute 0.
 */
export function estimateRollup(
  lines: DayWorkerLine[] | null | undefined,
  days: number | null | undefined
): EstimateRollup {
  const d = num(days);
  const safeLines = lines ?? [];
  const crewSize = lineCountTotal(safeLines);
  const dailyValue = safeLines.reduce((s, l) => s + lineValue(l), 0); // Σ count × rate
  const blendedRate = crewSize > 0 ? round2(dailyValue / crewSize) : 0;
  return {
    crewSize: round2(crewSize),
    days: d,
    blendedRate,
    manDays: round2(crewSize * d),
    benchmarkCost: round2(dailyValue * d),
  };
}
