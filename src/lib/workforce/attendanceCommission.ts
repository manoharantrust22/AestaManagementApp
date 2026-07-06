import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Per-attendance commission OVERLAY for a site: a Map from daily_attendance.id to the
 * ₹ commission on that day. It contains ONLY commission-relevant rows — crew days
 * (commission > 0) and the mesthri's own days (commission 0) on commission-ENABLED
 * contracts, on/after each contract's cutover. Every other attendance row is absent.
 *
 * Presence in the map = "this company-laborer day is paid directly in the company week
 * at NET (daily_earnings − value)". Absent = today's behaviour (gross / excluded), so
 * the overlay changes nothing for contracts that don't have commission enabled.
 *
 * Read from v_daily_attendance_commission (migration 20260705120100). Because only
 * enabled-contract days qualify, the payload is small even without a date filter.
 */
export async function fetchAttendanceCommissionMap(
  supabase: SupabaseClient,
  siteId: string,
): Promise<Map<string, number>> {
  const { data, error } = await (supabase as any)
    .from("v_daily_attendance_commission")
    .select("attendance_id, commission_amount, is_commission_crew_day, is_commission_mesthri_own_day")
    .eq("site_id", siteId)
    .or("is_commission_crew_day.eq.true,is_commission_mesthri_own_day.eq.true");
  if (error) throw error;
  const map = new Map<string, number>();
  for (const r of (data ?? []) as any[]) {
    map.set(String(r.attendance_id), Number(r.commission_amount ?? 0));
  }
  return map;
}
