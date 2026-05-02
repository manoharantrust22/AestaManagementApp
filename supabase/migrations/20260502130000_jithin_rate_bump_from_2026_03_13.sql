-- Migration: Bump Jithin's daily_rate_applied 1000 → 1050 from 2026-03-13 onwards
-- Date: 2026-05-02
-- Laborer: 6c1b5fc8-f943-4524-909a-e430c1209772 (Jithin, mesthri/contract)
--
-- Purpose:
-- The user raised Jithin's daily rate from ₹1000 to ₹1050 effective 2026-03-13,
-- but only ~10 attendance rows from 2026-04-20 onwards were entered at the new
-- rate. The remaining 45 rows from 2026-03-13 .. 2026-04-19 (and a few mixed
-- after that) were entered at the old ₹1000 rate. laborers.daily_rate is
-- already 1050 (set 2026-05-01), so this only fixes the historical attendance.
--
-- Scope (verified 2026-05-02 before writing this migration):
--   45 active attendance rows for laborer = Jithin, date >= 2026-03-13,
--   daily_rate_applied = 1000, is_deleted = false, salary_override IS NULL.
--   Total work_days: 51.5 → recognised wages move from ₹51,500 to ₹54,075
--   (delta +₹2,575).
--
-- Settlement impact:
--   0 of the 45 rows have daily_attendance.settlement_group_id set, so the
--   AFTER trigger that recomputes settlement_groups.total_amount from child
--   daily_earnings does NOT fire. (Contract laborer settlements aggregate
--   labor_payments, not daily_attendance — that linkage stays untouched.)
--
-- Already-paid rows (intentional back-pay):
--   6 of the 45 rows have is_paid=true, payment_id set:
--     - 4430874c-2e40-4df1-b19d-2996d2e8aba8 covers 2026-03-18, 03-19, 03-20, 03-21
--     - 1dfcc8f7-bd61-43c2-951b-7f2bb43ab47e covers 2026-03-22
--     - 9ece0d40-8c9a-4172-95fa-0a2d83bc5528 covers 2026-04-05
--   labor_payments.amount on those payments is NOT changed by this migration —
--   that's correct, those are records of cash already paid at the old rate.
--   After this migration, daily_earnings on those 6 rows recomputes upward,
--   so Jithin's "earned vs paid" view will show ~₹325 of arrears (250+25+50)
--   that he'll collect in his next settlement. Per user direction.
--
-- Reversibility: trivial — re-run the same UPDATE with 1000 in place of 1050
-- and the same WHERE filter (the post-flight count is logged for audit).
--
-- Safety guards (any one fails → ROLLBACK):
--   - laborer 6c1b5fc8-… exists, daily_rate currently 1050.
--   - Pre-flight count of rows matching the filter is exactly 45.
--   - Post-flight: 0 rows remain at daily_rate_applied=1000 in the same window.

DO $$
DECLARE
  v_laborer_id        uuid    := '6c1b5fc8-f943-4524-909a-e430c1209772';
  v_old_rate          numeric := 1000;
  v_new_rate          numeric := 1050;
  v_effective_date    date    := DATE '2026-03-13';
  v_expected_rows     int     := 45;
  v_current_lab_rate  numeric;
  v_preflight_count   int;
  v_updated_count     int;
  v_remaining_old     int;
BEGIN
  -- Pre-flight 1: laborer exists and live rate is already 1050
  SELECT daily_rate INTO v_current_lab_rate
  FROM public.laborers
  WHERE id = v_laborer_id;

  IF v_current_lab_rate IS NULL THEN
    RAISE EXCEPTION 'Aborted: laborer % not found.', v_laborer_id;
  END IF;

  IF v_current_lab_rate <> v_new_rate THEN
    RAISE EXCEPTION
      'Aborted: laborer % has daily_rate=% but expected %. Investigate before re-running.',
      v_laborer_id, v_current_lab_rate, v_new_rate;
  END IF;

  -- Pre-flight 2: exact row count match (defends against drift since planning)
  SELECT COUNT(*) INTO v_preflight_count
  FROM public.daily_attendance
  WHERE laborer_id = v_laborer_id
    AND date >= v_effective_date
    AND is_deleted = false
    AND salary_override IS NULL
    AND daily_rate_applied = v_old_rate;

  IF v_preflight_count <> v_expected_rows THEN
    RAISE EXCEPTION
      'Aborted: pre-flight count is % rows but expected %. Re-plan before re-running.',
      v_preflight_count, v_expected_rows;
  END IF;

  RAISE NOTICE 'Pre-flight OK. Updating % rows for laborer % from rate % to %.',
    v_preflight_count, v_laborer_id, v_old_rate, v_new_rate;

  -- Apply the bump. The BEFORE UPDATE trigger recomputes daily_earnings
  -- (= COALESCE(salary_override, work_days * daily_rate_applied)).
  WITH updated AS (
    UPDATE public.daily_attendance
    SET daily_rate_applied = v_new_rate
    WHERE laborer_id = v_laborer_id
      AND date >= v_effective_date
      AND is_deleted = false
      AND salary_override IS NULL
      AND daily_rate_applied = v_old_rate
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_updated_count FROM updated;

  RAISE NOTICE 'Updated % attendance rows.', v_updated_count;

  -- Post-flight: nothing remains at the old rate in the affected window
  SELECT COUNT(*) INTO v_remaining_old
  FROM public.daily_attendance
  WHERE laborer_id = v_laborer_id
    AND date >= v_effective_date
    AND is_deleted = false
    AND salary_override IS NULL
    AND daily_rate_applied = v_old_rate;

  IF v_remaining_old <> 0 THEN
    RAISE EXCEPTION
      'Post-flight FAILED: % rows still at old rate. Rolling back.',
      v_remaining_old;
  END IF;

  RAISE NOTICE 'Rate bump COMPLETE. Laborer % attendance from % onwards now at %.',
    v_laborer_id, v_effective_date, v_new_rate;
END $$;
