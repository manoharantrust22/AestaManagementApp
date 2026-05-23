# Expenses Mobile Redesign + Infinite Scroll Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/site/expenses` (the V2 redesign that's live in prod) mobile-friendly and fix the infinite-scroll bug where loading stalls after ~50 records.

**Architecture:** Two parallel tracks: (a) data-layer refactor of `useExpensesData` from window re-fetch to append-mode cursor pagination, which eliminates both the "keeps loading past end-of-data" bug and the IntersectionObserver sentinel-remount race; (b) presentation tweaks on the page and three card components for narrow viewports — remove the redundant mobile FAB, compact the header, hide low-value table columns on mobile (sticky-left Date), collapse the secondary filter dropdowns into a bottom sheet, and shrink the KPI / breakdown / trade cards. Reorder the mobile Overview tab so the at-a-glance numbers + trade strip come before the breakdown.

**Tech Stack:** Next.js 15, MUI v7, Supabase JS, React hooks, Vitest for unit tests, Playwright for visual verification. PostgREST `or()` filter syntax for the cursor predicate.

**Spec:** `docs/superpowers/specs/2026-05-23-expenses-mobile-redesign-design.md`

---

## File overview

| File | Change |
|------|--------|
| `src/hooks/queries/useExpensesData.ts` | Cursor pagination refactor; extract pure helpers for unit-testability |
| `src/hooks/queries/useExpensesData.test.ts` | NEW — unit tests for the pure cursor / append helpers |
| `src/app/(main)/site/expenses/page.v2.tsx` | Remove FAB; compact header; mobile column visibility; mobile filter bottom sheet; Overview order; tab label |
| `src/components/expenses/ExpenseKPICards.tsx` | Smaller typography + padding on mobile |
| `src/components/expenses/MoneyBreakdownCard.tsx` | Tighter chips on mobile; collapse Subcontracts panel into a tappable row |
| `src/components/expenses/TradeMetricCards.tsx` | Horizontal scroll-snap strip on mobile |
| `supabase/migrations/YYYYMMDD_*.sql` | Conditional — only if EXPLAIN shows missing indexes for the cursor predicate |

---

## Task 1: Extract pure helpers for cursor pagination

**Why first:** Pure helpers are TDD-testable in isolation; getting them right de-risks the bigger hook refactor in Task 2.

**Files:**
- Modify: `src/hooks/queries/useExpensesData.ts` — add exported helpers (no behavior change yet)
- Create: `src/hooks/queries/useExpensesData.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/queries/useExpensesData.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  buildCursorFromLastRow,
  buildCursorPredicate,
  appendPageDedupe,
  PAGE_SIZE,
  type Cursor,
} from "./useExpensesData";
import type { ExpenseRow } from "./useExpensesData";

const mkRow = (id: string, date: string): ExpenseRow =>
  ({ id, date, site_id: "s1", amount: 0 } as ExpenseRow);

describe("buildCursorFromLastRow", () => {
  it("returns null for empty array", () => {
    expect(buildCursorFromLastRow([])).toBeNull();
  });
  it("returns date+id of last row", () => {
    const rows = [mkRow("a", "2026-05-10"), mkRow("b", "2026-05-09")];
    expect(buildCursorFromLastRow(rows)).toEqual({
      date: "2026-05-09",
      id: "b",
    });
  });
});

describe("buildCursorPredicate", () => {
  it("returns PostgREST or() string ordering strictly older than cursor", () => {
    const c: Cursor = { date: "2026-05-09", id: "b" };
    expect(buildCursorPredicate(c)).toBe(
      "date.lt.2026-05-09,and(date.eq.2026-05-09,id.lt.b)",
    );
  });
});

describe("appendPageDedupe", () => {
  it("appends new rows to the tail", () => {
    const prev = [mkRow("a", "2026-05-10"), mkRow("b", "2026-05-09")];
    const next = [mkRow("c", "2026-05-08"), mkRow("d", "2026-05-07")];
    expect(appendPageDedupe(prev, next).map((r) => r.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });
  it("drops rows whose id already exists in prev (defensive against duplicate pages)", () => {
    const prev = [mkRow("a", "2026-05-10"), mkRow("b", "2026-05-09")];
    const next = [mkRow("b", "2026-05-09"), mkRow("c", "2026-05-08")];
    expect(appendPageDedupe(prev, next).map((r) => r.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
  it("returns prev unchanged when next is empty", () => {
    const prev = [mkRow("a", "2026-05-10")];
    expect(appendPageDedupe(prev, [])).toBe(prev);
  });
});

describe("PAGE_SIZE", () => {
  it("is 50", () => {
    expect(PAGE_SIZE).toBe(50);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/hooks/queries/useExpensesData.test.ts`
Expected: FAIL with "buildCursorFromLastRow is not exported" (or similar).

- [ ] **Step 3: Add the pure helpers (no hook behavior change yet)**

In `src/hooks/queries/useExpensesData.ts`, just below the existing `BUILDING_TYPES` block (after line 99), add:

```ts
export const PAGE_SIZE = 50;

export interface Cursor {
  date: string;
  id: string;
}

export function buildCursorFromLastRow(rows: ExpenseRow[]): Cursor | null {
  if (rows.length === 0) return null;
  const last = rows[rows.length - 1];
  return { date: last.date, id: last.id };
}

// PostgREST or-filter string for "(date, id) < (cursor.date, cursor.id)"
// in date-DESC, id-DESC ordering. Used as `.or(buildCursorPredicate(c))`.
export function buildCursorPredicate(c: Cursor): string {
  return `date.lt.${c.date},and(date.eq.${c.date},id.lt.${c.id})`;
}

export function appendPageDedupe(
  prev: ExpenseRow[],
  next: ExpenseRow[],
): ExpenseRow[] {
  if (next.length === 0) return prev;
  const seen = new Set(prev.map((r) => r.id));
  const fresh = next.filter((r) => !seen.has(r.id));
  if (fresh.length === 0) return prev;
  return [...prev, ...fresh];
}
```

