/**
 * Split DateRange Context
 *
 * This module provides fine-grained control over date range context re-renders.
 * Components only re-render when the specific data they subscribe to changes.
 *
 * Usage:
 *
 * 1. For components that only need date range data:
 *    const { startDate, endDate, label, isAllTime } = useDateRangeData();
 *    // Only re-renders when date range changes
 *
 * 2. For components that only need actions:
 *    const { setDateRange, setLastWeek, setAllTime } = useDateRangeActions();
 *    // Never re-renders
 *
 * 3. For backwards compatibility (re-renders on any change):
 *    const { startDate, setDateRange, label } = useDateRange();
 *    // Re-renders when date range changes (same as useDateRangeData)
 */

// Export provider
export { DateRangeProvider } from "./DateRangeProvider";

// Export individual hooks (recommended)
export { useDateRangeData } from "./DateRangeDataContext";
export { useDateRangeActions } from "./DateRangeActionsContext";

// Export combined hook for backwards compatibility
export { useDateRange } from "./useDateRange";

// Export shared label formatter (spec §5.3 — chip and pill must read identically)
export { formatScopeLabel } from "./formatScopeLabel";
