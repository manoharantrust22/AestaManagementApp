"use client";

import { createContext, useContext } from "react";

/**
 * Context for date range data
 * This changes when user selects different date ranges
 */
interface DateRangeDataContextType {
  startDate: Date | null;
  endDate: Date | null;
  formatForApi: () => { dateFrom: string | null; dateTo: string | null };
  isAllTime: boolean;
  /**
   * Preset/category label only ("This Week", "Last Month", "Custom range",
   * "Mar 2026", etc.) — used by code that needs to identify which named
   * range is active. For the literal date span shown in the top-bar pill
   * and the <ScopeChip />, use `formatScopeLabel(startDate, endDate, days)`
   * from `./formatScopeLabel` instead.
   */
  label: string;
  days: number | null;
  pickerOpen: boolean;
  /**
   * Optional DOM element to use as the picker popover's portal container.
   * When non-null, the picker's <Popover> renders inside this element instead
   * of the default document.body. Set by pages that need the picker to remain
   * visible inside a fullscreened DOM subtree (the native Fullscreen API only
   * paints descendants of the fullscreened element). Default null = portal to
   * document.body.
   */
  pickerContainer: HTMLElement | null;
}

export const DateRangeDataContext = createContext<
  DateRangeDataContextType | undefined
>(undefined);

export function useDateRangeData() {
  const context = useContext(DateRangeDataContext);
  if (context === undefined) {
    throw new Error("useDateRangeData must be used within a DateRangeProvider");
  }
  return context;
}