The `ExpenseRow` interface is already exported at line 21. Leave the existing `INITIAL_RESULT_LIMIT`, `MAX_RESULT_LIMIT`, `LOAD_MORE_STEP` constants in place for now — Task 2 will remove the ones that become unused.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/hooks/queries/useExpensesData.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/queries/useExpensesData.ts src/hooks/queries/useExpensesData.test.ts
git commit -m "refactor(expenses): extract pure cursor-pagination helpers + tests"
```

---

## Task 2: Refactor `useExpensesData` to append-mode cursor pagination

**Files:**
- Modify: `src/hooks/queries/useExpensesData.ts` (the `useExpensesData` function body, lines 133-278)

- [ ] **Step 1: Replace the hook body with cursor-based logic**

Replace the entire `useExpensesData` function (currently lines 133-278) with this implementation. Keep everything above line 133 (types, constants, helpers from Task 1) and below line 278 (`useExpenseTradeSummary`) untouched.

```ts
export function useExpensesData(args: Args) {
  const supabase = useMemo(() => createClient(), []);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [summary, setSummary] = useState<ScopeSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [canLoadMore, setCanLoadMore] = useState(false);

  // Bumped each time the scope (site / filters / date range) changes so the
  // active fetch can short-circuit if its caller's scope is stale.
  const scopeIdRef = useRef(0);
  const cursorRef = useRef<Cursor | null>(null);

  const { siteId, dateFrom, dateTo, isAllTime, group, expenseTypes, status, sitePayerId, sortDir } = args;

  // Stabilise the expenseTypes array reference for the dependency lists below.
  const expenseTypesKey =
    expenseTypes && expenseTypes.length > 0
      ? [...expenseTypes].sort().join("|")
      : "";

  const scopeKey = `${siteId}|${dateFrom}|${dateTo}|${isAllTime}|${group}|${expenseTypesKey}|${status}|${sitePayerId}|${sortDir}`;

  const fetchPage = useCallback(
    async (mode: "initial" | "more") => {
      if (!siteId) {
        setExpenses([]);
        setSummary(null);
        setCanLoadMore(false);
        cursorRef.current = null;
        return;
      }

      // Snapshot the scope this fetch belongs to. If `scopeIdRef.current`
      // changes before this fetch resolves, we drop the result.
      const myScopeId = scopeIdRef.current;
      const myCursor = mode === "more" ? cursorRef.current : null;

      // mode==="initial" always wins over an in-flight more-page; mode==="more"
      // is a no-op if there's no cursor yet (called too early) or if loading.
      if (mode === "more" && (!myCursor || isLoading)) return;

      setIsLoading(true);
      try {
        let query = (supabase as any)
          .from("v_all_expenses")
          .select("*")
          .eq("site_id", siteId)
          .eq("is_deleted", false)
          .order("date", { ascending: sortDir === "asc" })
          .order("id", { ascending: sortDir === "asc" });

        if (!isAllTime && dateFrom && dateTo) {
          query = query.gte("date", dateFrom).lte("date", dateTo);
        }

        if (expenseTypes && expenseTypes.length > 0) {
          query = query.in("expense_type", expenseTypes);
        } else if (group !== "all") {
          query = query.in(
            "expense_type",
            typesForGroup(group) as unknown as string[],
          );
        }

        if (status === "cleared") query = query.eq("is_cleared", true);
        else if (status === "pending") query = query.eq("is_cleared", false);

        if (sitePayerId) query = query.eq("site_payer_id", sitePayerId);

        // Cursor predicate — only for follow-up pages. Newest-first ordering
        // means "older than cursor" is the right comparison even in DESC
        // mode; for ASC we'd need date.gt — but the page only uses DESC, so
        // we assert that here.
        if (sortDir !== "desc") {
          throw new Error(
            "useExpensesData cursor pagination only supports sortDir='desc'",
          );
        }
        if (myCursor) {
          query = query.or(buildCursorPredicate(myCursor));
        }

        query = query.limit(PAGE_SIZE);

        // Summary RPC only fires on initial — it returns scope-wide totals
        // independent of pagination.
        const summaryPromise =
          mode === "initial"
            ? withTimeout(
                Promise.resolve(
                  (supabase as any).rpc("get_expense_summary", {
                    p_site_id: siteId,
                    p_date_from: !isAllTime && dateFrom ? dateFrom : null,
                    p_date_to: !isAllTime && dateTo ? dateTo : null,
                    p_module: null,
                  }),
                ),
                TIMEOUTS.QUERY,
                "get_expense_summary timed out",
              )
            : Promise.resolve(null);

        const [{ data, error }, summaryResult] = await Promise.all([
          supabaseQueryWithTimeout<ExpenseRow[]>(query, 30000),
          summaryPromise,
        ]);
        if (error) throw error;

        // Stale-scope guard: if the user changed filters while we were waiting,
        // drop this result silently.
        if (myScopeId !== scopeIdRef.current) return;

        const rows = (data || []) as ExpenseRow[];

        if (mode === "initial") {
          setExpenses(rows);
        } else {
          setExpenses((prev) => appendPageDedupe(prev, rows));
        }

        // Cursor = last row of the newly returned page if non-empty,
        // else keep the previous cursor (so a 0-row page doesn't null it out
        // and prevent a subsequent retry from finding its place).
        if (rows.length > 0) {
          cursorRef.current = buildCursorFromLastRow(rows);
        }

        // A full page means there may be more; a short page means we hit
        // end-of-data definitively.
        setCanLoadMore(rows.length === PAGE_SIZE);

        if (mode === "initial") {
          if (summaryResult && !summaryResult.error && summaryResult.data) {
            const s = summaryResult.data as {
              total_amount: number | string;
              total_count: number | string;
              cleared_amount: number | string;
              cleared_count: number | string;
              pending_amount: number | string;
              pending_count: number | string;
              by_type: Array<{
                type: string;
                amount: number | string;
                count: number | string;
              }>;
            };
            const breakdown: Record<string, BreakdownEntry> = {};
            for (const row of s.by_type ?? []) {
              breakdown[row.type] = {
                amount: Number(row.amount) || 0,
                count: Number(row.count) || 0,
              };
            }
            setSummary({
              total: Number(s.total_amount) || 0,
              totalCount: Number(s.total_count) || 0,
              cleared: Number(s.cleared_amount) || 0,
              clearedCount: Number(s.cleared_count) || 0,
              pending: Number(s.pending_amount) || 0,
              pendingCount: Number(s.pending_count) || 0,
              breakdown,
            });
          } else {
            setSummary(null);
          }
        }
      } catch (err) {
        if (myScopeId !== scopeIdRef.current) return;
        console.error(`useExpensesData: ${mode} fetch failed`, err);
        if (mode === "initial") {
          setExpenses([]);
          setSummary(null);
        }
        setCanLoadMore(false);
      } finally {
        if (myScopeId === scopeIdRef.current) setIsLoading(false);
      }
    // isLoading omitted from deps deliberately — checking it inside the body
    // is fine; including it would re-create fetchPage on every load and the
    // observer effect in the consumer would tear down/re-attach unnecessarily.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [supabase, siteId, dateFrom, dateTo, isAllTime, group, expenseTypesKey, status, sitePayerId, sortDir],
  );

  // When the scope changes: bump scopeId (invalidates in-flight fetches),
  // reset cursor, and re-fetch from page 1.
  useEffect(() => {
    scopeIdRef.current += 1;
    cursorRef.current = null;
    setCanLoadMore(false);
    fetchPage("initial");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);

  const loadMore = useCallback(() => {
    fetchPage("more");
  }, [fetchPage]);

  const refetch = useCallback(() => {
    scopeIdRef.current += 1;
    cursorRef.current = null;
    return fetchPage("initial");
  }, [fetchPage]);

  return {
    expenses,
    summary,
    isLoading,
    canLoadMore,
    loadMore,
    refetch,
  };
}
```

Also remove now-unused constants/state. After the edit, **delete** these lines from the top of the file:

```ts
const INITIAL_RESULT_LIMIT = 50;
export const MAX_RESULT_LIMIT = 2000;
export const LOAD_MORE_STEP = 50;
```

And add the `useRef` import — change the line `import { useCallback, useEffect, useMemo, useState } from "react";` to:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
```

- [ ] **Step 2: Update consumers that import the removed constants**

Run: `npm run test -- --run` first to see the type errors, then fix each. Expected error sites:

`src/app/(main)/site/expenses/page.v2.tsx` — imports `LOAD_MORE_STEP` and `MAX_RESULT_LIMIT` from `useExpensesData`. Find the import block (around line 80-90) and remove those two names.

Also in `page.v2.tsx` find the `loadedLimit` and `resultLimitHit` destructuring (around line 292-293):

```ts
const { expenses, summary, isLoading, canLoadMore, loadMore, refetch } =
  useExpensesData({ ... });
```

(loadedLimit/resultLimitHit are gone — search the file for both names and remove any remaining usages. The hard-cap warning at `page.v2.tsx:986-989` (`!canLoadMore && expenses.length >= MAX_RESULT_LIMIT`) should be **deleted entirely** — there is no longer a hard cap, and end-of-data is the normal `!canLoadMore` state which the tail row at line 1241 already handles.)

- [ ] **Step 3: Run tests + type-check**

```
npm run test -- --run
npm run build
```

Expected: tests pass, build passes. If type errors elsewhere reference the removed constants, remove those references.

- [ ] **Step 4: Manually verify in dev (with current desktop UI)**

```
npm run dev:cloud
```

Then via Playwright MCP:
1. Navigate to `http://localhost:3000/dev-login` (auto-logs in).
2. Navigate to `/site/expenses`.
3. Select Srinivasan site, All Time scope.
4. Open Network tab and scroll the table to bottom.
5. Confirm: each scroll-load fetches `v_all_expenses` with an `or=(date.lt.…,and(date.eq.…,id.lt.…))` query param (the cursor).
6. Confirm: after the last short page returns, no further requests fire even if you keep scrolling.
7. Confirm: the "End of results · N loaded" tail row appears with the actual loaded count.
8. Take screenshot. Close browser.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/queries/useExpensesData.ts src/app/(main)/site/expenses/page.v2.tsx
git commit -m "fix(expenses): cursor pagination kills infinite-scroll stall after 50 rows"
```

---

## Task 3: EXPLAIN the cursor query in prod; add indexes if needed

**Why:** `v_all_expenses` is a 7-way UNION ALL. The cursor predicate `(date, id) < (…)` should use existing indexes on each source table's `(site_id, date)` plus a tiebreak on id. If not, the planner falls back to a sort over all rows for that site, which gets slow at scale.

**Files:**
- Read-only: prod via Supabase MCP. If indexes are missing, create `supabase/migrations/<timestamp>_expense_cursor_indexes.sql`.

- [ ] **Step 1: Inspect the view definition**

Via Supabase MCP `execute_sql`:

```sql
SELECT pg_get_viewdef('public.v_all_expenses', true);
```

List each source table (expenses, settlement_groups, misc_expenses, tea_shop_settlements, subcontract_payments, material_purchase_expenses, rental_settlements — exact list depends on the view).

- [ ] **Step 2: Check existing indexes on each source table**

```sql
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('expenses', 'settlement_groups', 'misc_expenses',
                    'tea_shop_settlements', 'subcontract_payments',
                    'material_purchase_expenses', 'rental_orders');
```

(Adjust table names per the view definition from Step 1.)

For each source, we need an index covering `(site_id, date)` already — most will have one. The cursor needs the additional sort tiebreak on `id`, but `id` is the primary key and is already index-backed.

- [ ] **Step 3: EXPLAIN the cursor query**

Pick a real site_id from prod (Srinivasan) and a realistic cursor date:

```sql
EXPLAIN ANALYZE
SELECT *
FROM v_all_expenses
WHERE site_id = '<srinivasan-uuid>'
  AND is_deleted = false
  AND (date < '2026-04-13'
       OR (date = '2026-04-13' AND id < '<a-real-uuid>'))
ORDER BY date DESC, id DESC
LIMIT 50;
```

- [ ] **Step 4: Decide on indexes**

If the EXPLAIN shows index scans on each source's `(site_id, date)` index and the total cost is < ~50ms for the Srinivasan scope, **no migration needed — skip to Step 6**.

If any source table shows a `Seq Scan` or sort exceeds a few hundred ms, add a composite migration `supabase/migrations/<YYYYMMDDHHMMSS>_expense_cursor_indexes.sql`:

```sql
-- Indexes to support cursor pagination on v_all_expenses
-- See: docs/superpowers/specs/2026-05-23-expenses-mobile-redesign-design.md

-- Repeat per source table that EXPLAIN flagged. Example:
CREATE INDEX IF NOT EXISTS expenses_site_date_id_idx
  ON public.expenses (site_id, date DESC, id DESC)
  WHERE is_deleted = false;

-- (Add CREATE INDEX statements for any other flagged source tables.)
```

- [ ] **Step 5: Apply the migration to prod (if Step 4 produced one)**

Via MCP:

```
mcp__supabase__apply_migration(name: "expense_cursor_indexes", query: <SQL contents>)
```

Re-run the EXPLAIN from Step 3 and confirm the cost dropped.

- [ ] **Step 6: Commit (only if migration created)**

```bash
git add supabase/migrations/<file>.sql
git commit -m "perf(expenses): add cursor-pagination indexes on v_all_expenses sources"
```

If no migration was needed, skip the commit and move on.

---

## Task 4: Remove the mobile FAB

**Files:**
- Modify: `src/app/(main)/site/expenses/page.v2.tsx:1366-1394`

- [ ] **Step 1: Delete the FAB block**

In `page.v2.tsx`, delete lines 1366-1394 (the entire `{/* Mobile FAB */}` comment + `{canEdit && (<Box component="button" …>Add expense</Box>)}` block). Nothing else references it.

- [ ] **Step 2: Verify**

```
npm run build
```

Expected: builds cleanly.

Spot-check via Playwright on mobile viewport (375×667):
1. Navigate to `http://localhost:3000/dev-login` then `/site/expenses`.
2. Resize browser to 375×667.
3. Confirm: no floating `+ Add expense` pill in the bottom-right corner.
4. Confirm: the "Add Expense" button in the header still works.
5. Screenshot, close browser.

- [ ] **Step 3: Commit**

```bash
git add src/app/(main)/site/expenses/page.v2.tsx
git commit -m "fix(expenses): remove redundant mobile FAB (header button is enough)"
```

---

## Task 5: Compact mobile header

**Files:**
- Modify: `src/app/(main)/site/expenses/page.v2.tsx:769-792` (the `pageHeader` Box)

- [ ] **Step 1: Replace `pageHeader` with a mobile-aware version**

The current block (lines 769-792) reads:

```tsx
const pageHeader = (
  <Box sx={{ flexShrink: 0 }}>
    <PageHeader
      title="All Site Expenses"
      titleChip={<ScopeChip />}
      subtitle={`Track expenses for ${selectedSite.name}`}
      actions={
        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          <Button variant="contained" startIcon={<Add />} onClick={() => handleOpenDialog()} disabled={!canEdit} size="small">
            Add Expense
          </Button>
          <Tooltip title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
            <IconButton size="small" onClick={() => setIsFullscreen((v) => !v)}>
              {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
            </IconButton>
          </Tooltip>
        </Box>
      }
    />
    {auditState.isAuditing && auditState.dataStartedAt ? (
      <LegacyAuditBanner siteName={selectedSite.name} cutoffDate={auditState.dataStartedAt} />
    ) : null}
  </Box>
);
```

Replace it with:

```tsx
const pageHeader = (
  <Box sx={{ flexShrink: 0 }}>
    <PageHeader
      title="All Site Expenses"
      titleChip={<ScopeChip />}
      subtitle={isMobile ? undefined : `Track expenses for ${selectedSite.name}`}
      titleVariant={isMobile ? "h6" : undefined}
      actions={
        <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
          {isMobile ? (
            <Tooltip title="Add expense">
              <IconButton
                color="primary"
                onClick={() => handleOpenDialog()}
                disabled={!canEdit}
                aria-label="Add expense"
                size="small"
              >
                <Add />
              </IconButton>
            </Tooltip>
          ) : (
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => handleOpenDialog()}
              disabled={!canEdit}
              size="small"
            >
              Add Expense
            </Button>
          )}
          {!isMobile && (
            <Tooltip title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
              <IconButton size="small" onClick={() => setIsFullscreen((v) => !v)}>
                {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
              </IconButton>
            </Tooltip>
          )}
        </Box>
      }
    />
    {auditState.isAuditing && auditState.dataStartedAt ? (
      <LegacyAuditBanner siteName={selectedSite.name} cutoffDate={auditState.dataStartedAt} />
    ) : null}
  </Box>
);
```

`isMobile` is already in scope (line 177). `titleVariant` may or may not be supported by `PageHeader` — check next step.

- [ ] **Step 2: Confirm `PageHeader` supports the `titleVariant` prop**

Read `src/components/layout/PageHeader.tsx`. If `titleVariant` is **not** an existing prop, do one of:
- (a) **Preferred:** add it. The change is one new optional prop forwarded to the `Typography variant` for the title. Other pages using `PageHeader` are unaffected because the prop is optional.
- (b) **Fallback:** drop `titleVariant` from the Step 1 snippet and accept the default heading size on mobile — only the subtitle removal and Add-button collapse remain. (Header still becomes meaningfully more compact.)

If choosing (a), open `PageHeader.tsx`, find where the title `Typography` is rendered, and add `titleVariant?: TypographyProps["variant"]` to the props interface and `variant={titleVariant ?? "h5"}` (or whatever the current default is) on the Typography element.

- [ ] **Step 3: Verify on mobile viewport**

Playwright on 375×667:
1. `/dev-login` → `/site/expenses`.
2. Confirm header is one line: `All Site Expenses [All Time]` + `[+]` icon.
3. Confirm subtitle "Track expenses for …" is gone.
4. Confirm fullscreen toggle is gone on mobile.
5. Tap `[+]` → Add Expense dialog opens.
6. Screenshot, close browser.

Then resize to 1280×800 and confirm desktop is unchanged (subtitle visible, full-width Add Expense button, fullscreen toggle present).

- [ ] **Step 4: Commit**

```bash
git add src/app/(main)/site/expenses/page.v2.tsx src/components/layout/PageHeader.tsx
git commit -m "feat(expenses): compact mobile header (icon-only add, no subtitle, no fullscreen)"
```

(Drop `PageHeader.tsx` from `git add` if you took fallback (b).)

---

## Task 6: Mobile table column visibility + sticky Date

**Files:**
- Modify: `src/app/(main)/site/expenses/page.v2.tsx` (table head + body inside `expensesTable`, around lines 821-1252)

- [ ] **Step 1: Define a mobile-hidden cell sx**

At the top of the `expensesTable` JSX (near `headerCellSx`, around line 807), add a sibling constant:

```tsx
const hideOnMobileSx = { display: { xs: "none", md: "table-cell" } };

const stickyDateSx = {
  position: { xs: "sticky", md: "static" } as const,
  left: 0,
  zIndex: 1,
  bgcolor: "background.paper",
  // narrow padding on mobile
  py: { xs: 0.5, md: dense ? 0.75 : 1 },
  px: { xs: 1, md: 2 },
};
```

- [ ] **Step 2: Apply `hideOnMobileSx` to Recorded Date / Subcontract / Paid By / Vendor columns**

In the table head and body, find the `<TableCell>` for each of these four columns and add `sx={{ ...hideOnMobileSx }}` (merging with any existing sx). Do this for **both** the `<TableHead>` cell and every `<TableBody>` row cell of the same column.

To locate them, grep within the file:

```
Grep tool: pattern="Recorded Date|Subcontract|Paid By|Vendor"  path=page.v2.tsx
```

For each match in a `<TableCell>` (header or body), add the merged sx prop. If the cell already has an sx, spread: `sx={{ ...existingSx, ...hideOnMobileSx }}`.

- [ ] **Step 3: Apply `stickyDateSx` to the Date column**

Find the "Date" header `<TableCell>` and every Date `<TableCell>` in the row map. Add `sx={{ ...stickyDateSx }}` (or merge if existing sx).

The header sticky already exists via `headerCellSx.top: 96`. The Date body cell needs `position: sticky; left: 0; bgcolor: background.paper;` so it stays visible if any horizontal overflow occurs at narrow widths.

- [ ] **Step 4: Reduce row cell padding on mobile (all visible cells)**

In the existing `dense` padding rules (the page uses a `dense` boolean), find the body-cell padding sx and ensure mobile is even tighter. Easiest: where rows are rendered with `sx={{ py: dense ? 0.5 : 1 }}` style, change to `sx={{ py: { xs: 0.5, md: dense ? 0.5 : 1 }, px: { xs: 1, md: 2 } }}`.

If a global `<TableCell>` style exists in the file (or via theme), reduce it there.

- [ ] **Step 5: Verify**

Playwright on 375×667:
1. `/site/expenses`, Expenses tab.
2. Confirm visible columns: Date | Ref/Type | Amount | Status | Actions. The Vendor / Subcontract / Paid By / Recorded Date columns are not visible.
3. Confirm no horizontal scrollbar (or if any, it's a small overflow handled by `TableContainer`).
4. If the rows still overflow, screenshot the overflow and reduce further (drop padding to 4px, narrow the Status chip's label, etc.).
5. Tap a row → existing edit/inspect path still opens.
6. Resize to 1280×800 → all columns visible again.
7. Screenshot both, close browser.

- [ ] **Step 6: Commit**

```bash
git add src/app/(main)/site/expenses/page.v2.tsx
git commit -m "feat(expenses): hide non-essential columns on mobile, sticky Date"
```

---

## Task 7: Mobile filter bottom sheet

**Files:**
- Modify: `src/app/(main)/site/expenses/page.v2.tsx` (toolbar around lines 834-1010)

- [ ] **Step 1: Add bottom-sheet open state**

Near the other UI state at the top of `ExpensesPageV2()` (e.g., near line 210), add:

```ts
const [mobileFilterSheetOpen, setMobileFilterSheetOpen] = useState(false);
```

Also add a derived count of "non-default" filter values for the badge:

```ts
const activeMobileFilterCount = useMemo(() => {
  let n = 0;
  if (tradeFilter !== "all") n++;
  if (activeTypes.length > 0) n++;
  if (status !== "all") n++;
  return n;
}, [tradeFilter, activeTypes, status]);
```

- [ ] **Step 2: In the toolbar, wrap the three dropdowns + Export in a desktop-only Box**

Locate the toolbar row 1 / row 2 area. The three controls in question are:
- Trade filter (label "All trades")
- Sub-kinds filter (label "All sub-kinds")
- Status filter (label "All status")
- Export button

Wrap them in `<Box sx={{ display: { xs: "none", md: "contents" } }}>…</Box>` so they render only on desktop. (`md` and up uses `display: contents` so the existing flex layout works; `xs` hides them.)

- [ ] **Step 3: Add a mobile-only "Filters" button**

Immediately before the wrapped block, add:

```tsx
<Box sx={{ display: { xs: "inline-flex", md: "none" } }}>
  <Button
    variant="outlined"
    size="small"
    startIcon={<FilterListIcon />}
    onClick={() => setMobileFilterSheetOpen(true)}
    endIcon={
      activeMobileFilterCount > 0 ? (
        <Chip
          label={activeMobileFilterCount}
          size="small"
          color="primary"
          sx={{ height: 18, fontSize: 11, "& .MuiChip-label": { px: 0.75 } }}
        />
      ) : null
    }
  >
    Filters
  </Button>
</Box>
```

Add the `FilterList as FilterListIcon` import to the `@mui/icons-material` import block at the top of the file.

- [ ] **Step 4: Add the bottom sheet Drawer**

Near the other dialogs/drawers at the bottom of the JSX tree (find the existing `<Drawer>` for Subcontracts, around line 1580+), add a sibling:

```tsx
<Drawer
  anchor="bottom"
  open={mobileFilterSheetOpen}
  onClose={() => setMobileFilterSheetOpen(false)}
  PaperProps={{
    sx: {
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      maxHeight: "80vh",
    },
  }}
>
  <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2 }}>
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <Typography variant="h6">Filters</Typography>
      <IconButton onClick={() => setMobileFilterSheetOpen(false)} size="small">
        <Close />
      </IconButton>
    </Box>
    {/* RENDER THE THREE EXISTING CONTROLS HERE. Reuse the existing JSX —
        copy the three Select / dropdown components from the toolbar but
        stack them vertically (FormControl fullWidth). Same value/onChange
        wiring — no new state. */}
    {/* tradeFilter Select: copy from toolbar */}
    {/* activeTypes Select: copy from toolbar */}
    {/* status Select: copy from toolbar */}
    <Button
      variant="outlined"
      onClick={() => {
        setTradeFilter("all");
        setActiveTypes([]);
        setStatus("all");
      }}
      disabled={activeMobileFilterCount === 0}
    >
      Reset filters
    </Button>
    <Button variant="contained" onClick={() => setMobileFilterSheetOpen(false)}>
      Done
    </Button>
  </Box>
</Drawer>
```

The three "RENDER" stubs require **copying** the existing JSX from the toolbar — do not extract them into helpers (YAGNI; this is the only second caller). Wrap each in `<FormControl fullWidth>` for stacking, and keep the same `value` / `onChange` handlers. The Export button is desktop-only and does **not** need to appear in the sheet.

- [ ] **Step 5: Verify**

Playwright on 375×667:
1. `/site/expenses`.
2. Confirm the toolbar has: Search + Kind pills + `[Filters]` button. The three dropdowns + Export are not visible.
3. Tap `[Filters]` → bottom sheet slides up with three dropdowns + Reset + Done.
4. Pick "Cleared" status, tap Done → sheet closes, table re-filters, the Filters button shows a `[1]` badge.
5. Reopen sheet, tap Reset → all back to defaults, badge disappears.
6. Resize to 1280 → desktop toolbar shows the three dropdowns + Export normally; Filters button is hidden.
7. Screenshot mobile+desktop, close browser.

- [ ] **Step 6: Commit**

```bash
git add src/app/(main)/site/expenses/page.v2.tsx
git commit -m "feat(expenses): collapse trades/sub-kinds/status into mobile bottom sheet"
```

---

## Task 8: Compact ExpenseKPICards on mobile

**Files:**
- Modify: `src/components/expenses/ExpenseKPICards.tsx`

- [ ] **Step 1: Make the `KPICard` shell mobile-aware**

The card already uses Grid `xs={6} md={3}` so it's 2×2 on mobile — good. Just shrink padding + typography.

Replace the `KPICard` shell (around line 132-163):

```tsx
function KPICard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: { xs: 1.25, md: 2 },
        borderRadius: 2,
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Typography
        variant="caption"
        fontWeight={700}
        color="text.secondary"
        textTransform="uppercase"
        letterSpacing={0.5}
        sx={{ mb: 0.5, fontSize: { xs: 10, md: 11 } }}
      >
        {label}
      </Typography>
      {children}
    </Paper>
  );
}
```

- [ ] **Step 2: Shrink the main number in each of the four cards**

In `TotalSpentCard`, `CashPositionCard`, `BudgetProgressCard`, `BurnRateCard`, find the main `<Typography variant="h5" …>` for the number and change the sx to add a responsive `fontSize` (since `variant` is fixed, use the sx override). For each:

```tsx
<Typography
  variant="h5"
  fontWeight={700}
  sx={{
    fontVariantNumeric: "tabular-nums",
    letterSpacing: -0.4,
    lineHeight: 1.2,
    fontSize: { xs: "1.05rem", md: "1.5rem" },  // h5 = 1.5rem
  }}
>
  …
</Typography>
```

Apply the same `fontSize: { xs: "1.05rem", md: "1.5rem" }` to all four card numbers (including `CashPositionCard`'s number and `BudgetProgressCard`'s `{spentPct}%`).

Also for `TotalSpentCard`'s "across N records" line (`<Typography variant="body2"…>`), reduce to caption on mobile:

```tsx
<Typography
  variant="body2"
  color="text.secondary"
  sx={{ mt: 0.25, fontSize: { xs: 11, md: 14 } }}
>
  across {totalCount} records
</Typography>
```

- [ ] **Step 3: Verify**

Playwright on 375×667:
1. `/site/expenses`, Overview tab.
2. Confirm 2×2 grid of KPI cards visible above the fold (within first ~400px after header).
3. Confirm numbers are readable but compact.
4. Resize to 1280 → cards become 1×4 row, larger typography.
5. Screenshot both, close browser.

- [ ] **Step 4: Commit**

```bash
git add src/components/expenses/ExpenseKPICards.tsx
git commit -m "feat(expenses): compact KPI cards on mobile (smaller numbers/padding)"
```

---

## Task 9: Compact MoneyBreakdownCard + collapse Subcontracts panel on mobile

**Files:**
- Modify: `src/components/expenses/MoneyBreakdownCard.tsx`

- [ ] **Step 1: Read the current file**

Read `src/components/expenses/MoneyBreakdownCard.tsx` to understand structure (it has a Total panel, a Breakdown chip strip, and a Subcontracts panel on the right).

- [ ] **Step 2: Tighten chip dimensions on mobile**

Find the chip-strip Box (where `Object.entries(breakdown)` is mapped to chip-like `<Box>` elements). Find the `gap` and `minWidth` props and make them responsive:

- `gap: 1.5` → `gap: { xs: 1, md: 1.5 }`
- chip `minWidth: 110` → `minWidth: { xs: 90, md: 110 }`
- chip `maxWidth: 160` → `maxWidth: { xs: "calc(50% - 4px)", md: 160 }`
- chip `px: 2, py: 1.25` → `px: { xs: 1.25, md: 2 }, py: { xs: 0.75, md: 1.25 }`

If the chip uses `variant="subtitle1"` for the amount, add an `sx={{ fontSize: { xs: 13, md: 16 } }}`.

- [ ] **Step 3: Collapse the Subcontracts panel into a single tappable row on mobile**

Locate the right-side Subcontracts panel (the section with `Total Value / Paid / Balance` columns inside the breakdown card). Wrap its existing JSX in a `display: { xs: "none", md: "flex" }` Box, and immediately after, add a mobile-only collapsed row:

```tsx
{/* Mobile collapsed Subcontracts row */}
<Box
  sx={{
    display: { xs: subcontractsLoadedForSite === selectedSite?.id && subcontracts.length > 0 ? "flex" : "none", md: "none" },
    alignItems: "center",
    justifyContent: "space-between",
    py: 1,
    px: 1.5,
    borderTop: 1,
    borderColor: "divider",
    cursor: "pointer",
    "&:hover": { bgcolor: "action.hover" },
  }}
  onClick={onOpenSubcontracts}
>
  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
    <ContractIcon sx={{ fontSize: 16, color: "primary.main" }} />
    <Typography variant="caption" fontWeight={700} sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}>
      Subcontracts
    </Typography>
  </Box>
  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
    <Typography variant="caption" color="success.main">
      Paid {formatCompact(totalPaid)}
    </Typography>
    <Typography variant="caption" color="warning.main">
      Bal {formatCompact(totalBalance)}
    </Typography>
    <ChevronRight sx={{ fontSize: 18, color: "text.secondary" }} />
  </Box>
</Box>
```

The exact prop names (`subcontracts`, `subcontractsLoadedForSite`, `selectedSite`, `onOpenSubcontracts`, `totalPaid`, `totalBalance`) need to match what's already passed into `MoneyBreakdownCard` — read the component's props and the parent's call site (`page.v2.tsx`) to wire correctly. If the parent doesn't currently pass these, lift them to props (additive change to the props interface, doesn't break the existing desktop panel).

Required imports (add if missing): `ChevronRight as ChevronRight`, `Description as ContractIcon`. Verify `formatCompact` exists in scope; if it's a local helper, reuse it.

- [ ] **Step 4: Verify**

Playwright on 375×667:
1. `/site/expenses`, Overview tab.
2. Confirm the breakdown card chips wrap 2-per-row, each ~150px wide.
3. Confirm a single "Subcontracts · Paid ₹X.X L · Bal ₹X.X L ›" row at the bottom of the card.
4. Tap that row → the existing Subcontracts drawer opens.
5. Resize to 1280 → the full Subcontracts panel reappears on the right; collapsed row is hidden.
6. Screenshot both, close browser.

- [ ] **Step 5: Commit**

```bash
git add src/components/expenses/MoneyBreakdownCard.tsx src/app/(main)/site/expenses/page.v2.tsx
git commit -m "feat(expenses): compact breakdown card + collapse subcontracts on mobile"
```

(Drop `page.v2.tsx` if you didn't need to change parent props.)

---

## Task 10: TradeMetricCards horizontal scroll-snap strip on mobile

**Files:**
- Modify: `src/components/expenses/TradeMetricCards.tsx`

- [ ] **Step 1: Read the current file**

Read `src/components/expenses/TradeMetricCards.tsx` to understand the outer container (currently likely a Grid or Box flex-wrap).

- [ ] **Step 2: Make the outer container mobile horizontal-scroll**

Find the outermost `<Grid container …>` or `<Box>` wrapping the per-trade cards. Replace its `sx` (or add a mobile branch) so on mobile it becomes a horizontal scroll strip with snap points.

If it's currently a `<Grid container spacing={2}>`, replace with:

```tsx
<Box
  sx={{
    display: { xs: "flex", md: "grid" },
    gridTemplateColumns: { md: "repeat(auto-fill, minmax(220px, 1fr))" },
    gap: 2,
    mb: 2,
    // Mobile: horizontal scroll-snap
    overflowX: { xs: "auto", md: "visible" },
    scrollSnapType: { xs: "x mandatory", md: "none" },
    pb: { xs: 1, md: 0 },
    px: { xs: 0.5, md: 0 },
    "&::-webkit-scrollbar": { display: "none" },
    scrollbarWidth: "none",
  }}
>
  {/* existing card map */}
</Box>
```

For each per-trade card (inside the map), wrap in:

```tsx
<Box
  key={trade.id}
  sx={{
    minWidth: { xs: "70vw", md: "auto" },
    flex: { xs: "0 0 auto", md: "initial" },
    scrollSnapAlign: { xs: "start", md: "none" },
  }}
>
  {/* existing card content */}
</Box>
```

If the cards are already inside `<Grid size={…}>` items, replace those wrapping Grid items with the Box above.

- [ ] **Step 3: Verify**

Playwright on 375×667:
1. `/site/expenses`, Overview tab.
2. Confirm the trade cards render in a horizontal row with the second card partially visible (cue for swipe).
3. Swipe left → next card snaps into view.
4. Tap a card → existing filter behavior fires (Overview switches to Expenses tab via `setMobileTab(1)`).
5. Resize to 1280 → grid layout restored.
6. Screenshot both, close browser.

- [ ] **Step 4: Commit**

```bash
git add src/components/expenses/TradeMetricCards.tsx
git commit -m "feat(expenses): trade cards become horizontal swipe strip on mobile"
```

---

## Task 11: Reorder mobile Overview tab + drop count from Expenses tab label

**Files:**
- Modify: `src/app/(main)/site/expenses/page.v2.tsx` (mobile layout around lines 1338-1395, tab labels around lines 1333-1336)

- [ ] **Step 1: Reorder Overview content on mobile**

Find the `{mobileTab === 0 ? (…)` block (around line 1338) — currently renders `ExpenseKPICards → MoneyBreakdownCard → TradeMetricCards`. Reorder to:

```tsx
{mobileTab === 0 ? (
  <>
    <ExpenseKPICards
      total={totalAmount}
      totalCount={totalCount}
      financial={financial}
      isFinancialLoading={financialLoading}
      burnRate={burnRate}
      onContractsClick={() => router.push("/site/payments")}
    />
    <TradeMetricCards
      tradeSummary={tradeSummary}
      siteTrades={siteTrades}
      onCardClick={(id) => { handleTradeCardClick(id); setMobileTab(1); }}
      onEmptyCardClick={() => handleOpenDialog()}
      isLoading={tradeSummaryLoading}
    />
    <MoneyBreakdownCard
      total={totalAmount}
      totalCount={totalCount}
      breakdown={breakdown}
      onOpenSubcontracts={handleOpenSubcontracts}
    />
  </>
) : (
  /* …Expenses tab unchanged… */
)}
```

(Just swap the order of `MoneyBreakdownCard` and `TradeMetricCards`. Keep prop wiring identical.)

- [ ] **Step 2: Drop the count from the Expenses tab label**

Around line 1335:

```tsx
<Tab label="Expenses" />
```

(was `label={`Expenses (${totalCount})`}`)

- [ ] **Step 3: Verify**

Playwright on 375×667:
1. `/site/expenses`, Overview tab.
2. Scroll order top → bottom: KPI grid (2×2) → trade swipe strip → breakdown chips + subcontracts row.
3. Confirm tab label reads `Expenses` (no `(N)`).
4. Screenshot, close browser.

- [ ] **Step 4: Commit**

```bash
git add src/app/(main)/site/expenses/page.v2.tsx
git commit -m "feat(expenses): reorder mobile Overview (KPI → trades → breakdown); drop tab count"
```

---

## Task 12: Full mobile + desktop regression pass

**Files:** none — verification only.

- [ ] **Step 1: Build + unit tests**

```
npm run build
npm run test -- --run
```

Both must pass.

- [ ] **Step 2: Mobile end-to-end via Playwright**

Login at `/dev-login`. Resize to 375×667 throughout.

Scenarios on `/site/expenses` (Srinivasan site):

1. **Overview tab**:
   - Header is single-line, no FAB anywhere.
   - KPI cards 2×2, readable.
   - Trade strip swipes; tapping a card switches to Expenses tab and filters.
   - Breakdown chips wrap 2-per-row.
   - Tapping the collapsed Subcontracts row opens the drawer; closing returns you to the same scroll position.
2. **Expenses tab**:
   - Table shows Date / Ref / Amount / Status / Actions only.
   - Date column stays in place if you swipe right-to-left.
   - **Infinite scroll**: scroll to bottom — new pages auto-load. Continue scrolling through > 200 rows in one session without scrolling back up. No stalls.
   - End-of-data: keep scrolling past the last row; "End of results · N loaded" appears and no further requests fire (verify in DevTools Network).
3. **Filters bottom sheet**:
   - Tap Filters → sheet opens.
   - Pick "Cleared" status, Done → table re-filters, badge `[1]` on Filters button.
   - Reopen, Reset → defaults restored, badge gone.
4. **Add expense via header `[+]`** opens the dialog.

- [ ] **Step 3: Desktop regression at 1280×800**

Scenarios on `/site/expenses`:

1. Header shows full title + subtitle + full "Add Expense" button + fullscreen toggle (no regressions).
2. KPI cards 1×4 row, large numbers.
3. Trade cards in a normal grid.
4. Breakdown card shows full Subcontracts panel on the right.
5. Table shows all columns (Date, Ref, Recorded Date, Module, Type, Category, Amount, Vendor, Paid By, Subcontract, Status, Actions).
6. Filters button on toolbar is **not** rendered; the three dropdowns + Export are visible inline.
7. Infinite scroll still works.

- [ ] **Step 4: Console / network check**

While on each scenario:
- Browser console: no new errors / warnings introduced by the changes (compare against the production baseline).
- No 4xx/5xx on the cursor-paginated requests.

- [ ] **Step 5: Final commit**

If Steps 1-4 surface tweaks, fix and commit. Otherwise no commit needed.

---

## Done criteria

- All 12 tasks complete and committed.
- `npm run build` passes.
- `npm run test -- --run` passes.
- Manual Playwright verification on both 375×667 and 1280×800 viewports confirms: no FAB, compact mobile header, mobile table fits without horizontal scroll, infinite scroll loads continuously through end-of-data without stalling, filter bottom sheet works, KPI / trade / breakdown cards readable on mobile, desktop layout unchanged.
- Spec doc `docs/superpowers/specs/2026-05-23-expenses-mobile-redesign-design.md` requirements all satisfied.
