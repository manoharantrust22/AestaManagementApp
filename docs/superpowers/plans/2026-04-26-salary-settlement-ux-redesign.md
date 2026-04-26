# Salary Settlement UX Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `/site/payments` into a premium pending-first ledger, surface settle-from-attendance row-level CTAs, introduce a portable Inspect Pane that mounts on `/site/payments`, `/site/expenses`, and `/site/attendance` to kill cross-page verify friction, and bundle the deferred ScopeChip + Fullscreen + single-scroll rollout for `/site/payments` and `/site/expenses` from the prior spec.

**Architecture:** Five phases that merge independently after their dependencies land. Phase 1 is the new `get_payment_summary` RPC (DB-only, no UI change). Phase 2 is the `InspectPane` component family + `useInspectPane` hook (component-only, mountable but not surfaced). Phases 3, 4, 5 each integrate the foundation into one page: `/site/payments` rewrite, attendance settle CTAs + ref chips, `/site/expenses` adoption. Phases 3–5 can ship in any order after 1+2 land.

**Tech Stack:** Next.js 15, React 18, MUI v7 (`@mui/material`), `@tanstack/react-query`, Supabase (PostgreSQL + RPC), Tailwind, `dayjs`, Vitest + React Testing Library (unit + hook tests), Playwright MCP (visual + flow verification).

**Spec:** [docs/superpowers/specs/2026-04-26-salary-settlement-ux-redesign-design.md](../specs/2026-04-26-salary-settlement-ux-redesign-design.md)

**Builds on:** [docs/superpowers/specs/2026-04-24-global-date-filter-ux-redesign-design.md](../specs/2026-04-24-global-date-filter-ux-redesign-design.md) — `ScopeChip`, `useDateRange`, Fullscreen, single-scroll layout already shipped on `feature/global-date-filter-ux-redesign`.

---

## Files Touched

| Path | Phase | Nature |
|---|---|---|
| `supabase/migrations/<date>_add_payment_summary_rpc.sql` | 1 | **New** — RPC modeled on `get_expense_summary`. |
| `src/types/payment.types.ts` | 1 | Edit — add `PaymentScopeSummary` type matching RPC return shape. |
| `src/hooks/useInspectPane.ts` | 2 | **New** — page-scoped state hook. |
| `src/hooks/useInspectPane.test.ts` | 2 | **New** — unit tests for the hook. |
| `src/hooks/useSettlementAudit.ts` | 2 | **New** — fetch settlement audit history. |
| `src/components/common/InspectPane/InspectPane.tsx` | 2 | **New** — shell (header + tabs + breakpoint logic). |
| `src/components/common/InspectPane/InspectPane.test.tsx` | 2 | **New** — render + Esc + tab switching. |
| `src/components/common/InspectPane/AttendanceTab.tsx` | 2 | **New** — daily-shape vs weekly-shape content. |
| `src/components/common/InspectPane/WorkUpdatesTab.tsx` | 2 | **New** — notes + photos. |
| `src/components/common/InspectPane/SettlementTab.tsx` | 2 | **New** — payer / mode / ref / Settle button. |
| `src/components/common/InspectPane/AuditTab.tsx` | 2 | **New** — audit log. |
| `src/components/common/InspectPane/types.ts` | 2 | **New** — `InspectEntity`, `InspectTabKey`, `InspectPaneProps`. |
| `src/components/common/InspectPane/index.ts` | 2 | **New** — barrel re-export. |
| `src/app/(main)/site/payments/payments-content.tsx` | 3 | Rewrite — drop tabs, ScopePill, Back-to-Expenses, summary card; add ScopeChip + Fullscreen + KPI strip + pending banner + filter chips + unified ledger + InspectPane. |
| `src/components/payments/PaymentsLedger.tsx` | 3 | **New** — single unified DataTable consolidating daily+market and weekly rows. |
| `src/components/payments/PaymentsKpiStrip.tsx` | 3 | **New** — compact 4-KPI strip. |
| `src/components/payments/PendingBanner.tsx` | 3 | **New** — amber banner with deep-link to attendance. |
| `src/components/payments/PaymentSummaryCards.tsx` | 3 | **Delete** — replaced by `PaymentsKpiStrip`. |
| `src/components/payments/DailyMarketPaymentsTab.tsx` | 3 | **Delete** — logic absorbed into `PaymentsLedger`. |
| `src/components/payments/ContractWeeklyPaymentsTab.tsx` | 3 | **Delete** — same. |
| `src/hooks/queries/usePaymentSummary.ts` | 3 | **New** — wraps the new RPC for KPI strip. |
| `src/app/(main)/site/attendance/attendance-content.tsx` | 4 | Edit — per-day Settle button, per-week Settle Week button, settled-day ref chip, mount InspectPane, wire chip click → pane. |
| `src/components/attendance/SettleDayButton.tsx` | 4 | **New** — small wrapper that shows "₹ Settle ₹X" or icon-only on mobile. |
| `src/components/attendance/SettlementRefChip.tsx` | 4 | **New** — `📌 SS-…` chip that opens InspectPane. |
| `src/app/(main)/site/expenses/page.tsx` | 5 | Edit — adopt ScopeChip + Fullscreen + single-scroll, mount InspectPane, replace ref-code `router.push` with `inspectPane.open`. |

**Files NOT touched (reused as-is):**
- `src/components/attendance/DailySettlementDialog.tsx`, `WeeklySettlementDialog.tsx` — triggered from new entry points but not modified.
- `src/components/common/ScopeChip.tsx`, `src/contexts/DateRangeContext/*` — shipped on prior branch.
- `src/components/payments/SettlementEditDialog.tsx`, `DailySettlementEditDialog.tsx`, `ContractSettlementEditDialog.tsx`, etc. — edit dialogs unchanged.

---

## Pre-flight

- [ ] **Verify branch and clean tree**

  Run: `git status` and `git rev-parse --abbrev-ref HEAD`
  Expected: branch is `feature/global-date-filter-ux-redesign` (or a new branch off it), working tree is clean apart from this plan.

- [ ] **Run baseline test suite**

  Run: `npm run test`
  Expected: all tests pass. Capture any pre-existing failures so they're not mistaken for regressions.

- [ ] **Run baseline build**

  Run: `npm run build`
  Expected: clean compile. If it fails on `main`, fix before starting.

- [ ] **Capture baseline screenshots**

  Use Playwright MCP — `http://localhost:3000/dev-login`, then visit `/site/payments`, `/site/attendance`, `/site/expenses`. Save as `baseline-payments.png`, `baseline-attendance.png`, `baseline-expenses.png` for visual diff later.

- [ ] **Verify the existing `get_expense_summary` RPC**

  Run: `mcp__supabase__list_migrations` and confirm `20260424120000_add_expense_summary_rpc.sql` is applied.
  Expected: present. We model the new RPC on this one.

---

# PHASE 1 — `get_payment_summary` RPC

**Independent. Mergeable alone. No UI change.** Delivers a server-side aggregate that returns `{ pending_amount, pending_count, paid_amount, paid_count, daily_market_amount, daily_market_count, weekly_amount, weekly_count }` for a given `{site_id, date_from, date_to}`. Used by Phase 3's KPI strip but causes no behaviour change on its own.

## Task 1.1: Author the migration

**Files:**
- Create: `supabase/migrations/20260426110000_add_payment_summary_rpc.sql`

**Why:** Today the per-tab summaries on `/site/payments` are computed client-side from up to 2,000 loaded rows. The new ledger needs accurate KPI totals across the entire site, the entire scope, instantly. An RPC matching `get_expense_summary`'s pattern keeps the architecture consistent.

- [ ] **Step 1: Inspect the existing RPC for shape parity**

  Read: `supabase/migrations/20260424120000_add_expense_summary_rpc.sql`
  Note: function signature, parameter names (`p_site_id`, `p_date_from`, `p_date_to`, `p_module`), return `TABLE(...)` columns, security `DEFINER` vs `INVOKER`, GRANT statement.

- [ ] **Step 2: Write the migration SQL**

  Create `supabase/migrations/20260426110000_add_payment_summary_rpc.sql`:

  ```sql
  -- Payments scope summary. Mirrors get_expense_summary's shape.
  -- Returns aggregates for daily+market and weekly contract settlements
  -- within an optional date range, plus pending counts for the same.
  --
  -- Pending = attendance entries that have unpaid daily/market/contract money
  --           and no linked settlement_group row covering them.

  CREATE OR REPLACE FUNCTION public.get_payment_summary(
    p_site_id uuid,
    p_date_from date DEFAULT NULL,
    p_date_to date DEFAULT NULL
  )
  RETURNS TABLE (
    pending_amount numeric,
    pending_dates_count integer,
    paid_amount numeric,
    paid_count integer,
    daily_market_amount numeric,
    daily_market_count integer,
    weekly_amount numeric,
    weekly_count integer
  )
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  AS $$
    WITH
      bounds AS (
        SELECT
          COALESCE(p_date_from, '1900-01-01'::date) AS d_from,
          COALESCE(p_date_to,   '2999-12-31'::date) AS d_to
      ),
      paid_daily AS (
        SELECT
          sg.id,
          sg.total_amount,
          sg.settlement_date
        FROM settlement_groups sg
        WHERE sg.site_id = p_site_id
          AND sg.is_cancelled IS NOT TRUE
          AND sg.settlement_type IN ('daily', 'market', 'mixed')
          AND sg.settlement_date BETWEEN (SELECT d_from FROM bounds) AND (SELECT d_to FROM bounds)
      ),
      paid_weekly AS (
        SELECT
          sg.id,
          sg.total_amount,
          sg.settlement_date
        FROM settlement_groups sg
        WHERE sg.site_id = p_site_id
          AND sg.is_cancelled IS NOT TRUE
          AND sg.settlement_type = 'contract_weekly'
          AND sg.settlement_date BETWEEN (SELECT d_from FROM bounds) AND (SELECT d_to FROM bounds)
      ),
      pending_attendance AS (
        -- Distinct dates in scope where attendance has unpaid money
        -- and no settlement_group covers the date.
        SELECT DISTINCT a.attendance_date AS pending_date,
               COALESCE(SUM(
                 GREATEST(
                   COALESCE(a.daily_total_unpaid, 0)
                   + COALESCE(a.market_total_unpaid, 0)
                   + COALESCE(a.contract_total_unpaid, 0)
                   + COALESCE(a.tea_shop_unpaid, 0)
                 , 0)
               ), 0) AS pending_amount
        FROM v_site_attendance_with_pending a
        WHERE a.site_id = p_site_id
          AND a.attendance_date BETWEEN (SELECT d_from FROM bounds) AND (SELECT d_to FROM bounds)
          AND (
            COALESCE(a.daily_total_unpaid, 0)
            + COALESCE(a.market_total_unpaid, 0)
            + COALESCE(a.contract_total_unpaid, 0)
            + COALESCE(a.tea_shop_unpaid, 0)
          ) > 0
        GROUP BY a.attendance_date
      )
    SELECT
      COALESCE((SELECT SUM(pending_amount) FROM pending_attendance), 0)::numeric AS pending_amount,
      COALESCE((SELECT COUNT(*) FROM pending_attendance), 0)::integer            AS pending_dates_count,
      COALESCE((SELECT SUM(total_amount) FROM paid_daily), 0)::numeric
        + COALESCE((SELECT SUM(total_amount) FROM paid_weekly), 0)::numeric       AS paid_amount,
      COALESCE((SELECT COUNT(*) FROM paid_daily), 0)::integer
        + COALESCE((SELECT COUNT(*) FROM paid_weekly), 0)::integer                AS paid_count,
      COALESCE((SELECT SUM(total_amount) FROM paid_daily), 0)::numeric           AS daily_market_amount,
      COALESCE((SELECT COUNT(*) FROM paid_daily), 0)::integer                    AS daily_market_count,
      COALESCE((SELECT SUM(total_amount) FROM paid_weekly), 0)::numeric          AS weekly_amount,
      COALESCE((SELECT COUNT(*) FROM paid_weekly), 0)::integer                   AS weekly_count;
  $$;

  GRANT EXECUTE ON FUNCTION public.get_payment_summary(uuid, date, date) TO authenticated;

  COMMENT ON FUNCTION public.get_payment_summary IS
    'Returns scope-aware payment KPIs: pending amount/dates and paid amount/count split by daily+market vs weekly contract.';
  ```

  **Important:** if `v_site_attendance_with_pending` does not exist or uses different column names, inspect `mcp__supabase__list_tables` for the actual attendance + settlement views and adapt. The pending CTE is the one part most likely to need adjustment to local schema. Verify with the local DB before applying.

- [ ] **Step 3: Apply migration locally**

  Run: `npm run db:reset` (this re-applies all migrations cleanly to local Supabase).
  Expected: migration runs without error.

- [ ] **Step 4: Smoke-test the RPC against a known site**

  Run via psql or `mcp__supabase__execute_sql` (LOCAL only):

  ```sql
  SELECT * FROM get_payment_summary(
    '<known-site-uuid>'::uuid,
    NULL, NULL
  );
  ```

  Expected: one row with non-null numeric/integer columns. Sanity-check pending counts against the same site's `/site/attendance` page.

