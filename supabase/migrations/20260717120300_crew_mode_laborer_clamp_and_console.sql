-- Crew weekly pay — Part 4: crew-aware per-laborer clamp, settle, and payout console.
--
-- NON-CREW SITES ARE UNCHANGED: every crew branch is keyed on crew_pay_config
-- returning a row; without one, each function reduces to its 20260714100200 /
-- 20260714100100 behavior.
--
-- CREW RULES (match get_salary_crew_ledger / get_salary_waterfall crew branches):
--   * Weeks BEFORE crew_pay_effective_from are frozen — considered paid via the
--     waterfall; company_week_laborer_unpaid returns 0 for them (read exclusion
--     ⇒ write guard: nothing can be double-paid against them).
--   * Post-cutover LABORER (non-mesthri) owed = NET of commission
--     (mesthri_commission_of), minus targeted pwa money. The untargeted pool no
--     longer reduces laborer remainders — no site-week proportional cap.
--   * Post-cutover MESTHRI owed = own gross, minus targeted pwa money, minus the
--     pool absorption closed form (pool demand sequence: pre weeks at full gross,
--     post weeks at mesthri share = own + commission, own-first inside a week).
--   * settle_company_week_laborer clamps at those values, stamps the commission
--     SNAPSHOT (mesthri_commission_amount / _collector_id) onto settled days —
--     mirroring the contract direct-pay path — and stamps the TARGETED marker
--     (contract_ref_kind/contract_ref_id/contract_laborer_id) onto the settlement
--     group so the waterfall/ledger classify it as per-laborer money.
--   * get_weekly_payout_console on crew sites: company bucket shows NET with the
--     commission split, frozen weeks contribute 0 owed, no proportional cap, and
--     the MESTHRI is excluded from the company bucket (his own wages + commission
--     are handled by the Salary Settlements crew strip, not the console).

-- ---------------------------------------------------------------------------
-- company_week_laborer_unpaid
-- ---------------------------------------------------------------------------
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
  cfg               record;
  v_crew            boolean := false;
  v_own_due         numeric;
  v_prior_demand    numeric;
  v_absorbed_own    numeric;
