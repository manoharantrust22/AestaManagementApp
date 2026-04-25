# Date-Filter UX Redesign — Attendance Round (Plan v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the **2026-04-25 revisions** to the global date-filter UX redesign — drop the Custom chip from the top bar, give the picker arrows hybrid step semantics that always render, migrate `ScopePill` → `ScopeChip` in the attendance `PageHeader`, kill the standalone `‹ April 2026 ›` navigator, remove the unused Date View dropdown, restructure attendance to a single-scroll layout, and add a tight fullscreen mode.

**Architecture:** Builds on the in-progress branch `feature/global-date-filter-ux-redesign`. The picker rework, `ScopePill` mounts on Expenses/Payments/Attendance, and most label-helper extensions from plan v1 are already shipped. This plan does **not** touch Expenses or Payments — they keep `ScopePill` until the attendance pattern is validated.

**Tech Stack:** Next.js 15, React 18, MUI v7, `react-date-range`, `dayjs`, Vitest + RTL (unit tests), Playwright MCP (visual verification).

**Spec:** [docs/superpowers/specs/2026-04-24-global-date-filter-ux-redesign-design.md](../specs/2026-04-24-global-date-filter-ux-redesign-design.md) (revised 2026-04-25)
**Predecessor plan:** [docs/superpowers/plans/2026-04-24-global-date-filter-ux-redesign.md](2026-04-24-global-date-filter-ux-redesign.md) — Tasks 1–8 already shipped on this branch.

---

## Files Touched

| Path | Nature |
|---|---|
| `src/contexts/DateRangeContext/DateRangeProvider.tsx` | Edit — extend `computeLabel` for calendar months; add `days`; add `stepBackward` / `stepForward` actions |
| `src/contexts/DateRangeContext/DateRangeDataContext.tsx` | Edit — add `days` to context shape |
| `src/contexts/DateRangeContext/DateRangeActionsContext.tsx` | Edit — add `stepBackward` / `stepForward` to actions shape |
| `src/contexts/DateRangeContext/useDateRange.ts` | Edit — re-export new fields |
| `src/contexts/DateRangeContext/DateRangeProvider.label.test.ts` | Edit — add cases for calendar months + `days` + step helpers |
| `src/components/common/DateRangePicker.tsx` | Edit — replace `handleNavigate` with hybrid stepper; arrows always enabled (subject only to bounds) |
| `src/components/layout/MainLayout.tsx` | Edit — delete the Custom chip block |
| `src/components/common/ScopeChip.tsx` | **New** (~80 LoC) |
| `src/components/common/ScopeChip.test.tsx` | **New** |
| `src/app/(main)/site/attendance/attendance-content.tsx` | Edit — mount `ScopeChip` in `PageHeader` `titleChip`; remove ScopePill mount; remove Date View `<Select>`; remove standalone month navigator + `currentViewMonth/handlePrev/handleNext/isCurrentMonth`; wrap table region for single-scroll; add fullscreen state + `<Portal>` + Esc listener |

**Files NOT touched (deferred):**
- `src/app/(main)/site/expenses/page.tsx` — keeps `ScopePill`
- `src/app/(main)/site/payments/payments-content.tsx` — keeps `ScopePill`
- `src/components/common/ScopePill.tsx` — kept in tree; still used by Expenses + Payments

---

## Pre-flight

- [ ] **Verify branch and clean tree**

  Run: `git status` and `git rev-parse --abbrev-ref HEAD`
  Expected: branch is `feature/global-date-filter-ux-redesign`, working tree clean.

- [ ] **Run baseline test suite**

  Run: `npm run test`
  Expected: all tests pass (or, if any fail on `main`, capture the list so we can distinguish pre-existing failures from regressions).

- [ ] **Capture baseline screenshot**

  Use Playwright MCP to load `http://localhost:3000/dev-login` then `/site/attendance` and screenshot. Save as `baseline-attendance.png` for later comparison. (Start the dev server first with `npm run dev` if not already running.)

---

## Task 1: Add `days` field and calendar-month label to `DateRangeContext`

**Why:** `ScopeChip` (Task 6) renders `· N days` and labels like `Mar 2026 · 31 days`. We need the context to expose the day count, and `computeLabel` needs to recognise a calendar-month window so the same label is shared by the top-bar pill and the chip.

**Files:**
- Modify: `src/contexts/DateRangeContext/DateRangeProvider.tsx`
- Modify: `src/contexts/DateRangeContext/DateRangeDataContext.tsx`
- Modify: `src/contexts/DateRangeContext/useDateRange.ts`
- Test: `src/contexts/DateRangeContext/DateRangeProvider.label.test.ts`

