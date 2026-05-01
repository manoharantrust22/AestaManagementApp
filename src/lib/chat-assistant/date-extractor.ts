/**
 * Date Extractor
 * Extracts date ranges from natural language input
 */

import dayjs from "dayjs";
import type { DateRange } from "./types";
import { DATE_PATTERNS, MONTH_MAP } from "./constants";
import { weekStartStr, weekEndStr } from "@/lib/utils/weekUtils";

/**
 * Extract date range from user input text
 * Returns dates in YYYY-MM-DD format
 */
export function extractDateRange(input: string): DateRange {
  const normalized = input.toLowerCase().trim();

  // Check ISO date range first (most specific): "2025-01-01 to 2025-01-31"
  const isoMatch = normalized.match(DATE_PATTERNS.isoRange);
  if (isoMatch) {
    return { from: isoMatch[1], to: isoMatch[2] };
  }

  // Check for specific date format: "15/01/2025" or "15-01-2025"
  const specificMatch = normalized.match(DATE_PATTERNS.specificDate);
  if (specificMatch) {
    const [, day, month, year] = specificMatch;
    const fullYear = year.length === 2 ? `20${year}` : year;
    const dateStr = `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    return { from: dateStr, to: dateStr };
  }

  // Check for "all time" pattern - return null to not filter by date
  if (/\b(all\s*time|entire|everything|ever|total)\b/i.test(normalized)) {
    return { from: null, to: null };
  }

  // Check for "last N days" pattern
  const lastNDaysMatch = normalized.match(/last\s+(\d+)\s*days?/i);
  if (lastNDaysMatch) {
    const days = parseInt(lastNDaysMatch[1], 10);
    return {
      from: dayjs().subtract(days, "day").format("YYYY-MM-DD"),
      to: dayjs().format("YYYY-MM-DD"),
    };
  }

  // Check relative dates
  if (DATE_PATTERNS.today.test(normalized)) {
    const today = dayjs().format("YYYY-MM-DD");
    return { from: today, to: today };
  }

  if (DATE_PATTERNS.yesterday.test(normalized)) {
    const yesterday = dayjs().subtract(1, "day").format("YYYY-MM-DD");
    return { from: yesterday, to: yesterday };
  }

  if (DATE_PATTERNS.thisWeek.test(normalized)) {
    return {
      from: weekStartStr(dayjs()),
      to: weekEndStr(dayjs()),
    };
  }

  if (DATE_PATTERNS.lastWeek.test(normalized)) {
    const lastWeekRef = dayjs().subtract(1, "week");
    return {
      from: weekStartStr(lastWeekRef),
      to: weekEndStr(lastWeekRef),
    };
  }

  if (DATE_PATTERNS.thisMonth.test(normalized)) {
    return {
      from: dayjs().startOf("month").format("YYYY-MM-DD"),
      to: dayjs().format("YYYY-MM-DD"), // Up to today
    };
  }

  if (DATE_PATTERNS.lastMonth.test(normalized)) {
    const lastMonth = dayjs().subtract(1, "month");
    return {
      from: lastMonth.startOf("month").format("YYYY-MM-DD"),
      to: lastMonth.endOf("month").format("YYYY-MM-DD"),
    };
  }

  if (DATE_PATTERNS.thisYear.test(normalized)) {
    return {
      from: dayjs().startOf("year").format("YYYY-MM-DD"),
      to: dayjs().format("YYYY-MM-DD"),
    };
  }

  // Check for "last year" pattern
  if (/\b(last\s*year|previous\s*year)\b/i.test(normalized)) {
    const lastYear = dayjs().subtract(1, "year");
    return {
      from: lastYear.startOf("year").format("YYYY-MM-DD"),
      to: lastYear.endOf("year").format("YYYY-MM-DD"),
    };
  }

  // Check for month names
  const monthName = findMonthName(normalized);
  if (monthName) {
    const year = dayjs().year();
    const monthNum = MONTH_MAP[monthName.toLowerCase()];
    if (monthNum) {
      const monthStart = dayjs(`${year}-${String(monthNum).padStart(2, "0")}-01`);
      return {
        from: monthStart.format("YYYY-MM-DD"),
        to: monthStart.endOf("month").format("YYYY-MM-DD"),
      };
    }
  }

  // Check for date range pattern: "from 1st to 15th" or "1 to 15"
  const rangeMatch = normalized.match(DATE_PATTERNS.dateRange);
  if (rangeMatch) {
    const [, fromDay, toDay] = rangeMatch;
    const currentMonth = dayjs();
    return {
      from: currentMonth.date(parseInt(fromDay, 10)).format("YYYY-MM-DD"),
      to: currentMonth.date(parseInt(toDay, 10)).format("YYYY-MM-DD"),
    };
  }

  // Default: return null (will use filter bar values)
  return { from: null, to: null };
}

/**
 * Find month name in the input string
 */
function findMonthName(input: string): string | null {
  const monthPatterns = [
    { pattern: DATE_PATTERNS.january, name: "january" },
    { pattern: DATE_PATTERNS.february, name: "february" },
    { pattern: DATE_PATTERNS.march, name: "march" },
    { pattern: DATE_PATTERNS.april, name: "april" },
    { pattern: DATE_PATTERNS.may, name: "may" },
    { pattern: DATE_PATTERNS.june, name: "june" },
    { pattern: DATE_PATTERNS.july, name: "july" },
    { pattern: DATE_PATTERNS.august, name: "august" },
    { pattern: DATE_PATTERNS.september, name: "september" },
    { pattern: DATE_PATTERNS.october, name: "october" },
    { pattern: DATE_PATTERNS.november, name: "november" },
    { pattern: DATE_PATTERNS.december, name: "december" },
  ];

  for (const { pattern, name } of monthPatterns) {
    if (pattern.test(input)) {
      return name;
    }
  }

  return null;
}

/**
 * Get default date range (this month)
 */
export function getDefaultDateRange(): DateRange {
  return {
    from: dayjs().startOf("month").format("YYYY-MM-DD"),
    to: dayjs().format("YYYY-MM-DD"),
  };
}

/**
 * Format date range for display
 */
export function formatDateRangeDescription(from: string, to: string): string {
  const fromDate = dayjs(from);
  const toDate = dayjs(to);

  // Same day
  if (from === to) {
    const today = dayjs().format("YYYY-MM-DD");
    const yesterday = dayjs().subtract(1, "day").format("YYYY-MM-DD");

    if (from === today) return "today";
    if (from === yesterday) return "yesterday";
    return `on ${fromDate.format("DD MMM YYYY")}`;
  }

  // This month
  const thisMonthStart = dayjs().startOf("month").format("YYYY-MM-DD");
  const today = dayjs().format("YYYY-MM-DD");
  if (from === thisMonthStart && to === today) {
    return "this month";
  }

  // This week
  const thisWeekStart = weekStartStr(dayjs());
  const thisWeekEnd = weekEndStr(dayjs());
  if (from === thisWeekStart && to === thisWeekEnd) {
    return "this week";
  }

  // Same month
  if (fromDate.month() === toDate.month() && fromDate.year() === toDate.year()) {
    return `${fromDate.format("DD")} - ${toDate.format("DD MMM YYYY")}`;
  }

  // Different months
  return `${fromDate.format("DD MMM")} - ${toDate.format("DD MMM YYYY")}`;
}
