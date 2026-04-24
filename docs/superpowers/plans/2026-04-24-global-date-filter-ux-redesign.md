# Global Date-Filter UX Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the confusing global date-range filter with a cleaner picker (two-month calendar, typed inputs, grouped presets, no toggle-off chips) and a `<ScopePill />` on summary cards so filtered totals can't be mistaken for lifetime totals.

**Architecture:** One global date filter (existing `DateRangeContext`) drives everything. Default remains "All Time". A new `<ScopePill />` component reads the same context and renders a compact strip inside the summary card whenever the filter is anything other than All Time. The existing `react-date-range` library is kept; we simply improve the popover layout and wire different chip behaviour in the top bar.

**Tech Stack:** Next.js 15, React 18, MUI v7, `react-date-range`, `dayjs`, Vitest + RTL (unit tests), Playwright MCP (visual verification).

**Spec:** [docs/superpowers/specs/2026-04-24-global-date-filter-ux-redesign-design.md](../specs/2026-04-24-global-date-filter-ux-redesign-design.md)

---

## Files Touched

| Path | Nature |
|---|---|
| `src/contexts/DateRangeContext/DateRangeProvider.tsx` | Edit — extend `getLabel()` |
| `src/contexts/DateRangeContext/DateRangeProvider.label.test.ts` | **New** — unit tests for `getLabel()` |
| `src/components/common/ScopePill.tsx` | **New** — ~80 LoC component |
| `src/components/common/ScopePill.test.tsx` | **New** — unit tests for ScopePill |
| `src/components/common/DateRangePicker.tsx` | Edit — two-month calendar, typed inputs, preset groups, helper-text hint |
| `src/components/layout/MainLayout.tsx` | Edit — top-bar chip behaviour (no toggle-off), add Today + Custom chips |
| `src/app/(main)/site/expenses/page.tsx` | Edit — mount `<ScopePill />` inside summary card |
| `src/app/(main)/site/payments/payments-content.tsx` | Edit — mount `<ScopePill />` above tabs |
| `src/app/(main)/site/attendance/attendance-content.tsx` | Edit — mount `<ScopePill />` in Period Summary Paper |

---

## Task 1: Export label helpers and extend `getLabel()` to cover all presets

**Why:** Today `getLabel()` only recognises This Week and This Month. The picker button, Week/Month chips, and the new ScopePill all need one shared, accurate label. We also need the helper exported so tests and the pill can reuse it.

**Files:**
- Modify: `src/contexts/DateRangeContext/DateRangeProvider.tsx` (lines 51–83)
- Test: `src/contexts/DateRangeContext/DateRangeProvider.label.test.ts` (new)

### Step 1.1 — Write the failing test

- [ ] Create `src/contexts/DateRangeContext/DateRangeProvider.label.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import dayjs from "dayjs";
import { computeLabel } from "./DateRangeProvider";

describe("computeLabel", () => {
  beforeAll(() => {
    // Freeze clock to 2026-04-24 (Friday)
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-24T12:00:00"));
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  const today = () => dayjs("2026-04-24").toDate();
  const daysAgo = (n: number) => dayjs("2026-04-24").subtract(n, "day").toDate();
  const startOfWeek = () => dayjs("2026-04-24").startOf("week").toDate(); // Sunday Apr 19
  const startOfMonth = () => dayjs("2026-04-24").startOf("month").toDate(); // Apr 1

  it("returns 'All Time' when both dates are null", () => {
    expect(computeLabel(null, null)).toBe("All Time");
  });

  it("returns 'Today' for a single-day range on today", () => {
    expect(computeLabel(today(), today())).toBe("Today");
  });

  it("returns 'Yesterday' for a single-day range on yesterday", () => {
    const y = daysAgo(1);
    expect(computeLabel(y, y)).toBe("Yesterday");
  });

  it("returns 'This Week' for Sunday-to-today", () => {
    expect(computeLabel(startOfWeek(), today())).toBe("This Week");
  });

  it("returns 'This Month' for 1st-to-today", () => {
    expect(computeLabel(startOfMonth(), today())).toBe("This Month");
  });

  it("returns 'Last 7 days' for a 7-day rolling window ending today", () => {
    expect(computeLabel(daysAgo(6), today())).toBe("Last 7 days");
  });

  it("returns 'Last 14 days' for a 14-day rolling window ending today", () => {
    expect(computeLabel(daysAgo(13), today())).toBe("Last 14 days");
  });

  it("returns 'Last 30 days' for a 30-day rolling window ending today", () => {
    expect(computeLabel(daysAgo(29), today())).toBe("Last 30 days");
  });

  it("returns 'Last 90 days' for a 90-day rolling window ending today", () => {
    expect(computeLabel(daysAgo(89), today())).toBe("Last 90 days");
  });

  it("returns a custom range label for unrecognised ranges within the same year", () => {
    const start = dayjs("2026-04-03").toDate();
    const end = dayjs("2026-04-17").toDate();
    expect(computeLabel(start, end)).toBe("Apr 3 – Apr 17");
  });

  it("returns a custom range label with year suffix for ranges crossing years", () => {
    const start = dayjs("2025-12-20").toDate();
    const end = dayjs("2026-01-05").toDate();
    expect(computeLabel(start, end)).toBe("Dec 20, 2025 – Jan 5, 2026");
  });

  it("returns the formatted single date when start and end are the same non-today day", () => {
    const d = dayjs("2026-03-10").toDate();
    expect(computeLabel(d, d)).toBe("Mar 10, 2026");
  });
});
```

- [ ] Run the test to verify it fails:

```bash
npm run test -- DateRangeProvider.label
```

Expected: FAIL — `computeLabel` is not exported.

### Step 1.2 — Implement `computeLabel`

- [ ] Replace the internal `getLabel` function in `src/contexts/DateRangeContext/DateRangeProvider.tsx` (lines 51–83) with the exported `computeLabel` below, and update the provider body to call `computeLabel` (line 153):

