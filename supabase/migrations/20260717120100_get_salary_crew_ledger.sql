-- Crew weekly pay — Part 2: the read model for the Salary Settlements "By laborer" view.
--
-- One call returns every Sun–Sat week of the site's Civil salary slice with a
-- per-laborer money breakdown, the mesthri's lifetime block (own wages +
-- commission + pool absorption), project totals, and the pool reconciliation.
--
-- PREDICATE PIN: the day scope is IDENTICAL to get_salary_waterfall's unscoped
-- company branch (20260707130000): site, laborer_type='contract',
-- task_work_package_id IS NULL, non-Civil trades excluded, NOT commission
-- crew/own day. If that predicate changes, change it here too (and in
-- company_week_laborer_unpaid / get_weekly_payout_console).
--
-- MONEY CLASSES (settlement_groups, all live: is_cancelled=false, is_archived=false,
-- transferred_out_at IS NULL; current period only while auditing):
--   * TARGETED  — per-laborer payments: payout_batch_id IS NOT NULL (weekly payout
--     console batches) OR contract_laborer_id IS NOT NULL (crew "Pay" button; the
--     settle RPC stamps the link columns — 20260717120300). Week + laborer come
--     from their payment_week_allocations rows.
--     NOTE: historic mesthri lumps (processContractPayment) ALSO write pwa rows
--     (allocated to the mesthri), so pwa-presence alone is NOT the discriminator —
--     the marker columns are.
--   * POOL      — every other lp-gated salary settlement (the waterfall's
--     settlements predicate): lump money paid to the mesthri with no laborer
--     attribution.
--   * COMMISSION — payment_type='commission' payouts tagged to the crew contract
--     (commission_collector_laborer_id = mesthri, contract_ref_id = crew contract).
--
-- FILL RULES (mirrors get_salary_waterfall's crew branch — 20260717120200):
--   pass 1: TARGETED fills land on their pwa week directly.
--   pass 2: POOL fills oldest-first — PRE-cutover weeks at full gross (the old
--           model: the mesthri received the money and distributed it); POST-cutover
--           weeks capped at the mesthri's share (own wages first, then commission).
--           Leftover = future credit ("excess — counts toward the mesthri").
--   pass 3: COMMISSION payouts fill POST-cutover commission remainders oldest-first
--           (after pool absorption — deterministic display rule).
--
-- PRE-cutover per-laborer paid is a DISPLAY-ONLY proportional reinterpretation
-- (net × week fill ratio). It never feeds a write clamp.

CREATE OR REPLACE FUNCTION public.get_salary_crew_ledger(
  p_site_id uuid,
  p_subcontract_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  cfg               record;
  v_data_started_at date;
  v_auditing        boolean;
  v_mesthri_name    text;
  v_pool_total      numeric := 0;
  v_comm_cash_total numeric := 0;
  v_pool            numeric;
  v_cash            numeric;
  v_week            record;
  v_alloc           numeric;
  v_weeks_json      jsonb;
  v_mesthri_json    jsonb;
  v_totals_json     jsonb;
  v_pool_json       jsonb;
BEGIN
  SELECT * INTO cfg FROM public.crew_pay_config(p_site_id);
  IF cfg.subcontract_id IS NULL
     OR (p_subcontract_id IS NOT NULL AND p_subcontract_id <> cfg.subcontract_id) THEN
    RETURN jsonb_build_object('enabled', false);
  END IF;

  SELECT s.data_started_at, (s.legacy_status = 'auditing' AND s.data_started_at IS NOT NULL)
    INTO v_data_started_at, v_auditing
    FROM public.sites s WHERE s.id = p_site_id;

  SELECT l.name INTO v_mesthri_name FROM public.laborers l WHERE l.id = cfg.mesthri_id;

  -- ON COMMIT DROP tables outlive a same-transaction second call — drop first.
  DROP TABLE IF EXISTS _cl_days;
  DROP TABLE IF EXISTS _cl_lab_weeks;
  DROP TABLE IF EXISTS _cl_targeted;
  DROP TABLE IF EXISTS _cl_weeks;

  -- ---- day scope (the predicate pin) --------------------------------------
  CREATE TEMP TABLE _cl_days ON COMMIT DROP AS
  SELECT
    (d.date - extract(dow FROM d.date)::int)::date AS w_start,
    d.laborer_id,
    d.daily_earnings::numeric                       AS gross,
    COALESCE(d.work_days, 1)::numeric               AS work_days_eff,
    CASE
      WHEN d.laborer_id = cfg.mesthri_id THEN 0::numeric
      WHEN d.mesthri_commission_collector_id = cfg.mesthri_id
           AND d.mesthri_commission_amount IS NOT NULL
        THEN d.mesthri_commission_amount::numeric   -- locked snapshot (settled day)
      ELSE public.mesthri_commission_of(
             true, d.daily_earnings, l.commission_per_day, COALESCE(d.work_days, 1))
    END                                             AS comm
  FROM public.daily_attendance d
  JOIN public.laborers l ON l.id = d.laborer_id
  JOIN public.v_daily_attendance_commission vc ON vc.attendance_id = d.id
  WHERE d.site_id = p_site_id
    AND d.is_deleted  = false
    AND d.is_archived = false
    AND l.laborer_type = 'contract'
    AND d.task_work_package_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.subcontracts sc
      JOIN public.labor_categories lc ON lc.id = sc.trade_category_id
      WHERE sc.id = d.subcontract_id AND lc.name <> 'Civil')
    AND NOT vc.is_commission_crew_day
    AND NOT vc.is_commission_mesthri_own_day
    -- legacy band sealed while auditing
    AND NOT (v_auditing AND (d.date - extract(dow FROM d.date)::int)::date < v_data_started_at);

  -- ---- per (week, laborer) ------------------------------------------------
  CREATE TEMP TABLE _cl_lab_weeks ON COMMIT DROP AS
  SELECT
    cd.w_start,
    cd.laborer_id,
    (cd.laborer_id = cfg.mesthri_id)          AS is_mesthri,
    SUM(cd.work_days_eff)::numeric            AS days,
    SUM(cd.gross)::numeric                    AS gross,
    SUM(cd.comm)::numeric                     AS comm,
    SUM(cd.gross - cd.comm)::numeric          AS net
  FROM _cl_days cd
  GROUP BY cd.w_start, cd.laborer_id;

  -- ---- targeted (per-laborer) fills per (week, laborer) --------------------
  CREATE TEMP TABLE _cl_targeted ON COMMIT DROP AS
  SELECT
    pwa.week_start AS w_start,
    pwa.laborer_id,
    SUM(pwa.allocated_amount)::numeric AS amt
  FROM public.payment_week_allocations pwa
  JOIN public.labor_payments lp
    ON lp.id = pwa.labor_payment_id AND lp.is_archived = false
  JOIN public.settlement_groups g
    ON g.id = lp.settlement_group_id
   AND g.is_cancelled = false
   AND g.is_archived  = false
   AND g.transferred_out_at IS NULL
  WHERE pwa.site_id = p_site_id
    AND pwa.is_archived = false
    AND (g.payout_batch_id IS NOT NULL OR g.contract_laborer_id IS NOT NULL)
  GROUP BY 1, 2;

  -- ---- weeks with fill accumulators ----------------------------------------
  CREATE TEMP TABLE _cl_weeks ON COMMIT DROP AS
  SELECT
    lw.w_start,
    (lw.w_start + 6)::date                                   AS week_end,
    (lw.w_start >= cfg.effective_from)                       AS is_post,
    COUNT(*) FILTER (WHERE NOT lw.is_mesthri)::int           AS laborer_count,
    SUM(lw.gross)::numeric                                   AS wages_due,
    SUM(lw.comm)::numeric                                    AS comm_due,
    COALESCE(SUM(lw.gross) FILTER (WHERE lw.is_mesthri), 0)::numeric AS own_due,
    COALESCE(t.total, 0)::numeric                            AS targeted_fill,
    COALESCE(t.mesthri, 0)::numeric                          AS own_targeted,
    0::numeric AS pool_fill,        -- pre weeks: pool allocation
    0::numeric AS own_fill,         -- post weeks: pool absorbed into own wages
    0::numeric AS comm_fill_pool,   -- post weeks: pool absorbed into commission
    0::numeric AS comm_fill_cash    -- post weeks: tagged commission payouts
  FROM _cl_lab_weeks lw
  LEFT JOIN (
    SELECT
      t.w_start,
      SUM(t.amt) AS total,
      COALESCE(SUM(t.amt) FILTER (WHERE t.laborer_id = cfg.mesthri_id), 0) AS mesthri
    FROM _cl_targeted t
    GROUP BY t.w_start
  ) t ON t.w_start = lw.w_start
  GROUP BY lw.w_start, t.total, t.mesthri
  ORDER BY lw.w_start
  LIMIT 200;

  -- ---- pool (untargeted lump money) & tagged commission cash ---------------
  SELECT COALESCE(SUM(sg.total_amount), 0)::numeric INTO v_pool_total
  FROM public.settlement_groups sg
  WHERE sg.site_id = p_site_id
    AND sg.transferred_out_at IS NULL
    AND sg.is_cancelled = false
    AND sg.is_archived  = false
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

  SELECT COALESCE(SUM(sg.total_amount), 0)::numeric INTO v_comm_cash_total
  FROM public.settlement_groups sg
  WHERE sg.site_id = p_site_id
    AND sg.transferred_out_at IS NULL
    AND sg.is_cancelled = false
    AND sg.is_archived  = false
    AND sg.payment_type = 'commission'
    AND sg.commission_collector_laborer_id = cfg.mesthri_id
    AND sg.contract_ref_kind = 'subcontract'
    AND sg.contract_ref_id = cfg.subcontract_id
    AND (NOT v_auditing OR sg.settlement_date >= v_data_started_at);

  -- ---- pass 2: pool FIFO --------------------------------------------------
  v_pool := v_pool_total;
  FOR v_week IN SELECT * FROM _cl_weeks ORDER BY w_start LOOP
    EXIT WHEN v_pool <= 0;
    IF NOT v_week.is_post THEN
      -- pre-cutover: pool fills the whole week (net + commission + own = gross)
      v_alloc := LEAST(v_pool, GREATEST(0, v_week.wages_due - v_week.targeted_fill - v_week.pool_fill));
      IF v_alloc > 0 THEN
        UPDATE _cl_weeks SET pool_fill = pool_fill + v_alloc WHERE w_start = v_week.w_start;
        v_pool := v_pool - v_alloc;
      END IF;
    ELSE
      -- post-cutover: pool only absorbs the mesthri's share — own wages first...
      v_alloc := LEAST(v_pool, GREATEST(0, v_week.own_due - v_week.own_targeted - v_week.own_fill));
      IF v_alloc > 0 THEN
        UPDATE _cl_weeks SET own_fill = own_fill + v_alloc WHERE w_start = v_week.w_start;
        v_pool := v_pool - v_alloc;
      END IF;
      -- ...then commission
      v_alloc := LEAST(v_pool, GREATEST(0, v_week.comm_due - v_week.comm_fill_pool));
      IF v_alloc > 0 THEN
        UPDATE _cl_weeks SET comm_fill_pool = comm_fill_pool + v_alloc WHERE w_start = v_week.w_start;
        v_pool := v_pool - v_alloc;
      END IF;
    END IF;
  END LOOP;

  -- ---- pass 3: tagged commission cash over post-week remainders ------------
  v_cash := v_comm_cash_total;
  FOR v_week IN SELECT * FROM _cl_weeks WHERE is_post ORDER BY w_start LOOP
    EXIT WHEN v_cash <= 0;
    v_alloc := LEAST(v_cash, GREATEST(0, v_week.comm_due - v_week.comm_fill_pool - v_week.comm_fill_cash));
    IF v_alloc > 0 THEN
      UPDATE _cl_weeks SET comm_fill_cash = comm_fill_cash + v_alloc WHERE w_start = v_week.w_start;
      v_cash := v_cash - v_alloc;
    END IF;
  END LOOP;

  -- ---- weeks payload (newest first) ----------------------------------------
  SELECT COALESCE(jsonb_agg(week_obj ORDER BY ws DESC), '[]'::jsonb) INTO v_weeks_json
  FROM (
    SELECT
      w.w_start AS ws,
      jsonb_build_object(
        'week_start', w.w_start,
        'week_end', w.week_end,
        'is_post_cutover', w.is_post,
        'laborer_count', w.laborer_count,
        'wages_due', w.wages_due,
        'commission_total', w.comm_due,
        'mesthri_own', w.own_due,
        'week_paid', ROUND(w.targeted_fill + w.pool_fill + w.own_fill + w.comm_fill_pool + w.comm_fill_cash, 2),
        'rows', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'laborer_id', lw.laborer_id,
            'name', l.name,
            'role', lr.name,
            'is_mesthri', lw.is_mesthri,
            'days', lw.days,
            'gross', lw.gross,
            'commission', lw.comm,
            'net', lw.net,
            'earned', CASE WHEN lw.is_mesthri THEN lw.gross + w.comm_due ELSE lw.net END,
            'paid', ROUND(row_paid.amt, 2),
            'unpaid', ROUND(GREATEST(0,
              (CASE WHEN lw.is_mesthri THEN lw.gross + w.comm_due ELSE lw.net END) - row_paid.amt), 2),
            'payment_state',
              CASE
                WHEN row_paid.amt >= (CASE WHEN lw.is_mesthri THEN lw.gross + w.comm_due ELSE lw.net END) - 0.005
                  THEN CASE WHEN w.is_post THEN 'paid_direct' ELSE 'considered_paid_waterfall' END
                WHEN row_paid.amt > 0.005
                  THEN CASE WHEN w.is_post THEN 'partial' ELSE 'partial_waterfall' END
                ELSE 'unpaid'
              END
          ) ORDER BY lw.is_mesthri DESC, l.name), '[]'::jsonb)
          FROM _cl_lab_weeks lw
          JOIN public.laborers l ON l.id = lw.laborer_id
          LEFT JOIN public.labor_roles lr ON lr.id = l.role_id
          CROSS JOIN LATERAL (
            SELECT CASE
              WHEN w.is_post THEN
                -- post: explicit targeted money; mesthri additionally absorbs pool + commission fills
                COALESCE(t.amt, 0)
                + CASE WHEN lw.is_mesthri THEN w.own_fill + w.comm_fill_pool + w.comm_fill_cash ELSE 0 END
              ELSE
                -- pre: proportional "considered paid" share of the week's fill
                COALESCE(t.amt, 0)
                + GREATEST(0,
                    (CASE WHEN lw.is_mesthri THEN lw.gross + w.comm_due ELSE lw.net END) - COALESCE(t.amt, 0))
                  * (CASE WHEN (w.wages_due - w.targeted_fill) > 0
                          THEN LEAST(1, w.pool_fill / (w.wages_due - w.targeted_fill))
                          ELSE 0 END)
            END AS amt
            FROM (SELECT 1) one
            LEFT JOIN _cl_targeted t
              ON t.w_start = lw.w_start AND t.laborer_id = lw.laborer_id
          ) row_paid
          WHERE lw.w_start = w.w_start
        )
      ) AS week_obj
    FROM _cl_weeks w
  ) weeks;

  -- ---- mesthri lifetime block ----------------------------------------------
  SELECT jsonb_build_object(
    'laborer_id', cfg.mesthri_id,
    'name', v_mesthri_name,
    'own_gross', COALESCE(SUM(w.own_due), 0),
    'commission_accrued', COALESCE(SUM(w.comm_due), 0),
    'own_paid', ROUND(COALESCE(SUM(
      CASE WHEN w.is_post
        THEN w.own_targeted + w.own_fill
        ELSE w.own_due * fill_ratio.r END), 0), 2),
    'commission_paid', ROUND(COALESCE(SUM(
      CASE WHEN w.is_post
        THEN w.comm_fill_pool + w.comm_fill_cash
        ELSE w.comm_due * fill_ratio.r END), 0), 2),
    'commission_paid_direct', ROUND(COALESCE(SUM(
      CASE WHEN w.is_post THEN w.comm_fill_cash ELSE 0 END), 0), 2),
    'pool_absorbed', ROUND(COALESCE(SUM(
      CASE WHEN w.is_post THEN w.own_fill + w.comm_fill_pool ELSE 0 END), 0), 2),
    'own_remaining', ROUND(COALESCE(SUM(
      CASE WHEN w.is_post
        THEN GREATEST(0, w.own_due - w.own_targeted - w.own_fill) ELSE 0 END), 0), 2),
    'commission_remaining', ROUND(COALESCE(SUM(
      CASE WHEN w.is_post
        THEN GREATEST(0, w.comm_due - w.comm_fill_pool - w.comm_fill_cash) ELSE 0 END), 0), 2)
  ) INTO v_mesthri_json
  FROM _cl_weeks w
  CROSS JOIN LATERAL (
    SELECT CASE WHEN (w.wages_due - w.targeted_fill) > 0
                THEN LEAST(1, w.pool_fill / (w.wages_due - w.targeted_fill))
                ELSE 0 END AS r
  ) fill_ratio;

  v_mesthri_json := v_mesthri_json || jsonb_build_object(
    'still_to_pay',
    ROUND((v_mesthri_json->>'own_remaining')::numeric
        + (v_mesthri_json->>'commission_remaining')::numeric, 2)
  );

  -- ---- project totals (laborers = non-mesthri) ------------------------------
  SELECT jsonb_build_object(
    'weeks_count', COUNT(DISTINCT w.w_start),
    'gross', COALESCE(SUM(w.wages_due), 0),
    'commission', COALESCE(SUM(w.comm_due), 0),
    'laborers_net', COALESCE(SUM(w.wages_due - w.own_due - w.comm_due), 0),
    'laborers_unpaid', ROUND(COALESCE(SUM(
      CASE WHEN w.is_post
        THEN GREATEST(0, (w.wages_due - w.own_due - w.comm_due)
                         - (w.targeted_fill - w.own_targeted))
        ELSE 0 END), 0), 2)
  ) INTO v_totals_json
  FROM _cl_weeks w;

  -- ---- pool reconciliation ---------------------------------------------------
  SELECT jsonb_build_object(
    'pool_total', v_pool_total,
    'commission_cash_total', v_comm_cash_total,
    'absorbed_pre', ROUND(COALESCE(SUM(w.pool_fill), 0), 2),
    'absorbed_mesthri', ROUND(COALESCE(SUM(
      CASE WHEN w.is_post THEN w.own_fill + w.comm_fill_pool ELSE 0 END), 0), 2),
    'future_credit', ROUND(GREATEST(0, v_pool_total
      - COALESCE(SUM(w.pool_fill), 0)
      - COALESCE(SUM(CASE WHEN w.is_post THEN w.own_fill + w.comm_fill_pool ELSE 0 END), 0)), 2)
  ) INTO v_pool_json
  FROM _cl_weeks w;

  RETURN jsonb_build_object(
    'enabled', true,
    'config', jsonb_build_object(
      'subcontract_id', cfg.subcontract_id,
      'mesthri_id', cfg.mesthri_id,
      'mesthri_name', v_mesthri_name,
      'effective_from', cfg.effective_from
    ),
    'weeks', v_weeks_json,
    'mesthri', v_mesthri_json,
    'totals', v_totals_json,
    'pool', v_pool_json
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_salary_crew_ledger(uuid, uuid)
  TO authenticated, service_role;
