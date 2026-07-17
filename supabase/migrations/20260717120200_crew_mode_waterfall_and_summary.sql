-- Crew weekly pay — Part 3: crew-aware get_salary_waterfall + get_salary_slice_summary.
--
-- NON-CREW SITES ARE BYTE-FOR-BYTE UNCHANGED: every crew branch is keyed on
-- crew_pay_config(p_site_id) returning a row AND the call being the unscoped
-- company view (p_subcontract_id IS NULL). Scoped trade calls and sites without
-- a crew contract run the exact pre-crew logic.
--
-- Both bodies reproduce 20260707130000 (the current definitions) plus the
-- transferred_out_at IS NULL filter that 20260708100200 injected dynamically
-- into the deployed versions (a wholesale rewrite must carry it explicitly).
--
-- CREW MODE FILL (matches get_salary_crew_ledger — 20260717120100):
--   1. TARGETED settlements (payout_batch_id or contract_laborer_id markers)
--      allocate to their payment_week_allocations week(s) directly, with the
--      laborer's name on the filled_by chip.
--   2. UNTARGETED pool money FIFO: pre-cutover weeks at full gross; post-cutover
--      weeks capped at the mesthri's share (own wages first, then commission).
--   3. Tagged COMMISSION payouts fill post-cutover commission remainders.
-- filled_by entries gain 'kind' ('laborer'|'pool'|'commission') and, for
-- targeted fills, 'laborer_name'. Existing keys are unchanged.

-- ---------------------------------------------------------------------------
-- get_salary_waterfall
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

  CREATE TEMP TABLE _weeks ON COMMIT DROP AS
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
  FROM attendance_in_scope a
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

-- ---------------------------------------------------------------------------
-- get_salary_slice_summary — crew mode derives paid_to_weeks from the waterfall
-- so the hero and the week list can never disagree; non-crew keeps the closed
-- form verbatim (plus the transferred_out_at filter the deployed version has).
--
-- Declared VOLATILE (was STABLE): the crew branch calls get_salary_waterfall,
-- which creates temp tables — a write that read-only (STABLE) SPI would reject.
-- Signature is unchanged; volatility change requires DROP + CREATE.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_salary_slice_summary(uuid, uuid, date, date, text);
CREATE FUNCTION public.get_salary_slice_summary(
  p_site_id uuid,
  p_subcontract_id uuid DEFAULT NULL::uuid,
  p_date_from date DEFAULT NULL::date,
  p_date_to date DEFAULT NULL::date,
  p_period text DEFAULT 'all'::text
)
 RETURNS TABLE(wages_due numeric, settlements_total numeric, advances_total numeric, paid_to_weeks numeric, future_credit numeric, mestri_owed numeric, weeks_count integer, settlement_count integer, advance_count integer)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  cfg          record;
  v_crew       boolean := false;
  v_wf_paid    numeric := 0;
  v_comm_total numeric := 0;
