# All Site Expenses — Mobile Redesign + Infinite Scroll Fix

**Date:** 2026-05-23
**Scope:** `/site/expenses` (page.v2.tsx, the redesigned page that is live in prod behind `NEXT_PUBLIC_FF_EXPENSES_REDESIGN=true`)
**Status:** Spec — pending user review before plan

---

## Problem

User reports four issues on the mobile view of `/site/expenses`:

1. The floating "Add expense" FAB is redundant — the header already has an "Add Expense" button.
2. The header (title + button + chips) is not compact enough for mobile screens and wraps awkwardly.
3. The whole page is not properly mobile-responsive — table rows overflow horizontally and text like "Salary settlemen[t]" is cut off; KPI/breakdown/trade cards waste vertical space.
4. Infinite scroll stops loading after ~50 records on some scroll sessions. The user has to refresh or scroll back up to recover.

## Root causes

### FAB / header / mobile responsiveness
Mostly UX choices that didn't survive contact with narrow viewports. Concrete findings:

- `page.v2.tsx:1366-1394` renders a `position: fixed` "Add expense" pill on mobile in addition to the header button.
- `pageHeader` (`page.v2.tsx:769-792`) always renders title + subtitle + Add button + fullscreen IconButton in a row; on `xs` widths these wrap to 3 lines.
- The mobile expenses tab still renders the desktop `<Table>` (`page.v2.tsx:821+`). Columns are sized for ~960px+ and overflow horizontally on a phone, cutting off text in the last visible column.
- `ExpenseKPICards`, `MoneyBreakdownCard`, `TradeMetricCards` use desktop typography/padding regardless of width — the Overview tab becomes a long vertical stack with very little above-the-fold information.
- The toolbar filter pills + 3 dropdowns + Export button wrap into 3 rows on mobile (visible in the screenshot).

### Infinite scroll stops at ~50 records
Two compounding bugs in `useExpensesData.ts`:

1. **`canLoadMore` ignores end-of-data.** Defined as `loadedLimit < MAX_RESULT_LIMIT` (line 274). It does *not* check `resultLimitHit`. So when the server returns fewer rows than `loadedLimit` (true end of data for the current scope), the sentinel keeps re-triggering `loadMore`, the hook bumps `loadedLimit` again, refetches the same N rows, and looks "stuck loading" to the user.

2. **Sentinel remount race.** Each `loadMore` refetches the entire `0..loadedLimit` window and replaces the `expenses` array. React unmounts the old sentinel `<TableRow>` and mounts a new one. The `IntersectionObserver` effect re-runs because `expenses.length` changed and re-observes the new node. But if the user scrolled past during the fetch, the new sentinel mounts *already above* the viewport — `IntersectionObserver` only fires on intersection *change*, so a node that mounts already-non-intersecting fires nothing. The user has to scroll up and back down to retrigger.

The cursor-pagination refactor described below kills both bugs because pages append (sentinel stays mounted at the tail and only moves down as new rows land below it) and `canLoadMore` is derived from "last page returned `pageSize` rows".

---

## Design

### 1. Remove mobile FAB
Delete the `Box component="button"` block at `page.v2.tsx:1366-1394`. The header "Add Expense" remains the single entry point.

### 2. Compact mobile header (`pageHeader`, `page.v2.tsx:769-792`)
On mobile (`useMediaQuery(theme.breakpoints.down("sm"))` — the existing `isMobile` flag at line 177):
- Drop the subtitle `Track expenses for ${selectedSite.name}` (the same info is in the `<ScopeChip />` already shown next to the title).
- Title typography drops from default `h5` to `h6` so the chip fits beside it.
- "Add Expense" `<Button>` collapses to an icon-only `<IconButton color="primary">` showing a `<Add />` glyph with `aria-label="Add expense"`.
- Fullscreen `<IconButton>` is hidden on mobile (`display: { xs: "none", md: "inline-flex" }`).

Result: a single ~48px row on mobile: `[title]  [scope chip]            [+]`

### 3. Table overflow fix (mobile)
The `<Table>` keeps the same column definitions but hides low-value columns on mobile and stickies the Date column so horizontal swipe (if it happens) keeps context.

Per-column visibility rules:

| Column           | Mobile (`xs`) | Desktop |
|------------------|---------------|---------|
| Date             | sticky-left   | shown   |
| Ref / Type chip  | shown         | shown   |
| Amount           | shown         | shown   |
| Status           | shown         | shown   |
| Vendor           | hidden        | shown   |
| Paid By          | hidden        | shown   |
| Subcontract      | hidden        | shown   |
| Recorded Date    | hidden        | shown   |
| Actions          | shown         | shown   |

Cell padding on mobile shrinks to `py: 0.5, px: 1`. Hidden columns are still discoverable: tapping a row already opens the existing edit/inspect path (`handleOpenDialog(row)`), which has the full detail.

If the trimmed set still overflows on a 320px viewport, the existing `TableContainer` overflow-x falls back gracefully.

### 4. Filter toolbar on mobile
The toolbar row 1 (`page.v2.tsx:834-880+`) currently keeps the search field + group toggle + trades dropdown + sub-kinds dropdown + status dropdown + Export button all visible. On mobile this wraps to 3 lines.

Mobile-only change: collapse the three dropdowns (trades, sub-kinds, status) and the Export button into a single `Filters ▾` button. Tapping opens a `<Drawer anchor="bottom">` containing those four controls stacked vertically. The Filters button shows a small count badge when any of the controls are non-default. Desktop rendering is unchanged.

### 5. KPI / Breakdown / Trade cards on mobile

