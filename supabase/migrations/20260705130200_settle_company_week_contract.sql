-- Mesthri commission — Part B, Migration D: server-authoritative company-week settle.
--
-- The contract branch of processWeeklySettlement can no longer trust a client amount +
-- a blanket is_paid flag: commission crew days settle at NET while normal/own days
-- settle at GROSS, and each crew day needs its commission snapshot written atomically.
-- These functions make the amount + row selection server-authoritative and preserve the
-- "every laborer-day settled exactly once" invariant (same predicate as the read RPCs).
--
-- Also: (1) a CHECK so a contract can't be commission-enabled without a cutover date
-- (which would silently pull unpaid history into the company week), and (2) reverse_settlement
-- now clears the commission snapshot when it un-links a day (else the accrual would drift).

-- 1. Enabled ⇒ cutover date required (all existing rows are disabled, so this is safe).
ALTER TABLE public.task_work_packages DROP CONSTRAINT IF EXISTS chk_twp_commission_effective;
ALTER TABLE public.task_work_packages ADD CONSTRAINT chk_twp_commission_effective
  CHECK (NOT mesthri_commission_enabled OR mesthri_commission_effective_from IS NOT NULL);

ALTER TABLE public.subcontracts DROP CONSTRAINT IF EXISTS chk_sc_commission_effective;
ALTER TABLE public.subcontracts ADD CONSTRAINT chk_sc_commission_effective
  CHECK (NOT mesthri_commission_enabled OR mesthri_commission_effective_from IS NOT NULL);

-- 2. Net + count of UNPAID eligible company-laborer days for a week (server truth for
-- the settlement_group total_amount + laborer_count, so the wallet debit matches).
CREATE OR REPLACE FUNCTION public.company_week_contract_net(
  p_site_id uuid,
  p_date_from date,
  p_date_to date,
  p_subcontract_id uuid DEFAULT NULL
) RETURNS TABLE(net numeric, cnt integer)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT
    COALESCE(SUM(d.daily_earnings - COALESCE(d.mesthri_commission_amount, vc.commission_amount)), 0)::numeric,
    COUNT(*)::int
  FROM public.daily_attendance d
  JOIN public.laborers l ON l.id = d.laborer_id
  JOIN public.v_daily_attendance_commission vc ON vc.attendance_id = d.id
  WHERE d.site_id = p_site_id
    AND d.date BETWEEN p_date_from AND p_date_to
    AND d.is_paid = false
    AND d.is_deleted = false
    AND d.is_archived = false
    AND l.laborer_type = 'contract'
    AND (
      (p_subcontract_id IS NOT NULL
         AND d.subcontract_id = p_subcontract_id
         AND NOT vc.is_commission_crew_day
         AND NOT vc.is_commission_mesthri_own_day)
      OR
      (p_subcontract_id IS NULL AND (
          (d.task_work_package_id IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM public.subcontracts sc
             JOIN public.labor_categories lc ON lc.id = sc.trade_category_id
             WHERE sc.id = d.subcontract_id AND lc.name <> 'Civil'))
          OR vc.is_commission_crew_day
          OR vc.is_commission_mesthri_own_day
      ))
    );
$function$;

GRANT EXECUTE ON FUNCTION public.company_week_contract_net(uuid, date, date, uuid)
  TO authenticated, service_role;

-- 3. Mark the eligible unpaid company-laborer days paid (same predicate), writing the
-- commission snapshot for crew days. One UPDATE; returns rows + Σ net for verification.
CREATE OR REPLACE FUNCTION public.settle_company_week_contract(
  p_site_id uuid,
  p_date_from date,
  p_date_to date,
  p_subcontract_id uuid,
  p_settlement_group_id uuid,
  p_is_paid boolean,
  p_payment_date date,
  p_payment_mode text,
  p_paid_via text,
  p_engineer_transaction_id uuid,
  p_payment_proof_url text,
  p_payment_notes text,
  p_payer_source text,
  p_payer_name text
) RETURNS TABLE(rows_settled integer, total_net numeric)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH cand AS (
    SELECT
      d.id,
      d.daily_earnings,
      vc.is_commission_crew_day,
      vc.commission_amount,
      vc.collector_id
    FROM public.daily_attendance d
    JOIN public.laborers l ON l.id = d.laborer_id
    JOIN public.v_daily_attendance_commission vc ON vc.attendance_id = d.id
    WHERE d.site_id = p_site_id
      AND d.date BETWEEN p_date_from AND p_date_to
      AND d.is_paid = false
      AND d.is_deleted = false
      AND d.is_archived = false
      AND l.laborer_type = 'contract'
      AND (
        (p_subcontract_id IS NOT NULL
           AND d.subcontract_id = p_subcontract_id
           AND NOT vc.is_commission_crew_day
           AND NOT vc.is_commission_mesthri_own_day)
        OR
        (p_subcontract_id IS NULL AND (
            (d.task_work_package_id IS NULL
             AND NOT EXISTS (
               SELECT 1 FROM public.subcontracts sc
               JOIN public.labor_categories lc ON lc.id = sc.trade_category_id
               WHERE sc.id = d.subcontract_id AND lc.name <> 'Civil'))
            OR vc.is_commission_crew_day
            OR vc.is_commission_mesthri_own_day
        ))
      )
  ),
  upd AS (
    UPDATE public.daily_attendance d
      SET is_paid = p_is_paid,
          payment_date = p_payment_date,
          payment_mode = p_payment_mode,
          paid_via = p_paid_via,
          engineer_transaction_id = p_engineer_transaction_id,
          payment_proof_url = p_payment_proof_url,
          payment_notes = p_payment_notes,
          payer_source = p_payer_source,
          payer_name = p_payer_name,
          settlement_group_id = p_settlement_group_id,
          mesthri_commission_amount =
            CASE WHEN c.is_commission_crew_day THEN c.commission_amount ELSE NULL END,
          mesthri_commission_collector_id =
            CASE WHEN c.is_commission_crew_day THEN c.collector_id ELSE NULL END
      FROM cand c
      WHERE d.id = c.id
      RETURNING (c.daily_earnings - COALESCE(c.commission_amount, 0)) AS net
  )
  SELECT COUNT(*)::int, COALESCE(SUM(net), 0)::numeric FROM upd;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.settle_company_week_contract(
  uuid, date, date, uuid, uuid, boolean, date, text, text, uuid, text, text, text, text
) TO authenticated, service_role;

