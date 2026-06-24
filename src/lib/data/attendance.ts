import { createClient } from "@/lib/supabase/server";
import dayjs from "dayjs";

/**
 * Raw attendance data fetched from the server.
 * This is the minimal data needed to render the attendance page.
 * Complex processing (grouping, mapping, etc.) happens client-side.
 */
export interface AttendancePageData {
  attendanceRecords: any[];
  marketLaborerRecords: any[];
  workSummaries: any[];
  teaShopEntries: any[];
  teaShopAllocations: any[]; // Allocations for group entries
  holidays: any[];
  serverDateRange: {
    from: string;
    to: string;
  };
}

/**
 * Fetch attendance page data on the server.
 * Returns raw data that will be processed client-side.
 *
 * @param siteId - The site ID to fetch data for
 * @param dateFrom - Optional start date (defaults to 7 days ago)
 * @param dateTo - Optional end date (defaults to today)
 */
export async function getAttendancePageData(
  siteId: string,
  dateFrom?: string,
  dateTo?: string
): Promise<AttendancePageData> {
  const supabase = await createClient();

  // Default date range: current week (last 7 days)
  const defaultDateFrom =
    dateFrom || dayjs().subtract(7, "days").format("YYYY-MM-DD");
  const defaultDateTo = dateTo || dayjs().format("YYYY-MM-DD");

  // Fetch all data in parallel
  const [
    attendanceResult,
    marketResult,
    summaryResult,
    teaShopResult,
    teaShopAllocationsResult,
    holidaysResult,
  ] = await Promise.all([
    // Daily attendance records with related data
    supabase
      .from("daily_attendance")
      .select(
        `
        id, date, laborer_id, work_days, hours_worked, daily_rate_applied, daily_earnings, is_paid, payment_notes, subcontract_id,
        in_time, lunch_out, lunch_in, out_time, work_hours, break_hours, total_hours, day_units, snacks_amount,
        attendance_status, work_progress_percent,
        entered_by, recorded_by, recorded_by_user_id, updated_by, updated_by_user_id, created_at, updated_at,
        laborers!inner(name, team_id, category_id, role_id, laborer_type, team:teams!laborers_team_id_fkey(name), labor_categories(name), labor_roles(name)),
        building_sections!inner(name),
        subcontracts(title),
        recorded_by_user:users!daily_attendance_recorded_by_user_id_fkey(avatar_url),
        updated_by_user:users!daily_attendance_updated_by_user_id_fkey(avatar_url)
      `
      )
      .eq("site_id", siteId)
      .gte("date", defaultDateFrom)
      .lte("date", defaultDateTo)
      .order("date", { ascending: false }),

    // Market laborer attendance
    supabase
      .from("market_laborer_attendance")
      .select(
        "id, role_id, date, count, work_days, rate_per_person, total_cost, day_units, snacks_per_person, total_snacks, in_time, out_time, is_paid, payment_notes, labor_roles(name, category_id)"
      )
      .eq("site_id", siteId)
      .gte("date", defaultDateFrom)
      .lte("date", defaultDateTo),

    // Daily work summaries
    supabase
      .from("daily_work_summary")
      .select("*")
      .eq("site_id", siteId)
      .gte("date", defaultDateFrom)
      .lte("date", defaultDateTo),

    // Tea shop entries (direct entries for this site)
    supabase
      .from("tea_shop_entries")
      .select("id, date, tea_total, snacks_total, total_amount, is_group_entry, site_group_id")
      .eq("site_id", siteId)
      .gte("date", defaultDateFrom)
      .lte("date", defaultDateTo),

    // Tea shop allocations (this site's share of group entries from other sites).
    // Filter on the inner-joined entry's date so the server returns only rows in range.
    // PostgREST supports dotted filters on embedded resources; with !inner, parent rows
    // whose embedded entry falls outside the range are excluded.
    (supabase as any)
      .from("tea_shop_entry_allocations")
      .select("allocated_amount, allocation_percentage, entry_id, entry:tea_shop_entries!inner(id, date, total_amount, is_group_entry, site_group_id)")
      .eq("site_id", siteId)
      .gte("entry.date", defaultDateFrom)
      .lte("entry.date", defaultDateTo),

    // Recent and upcoming holidays (30 days range)
    supabase
      .from("site_holidays")
      .select("*")
      .eq("site_id", siteId)
      .gte("date", dayjs().subtract(30, "days").format("YYYY-MM-DD"))
      .lte("date", dayjs().add(30, "days").format("YYYY-MM-DD"))
      .order("date", { ascending: false }),
  ]);

  return {
    attendanceRecords: attendanceResult.data || [],
    marketLaborerRecords: marketResult.data || [],
    workSummaries: summaryResult.data || [],
    teaShopEntries: teaShopResult.data || [],
    teaShopAllocations: teaShopAllocationsResult.data || [],
    holidays: holidaysResult.data || [],
    serverDateRange: {
      from: defaultDateFrom,
      to: defaultDateTo,
    },
  };
}
