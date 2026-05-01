-- Migration: Backfill payment_week_allocations from ISO Mon-Sun back to Sun-Sat
-- Date: 2026-05-01
-- Purpose: Reverse companion to 20260430130000_backfill_payment_week_allocations_to_iso_week.
--          The 2026-04-30 forward migration rebucketed historical Sun-Sat rows
--          to ISO Mon-Sun. The user has now chosen to revert the whole stack
--          back to Sun-Sat (construction-payroll convention). Without this
--          backfill, the ref-code dialog (SettlementRefDetailDialog, via
--          getPaymentByReference) would show legacy + post-2026-04-30 payments
--          on Mon-Sun while new payments would be Sun-Sat — exactly the
--          inconsistency the prior backfill was designed to remove.
--
-- Mapping: After the 2026-04-30 backfill, every Mon-Sun row has week_end on
--          a Sunday. The Sun-Sat bucket *containing* that Sunday starts on the
--          same Sunday and runs to the following Saturday:
--              new_week_start = week_end::date         -- the Sunday becomes the start
--              new_week_end   = (week_end + 6)::date   -- the following Saturday
--
-- Collision safety: Within a single labor_payment_id the previous backfill
--                   produced consecutive non-overlapping Mon-Sun windows.
--                   Their containing Sun-Sat windows (anchored on each window's
--                   Sunday end-date) are also consecutive and non-overlapping,
--                   so the unique constraint (labor_payment_id, week_start) is
--                   preserved.
--
-- Idempotency: The WHERE clause filters to current Mon-Sun rows
--              (week_start on Monday, full 7-day span). After the UPDATE these
--              rows look like Sun-Sat (week_start on Sunday, 7-day span) and
--              are no longer matched, so re-running the migration is a no-op.
--
-- Scope: Allocation rows only. daily_attendance.is_paid / payment_id are NOT
--        touched — those flags remain a valid record of which dates a payment
--        fully covered, regardless of how the surrounding week is labelled.

DO $$
DECLARE
  v_candidate_count int;
  v_updated_count   int;
BEGIN
  SELECT COUNT(*) INTO v_candidate_count
  FROM public.payment_week_allocations
  WHERE week_end - week_start = 6
    AND extract(dow FROM week_start) = 1;  -- Monday

  RAISE NOTICE 'Backfill candidates (Mon-Sun rows): %', v_candidate_count;

  WITH updated AS (
    UPDATE public.payment_week_allocations
    SET
      week_start = week_end,
      week_end   = (week_end + 6)
    WHERE week_end - week_start = 6
      AND extract(dow FROM week_start) = 1
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_updated_count FROM updated;

  RAISE NOTICE 'Rebucketed % rows from ISO Mon-Sun to Sun-Sat', v_updated_count;
END $$;

-- Sanity check: after the backfill, no row should still look Mon-Sun-shaped
-- (week_start on Monday, full 7-day span). Raise if any slipped through.
DO $$
DECLARE
  v_remaining int;
BEGIN
  SELECT COUNT(*) INTO v_remaining
  FROM public.payment_week_allocations
  WHERE week_end - week_start = 6
    AND extract(dow FROM week_start) = 1;

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'payment_week_allocations Sun-Sat backfill incomplete: % Mon-Sun rows remain', v_remaining;
  END IF;
END $$;