- [ ] **Step 1: Add the failing tests**

  Append to `src/contexts/DateRangeContext/DateRangeProvider.label.test.ts`:

  ```ts
  import { describe, it, expect } from "vitest";
  import dayjs from "dayjs";
  import { computeLabel, computeDays } from "./DateRangeProvider";

  describe("computeLabel — calendar months (revised 2026-04-25)", () => {
    it("returns 'Mar 2026' for a full past calendar month", () => {
      const start = dayjs("2026-03-01").startOf("day").toDate();
      const end = dayjs("2026-03-31").endOf("day").toDate();
      expect(computeLabel(start, end)).toBe("Mar 2026");
    });

    it("still returns 'This Month' for the current calendar month ending today", () => {
      const today = dayjs();
      const start = today.startOf("month").toDate();
      const end = today.endOf("day").toDate();
      expect(computeLabel(start, end)).toBe("This Month");
    });

    it("returns 'Last Month' for the previous calendar month (current-month minus one)", () => {
      const today = dayjs();
      const start = today.subtract(1, "month").startOf("month").toDate();
      const end = today.subtract(1, "month").endOf("month").toDate();
      expect(computeLabel(start, end)).toBe("Last Month");
    });
  });

  describe("computeDays", () => {
    it("returns null for All Time (both null)", () => {
      expect(computeDays(null, null)).toBeNull();
    });

    it("returns 1 for a same-day range", () => {
      const d = new Date("2026-04-24");
      expect(computeDays(d, d)).toBe(1);
    });

    it("returns 7 for a 7-day inclusive range", () => {
      expect(
        computeDays(new Date("2026-04-18"), new Date("2026-04-24"))
      ).toBe(7);
    });

    it("returns 25 for Apr 1 → Apr 25", () => {
      expect(
        computeDays(new Date("2026-04-01"), new Date("2026-04-25"))
      ).toBe(25);
    });
  });
  ```

- [ ] **Step 2: Run tests to verify they fail**

  Run: `npm run test -- DateRangeProvider.label`
  Expected: FAIL — `computeDays` is not exported; `Mar 2026` case fails because `computeLabel` doesn't recognise full calendar months yet.

- [ ] **Step 3: Implement `computeDays` and extend `computeLabel`**

  In `src/contexts/DateRangeContext/DateRangeProvider.tsx`, add this export above the existing `computeLabel`:

  ```ts
  export function computeDays(
    startDate: Date | null,
    endDate: Date | null
  ): number | null {
    if (!startDate || !endDate) return null;
    return dayjs(endDate).diff(dayjs(startDate), "day") + 1;
  }
  ```

  Inside `computeLabel`, after the existing "Last Month" block (around line 96, just before the final `return "Custom range"`), insert:

  ```ts
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
  ```

- [ ] **Step 4: Expose `days` through the context**

  In `src/contexts/DateRangeContext/DateRangeDataContext.tsx`, add `days: number | null` to the `DateRangeData` shape (alongside `isAllTime`, `label`).

  In `src/contexts/DateRangeContext/DateRangeProvider.tsx`, in the `dataValue` `useMemo` (around line 187), import `computeDays` (already in the same file), then:

  ```ts
    const days = useMemo(
      () => computeDays(startDate, endDate),
      [startDate, endDate]
    );

    const dataValue = useMemo(
      () => ({
        startDate,
        endDate,
        formatForApi,
        isAllTime,
        label,
        days,
      }),
      [startDate, endDate, formatForApi, isAllTime, label, days]
    );
  ```

  In `src/contexts/DateRangeContext/useDateRange.ts`, destructure `days` from `useDateRangeData()` and include it in the returned object.

- [ ] **Step 5: Run tests to verify they pass**

  Run: `npm run test -- DateRangeProvider.label`
  Expected: all new tests PASS. No regressions.

- [ ] **Step 6: Run the full suite**

  Run: `npm run test`
  Expected: all tests pass. (If `ScopePill.test.tsx` complains about a missing `days` field on the mocked context, add `days: null` to those mocks — quick fix, same file.)

- [ ] **Step 7: Commit**

  ```bash
  git add src/contexts/DateRangeContext/
  git commit -m "feat(date-range): add computeDays helper and calendar-month label"
  ```

---

## Task 2: Hybrid step helpers (`stepBackward` / `stepForward`)

**Why:** Top-bar arrows must always render and use spec §3 hybrid semantics: week-aligned windows step by 7 days, calendar-month windows step by 1 month, everything else (Today, Last 7 days, custom range, All Time) steps by 1 month and re-labels to the navigated month.

**Files:**
- Modify: `src/contexts/DateRangeContext/DateRangeProvider.tsx`
- Modify: `src/contexts/DateRangeContext/DateRangeActionsContext.tsx`
- Modify: `src/contexts/DateRangeContext/useDateRange.ts`
- Test: `src/contexts/DateRangeContext/DateRangeProvider.label.test.ts` (extend with step-helper tests)

- [ ] **Step 1: Write the failing tests**

  Append to `DateRangeProvider.label.test.ts`:

  ```ts
  import { computeStep } from "./DateRangeProvider";

  describe("computeStep — hybrid arrow semantics", () => {
    const today = dayjs();

    it("week-aligned window steps by 7 days backward", () => {
      const start = today.startOf("week").toDate();
      const end = today.endOf("day").toDate();
      const result = computeStep(start, end, "backward", null);
      expect(dayjs(result.start).diff(dayjs(start), "day")).toBe(-7);
      expect(dayjs(result.end).diff(dayjs(end), "day")).toBe(-7);
    });

    it("calendar-month window steps by 1 month backward", () => {
      const start = dayjs("2026-04-01").startOf("day").toDate();
      const end = dayjs("2026-04-30").endOf("day").toDate();
      const result = computeStep(start, end, "backward", null);
      expect(dayjs(result.start).format("YYYY-MM-DD")).toBe("2026-03-01");
      expect(dayjs(result.end).format("YYYY-MM-DD")).toBe("2026-03-31");
    });

    it("non-aligned window (Last 7 days) steps by 1 month backward", () => {
      const start = today.subtract(6, "day").startOf("day").toDate();
      const end = today.endOf("day").toDate();
      const result = computeStep(start, end, "backward", null);
      const expectedStart = today.subtract(1, "month").startOf("month");
      const expectedEnd = today.subtract(1, "month").endOf("month");
      expect(dayjs(result.start).format("YYYY-MM")).toBe(
        expectedStart.format("YYYY-MM")
      );
      expect(dayjs(result.end).format("YYYY-MM-DD")).toBe(
        expectedEnd.format("YYYY-MM-DD")
      );
    });

    it("All Time steps backward to the previous calendar month", () => {
      const result = computeStep(null, null, "backward", null);
      const expectedStart = today.subtract(1, "month").startOf("month");
      expect(dayjs(result.start).format("YYYY-MM")).toBe(
        expectedStart.format("YYYY-MM")
      );
    });

    it("returns null when stepping backward would predate minDate", () => {
      const minDate = dayjs("2026-04-01").toDate();
      const start = dayjs("2026-04-01").startOf("day").toDate();
      const end = dayjs("2026-04-30").endOf("day").toDate();
      const result = computeStep(start, end, "backward", minDate);
      expect(result).toBeNull();
    });

    it("returns null when stepping forward would move past today", () => {
      const today = dayjs();
      const start = today.startOf("month").toDate();
      const end = today.endOf("day").toDate();
      const result = computeStep(start, end, "forward", null);
      expect(result).toBeNull();
    });
  });
  ```

