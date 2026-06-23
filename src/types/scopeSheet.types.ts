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
  /** Photo before starting (also the "what's to be done" reference). */
  before: ScopePhotoRef | null;
  /** Same-angle photo at completion. */
  after: ScopePhotoRef | null;
}

/** A work item is "missing its after photo" when it has a before but no after. */
export const isMissingAfter = (i: ScopeItem): boolean => !!i.before && !i.after;