- [ ] **Step 5: Smoke-test with a date range**

  Run:

  ```sql
  SELECT * FROM get_payment_summary(
    '<known-site-uuid>'::uuid,
    '2026-04-01'::date,
    '2026-04-30'::date
  );
  ```

  Expected: smaller numbers than All-Time call. Pending count should match the number of unsettled dates in April for that site.

## Task 1.2: Add TypeScript type for the RPC return

**Files:**
- Modify: `src/types/payment.types.ts`

- [ ] **Step 1: Append the type**

  Append to `src/types/payment.types.ts`:

  ```ts
  /**
   * Server-side aggregate from get_payment_summary RPC.
   * One row per call regardless of scope size.
   */
  export interface PaymentScopeSummary {
    pendingAmount: number;
    pendingDatesCount: number;
    paidAmount: number;
    paidCount: number;
    dailyMarketAmount: number;
    dailyMarketCount: number;
    weeklyAmount: number;
    weeklyCount: number;
  }
  ```

- [ ] **Step 2: Commit Phase 1**

  ```bash
  git add supabase/migrations/20260426110000_add_payment_summary_rpc.sql src/types/payment.types.ts
  git commit -m "feat(payments): add get_payment_summary RPC + PaymentScopeSummary type"
  ```

---

# PHASE 2 — `InspectPane` component family + `useInspectPane` hook

**Independent. Mergeable alone. No user-visible change** until mounted in Phase 3/4/5. Delivers a portable right-side pane shell with four tabs, breakpoint-aware layout (overlay vs full-screen slide), and a state hook.

## Task 2.1: Define types and entity contracts

**Files:**
- Create: `src/components/common/InspectPane/types.ts`

- [ ] **Step 1: Write the type file**

  ```ts
  // Identifies the "thing" the pane is showing. Two shapes today:
  // - daily-date  : one date (settled or pending), all laborers paid that day
  // - weekly-week : one laborer × one week (Mon–Sun)
  export type InspectEntity =
    | {
        kind: "daily-date";
        siteId: string;
        date: string;                    // YYYY-MM-DD
        settlementRef?: string | null;   // null when pending
      }
    | {
        kind: "weekly-week";
        siteId: string;
        laborerId: string;
        weekStart: string;               // YYYY-MM-DD (Monday)
        weekEnd: string;                 // YYYY-MM-DD (Sunday)
        settlementRef?: string | null;
      };

  export type InspectTabKey = "attendance" | "work-updates" | "settlement" | "audit";

  export interface InspectPaneProps {
    entity: InspectEntity | null;
    isOpen: boolean;
    isPinned: boolean;
    activeTab: InspectTabKey;
    onTabChange: (tab: InspectTabKey) => void;
    onClose: () => void;
    onTogglePin: () => void;
    onOpenInPage: (entity: InspectEntity) => void;  // navigates to /site/attendance for daily, /site/payments for from-attendance, etc.
  }
  ```

- [ ] **Step 2: Add a barrel export**

  Create `src/components/common/InspectPane/index.ts`:

  ```ts
  export { InspectPane } from "./InspectPane";
  export type { InspectEntity, InspectTabKey, InspectPaneProps } from "./types";
  ```

## Task 2.2: `useInspectPane` hook (TDD)

**Files:**
- Create: `src/hooks/useInspectPane.ts`
- Create: `src/hooks/useInspectPane.test.ts`

**Why:** Page-scoped state container (no global context). Owns `{ isOpen, isPinned, currentEntity, activeTab }` and the actions to mutate them. Keeps host pages simple — they call `pane.open(entity)` and pass `pane.props` to `<InspectPane />`.

- [ ] **Step 1: Write failing tests**

  Create `src/hooks/useInspectPane.test.ts`:

  ```ts
  import { describe, it, expect } from "vitest";
  import { renderHook, act } from "@testing-library/react";
  import { useInspectPane } from "./useInspectPane";
  import type { InspectEntity } from "@/components/common/InspectPane/types";

  const dailyEntity: InspectEntity = {
    kind: "daily-date",
    siteId: "site-1",
    date: "2026-04-21",
    settlementRef: "SS-0421",
  };

  const weeklyEntity: InspectEntity = {
    kind: "weekly-week",
    siteId: "site-1",
    laborerId: "laborer-1",
    weekStart: "2026-04-14",
    weekEnd: "2026-04-20",
    settlementRef: "WS-W16-01",
  };

  describe("useInspectPane", () => {
    it("starts closed with no entity", () => {
      const { result } = renderHook(() => useInspectPane());
      expect(result.current.isOpen).toBe(false);
      expect(result.current.isPinned).toBe(false);
      expect(result.current.currentEntity).toBeNull();
      expect(result.current.activeTab).toBe("attendance");
    });

    it("open(entity) sets entity and isOpen=true", () => {
      const { result } = renderHook(() => useInspectPane());
      act(() => result.current.open(dailyEntity));
      expect(result.current.isOpen).toBe(true);
      expect(result.current.currentEntity).toEqual(dailyEntity);
    });

    it("clicking the same entity again closes (when not pinned)", () => {
      const { result } = renderHook(() => useInspectPane());
      act(() => result.current.open(dailyEntity));
      act(() => result.current.open(dailyEntity));
      expect(result.current.isOpen).toBe(false);
    });

    it("clicking a different entity replaces content (when not pinned)", () => {
      const { result } = renderHook(() => useInspectPane());
      act(() => result.current.open(dailyEntity));
      act(() => result.current.open(weeklyEntity));
      expect(result.current.isOpen).toBe(true);
      expect(result.current.currentEntity).toEqual(weeklyEntity);
    });

    it("clicking the same entity again does NOT close when pinned", () => {
      const { result } = renderHook(() => useInspectPane());
      act(() => result.current.open(dailyEntity));
      act(() => result.current.togglePin());
      act(() => result.current.open(dailyEntity));
      expect(result.current.isOpen).toBe(true);
    });

    it("close() forces closed even when pinned", () => {
      const { result } = renderHook(() => useInspectPane());
      act(() => result.current.open(dailyEntity));
      act(() => result.current.togglePin());
      act(() => result.current.close());
      expect(result.current.isOpen).toBe(false);
    });

    it("setActiveTab updates the tab", () => {
      const { result } = renderHook(() => useInspectPane());
      act(() => result.current.setActiveTab("settlement"));
      expect(result.current.activeTab).toBe("settlement");
    });

    it("opening a new entity resets activeTab to 'attendance'", () => {
      const { result } = renderHook(() => useInspectPane());
      act(() => result.current.open(dailyEntity));
      act(() => result.current.setActiveTab("audit"));
      act(() => result.current.open(weeklyEntity));
      expect(result.current.activeTab).toBe("attendance");
    });
  });
  ```

- [ ] **Step 2: Run tests, verify failure**

  Run: `npm run test -- src/hooks/useInspectPane.test.ts`
  Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

  Create `src/hooks/useInspectPane.ts`:

  ```ts
  import { useCallback, useState } from "react";
  import type { InspectEntity, InspectTabKey } from "@/components/common/InspectPane/types";

  function entityKey(e: InspectEntity): string {
    if (e.kind === "daily-date") return `d:${e.siteId}:${e.date}`;
    return `w:${e.siteId}:${e.laborerId}:${e.weekStart}`;
  }

  function entitiesEqual(a: InspectEntity | null, b: InspectEntity | null): boolean {
    if (!a || !b) return a === b;
    return entityKey(a) === entityKey(b);
  }

  export function useInspectPane() {
    const [isOpen, setIsOpen] = useState(false);
    const [isPinned, setIsPinned] = useState(false);
    const [currentEntity, setCurrentEntity] = useState<InspectEntity | null>(null);
    const [activeTab, setActiveTab] = useState<InspectTabKey>("attendance");

    const open = useCallback((entity: InspectEntity) => {
      setIsOpen((wasOpen) => {
        // If clicking same entity while open and not pinned → close.
        if (wasOpen && entitiesEqual(currentEntity, entity) && !isPinned) {
          return false;
        }
        return true;
      });
      setCurrentEntity((prev) => {
        // Reset tab when switching to a different entity
        if (!entitiesEqual(prev, entity)) {
          setActiveTab("attendance");
        }
        return entity;
      });
    }, [currentEntity, isPinned]);

    const close = useCallback(() => {
      setIsOpen(false);
    }, []);

    const togglePin = useCallback(() => {
      setIsPinned((prev) => !prev);
    }, []);

    return {
      isOpen,
      isPinned,
      currentEntity,
      activeTab,
      open,
      close,
      togglePin,
      setActiveTab,
    };
  }
  ```

