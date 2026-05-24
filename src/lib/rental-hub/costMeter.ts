/**
 * Cost meter helpers for the Rental Hub v2.
 *
 * The accrued cost for each thread is already computed by useRentalOrders (and
 * surfaces on RentalThread.accruedCost). These helpers add a few derived
 * numbers the row needs:
 *
 *   - `daysElapsed(t)`         — alias of thread.daysSinceStart for readability
 *   - `dailyBurn(t)`           — per-day accrual for the LIVE pill subline
 *   - `balanceDue(t)`          — accrued minus advances minus existing settlements
 *   - `savings(t)`             — accrued minus negotiated (vendor savings)
 *
 * The shared utility calculateSpentToDate / calculateDailyBurnRate /
 * calculateExpectedRemaining (already used by v1's ActiveOrderCostMeter) is
 * re-exported for any callsite that needs the raw computation.
 */

import {
  calculateDailyBurnRate,
  calculateExpectedRemaining,
  calculateSpentToDate,
} from "@/lib/utils/rentalCostUtils";

import type { RentalThread } from "./threadTypes";

export { calculateDailyBurnRate, calculateExpectedRemaining, calculateSpentToDate };

export function daysElapsed(t: RentalThread): number {
  return Math.max(0, t.daysSinceStart);
}

/**
 * Rupees per day the cost meter ticks up by. Computed from outstanding qty
 * × daily rate across daily-rate lines (hourly lines are excluded since they
 * don't accrue daily). Returns 0 when no daily-rate qty is outstanding (the
 * meter is frozen).
 */
export function dailyBurn(t: RentalThread): number {
  let perDay = 0;
  for (const item of t.items) {
    if (item.rateType !== "daily") continue;
    perDay += item.qtyOutstanding * item.dailyRate;
  }
  return perDay;
}

/** Sum of negotiated final amounts across all settled parties (or 0). */
export function settledAmount(t: RentalThread): number {
  let sum = 0;
  for (const slot of ["vendor", "transportIn", "transportOut", "loadingUnloading"] as const) {
    const s = t.settlements[slot];
    if (s?.negotiatedFinalAmount != null) sum += s.negotiatedFinalAmount;
  }
  return sum;
}

/**
 * Vendor-side savings (gross − negotiated) when a vendor settlement exists,
 * else 0. Used in the money block's "Settled · saved ₹X" line.
 */
export function vendorSavings(t: RentalThread): number {
  const v = t.settlements.vendor;
  if (!v || v.negotiatedFinalAmount == null) return 0;
  // gross ~= total_rental_amount + total_transport_amount + total_damage_amount
  const gross = v.rentalAmount + v.transportAmount + v.damageAmount;
  return Math.max(0, gross - v.negotiatedFinalAmount);
}

/**
 * Rough balance still owed to the vendor before the office settles. Active /
 * partially_returned orders show the live accrued figure minus advances.
 * Completed-pre-settlement orders also use accrued minus advances. Settled
 * orders return 0.
 */
export function balanceDue(t: RentalThread): number {
  if (t.effective_status === "settled") return 0;
  return Math.max(0, t.accruedCost - t.totalAdvancePaid);
}
