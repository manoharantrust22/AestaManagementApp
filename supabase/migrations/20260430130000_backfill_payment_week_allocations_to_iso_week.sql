-- Migration: Backfill payment_week_allocations from Sun-Sat to ISO Mon-Sun
-- Purpose: Companion to 20260430120000_align_payment_week_allocations_comments_to_iso_week.
--          The TS allocator (settlementService.ts) was switched to ISO weeks
--          (Mon-Sun) on 2026-04-30 to reconcile with get_salary_waterfall.
--          The ref-code popup (PaymentRefDialog, via getPaymentByReference)
--          renders the stored week_start/week_end as labels — without this
--          backfill, legacy payments would display "Sun-Sat" windows while
--          post-fix payments display "Mon-Sun". This rewrites the historical
--          rows to ISO Mon-Sun so the popup is consistent.
--
-- Mapping: Each Sun-Sat row spans Sun..Sat (7 days). 6 of those 7 days
--          (Mon..Sat) live in the ISO week that contains the Saturday
--          end-date. We anchor the new bucket on that week:
--              new_week_start = date_trunc('week', week_end)::date  -- Monday
--              new_week_end   = (new_week_start + 6)::date           -- Sunday
--
-- Collision safety: Within a single labor_payment_id, the allocator only ever
--                   produced consecutive non-overlapping Sun-Sat windows.
--                   Their containing ISO weeks are also consecutive and
--                   non-overlapping, so the unique constraint
--                   (labor_payment_id, week_start) is preserved.
--
-- Idempotency: The WHERE clause filters to rows that look like Sun-Sat
--              (7-day window starting on Sunday). After the UPDATE these
--              rows look like Mon-Sun (7-day window starting on Monday) and
--              are no longer matched, so re-running the migration is a no-op.
--
-- Scope: Allocation rows only. daily_attendance.is_paid / payment_id are NOT
--        touched — those flags were set against the historical Sun-Sat view
--        and remain a valid record of "this payment fully covered these
--        attendance dates." The dollar amounts in allocated_amount are
--        unchanged; only the bucket labels shift.

DO $$
DECLARE
  v_candidate_count int;
  v_updated_count   int;
BEGIN
  SELECT COUNT(*) INTO v_candidate_count
  FROM public.payment_week_allocations
  WHERE week_end - week_start = 6
    AND extract(dow FROM week_start) = 0;  -- Sunday

  RAISE NOTICE 'Backfill candidates (Sun-Sat rows): %', v_candidate_count;

  WITH updated AS (
    UPDATE public.payment_week_allocations
    SET
      week_start = date_trunc('week', week_end)::date,
      week_end   = (date_trunc('week', week_end)::date + 6)
    WHERE week_end - week_start = 6
      AND extract(dow FROM week_start) = 0
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_updated_count FROM updated;

  RAISE NOTICE 'Rebucketed % rows from Sun-Sat to ISO Mon-Sun', v_updated_count;
END $$;

-- Sanity check: after the backfill, no row should still look Sun-Sat-shaped
-- (week_start on Sunday, full 7-day span). Raise if any slipped through.
DO $$
DECLARE
  v_remaining int;
BEGIN
  SELECT COUNT(*) INTO v_remaining
  FROM public.payment_week_allocations
  WHERE week_end - week_start = 6
    AND extract(dow FROM week_start) = 0;

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'payment_week_allocations backfill incomplete: % Sun-Sat rows remain', v_remaining;
  END IF;
END $$;
