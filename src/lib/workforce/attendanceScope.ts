/**
 * Attendance day-keeping under a trade scope.
 *
 * On the trade-scoped attendance screen (a lone `?contractId=` opening the full
 * Civil sheet scoped to one in-house trade contract), a date should only render
 * as a day-row if THIS trade had activity on it — otherwise Civil's own days
 * leak in (Civil work descriptions, "unfilled" context) under the trade view.
 *
 * This is the pure predicate the attendance sheet's `combinedDateEntries` memo
 * applies when `tradeScope` is set; the Civil (unscoped) path never calls it.
 */

export interface ScopedDayActivity {
  /** Count of scoped named-labourer attendance records on the date. */
  scopedNamedCount: number;
  /** Count of scoped market labourers (trade role category) on the date. */
  scopedMarketCount: number;
  /** Whether the date carries contract-presence for the scoped trade. */
  hasContractPresence: boolean;
}

/** Trade scope: keep a date only if THIS trade had activity. Drops Civil-only days. */
export function keepScopedDay(a: ScopedDayActivity): boolean {
  return a.scopedNamedCount > 0 || a.scopedMarketCount > 0 || a.hasContractPresence;
}
