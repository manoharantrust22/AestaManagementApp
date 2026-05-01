"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import dayjs from "dayjs";
import { weekStartOf, weekEndOf } from "@/lib/utils/weekUtils";
import { DateRangeDataContext } from "./DateRangeDataContext";
import { DateRangeActionsContext } from "./DateRangeActionsContext";

// Storage keys
const DATE_FROM_KEY = "globalDateFrom";
const DATE_TO_KEY = "globalDateTo";
const ALL_TIME_MARKER = "ALL_TIME";

// Helper functions to safely access localStorage
function getStoredDateFrom(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(DATE_FROM_KEY);
  } catch {
    return null;
  }
}

function getStoredDateTo(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(DATE_TO_KEY);
  } catch {
    return null;
  }
}

function storeDateRange(
  dateFrom: string | null,
  dateTo: string | null
): void {
  if (typeof window === "undefined") return;
  try {
    if (dateFrom && dateTo) {
      localStorage.setItem(DATE_FROM_KEY, dateFrom);
      localStorage.setItem(DATE_TO_KEY, dateTo);
    } else {
      // Store marker to indicate "All Time" was explicitly selected
      localStorage.setItem(DATE_FROM_KEY, ALL_TIME_MARKER);
      localStorage.setItem(DATE_TO_KEY, ALL_TIME_MARKER);
    }
  } catch {
    // Ignore storage errors
  }
}

export function computeDays(
  startDate: Date | null,
  endDate: Date | null
): number | null {
  if (!startDate || !endDate) return null;
  return dayjs(endDate).diff(dayjs(startDate), "day") + 1;
}

export function computeLabel(
  startDate: Date | null,
  endDate: Date | null
): string {
  if (!startDate || !endDate) {
    return "All Time";
  }

  const start = dayjs(startDate);
  const end = dayjs(endDate);
  const today = dayjs();

  const isSameDay = start.isSame(end, "day");
  const endsToday = end.isSame(today, "day");
  const daysBetween = end.diff(start, "day"); // inclusive diff: 0 = single day

  // Single-day cases
  if (isSameDay) {
    if (start.isSame(today, "day")) return "Today";
    if (start.isSame(today.subtract(1, "day"), "day")) return "Yesterday";
    return start.format("MMM D, YYYY");
  }

  // Rolling / "This" ranges ending today
  if (endsToday) {
    if (start.isSame(weekStartOf(today), "day")) return "This Week";
    if (start.isSame(today.startOf("month"), "day")) return "This Month";
    if (daysBetween === 6) return "Last 7 days";
    if (daysBetween === 13) return "Last 14 days";
    if (daysBetween === 29) return "Last 30 days";
    if (daysBetween === 89) return "Last 90 days";
  }

  // Last Week (previous Sun–Sat)
  const lastWeekStart = weekStartOf(today.subtract(1, "week"));
  const lastWeekEnd = weekEndOf(lastWeekStart);
  if (start.isSame(lastWeekStart, "day") && end.isSame(lastWeekEnd, "day")) {
    return "Last Week";
  }

  // Last Month (previous calendar month)
  const lastMonthStart = today.subtract(1, "month").startOf("month");
  const lastMonthEnd = today.subtract(1, "month").endOf("month");
  if (start.isSame(lastMonthStart, "day") && end.isSame(lastMonthEnd, "day")) {
    return "Last Month";
  }

  // Past calendar month (e.g. Mar 2026, Feb 2026 — anything that exactly
  // spans a full calendar month and is not the current month).
  const startsAtMonthStart = start.isSame(start.startOf("month"), "day");
  const endsAtMonthEnd = end.isSame(start.endOf("month"), "day");
  const isFullCalendarMonth =
    startsAtMonthStart &&
    endsAtMonthEnd &&
    start.isSame(end, "month") &&
    start.isSame(end, "year");
  if (isFullCalendarMonth && !start.isSame(today, "month")) {
    return start.format("MMM YYYY");
  }

  // Custom range — ScopePill / picker button append the date string via their own formatter.
  return "Custom range";
}

export type StepResult = { start: Date; end: Date } | null;

export function computeStep(
  startDate: Date | null,
  endDate: Date | null,
  direction: "backward" | "forward",
  minDate: Date | null
): StepResult {
  const today = dayjs().endOf("day");
  const sign = direction === "backward" ? -1 : 1;

  let nextStart: dayjs.Dayjs;
  let nextEnd: dayjs.Dayjs;

  if (!startDate || !endDate) {
    // All Time → step into the previous (or next) calendar month.
    const target = dayjs().add(sign, "month");
    nextStart = target.startOf("month");
    nextEnd = target.endOf("month");
  } else {
    const start = dayjs(startDate);
    const end = dayjs(endDate);

    const isWeekAligned =
      start.isSame(weekStartOf(start), "day") &&
      end.diff(start, "day") === 6;

    const isCalendarMonth =
      start.isSame(start.startOf("month"), "day") &&
      end.isSame(start.endOf("month"), "day");

    const isCurrentMonthInProgress =
      start.isSame(start.startOf("month"), "day") &&
      end.isSame(today, "day") &&
      start.isSame(today, "month");

    if (isWeekAligned) {
      nextStart = start.add(sign * 7, "day");
      nextEnd = end.add(sign * 7, "day");
    } else if (isCalendarMonth || isCurrentMonthInProgress) {
      const target = start.add(sign, "month");
      nextStart = target.startOf("month");
      nextEnd = target.endOf("month");
    } else {
      // Non-aligned window — generic month stepper.
      const target = dayjs().add(sign, "month");
      nextStart = target.startOf("month");
      nextEnd = target.endOf("month");
    }
  }

  // Bounds: don't step past today; don't step before minDate.
  if (direction === "forward" && nextStart.isAfter(today)) return null;
  if (direction === "backward" && minDate && nextStart.isBefore(dayjs(minDate))) {
    return null;
  }

  // If stepping forward would put `end` past today, clip end to today.
  if (nextEnd.isAfter(today)) {
    nextEnd = today;
  }

  return { start: nextStart.toDate(), end: nextEnd.toDate() };
}