- [ ] **Step 2: Run tests to verify they fail**

  Run: `npm run test -- DateRangeProvider.label`
  Expected: FAIL — `computeStep` not exported.

- [ ] **Step 3: Implement `computeStep`**

  In `src/contexts/DateRangeContext/DateRangeProvider.tsx`, add this export below `computeDays`:

  ```ts
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
        start.isSame(start.startOf("week"), "day") &&
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
  ```

- [ ] **Step 4: Wire `stepBackward` / `stepForward` actions**

  In `src/contexts/DateRangeContext/DateRangeProvider.tsx`, after `setMonth` (around line 174), add:

  ```ts
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
  ```

  Add both to the `actionsValue` `useMemo` and its dep array.

  In `src/contexts/DateRangeContext/DateRangeActionsContext.tsx`, add `stepBackward` and `stepForward` to the actions shape (signature: `(minDate: Date | null) => void`).

  In `src/contexts/DateRangeContext/useDateRange.ts`, destructure both from `useDateRangeActions()` and include them in the returned object.

- [ ] **Step 5: Run tests to verify they pass**

  Run: `npm run test -- DateRangeProvider.label`
  Expected: all tests in the new `computeStep` block PASS.

- [ ] **Step 6: Update existing test mocks for the new actions**

  In `src/components/common/ScopePill.test.tsx`, every `useDateRange` mock object needs `stepBackward: vi.fn()` and `stepForward: vi.fn()` added to satisfy the type. Same pattern as the existing `setMonth: vi.fn()` lines.

  Run: `npm run test`
  Expected: all tests pass.

- [ ] **Step 7: Commit**

  ```bash
  git add src/contexts/DateRangeContext/ src/components/common/ScopePill.test.tsx
  git commit -m "feat(date-range): add hybrid stepBackward/stepForward actions"
  ```

---

## Task 3: Wire DateRangePicker arrows to use hybrid step + always render

**Why:** The current `handleNavigate` in `DateRangePicker.tsx` (around lines 450–479) steps by 1 day, hides arrows when no dates are set, and disables `next` for any range. Replace with the new context actions so arrows behave per spec §3.

**Files:**
- Modify: `src/components/common/DateRangePicker.tsx`

- [ ] **Step 1: Read the current arrow block**

  Open `src/components/common/DateRangePicker.tsx` and read lines 440–545 to confirm the structure (`handleNavigate`, `isNextDisabled`, `isPrevDisabled`, the two `<IconButton>` blocks).

- [ ] **Step 2: Replace `handleNavigate` and the disabled flags**

  Delete the existing `handleNavigate`, `isNextDisabled`, `isPrevDisabled` definitions (lines ~450–479).

  Add `stepBackward, stepForward` to the existing `useDateRange` destructure at line 482:

  ```ts
    const { label: currentLabel, stepBackward, stepForward } = useDateRange();
  ```

  Add new disabled-state computations (memoised, since this component re-renders often):

  ```ts
    const today = dayjs().endOf("day");
    const minDayjs = minDate ? dayjs(minDate) : null;

    const isPrevDisabled = useMemo(() => {
      if (!startDate || !endDate) {
        // From All Time, stepping backward goes to (today - 1 month). Always allowed unless minDate forbids.
        if (!minDayjs) return false;
        return dayjs().subtract(1, "month").startOf("month").isBefore(minDayjs);
      }
      // For an active range, ask computeStep — null means out of bounds.
      return computeStep(startDate, endDate, "backward", minDate ?? null) === null;
    }, [startDate, endDate, minDate, minDayjs]);

    const isNextDisabled = useMemo(() => {
      return computeStep(startDate, endDate, "forward", minDate ?? null) === null;
    }, [startDate, endDate, minDate]);
  ```

  Add the import at the top of the file:

  ```ts
  import { computeStep } from "@/contexts/DateRangeContext/DateRangeProvider";
  import { useMemo } from "react";  // if not already imported
  ```

  Replace the two `<IconButton>` `onClick` handlers (lines ~491 and ~536):

  ```tsx
  // Prev
  onClick={() => stepBackward(minDate ?? null)}

  // Next
  onClick={() => stepForward(minDate ?? null)}
  ```

  Remove the `display: { xs: "none", sm: "flex" }` from both `<IconButton>` `sx` blocks — arrows should now show on mobile too. (If mobile space is tight, keep the responsive hide but flag for follow-up.) Decision for this round: **keep them hidden on mobile** — the change in this task is semantics, not visibility. Leave the responsive hide in place.