```typescript
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
    if (start.isSame(today.startOf("week"), "day")) return "This Week";
    if (start.isSame(today.startOf("month"), "day")) return "This Month";
    if (daysBetween === 6) return "Last 7 days";
    if (daysBetween === 13) return "Last 14 days";
    if (daysBetween === 29) return "Last 30 days";
    if (daysBetween === 89) return "Last 90 days";
  }

  // Last Week (previous Sun–Sat)
  const lastWeekStart = today.subtract(1, "week").startOf("week");
  const lastWeekEnd = lastWeekStart.endOf("week");
  if (start.isSame(lastWeekStart, "day") && end.isSame(lastWeekEnd, "day")) {
    return "Last Week";
  }

  // Last Month (previous calendar month)
  const lastMonthStart = today.subtract(1, "month").startOf("month");
  const lastMonthEnd = today.subtract(1, "month").endOf("month");
  if (start.isSame(lastMonthStart, "day") && end.isSame(lastMonthEnd, "day")) {
    return "Last Month";
  }

  // Custom range
  const crossesYears = start.year() !== end.year();
  if (crossesYears) {
    return `${start.format("MMM D, YYYY")} – ${end.format("MMM D, YYYY")}`;
  }
  return `${start.format("MMM D")} – ${end.format("MMM D")}`;
}
```

- [ ] In the same file, replace the line `const label = getLabel(startDate, endDate);` with `const label = computeLabel(startDate, endDate);` and delete the old `getLabel` function (lines 51–83).

### Step 1.3 — Run tests to verify they pass

- [ ] Run:

```bash
npm run test -- DateRangeProvider.label
```

Expected: 12 tests PASS.

### Step 1.4 — Commit

- [ ] Commit:

```bash
git add src/contexts/DateRangeContext/DateRangeProvider.tsx src/contexts/DateRangeContext/DateRangeProvider.label.test.ts
git commit -m "feat(date-range): extend computeLabel to cover all presets

Adds Today, Yesterday, Last 7/14/30/90 days, Last Week, Last Month
recognition to the shared label helper so the picker button, top-bar
chips, and the new ScopePill all read identically."
```

---

## Task 2: Create `<ScopePill />` component

**Why:** This is the card-level "you are viewing a filtered range" indicator. Renders nothing on All Time, renders a strip otherwise, and offers a one-click "View All Time" escape.

**Files:**
- Create: `src/components/common/ScopePill.tsx`
- Test: `src/components/common/ScopePill.test.tsx`

### Step 2.1 — Write the failing test

- [ ] Create `src/components/common/ScopePill.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ScopePill from "./ScopePill";
import * as DateRangeModule from "@/contexts/DateRangeContext";

describe("ScopePill", () => {
  it("renders nothing when filter is All Time", () => {
    vi.spyOn(DateRangeModule, "useDateRange").mockReturnValue({
      startDate: null,
      endDate: null,
      label: "All Time",
      isAllTime: true,
      setAllTime: vi.fn(),
      setDateRange: vi.fn(),
      setLastWeek: vi.fn(),
      setLastMonth: vi.fn(),
      setMonth: vi.fn(),
      formatForApi: () => ({ dateFrom: null, dateTo: null }),
    } as ReturnType<typeof DateRangeModule.useDateRange>);

    const { container } = render(<ScopePill />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the label and range when a filter is active", () => {
    vi.spyOn(DateRangeModule, "useDateRange").mockReturnValue({
      startDate: new Date("2026-04-17"),
      endDate: new Date("2026-04-24"),
      label: "Last 7 days",
      isAllTime: false,
      setAllTime: vi.fn(),
      setDateRange: vi.fn(),
      setLastWeek: vi.fn(),
      setLastMonth: vi.fn(),
      setMonth: vi.fn(),
      formatForApi: () => ({ dateFrom: "2026-04-17", dateTo: "2026-04-24" }),
    } as ReturnType<typeof DateRangeModule.useDateRange>);

    render(<ScopePill />);
    expect(screen.getByText(/Last 7 days/)).toBeInTheDocument();
    expect(screen.getByText(/Apr 17 – Apr 24/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /clear date filter/i })
    ).toBeInTheDocument();
  });

  it("calls setAllTime when the clear button is clicked", () => {
    const setAllTime = vi.fn();
    vi.spyOn(DateRangeModule, "useDateRange").mockReturnValue({
      startDate: new Date("2026-04-17"),
      endDate: new Date("2026-04-24"),
      label: "Last 7 days",
      isAllTime: false,
      setAllTime,
      setDateRange: vi.fn(),
      setLastWeek: vi.fn(),
      setLastMonth: vi.fn(),
      setMonth: vi.fn(),
      formatForApi: () => ({ dateFrom: "2026-04-17", dateTo: "2026-04-24" }),
    } as ReturnType<typeof DateRangeModule.useDateRange>);

    render(<ScopePill />);
    fireEvent.click(
      screen.getByRole("button", { name: /clear date filter/i })
    );
    expect(setAllTime).toHaveBeenCalledTimes(1);
  });

  it("renders only the single date for a same-day range", () => {
    vi.spyOn(DateRangeModule, "useDateRange").mockReturnValue({
      startDate: new Date("2026-04-24"),
      endDate: new Date("2026-04-24"),
      label: "Today",
      isAllTime: false,
      setAllTime: vi.fn(),
      setDateRange: vi.fn(),
      setLastWeek: vi.fn(),
      setLastMonth: vi.fn(),
      setMonth: vi.fn(),
      formatForApi: () => ({ dateFrom: "2026-04-24", dateTo: "2026-04-24" }),
    } as ReturnType<typeof DateRangeModule.useDateRange>);

    render(<ScopePill />);
    // Single-day should not render the "–" separator
    expect(screen.queryByText(/–/)).not.toBeInTheDocument();
    expect(screen.getByText(/Today/)).toBeInTheDocument();
  });
});
```

- [ ] Run the test to verify it fails:

```bash
npm run test -- ScopePill
```

Expected: FAIL — module `./ScopePill` cannot be found.

### Step 2.2 — Implement `ScopePill`

- [ ] Create `src/components/common/ScopePill.tsx`:

```tsx
"use client";

import React from "react";
import { Box, Button, Typography } from "@mui/material";
import {
  CalendarMonth as CalendarMonthIcon,
  Close as CloseIcon,
} from "@mui/icons-material";
import dayjs from "dayjs";
import { useDateRange } from "@/contexts/DateRangeContext";

function formatRange(
  startDate: Date,
  endDate: Date
): { text: string; isSingleDay: boolean } {
  const start = dayjs(startDate);
  const end = dayjs(endDate);
  const isSingleDay = start.isSame(end, "day");

  if (isSingleDay) {
    return { text: "", isSingleDay: true };
  }

  const crossesYears = start.year() !== end.year();
  if (crossesYears) {
    return {
      text: `${start.format("MMM D, YYYY")} – ${end.format("MMM D, YYYY")}`,
      isSingleDay: false,
    };
  }
  return {
    text: `${start.format("MMM D")} – ${end.format("MMM D")}`,
    isSingleDay: false,
  };
}

export default function ScopePill() {
  const { isAllTime, startDate, endDate, label, setAllTime } = useDateRange();

  if (isAllTime || !startDate || !endDate) return null;

  const { text: rangeText, isSingleDay } = formatRange(startDate, endDate);

  return (
    <Box
      role="status"
      onClick={() => setAllTime()}
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 1,
        px: 2,
        py: 0.75,
        bgcolor: "primary.50",
        borderBottom: 1,
        borderColor: "primary.100",
        cursor: "pointer",
        flexWrap: "wrap",
        transition: "background-color 0.15s",
        "&:hover": { bgcolor: "primary.100" },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
        <CalendarMonthIcon sx={{ fontSize: 16, color: "primary.main" }} />
        <Typography
          variant="body2"
          sx={{ fontWeight: 500, color: "primary.dark" }}
          noWrap
        >
          Showing: {label}
          {!isSingleDay && rangeText ? ` · ${rangeText}` : ""}
        </Typography>
      </Box>
      <Button
        size="small"
        startIcon={<CloseIcon sx={{ fontSize: 14 }} />}
        onClick={(e) => {
          e.stopPropagation();
          setAllTime();
        }}
        aria-label="Clear date filter and show all time"
        sx={{
          textTransform: "none",
          color: "primary.main",
          fontWeight: 500,
          py: 0.25,
          minWidth: 0,
          "& .MuiButton-startIcon": { mr: 0.5 },
          "&:hover": { bgcolor: "primary.100" },
        }}
      >
        <Box
          component="span"
          sx={{ display: { xs: "none", sm: "inline" } }}
        >
          View All Time
        </Box>
        <Box
          component="span"
          sx={{ display: { xs: "inline", sm: "none" } }}
        >
          All Time
        </Box>
      </Button>
    </Box>
  );
}
```

### Step 2.3 — Run tests to verify they pass

- [ ] Run:

```bash
npm run test -- ScopePill
```

Expected: 4 tests PASS.

### Step 2.4 — Commit

- [ ] Commit:

```bash
git add src/components/common/ScopePill.tsx src/components/common/ScopePill.test.tsx
git commit -m "feat(date-range): add ScopePill component

Renders a compact filter-aware strip on summary cards so users can
tell at a glance that the numbers are scoped to a specific range,
with a one-click shortcut back to All Time."
```

---

## Task 3: Redesign the `DateRangePicker` popover

**Why:** Fixes the two-click confusion, adds typed date inputs, groups presets, moves All Time to a distinct position, and exposes `openFocusedOnCalendar` so the new "Custom" top-bar chip can jump straight past the preset list.

**Files:**
- Modify: `src/components/common/DateRangePicker.tsx`

### Step 3.1 — Add `initialFocus` prop and preset groups

- [ ] In `src/components/common/DateRangePicker.tsx`, update the `DateRangePickerProps` interface and the top of the file (replace the current `interface DateRangePickerProps` block around line 51):

```tsx
interface DateRangePickerProps {
  startDate: Date | null;
  endDate: Date | null;
  onChange: (startDate: Date | null, endDate: Date | null) => void;
  minDate?: Date;
  maxDate?: Date;
  /**
   * When true, on next mount/open the popover opens with the calendar
   * focused and the preset list visually present but not highlighted.
   * Used by the "Custom" top-bar chip.
   */
  openOnMount?: boolean;
  /**
   * Called when the user closes the picker without applying.
   * Lets the parent reset `openOnMount` flags.
   */
  onPopoverClose?: () => void;
}

type PresetGroup = "quick" | "rolling" | "previous" | "special";

interface Preset {
  key: PresetKey;
  label: string;
  group: PresetGroup;
  getRange: () => { start: Date; end: Date };
}

const PRESET_GROUP_LABELS: Record<PresetGroup, string> = {
  quick: "Quick",
  rolling: "Rolling",
  previous: "Previous",
  special: "Special",
};
```

- [ ] Replace the `presets` array (lines 77–158) with the regrouped list below:

```tsx
const presets: Preset[] = [
  {
    key: "today",
    label: "Today",
    group: "quick",
    getRange: () => ({
      start: startOfDay(new Date()),
      end: endOfDay(new Date()),
    }),
  },
  {
    key: "yesterday",
    label: "Yesterday",
    group: "quick",
    getRange: () => ({
      start: startOfDay(subDays(new Date(), 1)),
      end: endOfDay(subDays(new Date(), 1)),
    }),
  },
  {
    key: "thisWeek",
    label: "This Week",
    group: "quick",
    getRange: () => ({
      start: startOfWeek(new Date()),
      end: endOfDay(new Date()),
    }),
  },
  {
    key: "thisMonth",
    label: "This Month",
    group: "quick",
    getRange: () => ({
      start: startOfMonth(new Date()),
      end: endOfDay(new Date()),
    }),
  },
  {
    key: "last7days",
    label: "Last 7 days",
    group: "rolling",
    getRange: () => ({
      start: startOfDay(subDays(new Date(), 6)),
      end: endOfDay(new Date()),
    }),
  },
  {
    key: "last14days",
    label: "Last 14 days",
    group: "rolling",
    getRange: () => ({
      start: startOfDay(subDays(new Date(), 13)),
      end: endOfDay(new Date()),
    }),
  },
  {
    key: "last30days",
    label: "Last 30 days",
    group: "rolling",
    getRange: () => ({
      start: startOfDay(subDays(new Date(), 29)),
      end: endOfDay(new Date()),
    }),
  },
  {
    key: "last90days",
    label: "Last 90 days",
    group: "rolling",
    getRange: () => ({
      start: startOfDay(subDays(new Date(), 89)),
      end: endOfDay(new Date()),
    }),
  },
  {
    key: "lastWeek",
    label: "Last Week",
    group: "previous",
    getRange: () => ({
      start: startOfWeek(subDays(new Date(), 7)),
      end: endOfWeek(subDays(new Date(), 7)),
    }),
  },
  {
    key: "lastMonth",
    label: "Last Month",
    group: "previous",
    getRange: () => ({
      start: startOfMonth(subMonths(new Date(), 1)),
      end: endOfMonth(subMonths(new Date(), 1)),
    }),
  },
  {
    key: "allTime",
    label: "All Time",
    group: "special",
    getRange: () => ({
      start: new Date(2020, 0, 1),
      end: endOfDay(new Date()),
    }),
  },
];
```