BEGIN
  SELECT * INTO cfg FROM public.crew_pay_config(p_site_id);
  v_crew := (cfg.subcontract_id IS NOT NULL AND p_subcontract_id IS NULL);

  IF v_crew THEN
    -- The waterfall applies the mesthri-first rule; the LEAST/GREATEST closed
    -- forms below no longer hold once post-cutover pool money stops filling
    -- laborers, so paid/credit/owed come from the actual fill.
    SELECT COALESCE(SUM(wf.paid), 0)::numeric INTO v_wf_paid
    FROM public.get_salary_waterfall(p_site_id, p_subcontract_id, p_date_from, p_date_to, p_period) wf;

    SELECT COALESCE(SUM(sg.total_amount), 0)::numeric INTO v_comm_total
    FROM public.settlement_groups sg
    JOIN public.sites s ON s.id = sg.site_id
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
      AND (NOT (s.legacy_status = 'auditing' AND s.data_started_at IS NOT NULL)
           OR sg.settlement_date >= s.data_started_at);
  END IF;

  RETURN QUERY
  WITH
  audit_state AS (
    SELECT
      s.data_started_at,
      (s.legacy_status = 'auditing' AND s.data_started_at IS NOT NULL) AS legacy_active
    FROM public.sites s
    WHERE s.id = p_site_id
  ),
  effective_period AS (
    SELECT
      CASE
        WHEN ast.legacy_active AND p_period IN ('all','legacy','current') THEN p_period
        ELSE 'all'
      END AS period,
      ast.data_started_at,
      ast.legacy_active
    FROM audit_state ast
  ),
  wages AS (
    SELECT
      -- GROSS: direct-pay crew/own days are excluded below, so no commission remains.
      COALESCE(SUM(d.daily_earnings), 0)::numeric AS amt,
      COUNT(DISTINCT (d.date - extract(dow FROM d.date)::int))::int                AS weeks
    FROM public.daily_attendance d
    JOIN public.laborers l ON l.id = d.laborer_id
    JOIN public.v_daily_attendance_commission vc ON vc.attendance_id = d.id
    CROSS JOIN effective_period ep
    WHERE d.site_id = p_site_id
      AND d.is_deleted  = false
      AND d.is_archived = false
      AND l.laborer_type = 'contract'
      AND (p_date_from IS NULL OR d.date >= p_date_from)
      AND (p_date_to   IS NULL OR d.date <= p_date_to)
      AND (
        (p_subcontract_id IS NOT NULL
           AND d.subcontract_id = p_subcontract_id
           AND NOT vc.is_commission_crew_day
           AND NOT vc.is_commission_mesthri_own_day)
        OR
        (p_subcontract_id IS NULL
           AND d.task_work_package_id IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM public.subcontracts sc
             JOIN public.labor_categories lc ON lc.id = sc.trade_category_id
             WHERE sc.id = d.subcontract_id AND lc.name <> 'Civil')
           AND NOT vc.is_commission_crew_day
           AND NOT vc.is_commission_mesthri_own_day)
      )
      AND (
        ep.period = 'all'
        OR (ep.period = 'legacy'  AND (d.date - extract(dow FROM d.date)::int)::date <  ep.data_started_at)
        OR (ep.period = 'current' AND (d.date - extract(dow FROM d.date)::int)::date >= ep.data_started_at)
      )
  ),
  setts AS (
    SELECT
      COALESCE(SUM(sg.total_amount), 0)::numeric AS amt,
      COUNT(*)::int                              AS cnt
    FROM public.settlement_groups sg
    CROSS JOIN effective_period ep
    WHERE sg.site_id = p_site_id
      AND sg.transferred_out_at IS NULL
      AND sg.is_cancelled = false
      AND sg.is_archived  = false
      AND sg.settlement_date IS NOT NULL
      AND sg.payment_type = 'salary'
      AND (p_date_from IS NULL OR sg.settlement_date >= p_date_from)
      AND (p_date_to   IS NULL OR sg.settlement_date <= p_date_to)
      AND (p_subcontract_id IS NULL OR sg.subcontract_id = p_subcontract_id)
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
      AND (
        ep.period = 'all'
        OR (ep.period = 'legacy'  AND sg.settlement_date <  ep.data_started_at)
        OR (ep.period = 'current' AND sg.settlement_date >= ep.data_started_at)
      )
  ),
  advs AS (
    SELECT
      COALESCE(SUM(sg.total_amount), 0)::numeric AS amt,
      COUNT(*)::int                              AS cnt
    FROM public.settlement_groups sg
    CROSS JOIN effective_period ep
    WHERE sg.site_id = p_site_id
      AND sg.transferred_out_at IS NULL
      AND sg.is_cancelled = false
      AND sg.is_archived  = false
      AND sg.settlement_date IS NOT NULL
      AND sg.payment_type = 'advance'
      AND (p_date_from IS NULL OR sg.settlement_date >= p_date_from)
      AND (p_date_to   IS NULL OR sg.settlement_date <= p_date_to)
      AND (p_subcontract_id IS NULL OR sg.subcontract_id = p_subcontract_id)
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
      AND (
        ep.period = 'all'
        OR (ep.period = 'legacy'  AND sg.settlement_date <  ep.data_started_at)
        OR (ep.period = 'current' AND sg.settlement_date >= ep.data_started_at)
      )
  )
  SELECT
    wages.amt                                            AS wages_due,
    setts.amt                                            AS settlements_total,
    advs.amt                                             AS advances_total,
    CASE WHEN v_crew THEN v_wf_paid
         ELSE LEAST(wages.amt, setts.amt) END            AS paid_to_weeks,
    CASE WHEN v_crew THEN GREATEST(0, setts.amt + v_comm_total - v_wf_paid)
         ELSE GREATEST(0, setts.amt - wages.amt) END     AS future_credit,
    CASE WHEN v_crew THEN GREATEST(0, wages.amt - v_wf_paid)
         ELSE GREATEST(0, wages.amt - setts.amt) END     AS mestri_owed,
    wages.weeks                                          AS weeks_count,
    setts.cnt                                            AS settlement_count,
    advs.cnt                                             AS advance_count
  FROM wages, setts, advs;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_salary_slice_summary(uuid, uuid, date, date, text) TO authenticated, service_role;