- [ ] **Step 3: Run unit tests**

  Run: `npm run test -- DateRangePicker`
  Expected: PASS (or "no tests found" — there are no DateRangePicker unit tests today, so behaviour is verified via Playwright in Task 12).

- [ ] **Step 4: Smoke-test in dev**

  Start dev server (`npm run dev`) if not running. Open `/site/attendance` via Playwright (`/dev-login` first), select "Month" chip, click `‹` once. Expect the top-bar pill to read `Mar 2026`. Click `‹` again — `Feb 2026`. Click `›` twice — back to `This Month`. Switch to "Week", click `‹` — window slides 7 days back, top-bar pill keeps a week-style label.

- [ ] **Step 5: Commit**

  ```bash
  git add src/components/common/DateRangePicker.tsx
  git commit -m "feat(date-range): picker arrows use hybrid step semantics"
  ```

---

## Task 4: Lift picker-open state into context, drop the Custom chip

**Why:** Two coupled changes:
1. Spec §3 — Custom chip is redundant; remove it.
2. Spec §5a.2 — `ScopeChip` must open the picker when clicked, including from inside fullscreen mode where the top bar isn't visible. The picker-open trigger currently lives as `openPickerCustom` local state in `MainLayout`. Lift it into `DateRangeContext` so `ScopeChip` (Task 5) can call it.

**Files:**
- Modify: `src/contexts/DateRangeContext/DateRangeProvider.tsx`
- Modify: `src/contexts/DateRangeContext/DateRangeDataContext.tsx`
- Modify: `src/contexts/DateRangeContext/DateRangeActionsContext.tsx`
- Modify: `src/contexts/DateRangeContext/useDateRange.ts`
- Modify: `src/components/layout/MainLayout.tsx`

- [ ] **Step 1: Add `pickerOpen` and `openPicker` / `closePicker` to context**

  In `DateRangeProvider.tsx`:

  ```ts
  const [pickerOpen, setPickerOpen] = useState(false);

  const openPicker = useCallback(() => setPickerOpen(true), []);
  const closePicker = useCallback(() => setPickerOpen(false), []);
  ```

  Add `pickerOpen` to `dataValue`'s memoised object and dep array.
  Add `openPicker` and `closePicker` to `actionsValue`'s memoised object and dep array.

  In `DateRangeDataContext.tsx`, add `pickerOpen: boolean` to the shape.
  In `DateRangeActionsContext.tsx`, add `openPicker: () => void` and `closePicker: () => void` to the shape.
  In `useDateRange.ts`, destructure `pickerOpen` from `useDateRangeData()` and `openPicker`, `closePicker` from `useDateRangeActions()`. Add all three to the returned object.

- [ ] **Step 2: Replace `openPickerCustom` local state with context reads in `MainLayout`**

  In `src/components/layout/MainLayout.tsx`:

  - Delete `const [openPickerCustom, setOpenPickerCustom] = useState(false);` at line 442.
  - Add `pickerOpen, closePicker` to the existing `useDateRange()` destructure (find the existing one and extend it).
  - Update the `<DateRangePicker>` props (lines 1103–1113):

    ```tsx
    <DateRangePicker
      startDate={startDate}
      endDate={endDate}
      onChange={(start, end) => {
        setDateRange(start, end);
        closePicker();
      }}
      minDate={selectedSite?.start_date ? new Date(selectedSite.start_date) : undefined}
      openOnMount={pickerOpen}
      onPopoverClose={() => closePicker()}
    />
    ```

- [ ] **Step 3: Delete the Custom `<Chip>` block**

  In `MainLayout.tsx`, delete lines 1155–1165 (the `<Chip label="Custom" ... />` block).

- [ ] **Step 4: Update existing test mocks for the new actions**

  In `src/components/common/ScopePill.test.tsx`, every `useDateRange` mock object needs:
  - `pickerOpen: false`
  - `openPicker: vi.fn()`
  - `closePicker: vi.fn()`

  Same pattern as the `setMonth` / `stepBackward` additions earlier.

- [ ] **Step 5: Run unit tests + build**

  Run: `npm run test && npm run build`
  Expected: all pass.

- [ ] **Step 6: Smoke-test in dev**

  Reload `/site/attendance`. Confirm the top bar shows `[‹] <pill> [›]   Today  Week  Month` — no Custom chip. Open the picker via the pill — calendar appears, Apply works, picker closes.

- [ ] **Step 7: Commit**

  ```bash
  git add src/contexts/DateRangeContext/ src/components/layout/MainLayout.tsx src/components/common/ScopePill.test.tsx
  git commit -m "feat(date-range): lift picker-open into context, remove Custom chip"
  ```

---

## Task 5: Create `<ScopeChip />` component

**Why:** Spec §5 — `ScopeChip` lives in the `PageHeader` `titleChip` slot. Always renders. All Time → `📅 All Time` (no `×`); any other range → `📅 <range> · <N days>` with `×`.

**Files:**
- Create: `src/components/common/ScopeChip.tsx`
- Test: `src/components/common/ScopeChip.test.tsx`