- [ ] Add `"last90days"` to the `PresetKey` union (line ~60):

```tsx
type PresetKey =
  | "today"
  | "yesterday"
  | "thisWeek"
  | "last7days"
  | "lastWeek"
  | "last14days"
  | "last30days"
  | "last90days"
  | "thisMonth"
  | "lastMonth"
  | "allTime";
```

### Step 3.2 — Delete `getSelectionLabel`, keep `findMatchingPreset`

- [ ] Delete the `getSelectionLabel` function (lines ~188–223). The button label now comes from the shared `computeLabel` via the context. Add the import at the top of the file:

```tsx
import { useDateRange } from "@/contexts/DateRangeContext";
```

And inside the component body (near the other state declarations around line 232), replace the existing `currentLabel` computation (line ~365) with:

```tsx
const { label: currentLabel } = useDateRange();
```

- [ ] Keep `findMatchingPreset` (lines ~175–186) exactly as it is — it is still used for highlighting the selected preset in the list.

### Step 3.3 — Add typed date inputs and click-stage state

- [ ] Add state for the click stage and typed inputs near the top of the component body (just after the existing `tempRange` state ~line 238):

```tsx
const [clickStage, setClickStage] = useState<"start" | "end">("start");
const [typedStart, setTypedStart] = useState("");
const [typedEnd, setTypedEnd] = useState("");

useEffect(() => {
  if (tempRange[0].startDate) {
    setTypedStart(format(tempRange[0].startDate, "MMM d, yyyy"));
  }
  if (tempRange[0].endDate) {
    setTypedEnd(format(tempRange[0].endDate, "MMM d, yyyy"));
  }
}, [tempRange]);
```

- [ ] Replace the existing `handleRangeChange` function with one that tracks click stages:

```tsx
const handleRangeChange = (ranges: RangeKeyDict) => {
  const selection = ranges.selection;
  setTempRange([selection]);

  if (selection.startDate && selection.endDate) {
    setSelectedPreset(
      findMatchingPreset(selection.startDate, selection.endDate, dynamicPresets)
    );
  }

  // Toggle click-stage label
  if (
    selection.startDate &&
    selection.endDate &&
    format(selection.startDate, "yyyy-MM-dd") ===
      format(selection.endDate, "yyyy-MM-dd")
  ) {
    // First click (start = end)
    setClickStage("end");
  } else {
    setClickStage("start");
  }
};

const commitTypedDate = (which: "start" | "end", raw: string) => {
  const parsed = dayjs(raw);
  if (!parsed.isValid()) {
    // Revert displayed value
    if (which === "start" && tempRange[0].startDate) {
      setTypedStart(format(tempRange[0].startDate, "MMM d, yyyy"));
    } else if (which === "end" && tempRange[0].endDate) {
      setTypedEnd(format(tempRange[0].endDate, "MMM d, yyyy"));
    }
    return;
  }
  const next = parsed.toDate();
  if (which === "start") {
    const end =
      tempRange[0].endDate && next <= tempRange[0].endDate
        ? tempRange[0].endDate
        : next;
    setTempRange([{ startDate: next, endDate: end, key: "selection" }]);
  } else {
    const start =
      tempRange[0].startDate && next >= tempRange[0].startDate
        ? tempRange[0].startDate
        : next;
    setTempRange([{ startDate: start, endDate: next, key: "selection" }]);
  }
  setSelectedPreset(null);
};
```

### Step 3.4 — Rework the popover JSX

- [ ] Replace the popover content (the `<Popover>…</Popover>` block starting around line 427) with the structure below. The changes: two typed-date inputs at top of calendar panel, two calendar months side-by-side on desktop, grouped presets with headers, helper text that reflects `clickStage`, and visual separation for "All Time".

