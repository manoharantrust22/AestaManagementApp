-- Migration: Align payment_week_allocations column comments with Sun-Sat
-- Date: 2026-05-01
-- Purpose: Reverse companion to 20260430120000. After the 2026-05-01 revert
--          to construction-payroll Sun-Sat weeks, the column COMMENTs that
--          said "Monday" / "Sunday" must read "Sunday" / "Saturday" so future
--          readers see the truth.
--
-- Scope: Comments only — no data or schema change. The companion migration
--        20260501110300_backfill_payment_week_allocations_to_sun_sat.sql
--        rebuckets historical Mon-Sun rows so the popup labels are consistent.

COMMENT ON COLUMN public.payment_week_allocations.week_start IS
  'Start date of the construction-payroll week (Sunday) — aligned with weekStartOf() in src/lib/utils/weekUtils.ts.';

COMMENT ON COLUMN public.payment_week_allocations.week_end IS
  'End date of the construction-payroll week (Saturday) — Sunday + 6.';