export function DateRangeProvider({ children }: { children: React.ReactNode }) {
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerContainer, setPickerContainerState] =
    useState<HTMLElement | null>(null);

  const openPicker = useCallback(() => setPickerOpen(true), []);
  const closePicker = useCallback(() => setPickerOpen(false), []);
  const setPickerContainer = useCallback(
    (el: HTMLElement | null) => setPickerContainerState(el),
    []
  );

  // Restore from localStorage on mount
  useEffect(() => {
    const storedFrom = getStoredDateFrom();
    const storedTo = getStoredDateTo();

    // Explicit All Time — respect it.
    if (storedFrom === ALL_TIME_MARKER || storedTo === ALL_TIME_MARKER) {
      return;
    }

    // Restore specific range if valid dates are stored.
    if (storedFrom && storedTo) {
      setStartDate(new Date(storedFrom));
      setEndDate(new Date(storedTo));
      return;
    }

    // First-time visitor: default to This Month so initial page loads don't
    // pull the full row history from heavy views like v_all_expenses. The
    // user can always switch to All Time via the ScopePill or picker.
    // Not persisted here — once the user picks a specific scope, that choice
    // is what we remember.
    const now = dayjs();
    setStartDate(now.startOf("month").toDate());
    setEndDate(now.endOf("day").toDate());
  }, []);

  const setDateRange = useCallback(
    (start: Date | null, end: Date | null) => {
      setStartDate(start);
      setEndDate(end);
      storeDateRange(
        start ? dayjs(start).format("YYYY-MM-DD") : null,
        end ? dayjs(end).format("YYYY-MM-DD") : null
      );
    },
    []
  );

  const setToday = useCallback(() => {
    const now = dayjs();
    setDateRange(now.startOf("day").toDate(), now.endOf("day").toDate());
  }, [setDateRange]);

  const setLastWeek = useCallback(() => {
    const today = dayjs();
    const weekStart = weekStartOf(today); // Sunday
    setDateRange(weekStart.toDate(), today.toDate());
  }, [setDateRange]);

  const setLastMonth = useCallback(() => {
    const today = dayjs();
    const monthStart = today.startOf("month");
    setDateRange(monthStart.toDate(), today.toDate());
  }, [setDateRange]);

  const setAllTime = useCallback(() => {
    setDateRange(null, null);
  }, [setDateRange]);

  const setMonth = useCallback((year: number, month: number) => {
    const monthStart = dayjs().year(year).month(month).startOf("month");
    const today = dayjs();
    // If viewing current month, end at today. Otherwise, end at month's last day.
    const monthEnd = monthStart.isSame(today, "month")
      ? today
      : monthStart.endOf("month");
    setDateRange(monthStart.toDate(), monthEnd.toDate());
  }, [setDateRange]);

  const stepBackward = useCallback(
    (minDate: Date | null) => {
      const result = computeStep(startDate, endDate, "backward", minDate);
      if (result) setDateRange(result.start, result.end);
    },
    [startDate, endDate, setDateRange]
  );

  const stepForward = useCallback(
    (minDate: Date | null) => {
      const result = computeStep(startDate, endDate, "forward", minDate);
      if (result) setDateRange(result.start, result.end);
    },
    [startDate, endDate, setDateRange]
  );

  const formatForApi = useCallback(() => {
    return {
      dateFrom: startDate ? dayjs(startDate).format("YYYY-MM-DD") : null,
      dateTo: endDate ? dayjs(endDate).format("YYYY-MM-DD") : null,
    };
  }, [startDate, endDate]);

  const isAllTime = !startDate && !endDate;
  const label = computeLabel(startDate, endDate);

  const days = useMemo(
    () => computeDays(startDate, endDate),
    [startDate, endDate]
  );

  // Memoize context values to prevent unnecessary re-renders
  const dataValue = useMemo(
    () => ({
      startDate,
      endDate,
      formatForApi,
      isAllTime,
      label,
      days,
      pickerOpen,
      pickerContainer,
    }),
    [startDate, endDate, formatForApi, isAllTime, label, days, pickerOpen, pickerContainer]
  );

  const actionsValue = useMemo(
    () => ({
      setDateRange,
      setToday,
      setLastWeek,
      setLastMonth,
      setAllTime,
      setMonth,
      stepBackward,
      stepForward,
      openPicker,
      closePicker,
      setPickerContainer,
    }),
    [setDateRange, setToday, setLastWeek, setLastMonth, setAllTime, setMonth, stepBackward, stepForward, openPicker, closePicker, setPickerContainer]
  );

  return (
    <DateRangeDataContext.Provider value={dataValue}>
      <DateRangeActionsContext.Provider value={actionsValue}>
        {children}
      </DateRangeActionsContext.Provider>
    </DateRangeDataContext.Provider>
  );
}