```tsx
<Popover
  open={open}
  anchorEl={anchorEl}
  onClose={() => {
    handleClose();
    onPopoverClose?.();
  }}
  anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
  transformOrigin={{ vertical: "top", horizontal: "left" }}
  PaperProps={{
    sx: {
      mt: 1,
      maxWidth: { xs: "95vw", sm: "auto" },
      maxHeight: { xs: "85vh", sm: "auto" },
      overflow: "hidden",
    },
  }}
>
  <Box
    sx={{
      display: "flex",
      flexDirection: { xs: "column", sm: "row" },
      minWidth: { xs: "auto", sm: 780 },
    }}
  >
    {/* Mobile: Horizontal preset chips (unchanged from existing) */}
    <Box
      sx={{
        display: { xs: "flex", sm: "none" },
        overflowX: "auto",
        gap: 0.5,
        p: 1,
        borderBottom: 1,
        borderColor: "divider",
        WebkitOverflowScrolling: "touch",
        "&::-webkit-scrollbar": { display: "none" },
        scrollbarWidth: "none",
      }}
    >
      {dynamicPresets.map((preset) => (
        <Chip
          key={preset.key}
          label={preset.label}
          size="small"
          variant={selectedPreset === preset.key ? "filled" : "outlined"}
          color={selectedPreset === preset.key ? "primary" : "default"}
          onClick={() => handlePresetClick(preset)}
          sx={{ flexShrink: 0, fontSize: "0.7rem", height: 26 }}
        />
      ))}
    </Box>

    {/* Desktop: Grouped presets */}
    <Box
      sx={{
        display: { xs: "none", sm: "block" },
        width: 200,
        borderRight: 1,
        borderColor: "divider",
        maxHeight: 460,
        overflow: "auto",
        py: 1,
      }}
    >
      {(["quick", "rolling", "previous"] as PresetGroup[]).map((group) => (
        <Box key={group} sx={{ mb: 1.5 }}>
          <Typography
            variant="caption"
            sx={{
              px: 2,
              pt: 0.5,
              display: "block",
              color: "text.secondary",
              textTransform: "uppercase",
              letterSpacing: 0.5,
              fontWeight: 600,
              fontSize: "0.65rem",
            }}
          >
            {PRESET_GROUP_LABELS[group]}
          </Typography>
          <List dense disablePadding>
            {dynamicPresets
              .filter((p) => p.group === group)
              .map((preset) => (
                <ListItemButton
                  key={preset.key}
                  selected={selectedPreset === preset.key}
                  onClick={() => handlePresetClick(preset)}
                  sx={{
                    py: 0.75,
                    "&.Mui-selected": {
                      bgcolor: "primary.50",
                      color: "primary.main",
                      "&:hover": { bgcolor: "primary.100" },
                    },
                  }}
                >
                  <ListItemText
                    primary={preset.label}
                    primaryTypographyProps={{
                      fontSize: "0.8rem",
                      fontWeight: selectedPreset === preset.key ? 600 : 400,
                    }}
                  />
                </ListItemButton>
              ))}
          </List>
        </Box>
      ))}

      <Divider sx={{ my: 1 }} />

      {/* Special: All Time */}
      {dynamicPresets
        .filter((p) => p.group === "special")
        .map((preset) => (
          <ListItemButton
            key={preset.key}
            selected={selectedPreset === preset.key}
            onClick={() => handlePresetClick(preset)}
            sx={{
              py: 1,
              mx: 1,
              borderRadius: 1,
              bgcolor:
                selectedPreset === preset.key ? "primary.50" : "transparent",
            }}
          >
            <Typography
              component="span"
              sx={{ mr: 1, fontSize: "0.9rem" }}
              aria-hidden
            >
              ★
            </Typography>
            <ListItemText
              primary={preset.label}
              primaryTypographyProps={{
                fontSize: "0.85rem",
                fontWeight: 600,
              }}
            />
          </ListItemButton>
        ))}
    </Box>

    {/* Calendar panel */}
    <Box sx={{ p: { xs: 0.5, sm: 2 }, overflow: "auto" }}>
      {/* Typed date inputs — desktop only */}
      <Box
        sx={{
          display: { xs: "none", sm: "flex" },
          alignItems: "center",
          gap: 1,
          mb: 1.5,
        }}
      >
        <TextField
          size="small"
          label="Start"
          value={typedStart}
          onChange={(e) => setTypedStart(e.target.value)}
          onBlur={() => commitTypedDate("start", typedStart)}
          sx={{
            width: 160,
            "& .MuiOutlinedInput-root": clickStage === "start"
              ? { "& fieldset": { borderColor: "primary.main", borderWidth: 2 } }
              : {},
          }}
          inputProps={{ "aria-label": "Start date" }}
        />
        <Typography sx={{ color: "text.secondary" }}>→</Typography>
        <TextField
          size="small"
          label="End"
          value={typedEnd}
          onChange={(e) => setTypedEnd(e.target.value)}
          onBlur={() => commitTypedDate("end", typedEnd)}
          sx={{
            width: 160,
            "& .MuiOutlinedInput-root": clickStage === "end"
              ? { "& fieldset": { borderColor: "primary.main", borderWidth: 2 } }
              : {},
          }}
          inputProps={{ "aria-label": "End date" }}
        />
      </Box>

      <DateRange
        ranges={tempRange}
        onChange={handleRangeChange}
        months={isMobile ? 1 : 2}
        direction="horizontal"
        maxDate={maxDate}
        minDate={minDate}
        rangeColors={["#1976d2"]}
        showDateDisplay={false}
        editableDateInputs={false}
        moveRangeOnFirstSelection={false}
      />

      <Typography
        variant="caption"
        sx={{
          display: { xs: "none", sm: "block" },
          mt: 0.5,
          color: "text.secondary",
        }}
      >
        {clickStage === "start"
          ? "Click a start date, then an end date."
          : "Now pick the end date."}
      </Typography>
    </Box>
  </Box>

  {/* Desktop actions */}
  <Box sx={{ display: { xs: "none", sm: "block" } }}>
    <Divider />
    <Box
      sx={{
        display: "flex",
        justifyContent: "flex-end",
        gap: 1,
        p: 1.5,
      }}
    >
      <Button size="small" onClick={() => { handleClose(); onPopoverClose?.(); }}>
        Cancel
      </Button>
      <Button size="small" variant="contained" onClick={handleApply}>
        Apply
      </Button>
    </Box>
  </Box>

  {/* Mobile actions */}
  <Box
    sx={{
      display: { xs: "flex", sm: "none" },
      justifyContent: "space-between",
      alignItems: "center",
      gap: 1,
      p: 1,
      borderTop: 1,
      borderColor: "divider",
    }}
  >
    <Typography variant="caption" color="text.secondary">
      Tap preset to quick-apply
    </Typography>
    <Box sx={{ display: "flex", gap: 0.5 }}>
      <Button
        size="small"
        onClick={() => { handleClose(); onPopoverClose?.(); }}
        sx={{ minWidth: 60, py: 0.25 }}
      >
        Close
      </Button>
      <Button
        size="small"
        variant="contained"
        onClick={handleApply}
        sx={{ minWidth: 60, py: 0.25 }}
      >
        Apply
      </Button>
    </Box>
  </Box>
</Popover>
```

- [ ] Add the missing imports near the top of the file:

```tsx
import { TextField } from "@mui/material";
```