- [ ] **Step 1: Write the failing tests**

  Create `src/components/common/ScopeChip.test.tsx`:

  ```tsx
  import React from "react";
  import { describe, it, expect, vi } from "vitest";
  import { render, screen, fireEvent } from "@testing-library/react";
  import ScopeChip from "./ScopeChip";
  import * as DateRangeModule from "@/contexts/DateRangeContext";

  function mockUseDateRange(overrides: Partial<ReturnType<typeof DateRangeModule.useDateRange>>) {
    vi.spyOn(DateRangeModule, "useDateRange").mockReturnValue({
      startDate: null,
      endDate: null,
      label: "All Time",
      isAllTime: true,
      days: null,
      pickerOpen: false,
      setAllTime: vi.fn(),
      setDateRange: vi.fn(),
      setToday: vi.fn(),
      setLastWeek: vi.fn(),
      setLastMonth: vi.fn(),
      setMonth: vi.fn(),
      stepBackward: vi.fn(),
      stepForward: vi.fn(),
      openPicker: vi.fn(),
      closePicker: vi.fn(),
      formatForApi: () => ({ dateFrom: null, dateTo: null }),
      ...overrides,
    } as ReturnType<typeof DateRangeModule.useDateRange>);
  }

  describe("ScopeChip", () => {
    it("renders 'All Time' with no clear button when isAllTime is true", () => {
      mockUseDateRange({ isAllTime: true, label: "All Time" });
      render(<ScopeChip />);
      expect(screen.getByText(/All Time/i)).toBeInTheDocument();
      expect(screen.queryByLabelText(/clear date filter/i)).toBeNull();
    });

    it("renders the range, day count, and clear button when a filter is active", () => {
      mockUseDateRange({
        isAllTime: false,
        startDate: new Date("2026-04-01"),
        endDate: new Date("2026-04-25"),
        label: "This Month",
        days: 25,
      });
      render(<ScopeChip />);
      expect(screen.getByText(/Apr 1.*Apr 25/i)).toBeInTheDocument();
      expect(screen.getByText(/25 days/i)).toBeInTheDocument();
      expect(
        screen.getByLabelText(/clear date filter and show all time/i)
      ).toBeInTheDocument();
    });

    it("renders single-day labels without a date range dash", () => {
      mockUseDateRange({
        isAllTime: false,
        startDate: new Date("2026-04-24"),
        endDate: new Date("2026-04-24"),
        label: "Today",
        days: 1,
      });
      render(<ScopeChip />);
      expect(screen.queryByText("–")).toBeNull();
      expect(screen.getByText(/1 day/i)).toBeInTheDocument();
    });

    it("calls setAllTime when the clear button is clicked", () => {
      const setAllTime = vi.fn();
      mockUseDateRange({
        isAllTime: false,
        startDate: new Date("2026-04-17"),
        endDate: new Date("2026-04-24"),
        label: "Last 7 days",
        days: 8,
        setAllTime,
      });
      render(<ScopeChip />);
      fireEvent.click(
        screen.getByLabelText(/clear date filter and show all time/i)
      );
      expect(setAllTime).toHaveBeenCalledTimes(1);
    });

    it("calls openPicker when the chip body is clicked", () => {
      const openPicker = vi.fn();
      mockUseDateRange({
        isAllTime: false,
        startDate: new Date("2026-04-17"),
        endDate: new Date("2026-04-24"),
        label: "Last 7 days",
        days: 8,
        openPicker,
      });
      render(<ScopeChip />);
      fireEvent.click(screen.getByRole("status"));
      expect(openPicker).toHaveBeenCalledTimes(1);
    });

    it("calls openPicker when the All Time chip is clicked", () => {
      const openPicker = vi.fn();
      mockUseDateRange({ isAllTime: true, label: "All Time", openPicker });
      render(<ScopeChip />);
      fireEvent.click(screen.getByRole("status"));
      expect(openPicker).toHaveBeenCalledTimes(1);
    });

    it("crosses-year ranges include both years", () => {
      mockUseDateRange({
        isAllTime: false,
        startDate: new Date("2025-12-20"),
        endDate: new Date("2026-01-05"),
        label: "Custom range",
        days: 17,
      });
      render(<ScopeChip />);
      expect(screen.getByText(/Dec 20, 2025/)).toBeInTheDocument();
      expect(screen.getByText(/Jan 5, 2026/)).toBeInTheDocument();
    });
  });
  ```

- [ ] **Step 2: Run tests to verify they fail**

  Run: `npm run test -- ScopeChip`
  Expected: FAIL — file does not exist.

