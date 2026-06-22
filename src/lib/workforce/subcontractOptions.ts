/**
 * Shared helper for "link to a contract" pickers across the app.
 *
 * A contract can now be a real PARENT (e.g. "Jithin Civil contract") with floor
 * CHILDREN. Pickers should offer the parent as the primary choice and the floors as
 * optional, deeper picks. This flattens a list of subcontracts into ordered rows where
 * each parent is immediately followed by its children — so a Select/Autocomplete can
 * render the parent prominently and indent the floors beneath it.
 *
 * Pure (no React) so it's unit-testable.
 */

export interface ParentChildRow<T> {
  item: T;
  /** 0 = top-level (parent or standalone), 1 = a child floor under the row above. */
  depth: 0 | 1;
  /** True when this top-level row is a parent that has children below it. */
  isParent: boolean;
}

/**
 * Order rows as [parent, ...its children, nextTopLevel, ...]. A row is top-level when it
 * has no parent OR its parent isn't in the list (an orphaned child still shows, standalone).
 * Original order is preserved among top-level rows and among each parent's children.
 */
export function buildSubcontractOptions<
  T extends { id: string; parent_subcontract_id?: string | null }
>(rows: T[]): ParentChildRow<T>[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const childrenByParent = new Map<string, T[]>();
  for (const r of rows) {
    if (r.parent_subcontract_id && byId.has(r.parent_subcontract_id)) {
      const arr = childrenByParent.get(r.parent_subcontract_id) ?? [];
      arr.push(r);
      childrenByParent.set(r.parent_subcontract_id, arr);
    }
  }

  const out: ParentChildRow<T>[] = [];
  for (const r of rows) {
    const isTopLevel = !r.parent_subcontract_id || !byId.has(r.parent_subcontract_id);
    if (!isTopLevel) continue;
    const children = childrenByParent.get(r.id) ?? [];
    out.push({ item: r, depth: 0, isParent: children.length > 0 });
    for (const c of children) out.push({ item: c, depth: 1, isParent: false });
  }
  return out;
}