(`Divider` and `Chip` are already imported.)

### Step 3.5 — Handle `openOnMount` prop

- [ ] Add an effect near the top of the component body to auto-open the popover when `openOnMount` transitions to true:

```tsx
const triggerRef = useRef<HTMLButtonElement | null>(null);
useEffect(() => {
  if (openOnMount && triggerRef.current && !anchorEl) {
    setAnchorEl(triggerRef.current);
  }
}, [openOnMount, anchorEl]);
```

- [ ] Attach the ref to the main `Button` that opens the picker (around line 382):

```tsx
<Button
  ref={triggerRef}
  variant="outlined"
  size="small"
  onClick={handleOpen}
  /* … existing props … */
>
  {/* … existing children … */}
</Button>
```

### Step 3.6 — Visual verification via Playwright

Follows the CLAUDE.md UI workflow — no unit tests at this layer (MUI Popover + react-date-range combination is dominated by third-party DOM).

- [ ] Start the dev server if not already running:

```bash
npm run dev
```

- [ ] Using Playwright MCP:
  1. Navigate to `http://localhost:3000/dev-login`.
  2. Open `http://localhost:3000/site/expenses`.
  3. Click the top-bar date button → verify the popover opens with two calendar months visible, grouped presets on the left, and two typed date inputs at the top.
  4. Click a date in April → verify "Start" input is highlighted and helper text reads "Now pick the end date."
  5. Click a date in May → verify "End" input fills in and helper text reverts.
  6. Type `Jan 15, 2026` into the Start field, blur → verify the calendar selection updates.
  7. Click a preset like "Last 7 days" → verify it highlights, range updates.
  8. Click "All Time" → verify it applies and popover closes (desktop: after clicking Apply).
  9. `playwright_console_logs` — expect zero errors or warnings.
- [ ] Screenshot the popover.

### Step 3.7 — Commit

- [ ] Commit:

```bash
git add src/components/common/DateRangePicker.tsx
git commit -m "feat(date-range): redesigned picker with dual calendar and typed inputs

- Two-month calendar side-by-side on desktop
- Always-visible typed Start/End inputs with active-field highlight
- Preset list reorganised into Quick / Rolling / Previous groups
- All Time moved below a divider with a star marker
- Helper text reflects click stage ('pick start' -> 'pick end')
- New openOnMount prop lets 'Custom' top-bar chip open picker directly"
```

---

## Task 4: Update the top-bar chips in `MainLayout`

**Why:** Remove the toggle-off-to-All-Time behaviour, add "Today" and "Custom" chips, and bind active-state to `dateRangeLabel` correctly (so presets picked inside the popover also light up the right chip).

**Files:**
- Modify: `src/components/layout/MainLayout.tsx` (lines ~1079–1123 and ~433–441)

### Step 4.1 — Add `setLast7Days`/`setToday` to the context

The existing context already has `setLastWeek` (for Sunday→today) and `setLastMonth` (for 1st→today). We need `setToday` as a new action so the "Today" chip is one line.

- [ ] In `src/contexts/DateRangeContext/DateRangeActionsContext.tsx`, add `setToday` to the interface:

```tsx
export interface DateRangeActionsContextValue {
  setDateRange: (start: Date | null, end: Date | null) => void;
  setToday: () => void;
  setLastWeek: () => void;
  setLastMonth: () => void;
  setAllTime: () => void;
  setMonth: (year: number, month: number) => void;
}
```

- [ ] In `src/contexts/DateRangeContext/DateRangeProvider.tsx`, add:

```tsx
const setToday = useCallback(() => {
  const today = dayjs().startOf("day").toDate();
  setDateRange(today, today);
}, [setDateRange]);
```

And add `setToday` to the `actionsValue` memo and to `useDateRange.ts`'s return object:

```tsx
// DateRangeProvider.tsx
const actionsValue = useMemo(
  () => ({
    setDateRange,
    setToday,
    setLastWeek,
    setLastMonth,
    setAllTime,
    setMonth,
  }),
  [setDateRange, setToday, setLastWeek, setLastMonth, setAllTime, setMonth]
);
```

```tsx
// src/contexts/DateRangeContext/useDateRange.ts
const { setDateRange, setToday, setLastWeek, setLastMonth, setAllTime, setMonth } =
  useDateRangeActions();

return {
  startDate,
  endDate,
  setDateRange,
  setToday,
  setLastWeek,
  setLastMonth,
  setAllTime,
  setMonth,
  formatForApi,
  isAllTime,
  label,
};
```

### Step 4.2 — Replace the top-bar chip block

- [ ] In `src/components/layout/MainLayout.tsx`, around line 432–441, add `setToday` and a local `openPickerCustom` state:

```tsx
const {
  startDate,
  endDate,
  setDateRange,
  setToday,
  setLastWeek,
  setLastMonth,
  setAllTime,
  isAllTime,
  label: dateRangeLabel,
} = useDateRange();

const [openPickerCustom, setOpenPickerCustom] = useState(false);
```

- [ ] Replace the Global Date Range Controls block (lines 1079–1123) with:

```tsx
{/* Global Date Range Controls */}
<Box
  sx={{
    display: "flex",
    alignItems: "center",
    gap: { xs: 0.5, sm: 1 },
    mr: { xs: 0.5, sm: 1 },
  }}
>
  <DateRangePicker
    startDate={startDate}
    endDate={endDate}
    onChange={(start, end) => {
      setDateRange(start, end);
      setOpenPickerCustom(false);
    }}
    minDate={selectedSite?.start_date ? new Date(selectedSite.start_date) : undefined}
    openOnMount={openPickerCustom}
    onPopoverClose={() => setOpenPickerCustom(false)}
  />

  {/* Quick chips — hidden on mobile */}
  <Chip
    label="Today"
    size="small"
    variant={dateRangeLabel === "Today" ? "filled" : "outlined"}
    color={dateRangeLabel === "Today" ? "primary" : "default"}
    onClick={() => setToday()}
    sx={{
      display: { xs: "none", sm: "flex" },
      cursor: "pointer",
      minWidth: 56,
      fontWeight: dateRangeLabel === "Today" ? 600 : 400,
    }}
  />
  <Chip
    label="Week"
    size="small"
    variant={dateRangeLabel === "This Week" ? "filled" : "outlined"}
    color={dateRangeLabel === "This Week" ? "primary" : "default"}
    onClick={() => setLastWeek()}
    sx={{
      display: { xs: "none", sm: "flex" },
      cursor: "pointer",
      minWidth: 56,
      fontWeight: dateRangeLabel === "This Week" ? 600 : 400,
    }}
  />
  <Chip
    label="Month"
    size="small"
    variant={dateRangeLabel === "This Month" ? "filled" : "outlined"}
    color={dateRangeLabel === "This Month" ? "primary" : "default"}
    onClick={() => setLastMonth()}
    sx={{
      display: { xs: "none", sm: "flex" },
      cursor: "pointer",
      minWidth: 64,
      fontWeight: dateRangeLabel === "This Month" ? 600 : 400,
    }}
  />
  <Chip
    label="Custom"
    size="small"
    variant="outlined"
    onClick={() => setOpenPickerCustom(true)}
    sx={{
      display: { xs: "none", sm: "flex" },
      cursor: "pointer",
      minWidth: 64,
    }}
  />
</Box>
```

Note the key behaviour changes vs. the old block:
- Each chip *applies* its preset on click — no `dateRangeLabel === "This Week" ? setAllTime() : setLastWeek()` toggle.
- "Today" and "Custom" are new.
- "Custom" triggers the picker via `openOnMount` instead of duplicating its own handler.

### Step 4.3 — Visual verification via Playwright

- [ ] With the dev server running, auto-login and:
  1. Open `/site/expenses`.
  2. Click the **Week** chip — verify filter applies, chip becomes filled, ScopePill will appear in Task 5 (ignore absence for now — just confirm top bar reads "This Week").
  3. Click the **Week** chip again — verify range stays on "This Week" (no toggle back to All Time).
  4. Click the **Today** chip — verify label becomes "Today".
  5. Click the **Custom** chip — verify the full picker popover opens with the calendar focused.
  6. `playwright_console_logs` — zero errors/warnings.

### Step 4.4 — Commit

- [ ] Commit:

```bash
git add src/contexts/DateRangeContext/DateRangeActionsContext.tsx src/contexts/DateRangeContext/DateRangeProvider.tsx src/contexts/DateRangeContext/useDateRange.ts src/components/layout/MainLayout.tsx
git commit -m "feat(date-range): top-bar chips apply only, add Today and Custom

Removes the confusing toggle-off-to-AllTime behaviour. Today and
Custom chips added; Custom opens the picker with the calendar focused.
New setToday action added to the actions context."
```

---

## Task 5: Mount `<ScopePill />` on the Expenses summary card

**Files:**
- Modify: `src/app/(main)/site/expenses/page.tsx`

### Step 5.1 — Import and place the pill

- [ ] At the top of `src/app/(main)/site/expenses/page.tsx`, add the import next to the existing component imports:

```tsx
import ScopePill from "@/components/common/ScopePill";
```

- [ ] Inside the summary card's `<CardContent>` (starts around line 782), insert `<ScopePill />` as the FIRST child, so it sits above the flex row. Replace the current opening `<CardContent sx={{ p: { xs: 2, md: 2.5 } }}>` + its first child `<Box>` block with:

```tsx
<CardContent sx={{ p: 0 }}>
  <ScopePill />
  <Box
    sx={{
      display: "flex",
      flexDirection: { xs: "column", md: "row" },
      gap: { xs: 2.5, md: 3 },
      alignItems: { xs: "stretch", md: "stretch" },
      p: { xs: 2, md: 2.5 },
    }}
  >
```

The outer `p: 0` on `<CardContent>` is needed so the pill strip can reach the card edges; the inner `<Box>` keeps the old padding. Do NOT remove any existing children.

### Step 5.2 — Visual verification via Playwright

- [ ] With the dev server running, auto-login and:
  1. Open `/site/expenses`.
  2. Default (All Time) — pill NOT visible, summary card looks identical to before.
  3. Click the **Week** chip — pill appears reading `Showing: This Week · <dates>` just above the KPI row. No layout breaks.
  4. Click `✕ View All Time` on the pill — pill disappears, top bar reads "All Time".
  5. Click the **Today** chip — pill appears reading `Showing: Today` (no date range, as single-day).
  6. `playwright_console_logs` — zero errors/warnings.
- [ ] Screenshot: (a) All Time state, (b) Week filter with pill visible.

### Step 5.3 — Commit

- [ ] Commit:

```bash
git add src/app/\(main\)/site/expenses/page.tsx
git commit -m "feat(expenses): mount ScopePill on summary card

Users can now see at a glance whether the KPI totals are lifetime or
scoped to a specific range, with a one-click escape back to All Time."
```

---

## Task 6: Mount `<ScopePill />` on the Salary Settlements page

**Files:**
- Modify: `src/app/(main)/site/payments/payments-content.tsx`

### Step 6.1 — Import and place the pill above the tabs

- [ ] Add the import at the top of `src/app/(main)/site/payments/payments-content.tsx`:

```tsx
import ScopePill from "@/components/common/ScopePill";
```

- [ ] Place `<ScopePill />` between the `<PageHeader />` and the `{highlightRef && (…)}` back-button block (around line 171). Wrap it in a thin `Paper` so it mirrors the card-edge treatment used on expenses:

```tsx
<PageHeader
  title="Salary Settlements"
  subtitle="Manage daily, market, and contract laborer salary settlements"
/>

<Paper sx={{ mb: 2, overflow: "hidden" }}>
  <ScopePill />
</Paper>

{/* Back button when coming from expenses page via ref code click */}
{highlightRef && (
  <Box sx={{ mb: 2 }}>
    {/* …existing content… */}
  </Box>
)}
```

(When the filter is All Time, `<ScopePill />` returns `null` and the wrapping `<Paper>` collapses to zero height — but to avoid an empty-bordered paper rendering for 1 frame, we suppress the paper entirely in Step 6.2.)

