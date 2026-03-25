"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import dayjs from "dayjs";
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

function getLabel(startDate: Date | null, endDate: Date | null): string {
  if (!startDate || !endDate) {
    return "All Time";
  }

  const start = dayjs(startDate);
  const end = dayjs(endDate);
  const today = dayjs();

  // Check for "This Week" (Sunday to today)
  if (
    start.isSame(today.startOf("week"), "day") &&
    end.isSame(today, "day")
  ) {
    return "This Week";
  }

  // Check for "This Month" (1st to today)
  if (
    start.isSame(today.startOf("month"), "day") &&
    end.isSame(today, "day")
  ) {
    return "This Month";
  }

  // Custom range
  const startStr = start.format("MMM D");
  const endStr = end.format("MMM D");
  if (start.year() !== end.year()) {
    return `${start.format("MMM D, YYYY")} - ${end.format("MMM D, YYYY")}`;
  }
  return `${startStr} - ${endStr}`;
}

export function DateRangeProvider({ children }: { children: React.ReactNode }) {
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);

  // Restore from localStorage on mount
  useEffect(() => {
    const storedFrom = getStoredDateFrom();
    const storedTo = getStoredDateTo();

    // Check for ALL_TIME marker - keep null (All Time)
    if (storedFrom === ALL_TIME_MARKER || storedTo === ALL_TIME_MARKER) {
      return;
    }

    // Restore date range if valid dates are stored
    if (storedFrom && storedTo) {
      setStartDate(new Date(storedFrom));
      setEndDate(new Date(storedTo));
    }
    // If no stored values, keep null (All Time)
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

  const setLastWeek = useCallback(() => {
    const today = dayjs();
    const weekStart = today.startOf("week"); // Sunday
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

  const formatForApi = useCallback(() => {
    return {
      dateFrom: startDate ? dayjs(startDate).format("YYYY-MM-DD") : null,
      dateTo: endDate ? dayjs(endDate).format("YYYY-MM-DD") : null,
    };
  }, [startDate, endDate]);

  const isAllTime = !startDate && !endDate;
  const label = getLabel(startDate, endDate);

  // Memoize context values to prevent unnecessary re-renders
  const dataValue = useMemo(
    () => ({
      startDate,
      endDate,
      formatForApi,
      isAllTime,
      label,
    }),
    [startDate, endDate, formatForApi, isAllTime, label]
  );

  const actionsValue = useMemo(
    () => ({
      setDateRange,
      setLastWeek,
      setLastMonth,
      setAllTime,
      setMonth,
    }),
    [setDateRange, setLastWeek, setLastMonth, setAllTime, setMonth]
  );

  return (
    <DateRangeDataContext.Provider value={dataValue}>
      <DateRangeActionsContext.Provider value={actionsValue}>
        {children}
      </DateRangeActionsContext.Provider>
    </DateRangeDataContext.Provider>
  );
}