- [ ] **Step 3: Implement `ScopeChip`**

  Create `src/components/common/ScopeChip.tsx`:

  ```tsx
  "use client";

  import React from "react";
  import { Chip, IconButton } from "@mui/material";
  import {
    CalendarMonth as CalendarMonthIcon,
    Close as CloseIcon,
  } from "@mui/icons-material";
  import dayjs from "dayjs";
  import { useDateRange } from "@/contexts/DateRangeContext";

  function formatRange(startDate: Date, endDate: Date): string {
    const start = dayjs(startDate);
    const end = dayjs(endDate);
    if (start.isSame(end, "day")) {
      return start.format("MMM D, YYYY");
    }
    if (start.year() !== end.year()) {
      return `${start.format("MMM D, YYYY")} – ${end.format("MMM D, YYYY")}`;
    }
    return `${start.format("MMM D")} – ${end.format("MMM D")}`;
  }

  export default function ScopeChip() {
    const { isAllTime, startDate, endDate, days, setAllTime, openPicker } =
      useDateRange();

    const isFiltered = !isAllTime && startDate && endDate && days != null;

    return (
      <Chip
        icon={<CalendarMonthIcon fontSize="small" />}
        label={
          isFiltered
            ? `${formatRange(startDate, endDate)} · ${days === 1 ? "1 day" : `${days} days`}`
            : "All Time"
        }
        size="small"
        color={isFiltered ? "primary" : "default"}
        variant="outlined"
        role="status"
        clickable
        onClick={() => openPicker()}
        aria-label={isFiltered ? "Open date filter" : "Date filter: All Time, click to change"}
        deleteIcon={
          isFiltered ? (
            <IconButton
              size="small"
              aria-label="Clear date filter and show all time"
              sx={{ p: 0 }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          ) : undefined
        }
        onDelete={isFiltered ? () => setAllTime() : undefined}
        sx={{
          height: 28,
          fontWeight: 500,
          maxWidth: { xs: 220, sm: "none" },
          "& .MuiChip-label": {
            overflow: "hidden",
            textOverflow: "ellipsis",
          },
        }}
      />
    );
  }
  ```

  Notes:
  - `onDelete` is omitted when not filtered, so MUI hides the delete icon entirely (no `×` for All Time state).
  - The custom `deleteIcon={<IconButton ...>}` carries the `aria-label` reliably across MUI minor versions (avoids the typing pitfalls of `slotProps`).
  - `clickable + onClick={() => openPicker()}` makes the whole chip a target for opening the picker.

- [ ] **Step 4: Run tests to verify they pass**

  Run: `npm run test -- ScopeChip`
  Expected: all tests PASS.

- [ ] **Step 5: Run build to catch TypeScript errors from the cast**

  Run: `npm run build`
  Expected: build succeeds. If `deleteIconProps` errors, switch to `slotProps={{ deleteIcon: { ... } }}` and re-run.

- [ ] **Step 6: Commit**

  ```bash
  git add src/components/common/ScopeChip.tsx src/components/common/ScopeChip.test.tsx
  git commit -m "feat(date-range): add ScopeChip component for PageHeader placement"
  ```

---

## Task 6: Mount `<ScopeChip />` in attendance `PageHeader`; remove ScopePill from attendance summary

**Why:** Spec §5.5 — `ScopeChip` replaces both the existing `15 days` informational chip in the title row AND the previously-mounted `<ScopePill />` strip on the summary card.

**Files:**
- Modify: `src/app/(main)/site/attendance/attendance-content.tsx`

- [ ] **Step 1: Add the import**

  Near the other common-component imports in `attendance-content.tsx`, add:

  ```ts
  import ScopeChip from "@/components/common/ScopeChip";
  ```

- [ ] **Step 2: Replace the `titleChip` value in `PageHeader`**

  In `attendance-content.tsx` around line 2658, the existing `titleChip` prop is:

  ```tsx
  titleChip={
    dateSummaries.length > 0 ? (
      <Chip
        label={`${dateSummaries.length} days`}
        size="small"
        color="primary"
        sx={{ height: 22, fontSize: "0.7rem", fontWeight: 500 }}
      />
    ) : null
  }
  ```

  Replace with:

  ```tsx
  titleChip={<ScopeChip />}
  ```

  (`dateSummaries.length` count is no longer surfaced in this slot — the chip renders the date-range day count instead, which is the more meaningful number for "what scope am I viewing".)

- [ ] **Step 3: Remove the `<ScopePill />` mount from the summary card**

  Search the file for `ScopePill`. The mount was added in commit `943a9ec` ("feat(attendance): mount ScopePill in period summary paper"). Remove the `<ScopePill />` element AND its import. Do **not** delete `src/components/common/ScopePill.tsx` itself — Expenses and Payments still use it.

  ```bash
  grep -n "ScopePill" src/app/\(main\)/site/attendance/attendance-content.tsx
  ```

  Delete every match in this file (the import line + the JSX element).

- [ ] **Step 4: Smoke-test in dev**

  Reload `/site/attendance`. Confirm:
  - Title row shows `[←] Attendance  [📅 Apr 1 – Apr 25 · 25 days  ×]` (or `[📅 All Time]` if no filter).
  - The previous `15 days` chip is gone.
  - The previous `Showing: …` strip on the summary Paper is gone.

- [ ] **Step 5: Commit**

  ```bash
  git add src/app/\(main\)/site/attendance/attendance-content.tsx
  git commit -m "feat(attendance): replace title chip + ScopePill with ScopeChip in PageHeader"
  ```

---

## Task 7: Remove standalone `‹ April 2026 ›` month navigator from attendance

**Why:** Spec §5 — top-bar arrows do all the stepping; the page-internal navigator is redundant.

**Files:**
- Modify: `src/app/(main)/site/attendance/attendance-content.tsx`

- [ ] **Step 1: Delete the `MONTH NAVIGATION` JSX block**

  In `attendance-content.tsx`, delete lines 2692–2720 (the `{/* ===== MONTH NAVIGATION ===== */}` `<Box>` … `</Box>` block).

- [ ] **Step 2: Delete the helper hooks**

  Delete the block at lines 339–352:

  ```ts
  // Month navigation helpers
  const currentViewMonth = startDate ? dayjs(startDate) : dayjs();
  const handlePrevMonth = useCallback(...);
  const handleNextMonth = useCallback(...);
  const isCurrentMonth = currentViewMonth.isSame(dayjs(), "month");
  ```

  Also delete the related `useEffect` block at lines 330–337 that defaulted `setMonth(now.year(), now.month())` when `isAllTime` — defaulting now happens in `DateRangeProvider`'s init effect (set to This Month for first-time visitors).

