-- Migration: Cancel 10 phantom "excess" settlement_groups on Srinivasan House & Shop
-- Date: 2026-05-02
-- Site: 79bfcfb3-4b0d-4240-8fce-d1ab584ef972 (Srinivasan House & Shop, Pudukkottai)
--
-- Purpose:
-- Between 2026-04-06 and 2026-04-26 the salary settlement creation flow was
-- blocked when a subcontract had no head mestri assigned (see commits 2572ab6
-- and 768af83 from 2026-05-01). Operators worked around this by recording
-- mesthri payments as `payment_type='excess'` settlement_groups instead. After
-- 768af83 deployed at 2026-05-01 11:28 IST and unblocked the proper flow, the
-- same real-world payments were re-recorded as `payment_type='salary'`
-- settlement_groups (with attached labor_payments and waterfall allocations)
-- between 11:38 and 12:41 IST that morning — but the original `excess`
-- workaround rows were never cancelled.
--
-- Result: each of these 10 real-world payments is recorded twice in
-- settlement_groups, once as `excess` (the orphan workaround, no
-- labor_payments, no payment_week_allocations) and once as `salary` (the
-- proper record). The unified ledger on /site/payments — which lists raw
-- settlement_groups by settlement_date — surfaces both halves, making it look
-- like double payments. The contract waterfall view is unaffected because it
-- follows allocations and the orphan rows have none.
--
-- This migration cancels exactly the 10 orphan `excess` rows by primary key.
-- Each targeted row was independently verified to have:
--   - is_cancelled = false
--   - payment_type = 'excess'
--   - NO daily_attendance / market_laborer_attendance link
--   - NO labor_payments link (and therefore no payment_week_allocations)
--   - A matching salary settlement_group on the same settlement_date with the
--     same total_amount and a real labor_payments link (the proper record)
--
-- Cancellation, NOT deletion: we set is_cancelled=true and stamp the audit
-- columns. Every consuming RPC (get_payment_summary, get_payments_ledger,
-- get_salary_waterfall, get_salary_slice_summary) already filters
-- WHERE is_cancelled = false, so this surgically removes the orphans from
-- every view. If anything looks wrong afterwards, the cancellation can be
-- reverted by setting is_cancelled=false on these same IDs.
--
-- The 19 OTHER unpaired `excess` settlement_groups on this site (totalling
-- ₹22,799 across Jan-Apr 2026) represent real "excess return" transactions
-- and are intentionally NOT touched by this migration.

DO $$
DECLARE
  v_target_ids uuid[] := ARRAY[
    '50402d61-499b-447e-bea6-187cc4c6c769'::uuid, -- SET-260406-002 ₹3,000   (twin: SET-260406-005)
    '913f90cd-73e0-4506-a5d2-123e39d651e1'::uuid, -- SET-260406-003 ₹1,000   (twin: SET-260406-006)
    'ef3dd7af-38fc-4375-980f-8369f35975c0'::uuid, -- SET-260407-001 ₹1,000   (twin: SET-260407-003)
    'e7e25148-ed69-49de-a198-9d9f8302f7d5'::uuid, -- SET-260413-002 ₹2,000   (twin: SET-260513-001)
    'df36ef3b-7d7d-4eee-8223-ad9fbf073b03'::uuid, -- SET-260415-001 ₹5,000   (twin: SET-260415-003)
    '087c1203-06e4-4dc5-9ce4-2a436626a3bc'::uuid, -- SET-260416-003 ₹1,00,000 (twin: SET-260416-005)
    '8d49a58c-928e-4983-bd13-f45ad2146c33'::uuid, -- SET-260422-001 ₹400     (twin: SET-260422-002)
    'ff8b98cf-8f98-43ea-b98f-fe6330e1cb28'::uuid, -- SET-260423-001 ₹1,000   (twin: SET-260423-002)
    '1e1bbb9e-fe9e-4613-9377-dc2d0544aa77'::uuid, -- SET-260424-001 ₹2,000   (twin: SET-260424-002)
    '13ac0c66-d02f-4abf-94dd-f0763d6cf0fd'::uuid  -- SET-260426-001 ₹1,000   (twin: SET-260426-002)
  ];
  v_expected_count int := 10;
  v_expected_total numeric := 116400.00;
  v_safety_count   int;
  v_safety_total   numeric;
  v_updated_count  int;
  v_any_present    int;
