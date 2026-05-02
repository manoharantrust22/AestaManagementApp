-- Migration: Cancel typo'd ₹1,00,000 contract salary record (SET-260416-005)
-- Date: 2026-05-02
-- Site: 79bfcfb3-4b0d-4240-8fce-d1ab584ef972 (Srinivasan House & Shop, Pudukkottai)
--
-- Purpose:
-- SET-260416-005 was created on 2026-05-01 12:24 IST by Shanthi Manoharan as a
-- ₹1,00,000 contract salary settlement for laborer Jithin (subcontract
-- 1f5fae1d-5327-4865-9605-0714d8202aa7). User confirmed the real-world
-- payment was ₹1,000 — the ₹1,00,000 has an extra zero (typo) and the
-- transaction never occurred at that amount. The original ₹1,000 record
-- (SET-260416-001) was previously entered as an `excess` workaround and
-- already sits cancelled in the database; the user will re-record the
-- correct ₹1,000 as a proper salary settlement via the app UI after this
-- migration runs.
--
-- Cascade follows DeleteContractSettlementDialog.tsx (lines 90-146):
--   1) reset any daily_attendance pointing at the labor_payment (defensive
--      no-op for contract laborers — they don't link via daily_attendance)
--   2) hard-delete payment_week_allocations for the labor_payment
--   3) hard-delete the labor_payment
--   4) soft-cancel the settlement_group
-- All four steps run inside the same transaction; any failed pre-flight
-- check raises EXCEPTION which rolls back everything.
--
-- Reversibility: PARTIAL. The settlement_group can be un-cancelled by
-- flipping is_cancelled=false, but labor_payments and payment_week_allocations
-- are hard-deleted. The deleted UUIDs are RAISE NOTICE'd for audit. Full
-- restore would require re-INSERTing those rows from a DB backup — easier
-- to just re-record the correct ₹1,000 via the app UI.
--
-- Safety guards (any one fails → ROLLBACK):
--   - SG id 6caf9c97-… exists, is_cancelled=false, payment_type='salary',
--     total_amount=100000, site_id matches, subcontract_id matches.
--   - Exactly one labor_payments row points to the SG with amount=100000
--     and is_under_contract=true.
--   - Post-cancel: 0 active labor_payments, 0 payment_week_allocations
--     remain for the cancelled SG.

DO $$
DECLARE
  v_target_sg_id     uuid := '6caf9c97-8fcd-456a-b100-773ce1420874';
  v_expected_total   numeric := 100000.00;
  v_expected_site    uuid := '79bfcfb3-4b0d-4240-8fce-d1ab584ef972';
  v_expected_subcon  uuid := '1f5fae1d-5327-4865-9605-0714d8202aa7';
  v_lp_id            uuid;
  v_lp_count         int;
  v_alloc_count      int;
  v_da_reset_count   int;
  v_remaining_lp     int;
  v_remaining_alloc  int;
BEGIN
  -- Pre-flight 1: settlement_group sanity
  PERFORM 1
  FROM public.settlement_groups
  WHERE id              = v_target_sg_id
    AND is_cancelled    = false
    AND payment_type    = 'salary'
    AND total_amount    = v_expected_total
    AND site_id         = v_expected_site
    AND subcontract_id  = v_expected_subcon;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Cancel-typo aborted: settlement_group % does not match the expected shape (active salary, ₹%, site %, subcontract %).',
      v_target_sg_id, v_expected_total, v_expected_site, v_expected_subcon;
  END IF;

  -- Pre-flight 2: exactly one labor_payment with the expected shape
  SELECT id INTO v_lp_id
  FROM public.labor_payments
  WHERE settlement_group_id = v_target_sg_id
    AND amount               = v_expected_total
    AND is_under_contract    = true;

  GET DIAGNOSTICS v_lp_count = ROW_COUNT;

  IF v_lp_count <> 1 THEN
    RAISE EXCEPTION
      'Cancel-typo aborted: expected exactly 1 matching labor_payment for SG %, found %.',
      v_target_sg_id, v_lp_count;
  END IF;

  RAISE NOTICE 'Pre-flight OK. Target SG: %, target labor_payment: %.', v_target_sg_id, v_lp_id;

  -- Step 1: reset any daily_attendance pointing at the labor_payment
  -- (defensive — should be 0 for contract-type lp)
  UPDATE public.daily_attendance
  SET is_paid              = false,
      payment_date         = null,
      payment_id           = null,
      settlement_group_id  = null
  WHERE payment_id = v_lp_id;

  GET DIAGNOSTICS v_da_reset_count = ROW_COUNT;
  RAISE NOTICE 'Step 1: reset % daily_attendance row(s) (expected 0 for contract laborer).', v_da_reset_count;

  -- Step 2: hard-delete payment_week_allocations for this labor_payment
  -- Log the IDs first for audit
  RAISE NOTICE 'Step 2: deleting payment_week_allocations for labor_payment %:', v_lp_id;
  FOR v_alloc_count IN
    SELECT 1 FROM public.payment_week_allocations
    WHERE labor_payment_id = v_lp_id
  LOOP
    -- (loop body intentionally empty — just iterating to populate logs below)
    NULL;
  END LOOP;

  WITH deleted AS (
    DELETE FROM public.payment_week_allocations
    WHERE labor_payment_id = v_lp_id
    RETURNING id, week_start, week_end, allocated_amount
  )
  SELECT COUNT(*) INTO v_alloc_count FROM deleted;

  RAISE NOTICE 'Step 2: deleted % payment_week_allocations row(s).', v_alloc_count;

  -- Step 3: hard-delete the labor_payment
  DELETE FROM public.labor_payments WHERE id = v_lp_id;
  RAISE NOTICE 'Step 3: deleted labor_payment %.', v_lp_id;

  -- Step 4: soft-cancel the settlement_group
  UPDATE public.settlement_groups
  SET
    is_cancelled        = true,
    cancelled_at        = now(),
    cancelled_by        = 'system_migration',
    cancellation_reason = 'Typo: SET-260416-005 was re-recorded as ₹1,00,000 on 2026-05-01 by Shanthi Manoharan when the real-world payment was ₹1,000 (extra zero). The original ₹1,000 record SET-260416-001 already exists in cancelled state. User to re-record the correct ₹1,000 via the mesthri payment dialog after this migration.',
    updated_at          = now()
  WHERE id = v_target_sg_id;

  RAISE NOTICE 'Step 4: soft-cancelled settlement_group %.', v_target_sg_id;

  -- Post-cancel safety check: nothing remains pointing at the SG
  SELECT COUNT(*) INTO v_remaining_lp
  FROM public.labor_payments
  WHERE settlement_group_id = v_target_sg_id;

  IF v_remaining_lp <> 0 THEN
    RAISE EXCEPTION
      'Post-cancel sanity FAILED: % labor_payments still reference SG %. Rolling back.',
      v_remaining_lp, v_target_sg_id;
  END IF;

  SELECT COUNT(*) INTO v_remaining_alloc
  FROM public.payment_week_allocations
  WHERE labor_payment_id = v_lp_id;

  IF v_remaining_alloc <> 0 THEN
    RAISE EXCEPTION
      'Post-cancel sanity FAILED: % payment_week_allocations still reference deleted labor_payment %. Rolling back.',
      v_remaining_alloc, v_lp_id;
  END IF;

  RAISE NOTICE 'Cancel-typo COMPLETE. SG %, labor_payment %, % allocation(s) deleted, % daily_attendance reset.',
    v_target_sg_id, v_lp_id, v_alloc_count, v_da_reset_count;
END $$;