### Step 6.2 — Conditionally render the wrapping paper

- [ ] `isAllTime` is already destructured from `useDateRange()` on line ~65 of this file — no change needed there.

- [ ] Replace the pill wrapper from Step 6.1 with a conditional (so an empty bordered `Paper` never renders on All Time):

```tsx
{!isAllTime && (
  <Paper sx={{ mb: 2, overflow: "hidden" }}>
    <ScopePill />
  </Paper>
)}
```

### Step 6.3 — Visual verification via Playwright

- [ ] Auto-login and:
  1. Open `/site/payments`.
  2. Default (All Time) — no pill, no empty paper.
  3. Click **Week** chip — pill appears in a bordered strip between header and tabs.
  4. Click `✕ View All Time` on pill — pill disappears cleanly.
  5. `playwright_console_logs` — zero errors/warnings.

### Step 6.4 — Commit

- [ ] Commit:

```bash
git add src/app/\(main\)/site/payments/payments-content.tsx
git commit -m "feat(payments): mount ScopePill above salary settlement tabs"
```

---

## Task 7: Mount `<ScopePill />` on the Attendance page

**Files:**
- Modify: `src/app/(main)/site/attendance/attendance-content.tsx`

### Step 7.1 — Import and place in the Period Summary Paper

- [ ] Add the import at the top of `src/app/(main)/site/attendance/attendance-content.tsx`:

```tsx
import ScopePill from "@/components/common/ScopePill";
```

- [ ] Insert `<ScopePill />` as the first child of the Period Summary Paper (currently at line 2740). That `<Paper>` currently has `sx={{ p: { xs: 0.75, sm: 2 }, … }}` — we need the pill to sit flush, so split the padding:

```tsx
<Paper
  sx={{
    overflow: "hidden",
    mb: { xs: 1, sm: 2 },
    flexShrink: 0,
  }}
>
  <ScopePill />
  <Box sx={{ p: { xs: 0.75, sm: 2 } }}>
    {/* …existing mobile collapsible summary and desktop summary content… */}
  </Box>
</Paper>
```

Move every existing child of `<Paper>` into the new inner `<Box>`. Do NOT remove or rearrange any existing content — only wrap it.

### Step 7.2 — Visual verification via Playwright

- [ ] Auto-login and:
  1. Open `/site/attendance`.
  2. The page's own month navigator drives the global date range via `setMonth` — verify the pill IS visible on default, reading e.g. `Showing: Apr 1 – Apr 24`. This is expected because attendance sets a month-range on mount.
  3. Click the pill's `✕ View All Time` — attendance now shows All Time. Summary and cards adjust.
  4. Click the month navigator's `‹` — pill reappears reading the new month's range.
  5. `playwright_console_logs` — zero errors/warnings.

### Step 7.3 — Commit

- [ ] Commit:

```bash
git add src/app/\(main\)/site/attendance/attendance-content.tsx
git commit -m "feat(attendance): mount ScopePill in period summary paper"
```

---

## Task 8: Full end-to-end Playwright sweep per spec §8

**Why:** The spec's acceptance tests run the full redesign across all three pages and prove that everything ties together.

**Files:** None — manual/visual verification only.

### Step 8.1 — Run every spec scenario across every page

For each page (`/site/expenses`, `/site/payments`, `/site/attendance`):

- [ ] Auto-login via `http://localhost:3000/dev-login`.
- [ ] **Default state**: top bar reads "All Time" (or the attendance-page month for that tab); on expenses & payments the ScopePill is absent; table rows sort DESC with most-recent on top.
- [ ] **Preset apply — Week**: click `Week` chip → filter applies → pill reads `Showing: This Week · <dates>` → KPIs update → table filters.
- [ ] **Preset apply — Today**: click `Today` chip → pill reads `Showing: Today` with no range suffix.
- [ ] **Clear via pill**: click `✕ View All Time` → filter clears → pill disappears → top-bar reads "All Time".
- [ ] **Custom range via input**: click `Custom` chip → popover opens with calendar focused → type `Apr 3, 2026` and `Apr 17, 2026` in the two inputs → click **Apply** → pill reads `Showing: Apr 3 – Apr 17`.
- [ ] **Custom range via calendar click**: reopen picker → click a start date → verify "End" input highlights and helper text flips to "Now pick the end date." → click an end date → **Apply**.
- [ ] **Arrow shift**: set "Last 7 days" → click the `‹` arrow next to the picker button → window shifts 7 days earlier → `›` is disabled only when end-date equals today.
- [ ] **Arrow hidden**: switch to All Time — verify `‹` `›` arrows are hidden.
- [ ] **Cross-year range**: set `Dec 20, 2025` → `Jan 5, 2026` via inputs → pill shows `Showing: Dec 20, 2025 – Jan 5, 2026`.
- [ ] **Console clean**: `playwright_console_logs` after each interaction → zero errors and zero warnings.
- [ ] Capture final screenshots of each page in both All-Time and Week-filtered states.
- [ ] `playwright_close` at the end.

### Step 8.2 — Run the production build

- [ ] Run:

```bash
npm run build
```

Expected: build succeeds, no TypeScript errors.

### Step 8.3 — Run unit tests

- [ ] Run:

```bash
npm run test
```

Expected: existing tests still pass; new tests for `computeLabel` (12) and `ScopePill` (4) pass.

### Step 8.4 — Final commit (if any fix-ups surfaced during verification)

- [ ] If Playwright verification surfaced small fix-ups, commit them now:

```bash
git add <paths>
git commit -m "fix(date-range): address issues found in Playwright sweep"
```

- [ ] If the sweep was clean, no commit is needed.

---

## Out-of-scope reminders

- **Summary/table decoupling** — intentionally NOT done (the pill is the scope indicator).
- **MUI X Pro date range picker** — paid SKU; keeping `react-date-range`.
- **Fiscal-year / YTD / quarter presets** — trivial to add later; deliberately skipped this pass.
- **Pages beyond Expenses / Payments / Attendance** — same pattern applies but is out of scope.
- **Timezone handling** — IST assumed; unchanged.
- **2,000-row cap and timeout protection** — unchanged.
