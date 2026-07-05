-- Keep non-Civil trade-contract days out of the company-wide salary settlement.
--
-- Context: a company laborer's day carries daily_attendance.subcontract_id. When
-- that subcontract belongs to a NON-Civil trade (e.g. "Painting — In-house"), the
-- work is settled in that trade's own workspace (TradeSettlementView, scoped by
-- p_subcontract_id). But the default Company Settlement view calls these RPCs with
-- p_subcontract_id = NULL (all contracts), so painting days were counted in the
-- company MESTRI OWED / weekly WAGES-DUE too — a double count against the separate
-- trade settlement, and it blurred painting into the Civil pool.
--
-- Fix: in the company-wide view ONLY (p_subcontract_id IS NULL), exclude days /
-- settlements whose subcontract belongs to an explicitly non-Civil trade. Civil,
-- untagged (subcontract_id NULL), and unclassified-trade rows stay. Applied to BOTH
-- the wages side (daily_attendance) AND the paid side (settlement_groups) so the
-- company paid-vs-due stays self-consistent. When p_subcontract_id is non-NULL the
-- existing `= p_subcontract_id` filter already scopes exactly one contract, so the
-- new guard is a no-op there (gated behind `p_subcontract_id IS NOT NULL OR ...`).
--
-- Read-path only, additive — no data change; MESTRI OWED / WAGES DUE recompute live
-- and drop by exactly the non-Civil trade amount. Function bodies reproduced verbatim
-- from the live prod defs (pg_get_functiondef, == mig 20260705100000) with the guard
-- added. Civil identified by labor_categories.name = 'Civil' (company system seed).

-- ---------------------------------------------------------------------------
-- get_salary_slice_summary — MESTRI OWED hero
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_salary_slice_summary(
  p_site_id uuid,
  p_subcontract_id uuid DEFAULT NULL::uuid,
  p_date_from date DEFAULT NULL::date,
  p_date_to date DEFAULT NULL::date,
  p_period text DEFAULT 'all'::text
)
 RETURNS TABLE(wages_due numeric, settlements_total numeric, advances_total numeric, paid_to_weeks numeric, future_credit numeric, mestri_owed numeric, weeks_count integer, settlement_count integer, advance_count integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
      COALESCE(SUM(d.daily_earnings), 0)::numeric                                  AS amt,
      COUNT(DISTINCT (d.date - extract(dow FROM d.date)::int))::int                AS weeks
    FROM public.daily_attendance d
    JOIN public.laborers l ON l.id = d.laborer_id
    CROSS JOIN effective_period ep
    WHERE d.site_id = p_site_id
      AND d.is_deleted  = false
      AND d.is_archived = false
      AND l.laborer_type = 'contract'
      AND d.task_work_package_id IS NULL
      AND (p_date_from IS NULL OR d.date >= p_date_from)
      AND (p_date_to   IS NULL OR d.date <= p_date_to)
      AND (p_subcontract_id IS NULL OR d.subcontract_id = p_subcontract_id)
      -- Company-wide view only: drop non-Civil trade days (settled in their own workspace).
      AND (
        p_subcontract_id IS NOT NULL
        OR NOT EXISTS (
          SELECT 1
          FROM public.subcontracts sc
          JOIN public.labor_categories lc ON lc.id = sc.trade_category_id
          WHERE sc.id = d.subcontract_id
            AND lc.name <> 'Civil'
        )
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
      AND sg.is_cancelled = false
      AND sg.is_archived  = false
      AND sg.settlement_date IS NOT NULL
      AND sg.payment_type = 'advance'
      AND (p_date_from IS NULL OR sg.settlement_date >= p_date_from)
      AND (p_date_to   IS NULL OR sg.settlement_date <= p_date_to)
      AND (p_subcontract_id IS NULL OR sg.subcontract_id = p_subcontract_id)
      -- Company-wide view only: drop non-Civil trade advances (belong to that workspace).
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
    LEAST(wages.amt, setts.amt)                          AS paid_to_weeks,
    GREATEST(0, setts.amt - wages.amt)                   AS future_credit,
    GREATEST(0, wages.amt - setts.amt)                   AS mestri_owed,
    wages.weeks                                          AS weeks_count,
    setts.cnt                                            AS settlement_count,
    advs.cnt                                             AS advance_count
  FROM wages, setts, advs;
$function$;

-- ---------------------------------------------------------------------------
-- get_salary_waterfall — weekly WAGES DUE vs PAID
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

  CREATE TEMP TABLE _weeks ON COMMIT DROP AS
  WITH attendance_in_scope AS (
    SELECT
      (d.date - extract(dow FROM d.date)::int)::date AS w_start,
      d.laborer_id,
      d.daily_earnings
    FROM public.daily_attendance d
    JOIN public.laborers l ON l.id = d.laborer_id
    WHERE d.site_id = p_site_id
      AND d.is_deleted  = false
      AND d.is_archived = false
      AND l.laborer_type = 'contract'
      AND d.task_work_package_id IS NULL
      AND (p_date_from IS NULL OR d.date >= p_date_from)
      AND (p_date_to   IS NULL OR d.date <= p_date_to)
      AND (p_subcontract_id IS NULL OR d.subcontract_id = p_subcontract_id)
      -- Company-wide view only: drop non-Civil trade days (settled in their own workspace).
      AND (
        p_subcontract_id IS NOT NULL
        OR NOT EXISTS (
          SELECT 1
          FROM public.subcontracts sc
          JOIN public.labor_categories lc ON lc.id = sc.trade_category_id
          WHERE sc.id = d.subcontract_id
            AND lc.name <> 'Civil'
        )
      )
  )
  SELECT
    a.w_start                                   AS week_start,
    (a.w_start + 6)::date                       AS week_end,
    COUNT(*)::int                                AS days_worked,
    COUNT(DISTINCT a.laborer_id)::int            AS laborer_count,
    COALESCE(SUM(a.daily_earnings), 0)::numeric  AS wages_due,
    0::numeric                                   AS paid,
    '[]'::jsonb                                  AS filled_by,
    CASE
      WHEN v_legacy_active AND a.w_start < v_data_started_at THEN 'legacy'
      ELSE 'current'
    END                                          AS period
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
    END AS period
  FROM public.settlement_groups sg
  WHERE sg.site_id = p_site_id
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

  FOR v_settlement IN SELECT * FROM _settlements LOOP
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

GRANT EXECUTE ON FUNCTION public.get_salary_slice_summary(uuid, uuid, date, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_salary_waterfall(uuid, uuid, date, date, text) TO authenticated, service_role;
