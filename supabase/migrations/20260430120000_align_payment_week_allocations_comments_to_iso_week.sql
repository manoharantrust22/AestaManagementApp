-- Migration: Align payment_week_allocations column comments with ISO weeks (Mon-Sun)
-- Purpose: The original COMMENT strings on week_start/week_end said "Sunday" /
--          "Saturday", documenting an early Sun-Sat allocator implementation in
--          settlementService.ts. The TS allocator was switched on 2026-04-30 to
--          ISO weeks (Mon-Sun) via dayjs/plugin/isoWeek so it reconciles with
--          get_salary_waterfall and get_payments_ledger (both use Postgres
--          date_trunc('week', date), which is ISO Monday). Update the COMMENTs
--          so future readers see the truth.
--
-- Scope: Comments only — no data or schema change. The companion migration
--        20260430130000_backfill_payment_week_allocations_to_iso_week.sql
--        rebuckets historical Sun-Sat rows to ISO Mon-Sun so the payment-ref
--        popup (PaymentRefDialog, via getPaymentByReference) shows consistent
--        labels across legacy and post-fix payments.

COMMENT ON COLUMN public.payment_week_allocations.week_start IS
  'Start date of the ISO week (Monday) — aligned with date_trunc(''week'', date) used by get_salary_waterfall.';

COMMENT ON COLUMN public.payment_week_allocations.week_end IS
  'End date of the ISO week (Sunday) — aligned with date_trunc(''week'', date) + 6 used by get_salary_waterfall.';
