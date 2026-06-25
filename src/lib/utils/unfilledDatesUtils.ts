import dayjs from "dayjs";

/**
 * Represents a group of consecutive unfilled dates
 */
export interface UnfilledGroup {
  id: string;
  startDate: string;
  endDate: string;
  dates: string[]; // Individual dates for expansion
  dayCount: number;
}

/**
 * Gets all unfilled dates within a date range.
 * A date is considered unfilled if it has neither attendance nor holiday.
 *
 * @param projectStart - Start date (YYYY-MM-DD)
 * @param projectEnd - End date (YYYY-MM-DD)
 * @param attendanceDates - Set of dates with attendance records
 * @param holidayDates - Set of dates marked as holidays
 * @param contractDates - Set of dates with documented contract/task-work crew
 *   (these are surfaced as calm "Contract work" rows, not red "unfilled" nags)
 * @returns Array of unfilled date strings (YYYY-MM-DD), sorted ascending
 */
export function getUnfilledDates(
  projectStart: string,
  projectEnd: string,
  attendanceDates: Set<string>,
  holidayDates: Set<string>,
  contractDates?: Set<string>
): string[] {
  const unfilled: string[] = [];

  // Validate dates
  if (!projectStart || !projectEnd) return unfilled;

  const start = dayjs(projectStart);
  const end = dayjs(projectEnd);

  // Don't process if start is after end
  if (start.isAfter(end)) return unfilled;

  // Limit to a reasonable range (max 365 days) to prevent performance issues
  const maxDays = 365;
  const daysDiff = end.diff(start, "day");
  if (daysDiff > maxDays) {
    console.warn(`Unfilled dates calculation limited to ${maxDays} days`);
  }

  const effectiveEnd = daysDiff > maxDays ? start.add(maxDays, "day") : end;

  // Iterate through each day in the range
  let current = start;
  while (current.isBefore(effectiveEnd) || current.isSame(effectiveEnd, "day")) {
    const dateStr = current.format("YYYY-MM-DD");

    // Check if this date is unfilled (no attendance, no holiday, no contract work)
    if (
      !attendanceDates.has(dateStr) &&
      !holidayDates.has(dateStr) &&
      !contractDates?.has(dateStr)
    ) {
      unfilled.push(dateStr);
    }

    current = current.add(1, "day");
  }

  return unfilled;
}

/**
 * Groups consecutive unfilled dates into UnfilledGroup objects.
 *
 * @param dates - Array of unfilled date strings (YYYY-MM-DD)
 * @returns Array of UnfilledGroup objects, sorted by date descending (newest first)
 */
export function groupUnfilledDates(dates: string[]): UnfilledGroup[] {
  if (dates.length === 0) return [];

  // Sort by date ascending for grouping
  const sorted = [...dates].sort(
    (a, b) => new Date(a).getTime() - new Date(b).getTime()
  );

  const groups: UnfilledGroup[] = [];
  let currentGroup: string[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const previous = sorted[i - 1];

    // Check if consecutive (1 day apart)
    const prevDate = dayjs(previous);
    const currDate = dayjs(current);
    const isConsecutive = currDate.diff(prevDate, "day") === 1;

    if (isConsecutive) {
      currentGroup.push(current);
    } else {
      // Save current group and start new one
      groups.push({
        id: `unfilled-${currentGroup[0]}`,
        startDate: currentGroup[0],
        endDate: currentGroup[currentGroup.length - 1],
        dates: currentGroup,
        dayCount: currentGroup.length,
      });
      currentGroup = [current];
    }
  }

  // Don't forget the last group
  groups.push({
    id: `unfilled-${currentGroup[0]}`,
    startDate: currentGroup[0],
    endDate: currentGroup[currentGroup.length - 1],
    dates: currentGroup,
    dayCount: currentGroup.length,
  });

  // Sort groups by date descending (most recent first)
  return groups.sort(
    (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
  );
}

/**
 * Formats an unfilled group's date range for display.
 *
 * @param group - UnfilledGroup to format
 * @returns Formatted date range string (e.g., "26 Dec - 29 Dec 2024" or "Wed, 01 Jan 2025")
 */
export function formatUnfilledDateRange(group: UnfilledGroup): string {
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
 * Formats an unfilled group's day-of-week range for display.
 *
 * @param group - UnfilledGroup to format
 * @returns Formatted day range string (e.g., "Thu - Sun") or empty string for single days
 */
export function formatUnfilledDayRange(group: UnfilledGroup): string {
  if (group.dayCount === 1) {
    return "";
  }
  return `${dayjs(group.startDate).format("ddd")} - ${dayjs(group.endDate).format("ddd")}`;
}