COMMENT ON FUNCTION public.settle_company_week_contract(uuid, date, date, uuid, uuid, boolean, date, text, text, uuid, text, text, text, text) IS
  'Settles the eligible unpaid company-laborer days for a week (same predicate as get_salary_waterfall): commission crew days at NET with a locked snapshot, normal/own days at GROSS. Returns rows_settled + Σ net.';

-- 4. reverse_settlement must also clear the commission snapshot when un-linking a day,
-- else get_mesthri_commission_payable would keep counting the reversed accrual.
-- Reproduced verbatim from 20260611120200 with the two snapshot columns added to the
-- daily_attendance reset.
CREATE OR REPLACE FUNCTION reverse_settlement(
  p_settlement_group_id uuid,
  p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_group         settlement_groups%ROWTYPE;
  v_caller_id     uuid;
  v_caller_role   user_role;
  v_caller_name   text;
  v_spend_cancelled boolean := false;
  v_daily_reset   int := 0;
  v_market_reset  int := 0;
BEGIN
  IF p_settlement_group_id IS NULL THEN
    RAISE EXCEPTION 'reverse_settlement requires a settlement_group_id' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_group
  FROM settlement_groups
  WHERE id = p_settlement_group_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Settlement % not found', p_settlement_group_id USING ERRCODE = 'P0002';
  END IF;

  IF v_group.is_cancelled THEN
    RETURN jsonb_build_object(
      'group_id', v_group.id,
      'already_cancelled', true,
      'spend_cancelled', false,
      'daily_reset', 0,
      'market_reset', 0
    );
  END IF;

  SELECT id, role, name INTO v_caller_id, v_caller_role, v_caller_name
  FROM users
  WHERE auth_id = auth.uid();

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized: no application user for the current session' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    v_caller_role IN ('admin', 'office')
    OR v_caller_id = v_group.created_by
  ) THEN
    RAISE EXCEPTION 'Not authorized to reverse this settlement (only the recorder or office/admin may reverse).'
      USING ERRCODE = '42501';
  END IF;

  UPDATE daily_attendance
  SET is_paid = false,
      payment_date = NULL,
      payment_mode = NULL,
      paid_via = NULL,
      engineer_transaction_id = NULL,
      payment_proof_url = NULL,
      payment_notes = NULL,
      payer_source = NULL,
      payer_name = NULL,
      expense_id = NULL,
      settlement_group_id = NULL,
      -- Clear the mesthri commission snapshot so the accrual reverts to the live estimate.
      mesthri_commission_amount = NULL,
      mesthri_commission_collector_id = NULL
  WHERE settlement_group_id = v_group.id;
  GET DIAGNOSTICS v_daily_reset = ROW_COUNT;

  UPDATE market_laborer_attendance
  SET is_paid = false,
      payment_date = NULL,
      payment_mode = NULL,
      paid_via = NULL,
      engineer_transaction_id = NULL,
      payment_proof_url = NULL,
      payment_notes = NULL,
      payer_source = NULL,
      payer_name = NULL,
      expense_id = NULL,
      settlement_group_id = NULL
  WHERE settlement_group_id = v_group.id;
  GET DIAGNOSTICS v_market_reset = ROW_COUNT;

  IF v_group.engineer_transaction_id IS NOT NULL THEN
    UPDATE site_engineer_transactions
    SET cancelled_at = now(),
        cancelled_by = v_caller_name,
        cancelled_by_user_id = v_caller_id,
        cancellation_reason = COALESCE(p_reason, 'Settlement reversed')
    WHERE id = v_group.engineer_transaction_id
      AND cancelled_at IS NULL;
    IF FOUND THEN
      v_spend_cancelled := true;
    END IF;
  END IF;

  UPDATE settlement_groups
  SET is_cancelled = true,
      cancelled_at = now(),
      cancelled_by = v_caller_name,
      cancelled_by_user_id = v_caller_id,
      cancellation_reason = COALESCE(p_reason, 'Settlement reversed'),
      idempotency_key = NULL
  WHERE id = v_group.id;

  RETURN jsonb_build_object(
    'group_id', v_group.id,
    'already_cancelled', false,
    'spend_cancelled', v_spend_cancelled,
    'daily_reset', v_daily_reset,
    'market_reset', v_market_reset
  );
END;
$$;

GRANT EXECUTE ON FUNCTION reverse_settlement(uuid, text) TO authenticated, service_role;
