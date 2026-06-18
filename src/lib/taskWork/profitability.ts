// Pure profitability math for Task Work packages.
//
// These functions mirror the SQL view `v_task_work_profitability` so the UI can
// recompute the same numbers client-side (e.g. live in a form before the row is
// saved) and so the logic is unit-testable without a database. The view remains
// the source of truth for list/aggregation reads; this is the same arithmetic.

export interface ProfitabilityInputs {
  totalValue: number;
  /**
   * Man-days basis for the saving computation. For the form/Overview estimate
   * preview this is the ESTIMATED man-days (crew × days) — so companySaving comes
   * out as the negotiation margin (estimated daywork cost − price), matching the
   * SQL view. crewEffectiveDaily = price ÷ this.
   */
  manDays: number;
  benchmarkDailyRate: number | null | undefined;
  retentionPercent: number | null | undefined;
  totalUnits: number | null | undefined;
}

export interface ProfitabilityResult {
  /** What the same man-days would have cost on daily wages. */
  daywageBenchmarkCost: number;
  /** Positive = the company spent less than daywork would have cost. */
  companySaving: number;
  /** Company saving as a % of the daywage benchmark (null if no benchmark). */
  savingPct: number | null;
  /** Effective ₹/man-day the crew earned (null if no man-days logged). */
  crewEffectiveDaily: number | null;
  /** Retention amount held back from the price. */
  retentionHeld: number;
  /** ₹ per measured unit (null if not rate-measured). */
  computedRatePerUnit: number | null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Core profitability numbers for a given man-days basis. Used for the form /
 * Overview ESTIMATE preview (pass estimated man-days), so `companySaving` is the
 * negotiation margin (estimated daywork cost − price). The live actuals come from
 * the `v_task_work_profitability` view, where company_saving is likewise
 * estimate-based and `crew_effective_daily` uses the actual man-days logged — the
 * pair that expresses the win-win (company saves vs plan, crew earns more per day).
 */
export function computeProfitability(
  inputs: ProfitabilityInputs
): ProfitabilityResult {
  const totalValue = inputs.totalValue || 0;
  const manDays = inputs.manDays || 0;
  const benchmark = inputs.benchmarkDailyRate || 0;
  const retentionPct = inputs.retentionPercent || 0;
  const units = inputs.totalUnits || 0;

  const daywageBenchmarkCost = round2(manDays * benchmark);
  const companySaving = round2(daywageBenchmarkCost - totalValue);
  const savingPct =
    daywageBenchmarkCost > 0
      ? round2((companySaving / daywageBenchmarkCost) * 100)
      : null;
  const crewEffectiveDaily = manDays > 0 ? round2(totalValue / manDays) : null;
  const retentionHeld = round2((totalValue * retentionPct) / 100);
  const computedRatePerUnit = units > 0 ? round2(totalValue / units) : null;

  return {
    daywageBenchmarkCost,
    companySaving,
    savingPct,
    crewEffectiveDaily,
    retentionHeld,
    computedRatePerUnit,
  };
}

export interface AdvanceSafetyInputs {
  paid: number;
  totalValue: number;
  actualManDays: number;
  estimatedCrewSize: number | null | undefined;
  estimatedDays: number | null | undefined;
}

export interface AdvanceSafetyResult {
  /** Fraction of the price already paid out (0..1+). */
  paidFraction: number;
  /**
   * Estimated fraction of work done, from man-days logged vs the estimate
   * (crew × days). null when there is no estimate to compare against.
   */
  progressFraction: number | null;
  /**
   * True when money paid runs meaningfully ahead of work done — the classic
   * abandonment-risk flag. Always false when we cannot estimate progress.
   */
  overAdvanced: boolean;
}

const OVER_ADVANCE_MARGIN = 0.15; // paid may lead progress by 15% before flagging

/**
 * Advance-vs-progress guard: are we paying ahead of work actually done?
 * Progress is estimated from logged man-days against the original
 * (crew × days) estimate. Without an estimate we cannot judge, so we never
 * raise a false alarm.
 */
export function computeAdvanceSafety(
  inputs: AdvanceSafetyInputs
): AdvanceSafetyResult {
  const totalValue = inputs.totalValue || 0;
  const paid = inputs.paid || 0;
  const estManDays =
    (inputs.estimatedCrewSize || 0) * (inputs.estimatedDays || 0);

  const paidFraction = totalValue > 0 ? paid / totalValue : 0;
  const progressFraction =
    estManDays > 0 ? Math.min(inputs.actualManDays / estManDays, 1) : null;

  const overAdvanced =
    progressFraction !== null &&
    paidFraction > progressFraction + OVER_ADVANCE_MARGIN;

  return { paidFraction, progressFraction, overAdvanced };
}
