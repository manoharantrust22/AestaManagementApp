# Per-trade holidays — design spec

_2026-06-25 · Phase 3, slice 3 (per-trade holidays). Slices 1/1b (attendance+salary) + 2 (tea) shipped; this is the last slice of the workspace-per-trade arc._

## Context / problem

A "workspace" is a trade's full Civil-style operating surface — per-labourer **attendance + salary +
tea + holidays**. Attendance/salary (slices 1/1b) and tea (slice 2) are now per-trade. Holidays are
the last surface still **site-only**.

Today (`site_holidays`):
- Columns: `id, site_id NOT NULL, date, reason, is_paid_holiday, created_by, created_at`,
  `UNIQUE(site_id, date)`. No trade dimension; no `site_group_id`.
- **Holidays are purely informational** — they do NOT change salary or day-units. They:
  - render a holiday row (grouped consecutive same-reason) + a beach badge on an attendance row;
  - exclude a date from the "unfilled day" (missing attendance) detection;
  - block marking a holiday when attendance exists on that date, and ask to delete the holiday
    before filling attendance on a holiday date.
- Managed inline on `/site/attendance` via `HolidayConfirmDialog` (mark / revoke / list). No dedicated
  settings page, no React Query hook (direct `supabase` client calls in
  `attendance-content.tsx` + `src/lib/data/attendance.ts`).
- `is_paid_holiday` exists but is never set or read.

Owner's need: when Painting takes a day off but Civil works (or vice-versa), the holiday should belong
to the trade — visible + markable in that trade's workspace — not force the whole site off.

## Decisions (approved in brainstorming)

1. **A per-trade holiday is a scoped informational marker** — same as today, just scoped. It changes
   no salary and no pay. `is_paid_holiday` stays dormant (out of scope).
2. **Scope by context.** Marking a holiday from inside a non-Civil trade's workspace tags it to that
   trade; marking from the plain site/Civil view makes it whole-site (`trade_category_id = NULL`).
   No extra scope picker. Whole-site (NULL) stays the default everywhere → today's behaviour is
   unchanged with no data migration.
3. **A trade workspace sees site-wide + its own holidays.** In a non-Civil trade's workspace, the
   holiday set = `trade_category_id IS NULL` (site-wide) ∪ `trade_category_id = <that trade>`. The
   plain/Civil/site view sees site-wide (NULL) holidays only — byte-for-byte today.
4. **Expected-work follows the scoped set.** A trade's holiday (or a site-wide one) means that date
   isn't flagged "unfilled" for that trade; the holiday-vs-attendance conflict checks use the same
   scoped set. (Plain/Civil view: site-wide set, exactly as today.)
5. **The site view does not list other trades' holidays.** Each trade's holidays live in its own
   workspace (consistent with the self-contained workspace model). Site/Civil view = site-wide only.

## Architecture

### a. Schema (additive)
- `site_holidays.trade_category_id uuid NULL REFERENCES labor_categories(id) ON DELETE CASCADE`. NULL =
  whole-site (today); set = that trade's holiday.
- Drop `UNIQUE(site_id, date)` (`unique_site_holiday`); replace with two partial unique indexes so a
  NULL site-wide row and per-trade rows can coexist but stay de-duped:
  - `UNIQUE(site_id, date) WHERE trade_category_id IS NULL`
  - `UNIQUE(site_id, date, trade_category_id) WHERE trade_category_id IS NOT NULL`
- RLS: existing policies are keyed on `site_id` (can_access_site); the new nullable column needs no
  policy change (still gated by site). Confirm during build.
- Backfill: none — existing rows keep `trade_category_id = NULL` (= site-wide), which is what they are.

### b. Read + scope
- `src/lib/data/attendance.ts` (server fetch ~L109-116) and the in-component fetch
  (`attendance-content.tsx` ~L1983-2007): add `trade_category_id` to the holiday select.
- A small scope helper decides the holiday set for the active view:
  - **No trade scope** (Civil/plain): `trade_category_id IS NULL` (today).
  - **Trade scope active** (the page's existing `tradeScope.tradeCategoryId`, non-Civil detailed
    `?contractId=`): `trade_category_id IS NULL OR trade_category_id = tradeCategoryId`.
- All holiday consumers — the holiday-group rows, the per-row badge, the unfilled-date detection, the
  conflict checks — read the **scoped** holiday set (so the trade workspace and the site view each see
  their correct set). When not scoped, the set equals today's (NULL-only), preserving Civil.

### c. Mark / revoke (by context)
- `HolidayConfirmDialog`: accept the active `tradeCategoryId` + `tradeName` (null when site view).
  - Mark insert payload adds `trade_category_id: tradeCategoryId ?? null`.
  - Header/labels: "Holiday for {tradeName}" when scoped; "whole site" when null.
  - Revoke/delete targets the specific holiday row's `id` (already the case) — no change beyond
    operating on the scoped set.
  - The "attendance already exists" pre-check and the "delete holiday before filling attendance" flow
    operate within the scoped set (trade holiday ↔ trade attendance; site-wide ↔ site).

### d. Display
- Holiday-group row + the attendance-row beach badge show the trade name when the holiday is
  trade-scoped (e.g. "Painting — Pongal"); site-wide holidays render as today (no trade label).
- List mode shows the in-scope holidays for the current view.

## Key files / seams
- New migration: `…_site_holiday_trade_scope.sql` (column + drop old unique + two partial indexes).
- `src/lib/data/attendance.ts` — holiday select + `trade_category_id`.
- `src/app/(main)/site/attendance/attendance-content.tsx` — scoped holiday set (fetch + the
  group-row / badge / unfilled / conflict consumers), pass scope to the dialog.
- `src/components/attendance/HolidayConfirmDialog.tsx` — accept tradeCategoryId/tradeName; tag insert;
  scoped labels + list.
- `src/lib/utils/holidayUtils.ts` — `SiteHoliday` type gains `trade_category_id`; grouping unchanged.

## Risk + mitigation
- **Don't disturb today's holidays.** NULL = site-wide; the unscoped (Civil/plain) path uses the
  NULL-only set and the NULL insert exactly as today. Verify the Civil/site attendance view's holiday
  rows/badges/unfilled detection are unchanged for an all-NULL data set.
- **Unique constraint swap.** Dropping `unique_site_holiday` and adding the two partial indexes must
  not fail on existing data (all current rows are NULL → the `WHERE trade_category_id IS NULL` index
  must still find them unique; they already satisfy the old constraint, so they're unique). Verify no
  duplicate (site_id, date) NULL rows exist before creating the partial index (they can't, given the
  old constraint).

## Non-goals (this slice)
- No salary/pay effect; `is_paid_holiday` stays dormant.
- No site-group-wide holidays (still per-site).
- The site/Civil view does not aggregate other trades' holidays.
- No dedicated holiday settings page (stays inline on the attendance page).

## Verification
- Read-only: confirm all existing `site_holidays` rows have `trade_category_id IS NULL` after the
  migration; the two partial indexes exist; the old unique constraint is gone.
- Live (reversible, non-Civil): open Painting's workspace, mark a Painting holiday on a date — it
  shows in Painting's workspace (labelled), is absent from the Civil/site view, and that date is not
  "unfilled" for Painting while Civil still is. Mark a holiday from the site view → whole-site (NULL),
  shows everywhere as today. Revoke both; confirm Civil unchanged.
