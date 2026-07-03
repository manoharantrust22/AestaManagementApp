/**
 * Agreed scope-of-work sheet for a subcontract — a list of work items with
 * same-angle before/after photos, used to settle "what's included" up front and
 * prove each item was done. Persisted as a JSONB array in
 * `subcontract_scope_sheet.items` (one row per subcontract). Documentation only.
 */

export interface ScopePhotoRef {
  url: string;
  storage_path: string;
  /** ISO timestamp the photo was captured/attached. */
  capturedAt: string;
}

export interface ScopeItem {
  id: string;
  /** The agreed work, e.g. "Wall plastering — 2 coats". */
  label: string;
  /** Optional extra note. */
  note?: string;
  /**
   * Estimated ₹ for this point. On a Future plan (draft contract) the values
   * auto-sum into the plan's total_value, feeding the Planned-value tile.
   */
  value?: number;
  /** Photo before starting (also the "what's to be done" reference). */
  before: ScopePhotoRef | null;
  /** Same-angle photo at completion. */
  after: ScopePhotoRef | null;
}

/** A work item is "missing its after photo" when it has a before but no after. */
export const isMissingAfter = (i: ScopeItem): boolean => !!i.before && !i.after;

/** Σ item values — ignores missing/NaN/non-positive values, rounds to 2dp. */
export const sumScopeValues = (items: ScopeItem[]): number =>
  Math.round(
    items.reduce(
      (s, i) =>
        s +
        (typeof i.value === "number" && Number.isFinite(i.value) && i.value > 0
          ? i.value
          : 0),
      0
    ) * 100
  ) / 100;