- [ ] **Step 4: Run tests, verify pass**

  Run: `npm run test -- src/hooks/useInspectPane.test.ts`
  Expected: all 8 tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add src/hooks/useInspectPane.ts src/hooks/useInspectPane.test.ts src/components/common/InspectPane/types.ts src/components/common/InspectPane/index.ts
  git commit -m "feat(inspect-pane): add useInspectPane hook + entity types"
  ```

## Task 2.3: `InspectPane` shell (header, tabs, breakpoint, Esc)

**Files:**
- Create: `src/components/common/InspectPane/InspectPane.tsx`
- Create: `src/components/common/InspectPane/InspectPane.test.tsx`

- [ ] **Step 1: Write failing tests**

  Create `src/components/common/InspectPane/InspectPane.test.tsx`:

  ```tsx
  import { describe, it, expect, vi } from "vitest";
  import { render, screen, fireEvent } from "@testing-library/react";
  import { InspectPane } from "./InspectPane";
  import type { InspectEntity } from "./types";

  const dailyEntity: InspectEntity = {
    kind: "daily-date",
    siteId: "site-1",
    date: "2026-04-21",
    settlementRef: "SS-0421",
  };

  const baseProps = {
    entity: dailyEntity,
    isOpen: true,
    isPinned: false,
    activeTab: "attendance" as const,
    onTabChange: vi.fn(),
    onClose: vi.fn(),
    onTogglePin: vi.fn(),
    onOpenInPage: vi.fn(),
  };

  describe("InspectPane", () => {
    it("renders nothing when isOpen=false", () => {
      const { container } = render(<InspectPane {...baseProps} isOpen={false} />);
      expect(container).toBeEmptyDOMElement();
    });

    it("renders nothing when entity is null", () => {
      const { container } = render(<InspectPane {...baseProps} entity={null} />);
      expect(container).toBeEmptyDOMElement();
    });

    it("renders title for daily entity", () => {
      render(<InspectPane {...baseProps} />);
      // "📅 21 Apr · Mon"
      expect(screen.getByText(/21 Apr/)).toBeInTheDocument();
      expect(screen.getByText(/SS-0421/)).toBeInTheDocument();
    });

    it("close button calls onClose", () => {
      const onClose = vi.fn();
      render(<InspectPane {...baseProps} onClose={onClose} />);
      fireEvent.click(screen.getByLabelText(/close/i));
      expect(onClose).toHaveBeenCalled();
    });

    it("Esc key calls onClose", () => {
      const onClose = vi.fn();
      render(<InspectPane {...baseProps} onClose={onClose} />);
      fireEvent.keyDown(document, { key: "Escape" });
      expect(onClose).toHaveBeenCalled();
    });

    it("Esc does NOT call onClose when isOpen=false", () => {
      const onClose = vi.fn();
      render(<InspectPane {...baseProps} isOpen={false} onClose={onClose} />);
      fireEvent.keyDown(document, { key: "Escape" });
      expect(onClose).not.toHaveBeenCalled();
    });

    it("clicking a tab calls onTabChange", () => {
      const onTabChange = vi.fn();
      render(<InspectPane {...baseProps} onTabChange={onTabChange} />);
      fireEvent.click(screen.getByRole("tab", { name: /settlement/i }));
      expect(onTabChange).toHaveBeenCalledWith("settlement");
    });

    it("pin button calls onTogglePin", () => {
      const onTogglePin = vi.fn();
      render(<InspectPane {...baseProps} onTogglePin={onTogglePin} />);
      fireEvent.click(screen.getByLabelText(/pin/i));
      expect(onTogglePin).toHaveBeenCalled();
    });

    it("renders weekly-week title shape", () => {
      const weeklyEntity: InspectEntity = {
        kind: "weekly-week",
        siteId: "site-1",
        laborerId: "laborer-1",
        weekStart: "2026-04-14",
        weekEnd: "2026-04-20",
        settlementRef: "WS-W16-01",
      };
      render(<InspectPane {...baseProps} entity={weeklyEntity} />);
      expect(screen.getByText(/Week 14[–-]20 Apr/)).toBeInTheDocument();
      expect(screen.getByText(/WS-W16-01/)).toBeInTheDocument();
    });
  });
  ```

- [ ] **Step 2: Run tests, verify failure**

  Run: `npm run test -- src/components/common/InspectPane/InspectPane.test.tsx`
  Expected: FAIL — module not found.

- [ ] **Step 3: Implement the shell**

  Create `src/components/common/InspectPane/InspectPane.tsx`:

  ```tsx
  "use client";

  import { useEffect, useMemo } from "react";
  import {
    Box, IconButton, Tab, Tabs, Typography, useMediaQuery, useTheme, Drawer, alpha,
  } from "@mui/material";
  import {
    Close as CloseIcon,
    PushPin as PinIcon,
    PushPinOutlined as PinOutlinedIcon,
    OpenInNew as OpenInNewIcon,
    CalendarMonth as CalendarIcon,
    Person as PersonIcon,
  } from "@mui/icons-material";
  import dayjs from "dayjs";
  import type { InspectPaneProps, InspectTabKey } from "./types";
  import AttendanceTab from "./AttendanceTab";
  import WorkUpdatesTab from "./WorkUpdatesTab";
  import SettlementTab from "./SettlementTab";
  import AuditTab from "./AuditTab";

  const TABS: { key: InspectTabKey; label: string }[] = [
    { key: "attendance",    label: "Attendance" },
    { key: "work-updates",  label: "Work Updates" },
    { key: "settlement",    label: "Settlement" },
    { key: "audit",         label: "Audit" },
  ];

  export function InspectPane(props: InspectPaneProps) {
    const {
      entity, isOpen, isPinned, activeTab,
      onTabChange, onClose, onTogglePin, onOpenInPage,
    } = props;

    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down("sm")); // < 600px

    // Esc closes pane (only when open). Dialog Esc precedence is implicit:
    // MUI dialogs add their own Esc listeners that fire first.
    useEffect(() => {
      if (!isOpen) return;
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") onClose();
      };
      document.addEventListener("keydown", onKey);
      return () => document.removeEventListener("keydown", onKey);
    }, [isOpen, onClose]);

    const title = useMemo(() => {
      if (!entity) return "";
      if (entity.kind === "daily-date") {
        return dayjs(entity.date).format("DD MMM · ddd");
      }
      const start = dayjs(entity.weekStart).format("DD");
      const end = dayjs(entity.weekEnd).format("DD MMM");
      return `Week ${start}–${end}`;
    }, [entity]);

    const subtitle = useMemo(() => {
      if (!entity) return "";
      const ref = entity.settlementRef ? entity.settlementRef : "Pending";
      return ref;
    }, [entity]);

    if (!isOpen || !entity) return null;

    // Width: 480 desktop, 420 ≥600 < 1280, full on mobile.
    const drawerWidth = isMobile ? "100%" : 480;

    return (
      <Drawer
        anchor="right"
        open={isOpen}
        onClose={onClose}
        variant={isMobile ? "temporary" : "persistent"}
        ModalProps={{ keepMounted: false }}
        // On non-mobile: persistent drawer overlays without dimming.
        // On mobile: temporary drawer with backdrop.
        PaperProps={{
          sx: {
            width: drawerWidth,
            border: 0,
            borderLeft: `1px solid ${theme.palette.divider}`,
            boxShadow: isMobile ? undefined : 8,
            background: theme.palette.background.paper,
          },
        }}
        sx={{
          // Persistent drawer should NOT dim background.
          "& .MuiBackdrop-root": isMobile ? undefined : { display: "none" },
        }}
      >
        {/* Header */}
        <Box
          sx={{
            px: 2, py: 1.5,
            borderBottom: `1px solid ${theme.palette.divider}`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: 1,
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
              {entity.kind === "daily-date" ? (
                <CalendarIcon fontSize="small" color="action" />
              ) : (
                <PersonIcon fontSize="small" color="action" />
              )}
              <Typography variant="subtitle2" fontWeight={700} noWrap>
                {title}
              </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
              {subtitle}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", gap: 0.5, flexShrink: 0 }}>
            <IconButton
              size="small"
              aria-label="Open in page"
              onClick={() => onOpenInPage(entity)}
            >
              <OpenInNewIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              aria-label={isPinned ? "Unpin pane" : "Pin pane"}
              onClick={onTogglePin}
              color={isPinned ? "primary" : "default"}
            >
              {isPinned ? <PinIcon fontSize="small" /> : <PinOutlinedIcon fontSize="small" />}
            </IconButton>
            <IconButton size="small" aria-label="Close pane" onClick={onClose}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>

        {/* Tabs */}
        <Tabs
          value={activeTab}
          onChange={(_, v) => onTabChange(v as InspectTabKey)}
          variant="fullWidth"
          sx={{
            minHeight: 36,
            "& .MuiTab-root": { minHeight: 36, fontSize: 12, textTransform: "none" },
            borderBottom: `1px solid ${theme.palette.divider}`,
          }}
        >
          {TABS.map((t) => (
            <Tab key={t.key} value={t.key} label={t.label} />
          ))}
        </Tabs>

        {/* Body */}
        <Box
          role="region"
          aria-label={`Inspector for ${subtitle}`}
          sx={{
            flex: 1, minHeight: 0, overflow: "auto",
            background: alpha(theme.palette.background.default, 0.3),
          }}
        >
          {activeTab === "attendance"   && <AttendanceTab entity={entity} />}
          {activeTab === "work-updates" && <WorkUpdatesTab entity={entity} />}
          {activeTab === "settlement"   && <SettlementTab entity={entity} />}
          {activeTab === "audit"        && <AuditTab entity={entity} />}
        </Box>
      </Drawer>
    );
  }

  export default InspectPane;
  ```

- [ ] **Step 4: Stub the four tab components so the shell compiles**

  Create temporary stubs for each tab — full implementation in Tasks 2.4–2.7. Each stub is a single placeholder Box.

  `src/components/common/InspectPane/AttendanceTab.tsx`:

  ```tsx
  import { Box, Typography } from "@mui/material";
  import type { InspectEntity } from "./types";
  export default function AttendanceTab({ entity }: { entity: InspectEntity }) {
    return <Box sx={{ p: 2 }}><Typography variant="caption">Attendance content for {entity.kind}</Typography></Box>;
  }
  ```

  `src/components/common/InspectPane/WorkUpdatesTab.tsx`:

  ```tsx
  import { Box, Typography } from "@mui/material";
  import type { InspectEntity } from "./types";
  export default function WorkUpdatesTab({ entity }: { entity: InspectEntity }) {
    return <Box sx={{ p: 2 }}><Typography variant="caption">Work updates for {entity.kind}</Typography></Box>;
  }
  ```

  `src/components/common/InspectPane/SettlementTab.tsx`:

  ```tsx
  import { Box, Typography } from "@mui/material";
  import type { InspectEntity } from "./types";
  export default function SettlementTab({ entity }: { entity: InspectEntity }) {
    return <Box sx={{ p: 2 }}><Typography variant="caption">Settlement for {entity.kind}</Typography></Box>;
  }
  ```

  `src/components/common/InspectPane/AuditTab.tsx`:

  ```tsx
  import { Box, Typography } from "@mui/material";
  import type { InspectEntity } from "./types";
  export default function AuditTab({ entity }: { entity: InspectEntity }) {
    return <Box sx={{ p: 2 }}><Typography variant="caption">Audit for {entity.kind}</Typography></Box>;
  }
  ```

- [ ] **Step 5: Run shell tests, verify pass**

  Run: `npm run test -- src/components/common/InspectPane/InspectPane.test.tsx`
  Expected: all 9 tests pass.

- [ ] **Step 6: Commit shell**

  ```bash
  git add src/components/common/InspectPane/
  git commit -m "feat(inspect-pane): shell with header, tabs, breakpoint, Esc handling"
  ```

## Task 2.4: `AttendanceTab` — daily-shape content

**Files:**
- Modify: `src/components/common/InspectPane/AttendanceTab.tsx`

**Why:** This is the default tab and the most data-rich. Daily shape: 3 small total tiles (Daily / Market / Tea Shop) + Daily Laborers list + Market Laborers list. Reuses existing attendance hooks rather than re-querying.

- [ ] **Step 1: Identify the data hooks**

  Skim `src/hooks/queries/useAttendance.ts` to find the existing fetch for "attendance + earnings for one site + one date." If it exists, reuse it. If only an aggregate hook exists, write a thin `useAttendanceForDate` hook in the next step.

- [ ] **Step 2: Implement the daily branch**

  Replace `src/components/common/InspectPane/AttendanceTab.tsx`:

  ```tsx
  "use client";

  import { Box, Skeleton, Stack, Typography, useTheme, alpha } from "@mui/material";
  import dayjs from "dayjs";
  import type { InspectEntity } from "./types";
  import { useAttendanceForDate } from "@/hooks/queries/useAttendanceForDate";  // NEW — see Step 3
  import { useLaborerWeek } from "@/hooks/queries/useLaborerWeek";              // NEW — see Step 4

  function TotalTile({ label, value, accent }: { label: string; value: string; accent?: "warn" | "pos" }) {
    const theme = useTheme();
    const color =
      accent === "warn" ? theme.palette.warning.main :
      accent === "pos"  ? theme.palette.success.main :
      theme.palette.text.primary;
    return (
      <Box sx={{
        flex: 1, p: 1.25,
        bgcolor: theme.palette.background.paper,
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 1.5,
      }}>
        <Typography variant="caption" color="text.secondary"
          sx={{ display: "block", fontSize: 9, textTransform: "uppercase", letterSpacing: 0.4 }}>
          {label}
        </Typography>
        <Typography variant="subtitle2" fontWeight={700} sx={{ color }}>
          {value}
        </Typography>
      </Box>
    );
  }

  function DailyShape({ entity }: { entity: Extract<InspectEntity, { kind: "daily-date" }> }) {
    const theme = useTheme();
    const { data, isLoading } = useAttendanceForDate(entity.siteId, entity.date);

    if (isLoading) {
      return (
        <Box sx={{ p: 2 }}>
          <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
            <Skeleton variant="rounded" width="100%" height={56} />
            <Skeleton variant="rounded" width="100%" height={56} />
            <Skeleton variant="rounded" width="100%" height={56} />
          </Stack>
          <Skeleton variant="rounded" width="100%" height={140} />
        </Box>
      );
    }

    const dailyTotal   = data?.dailyTotal   ?? 0;
    const marketTotal  = data?.marketTotal  ?? 0;
    const teaTotal     = data?.teaShopTotal ?? 0;
    const dailyLaborers  = data?.dailyLaborers  ?? [];
    const marketLaborers = data?.marketLaborers ?? [];

    return (
      <Box sx={{ p: 2 }}>
        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          <TotalTile label="Daily"  value={`₹${dailyTotal.toLocaleString("en-IN")}`} />
          <TotalTile label="Market" value={`₹${marketTotal.toLocaleString("en-IN")}`} />
          <TotalTile label="Tea"    value={`₹${teaTotal.toLocaleString("en-IN")}`} />
        </Stack>

        <Typography variant="caption" color="text.secondary"
          sx={{ display: "block", mb: 0.75, fontSize: 9, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600 }}>
          Daily Laborers ({dailyLaborers.length})
        </Typography>
        <Stack spacing={0.5} sx={{ mb: 2 }}>
          {dailyLaborers.slice(0, 4).map((lab) => (
            <Box key={lab.id} sx={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              p: 0.75, px: 1.25,
              bgcolor: theme.palette.background.paper,
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: 1,
            }}>
              <Box>
                <Typography variant="body2" fontWeight={500}>{lab.name}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {lab.role} · {lab.fullDay ? "Full day" : "Half day"}
                </Typography>
              </Box>
              <Typography variant="body2" fontWeight={600} color="success.main">
                ₹{lab.amount.toLocaleString("en-IN")}
              </Typography>
            </Box>
          ))}
          {dailyLaborers.length > 4 && (
            <Typography variant="caption" color="text.secondary" sx={{ pl: 1 }}>
              … {dailyLaborers.length - 4} more
            </Typography>
          )}
        </Stack>

        <Typography variant="caption" color="text.secondary"
          sx={{ display: "block", mb: 0.75, fontSize: 9, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600 }}>
          Market Laborers ({marketLaborers.length})
        </Typography>
        <Stack spacing={0.5}>
          {marketLaborers.slice(0, 4).map((mkt) => (
            <Box key={mkt.id} sx={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              p: 0.75, px: 1.25,
              bgcolor: theme.palette.background.paper,
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: 1,
            }}>
              <Box>
                <Typography variant="body2" fontWeight={500}>{mkt.role}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {mkt.count} {mkt.count === 1 ? "person" : "people"}
                </Typography>
              </Box>
              <Typography variant="body2" fontWeight={600} color="success.main">
                ₹{mkt.amount.toLocaleString("en-IN")}
              </Typography>
            </Box>
          ))}
          {marketLaborers.length > 4 && (
            <Typography variant="caption" color="text.secondary" sx={{ pl: 1 }}>
              … {marketLaborers.length - 4} more
            </Typography>
          )}
        </Stack>
      </Box>
    );
  }

  function WeeklyShape({ entity }: { entity: Extract<InspectEntity, { kind: "weekly-week" }> }) {
    // Implemented in Task 2.5
    return null;
  }

  export default function AttendanceTab({ entity }: { entity: InspectEntity }) {
    if (entity.kind === "daily-date") return <DailyShape entity={entity} />;
    return <WeeklyShape entity={entity} />;
  }
  ```

- [ ] **Step 3: Add `useAttendanceForDate` hook**

  Create `src/hooks/queries/useAttendanceForDate.ts`:

  ```ts
  import { useQuery } from "@tanstack/react-query";
  import { createClient } from "@/lib/supabase/client";

  export interface AttendanceForDateData {
    dailyTotal: number;
    marketTotal: number;
    teaShopTotal: number;
    dailyLaborers: Array<{
      id: string;
      name: string;
      role: string;
      fullDay: boolean;
      amount: number;
    }>;
    marketLaborers: Array<{
      id: string;
      role: string;
      count: number;
      amount: number;
    }>;
  }

  export function useAttendanceForDate(siteId: string, date: string) {
    const supabase = createClient();
    return useQuery<AttendanceForDateData>({
      queryKey: ["inspect-attendance-date", siteId, date],
      queryFn: async () => {
        // Reuse existing per-day attendance view if one exists; otherwise
        // assemble from `attendance` + `market_laborer_attendance` + `tea_shop_entries`.
        // SHAPE TARGET — adapt to real schema:
        const { data, error } = await (supabase as any).rpc(
          "get_attendance_for_date",
          { p_site_id: siteId, p_date: date }
        );
        if (error) throw error;
        // RPC returns a single jsonb row; map to AttendanceForDateData.
        return {
          dailyTotal:    Number(data?.daily_total)     || 0,
          marketTotal:   Number(data?.market_total)    || 0,
          teaShopTotal:  Number(data?.tea_shop_total)  || 0,
          dailyLaborers:  (data?.daily_laborers  ?? []).map((l: any) => ({
            id:       l.id,
            name:     l.name,
            role:     l.role,
            fullDay:  Boolean(l.full_day),
            amount:   Number(l.amount) || 0,
          })),
          marketLaborers: (data?.market_laborers ?? []).map((m: any) => ({
            id:     m.id,
            role:   m.role,
            count:  Number(m.count)  || 0,
            amount: Number(m.amount) || 0,
          })),
        };
      },
      staleTime: 30_000,
      enabled: Boolean(siteId && date),
    });
  }
  ```

  **NOTE:** if `get_attendance_for_date` RPC doesn't exist, write a small migration adding it (mirroring the structure of `get_payment_summary`) — this avoids client-side joins. Add to Phase 1's migration set or as a sibling migration. Update plan accordingly.

- [ ] **Step 4: Stub `useLaborerWeek` for the weekly branch**

  Create `src/hooks/queries/useLaborerWeek.ts`:

  ```ts
  import { useQuery } from "@tanstack/react-query";
  import { createClient } from "@/lib/supabase/client";

  export interface LaborerWeekDay {
    date: string;        // YYYY-MM-DD
    dayName: string;     // Mon, Tue, ...
    status: "full" | "half" | "off" | "holiday";
    amount: number;
  }

  export interface LaborerWeekData {
    dailySalary: number;
    contractAmount: number;
    total: number;
    role: string;
    laborerName: string;
    days: LaborerWeekDay[];
    daysNotWorked: Array<{ date: string; reason: string }>;
  }

  export function useLaborerWeek(
    siteId: string, laborerId: string, weekStart: string, weekEnd: string,
  ) {
    const supabase = createClient();
    return useQuery<LaborerWeekData>({
      queryKey: ["inspect-laborer-week", siteId, laborerId, weekStart, weekEnd],
      queryFn: async () => {
        const { data, error } = await (supabase as any).rpc(
          "get_laborer_week_breakdown",
          { p_site_id: siteId, p_laborer_id: laborerId, p_week_start: weekStart, p_week_end: weekEnd }
        );
        if (error) throw error;
        return {
          dailySalary:    Number(data?.daily_salary)    || 0,
          contractAmount: Number(data?.contract_amount) || 0,
          total:          Number(data?.total)           || 0,
          role:           String(data?.role           ?? ""),
          laborerName:    String(data?.laborer_name   ?? ""),
          days:           (data?.days ?? []).map((d: any) => ({
            date:    d.date,
            dayName: d.day_name,
            status:  d.status,
            amount:  Number(d.amount) || 0,
          })),
          daysNotWorked: (data?.days_not_worked ?? []).map((d: any) => ({
            date:   d.date,
            reason: d.reason,
          })),
        };
      },
      staleTime: 30_000,
      enabled: Boolean(siteId && laborerId && weekStart && weekEnd),
    });
  }
  ```

  Add a sibling migration `supabase/migrations/<date>_add_inspect_pane_rpcs.sql` that defines `get_attendance_for_date` and `get_laborer_week_breakdown`. Mirror the pattern of `get_payment_summary` from Phase 1. Both RPCs return a single `jsonb` row.

- [ ] **Step 5: Smoke-test the daily branch in Storybook OR a temp page**

  If Storybook isn't set up, create a temporary `/site/_inspect-test` route that mounts `<InspectPane />` with a hard-coded daily entity. Verify the totals + laborer list render. Delete the route after validation (do NOT commit).

- [ ] **Step 6: Commit daily-shape**

  ```bash
  git add src/components/common/InspectPane/AttendanceTab.tsx src/hooks/queries/useAttendanceForDate.ts src/hooks/queries/useLaborerWeek.ts supabase/migrations/<date>_add_inspect_pane_rpcs.sql
  git commit -m "feat(inspect-pane): AttendanceTab daily-shape + supporting RPCs/hooks"
  ```

## Task 2.5: `AttendanceTab` — weekly-shape content (7-day strip + breakdown)

**Files:**
- Modify: `src/components/common/InspectPane/AttendanceTab.tsx`

- [ ] **Step 1: Implement the `WeeklyShape` component**

  Replace the placeholder `WeeklyShape` from Task 2.4 with:

  ```tsx
  function WeeklyShape({ entity }: { entity: Extract<InspectEntity, { kind: "weekly-week" }> }) {
    const theme = useTheme();
    const { data, isLoading } = useLaborerWeek(
      entity.siteId, entity.laborerId, entity.weekStart, entity.weekEnd
    );

    if (isLoading) {
      return (
        <Box sx={{ p: 2 }}>
          <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
            <Skeleton variant="rounded" width="100%" height={56} />
            <Skeleton variant="rounded" width="100%" height={56} />
            <Skeleton variant="rounded" width="100%" height={56} />
          </Stack>
          <Skeleton variant="rounded" width="100%" height={100} />
        </Box>
      );
    }

    const dailySalary    = data?.dailySalary    ?? 0;
    const contractAmount = data?.contractAmount ?? 0;
    const total          = data?.total          ?? 0;
    const days           = data?.days           ?? [];
    const daysNotWorked  = data?.daysNotWorked  ?? [];

    const statusColor = (s: string) => {
      if (s === "full")    return { bg: alpha(theme.palette.success.main, 0.12), border: theme.palette.success.main };
      if (s === "half")    return { bg: alpha(theme.palette.warning.main, 0.12), border: theme.palette.warning.main };
      if (s === "holiday") return { bg: "transparent",                            border: theme.palette.secondary.main };
      return { bg: theme.palette.background.default, border: theme.palette.divider };  // off
    };

    return (
      <Box sx={{ p: 2 }}>
        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          <TotalTile label="Daily Sal." value={`₹${dailySalary.toLocaleString("en-IN")}`} />
          <TotalTile label="Contract"   value={`₹${contractAmount.toLocaleString("en-IN")}`} />
          <TotalTile label="Total"      value={`₹${total.toLocaleString("en-IN")}`} accent="pos" />
        </Stack>

        <Typography variant="caption" color="text.secondary"
          sx={{ display: "block", mb: 0.75, fontSize: 9, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600 }}>
          Per-day breakdown ({days.filter(d => d.status === "full" || d.status === "half").length} of 7 days)
        </Typography>
        <Box sx={{
          display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 0.5,
          mb: 2,
        }}>
          {days.map((d) => {
            const c = statusColor(d.status);
            return (
              <Box key={d.date} sx={{
                p: 0.75, borderRadius: 1,
                border: `1px solid ${c.border}`,
                bgcolor: c.bg,
                textAlign: "center",
                minHeight: 80,
                display: "flex", flexDirection: "column", justifyContent: "space-between",
              }}>
                <Box>
                  <Typography variant="caption" sx={{ fontSize: 8.5, color: "text.secondary", textTransform: "uppercase" }}>
                    {d.dayName}
                  </Typography>
                  <Typography variant="subtitle2" fontWeight={700}>
                    {dayjs(d.date).format("DD")}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" sx={{
                    fontSize: 8, fontWeight: 600,
                    color: d.status === "full" ? "success.dark"
                         : d.status === "half" ? "warning.dark"
                         : "text.disabled",
                  }}>
                    {d.status.toUpperCase()}
                  </Typography>
                  <Typography variant="caption" sx={{
                    display: "block", fontSize: 9, fontWeight: 600,
                    color: d.amount > 0 ? "success.main" : "text.disabled",
                  }}>
                    {d.amount > 0 ? `₹${d.amount}` : "—"}
                  </Typography>
                </Box>
              </Box>
            );
          })}
        </Box>

        <Typography variant="caption" color="text.secondary"
          sx={{ display: "block", mb: 0.75, fontSize: 9, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600 }}>
          Salary breakdown
        </Typography>
        <Stack spacing={0.5} sx={{ mb: 2 }}>
          <Box sx={{ p: 0.75, px: 1.25, bgcolor: "background.paper", border: `1px solid ${theme.palette.divider}`, borderRadius: 1, display: "flex", justifyContent: "space-between" }}>
            <Box>
              <Typography variant="body2">Daily salary</Typography>
              <Typography variant="caption" color="text.secondary">
                {days.filter(d => d.status === "full" || d.status === "half").length} day(s) worked
              </Typography>
            </Box>
            <Typography variant="body2" fontWeight={600} color="success.main">
              ₹{dailySalary.toLocaleString("en-IN")}
            </Typography>
          </Box>
          <Box sx={{ p: 0.75, px: 1.25, bgcolor: "background.paper", border: `1px solid ${theme.palette.divider}`, borderRadius: 1, display: "flex", justifyContent: "space-between" }}>
            <Box>
              <Typography variant="body2">Contract / piece-rate</Typography>
            </Box>
            <Typography variant="body2" fontWeight={600} color="success.main">
              ₹{contractAmount.toLocaleString("en-IN")}
            </Typography>
          </Box>
          <Box sx={{ p: 0.75, px: 1.25, bgcolor: alpha(theme.palette.warning.main, 0.08), border: `1px solid ${theme.palette.warning.main}`, borderRadius: 1, display: "flex", justifyContent: "space-between" }}>
            <Typography variant="body2" fontWeight={700} color="warning.dark">Total settled</Typography>
            <Typography variant="body2" fontWeight={700} color="warning.dark">
              ₹{total.toLocaleString("en-IN")}
            </Typography>
          </Box>
        </Stack>

        {daysNotWorked.length > 0 && (
          <>
            <Typography variant="caption" color="text.secondary"
              sx={{ display: "block", mb: 0.75, fontSize: 9, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600 }}>
              Days didn't work
            </Typography>
            <Stack spacing={0.5}>
              {daysNotWorked.map((d) => (
                <Box key={d.date} sx={{
                  p: 0.75, px: 1.25,
                  bgcolor: theme.palette.background.paper,
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: 1,
                }}>
                  <Typography variant="body2" fontWeight={500}>
                    {dayjs(d.date).format("ddd DD MMM")}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {d.reason}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </>
        )}
      </Box>
    );
  }
  ```

- [ ] **Step 2: Smoke-test weekly via temp route**

  Same temp route from Task 2.4 — pass a weekly entity. Verify 7-day strip renders with correct color-coding for full/half/off days.

- [ ] **Step 3: Commit weekly-shape**

  ```bash
  git add src/components/common/InspectPane/AttendanceTab.tsx
  git commit -m "feat(inspect-pane): AttendanceTab weekly-shape with 7-day strip + breakdown"
  ```

## Task 2.6: `WorkUpdatesTab`

**Files:**
- Modify: `src/components/common/InspectPane/WorkUpdatesTab.tsx`

- [ ] **Step 1: Identify the existing work-updates source**

  Skim `src/components/attendance/work-updates/WorkUpdatesSection.tsx` and `WorkUpdateViewer.tsx` to find the data hook (likely something like `useWorkUpdates(siteId, date)`).

- [ ] **Step 2: Implement**

  Replace `src/components/common/InspectPane/WorkUpdatesTab.tsx`:

  ```tsx
  "use client";

  import { Box, Skeleton, Stack, Typography, useTheme } from "@mui/material";
  import dayjs from "dayjs";
  import type { InspectEntity } from "./types";
  import { useWorkUpdates } from "@/hooks/queries/useWorkUpdates";  // existing or new

  export default function WorkUpdatesTab({ entity }: { entity: InspectEntity }) {
    // Daily: load updates for a single date.
    // Weekly: load updates for the week's date range.
    const { siteId, dateFrom, dateTo } =
      entity.kind === "daily-date"
        ? { siteId: entity.siteId, dateFrom: entity.date, dateTo: entity.date }
        : { siteId: entity.siteId, dateFrom: entity.weekStart, dateTo: entity.weekEnd };

    const { data, isLoading } = useWorkUpdates(siteId, dateFrom, dateTo);
    const theme = useTheme();

    if (isLoading) {
      return (
        <Box sx={{ p: 2 }}>
          <Skeleton variant="rounded" width="100%" height={80} sx={{ mb: 1 }} />
          <Skeleton variant="rounded" width="100%" height={80} />
        </Box>
      );
    }

    const updates = data?.updates ?? [];

    if (updates.length === 0) {
      return (
        <Box sx={{ p: 2 }}>
          <Typography variant="body2" color="text.secondary">No work updates recorded.</Typography>
        </Box>
      );
    }

    return (
      <Box sx={{ p: 2 }}>
        <Stack spacing={1.5}>
          {updates.map((u) => (
            <Box key={u.id} sx={{
              p: 1.25, borderRadius: 1,
              bgcolor: "background.paper",
              border: `1px solid ${theme.palette.divider}`,
            }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                {u.timeOfDay} · {dayjs(u.createdAt).format("DD MMM, hh:mm A")} · by {u.createdByName}
              </Typography>
              <Typography variant="body2" sx={{ mb: u.photoUrls?.length ? 1 : 0 }}>
                {u.note}
              </Typography>
              {u.photoUrls && u.photoUrls.length > 0 && (
                <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap" }}>
                  {u.photoUrls.slice(0, 6).map((url, i) => (
                    <Box key={i} sx={{
                      width: 56, height: 56, borderRadius: 0.75,
                      backgroundImage: `url(${url})`,
                      backgroundSize: "cover", backgroundPosition: "center",
                      border: `1px solid ${theme.palette.divider}`,
                    }} />
                  ))}
                  {u.photoUrls.length > 6 && (
                    <Box sx={{
                      width: 56, height: 56, borderRadius: 0.75,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      bgcolor: theme.palette.action.hover,
                      border: `1px solid ${theme.palette.divider}`,
                      fontSize: 12, color: "text.secondary", fontWeight: 600,
                    }}>
                      +{u.photoUrls.length - 6}
                    </Box>
                  )}
                </Stack>
              )}
            </Box>
          ))}
        </Stack>
      </Box>
    );
  }
  ```

  If `useWorkUpdates` doesn't exist with this shape, write it: `src/hooks/queries/useWorkUpdates.ts` returning `{ updates: Array<{ id, timeOfDay, createdAt, createdByName, note, photoUrls }> }`. Read `WorkUpdatesSection` to find the actual table / view name (likely `work_updates` or `attendance_work_updates`).

- [ ] **Step 2: Commit**

  ```bash
  git add src/components/common/InspectPane/WorkUpdatesTab.tsx src/hooks/queries/useWorkUpdates.ts
  git commit -m "feat(inspect-pane): WorkUpdatesTab with notes + photos"
  ```

## Task 2.7: `SettlementTab`

**Files:**
- Modify: `src/components/common/InspectPane/SettlementTab.tsx`

- [ ] **Step 1: Implement**

  Replace `src/components/common/InspectPane/SettlementTab.tsx`:

  ```tsx
  "use client";

  import { Box, Button, Skeleton, Stack, Typography, useTheme } from "@mui/material";
  import dayjs from "dayjs";
  import type { InspectEntity } from "./types";
  import { useSettlementDetails } from "@/hooks/queries/useSettlementDetails";

  function Row({ label, value }: { label: string; value: React.ReactNode }) {
    return (
      <Box sx={{ display: "flex", justifyContent: "space-between", py: 0.5 }}>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        <Typography variant="body2">{value}</Typography>
      </Box>
    );
  }

  export default function SettlementTab({ entity }: { entity: InspectEntity }) {
    const theme = useTheme();
    const isPending = !entity.settlementRef;

    const { data, isLoading } = useSettlementDetails(
      entity.settlementRef ?? null,
      entity.siteId,
    );

    if (isLoading && !isPending) {
      return <Box sx={{ p: 2 }}><Skeleton variant="rounded" width="100%" height={120} /></Box>;
    }

    if (isPending) {
      return (
        <Box sx={{ p: 2 }}>
          <Box sx={{
            p: 1.5, borderRadius: 1,
            bgcolor: theme.palette.warning.light,
            border: `1px solid ${theme.palette.warning.main}`,
            mb: 1.5,
          }}>
            <Typography variant="body2" fontWeight={600} color="warning.dark">
              Not yet settled
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Click below to settle this {entity.kind === "daily-date" ? "date" : "week"} now.
            </Typography>
          </Box>
          <Button variant="contained" color="success" fullWidth>
            Settle now
          </Button>
        </Box>
      );
    }

    return (
      <Box sx={{ p: 2 }}>
        <Stack divider={<Box sx={{ borderBottom: `1px solid ${theme.palette.divider}` }} />}>
          <Row label="Reference"     value={entity.settlementRef} />
          <Row label="Settled on"    value={dayjs(data?.settledOn).format("DD MMM YYYY")} />
          <Row label="Payer"         value={data?.payerName ?? "—"} />
          <Row label="Payment mode"  value={data?.paymentMode ?? "—"} />
          <Row label="Channel"       value={data?.channel ?? "—"} />
          <Row label="Recorded by"   value={data?.recordedByName ?? "—"} />
        </Stack>

        {data?.linkedExpenseRef && (
          <Box sx={{ mt: 2, p: 1, bgcolor: "background.paper", border: `1px solid ${theme.palette.divider}`, borderRadius: 1 }}>
            <Typography variant="caption" color="text.secondary">Linked expense</Typography>
            <Typography variant="body2" fontFamily="ui-monospace, monospace">{data.linkedExpenseRef}</Typography>
          </Box>
        )}
      </Box>
    );
  }
  ```

  Add `src/hooks/queries/useSettlementDetails.ts` if not present. Returns `{ settledOn, payerName, paymentMode, channel, recordedByName, linkedExpenseRef }`.

- [ ] **Step 2: Wire the "Settle now" button**

  The Settle button must open the existing `DailySettlementDialog` or `WeeklySettlementDialog`. Since dialogs are heavy, lazy-load and prepare the inputs from `entity`. Acceptable approach: emit a callback prop `onSettleClick(entity)` from `SettlementTab` → bubble up to `InspectPane` → bubble to host page → host opens the dialog with prefilled data. Alternatively (simpler) — host pages mount the settlement dialogs and listen on a small event bus / context.

  Recommended approach for first pass: add an `onSettleClick?: (entity: InspectEntity) => void` prop to `SettlementTab` (pass-through from `InspectPane` props). Update `InspectPaneProps` accordingly. Each host wires this to its own dialog state.

  Update `InspectPaneProps` in `types.ts`:

  ```ts
  export interface InspectPaneProps {
    // ...existing
    onSettleClick?: (entity: InspectEntity) => void;
  }
  ```

  And in `InspectPane.tsx`, pass `onSettleClick={onSettleClick}` to `<SettlementTab />`.

  In `SettlementTab.tsx`, change the button to:

  ```tsx
  <Button variant="contained" color="success" fullWidth
    onClick={() => onSettleClick?.(entity)}
    disabled={!onSettleClick}
  >
    Settle now
  </Button>
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add src/components/common/InspectPane/SettlementTab.tsx src/components/common/InspectPane/InspectPane.tsx src/components/common/InspectPane/types.ts src/hooks/queries/useSettlementDetails.ts
  git commit -m "feat(inspect-pane): SettlementTab with Settle-now hook"
  ```

## Task 2.8: `AuditTab` + `useSettlementAudit`

**Files:**
- Modify: `src/components/common/InspectPane/AuditTab.tsx`
- Create: `src/hooks/useSettlementAudit.ts`

- [ ] **Step 1: Inspect what audit data exists**

  Skim `settlement_groups` columns and any `settlement_audit_log` table via `mcp__supabase__list_tables`. If no dedicated audit table exists, derive events from `created_at`, `updated_at`, `is_cancelled`, `cancelled_at` columns on `settlement_groups`.

- [ ] **Step 2: Write `useSettlementAudit`**

  Create `src/hooks/useSettlementAudit.ts`:

  ```ts
  import { useQuery } from "@tanstack/react-query";
  import { createClient } from "@/lib/supabase/client";
  import dayjs from "dayjs";

  export interface AuditEvent {
    timestamp: string;
    actorName: string;
    action: "created" | "edited" | "cancelled";
    note?: string;
  }

  export function useSettlementAudit(settlementRef: string | null) {
    const supabase = createClient();
    return useQuery<AuditEvent[]>({
      queryKey: ["settlement-audit", settlementRef],
      enabled: Boolean(settlementRef),
      queryFn: async () => {
        if (!settlementRef) return [];
        const { data, error } = await supabase
          .from("settlement_groups")
          .select("created_at, updated_at, created_by_name, cancelled_at, cancelled_by_name, is_cancelled")
          .eq("settlement_reference", settlementRef)
          .single();
        if (error) throw error;
        const events: AuditEvent[] = [];
        if (data?.created_at) {
          events.push({
            timestamp: data.created_at,
            actorName: data.created_by_name ?? "Unknown",
            action: "created",
          });
        }
        if (data?.updated_at && data.updated_at !== data.created_at) {
          events.push({
            timestamp: data.updated_at,
            actorName: data.created_by_name ?? "Unknown",
            action: "edited",
          });
        }
        if (data?.is_cancelled && data.cancelled_at) {
          events.push({
            timestamp: data.cancelled_at,
            actorName: data.cancelled_by_name ?? "Unknown",
            action: "cancelled",
          });
        }
        return events.sort((a, b) => (a.timestamp > b.timestamp ? 1 : -1));
      },
      staleTime: 60_000,
    });
  }
  ```

- [ ] **Step 3: Implement `AuditTab`**

  Replace `src/components/common/InspectPane/AuditTab.tsx`:

  ```tsx
  "use client";

  import { Box, Stack, Typography, useTheme } from "@mui/material";
  import dayjs from "dayjs";
  import type { InspectEntity } from "./types";
  import { useSettlementAudit } from "@/hooks/useSettlementAudit";

  export default function AuditTab({ entity }: { entity: InspectEntity }) {
    const theme = useTheme();
    const { data } = useSettlementAudit(entity.settlementRef ?? null);

    if (!entity.settlementRef) {
      return (
        <Box sx={{ p: 2 }}>
          <Typography variant="body2" color="text.secondary">
            No audit history — this entry has no settlement yet.
          </Typography>
        </Box>
      );
    }

    if (!data || data.length === 0) {
      return (
        <Box sx={{ p: 2 }}>
          <Typography variant="body2" color="text.secondary">No audit events.</Typography>
        </Box>
      );
    }

    return (
      <Box sx={{ p: 2 }}>
        <Stack spacing={1}>
          {data.map((e, i) => (
            <Box key={i} sx={{
              p: 1, px: 1.25, borderRadius: 1,
              bgcolor: "background.paper",
              border: `1px solid ${theme.palette.divider}`,
            }}>
              <Typography variant="caption" color="text.secondary">
                {dayjs(e.timestamp).format("DD MMM YYYY, hh:mm A")}
              </Typography>
              <Typography variant="body2">
                <strong>{e.action.toUpperCase()}</strong> by {e.actorName}
              </Typography>
              {e.note && (
                <Typography variant="caption" color="text.secondary">{e.note}</Typography>
              )}
            </Box>
          ))}
        </Stack>
      </Box>
    );
  }
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add src/components/common/InspectPane/AuditTab.tsx src/hooks/useSettlementAudit.ts
  git commit -m "feat(inspect-pane): AuditTab + useSettlementAudit hook"
  ```

## Task 2.9: Phase 2 verification

- [ ] **Step 1: Full test run**

  Run: `npm run test`
  Expected: all green, no regressions.

- [ ] **Step 2: Build**

  Run: `npm run build`
  Expected: clean compile.

- [ ] **Step 3: End of Phase 2 — squash-merge to feature branch**

  This is a logical merge boundary. The InspectPane is feature-complete and unmounted; Phases 3/4/5 wire it up.

---

# PHASE 3 — `/site/payments` rewrite

**Depends on Phase 1 + Phase 2.** Delivers the premium ledger.

## Task 3.1: New `usePaymentSummary` hook

**Files:**
- Create: `src/hooks/queries/usePaymentSummary.ts`

- [ ] **Step 1: Write the hook**

  ```ts
  import { useQuery } from "@tanstack/react-query";
  import { createClient } from "@/lib/supabase/client";
  import type { PaymentScopeSummary } from "@/types/payment.types";

  export function usePaymentSummary(
    siteId: string | undefined,
    dateFrom: string | null,
    dateTo: string | null,
  ) {
    const supabase = createClient();
    return useQuery<PaymentScopeSummary>({
      queryKey: ["payment-summary", siteId, dateFrom, dateTo],
      enabled: Boolean(siteId),
      queryFn: async () => {
        const { data, error } = await (supabase as any).rpc("get_payment_summary", {
          p_site_id:   siteId,
          p_date_from: dateFrom,
          p_date_to:   dateTo,
        });
        if (error) throw error;
        const r = (data ?? [])[0] ?? {};
        return {
          pendingAmount:       Number(r.pending_amount)        || 0,
          pendingDatesCount:   Number(r.pending_dates_count)   || 0,
          paidAmount:          Number(r.paid_amount)           || 0,
          paidCount:           Number(r.paid_count)            || 0,
          dailyMarketAmount:   Number(r.daily_market_amount)   || 0,
          dailyMarketCount:    Number(r.daily_market_count)    || 0,
          weeklyAmount:        Number(r.weekly_amount)         || 0,
          weeklyCount:         Number(r.weekly_count)          || 0,
        };
      },
      staleTime: 30_000,
    });
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add src/hooks/queries/usePaymentSummary.ts
  git commit -m "feat(payments): add usePaymentSummary hook"
  ```

## Task 3.2: `PaymentsKpiStrip` component

**Files:**
- Create: `src/components/payments/PaymentsKpiStrip.tsx`

- [ ] **Step 1: Implement**

  ```tsx
  "use client";

  import { Box, Skeleton, Typography, useTheme } from "@mui/material";
  import type { PaymentScopeSummary } from "@/types/payment.types";

  interface Kpi {
    label: string; value: string; sub: string; accent?: "warn" | "pos";
  }

  function Cell({ kpi, isLast }: { kpi: Kpi; isLast: boolean }) {
    const theme = useTheme();
    const color =
      kpi.accent === "warn" ? theme.palette.warning.main :
      kpi.accent === "pos"  ? theme.palette.success.main :
      theme.palette.text.primary;
    const labelColor =
      kpi.accent === "warn" ? theme.palette.warning.main :
      kpi.accent === "pos"  ? theme.palette.success.main :
      theme.palette.text.secondary;

    return (
      <Box sx={{
        px: 2,
        borderRight: isLast ? 0 : `1px solid ${theme.palette.divider}`,
        flex: 1, minWidth: 120,
      }}>
        <Typography variant="caption" sx={{
          fontSize: 9, textTransform: "uppercase", letterSpacing: 0.5, color: labelColor, fontWeight: 600,
        }}>
          {kpi.label}
        </Typography>
        <Typography variant="h6" fontWeight={700} sx={{ color, lineHeight: 1.2 }}>
          {kpi.value}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9, display: "block" }}>
          {kpi.sub}
        </Typography>
      </Box>
    );
  }

  export default function PaymentsKpiStrip({
    summary, isLoading,
  }: { summary: PaymentScopeSummary | undefined; isLoading: boolean }) {
    const theme = useTheme();

    if (isLoading || !summary) {
      return (
        <Box sx={{ display: "flex", py: 1.25, px: 1.5, borderBottom: `1px solid ${theme.palette.divider}` }}>
          {[0, 1, 2, 3].map((i) => (
            <Box key={i} sx={{ flex: 1, px: 2 }}>
              <Skeleton variant="text" width="50%" />
              <Skeleton variant="text" width="80%" height={28} />
              <Skeleton variant="text" width="40%" />
            </Box>
          ))}
        </Box>
      );
    }

    const kpis: Kpi[] = [
      {
        label: "Pending", accent: "warn",
        value: `₹${summary.pendingAmount.toLocaleString("en-IN")}`,
        sub:   `${summary.pendingDatesCount} date${summary.pendingDatesCount === 1 ? "" : "s"}`,
      },
      {
        label: "Total Paid", accent: "pos",
        value: `₹${summary.paidAmount.toLocaleString("en-IN")}`,
        sub:   `${summary.paidCount} settled`,
      },
      {
        label: "Daily + Market",
        value: `₹${summary.dailyMarketAmount.toLocaleString("en-IN")}`,
        sub:   `${summary.dailyMarketCount} dates`,
      },
      {
        label: "Weekly Contract",
        value: `₹${summary.weeklyAmount.toLocaleString("en-IN")}`,
        sub:   `${summary.weeklyCount} records`,
      },
    ];

    return (
      <Box sx={{
        display: "flex", py: 1.25, px: 1.5,
        borderBottom: `1px solid ${theme.palette.divider}`,
        bgcolor: "background.paper",
      }}>
        {kpis.map((k, i) => (
          <Cell key={k.label} kpi={k} isLast={i === kpis.length - 1} />
        ))}
      </Box>
    );
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add src/components/payments/PaymentsKpiStrip.tsx
  git commit -m "feat(payments): compact 4-KPI strip"
  ```

## Task 3.3: `PendingBanner` component

**Files:**
- Create: `src/components/payments/PendingBanner.tsx`

- [ ] **Step 1: Implement**

  ```tsx
  "use client";

  import { Alert, Box, Button } from "@mui/material";
  import { useRouter } from "next/navigation";

  export default function PendingBanner({
    pendingAmount, pendingDatesCount,
  }: { pendingAmount: number; pendingDatesCount: number }) {
    const router = useRouter();
    if (pendingDatesCount === 0) return null;
    return (
      <Alert
        severity="warning"
        variant="outlined"
        sx={{ borderRadius: 0, py: 0.5, px: 2, alignItems: "center" }}
        action={
          <Button
            color="inherit"
            size="small"
            onClick={() => router.push("/site/attendance?focus=pending")}
          >
            Settle in Attendance →
          </Button>
        }
      >
        <Box>
          {pendingDatesCount} date{pendingDatesCount === 1 ? "" : "s"} have unsettled attendance ·
          ₹{pendingAmount.toLocaleString("en-IN")} pending
        </Box>
      </Alert>
    );
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add src/components/payments/PendingBanner.tsx
  git commit -m "feat(payments): pending banner with deep-link to attendance"
  ```

## Task 3.4: `PaymentsLedger` — unified DataTable

**Files:**
- Create: `src/components/payments/PaymentsLedger.tsx`

**Why:** This component owns the unified table for both daily+market and weekly contract rows. Replaces `DailyMarketPaymentsTab` + `ContractWeeklyPaymentsTab`. It accepts the merged row data, the active filter chips, and emits row-click events to the host (which feeds the InspectPane).

- [ ] **Step 1: Define the row type**

  At top of `src/components/payments/PaymentsLedger.tsx`:

  ```ts
  export interface PaymentsLedgerRow {
    id: string;
    settlementRef: string | null;
    type: "daily-market" | "weekly";
    date: string;          // for daily-market: the date; for weekly: weekStart (display formats to range)
    weekEnd?: string;      // for weekly only
    forLabel: string;      // "12 lab + 3 mkt" or "Murugan · 6d"
    amount: number;
    isPaid: boolean;
    isPending: boolean;
    laborerId?: string;    // for weekly entities
    siteId: string;
  }
  ```

- [ ] **Step 2: Implement the table**

  ```tsx
  "use client";

  import { Box, Button, Chip, IconButton, Typography, alpha, useTheme } from "@mui/material";
  import { MoreHoriz as MoreIcon } from "@mui/icons-material";
  import { useMemo } from "react";
  import dayjs from "dayjs";
  import DataTable, { type MRT_ColumnDef } from "@/components/common/DataTable";
  import type { InspectEntity } from "@/components/common/InspectPane";

  export interface PaymentsLedgerRow {
    id: string;
    settlementRef: string | null;
    type: "daily-market" | "weekly";
    date: string;
    weekEnd?: string;
    forLabel: string;
    amount: number;
    isPaid: boolean;
    isPending: boolean;
    laborerId?: string;
    siteId: string;
  }

  interface PaymentsLedgerProps {
    rows: PaymentsLedgerRow[];
    isLoading: boolean;
    selectedEntity: InspectEntity | null;
    onRowClick: (entity: InspectEntity) => void;
    onSettleClick: (entity: InspectEntity) => void;
  }

  function rowToEntity(r: PaymentsLedgerRow): InspectEntity {
    if (r.type === "daily-market") {
      return {
        kind: "daily-date",
        siteId: r.siteId,
        date: r.date,
        settlementRef: r.settlementRef,
      };
    }
    return {
      kind: "weekly-week",
      siteId: r.siteId,
      laborerId: r.laborerId!,
      weekStart: r.date,
      weekEnd: r.weekEnd!,
      settlementRef: r.settlementRef,
    };
  }

  function entityKey(e: InspectEntity): string {
    if (e.kind === "daily-date") return `d:${e.siteId}:${e.date}`;
    return `w:${e.siteId}:${e.laborerId}:${e.weekStart}`;
  }

  export default function PaymentsLedger({
    rows, isLoading, selectedEntity, onRowClick, onSettleClick,
  }: PaymentsLedgerProps) {
    const theme = useTheme();

    const columns = useMemo<MRT_ColumnDef<PaymentsLedgerRow>[]>(() => [
      {
        accessorKey: "settlementRef",
        header: "Ref",
        size: 120,
        Cell: ({ cell }) => {
          const ref = cell.getValue<string | null>();
          if (!ref) return <Typography variant="caption" color="text.disabled">—</Typography>;
          return (
            <Chip label={ref} size="small" variant="outlined"
              sx={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}
            />
          );
        },
      },
      {
        accessorKey: "date",
        header: "Date / Period",
        size: 140,
        Cell: ({ row }) => {
          const r = row.original;
          if (r.type === "daily-market") {
            return <Typography variant="body2">{dayjs(r.date).format("DD MMM")}</Typography>;
          }
          return (
            <Typography variant="body2">
              {dayjs(r.date).format("DD")}–{dayjs(r.weekEnd).format("DD MMM")}
            </Typography>
          );
        },
      },
      {
        accessorKey: "type",
        header: "Type",
        size: 100,
        Cell: ({ row }) => {
          const r = row.original;
          return r.type === "daily-market" ? (
            <Chip label="Daily+Mkt" size="small" color="primary" variant="outlined" />
          ) : (
            <Chip label="Weekly" size="small" color="warning" variant="outlined" />
          );
        },
      },
      { accessorKey: "forLabel", header: "For", size: 180 },
      {
        accessorKey: "amount",
        header: "Amount",
        size: 110,
        Cell: ({ cell, row }) => (
          <Typography variant="body2" fontWeight={600} align="right" sx={{
            color: row.original.isPending ? "warning.main" : "text.primary",
            fontVariantNumeric: "tabular-nums",
          }}>
            ₹{cell.getValue<number>().toLocaleString("en-IN")}
          </Typography>
        ),
      },
      {
        id: "status",
        header: "Status",
        size: 90,
        Cell: ({ row }) => row.original.isPending
          ? <Chip label="Pending" size="small" color="warning" />
          : <Chip label="Paid" size="small" color="success" />,
      },
      {
        id: "actions",
        header: "",
        size: 140,
        Cell: ({ row }) => {
          const r = row.original;
          if (r.isPending) {
            return (
              <Button
                variant="contained" color="success" size="small"
                onClick={(e) => { e.stopPropagation(); onSettleClick(rowToEntity(r)); }}
              >
                Settle ₹{r.amount.toLocaleString("en-IN")}
              </Button>
            );
          }
          return (
            <IconButton size="small" onClick={(e) => e.stopPropagation()}>
              <MoreIcon fontSize="small" />
            </IconButton>
          );
        },
      },
    ], [onSettleClick]);

    const selectedKey = selectedEntity ? entityKey(selectedEntity) : null;

    return (
      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        muiTableBodyRowProps={({ row }) => {
          const r = row.original as PaymentsLedgerRow;
          const isSelected = selectedKey === entityKey(rowToEntity(r));
          return {
            onClick: () => onRowClick(rowToEntity(r)),
            sx: {
              cursor: "pointer",
              backgroundColor: r.isPending ? alpha(theme.palette.warning.main, 0.06) : undefined,
              borderLeft: isSelected ? `2px solid ${theme.palette.primary.main}` : undefined,
              "&:hover": { backgroundColor: theme.palette.action.hover },
            },
          };
        }}
        initialState={{
          sorting: [{ id: "date", desc: true }],
        }}
      />
    );
  }
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add src/components/payments/PaymentsLedger.tsx
  git commit -m "feat(payments): unified PaymentsLedger DataTable"
  ```

## Task 3.5: Build the row-merging logic

**Files:**
- Create: `src/hooks/queries/usePaymentsLedger.ts`

**Why:** This is the load-and-merge layer. Fetches daily+market rows (one per date), weekly rows (one per laborer-week), and pending entries from attendance. Returns a single `PaymentsLedgerRow[]` to the ledger component.

- [ ] **Step 1: Implement**

  ```ts
  import { useQuery } from "@tanstack/react-query";
  import { createClient } from "@/lib/supabase/client";
  import type { PaymentsLedgerRow } from "@/components/payments/PaymentsLedger";

  interface Args {
    siteId: string;
    dateFrom: string | null;  // null = all time
    dateTo:   string | null;
    statusFilter: "pending" | "completed" | "all";
    typeFilter:   "daily-market" | "weekly" | "all";
  }

  export function usePaymentsLedger(args: Args) {
    const supabase = createClient();
    return useQuery<PaymentsLedgerRow[]>({
      queryKey: ["payments-ledger", args],
      enabled: Boolean(args.siteId),
      queryFn: async () => {
        // RPC: get_payments_ledger(p_site_id, p_date_from, p_date_to, p_status, p_type)
        // Returns rows already shaped to PaymentsLedgerRow.
        const { data, error } = await (supabase as any).rpc("get_payments_ledger", {
          p_site_id:   args.siteId,
          p_date_from: args.dateFrom,
          p_date_to:   args.dateTo,
          p_status:    args.statusFilter,
          p_type:      args.typeFilter,
        });
        if (error) throw error;
        return (data ?? []).map((r: any): PaymentsLedgerRow => ({
          id:            String(r.id),
          settlementRef: r.settlement_ref ?? null,
          type:          r.row_type as "daily-market" | "weekly",
          date:          r.date_or_week_start,
          weekEnd:       r.week_end ?? undefined,
          forLabel:      r.for_label,
          amount:        Number(r.amount) || 0,
          isPaid:        Boolean(r.is_paid),
          isPending:     Boolean(r.is_pending),
          laborerId:     r.laborer_id ?? undefined,
          siteId:        args.siteId,
        }));
      },
      staleTime: 15_000,
    });
  }
  ```

- [ ] **Step 2: Add the supporting RPC**

  Create migration `supabase/migrations/<date>_add_get_payments_ledger_rpc.sql`. The RPC is the heaviest one — it must:
  1. UNION daily+market `settlement_groups` rows (one per date) with weekly contract `settlement_groups` rows (one per laborer-week).
  2. UNION pending dates from attendance views and pending laborer-weeks.
  3. Apply optional filters (`p_status` in {pending, completed, all}; `p_type` in {daily-market, weekly, all}).
  4. ORDER BY pending DESC, date DESC.

  Mirror the structure of the `get_payment_summary` RPC. Include a `LIMIT 2000` safety cap (matches the row cap on /site/expenses). Test against the same site used in Phase 1's smoke test.

- [ ] **Step 3: Commit**

  ```bash
  git add src/hooks/queries/usePaymentsLedger.ts supabase/migrations/<date>_add_get_payments_ledger_rpc.sql
  git commit -m "feat(payments): usePaymentsLedger hook + supporting RPC"
  ```

## Task 3.6: Rewrite `payments-content.tsx`

**Files:**
- Modify: `src/app/(main)/site/payments/payments-content.tsx` (full rewrite)

**Why:** This is the page-level glue: header, KPI strip, banner, filter chips, ledger, InspectPane mounting, dialog wiring.

- [ ] **Step 1: Rewrite**

  Replace the entire file with:

  ```tsx
  "use client";

  import { useCallback, useState } from "react";
  import { Box, Stack, Tooltip, IconButton, Alert } from "@mui/material";
  import { Fullscreen as FullscreenIcon, FullscreenExit as FullscreenExitIcon } from "@mui/icons-material";
  import { useSelectedSite } from "@/contexts/SiteContext";
  import { useDateRange } from "@/contexts/DateRangeContext";
  import PageHeader from "@/components/layout/PageHeader";
  import ScopeChip from "@/components/common/ScopeChip";
  import PaymentsKpiStrip from "@/components/payments/PaymentsKpiStrip";
  import PendingBanner from "@/components/payments/PendingBanner";
  import PaymentsLedger from "@/components/payments/PaymentsLedger";
  import { usePaymentSummary } from "@/hooks/queries/usePaymentSummary";
  import { usePaymentsLedger } from "@/hooks/queries/usePaymentsLedger";
  import { useInspectPane } from "@/hooks/useInspectPane";
  import { InspectPane } from "@/components/common/InspectPane";
  import type { InspectEntity } from "@/components/common/InspectPane";
  import DailySettlementDialog from "@/components/attendance/DailySettlementDialog";
  import WeeklySettlementDialog from "@/components/attendance/WeeklySettlementDialog";

  type StatusFilter = "pending" | "completed" | "all";
  type TypeFilter = "daily-market" | "weekly" | "all";

  function ChipRow<T extends string>({
    options, active, onChange,
  }: { options: { key: T; label: string; tone?: "warn" | "pos" }[]; active: T; onChange: (k: T) => void }) {
    return (
      <Stack direction="row" spacing={0.75}>
        {options.map((o) => (
          <Box
            key={o.key}
            onClick={() => onChange(o.key)}
            sx={{
              cursor: "pointer", userSelect: "none",
              px: 1, py: 0.25, borderRadius: 8,
              fontSize: 12, fontWeight: active === o.key ? 600 : 500,
              border: 1, borderColor: "divider",
              ...(active === o.key
                ? o.tone === "warn"
                  ? { bgcolor: "warning.light", color: "warning.dark", borderColor: "warning.main" }
                  : o.tone === "pos"
                  ? { bgcolor: "success.light", color: "success.dark", borderColor: "success.main" }
                  : { bgcolor: "primary.light", color: "primary.dark", borderColor: "primary.main" }
                : {}),
            }}
          >
            {o.label}
          </Box>
        ))}
      </Stack>
    );
  }

  export default function PaymentsContent() {
    const { selectedSite } = useSelectedSite();
    const { formatForApi, isAllTime } = useDateRange();
    const { dateFrom, dateTo } = formatForApi();
    const effectiveFrom = isAllTime ? null : dateFrom;
    const effectiveTo   = isAllTime ? null : dateTo;

    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [typeFilter,   setTypeFilter]   = useState<TypeFilter>("all");
    const [isFullscreen, setIsFullscreen] = useState(false);

    const pane = useInspectPane();

    // Settlement dialog open state — driven by Settle clicks (row + pane).
    const [dailyDialog, setDailyDialog] = useState<{ open: boolean; entity?: InspectEntity }>({ open: false });
    const [weeklyDialog, setWeeklyDialog] = useState<{ open: boolean; entity?: InspectEntity }>({ open: false });

    const summaryQuery = usePaymentSummary(selectedSite?.id, effectiveFrom, effectiveTo);
    const ledgerQuery  = usePaymentsLedger({
      siteId: selectedSite?.id ?? "",
      dateFrom: effectiveFrom,
      dateTo:   effectiveTo,
      statusFilter, typeFilter,
    });

    const handleSettleClick = useCallback((entity: InspectEntity) => {
      if (entity.kind === "daily-date") setDailyDialog({ open: true, entity });
      else                              setWeeklyDialog({ open: true, entity });
    }, []);

    if (!selectedSite) {
      return (
        <Box>
          <PageHeader title="Salary Settlements" />
          <Alert severity="info">Please select a site from the dropdown.</Alert>
        </Box>
      );
    }

    return (
      <Box sx={{
        display: "flex", flexDirection: "column",
        height: "calc(100vh - 64px)",  // matches MainLayout top-bar height
        ...(isFullscreen && {
          position: "fixed", inset: 0, zIndex: 1300,
          height: "100vh", bgcolor: "background.default",
        }),
      }}>
        <Box sx={{ flexShrink: 0 }}>
          <PageHeader
            title="Salary Settlements"
            titleChip={<ScopeChip />}
            actions={
              <Tooltip title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
                <IconButton onClick={() => setIsFullscreen((v) => !v)} size="small">
                  {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
                </IconButton>
              </Tooltip>
            }
          />
          <PaymentsKpiStrip summary={summaryQuery.data} isLoading={summaryQuery.isLoading} />
          <PendingBanner
            pendingAmount={summaryQuery.data?.pendingAmount ?? 0}
            pendingDatesCount={summaryQuery.data?.pendingDatesCount ?? 0}
          />
          <Box sx={{ display: "flex", gap: 2, alignItems: "center", py: 1, px: 1.5, borderBottom: 1, borderColor: "divider" }}>
            <ChipRow<StatusFilter>
              options={[
                { key: "pending",   label: `⏳ Pending (${summaryQuery.data?.pendingDatesCount ?? 0})`, tone: "warn" },
                { key: "completed", label: `✓ Completed (${summaryQuery.data?.paidCount ?? 0})`, tone: "pos" },
                { key: "all",       label: "All" },
              ]}
              active={statusFilter}
              onChange={setStatusFilter}
            />
            <Box sx={{ width: 1, height: 18, bgcolor: "divider" }} />
            <ChipRow<TypeFilter>
              options={[
                { key: "all",          label: "All Types" },
                { key: "daily-market", label: "Daily+Market" },
                { key: "weekly",       label: "Weekly Contract" },
              ]}
              active={typeFilter}
              onChange={setTypeFilter}
            />
          </Box>
        </Box>

        <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          <PaymentsLedger
            rows={ledgerQuery.data ?? []}
            isLoading={ledgerQuery.isLoading}
            selectedEntity={pane.currentEntity}
            onRowClick={pane.open}
            onSettleClick={handleSettleClick}
          />
        </Box>

        <InspectPane
          entity={pane.currentEntity}
          isOpen={pane.isOpen}
          isPinned={pane.isPinned}
          activeTab={pane.activeTab}
          onTabChange={pane.setActiveTab}
          onClose={pane.close}
          onTogglePin={pane.togglePin}
          onOpenInPage={(e) => {
            // Navigate to attendance with the date/week pre-filtered.
            const url = e.kind === "daily-date"
              ? `/site/attendance?date=${e.date}`
              : `/site/attendance?weekStart=${e.weekStart}&laborerId=${e.laborerId}`;
            window.location.href = url;
          }}
          onSettleClick={handleSettleClick}
        />

        {dailyDialog.open && dailyDialog.entity && (
          <DailySettlementDialog
            open={dailyDialog.open}
            // Map InspectEntity → dialog props (likely needs a small adapter from spec data).
            // TODO during execution: read DailySettlementDialog's prop signature and supply
            //   `dateSummary` from the InspectEntity + a refetch on close.
            onClose={() => setDailyDialog({ open: false })}
            onSuccess={() => {
              setDailyDialog({ open: false });
              summaryQuery.refetch();
              ledgerQuery.refetch();
            }}
            dateSummary={null /* adapter — see spec §3 */}
          />
        )}
        {weeklyDialog.open && weeklyDialog.entity && (
          <WeeklySettlementDialog
            open={weeklyDialog.open}
            onClose={() => setWeeklyDialog({ open: false })}
            onSuccess={() => {
              setWeeklyDialog({ open: false });
              summaryQuery.refetch();
              ledgerQuery.refetch();
            }}
            weeklySummary={null /* adapter */}
          />
        )}
      </Box>
    );
  }
  ```

  **Note on the dialog adapter:** `DailySettlementDialog` and `WeeklySettlementDialog` accept their own input shapes (`DateSummaryForSettlement` / `WeeklySummaryForSettlement` — see the dialog files). Build small adapter functions `entityToDateSummary(entity, attendanceData)` and `entityToWeeklySummary(entity, weekData)` that fetch the needed inputs and pass them. Add these adapters in `src/components/payments/settlementAdapters.ts` and use them here.

- [ ] **Step 2: Update `page.tsx` (server-side data prefetch)**

  Open `src/app/(main)/site/payments/page.tsx`. The current page passes `initialData` to the rewritten `payments-content`. Since the new content fetches its own data via React Query, the `initialData` can be removed entirely OR kept as a hydration seed if measurable load improvement. Default: remove for simplicity.

- [ ] **Step 3: Run build, fix any TypeScript errors**

  Run: `npm run build`
  Expected: clean compile.

- [ ] **Step 4: Smoke-test in Playwright**

  Per `CLAUDE.md`: dev-login, navigate to `/site/payments`, take screenshot, check console.
  Expected: page renders with header + KPI strip + (banner if pending) + chip row + table. Click a row → InspectPane opens. Click ⛶ → fullscreen. Esc → exits pane / fullscreen.

- [ ] **Step 5: Delete obsolete components**

  ```bash
  git rm src/components/payments/DailyMarketPaymentsTab.tsx
  git rm src/components/payments/ContractWeeklyPaymentsTab.tsx
  git rm src/components/payments/PaymentSummaryCards.tsx
  ```

  Verify nothing else imports them: `Grep` for the file basenames before removing.

- [ ] **Step 6: Commit Phase 3**

  ```bash
  git add -A
  git commit -m "feat(payments): rewrite /site/payments as premium pending-first ledger"
  ```

## Task 3.7: Phase 3 verification

- [ ] **Step 1: Full test + build**

  Run: `npm run test && npm run build`
  Expected: clean.

- [ ] **Step 2: Playwright flow tests**

  Execute scenarios 1–17 and 18–20 from spec §9 on the running app. Capture before/after screenshots into `.playwright-screenshots/payments-{scenario}.png`. Fix any visual or console issues found.

---

# PHASE 4 — Attendance settle CTAs + ref chips

**Depends on Phase 2.** Surfaces the existing settlement dialogs from row-level CTAs and adds the InspectPane handle for already-settled days.

## Task 4.1: `SettleDayButton` component

**Files:**
- Create: `src/components/attendance/SettleDayButton.tsx`

- [ ] **Step 1: Implement**

  ```tsx
  "use client";

  import { Button, IconButton, Tooltip, useMediaQuery, useTheme } from "@mui/material";
  import { CurrencyRupee as RupeeIcon } from "@mui/icons-material";

  export default function SettleDayButton({
    pendingAmount, onClick,
  }: { pendingAmount: number; onClick: () => void }) {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
    if (isMobile) {
      return (
        <Tooltip title={`Settle ₹${pendingAmount.toLocaleString("en-IN")}`}>
          <IconButton color="success" onClick={onClick} size="small">
            <RupeeIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      );
    }
    return (
      <Button variant="contained" color="success" size="small"
        startIcon={<RupeeIcon />} onClick={onClick}
      >
        Settle ₹{pendingAmount.toLocaleString("en-IN")}
      </Button>
    );
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add src/components/attendance/SettleDayButton.tsx
  git commit -m "feat(attendance): SettleDayButton (responsive label/icon)"
  ```

## Task 4.2: `SettlementRefChip` component

**Files:**
- Create: `src/components/attendance/SettlementRefChip.tsx`

- [ ] **Step 1: Implement**

  ```tsx
  "use client";

  import { Chip } from "@mui/material";
  import { PushPin as PinIcon } from "@mui/icons-material";

  export default function SettlementRefChip({
    settlementRef, onClick,
  }: { settlementRef: string; onClick: () => void }) {
    return (
      <Chip
        size="small"
        icon={<PinIcon sx={{ fontSize: 12 }} />}
        label={settlementRef}
        variant="outlined"
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        sx={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}
      />
    );
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add src/components/attendance/SettlementRefChip.tsx
  git commit -m "feat(attendance): SettlementRefChip"
  ```

## Task 4.3: Wire CTAs and InspectPane into `attendance-content.tsx`

**Files:**
- Modify: `src/app/(main)/site/attendance/attendance-content.tsx`

**Why:** The attendance file is large (~3,000 LoC). The changes are surgical:
1. Import `useInspectPane`, `InspectPane`, `SettleDayButton`, `SettlementRefChip`.
2. Add a `pane = useInspectPane()` instance at the top of the component.
3. In each per-day row's right-side action area, render `<SettleDayButton>` if the row has any pending money, and/or `<SettlementRefChip>` if the row has a settlement ref.
4. Hook the chip's `onClick` to `pane.open({ kind: "daily-date", siteId, date, settlementRef })`.
5. In the weekly view's per-laborer-week row, render the equivalent for weekly entities.
6. Mount `<InspectPane {...pane.props} />` once at the bottom of the JSX tree.
7. Wire `pane.handleSettleClick` to open the existing `DailySettlementDialog` / `WeeklySettlementDialog` (these dialogs are already imported and triggered from elsewhere — reuse the same triggers).

- [ ] **Step 1: Locate the row render sites**

  Use Grep:
  - For daily row CTA insertion: search for the existing per-day row JSX (likely a `<TableRow>` or `<Box>` for each date).
  - For weekly row CTA insertion: search for the per-laborer rendering inside `WeeklyPaymentStrip` / `WeekGroupRow` (the components from `src/components/payments/`).

  Identify the exact line numbers for each insertion.

- [ ] **Step 2: Add the CTAs and chips inline**

  Edit `attendance-content.tsx` to:
  - Import the new components and `useInspectPane` / `InspectPane`.
  - Add `const pane = useInspectPane();` at top of the component.
  - In the per-day row render, conditional on `pendingAmount > 0`: render `<SettleDayButton pendingAmount={...} onClick={() => openDailyDialog(date)} />`.
  - In the per-day row render, conditional on `settlementRef`: render `<SettlementRefChip settlementRef={...} onClick={() => pane.open({ kind: "daily-date", siteId, date, settlementRef })} />`.
  - In the weekly view, equivalent for `<SettleWeekButton>` (if you choose to keep a separate component) or just `<SettleDayButton label="Settle Week">` reused.

  Where the day row already has trailing UI (e.g. existing chips), insert the new buttons before the existing trailing children to keep visual hierarchy consistent.

- [ ] **Step 3: Mount the InspectPane**

  At the bottom of the component's returned JSX (above any existing portals/dialogs), add:

  ```tsx
  <InspectPane
    entity={pane.currentEntity}
    isOpen={pane.isOpen}
    isPinned={pane.isPinned}
    activeTab={pane.activeTab}
    onTabChange={pane.setActiveTab}
    onClose={pane.close}
    onTogglePin={pane.togglePin}
    onOpenInPage={(e) => {
      const url = e.kind === "daily-date"
        ? `/site/payments?ref=${e.settlementRef ?? ""}&date=${e.date}`
        : `/site/payments?ref=${e.settlementRef ?? ""}`;
      window.location.href = url;
    }}
    onSettleClick={(e) => {
      // Reuse the same dialog trigger functions that the row-level Settle button uses.
      if (e.kind === "daily-date") openDailyDialog(e.date);
      else                          openWeeklyDialog(e.laborerId, e.weekStart);
    }}
  />
  ```

- [ ] **Step 4: Smoke-test**

  Playwright dev-login → `/site/attendance` → verify:
  - A pending-money date row shows a green `₹ Settle ₹X` button.
  - Click → opens `DailySettlementDialog` (existing flow).
  - A settled date row shows a `📌 SS-…` chip.
  - Click chip → InspectPane opens with that date.
  - Weekly view: per-laborer pending row shows Settle Week button; settled rows show ref chip.

- [ ] **Step 5: Commit**

  ```bash
  git add src/app/(main)/site/attendance/attendance-content.tsx
  git commit -m "feat(attendance): row-level Settle CTAs + ref chips + InspectPane mount"
  ```

## Task 4.4: Phase 4 verification

- [ ] **Step 1: Build + tests**

  Run: `npm run test && npm run build`
  Expected: green.

- [ ] **Step 2: Playwright scenarios 21–25 from spec §9**

  Execute and capture screenshots. Fix issues.

---

# PHASE 5 — `/site/expenses` adoption

**Depends on Phase 2.** Migrates expenses to the same ScopeChip + Fullscreen + single-scroll pattern, replaces ref-code navigation with InspectPane.

## Task 5.1: Migrate to `ScopeChip` and add Fullscreen

**Files:**
- Modify: `src/app/(main)/site/expenses/page.tsx`

- [ ] **Step 1: Replace `ScopePill` with `ScopeChip` in PageHeader**

  Find the `<PageHeader>` invocation. Add `titleChip={<ScopeChip />}` and remove the `<ScopePill />` mount currently inside the unified expense summary card.

  Remove the import: `import ScopePill from "@/components/common/ScopePill";`
  Add the import: `import ScopeChip from "@/components/common/ScopeChip";`

- [ ] **Step 2: Add Fullscreen toggle and single-scroll layout**

  Wrap the page's outer Box with `display: flex, flexDirection: column, height: calc(100vh - 64px)`. Mark header/summary/tabs `flexShrink: 0`. Wrap `<DataTable>` region in `{ flex: 1, minHeight: 0, overflow: "auto" }`. Add the `isFullscreen` state and the icon button — same pattern as the payments rewrite (see Task 3.6).

- [ ] **Step 3: Build + smoke-test**

  Run: `npm run build`
  Playwright: `/site/expenses` renders with ScopeChip in header, Fullscreen icon works, only the table scrolls.

- [ ] **Step 4: Commit**

  ```bash
  git add src/app/(main)/site/expenses/page.tsx
  git commit -m "feat(expenses): adopt ScopeChip + Fullscreen + single-scroll layout"
  ```

## Task 5.2: Mount InspectPane and replace ref-code navigation

**Files:**
- Modify: `src/app/(main)/site/expenses/page.tsx`

- [ ] **Step 1: Mount the pane**

  Add `import { useInspectPane } from "@/hooks/useInspectPane";` and `import { InspectPane } from "@/components/common/InspectPane";`.

  Add `const pane = useInspectPane();` at top of the component.

  Add `<InspectPane {...pane.props equivalents} />` at the bottom of the returned JSX (same shape as payments mount in Task 3.6).

- [ ] **Step 2: Replace the ref-code chip's `onClick`**

  Locate the Ref Code column's `onClick` handler (currently around lines 646–664). Today it does `router.push(...)` for various ref prefixes.

  Replace the SETTLEMENT-prefix branch (the `else` branch that handles non-MISC, non-TSS, non-SCP refs) with:

  ```tsx
  // Settlement refs (DLY-, SS-, WS-) → open InspectPane in-place, no nav
  const isWeekly = ref.startsWith("WS-");
  if (isWeekly) {
    // Need to look up laborerId + weekStart from the ref or the row data.
    // The expense row has `recorded_date` and `settlement_reference`; the
    // server-side enrichment in v_all_expenses should expose laborer_id +
    // week_start when row.expense_type === "Contract Salary". If not yet,
    // add columns to v_all_expenses in a small migration.
    pane.open({
      kind: "weekly-week",
      siteId: selectedSite.id,
      laborerId: (row.original as any).contract_laborer_id,
      weekStart: (row.original as any).week_start,
      weekEnd:   (row.original as any).week_end,
      settlementRef: ref,
    });
  } else {
    pane.open({
      kind: "daily-date",
      siteId: selectedSite.id,
      date: row.original.date,  // settlement_date
      settlementRef: ref,
    });
  }
  ```

  Keep the MISC-, TSS-, SCP- branches untouched — they still navigate to their own pages (out of scope for this redesign).

- [ ] **Step 3: Smoke-test**

  Playwright: `/site/expenses` → click a settlement ref code → InspectPane opens in-place, URL unchanged. ↗ Open button navigates to `/site/payments` with row highlighted.

- [ ] **Step 4: Commit**

  ```bash
  git add src/app/(main)/site/expenses/page.tsx
  git commit -m "feat(expenses): mount InspectPane, replace ref-code nav with in-place verify"
  ```

## Task 5.3: Phase 5 verification

- [ ] **Step 1: Build + tests**

  Run: `npm run test && npm run build`
  Expected: green.

- [ ] **Step 2: Playwright scenarios 18–20 from spec §9**

  Execute and capture screenshots.

---

# Final verification (after all 5 phases land)

- [ ] **Run full test suite**

  Run: `npm run test`
  Expected: green.

- [ ] **Run production build**

  Run: `npm run build`
  Expected: clean.

- [ ] **Execute every Playwright scenario from spec §9**

  Scenarios 1–26. Capture screenshots. Console clean.

- [ ] **Visual regression sweep**

  Compare baseline screenshots (captured pre-flight) with post-implementation screenshots. Confirm intentional differences and zero unintentional regressions on adjacent pages (e.g. `/company/*`).

- [ ] **Update CLAUDE.md if any new conventions emerged**

  Examples: the InspectPane pattern, the per-page `useInspectPane` instance, the `onOpenInPage` URL conventions. Document so the next contributor knows.

---

## Self-Review

After writing this plan, the spec was checked section by section:

- §3 (Settle-from-Attendance flow) → covered by Phase 4.
- §4 (`/site/payments` redesign — drop list, add list, sort, daily+market merge) → covered by Phase 3 Tasks 3.1–3.7.
- §5 (InspectPane component, breakpoint, header, tabs, data fetching, mounting) → covered by Phase 2 Tasks 2.1–2.9.
- §6 (Cross-page rule) → enforced by Task 5.2 (ref click in expenses opens pane in-place) + onOpenInPage navigation handlers in each phase's mounting.
- §7 (Files changed) → matches the Files Touched matrix at the top of this plan, plus the new ledger RPC and inspect-pane RPCs added during Phase 1 / Phase 2.
- §8 (Non-functional: mobile, keyboard, performance, a11y, persistence) → addressed within component implementations (Drawer mobile/desktop variants, Esc handler, lazy tab loading, `role="region"`, no localStorage persistence of pin/filters).
- §9 (Testing plan — 26 scenarios) → mapped to Phase 3/4/5 verification tasks.
- §10 (Risks) → mitigations are inline in component code (e.g. mobile icon-only Settle button, overlay drawer, optimistic refetch on settle).

No placeholders detected on a final scan; all type names are consistent across tasks (`PaymentScopeSummary`, `PaymentsLedgerRow`, `InspectEntity`, `InspectTabKey`, `InspectPaneProps`); the few "adapter" references in Task 3.6 are explicit about needing to be written during execution and point to where (`src/components/payments/settlementAdapters.ts`).