BEGIN
  SELECT s.data_started_at, (s.legacy_status = 'auditing' AND s.data_started_at IS NOT NULL)
    INTO v_data_started_at, v_auditing
    FROM public.sites s WHERE s.id = p_site_id;

  -- Legacy band is sealed on the weekly page; sealed here too.
  IF v_auditing AND p_week_start < v_data_started_at THEN
    RETURN 0;
  END IF;

  SELECT * INTO cfg FROM public.crew_pay_config(p_site_id);
  v_crew := (cfg.subcontract_id IS NOT NULL);

  -- Crew mode: pre-cutover weeks are frozen (considered paid via the waterfall).
  IF v_crew AND p_week_start < cfg.effective_from THEN
    RETURN 0;
  END IF;

  -- ---- clamp 1: the laborer's own remaining ------------------------------
  -- Crew mode values non-mesthri days at NET of commission.
  WITH due AS (
    SELECT COALESCE(SUM(
      CASE
        WHEN v_crew AND d.laborer_id <> cfg.mesthri_id THEN
          d.daily_earnings - CASE
            WHEN d.mesthri_commission_collector_id = cfg.mesthri_id
                 AND d.mesthri_commission_amount IS NOT NULL
              THEN d.mesthri_commission_amount
            ELSE public.mesthri_commission_of(
                   true, d.daily_earnings, l.commission_per_day, COALESCE(d.work_days, 1))
          END
        ELSE d.daily_earnings
      END), 0)::numeric AS amt
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

  -- Crew mode, non-mesthri laborer: the pool never covers laborers post-cutover,
  -- so clamp 1 is the whole answer.
  IF v_crew AND p_laborer_id <> cfg.mesthri_id THEN
    RETURN v_laborer_unpaid;
  END IF;

  IF v_crew THEN
    -- ---- crew mesthri: subtract the pool absorption closed form ------------
    -- Demand sequence consumed by the untargeted pool, oldest week first:
    -- pre-cutover weeks at full gross, post-cutover weeks at mesthri share
    -- (own gross + commission). Own-first inside the week.
    WITH days AS (
      SELECT
        (d.date - extract(dow FROM d.date)::int)::date AS w_start,
        d.daily_earnings::numeric AS gross,
        CASE WHEN d.laborer_id = cfg.mesthri_id THEN d.daily_earnings ELSE 0 END::numeric AS own,
        CASE
          WHEN d.laborer_id = cfg.mesthri_id THEN 0
          WHEN d.mesthri_commission_collector_id = cfg.mesthri_id
               AND d.mesthri_commission_amount IS NOT NULL
            THEN d.mesthri_commission_amount
          ELSE public.mesthri_commission_of(
                 true, d.daily_earnings, l.commission_per_day, COALESCE(d.work_days, 1))
        END::numeric AS comm
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
        AND NOT vc.is_commission_mesthri_own_day
        AND NOT (v_auditing AND (d.date - extract(dow FROM d.date)::int)::date < v_data_started_at)
    ),
    weeks AS (
      SELECT
        w_start,
        SUM(gross) AS gross,
        SUM(own)   AS own_due,
        SUM(comm)  AS comm_due
      FROM days GROUP BY w_start
    )
    SELECT
      COALESCE(SUM(CASE WHEN w.w_start < cfg.effective_from THEN w.gross
                        WHEN w.w_start < p_week_start       THEN w.own_due + w.comm_due
                        ELSE 0 END), 0),
      COALESCE(SUM(w.own_due) FILTER (WHERE w.w_start = p_week_start), 0)
    INTO v_prior_demand, v_own_due
    FROM weeks w;

    SELECT COALESCE(SUM(sg.total_amount), 0)::numeric INTO v_pool
    FROM public.settlement_groups sg
    WHERE sg.site_id = p_site_id
      AND sg.transferred_out_at IS NULL
      AND sg.is_cancelled = false
      AND sg.is_archived = false
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
          AND lp.is_archived = false)
      AND sg.payout_batch_id IS NULL
      AND sg.contract_laborer_id IS NULL;

    -- own-first: what the pool absorbs into THIS week's own wages
    v_absorbed_own := LEAST(v_own_due, GREATEST(0, v_pool - v_prior_demand));

    RETURN GREATEST(0, v_laborer_unpaid - v_absorbed_own);
  END IF;

  -- ---- clamp 2 (non-crew): the week's site-level unfilled remainder --------
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
-- settle_company_week_laborer — crew-aware clamp + commission snapshot stamping
-- + the targeted marker on the settlement group.
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
  cfg         record;
  v_crew_post boolean := false;
