/**
 * Non-Civil trade subcontracts.
 *
 * A company laborer's day is attributed to a trade via daily_attendance.subcontract_id.
 * When that subcontract belongs to a NON-Civil trade (e.g. "Painting — In-house" /
 * "Painting — Asis"), the day is settled in that trade's own workspace — NOT in the
 * company/Civil salary settlement. get_salary_waterfall / get_salary_slice_summary
 * already exclude those days server-side; this helper gives the client + the weekly-
 * settle write path the same set of subcontract ids so their counts, amounts, and the
 * is_paid write stay in step (no double-count, no double-pay).
 *
 * Returns the set of subcontract ids for the site whose trade is explicitly non-Civil.
 * Civil-tagged, untagged (subcontract_id NULL), and unclassified-trade days are NOT in
 * the set (they remain in the company settlement).
 */
export async function fetchNonCivilTradeSubcontractIds(
  // supabase-js client; `any` because the labor_categories embed isn't in the
  // generated types (we only read the trade name off it).
  supabase: any,
  siteId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("subcontracts")
    .select("id, labor_categories(name)")
    .eq("site_id", siteId);
  if (error) throw error;
  const ids = new Set<string>();
  for (const r of (data ?? []) as Array<{
    id: string;
    labor_categories?: { name?: string | null } | null;
  }>) {
    const tradeName = r.labor_categories?.name ?? null;
    if (tradeName && tradeName !== "Civil") ids.add(String(r.id));
  }
  return ids;
}
