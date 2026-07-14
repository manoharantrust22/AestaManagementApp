-- Weekly Payout Console — per-laborer COMPANY-SALARY read/write primitives.
--
-- The site weekly page settles a whole company week (settle_company_week_contract);
-- the payout console pays ONE laborer's share of a week. These two functions add the
-- per-laborer variant while integrating with every existing reader unchanged:
--   * labor_payments (is_under_contract=true) row  -> get_salary_waterfall "Filled by",
--     get_salary_slice_summary MESTRI OWED, v_all_expenses 'Contract Salary' branch,
--     get_multi_site_settlement_report.
--   * payment_week_allocations row                 -> per-laborer-week paid tracking
--     (the processWaterfallContractPayment convention).
--   * attendance stamping (all-or-none per laborer-week, ONLY when fully covered)
--     mirrors settle_company_week_contract's UPDATE column-for-column.
--
-- PREDICATE PIN: the eligibility predicate below is the UNSCOPED company branch of
-- company_week_contract_net / get_salary_waterfall (20260707130000) + the laborer
-- filter. If that predicate ever changes, change it here too (and in
-- get_weekly_payout_console — 20260714100100), or console read/write will drift
-- from the weekly page.
--
-- TWO CLAMPS compose the per-laborer remaining:
--
-- 1. LABORER clamp — the laborer's own unconsumed attendance minus what payout-style
--    payments already allocated to this week. "Unconsumed" is deliberately STRICTER
--    than company_week_contract_net's is_paid=false: wallet-channel weekly settles
--    leave is_paid=false but link the day to a live settlement_group, and those days
--    are already paid for.
--
-- 2. SITE-WEEK clamp — the week's unfilled remainder under get_salary_waterfall's
--    read-time oldest-first allocation. Historic mesthri payments fill weeks at SITE
--    level with no per-laborer attribution (no pwa, no stamped days); without this
--    clamp the console would re-offer money the site books already recorded as paid.
--    Because every settlement pours oldest-week-first, aggregate fill has a closed
--    form: week_paid = LEAST(week_due, GREATEST(0, pool - prior_weeks_due)) where
--    pool = all current-period company salary settlements (lp-gated, the waterfall's
--    settlements predicate). Legacy-band weeks (auditing, before data_started_at)
--    are sealed -> remaining 0.

CREATE OR REPLACE FUNCTION public.company_week_laborer_unpaid(
  p_site_id uuid,
  p_laborer_id uuid,
  p_week_start date,
  p_week_end date
) RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_data_started_at date;
  v_auditing        boolean;
  v_laborer_unpaid  numeric;
  v_week_due        numeric;
  v_prior_due       numeric;
  v_pool            numeric;
  v_week_remaining  numeric;
