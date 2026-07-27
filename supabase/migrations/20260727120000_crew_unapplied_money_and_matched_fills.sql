-- Crew weekly pay — unapplied money, named and no longer phantom-filling weeks.
--
-- Recreates get_salary_crew_ledger (20260717120100) and get_salary_waterfall
-- (20260717120200) VERBATIM plus two changes. get_salary_slice_summary is NOT
-- redefined: its crew branch already derives paid_to_weeks / future_credit /
-- mestri_owed from get_salary_waterfall, so it inherits the fix.
--
-- 1. MATCHED TARGETED FILLS (the bug). A per-laborer payment allocates to a
--    (week, laborer) pair via payment_week_allocations, but the week-level fill
--    aggregated those allocations by WEEK ALONE. When the laborer has no row in
--    that week's salary roster — they worked the whole week on a task-work
--    package, so `task_work_package_id IS NULL` drops their days — the money
--    still cancelled that week's arrears while appearing in no per-laborer row.
--    Live case: SET-260720-001, ₹2,400 "bulu hand" on 20 Jul 2026 stamped to the
--    19–25 Jul week, where Bulu was 100% on package b87fb494. The week read
--    ₹7,700 of ₹10,825 while the rows under it owed ₹5,375, and the site's
--    laborer arrears were understated by ₹2,250 — money that will likely be paid
--    a SECOND time through the package.
--    Fix: a targeted allocation only fills a week when that laborer actually has
--    eligible days in it. Unmatched money stays unapplied (it is a genuine
--    advance) and surfaces as pool.paid_ahead / paid_ahead_rows so the owner can
--    re-point it. Arrears going UP is the correct direction.
--
-- 2. EXCESS BREAKDOWN (readability). The hero's EXCESS PAID had no explanation,
--    so "paid out − wages due" never matched it. The ledger's pool block now
--    also reports targeted_total / targeted_applied / laborer_credit (per-laborer
--    payments beyond that laborer's net for the week — the "selavuku" hand cash)
--    and paid_ahead, closing the identity:
--        pool.future_credit + pool.laborer_credit + pool.paid_ahead
--          = get_salary_slice_summary.future_credit
--
-- Non-crew sites are untouched: every changed line sits inside a v_crew branch
-- or inside get_salary_crew_ledger, which returns {enabled:false} without a
-- crew_pay_config row.

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
  v_targeted_total  numeric := 0;
  v_targeted_appl   numeric := 0;
  v_paid_ahead      numeric := 0;
  v_paid_ahead_json jsonb   := '[]'::jsonb;
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
  DROP TABLE IF EXISTS _cl_targeted_matched;
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

  -- ---- targeted money that a week can actually absorb ----------------------
  -- A (week, laborer) allocation only covers that week if the laborer HAS days
  -- in it. Money pinned to a week where they have none (they were on a task-work
  -- package all week, so _cl_days dropped their rows) is an advance, not
  -- coverage — it must not cancel the arrears of the laborers who did work.
  CREATE TEMP TABLE _cl_targeted_matched ON COMMIT DROP AS
  SELECT t.*
  FROM _cl_targeted t
  WHERE EXISTS (
    SELECT 1 FROM _cl_lab_weeks lw
     WHERE lw.w_start = t.w_start AND lw.laborer_id = t.laborer_id);

  -- The unmatched remainder, itemised for the "paid ahead" warning.
  SELECT
    COALESCE(SUM(t.amt), 0)::numeric,
    COALESCE(jsonb_agg(jsonb_build_object(
      'laborer_id', t.laborer_id,
      'name',       l.name,
      'week_start', t.w_start,
      'amount',     ROUND(t.amt, 2)
    ) ORDER BY t.w_start DESC, l.name), '[]'::jsonb)
  INTO v_paid_ahead, v_paid_ahead_json
  FROM _cl_targeted t
  JOIN public.laborers l ON l.id = t.laborer_id
  WHERE NOT EXISTS (
    SELECT 1 FROM _cl_lab_weeks lw
     WHERE lw.w_start = t.w_start AND lw.laborer_id = t.laborer_id);

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
    FROM _cl_targeted_matched t
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

  -- ---- targeted money vs what the weeks could take -------------------------
  -- total_amount is the cash that actually left the payer's hand; the pwa rows
  -- hold only the part that fit the laborer's net for that week. The gap is real
  -- money paid ahead of the work (the "selavuku" hand cash), and it is the other
  -- half of the hero's EXCESS PAID.
  SELECT COALESCE(SUM(sg.total_amount), 0)::numeric INTO v_targeted_total
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
    AND (sg.payout_batch_id IS NOT NULL OR sg.contract_laborer_id IS NOT NULL);

  -- Sum the temp table, not _cl_weeks.targeted_fill: the LIMIT 200 week window
  -- would otherwise silently inflate the "credit" for very long-running sites.
  SELECT COALESCE(SUM(t.amt), 0)::numeric INTO v_targeted_appl FROM _cl_targeted t;

  -- ---- pool reconciliation ---------------------------------------------------
  SELECT jsonb_build_object(
    'pool_total', v_pool_total,
    'commission_cash_total', v_comm_cash_total,
    'absorbed_pre', ROUND(COALESCE(SUM(w.pool_fill), 0), 2),
    'absorbed_mesthri', ROUND(COALESCE(SUM(
      CASE WHEN w.is_post THEN w.own_fill + w.comm_fill_pool ELSE 0 END), 0), 2),
    'future_credit', ROUND(GREATEST(0, v_pool_total
      - COALESCE(SUM(w.pool_fill), 0)
      - COALESCE(SUM(CASE WHEN w.is_post THEN w.own_fill + w.comm_fill_pool ELSE 0 END), 0)), 2),
    -- The three named halves of the hero's EXCESS PAID:
    --   future_credit  — lump money the mesthri holds that no week can absorb
    --   laborer_credit — per-laborer payments beyond that laborer's week net
    --   paid_ahead     — targeted money pinned to a week the laborer did not work
    'targeted_total',   ROUND(v_targeted_total, 2),
    'targeted_applied', ROUND(v_targeted_appl, 2),
    'laborer_credit',   ROUND(GREATEST(0, v_targeted_total - v_targeted_appl), 2),
    'paid_ahead',       ROUND(v_paid_ahead, 2),
    'paid_ahead_rows',  v_paid_ahead_json
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

-- ---------------------------------------------------------------------------
-- get_salary_waterfall — targeted fills must match a (week, laborer) with days
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_salary_waterfall(
  p_site_id uuid,
  p_subcontract_id uuid DEFAULT NULL::uuid,
  p_date_from date DEFAULT NULL::date,
  p_date_to date DEFAULT NULL::date,
  p_period text DEFAULT 'all'::text
)
 RETURNS TABLE(week_start date, week_end date, days_worked integer, laborer_count integer, wages_due numeric, paid numeric, status text, filled_by jsonb, period text)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_legacy_status   text;
  v_data_started_at date;
  v_legacy_active   boolean;
  v_period          text;
  v_week            record;
  v_settlement      record;
  v_remaining       numeric;
  v_alloc           numeric;
  v_week_due_left   numeric;
  cfg               record;
  v_crew            boolean := false;
BEGIN
  SELECT s.legacy_status, s.data_started_at
    INTO v_legacy_status, v_data_started_at
    FROM public.sites s
   WHERE s.id = p_site_id;

  v_legacy_active := (v_legacy_status = 'auditing' AND v_data_started_at IS NOT NULL);

  IF NOT v_legacy_active THEN
    v_period := 'all';
  ELSE
    IF p_period NOT IN ('all', 'legacy', 'current') THEN
      RAISE EXCEPTION 'get_salary_waterfall: invalid p_period %', p_period;
    END IF;
    v_period := p_period;
  END IF;

  -- Crew mode: only for the unscoped company view of a crew-enabled site.
  SELECT * INTO cfg FROM public.crew_pay_config(p_site_id);
  v_crew := (cfg.subcontract_id IS NOT NULL AND p_subcontract_id IS NULL);

  -- ON COMMIT DROP tables outlive a same-transaction second call (e.g.
  -- get_salary_slice_summary's crew branch invokes this function) — drop first.
  DROP TABLE IF EXISTS _weeks;
  DROP TABLE IF EXISTS _settlements;
  DROP TABLE IF EXISTS _wf_days;

  -- The day scope, materialised (was an inline CTE). _weeks aggregates exactly
  -- as before; the table exists so crew pass 1 can ask "does this laborer have
  -- days in the week this payment was pinned to?" without re-deriving the scope.
  CREATE TEMP TABLE _wf_days ON COMMIT DROP AS
  WITH attendance_in_scope AS (
    SELECT
      (d.date - extract(dow FROM d.date)::int)::date AS w_start,
      d.laborer_id,
      -- GROSS: direct-pay crew/own days are excluded below, so no commission remains.
      d.daily_earnings AS earn,
      CASE
        WHEN NOT v_crew OR d.laborer_id = cfg.mesthri_id THEN 0::numeric
        WHEN d.mesthri_commission_collector_id = cfg.mesthri_id
             AND d.mesthri_commission_amount IS NOT NULL
          THEN d.mesthri_commission_amount::numeric
        ELSE public.mesthri_commission_of(
               true, d.daily_earnings, l.commission_per_day, COALESCE(d.work_days, 1))
      END AS crew_comm,
      CASE WHEN v_crew AND d.laborer_id = cfg.mesthri_id
           THEN d.daily_earnings ELSE 0::numeric END AS crew_own
    FROM public.daily_attendance d
    JOIN public.laborers l ON l.id = d.laborer_id
    JOIN public.v_daily_attendance_commission vc ON vc.attendance_id = d.id
    WHERE d.site_id = p_site_id
      AND d.is_deleted  = false
      AND d.is_archived = false
      AND l.laborer_type = 'contract'
      AND (p_date_from IS NULL OR d.date >= p_date_from)
      AND (p_date_to   IS NULL OR d.date <= p_date_to)
      AND (
        -- scoped trade view: contract's own days, minus direct-pay crew + own days (paid in pane)
        (p_subcontract_id IS NOT NULL
           AND d.subcontract_id = p_subcontract_id
           AND NOT vc.is_commission_crew_day
           AND NOT vc.is_commission_mesthri_own_day)
        OR
        -- unscoped company view: daily company days, minus task-work, non-Civil trades,
        -- and direct-pay crew/own days (all settled elsewhere).
        (p_subcontract_id IS NULL
           AND d.task_work_package_id IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM public.subcontracts sc
             JOIN public.labor_categories lc ON lc.id = sc.trade_category_id
             WHERE sc.id = d.subcontract_id AND lc.name <> 'Civil')
           AND NOT vc.is_commission_crew_day
           AND NOT vc.is_commission_mesthri_own_day)
      )
  )
  SELECT * FROM attendance_in_scope;

  CREATE TEMP TABLE _weeks ON COMMIT DROP AS
  SELECT
    a.w_start                                   AS week_start,
    (a.w_start + 6)::date                       AS week_end,
    COUNT(*)::int                                AS days_worked,
    COUNT(DISTINCT a.laborer_id)::int            AS laborer_count,
    COALESCE(SUM(a.earn), 0)::numeric            AS wages_due,
    0::numeric                                   AS paid,
    '[]'::jsonb                                  AS filled_by,
    CASE
      WHEN v_legacy_active AND a.w_start < v_data_started_at THEN 'legacy'
      ELSE 'current'
    END                                          AS period,
    (v_crew AND a.w_start >= cfg.effective_from) AS is_post,
    COALESCE(SUM(a.crew_own), 0)::numeric        AS own_due,
    COALESCE(SUM(a.crew_comm), 0)::numeric       AS comm_due,
    0::numeric                                   AS own_filled,
    0::numeric                                   AS comm_filled,
    0::numeric                                   AS own_targeted
  FROM _wf_days a
  GROUP BY a.w_start
  ORDER BY a.w_start
  LIMIT 200;

  CREATE TEMP TABLE _settlements ON COMMIT DROP AS
  SELECT
    sg.id,
    sg.settlement_reference,
    sg.settlement_date,
    sg.total_amount::numeric AS amount,
    CASE
      WHEN v_legacy_active AND sg.settlement_date < v_data_started_at THEN 'legacy'
      ELSE 'current'
    END AS period,
    (v_crew AND (sg.payout_batch_id IS NOT NULL OR sg.contract_laborer_id IS NOT NULL)) AS is_targeted,
    CASE WHEN v_crew THEN sg.contract_laborer_id ELSE NULL END AS target_laborer_id
  FROM public.settlement_groups sg
  WHERE sg.site_id = p_site_id
    AND sg.transferred_out_at IS NULL
    AND sg.is_cancelled = false
    AND sg.is_archived  = false
    AND sg.settlement_date IS NOT NULL
    AND sg.payment_type = 'salary'
    AND (p_date_from IS NULL OR sg.settlement_date >= p_date_from)
    AND (p_date_to   IS NULL OR sg.settlement_date <= p_date_to)
    AND (p_subcontract_id IS NULL OR sg.subcontract_id = p_subcontract_id)
    -- Company-wide view only: drop non-Civil trade settlements (paid in their own workspace).
    AND (
      p_subcontract_id IS NOT NULL
      OR NOT EXISTS (
        SELECT 1
        FROM public.subcontracts sc
        JOIN public.labor_categories lc ON lc.id = sc.trade_category_id
        WHERE sc.id = sg.subcontract_id
          AND lc.name <> 'Civil'
      )
    )
    AND EXISTS (
      SELECT 1 FROM public.labor_payments lp
      WHERE lp.settlement_group_id = sg.id
        AND lp.is_under_contract   = true
        AND lp.is_archived         = false
    )
  ORDER BY sg.settlement_date ASC, sg.id ASC;

  IF NOT v_crew THEN
    -- ------------------------- pre-crew behavior, verbatim -------------------
    FOR v_settlement IN SELECT * FROM _settlements ORDER BY settlement_date ASC, id ASC LOOP
      v_remaining := v_settlement.amount;

      FOR v_week IN
        SELECT *
          FROM _weeks w
         WHERE w.period = v_settlement.period
         ORDER BY w.week_start
      LOOP
        EXIT WHEN v_remaining <= 0;

        v_week_due_left := v_week.wages_due - v_week.paid;
        IF v_week_due_left <= 0 THEN
          CONTINUE;
        END IF;

        v_alloc := LEAST(v_remaining, v_week_due_left);

        UPDATE _weeks w
          SET paid = w.paid + v_alloc,
              filled_by = w.filled_by || jsonb_build_array(jsonb_build_object(
                'ref',          v_settlement.settlement_reference,
                'amount',       v_alloc,
                'gross_amount', v_settlement.amount,
                'settled_at',   v_settlement.settlement_date
              ))
        WHERE w.week_start = v_week.week_start;

        v_remaining := v_remaining - v_alloc;
      END LOOP;
    END LOOP;
  ELSE
    -- ------------------------- crew mode ------------------------------------
    -- pass 1: targeted settlements land on their pwa weeks with the laborer's name
    FOR v_settlement IN
      SELECT s.*, pwa.week_start AS pwa_week, SUM(pwa.allocated_amount)::numeric AS pwa_amount,
             COALESCE(l1.name, l2.name) AS laborer_name,
             COALESCE(l1.id, l2.id)     AS pwa_laborer_id
      FROM _settlements s
      JOIN public.labor_payments lp
        ON lp.settlement_group_id = s.id AND lp.is_archived = false
      JOIN public.payment_week_allocations pwa
        ON pwa.labor_payment_id = lp.id AND pwa.is_archived = false
      LEFT JOIN public.laborers l1 ON l1.id = s.target_laborer_id
      LEFT JOIN public.laborers l2 ON l2.id = pwa.laborer_id
      WHERE s.is_targeted
      GROUP BY s.id, s.settlement_reference, s.settlement_date, s.amount, s.period,
               s.is_targeted, s.target_laborer_id, pwa.week_start, l1.name, l2.name, l1.id, l2.id
      ORDER BY s.settlement_date ASC, s.id ASC
    LOOP
      -- Only money pinned to a week the laborer actually worked can cover that
      -- week. Otherwise it is an advance: skip the fill so it stays unapplied
      -- (→ future_credit) instead of cancelling someone else's arrears. Mirrors
      -- _cl_targeted_matched in get_salary_crew_ledger. A NULL laborer link
      -- keeps the old behaviour — nothing to match it against.
      CONTINUE WHEN v_settlement.pwa_laborer_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM _wf_days d
           WHERE d.w_start = v_settlement.pwa_week
             AND d.laborer_id = v_settlement.pwa_laborer_id);

      UPDATE _weeks w
        SET paid = w.paid + v_settlement.pwa_amount,
            own_targeted = w.own_targeted
              + CASE WHEN v_settlement.pwa_laborer_id = cfg.mesthri_id
                     THEN v_settlement.pwa_amount ELSE 0 END,
            filled_by = w.filled_by || jsonb_build_array(jsonb_build_object(
              'ref',          v_settlement.settlement_reference,
              'amount',       v_settlement.pwa_amount,
              'gross_amount', v_settlement.amount,
              'settled_at',   v_settlement.settlement_date,
              'kind',         'laborer',
              'laborer_name', v_settlement.laborer_name
            ))
      WHERE w.week_start = v_settlement.pwa_week;
    END LOOP;

    -- pass 2: untargeted pool — pre weeks in full, post weeks capped at mesthri share
    FOR v_settlement IN
      SELECT * FROM _settlements WHERE NOT is_targeted
      ORDER BY settlement_date ASC, id ASC
    LOOP
      v_remaining := v_settlement.amount;

      FOR v_week IN
        SELECT * FROM _weeks w
         WHERE w.period = v_settlement.period
         ORDER BY w.week_start
      LOOP
        EXIT WHEN v_remaining <= 0;

        IF NOT v_week.is_post THEN
          v_week_due_left := v_week.wages_due - v_week.paid;
          IF v_week_due_left <= 0 THEN CONTINUE; END IF;
          v_alloc := LEAST(v_remaining, v_week_due_left);
          UPDATE _weeks w
            SET paid = w.paid + v_alloc,
                filled_by = w.filled_by || jsonb_build_array(jsonb_build_object(
                  'ref',          v_settlement.settlement_reference,
                  'amount',       v_alloc,
                  'gross_amount', v_settlement.amount,
                  'settled_at',   v_settlement.settlement_date,
                  'kind',         'pool'
                ))
          WHERE w.week_start = v_week.week_start;
          v_remaining := v_remaining - v_alloc;
        ELSE
          -- own wages first…
          v_alloc := LEAST(v_remaining,
                           GREATEST(0, v_week.own_due - v_week.own_targeted - v_week.own_filled));
          IF v_alloc > 0 THEN
            UPDATE _weeks w
              SET paid = w.paid + v_alloc,
                  own_filled = w.own_filled + v_alloc,
                  filled_by = w.filled_by || jsonb_build_array(jsonb_build_object(
                    'ref',          v_settlement.settlement_reference,
                    'amount',       v_alloc,
                    'gross_amount', v_settlement.amount,
                    'settled_at',   v_settlement.settlement_date,
                    'kind',         'pool'
                  ))
            WHERE w.week_start = v_week.week_start;
            v_remaining := v_remaining - v_alloc;
          END IF;
          -- …then commission
          v_alloc := LEAST(v_remaining,
                           GREATEST(0, v_week.comm_due - v_week.comm_filled));
          IF v_alloc > 0 THEN
            UPDATE _weeks w
              SET paid = w.paid + v_alloc,
                  comm_filled = w.comm_filled + v_alloc,
                  filled_by = w.filled_by || jsonb_build_array(jsonb_build_object(
                    'ref',          v_settlement.settlement_reference,
                    'amount',       v_alloc,
                    'gross_amount', v_settlement.amount,
                    'settled_at',   v_settlement.settlement_date,
                    'kind',         'pool'
                  ))
            WHERE w.week_start = v_week.week_start;
            v_remaining := v_remaining - v_alloc;
          END IF;
        END IF;
      END LOOP;
    END LOOP;

    -- pass 3: tagged commission payouts fill post-week commission remainders
    FOR v_settlement IN
      SELECT sg.id, sg.settlement_reference, sg.settlement_date,
             sg.total_amount::numeric AS amount
      FROM public.settlement_groups sg
      WHERE sg.site_id = p_site_id
        AND sg.transferred_out_at IS NULL
        AND sg.is_cancelled = false
        AND sg.is_archived  = false
        AND sg.payment_type = 'commission'
        AND sg.commission_collector_laborer_id = cfg.mesthri_id
        AND sg.contract_ref_kind = 'subcontract'
        AND sg.contract_ref_id = cfg.subcontract_id
        AND (p_date_from IS NULL OR sg.settlement_date >= p_date_from)
        AND (p_date_to   IS NULL OR sg.settlement_date <= p_date_to)
        AND (NOT v_legacy_active OR sg.settlement_date >= v_data_started_at)
      ORDER BY sg.settlement_date ASC, sg.id ASC
    LOOP
      v_remaining := v_settlement.amount;
      FOR v_week IN
        SELECT * FROM _weeks w WHERE w.is_post ORDER BY w.week_start
      LOOP
        EXIT WHEN v_remaining <= 0;
        v_alloc := LEAST(v_remaining, GREATEST(0, v_week.comm_due - v_week.comm_filled));
        IF v_alloc <= 0 THEN CONTINUE; END IF;
        UPDATE _weeks w
          SET paid = w.paid + v_alloc,
              comm_filled = w.comm_filled + v_alloc,
              filled_by = w.filled_by || jsonb_build_array(jsonb_build_object(
                'ref',          v_settlement.settlement_reference,
                'amount',       v_alloc,
                'gross_amount', v_settlement.amount,
                'settled_at',   v_settlement.settlement_date,
                'kind',         'commission'
              ))
        WHERE w.week_start = v_week.week_start;
        v_remaining := v_remaining - v_alloc;
      END LOOP;
    END LOOP;
  END IF;

  RETURN QUERY
  SELECT
    w.week_start,
    w.week_end,
    w.days_worked,
    w.laborer_count,
    w.wages_due,
    w.paid,
    CASE
      WHEN w.paid = 0            THEN 'pending'
      WHEN w.paid >= w.wages_due THEN 'settled'
      ELSE                            'underpaid'
    END AS status,
    w.filled_by,
    w.period
  FROM _weeks w
  WHERE v_period = 'all'
     OR w.period = v_period
  ORDER BY w.week_start;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_salary_waterfall(uuid, uuid, date, date, text) TO authenticated, service_role;
