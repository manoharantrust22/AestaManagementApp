/**
 * Mesthri commission — pure math, mirrored EXACTLY from the SQL helper
 * `public.mesthri_commission_of` (migration 20260705120100) so the client (weekly
 * summary, drawer) and the server (ledger, waterfall, settle RPCs) never disagree.
 *
 * Commission = the per-day cut a company laborer passes to the contract's mesthri.
 * Basis = work_days (the same fraction that computes daily_earnings), so a half
 * work-day gives half the commission. Floored at daily_earnings so net is never
 * negative. Only applies to a "crew day" (enabled contract, company laborer, not
 * the mesthri themself, on/after the cutover) — that decision is made upstream and
 * passed in as `isCrew`.
 */

function n(v: number | null | undefined, fallback = 0): number {
  return v == null || !Number.isFinite(v) ? fallback : v;
}

/** ₹ commission for one attendance day. 0 unless it's a commission crew day. */
export function mesthriCommissionOf(
  isCrew: boolean,
  dailyEarnings: number | null | undefined,
  rate: number | null | undefined,
  workDays: number | null | undefined,
): number {
  if (!isCrew) return 0;
  // COALESCE(daily_earnings,0) and COALESCE(rate,0)*COALESCE(work_days,1), floored.
  return Math.min(n(dailyEarnings), n(rate) * n(workDays, 1));
}

/** Net paid to the laborer for one day = gross − commission. */
export function netOfCommission(
  dailyEarnings: number | null | undefined,
  commission: number,
): number {
  return n(dailyEarnings) - commission;
}

/** One crew attendance day, the fields the commission split needs. */
export interface CommissionDayRow {
  date: string; // YYYY-MM-DD
  workDays: number;
  dailyEarnings: number;
  commissionPerDay: number;
}

/** Work-day + ₹ totals on each side of a chosen commission start date. */
export interface CommissionDateSplit {
  includedWorkDays: number;
  includedCommission: number;
  excludedWorkDays: number;
  excludedCommission: number;
}

/**
 * Split a contract's crew days at a candidate start date. Days on/after `fromDate`
 * are INCLUDED (earn commission), days before are EXCLUDED — mirrors the view
 * predicate `d.date >= effective_from` (and `effective_from IS NULL` = no gate).
 * Each day's commission = mesthriCommissionOf(true, ...). The caller must have
 * already dropped the maistry's own rows (they earn no commission).
 */
export function splitCrewCommissionByDate(
  rows: CommissionDayRow[],
  fromDate: string | null,
): CommissionDateSplit {
  const split: CommissionDateSplit = {
    includedWorkDays: 0,
    includedCommission: 0,
    excludedWorkDays: 0,
    excludedCommission: 0,
  };
  for (const r of rows) {
    const commission = mesthriCommissionOf(true, r.dailyEarnings, r.commissionPerDay, r.workDays);
    const workDays = n(r.workDays, 1);
    // NULL fromDate = no cutover = everything counts (matches the view).
    if (!fromDate || r.date >= fromDate) {
      split.includedWorkDays += workDays;
      split.includedCommission += commission;
    } else {
      split.excludedWorkDays += workDays;
      split.excludedCommission += commission;
    }
  }
  return split;
}
