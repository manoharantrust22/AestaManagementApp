# Per-trade Holidays Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a holiday belong to a trade — visible + markable in that trade's workspace, scoped out of the site/Civil view — while keeping today's whole-site holidays and behaviour byte-for-byte unchanged.

**Architecture:** Add a nullable `site_holidays.trade_category_id` (NULL = whole-site = today). Build one scoped holiday set from the page's existing `tradeScope`: unscoped → `NULL`-only (today); scoped to a non-Civil trade → `NULL ∪ that trade`. Every holiday consumer (group rows, per-row badge, unfilled-date detection, conflict checks, the mark/revoke dialog) reads that scoped set; the dialog tags new holidays with the active trade (or NULL from the site view). No salary/pay effect — holidays stay informational.

**Tech Stack:** Next.js 15, Supabase Postgres (migration via `mcp__supabase__apply_migration`), React Query, MUI v7, Vitest.

## Global Constraints

- **Civil safety / default preserves today:** with `tradeScope` null (Civil / plain site view / no `?contractId=`) the holiday set is `trade_category_id IS NULL` only and a new holiday is inserted with `trade_category_id = NULL` — identical to today. All existing 98 rows are NULL after the migration. The Civil/site attendance view's holiday rows, badges, and unfilled detection must be byte-for-byte unchanged.
- **Informational only:** no change to salary, `daily_earnings`, `day_units`, or settlement. `is_paid_holiday` stays dormant (do not set or read it).
- **Schema before code (Move-to-Prod rule):** the migration is applied to prod via `mcp__supabase__apply_migration` BEFORE the code referencing the new column ships; the migration file is committed in the same push.
- **Exact unique constraint name to drop:** `site_holidays_site_id_date_key` (verified live; the old `UNIQUE(site_id, date)`). Replace with two partial unique indexes.
- **Scope source of truth:** the page's existing `tradeScope` memo in `attendance-content.tsx` (`{ contractId, tradeCategoryId, laborerIds } | null`; null for Civil / non-detailed / no `?contractId=`). Reuse it — do not invent a second scoping mechanism.
- **Env auto-commits + pushes pending work → it deploys.** Implementer subagents EDIT + test but DO NOT commit; the controller reviews, then commits. Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Types are hand-maintained** (`SiteHoliday` interface), not regenerated from `database.types.ts` (matches the repo's `as any` supabase pattern, consistent with slices 1–2).

---

## File Structure

**Created:**
- `supabase/migrations/20260625110000_site_holiday_trade_scope.sql` — column + drop old unique + two partial indexes (Task 1).
- `src/lib/utils/__tests__/holidayScope.test.ts` — unit tests for the pure scope predicate (Task 2).

**Modified:**
- `src/lib/utils/holidayUtils.ts` — `SiteHoliday` type gains `trade_category_id`; add a pure `holidayInScope()` helper (Task 2).
- `src/lib/data/attendance.ts` — holiday select adds `trade_category_id` (Task 2).
- `src/app/(main)/site/attendance/attendance-content.tsx` — fetch `trade_category_id`; build the scoped holiday set; every consumer (group rows, badge, unfilled detection, conflict checks) reads it; pass scope to the dialog (Task 3).
- `src/components/attendance/HolidayConfirmDialog.tsx` — accept `tradeCategoryId`/`tradeName`; tag insert; scoped labels + list (Task 4).

---

## Task 1: Migration — trade-scoped holidays column + partial unique indexes

**Files:**
- Create: `supabase/migrations/20260625110000_site_holiday_trade_scope.sql`

**Interfaces:**
- Produces: `site_holidays.trade_category_id uuid NULL` (FK `labor_categories(id)` ON DELETE CASCADE); the old `UNIQUE(site_id, date)` replaced by `uq_site_holiday_sitewide` (partial, NULL) + `uq_site_holiday_per_trade` (partial, non-NULL).

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/20260625110000_site_holiday_trade_scope.sql`:

```sql
-- Per-trade holidays: a holiday can belong to a trade (NULL = whole-site = today).
ALTER TABLE public.site_holidays
  ADD COLUMN IF NOT EXISTS trade_category_id uuid NULL
    REFERENCES public.labor_categories(id) ON DELETE CASCADE;

-- Replace UNIQUE(site_id, date) so a whole-site row and per-trade rows coexist,
-- each still de-duped. (Old constraint name verified live: site_holidays_site_id_date_key.)
ALTER TABLE public.site_holidays DROP CONSTRAINT IF EXISTS site_holidays_site_id_date_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_site_holiday_sitewide
  ON public.site_holidays (site_id, date)
  WHERE trade_category_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_site_holiday_per_trade
  ON public.site_holidays (site_id, date, trade_category_id)
  WHERE trade_category_id IS NOT NULL;
```

- [ ] **Step 2: Apply to prod**

Use `mcp__supabase__apply_migration`, `name: "site_holiday_trade_scope"`, SQL above. Expected: success.

- [ ] **Step 3: Verify**

Run via `mcp__supabase__execute_sql`:
```sql
SELECT count(*) AS total, count(*) FILTER (WHERE trade_category_id IS NULL) AS null_rows
  FROM public.site_holidays;                          -- expect total == null_rows (all 98 site-wide)
SELECT indexname FROM pg_indexes
 WHERE tablename='site_holidays'
   AND indexname IN ('uq_site_holiday_sitewide','uq_site_holiday_per_trade');  -- expect 2 rows
SELECT conname FROM pg_constraint
 WHERE conrelid='public.site_holidays'::regclass AND conname='site_holidays_site_id_date_key'; -- expect 0 rows
```
Expected: every row NULL; both indexes present; old constraint gone.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260625110000_site_holiday_trade_scope.sql
git commit -m "feat(holidays): add trade_category_id + partial unique indexes to site_holidays"
```

---

## Task 2: `SiteHoliday` type + pure `holidayInScope()` helper + holiday select

**Files:**
- Modify: `src/lib/utils/holidayUtils.ts`
- Create: `src/lib/utils/__tests__/holidayScope.test.ts`
- Modify: `src/lib/data/attendance.ts`

**Interfaces:**
- Consumes: Task 1's column.
- Produces: `SiteHoliday.trade_category_id: string | null`; `holidayInScope(h: { trade_category_id: string | null }, tradeCategoryId: string | null): boolean` — true when the holiday is whole-site (NULL) OR (a trade is scoped AND the holiday belongs to that trade). The `lib/data/attendance.ts` holiday query returns `trade_category_id`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/utils/__tests__/holidayScope.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { holidayInScope } from "../holidayUtils";

describe("holidayInScope", () => {
  const sitewide = { trade_category_id: null };
  const painting = { trade_category_id: "paint" };
  it("site view (no scope) sees only whole-site holidays", () => {
    expect(holidayInScope(sitewide, null)).toBe(true);
    expect(holidayInScope(painting, null)).toBe(false);
  });
  it("a trade workspace sees whole-site + its own", () => {
    expect(holidayInScope(sitewide, "paint")).toBe(true);
    expect(holidayInScope(painting, "paint")).toBe(true);
    expect(holidayInScope(painting, "civil")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/utils/__tests__/holidayScope.test.ts`
Expected: FAIL (`holidayInScope` is not a function).

- [ ] **Step 3: Add the type field + the helper**

In `src/lib/utils/holidayUtils.ts`, add `trade_category_id` to the `SiteHoliday` interface (after `is_paid_holiday`):
```typescript
  trade_category_id: string | null;
```
and append the helper:
```typescript
/**
 * Whether a holiday is visible in the current view. Whole-site holidays
 * (trade_category_id null) show everywhere; a trade-scoped holiday shows only
 * when that trade's workspace is active. (No scope = site/Civil view.)
 */
export function holidayInScope(
  h: { trade_category_id: string | null },
  tradeCategoryId: string | null
): boolean {
  if (h.trade_category_id == null) return true;
  return tradeCategoryId != null && h.trade_category_id === tradeCategoryId;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/utils/__tests__/holidayScope.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Add `trade_category_id` to the holiday select in `src/lib/data/attendance.ts`**

Find the holiday fetch (≈L109-116) that does `.from("site_holidays").select("*")`. If it uses `"*"`, leave it (it already returns the new column). If it lists explicit columns, add `trade_category_id`. Confirm the returned rows carry `trade_category_id` (the consuming type is `SiteHoliday`).

- [ ] **Step 6: Typecheck + test**

Run: `npx tsc --noEmit 2>&1 | grep -E "holidayUtils|attendance\.ts|holidayScope" || echo OK` → `OK`
Run: `npx vitest run src/lib/utils/__tests__/holidayScope.test.ts` → PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/utils/holidayUtils.ts src/lib/utils/__tests__/holidayScope.test.ts src/lib/data/attendance.ts
git commit -m "feat(holidays): SiteHoliday.trade_category_id + holidayInScope helper + select"
```

---

## Task 3: Scope the holiday set + all consumers in `attendance-content.tsx`

**Files:**
- Modify: `src/app/(main)/site/attendance/attendance-content.tsx`

**Interfaces:**
- Consumes: `holidayInScope` (Task 2); the page's existing `tradeScope` memo (`tradeScope?.tradeCategoryId`); the in-component holiday fetch (≈L1983-2007) and state (`recentHolidays`, `todayHoliday`).
- Produces: a `scopedHolidays` set (the holidays visible in the current view) that every consumer reads; the holiday fetch selects `trade_category_id`.

- [ ] **Step 1: Fetch `trade_category_id`**

In the in-component holiday fetch (`.from("site_holidays").select(...)`, ≈L1983-2007), ensure the select returns `trade_category_id` (if it's `select("*")`, no change). The holiday state arrays now carry `trade_category_id`.

- [ ] **Step 2: Build the scoped holiday set**

Where the holiday list feeds the calendar/rows (the array currently used to build holiday-group rows + the per-date holiday lookup), derive a scoped view using the active trade:

```typescript
const scopeTradeCategoryId = tradeScope?.tradeCategoryId ?? null;
const scopedHolidays = useMemo(
  () => recentHolidays.filter((h) => holidayInScope(h, scopeTradeCategoryId)),
  [recentHolidays, scopeTradeCategoryId]
);
```
(Use the actual holiday-list variable name the page uses; `recentHolidays` per the current code. Import `holidayInScope` from `@/lib/utils/holidayUtils`.)

- [ ] **Step 3: Point every consumer at `scopedHolidays`**

Replace the holiday source in each consumer so they read `scopedHolidays` instead of the raw list:
- the **holiday-group rows** builder (the grouping passed to `groupHolidays` / the holiday rows, ≈L1540-1599 / L3908-3979),
- the **per-attendance-row badge** lookup (the `entry.holiday` / per-date holiday map, ≈L4343-4356),
- the **unfilled-date detection** (dates with no attendance AND no holiday, ≈L1555-1571),
- the **today's-holiday** indicator (`todayHoliday`) — when scoped, "today is a holiday" should reflect a holiday in scope (site-wide or this trade).

CIVIL-SAFETY: when `scopeTradeCategoryId` is null, `holidayInScope` keeps only `trade_category_id IS NULL` rows. Today every row is NULL, so `scopedHolidays` equals the full list and every consumer behaves exactly as today. Reason this through in the report.

- [ ] **Step 4: Pass the active trade to the dialog**

Where `HolidayConfirmDialog` is rendered, pass the active trade context (added in Task 4):
```tsx
tradeCategoryId={scopeTradeCategoryId}
tradeName={tradeScope ? contractMeta?.trade_name ?? null : null}
```
(Use the page's existing `contractMeta` from `useSubcontractMeta`; null on the Civil/site view.)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E "attendance-content" || echo OK` → `OK`
Run: `npx tsc --noEmit 2>&1 | grep -E "error TS" | grep -vE "\.test\.(ts|tsx)\(|__tests__" | head` → no NEW errors.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(main)/site/attendance/attendance-content.tsx"
git commit -m "feat(holidays): scope holiday rows/badge/unfilled to the active trade"
```

---

## Task 4: `HolidayConfirmDialog` — scope-aware mark/revoke/list + labels

**Files:**
- Modify: `src/components/attendance/HolidayConfirmDialog.tsx`

**Interfaces:**
- Consumes: the `tradeCategoryId` / `tradeName` props passed in Task 3.
- Produces: marking inserts `trade_category_id: tradeCategoryId ?? null`; the dialog's pre-checks operate within the scoped set; labels say "{tradeName}" when scoped, "whole site" when null; list mode shows in-scope holidays.

- [ ] **Step 1: Add the props**

Extend the dialog's props interface:
```typescript
  /** When set, the holiday is scoped to this trade; null = whole-site. */
  tradeCategoryId?: string | null;
  /** Display name of the scoped trade (null on the site/Civil view). */
  tradeName?: string | null;
```

- [ ] **Step 2: Tag the insert**

In the create/mark mutation (`.from("site_holidays").insert({...})`, ≈L83-142), add to the payload:
```typescript
  trade_category_id: tradeCategoryId ?? null,
```

- [ ] **Step 3: Scope the pre-checks**

The "attendance already recorded for this date" check and any "existing holiday on this date" lookup must consider the scope: when `tradeCategoryId` is set, a same-date whole-site holiday or this-trade holiday is the relevant conflict (not another trade's). When null (site view), behaviour is exactly as today. Keep the existing `id`-based delete in revoke/list unchanged (it already targets a specific row).

- [ ] **Step 4: Scope-aware labels**

In mark/revoke copy and any header, show the scope: when `tradeName` is set, e.g. "Mark holiday for {tradeName}"; when null, the existing "whole site" wording (unchanged). In list mode, filter/label the shown holidays by scope using the same rule (`trade_category_id == null || == tradeCategoryId`).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E "HolidayConfirmDialog" || echo OK` → `OK`

- [ ] **Step 6: Commit**

```bash
git add src/components/attendance/HolidayConfirmDialog.tsx
git commit -m "feat(holidays): scope-aware mark/revoke/list in HolidayConfirmDialog"
```

---

## Live verification (controller, before/after the commits)

On a clean dev build (`npm run dev:cloud`, fresh `.next`), per CLAUDE.md "After UI Changes":
1. **Civil/site view unchanged:** `/site/attendance` (plain) shows the same holiday rows/badges and the same unfilled-day behaviour as before — all 98 rows are whole-site (NULL).
2. **Mark a trade holiday:** open Painting's workspace (`?contractId=` its in-house contract), mark a holiday on a date → it shows in Painting's workspace (labelled "Painting"), is **absent** from the Civil/site view, and that date is **not** flagged unfilled for Painting while Civil still expects work.
3. **Mark a site holiday:** from the plain site view, mark a holiday → whole-site (NULL), shows everywhere as today.
4. **Revoke both** test holidays; confirm the data is back to all-NULL and Civil is unchanged.
5. **Console:** zero errors/warnings.

## Self-review notes (coverage vs spec)
- Decision 1 (informational only) → no salary/day-unit code touched; `is_paid_holiday` untouched.
- Decision 2 (scope by context) → Task 4 insert tag from `tradeCategoryId` (null on site view); Task 3 passes the active trade.
- Decision 3 (trade sees site-wide + own) → `holidayInScope` (Task 2) + scopedHolidays (Task 3).
- Decision 4 (expected-work follows the scoped set) → Task 3 points unfilled detection + conflict checks at `scopedHolidays`.
- Decision 5 (site view excludes other trades) → `holidayInScope(h, null)` keeps NULL-only.
- Risk (don't disturb today; unique swap) → Global Constraints + Task 1 verify (all-NULL, indexes present, old constraint gone).
