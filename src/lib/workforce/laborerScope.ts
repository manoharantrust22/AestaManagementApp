/** Which labourers a trade's per-labourer attendance lists: the trade's own labourers
 *  (laborers.category_id = trade) UNION anyone who already has attendance under that
 *  trade's in-house contract — so historical labourers never silently disappear. */
export function scopedLaborerIds(input: {
  laborers: { id: string; category_id: string | null }[];
  tradeCategoryId: string;
  historicallyAttendedIds: string[];
}): Set<string> {
  const set = new Set<string>(input.historicallyAttendedIds);
  for (const l of input.laborers) {
    if (l.category_id === input.tradeCategoryId) set.add(l.id);
  }
  return set;
}

export function isLaborerInTradeScope(scope: Set<string>, laborerId: string): boolean {
  return scope.has(laborerId);
}
