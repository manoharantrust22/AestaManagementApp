import type { Database } from "@/types/database.types";
import dayjs from "dayjs";

// Define SiteHoliday type from the Database schema, augmented with trade_category_id
// (The migration 20260625110000_site_holiday_trade_scope already added this column;
// this extends the type until auto-generated types are regenerated from Supabase)
export type SiteHoliday = Database["public"]["Tables"]["site_holidays"]["Row"] & {
  trade_category_id?: string | null;
};

/**
 * Represents a group of consecutive holidays with the same reason
 */
export interface HolidayGroup {
  id: string;
  startDate: string;
  endDate: string;
  reason: string;
  holidays: SiteHoliday[];
  dayCount: number;
}

/**
 * Groups consecutive holidays with the same reason into HolidayGroup objects.
 * Holidays are considered consecutive if they are 1 day apart.
 *
 * @param holidays - Array of SiteHoliday objects to group
 * @returns Array of HolidayGroup objects, sorted by date descending (newest first)
 */
export function groupHolidays(holidays: SiteHoliday[]): HolidayGroup[] {
  if (holidays.length === 0) return [];

  // Sort by date ascending for grouping
  const sorted = [...holidays].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const groups: HolidayGroup[] = [];
  let currentGroup: SiteHoliday[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const previous = sorted[i - 1];

    // Check if consecutive (1 day apart) and same reason
    const prevDate = dayjs(previous.date);
    const currDate = dayjs(current.date);
    const isConsecutive = currDate.diff(prevDate, "day") === 1;
    const sameReason =
      (current.reason || "").trim().toLowerCase() ===
      (previous.reason || "").trim().toLowerCase();

    if (isConsecutive && sameReason) {
      currentGroup.push(current);
    } else {
      // Save current group and start new one
      groups.push({
        id: currentGroup[0].id,
        startDate: currentGroup[0].date,
        endDate: currentGroup[currentGroup.length - 1].date,
        reason: currentGroup[0].reason || "",
        holidays: currentGroup,
        dayCount: currentGroup.length,
      });
      currentGroup = [current];
    }
  }

  // Don't forget the last group
  groups.push({
    id: currentGroup[0].id,
    startDate: currentGroup[0].date,
    endDate: currentGroup[currentGroup.length - 1].date,
    reason: currentGroup[0].reason || "",
    holidays: currentGroup,
    dayCount: currentGroup.length,
  });

  // Sort groups by date descending (most recent first)
  return groups.sort(
    (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
  );
}

/**
 * Formats a holiday group's date range for display.
 *
 * @param group - HolidayGroup to format
 * @returns Formatted date range string (e.g., "26 Dec - 29 Dec 2024" or "Wed, 01 Jan 2025")
 */
export function formatHolidayDateRange(group: HolidayGroup): string {
  if (group.dayCount === 1) {
    return dayjs(group.startDate).format("ddd, DD MMM YYYY");
  }
  const startYear = dayjs(group.startDate).year();
  const endYear = dayjs(group.endDate).year();

  if (startYear === endYear) {
    return `${dayjs(group.startDate).format("DD MMM")} - ${dayjs(group.endDate).format("DD MMM YYYY")}`;
  }
  return `${dayjs(group.startDate).format("DD MMM YYYY")} - ${dayjs(group.endDate).format("DD MMM YYYY")}`;
}

/**
 * Formats a holiday group's day-of-week range for display.
 *
 * @param group - HolidayGroup to format
 * @returns Formatted day range string (e.g., "Thu - Sun") or empty string for single days
 */
export function formatHolidayDayRange(group: HolidayGroup): string {
  if (group.dayCount === 1) {
    return "";
  }
  return `${dayjs(group.startDate).format("ddd")} - ${dayjs(group.endDate).format("ddd")}`;
}

/**
 * Whether a holiday is visible in the current view. Whole-site holidays
 * (trade_category_id null) show everywhere; a trade-scoped holiday shows only
 * when that trade's workspace is active. (No scope = site/Civil view.)
 */
export function holidayInScope(
  h: { trade_category_id?: string | null },
  tradeCategoryId: string | null
): boolean {
  if (h.trade_category_id == null) return true;
  return tradeCategoryId != null && h.trade_category_id === tradeCategoryId;
}