BEGIN
  v_remaining := public.company_week_laborer_unpaid(p_site_id, p_laborer_id, p_week_start, p_week_end);
  v_record := LEAST(GREATEST(COALESCE(p_amount, 0), 0), v_remaining);

  IF v_record <= 0 THEN
    RETURN 0;
  END IF;

  SELECT * INTO cfg FROM public.crew_pay_config(p_site_id);
  v_crew_post := (cfg.subcontract_id IS NOT NULL AND p_week_start >= cfg.effective_from);

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

  -- Crew mode: mark the group as TARGETED per-laborer money (the discriminator
  -- get_salary_waterfall / get_salary_crew_ledger key on) and link it to the
  -- crew contract so it shows in the contract's payment feed.
  IF v_crew_post THEN
    UPDATE public.settlement_groups
      SET contract_ref_kind   = 'subcontract',
          contract_ref_id     = cfg.subcontract_id,
          contract_laborer_id = p_laborer_id
    WHERE id = p_settlement_group_id;
  END IF;

  -- Stamp the days only when the payment covers the console-offered remaining
  -- (all-or-none per laborer-week). When a site-level unattributed fill covered
  -- part of the week, paying the console remainder closes the laborer-week in
  -- aggregate, so stamping is correct. Column set mirrors settle_company_week_contract.
  -- Crew mode additionally LOCKS the commission snapshot (mirrors the contract
  -- direct-pay path) so later rate edits can't rewrite settled money.
  IF v_record >= v_remaining - 0.005 THEN
    WITH cand AS (
      SELECT d.id, d.daily_earnings, COALESCE(d.work_days, 1)::numeric AS wd,
             l.commission_per_day
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
          mesthri_commission_amount =
            CASE WHEN v_crew_post AND p_laborer_id <> cfg.mesthri_id
              THEN public.mesthri_commission_of(true, c.daily_earnings, c.commission_per_day, c.wd)
              ELSE NULL END,
          mesthri_commission_collector_id =
            CASE WHEN v_crew_post AND p_laborer_id <> cfg.mesthri_id
              THEN cfg.mesthri_id ELSE NULL END
      FROM cand c
      WHERE d.id = c.id;
  END IF;

  RETURN v_record;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.settle_company_week_laborer(
  uuid, uuid, date, date, uuid, numeric, date, text, text, text, text, uuid
) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- get_weekly_payout_console — crew sites: NET company bucket, frozen pre-cutover
-- weeks, no proportional cap, mesthri excluded from the company bucket.
-- Non-crew sites: expressions reduce to 20260714100100 verbatim.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_weekly_payout_console(
  p_site_ids uuid[],
  p_week_start date,
  p_week_end date
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id   uuid;
  v_caller_role user_role;
  v_site        uuid;
  v_result      jsonb;
BEGIN
  IF p_site_ids IS NULL OR array_length(p_site_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'get_weekly_payout_console: p_site_ids is required' USING ERRCODE = '22023';
  END IF;
  IF p_week_start IS NULL OR p_week_end IS NULL OR p_week_end < p_week_start THEN
    RAISE EXCEPTION 'get_weekly_payout_console: invalid week range' USING ERRCODE = '22023';
  END IF;

  SELECT u.id, u.role INTO v_caller_id, v_caller_role
  FROM users u WHERE u.auth_id = auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized: no application user for the current session' USING ERRCODE = '42501';
  END IF;
  IF v_caller_role NOT IN ('admin', 'office') THEN
    FOREACH v_site IN ARRAY p_site_ids LOOP
      IF NOT public.can_access_site(v_site) THEN
        RAISE EXCEPTION 'Not authorized for one or more selected sites' USING ERRCODE = '42501';
      END IF;
    END LOOP;
  END IF;

  WITH
  crew_cfgs AS (
    SELECT sid.id AS site_id, c.subcontract_id, c.mesthri_id, c.effective_from
    FROM unnest(p_site_ids) AS sid(id)
    CROSS JOIN LATERAL public.crew_pay_config(sid.id) c
  ),
  -- ---------------------------------------------------------------- company
  company_days AS (
    SELECT
      d.laborer_id,
      d.site_id,
      (d.date - extract(dow FROM d.date)::int)::date AS w_start,
      d.work_days,
      d.daily_earnings,
      -- crew sites value post-cutover crew days at NET of commission
      CASE
        WHEN cc.site_id IS NOT NULL AND d.date >= cc.effective_from
             AND d.laborer_id <> cc.mesthri_id THEN
          CASE
            WHEN d.mesthri_commission_collector_id = cc.mesthri_id
                 AND d.mesthri_commission_amount IS NOT NULL
              THEN d.mesthri_commission_amount
            ELSE public.mesthri_commission_of(
                   true, d.daily_earnings, l.commission_per_day, COALESCE(d.work_days, 1))
          END
        ELSE 0
      END::numeric AS commission,
      (cc.site_id IS NOT NULL AND d.date < cc.effective_from) AS crew_frozen,
      (cc.site_id IS NOT NULL) AS crew_site,
      (d.is_paid = false
        AND NOT EXISTS (
          SELECT 1 FROM settlement_groups g
          WHERE g.id = d.settlement_group_id
            AND g.is_cancelled = false
            AND g.is_archived = false
            AND g.transferred_out_at IS NULL)) AS unconsumed
    FROM daily_attendance d
    JOIN laborers l ON l.id = d.laborer_id
    JOIN v_daily_attendance_commission vc ON vc.attendance_id = d.id
    JOIN sites s ON s.id = d.site_id
    LEFT JOIN crew_cfgs cc ON cc.site_id = d.site_id
    WHERE d.site_id = ANY (p_site_ids)
      AND d.date <= p_week_end
      AND d.is_deleted = false
      AND d.is_archived = false
      AND l.laborer_type = 'contract'
      -- unscoped company-week branch (20260707130000)
      AND d.task_work_package_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM subcontracts sc
        JOIN labor_categories lc ON lc.id = sc.trade_category_id
        WHERE sc.id = d.subcontract_id AND lc.name <> 'Civil')
      AND NOT vc.is_commission_crew_day
      AND NOT vc.is_commission_mesthri_own_day
      -- crew sites: the mesthri's own wages + commission live on the Salary
      -- Settlements crew strip, not the console
      AND NOT (cc.site_id IS NOT NULL AND d.laborer_id = cc.mesthri_id)
      -- legacy band sealed while auditing
      AND NOT (s.legacy_status = 'auditing'
               AND s.data_started_at IS NOT NULL
               AND (d.date - extract(dow FROM d.date)::int)::date < s.data_started_at)
  ),
  company_weeks AS (
    SELECT
      laborer_id, site_id, w_start,
      -- crew: NET, frozen weeks contribute nothing
      COALESCE(SUM(daily_earnings - commission)
        FILTER (WHERE unconsumed AND NOT crew_frozen), 0)::numeric AS due_unconsumed,
      COALESCE(SUM(daily_earnings), 0)::numeric                    AS gross_all,
      COALESCE(SUM(commission), 0)::numeric                        AS commission_all,
      COALESCE(SUM(work_days), 0)::numeric                         AS days_all,
      bool_or(crew_site)                                           AS crew_site
    FROM company_days
    GROUP BY 1, 2, 3
  ),
  pwa_weeks AS (
    SELECT
      pwa.laborer_id, pwa.site_id, pwa.week_start AS w_start,
      COALESCE(SUM(pwa.allocated_amount), 0)::numeric AS paid
    FROM payment_week_allocations pwa
    JOIN labor_payments lp
      ON lp.id = pwa.labor_payment_id AND lp.is_archived = false
    JOIN settlement_groups g
      ON g.id = lp.settlement_group_id
     AND g.is_cancelled = false
     AND g.is_archived = false
     AND g.transferred_out_at IS NULL
    WHERE pwa.site_id = ANY (p_site_ids)
      AND pwa.week_start <= p_week_start
      AND pwa.is_archived = false
    GROUP BY 1, 2, 3
  ),
  -- site-level week fill (waterfall closed form) — NON-CREW sites only; on crew
  -- sites the untargeted pool belongs to the mesthri, never the laborers.
  site_week_due AS (
    SELECT site_id, w_start, SUM(daily_earnings)::numeric AS due
    FROM company_days
    WHERE NOT crew_site
    GROUP BY 1, 2
  ),
  site_pool AS (
    SELECT
      sg.site_id,
      COALESCE(SUM(sg.total_amount), 0)::numeric AS pool
    FROM settlement_groups sg
    JOIN sites s ON s.id = sg.site_id
    WHERE sg.site_id = ANY (p_site_ids)
      AND sg.is_cancelled = false
      AND sg.is_archived = false
      AND sg.transferred_out_at IS NULL
      AND sg.settlement_date IS NOT NULL
      AND sg.payment_type = 'salary'
      AND (NOT (s.legacy_status = 'auditing' AND s.data_started_at IS NOT NULL)
           OR sg.settlement_date >= s.data_started_at)
      AND NOT EXISTS (
        SELECT 1 FROM subcontracts sc
        JOIN labor_categories lc ON lc.id = sc.trade_category_id
        WHERE sc.id = sg.subcontract_id AND lc.name <> 'Civil')
      AND EXISTS (
        SELECT 1 FROM labor_payments lp
        WHERE lp.settlement_group_id = sg.id
          AND lp.is_under_contract = true
          AND lp.is_archived = false)
    GROUP BY 1
  ),
  site_week_fill AS (
    SELECT
      swd.site_id,
      swd.w_start,
      GREATEST(0, swd.due - LEAST(swd.due, GREATEST(0,
        COALESCE(sp.pool, 0)
        - (SUM(swd.due) OVER (PARTITION BY swd.site_id ORDER BY swd.w_start) - swd.due)
      ))) AS remaining
    FROM site_week_due swd
    LEFT JOIN site_pool sp ON sp.site_id = swd.site_id
  ),
  company_week_state AS (
    SELECT
      cw.laborer_id, cw.site_id, cw.w_start,
      cw.days_all, cw.gross_all, cw.commission_all, cw.crew_site,
      GREATEST(0, cw.due_unconsumed - COALESCE(pw.paid, 0)) AS unpaid_raw,
      COALESCE(pw.paid, 0)                                  AS paid
    FROM company_weeks cw
    LEFT JOIN pwa_weeks pw
      ON pw.laborer_id = cw.laborer_id AND pw.site_id = cw.site_id AND pw.w_start = cw.w_start
  ),
  week_unpaid_sums AS (
    SELECT site_id, w_start, SUM(unpaid_raw) AS sum_unpaid
    FROM company_week_state
    GROUP BY 1, 2
  ),
  company_week_capped AS (
    SELECT
      cws.laborer_id, cws.site_id, cws.w_start, cws.days_all, cws.gross_all,
      cws.commission_all, cws.paid,
      CASE
        WHEN cws.crew_site THEN cws.unpaid_raw            -- crew: no pool cap
        WHEN cws.unpaid_raw <= 0 THEN 0
        WHEN swf.remaining <= 0 THEN 0
        WHEN wus.sum_unpaid <= swf.remaining THEN cws.unpaid_raw
        ELSE ROUND(cws.unpaid_raw * swf.remaining / wus.sum_unpaid, 2)
      END AS unpaid
    FROM company_week_state cws
    JOIN week_unpaid_sums wus
      ON wus.site_id = cws.site_id AND wus.w_start = cws.w_start
    LEFT JOIN site_week_fill swf
      ON swf.site_id = cws.site_id AND swf.w_start = cws.w_start
  ),
  company_buckets AS (
    SELECT
      laborer_id, site_id,
      COALESCE(SUM(days_all)       FILTER (WHERE w_start = p_week_start), 0) AS days_week,
      COALESCE(SUM(gross_all)      FILTER (WHERE w_start = p_week_start), 0) AS gross_week,
      COALESCE(SUM(commission_all) FILTER (WHERE w_start = p_week_start), 0) AS commission_week,
      COALESCE(SUM(unpaid)         FILTER (WHERE w_start = p_week_start), 0) AS this_week_unpaid,
      COALESCE(SUM(unpaid)         FILTER (WHERE w_start < p_week_start), 0) AS earlier_unpaid,
      COALESCE(SUM(paid)           FILTER (WHERE w_start = p_week_start), 0) AS paid_week
    FROM company_week_capped
    GROUP BY 1, 2
  ),
  -- ---------------------------------------------------------------- contracts
  contract_days AS (
    SELECT
      d.laborer_id,
      d.site_id,
      CASE WHEN d.task_work_package_id IS NOT NULL THEN 'task_work' ELSE 'subcontract' END AS ref_kind,
      COALESCE(d.task_work_package_id, d.subcontract_id) AS ref_id,
      (d.date >= p_week_start) AS in_week,
      d.work_days,
      d.daily_earnings,
      COALESCE(d.mesthri_commission_amount, vc.commission_amount, 0)::numeric AS commission
    FROM daily_attendance d
    JOIN laborers l ON l.id = d.laborer_id
    JOIN v_daily_attendance_commission vc ON vc.attendance_id = d.id
    WHERE d.site_id = ANY (p_site_ids)
      AND d.date <= p_week_end
      AND d.is_deleted = false
      AND d.is_archived = false
      AND l.laborer_type = 'contract'
      AND (vc.is_commission_crew_day OR vc.is_commission_mesthri_own_day)
      AND COALESCE(d.task_work_package_id, d.subcontract_id) IS NOT NULL
  ),
  contract_sums AS (
    SELECT
      laborer_id, site_id, ref_kind, ref_id,
      COALESCE(SUM(work_days)                    FILTER (WHERE in_week), 0)::numeric AS days_week,
      COALESCE(SUM(daily_earnings)               FILTER (WHERE in_week), 0)::numeric AS gross_week,
      COALESCE(SUM(commission)                   FILTER (WHERE in_week), 0)::numeric AS commission_week,
      COALESCE(SUM(daily_earnings - commission)  FILTER (WHERE in_week), 0)::numeric AS net_week,
      COALESCE(SUM(daily_earnings - commission), 0)::numeric                          AS net_upto
    FROM contract_days
    GROUP BY 1, 2, 3, 4
  ),
  contract_paid AS (
    -- same predicate as record_contract_laborer_payment / get_contract_labor_ledger
    SELECT
      sg.contract_ref_kind AS ref_kind,
      sg.contract_ref_id   AS ref_id,
      sg.contract_laborer_id AS laborer_id,
      COALESCE(SUM(sg.total_amount), 0)::numeric AS paid
    FROM settlement_groups sg
    WHERE sg.contract_ref_kind IS NOT NULL
      AND sg.is_cancelled = false
      AND sg.is_archived = false
      -- crew per-laborer payments carry the link columns too, but they are
      -- COMPANY-salary money (they have labor_payments + pwa rows) — the pwa
      -- side already accounts them; do not double-count them here.
      AND NOT EXISTS (
        SELECT 1 FROM labor_payments lp
        WHERE lp.settlement_group_id = sg.id
          AND lp.is_archived = false)
    GROUP BY 1, 2, 3
  ),
  contract_buckets AS (
    SELECT
      cs.laborer_id, cs.site_id, cs.ref_kind, cs.ref_id,
      cs.days_week, cs.gross_week, cs.commission_week, cs.net_week,
      COALESCE(cp.paid, 0) AS paid_total,
      GREATEST(0, cs.net_upto - COALESCE(cp.paid, 0)) AS total_unpaid
    FROM contract_sums cs
    LEFT JOIN contract_paid cp
      ON cp.ref_kind = cs.ref_kind AND cp.ref_id = cs.ref_id AND cp.laborer_id = cs.laborer_id
  ),
  contract_meta AS (
    SELECT 'task_work'::text AS ref_kind, twp.id AS ref_id, twp.title,
           lc.name AS trade, COALESCE(twp.mesthri_commission_applies, true) AS commission_applies
    FROM task_work_packages twp
    LEFT JOIN labor_categories lc ON lc.id = twp.labor_category_id
    UNION ALL
    SELECT 'subcontract', sc.id, sc.title,
           lc.name, COALESCE(sc.mesthri_commission_applies, true)
    FROM subcontracts sc
    LEFT JOIN labor_categories lc ON lc.id = sc.trade_category_id
  ),
  -- ---------------------------------------------------------------- union
  bucket_rows AS (
    SELECT
      cb.laborer_id,
      jsonb_build_object(
        'site_id', cb.site_id,
        'site_name', s.name,
        'kind', 'company_salary',
        'ref_kind', NULL,
        'ref_id', NULL,
        'title', 'Company salary',
        'trade', NULL,
        'commission_applies', NULL,
        'days_week', cb.days_week,
        'gross_week', cb.gross_week,
        'commission_week', cb.commission_week,
        'net_week', cb.gross_week - cb.commission_week,
        'this_week_unpaid', cb.this_week_unpaid,
        'earlier_unpaid', cb.earlier_unpaid,
        'total_unpaid', cb.this_week_unpaid + cb.earlier_unpaid,
        'paid_total', cb.paid_week
      ) AS bucket,
      (cb.this_week_unpaid + cb.earlier_unpaid) AS total_unpaid,
      cb.days_week
    FROM company_buckets cb
    JOIN sites s ON s.id = cb.site_id
    WHERE cb.days_week > 0 OR (cb.this_week_unpaid + cb.earlier_unpaid) > 0.005
    UNION ALL
    SELECT
      cb.laborer_id,
      jsonb_build_object(
        'site_id', cb.site_id,
        'site_name', s.name,
        'kind', 'contract',
        'ref_kind', cb.ref_kind,
        'ref_id', cb.ref_id,
        'title', COALESCE(cm.title, 'Contract'),
        'trade', cm.trade,
        'commission_applies', cm.commission_applies,
        'days_week', cb.days_week,
        'gross_week', cb.gross_week,
        'commission_week', cb.commission_week,
        'net_week', cb.net_week,
        'this_week_unpaid', LEAST(cb.total_unpaid, GREATEST(cb.net_week, 0)),
        'earlier_unpaid', cb.total_unpaid - LEAST(cb.total_unpaid, GREATEST(cb.net_week, 0)),
        'total_unpaid', cb.total_unpaid,
        'paid_total', cb.paid_total
      ) AS bucket,
      cb.total_unpaid,
      cb.days_week
    FROM contract_buckets cb
    JOIN sites s ON s.id = cb.site_id
    LEFT JOIN contract_meta cm ON cm.ref_kind = cb.ref_kind AND cm.ref_id = cb.ref_id
    WHERE cb.days_week > 0 OR cb.total_unpaid > 0.005
  ),
  batches AS (
    SELECT
      b.laborer_id,
      jsonb_agg(jsonb_build_object(
        'id', b.id,
        'payment_date', b.payment_date,
        'total_amount', b.total_amount,
        'payment_mode', b.payment_mode,
        'notes', b.notes,
        'created_by_name', b.created_by_name,
        'created_at', b.created_at,
        'buckets_result', b.buckets_result
      ) ORDER BY b.created_at) AS batches
    FROM laborer_payout_batches b
    WHERE b.week_start = p_week_start
      AND b.is_reversed = false
    GROUP BY b.laborer_id
  ),
  laborer_rollup AS (
    SELECT
      br.laborer_id,
      jsonb_agg(br.bucket ORDER BY br.bucket ->> 'site_name', br.bucket ->> 'kind', br.bucket ->> 'title') AS buckets,
      SUM(br.total_unpaid) AS total_unpaid,
      SUM(br.days_week)    AS days_week
    FROM bucket_rows br
    GROUP BY br.laborer_id
  )
  SELECT jsonb_build_object(
    'week_start', p_week_start,
    'week_end', p_week_end,
    'laborers', COALESCE(jsonb_agg(
      jsonb_build_object(
        'laborer_id', l.id,
        'name', l.name,
        'role', lr.name,
        'photo_url', l.photo_url,
        'advance_outstanding', GREATEST(0, COALESCE(l.total_advance_given, 0) - COALESCE(l.total_advance_deducted, 0)),
        'total_unpaid', COALESCE(r.total_unpaid, 0),
        'days_week', COALESCE(r.days_week, 0),
        'buckets', COALESCE(r.buckets, '[]'::jsonb),
        'batches', COALESCE(bt.batches, '[]'::jsonb)
      ) ORDER BY l.name
    ), '[]'::jsonb)
  )
  INTO v_result
  FROM laborers l
  LEFT JOIN labor_roles lr ON lr.id = l.role_id
  LEFT JOIN laborer_rollup r ON r.laborer_id = l.id
  LEFT JOIN batches bt ON bt.laborer_id = l.id
  WHERE r.laborer_id IS NOT NULL OR bt.laborer_id IS NOT NULL;

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_weekly_payout_console(uuid[], date, date)
  TO authenticated, service_role;