- [ ] **Step 3: Verify no remaining references**

  Run: `grep -n "currentViewMonth\|handlePrevMonth\|handleNextMonth\|isCurrentMonth" src/app/\(main\)/site/attendance/attendance-content.tsx`
  Expected: no matches.

- [ ] **Step 4: Build to catch unused imports**

  Run: `npm run build`
  Expected: succeeds. If `ChevronLeftIcon` / `ChevronRightIcon` are now unused, delete them from the imports at lines 79–80.

- [ ] **Step 5: Smoke-test**

  Reload `/site/attendance`. Confirm the title row is followed directly by the summary KPI card — no `‹ April 2026 ›` row.

- [ ] **Step 6: Commit**

  ```bash
  git add src/app/\(main\)/site/attendance/attendance-content.tsx
  git commit -m "refactor(attendance): remove standalone month navigator (top-bar arrows handle this)"
  ```

---

## Task 8: Remove the Date View / Detailed View dropdown

**Why:** Spec §5a.3 — users only ever pick Date View; remove the dropdown but leave the `viewMode === "detailed"` JSX as dead code.

**Files:**
- Modify: `src/app/(main)/site/attendance/attendance-content.tsx`

- [ ] **Step 1: Delete the `<Select>` from `actions`**

  In `attendance-content.tsx` lines 2669–2689 (the `actions` prop of `PageHeader`), delete the `<Select>...</Select>` block including its wrapping `<Box>`. Leave the `actions` prop itself in place — it will be re-populated with the fullscreen icon in Task 11.

  After this task, the prop should look like:

  ```tsx
  actions={null}
  ```

- [ ] **Step 2: Confirm `viewMode` and `setViewMode` are still wired**

  Run: `grep -n "viewMode" src/app/\(main\)/site/attendance/attendance-content.tsx | head`
  Expected: still references at the original useState (line ~383) and the JSX branch (line ~3156). Don't delete them — they stay as dead code per spec §10.

- [ ] **Step 3: Build**

  Run: `npm run build`
  Expected: succeeds. If `Select` / `MenuItem` are now unused in this file, delete from imports.

- [ ] **Step 4: Smoke-test**

  Reload `/site/attendance`. Confirm no Date View dropdown in the top-right of the page.

- [ ] **Step 5: Commit**

  ```bash
  git add src/app/\(main\)/site/attendance/attendance-content.tsx
  git commit -m "refactor(attendance): remove unused Date View / Detailed View dropdown"
  ```

---

## Task 9: Single-scroll attendance layout (kill the page scrollbar)

**Why:** Spec §5a.1 — the document should not scroll vertically; only the table region should scroll.

**Files:**
- Modify: `src/app/(main)/site/attendance/attendance-content.tsx`

- [ ] **Step 1: Identify the table-wrapping element**

  The table region in attendance starts after the summary KPI card. Run:

  ```bash
  grep -n "===== HEADER ROW 2\|<TableContainer\|<Table>" src/app/\(main\)/site/attendance/attendance-content.tsx | head -10
  ```

  Identify the outermost `<Box>` (or `<TableContainer>`) that wraps the date-row table. This is the element that needs to gain `flex: 1, minHeight: 0, overflow: 'auto'`.

- [ ] **Step 2: Add `flexShrink: 0` to the header rows**

  Confirm `PageHeader` and the summary KPI card are direct children of the outer `flexDirection: column` `Box` (lines 2644–2652). If they are not already inside a `flexShrink: 0` wrapper, wrap them:

  ```tsx
  <Box sx={{ flexShrink: 0 }}>
    <PageHeader ... />
  </Box>
  <Box sx={{ flexShrink: 0 }}>
    {/* summary KPI card */}
  </Box>
  ```

  Or, simpler: add `flexShrink: 0` directly to the existing wrappers.

- [ ] **Step 3: Wrap the table region**

  Wrap the outermost table-region `<Box>` (the one identified in Step 1) — or modify its existing `sx` — to add:

  ```tsx
  sx={{
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
    // ... preserve any existing styles
  }}
  ```

  `minHeight: 0` is critical inside a flex column — without it, flex items refuse to shrink and the page overflows anyway.

- [ ] **Step 4: Visual verification with Playwright**

  Use Playwright MCP at viewport `1920 x 1080`:
  1. `playwright_browser_resize` to 1920×1080.
  2. Load `/site/attendance`.
  3. `playwright_browser_evaluate` with `() => document.documentElement.scrollHeight <= window.innerHeight + 1`.
  4. Expected: `true` (no document scroll). If `false`, check which element is overflowing — usually a missing `minHeight: 0` somewhere up the flex chain.

- [ ] **Step 5: Commit**

  ```bash
  git add src/app/\(main\)/site/attendance/attendance-content.tsx
  git commit -m "feat(attendance): single-scroll layout — only table scrolls, not the page"
  ```

---

## Task 10: Tight fullscreen mode

**Why:** Spec §5a.2 — fullscreen-expand icon in `PageHeader` actions; tight mode covers the whole viewport including app sidebar + top bar.

**Files:**
- Modify: `src/app/(main)/site/attendance/attendance-content.tsx`

