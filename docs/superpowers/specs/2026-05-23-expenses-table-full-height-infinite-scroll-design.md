# All Site Expenses — Full-Height Table, Infinite Scroll & Date Sort

**Date:** 2026-05-23
**Surface:** `/site/expenses` (V2, behind `NEXT_PUBLIC_FF_EXPENSES_REDESIGN=true`, currently live in prod)
**Status:** Design — ready for implementation

## Problem

On the All Site Expenses page, three UX issues compound each other:

1. **Wasted vertical space.** The expenses table caps at `maxHeight: calc(100vh - 420px)`, which assumes the KPI cards, money breakdown, and trade cards above it are visible. When the user scrolls past those, the table doesn't grow to fill the freed viewport — leaving a visible gap below the totals footer.
2. **Front-loaded fetch.** First load pulls **200 rows** from the heavy `v_all_expenses` view in one shot, even though typical users only look at the most recent 10–30 entries. The remaining 1,800+ row ceiling sits behind a manual "Load 200 more" alert button — which is friction on its own and means the *common* path loads more than it needs.
3. **No header sort.** Date order is hardcoded to descending at the query layer. To see oldest-first the user has to scroll through the whole list. No way to flip the order.

There's also a latent **footer-totals bug**: the Labor/Building totals at the bottom of the table are computed client-side from `filteredRows` (the currently-loaded slice), so they understate the true scope-wide totals whenever fewer than all rows are loaded. Today this is masked because the 200-row default usually exceeds the typical site's record count, but reducing the page size to 50 will expose it on any site with >50 records.

## Goals

- Table fills available vertical space — no gap below the footer.
- First load fetches ~50 rows; more rows stream in automatically as the user scrolls toward the bottom.
- Totals (KPIs, money breakdown, table footer) remain scope-accurate regardless of how many rows are currently loaded.
- Date column header is clickable to toggle asc/desc; sort applies across the *entire* dataset, not just loaded rows.
- No DB / migration / type changes.

## Non-goals

- Virtual scrolling (react-window / react-virtuoso). The hard cap stays at 2,000 rows; virtualization only pays off well past that.
- Sort on Amount, Vendor, or any other column — Date only this round (per user decision).
- Mobile-specific sort UI. Mobile still uses the two-tab layout; the table inside the "Expenses" tab gets the same behaviour as desktop.
- Multi-column / secondary sort.
- Changing the existing `MAX_RESULT_LIMIT = 2000` safety ceiling.

## Design

### 1. Single-scroll layout (kills the gap)

Today: outer `<Box flex={1} overflowY="auto">` scrolls the whole page **plus** the table's `<TableContainer>` has its own `maxHeight`. Two competing scroll containers = the gap.

New layout:

```
PageHeader (fixed)
└── Scroll container (flex: 1, overflow-y: auto)
    ├── ExpenseKPICards
    ├── MoneyBreakdownCard
    ├── TradeMetricCards
    └── Paper (table card)
        ├── Toolbar row 1 (search/filters)   ← position: sticky; top: 0
        ├── Toolbar row 2 (count/groupBy)    ← position: sticky; top: <row1 height>
        ├── <Table stickyHeader>             ← header pins under sticky toolbar
        │   <TableBody> ...rows...
        ├── Sentinel row (IntersectionObserver target)
        └── Footer totals bar                ← position: sticky; bottom: 0
```