BEGIN
  SELECT s.data_started_at, (s.legacy_status = 'auditing' AND s.data_started_at IS NOT NULL)
    INTO v_data_started_at, v_auditing
    FROM public.sites s WHERE s.id = p_site_id;

  -- Legacy band is sealed on the weekly page; sealed here too.
  IF v_auditing AND p_week_start < v_data_started_at THEN
    RETURN 0;
  END IF;

  -- ---- clamp 1: the laborer's own remaining ------------------------------
  WITH due AS (
    SELECT COALESCE(SUM(d.daily_earnings), 0)::numeric AS amt
    FROM public.daily_attendance d
    JOIN public.laborers l ON l.id = d.laborer_id
    JOIN public.v_daily_attendance_commission vc ON vc.attendance_id = d.id
    WHERE d.site_id = p_site_id
      AND d.laborer_id = p_laborer_id
      AND d.date BETWEEN p_week_start AND p_week_end
      AND d.is_deleted = false
      AND d.is_archived = false
      AND l.laborer_type = 'contract'
      AND d.task_work_package_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.subcontracts sc
        JOIN public.labor_categories lc ON lc.id = sc.trade_category_id
        WHERE sc.id = d.subcontract_id AND lc.name <> 'Civil')
      AND NOT vc.is_commission_crew_day
      AND NOT vc.is_commission_mesthri_own_day
      AND d.is_paid = false
      AND NOT EXISTS (
        SELECT 1 FROM public.settlement_groups g
        WHERE g.id = d.settlement_group_id
          AND g.is_cancelled = false
          AND g.is_archived = false
          AND g.transferred_out_at IS NULL)
  ),
  pwa_paid AS (
    SELECT COALESCE(SUM(pwa.allocated_amount), 0)::numeric AS amt
    FROM public.payment_week_allocations pwa
    JOIN public.labor_payments lp
      ON lp.id = pwa.labor_payment_id AND lp.is_archived = false
    JOIN public.settlement_groups g
      ON g.id = lp.settlement_group_id
     AND g.is_cancelled = false
     AND g.is_archived = false
     AND g.transferred_out_at IS NULL
    WHERE pwa.laborer_id = p_laborer_id
      AND pwa.site_id = p_site_id
      AND pwa.week_start = p_week_start
      AND pwa.is_archived = false
  )
  SELECT GREATEST(0, due.amt - pwa_paid.amt) INTO v_laborer_unpaid FROM due, pwa_paid;

  IF v_laborer_unpaid <= 0 THEN
    RETURN 0;
  END IF;

  -- ---- clamp 2: the week's site-level unfilled remainder ------------------
  SELECT
    COALESCE(SUM(d.daily_earnings) FILTER (
      WHERE d.date BETWEEN p_week_start AND p_week_end), 0)::numeric,
    COALESCE(SUM(d.daily_earnings) FILTER (
      WHERE d.date < p_week_start
        AND (NOT v_auditing OR (d.date - extract(dow FROM d.date)::int)::date >= v_data_started_at)), 0)::numeric
  INTO v_week_due, v_prior_due
  FROM public.daily_attendance d
  JOIN public.laborers l ON l.id = d.laborer_id
  JOIN public.v_daily_attendance_commission vc ON vc.attendance_id = d.id
  WHERE d.site_id = p_site_id
    AND d.date <= p_week_end
    AND d.is_deleted = false
    AND d.is_archived = false
    AND l.laborer_type = 'contract'
    AND d.task_work_package_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.subcontracts sc
      JOIN public.labor_categories lc ON lc.id = sc.trade_category_id
      WHERE sc.id = d.subcontract_id AND lc.name <> 'Civil')
    AND NOT vc.is_commission_crew_day
    AND NOT vc.is_commission_mesthri_own_day;

  -- the waterfall's settlements predicate (20260707130000), current period
  SELECT COALESCE(SUM(sg.total_amount), 0)::numeric
  INTO v_pool
  FROM public.settlement_groups sg
  WHERE sg.site_id = p_site_id
    AND sg.is_cancelled = false
    AND sg.is_archived = false
    AND sg.transferred_out_at IS NULL
    AND sg.settlement_date IS NOT NULL
    AND sg.payment_type = 'salary'
    AND (NOT v_auditing OR sg.settlement_date >= v_data_started_at)
    AND NOT EXISTS (
      SELECT 1 FROM public.subcontracts sc
      JOIN public.labor_categories lc ON lc.id = sc.trade_category_id
      WHERE sc.id = sg.subcontract_id AND lc.name <> 'Civil')
    AND EXISTS (
      SELECT 1 FROM public.labor_payments lp
      WHERE lp.settlement_group_id = sg.id
        AND lp.is_under_contract = true
        AND lp.is_archived = false);

  v_week_remaining := v_week_due - LEAST(v_week_due, GREATEST(0, v_pool - v_prior_due));

  RETURN LEAST(v_laborer_unpaid, GREATEST(0, v_week_remaining));
END;
$function$;

GRANT EXECUTE ON FUNCTION public.company_week_laborer_unpaid(uuid, uuid, date, date)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Record a RUPEE payment against one laborer's company-salary week. Clamps to
-- company_week_laborer_unpaid (server-authoritative — a stale console can never
-- overpay), writes the labor_payments + payment_week_allocations pair, and stamps
-- the laborer's attendance days ONLY when the payment fully covers the console
-- remaining (all-or-none, the processWaterfallContractPayment convention).
-- Returns the recorded amount (0 = nothing owed; caller should treat as stale
-- and abort).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.settle_company_week_laborer(
  p_site_id uuid,
  p_laborer_id uuid,
  p_week_start date,
  p_week_end date,
  p_settlement_group_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_payment_mode text,
  p_payer_source text,
  p_payer_name text,
  p_recorded_by_name text DEFAULT NULL,
  p_recorded_by_user_id uuid DEFAULT NULL
) RETURNS numeric
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_remaining numeric;
  v_record    numeric;
  v_lp_mode   text;
  v_lp_ref    text;
  v_lp_id     uuid;
  v_by        text;