- [ ] **Step 1: Add fullscreen state and the toggle button**

  Add at the top of the component, near the other `useState` hooks:

  ```ts
  const [isFullscreen, setIsFullscreen] = useState(false);
  ```

  Add the imports:

  ```ts
  import { Portal, IconButton, Tooltip } from "@mui/material";
  import {
    Fullscreen as FullscreenIcon,
    FullscreenExit as FullscreenExitIcon,
  } from "@mui/icons-material";
  ```

  Replace the `actions={null}` left from Task 8 with:

  ```tsx
  actions={
    <Tooltip title={isFullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"}>
      <IconButton
        onClick={() => setIsFullscreen((v) => !v)}
        size="small"
        aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
      >
        {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
      </IconButton>
    </Tooltip>
  }
  ```

- [ ] **Step 2: Esc-key listener**

  Below the `useState`, add:

  ```ts
  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFullscreen]);
  ```

- [ ] **Step 3: Wrap the return tree in a conditional `<Portal>`**

  Refactor the existing top-level `return (<Box ...>...</Box>)` so the `<Box>` content lives in a fragment / variable, then wrap it conditionally:

  ```tsx
  const content = (
    <Box sx={{ /* existing top-level styles */ }}>
      {/* existing children */}
    </Box>
  );

  return isFullscreen ? (
    <Portal>
      <Box
        sx={{
          position: "fixed",
          inset: 0,
          zIndex: (theme) => theme.zIndex.modal + 1,
          bgcolor: "background.default",
          display: "flex",
          flexDirection: "column",
          height: "100vh",
        }}
      >
        {content}
      </Box>
    </Portal>
  ) : (
    content
  );
  ```

  **Subtree identity:** the same `content` JSX is rendered in both branches, so React keeps the component tree mounted across the toggle — `useState` and React Query caches inside `content` survive the transition.

- [ ] **Step 4: Adjust the inner `<Box>` height for fullscreen**

  In fullscreen, the inner `<Box>` should claim the full portal height (the `100vh - 56px/64px` calc no longer applies because there's no top bar above it). Change:

  ```tsx
  height: { xs: "calc(100vh - 56px)", sm: "calc(100vh - 64px)" },
  ```

  to:

  ```tsx
  height: isFullscreen
    ? "100%"
    : { xs: "calc(100vh - 56px)", sm: "calc(100vh - 64px)" },
  ```

- [ ] **Step 5: Visual verification with Playwright**

  1. Load `/site/attendance`.
  2. Click the fullscreen icon. Confirm sidebar + top bar disappear.
  3. Click the collapse icon. Confirm normal layout returns.
  4. Click fullscreen again, press `Esc`. Confirm exit.
  5. In fullscreen, click `ScopeChip` → picker opens above the portal. Apply a range. Confirm range applies and chip updates, still in fullscreen.

- [ ] **Step 6: Commit**

  ```bash
  git add src/app/\(main\)/site/attendance/attendance-content.tsx
  git commit -m "feat(attendance): add tight fullscreen mode with Esc to exit"
  ```

---

## Task 11: Full Playwright sweep per spec §8

**Why:** Spec §8 lists 18 scenarios that must all pass cleanly. Run them end-to-end and capture screenshots.

**Files:** none — pure Playwright verification.

- [ ] **Step 1: Start dev server**

  Run: `npm run dev` (background)
  Wait for `Ready in <ms>` then proceed.

- [ ] **Step 2: Auto-login**

  Playwright MCP: `playwright_browser_navigate` to `http://localhost:3000/dev-login`. Wait for redirect to dashboard.

- [ ] **Step 3: Run scenarios 1–18 from spec §8**

  Execute each scenario. After each, capture a screenshot named `s<N>-<short-label>.png` in the project root, and run `playwright_browser_console_messages` — fail the run if any error/warning appears.

  Scenarios are listed in `docs/superpowers/specs/2026-04-24-global-date-filter-ux-redesign-design.md` §8.

- [ ] **Step 4: Close the browser**

  Playwright MCP: `playwright_browser_close`.

- [ ] **Step 5: Cross-check against spec §11 success criteria**

  Walk down §11 line by line. Each must be ✓. List any ✗ as a follow-up issue.

- [ ] **Step 6: Commit screenshots and any small fixes**

  ```bash
  git add s*.png src/
  git commit -m "test(attendance): full Playwright sweep — spec §8 scenarios all pass"
  ```

---

## Task 12: Cleanup — remove debugging artifacts from branch root

**Why:** Branch root has ~25 `.png` and `.md` debugging files committed in `0c76253` ("chore(scratch): add debugging artifacts"). Those are noise once this round is verified.

**Files:** root-level `*.png` and `*.md` from the scratch commit.

- [ ] **Step 1: Identify scratch files**

  Run:

  ```bash
  git diff --name-only main...HEAD | grep -v '^src/\|^docs/\|^supabase/\|^cloudflare-proxy/\|^\.mcp\.json'
  ```

- [ ] **Step 2: Confirm with user before deletion**

  These were committed deliberately — confirm with the user that they want them removed before running `git rm`. **Do not delete without explicit confirmation.**

- [ ] **Step 3: If approved, remove and commit**

  ```bash
  git rm <files-from-step-1>
  git commit -m "chore: remove debugging artifacts from picker investigation"
  ```

---

## Out-of-scope reminders

Per spec §10, this round does **NOT** include:
- `ScopeChip` / single-scroll / fullscreen on `/site/expenses` and `/site/payments`.
- Deleting `src/components/common/ScopePill.tsx` (still used by expenses/payments).
- Deleting the `viewMode === "detailed"` JSX branch in attendance.
- MUI X Pro migration, fiscal-year presets, timezone changes.

These are explicit follow-ups for a future plan once attendance is validated in production.