**`ExpenseKPICards`:** desktop currently renders cards side-by-side or stacked at full width. On mobile, render as a 2-column grid (`<Grid container spacing={1}>` with `xs={6}`):
- Main number typography: `h6` (was `h4`).
- Card padding: `p: 1.5` (was default `p: 2` / `CardContent` `p: 2.5`).
- Sub-label: `caption` (unchanged).
- Sub-icons: 16px (was 18-20px).

**`MoneyBreakdownCard`:** keep the existing flex-wrap of chips but tighten dimensions on mobile — chip `minWidth: 90` (was 110), `gap: 1` (was 1.5). Drop the right-side Subcontracts panel into a single tappable summary row at the bottom of the card (one line: `Subcontracts  · Paid ₹X.X L · Balance ₹X.X L  ›`) that opens the existing drawer.

**`TradeMetricCards`:** convert to a horizontal-scroll strip on mobile — one card per "slide", `display: flex; overflow-x: auto; scroll-snap-type: x mandatory`. Each card uses `min-width: 70vw` so two are partially visible (cueing the swipe affordance). Desktop unchanged.

### 6. Overview tab order on mobile
Current order: KPI cards → Money breakdown → Trade cards.
New order: **KPI cards → Trade strip → Money breakdown.**

Rationale: the KPI numbers + a swipe through trades are the "at a glance" reading; the breakdown is reference material. Putting the breakdown last lets the first screen show actionable totals + trades.

Also: drop the `(N)` count from the "Expenses (N)" tab label — duplicates the KPI number and adds width.

### 7. Cursor pagination refactor (`useExpensesData.ts`)
Replace re-fetch-window pagination with append-mode cursor pagination.

**Data shape:**
- `expenses: ExpenseRow[]` — accumulated across pages.
- Page size constant `PAGE_SIZE = 50`.
- Cursor: the `(date, id)` of the last row in `expenses`. Newest first ordering: `ORDER BY date DESC, id DESC`.

**Fetch logic:**
- Initial fetch (or filter change): `SELECT … FROM v_all_expenses WHERE site_id = $1 AND … ORDER BY date DESC, id DESC LIMIT 50`.
- Subsequent `loadMore`: `… AND (date, id) < ($cursorDate, $cursorId) ORDER BY date DESC, id DESC LIMIT 50`. Result is appended: `setExpenses(prev => [...prev, ...newRows])`.
- `canLoadMore = lastPageSize === PAGE_SIZE`. Resets when filters change.
- All filter/site/dateRange changes invalidate the cursor and re-fetch from page 1.

**Why this kills both bugs:**
- Sentinel-remount race: the sentinel `<TableRow>` stays mounted at the tail; new rows are appended *above* it. When the fetch returns, the sentinel doesn't unmount, so `IntersectionObserver` keeps observing the same node. As soon as the user scrolls again it fires correctly.
- End-of-data: a returned page with `< PAGE_SIZE` rows definitively means "no more rows"; we set `canLoadMore = false` and stop rendering the sentinel.

**Index considerations:** `v_all_expenses` is a 7-way `UNION ALL`. The `(date, id) < ($d, $i)` lexicographic predicate needs each source table to have an index on `(date desc, id desc)` or the planner falls back to a sort. Local EXPLAIN check before merge:

```sql
EXPLAIN ANALYZE
SELECT * FROM v_all_expenses
WHERE site_id = '…' AND (date, id) < ('2026-04-13', '…')
ORDER BY date DESC, id DESC LIMIT 50;
```

If a source lacks the index, we add it (separate migration in this same branch).

**Tail UI:** keep the "Loading more…" / "End of results · N loaded" tail row pattern; semantics are now exact (no false "loading" loops past end-of-data).

**Manual fallback:** drop the 1.5s-idle "Load more" button idea from the earlier sketch. With append-mode pagination the IntersectionObserver no longer races, so the fallback is unnecessary.

### 8. Affected files

| File | Change |
|------|--------|
| `src/app/(main)/site/expenses/page.v2.tsx` | Remove FAB; compact header; mobile filter sheet; column-hide rules; Overview reorder; tab-label simplification |
| `src/hooks/queries/useExpensesData.ts` | Cursor pagination refactor (cursor state, append, `canLoadMore` from last page size) |
| `src/components/expenses/ExpenseKPICards.tsx` | Mobile 2-col grid + smaller typography |
| `src/components/expenses/MoneyBreakdownCard.tsx` | Tighter chips on mobile; collapse Subcontracts panel into tappable row |
| `src/components/expenses/TradeMetricCards.tsx` | Mobile horizontal-scroll strip with snap |
| (potential) `supabase/migrations/YYYYMMDD_*.sql` | Composite `(date desc, id desc)` indexes if EXPLAIN shows the cursor predicate doesn't use existing indexes |

### 9. Out of scope (explicit)

- No changes to `page.tsx` (the V1 page) — it's only used when the feature flag is off, which is not the prod state.
- No changes to other `/site/*` pages even though similar patterns exist (e.g., payments page header). Mobile audit there is a separate task.
- No backend changes other than read-side indexes if EXPLAIN flags them.

## Verification (after implementation)

1. Mobile (Chrome DevTools 375×667):
   - Header is ≤ 60px and fits on one line.
   - No floating FAB anywhere.
   - Table shows only Date / Ref / Amount / Status / Actions columns and fits without horizontal scroll on 360px.
   - Filters button opens a bottom sheet with the four collapsed controls; counter badge appears when filters are active.
   - Overview tab order: KPI → trades strip → breakdown.
2. Infinite scroll:
   - Scroll through > 200 records on All Time scope — every page loads without the user having to scroll up.
   - When end-of-data is reached, "End of results · N loaded" appears and no further fetches fire (verified via Network tab).
3. Desktop unchanged — pixel-diff the header, KPI cards, table columns against current production.
4. Type-check + build pass.