BEGIN
  v_remaining := public.company_week_laborer_unpaid(p_site_id, p_laborer_id, p_week_start, p_week_end);
  v_record := LEAST(GREATEST(COALESCE(p_amount, 0), 0), v_remaining);

  IF v_record <= 0 THEN
    RETURN 0;
  END IF;

  -- labor_payments.payment_mode only accepts cash | upi | bank_transfer.
  v_lp_mode := CASE
    WHEN p_payment_mode IN ('cash', 'upi', 'bank_transfer') THEN p_payment_mode
    WHEN p_payment_mode = 'net_banking' THEN 'bank_transfer'
    ELSE 'cash'
  END;

  v_by := COALESCE(p_recorded_by_name, 'Weekly Payout');

  BEGIN
    v_lp_ref := public.generate_payment_reference(p_site_id);
    INSERT INTO public.labor_payments (
      laborer_id, site_id, payment_date, payment_for_date, actual_payment_date,
      amount, payment_mode, payment_channel, payment_type, is_under_contract,
      subcontract_id, paid_by, paid_by_user_id, recorded_by, recorded_by_user_id,
      notes, settlement_group_id, payment_reference
    ) VALUES (
      p_laborer_id, p_site_id, p_payment_date, p_week_start, p_payment_date,
      v_record, v_lp_mode, 'direct', 'salary', true,
      NULL, v_by, p_recorded_by_user_id, v_by, p_recorded_by_user_id,
      'Weekly payout ' || to_char(p_week_start, 'DD Mon') || ' - ' || to_char(p_week_end, 'DD Mon'),
      p_settlement_group_id, v_lp_ref
    ) RETURNING id INTO v_lp_id;
  EXCEPTION WHEN unique_violation THEN
    -- reference collision under concurrency: retry once with a suffixed ref
    v_lp_ref := public.generate_payment_reference(p_site_id) || '-' || substr(gen_random_uuid()::text, 1, 4);
    INSERT INTO public.labor_payments (
      laborer_id, site_id, payment_date, payment_for_date, actual_payment_date,
      amount, payment_mode, payment_channel, payment_type, is_under_contract,
      subcontract_id, paid_by, paid_by_user_id, recorded_by, recorded_by_user_id,
      notes, settlement_group_id, payment_reference
    ) VALUES (
      p_laborer_id, p_site_id, p_payment_date, p_week_start, p_payment_date,
      v_record, v_lp_mode, 'direct', 'salary', true,
      NULL, v_by, p_recorded_by_user_id, v_by, p_recorded_by_user_id,
      'Weekly payout ' || to_char(p_week_start, 'DD Mon') || ' - ' || to_char(p_week_end, 'DD Mon'),
      p_settlement_group_id, v_lp_ref
    ) RETURNING id INTO v_lp_id;
  END;

  INSERT INTO public.payment_week_allocations (
    labor_payment_id, laborer_id, site_id, week_start, week_end, allocated_amount
  ) VALUES (
    v_lp_id, p_laborer_id, p_site_id, p_week_start, p_week_end, v_record
  );

  -- Stamp the days only when the payment covers the console-offered remaining
  -- (all-or-none per laborer-week). When a site-level unattributed fill covered
  -- part of the week, paying the console remainder closes the laborer-week in
  -- aggregate, so stamping is correct. Column set mirrors settle_company_week_contract.
  IF v_record >= v_remaining - 0.005 THEN
    WITH cand AS (
      SELECT d.id
      FROM public.daily_attendance d
      JOIN public.laborers l ON l.id = d.laborer_id
      JOIN public.v_daily_attendance_commission vc ON vc.attendance_id = d.id
      WHERE d.site_id = p_site_id
        AND d.laborer_id = p_laborer_id
        AND d.date BETWEEN p_week_start AND p_week_end
        AND d.is_deleted = false
        AND d.is_archived = false
        AND l.laborer_type = 'contract'
        AND d.task_work_package_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.subcontracts sc
          JOIN public.labor_categories lc ON lc.id = sc.trade_category_id
          WHERE sc.id = d.subcontract_id AND lc.name <> 'Civil')
        AND NOT vc.is_commission_crew_day
        AND NOT vc.is_commission_mesthri_own_day
        AND d.is_paid = false
        AND NOT EXISTS (
          SELECT 1 FROM public.settlement_groups g
          WHERE g.id = d.settlement_group_id
            AND g.is_cancelled = false
            AND g.is_archived = false
            AND g.transferred_out_at IS NULL)
    )
    UPDATE public.daily_attendance d
      SET is_paid = true,
          payment_date = p_payment_date,
          payment_mode = p_payment_mode,
          paid_via = 'direct',
          payer_source = p_payer_source,
          payer_name = p_payer_name,
          settlement_group_id = p_settlement_group_id,
          payment_id = v_lp_id,
          mesthri_commission_amount = NULL,
          mesthri_commission_collector_id = NULL
      FROM cand c
      WHERE d.id = c.id;
  END IF;

  RETURN v_record;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.settle_company_week_laborer(
  uuid, uuid, date, date, uuid, numeric, date, text, text, text, text, uuid
) TO authenticated, service_role;