BEGIN
  -- Skip on environments without the production rows (fresh local DB, etc.).
  -- Production already ran this once and won't re-execute on file edit.
  SELECT COUNT(*) INTO v_any_present
  FROM public.settlement_groups
  WHERE id = ANY(v_target_ids);

  IF v_any_present = 0 THEN
    RAISE NOTICE 'No phantom-excess target rows present; skipping migration body.';
    RETURN;
  END IF;

  -- Pre-flight safety check: every target row must still match its expected
  -- shape. If any row was already cancelled, deleted, or mutated (e.g. has
  -- gained labor_payments), abort without touching anything.
  SELECT COUNT(*), COALESCE(SUM(total_amount), 0)
    INTO v_safety_count, v_safety_total
  FROM public.settlement_groups sg
  WHERE sg.id = ANY(v_target_ids)
    AND sg.is_cancelled = false
    AND sg.payment_type = 'excess'
    AND sg.site_id = '79bfcfb3-4b0d-4240-8fce-d1ab584ef972'
    AND NOT EXISTS (SELECT 1 FROM public.daily_attendance da
                    WHERE da.settlement_group_id = sg.id)
    AND NOT EXISTS (SELECT 1 FROM public.market_laborer_attendance ma
                    WHERE ma.settlement_group_id = sg.id)
    AND NOT EXISTS (SELECT 1 FROM public.labor_payments lp
                    WHERE lp.settlement_group_id = sg.id);

  IF v_safety_count <> v_expected_count THEN
    RAISE EXCEPTION
      'Phantom-excess cleanup aborted: expected % candidate rows, found %. Re-verify before re-running.',
      v_expected_count, v_safety_count;
  END IF;

  IF v_safety_total <> v_expected_total THEN
    RAISE EXCEPTION
      'Phantom-excess cleanup aborted: expected total ₹%, found ₹%. Re-verify before re-running.',
      v_expected_total, v_safety_total;
  END IF;

  RAISE NOTICE 'Pre-flight OK: % rows totalling ₹% match expected shape.',
    v_safety_count, v_safety_total;

  -- Twin verification: for each target, confirm a matching salary twin still
  -- exists with labor_payments. If a twin is missing, the target is no longer
  -- a duplicate and must NOT be cancelled.
  PERFORM 1
  FROM unnest(v_target_ids) AS target_id
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.settlement_groups src
    JOIN public.settlement_groups twin
      ON twin.site_id        = src.site_id
     AND twin.is_cancelled   = false
     AND twin.payment_type   = 'salary'
     AND twin.settlement_date = src.settlement_date
     AND twin.total_amount    = src.total_amount
    WHERE src.id = target_id
      AND EXISTS (SELECT 1 FROM public.labor_payments lp
                  WHERE lp.settlement_group_id = twin.id)
  );

  IF FOUND THEN
    RAISE EXCEPTION
      'Phantom-excess cleanup aborted: at least one target has no matching salary twin. Re-verify before re-running.';
  END IF;

  RAISE NOTICE 'Twin check OK: every target has a matching salary settlement_group with labor_payments.';

  -- Cancellation
  WITH updated AS (
    UPDATE public.settlement_groups
    SET
      is_cancelled        = true,
      cancelled_at        = now(),
      cancelled_by        = 'system_migration',
      cancellation_reason = 'Phantom duplicate of contract salary settlement; '
                         || 'workaround entry created before head-mesthri unblock '
                         || '(commit 768af83, 2026-05-01) and superseded by a proper '
                         || 'salary-type settlement_group on the same date for the '
                         || 'same amount.',
      updated_at          = now()
    WHERE id = ANY(v_target_ids)
      AND is_cancelled = false
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_updated_count FROM updated;

  IF v_updated_count <> v_expected_count THEN
    RAISE EXCEPTION
      'Cancellation count mismatch: expected % rows updated, got %. Transaction will roll back.',
      v_expected_count, v_updated_count;
  END IF;

  RAISE NOTICE 'Cancelled % phantom excess settlement_groups (₹% total).',
    v_updated_count, v_safety_total;
END $$;