- Remove `maxHeight: calc(100vh - 420px)` and `minHeight: 200` from the `TableContainer`.
- Wrap the table in a normal flow container so it grows with row count.
- Make the two toolbar rows `position: sticky; top: 0` (row 1) and `top: 48px` (row 2; height of row 1 with `py: 1.5`). `<TableHead stickyHeader>` uses `top: 0` on its cells by default — override its `top` to the combined toolbar height (e.g. `~84px`) so it pins under the toolbars instead of overlapping them. Set `zIndex` ordering: toolbar row 1 = 3, row 2 = 2, table header = 1.
- Convert `<TableFooter>` to a `<Box>` sibling of the table, **kept inside the Paper card** so it visually belongs to the table (matches today's look): `position: sticky; bottom: 0; bgcolor: background.paper; borderTop: 1px solid divider; zIndex: 2`. The footer was a `TableFooter` element today, which doesn't sticky-pin reliably when the scroll container is outside the Table.

Result: KPIs scroll away normally; the table claims all remaining viewport; filters and totals stay on-screen.

### 2. Infinite scroll

Changes in [src/hooks/queries/useExpensesData.ts](src/hooks/queries/useExpensesData.ts):

```ts
const INITIAL_RESULT_LIMIT = 50;   // was 200
export const LOAD_MORE_STEP = 50;  // was 200
export const MAX_RESULT_LIMIT = 2000; // unchanged
```

Changes in [src/app/(main)/site/expenses/page.v2.tsx](src/app/(main)/site/expenses/page.v2.tsx):

- Add a sentinel `<TableRow>` (or `<Box>` outside the table) rendered after the last data row, only when `canLoadMore && !isLoading`.
- `useEffect` attaches an `IntersectionObserver` to the sentinel; on `isIntersecting`, calls `loadMore()`.
- Observer is recreated when `canLoadMore` flips or the sentinel ref changes; disconnected on unmount.
- Replace the "Load N more" Alert with an inline `<TableRow>` at the tail:
  - While loading next page: `<Spinner /> Loading more…`
  - When `!canLoadMore` (hit MAX_RESULT_LIMIT) or end-of-data (`!resultLimitHit && expenses.length === totalCount`): `End of results · {expenses.length} of {totalCount}` (use `summary.totalCount` for `totalCount`).
- Keep the `MAX_RESULT_LIMIT` ceiling Alert as the ONE manual escape hatch — only rendered when `loadedLimit === MAX_RESULT_LIMIT && resultLimitHit`, suggesting the user narrow the date range.

Edge cases:
- **User scrolls past sentinel quickly while a previous load is in flight.** Observer is debounced by the `!isLoading` guard inside the load callback. A single fetch at a time.
- **Filter / sort change resets state.** Existing `useEffect` in `useExpensesData` already resets `loadedLimit` when the scope key changes; we add `sortDir` to that dependency list. The scroll container is *not* scrolled back to top automatically — the user might still see their context — but the sentinel logic remains correct because rows are replaced.
- **Empty result.** No sentinel rendered; "No expenses match your filters" cell stays as today.

### 3. Sortable Date header

Changes in [src/hooks/queries/useExpensesData.ts](src/hooks/queries/useExpensesData.ts):

Add to `Args`:
```ts
sortDir: "desc" | "asc";   // applies to date column
```

Inside `fetch()`:
```ts
.order("date", { ascending: sortDir === "asc" })
```

Reset `loadedLimit` when `sortDir` changes (extend the effect dependency list).

Changes in [src/app/(main)/site/expenses/page.v2.tsx](src/app/(main)/site/expenses/page.v2.tsx):

```tsx
const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

// pass to useExpensesData({ ..., sortDir })

// In table header:
<TableCell sortDirection={sortDir}>
  <TableSortLabel
    active
    direction={sortDir}
    onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
  >
    Date
  </TableSortLabel>
</TableCell>
```

`sortDir` is **not** URL-synced this round (keeps the URL clean, matches "Date only" minimalism). It's per-session state.

### 4. Footer totals correctness (latent bug fix)

Today the footer totals are derived from `filteredRows` (the loaded slice after client-side filtering):
```ts
const laborTotal = filteredRows.filter(LABOR_SET.has).reduce(...);
const buildingTotal = filteredRows.filter(BUILDING_SET.has).reduce(...);
const filteredTotal = laborTotal + buildingTotal;
```

When `expenses.length < summary.totalCount` (which becomes the *common* case with 50-row pages), these understate the truth.

**Important:** `get_expense_summary` currently runs with `p_module: null` and no status/type filter (lines 192–200 of `useExpensesData.ts`). So `summary` represents: **site + date-range scope**, ignoring `group`, `status`, `activeTypes`, `sitePayerId`. Changing the RPC signature is **out of scope this round**. That means:

- The KPI cards (top of page) already use `summary.total` — they always show **scope** total, regardless of which kind/status tab the user has open. This is existing intended behaviour.
- The footer will follow the same rule for consistency: show **scope** totals.

New footer behaviour:

- Compute `scopeLaborTotal = Σ summary.breakdown[t].amount for t in LABOR_TYPES`. Same for `scopeBuildingTotal`. Default to `0` when summary is null (initial load).
- Footer's primary "Total" line shows `summary.total` (was `filteredTotal` from loaded slice).
- Labor / Building breakdown in the footer uses the scope totals above.
- **When client-side search/trade/sub-kind is active** (`hasFilter` is true and at least one of those three is set), additionally show a small caption: `Filtered (loaded): ₹X · Y rows` — derived from `filteredRows` over the loaded slice. This is honest about its scope: it's the total over what's both filtered AND loaded.
- **When no client filter is active**, only the scope total is shown.

This keeps the footer aligned with the KPIs (both = scope total) and fixes the case the user reported. Reflecting DB-side filters (status/group/activeTypes) in the total is left as a follow-up — it requires changing the RPC signature.

### 5. Behaviour matrix

| Action | Refetch? | Reset loadedLimit? | Scroll to top? |
|--------|---------|--------------------|----------------|
| Type in search box | No (client-side) | No | No |
| Change Trade filter | No (client-side) | No | No |
| Change Sub-kind filter | No (client-side) | No | No |
| Change Status (paid/pending) | Yes (DB) | Yes | No |
| Change Kind toggle (All/Labor/Building) | Yes (DB) | Yes | No |
| Toggle Date sort header | Yes (DB) | Yes | No |
| Sentinel intersects viewport | Yes (DB, +50 rows) | No | No |
| Date range / site / All-time changes | Yes (DB) | Yes | No |

"Scroll to top: No" everywhere is intentional — preserve the user's place when they're filtering through results.

## Implementation surface

- **`src/hooks/queries/useExpensesData.ts`**
  - Change `INITIAL_RESULT_LIMIT` 200 → 50
  - Change `LOAD_MORE_STEP` 200 → 50
  - Add `sortDir: "desc" | "asc"` to `Args`
  - Use `sortDir` in `.order("date", ...)`
  - Add `sortDir` to the load-limit reset effect deps and the fetch callback deps

- **`src/app/(main)/site/expenses/page.v2.tsx`**
  - Add `sortDir` state, pass to `useExpensesData`
  - Wrap `Date` header cell in `TableSortLabel`
  - Remove `TableContainer` `maxHeight`/`minHeight`
  - Make the two toolbar `Box` rows `position: sticky; top: ...`
  - Move the footer totals out of `TableFooter` into a sticky-bottom `<Box>` sibling
  - Add sentinel row + `IntersectionObserver` ref / effect
  - Replace "Load N more" Alert with inline tail row (Loading / End-of-results); keep MAX_RESULT_LIMIT Alert behind its existing condition
  - Switch footer Labor/Building totals to scope-wide derivation from `summary.breakdown`
  - When client filter is active, render both `Filtered` and `Scope total`

No other files. No migrations. No type regen.

## Risk / rollback

- All changes are isolated to two client files; feature-flag (`NEXT_PUBLIC_FF_EXPENSES_REDESIGN`) already gates the V2 page from the V1 fallback. If anything goes sideways, the existing V1 page (still at `page.tsx`) is the rollback.
- No data shape changes — `useExpensesData` returns the same `ExpenseRow[]` and `summary`.
- The shared `useExpensesData` hook is also used by the Miscellaneous page? Let me check before implementing — if so, the page-size cut may affect that surface too. (Verified during implementation; doc updated if found.)

## Verification

1. Open `/site/expenses` on Srinivasan (334 records, per screenshot).
2. Confirm only ~50 rows render initially.
3. Confirm KPIs/Money/Trade cards visible at top; toolbar sticks when scrolling.
4. Confirm table grows to fill remaining height — no gap below the footer.
5. Scroll down past row ~45; observe auto-fetch of next 50.
6. Click Date header — verify oldest-first order; observe new fetch from DB (not just client re-sort).
7. Click Date header again — verify newest-first restored.
8. With no filters, confirm footer "Total: ₹10,02,425" matches site grand total.
9. Type in search box → footer shows both "Filtered: ₹X" and "Total: ₹10,02,425".
10. Change date range to "Week" → totals + loaded rows refresh, sort dir preserved.
11. Console clean.

## Out of scope follow-ups (not blocking)

- Sort indicators on Amount column (low-effort follow-up if the user asks).
- URL-syncing `sortDir`.
- Smooth-scroll back to top on sort change (user feedback dependent).
