-- Slice 6 — scope the Daily+Market / weekly payments ledger to one in-house
-- trade contract (a subcontract_id) for the trade-workspace settlement screen.
--
-- Adds an optional p_subcontract_id (DEFAULT NULL) and filters the four source
-- CTEs by it: paid_dm / paid_wk on settlement_groups.subcontract_id, and
-- pending_da / pending_ma on the attendance rows' subcontract_id. When
-- p_subcontract_id IS NULL (Civil / unscoped) the `IS NULL OR …` predicate is a
-- no-op, so every existing caller gets byte-for-byte identical results and the
-- pending rows are NOT split (row counts unchanged). Mirrors the
-- p_subcontract_id pattern in get_salary_waterfall / get_payment_summary.
--
-- The body is reproduced verbatim from the live definition
-- (20260530231200_payments_ledger_pending_exclude_linked.sql); only the four
-- WHERE predicates and the new parameter are added. The RETURNS TABLE shape is
-- unchanged. The parameter list changes, so the old 6-arg signature is DROPped
-- first and EXECUTE re-granted.

DROP FUNCTION IF EXISTS public.get_payments_ledger(uuid, date, date, text, text, text);

CREATE OR REPLACE FUNCTION public.get_payments_ledger(p_site_id uuid, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_status text DEFAULT 'all'::text, p_type text DEFAULT 'all'::text, p_period text DEFAULT 'all'::text, p_subcontract_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id text, settlement_ref text, row_type text, subtype text, date_or_week_start date, week_end date, for_label text, amount numeric, is_paid boolean, is_pending boolean, laborer_id uuid, period text, payment_channel text, daily_cnt integer, contract_cnt integer, mkt_cnt integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH
  audit_state AS (
    SELECT s.data_started_at,
           (s.legacy_status = 'auditing' AND s.data_started_at IS NOT NULL) AS legacy_active
    FROM public.sites s WHERE s.id = p_site_id
  ),
  effective_period AS (
    SELECT
      CASE WHEN ast.legacy_active AND p_period IN ('all','legacy','current') THEN p_period ELSE 'all' END AS period,
      ast.data_started_at, ast.legacy_active
    FROM audit_state ast
  ),
  paid_dm AS (
    SELECT sg.id, sg.settlement_reference, sg.settlement_date, sg.total_amount, sg.payment_channel,
      (SELECT COUNT(DISTINCT da.laborer_id)
         FROM public.daily_attendance da
         JOIN public.laborers l ON l.id = da.laborer_id
         WHERE da.settlement_group_id = sg.id
           AND da.is_archived = false
           AND COALESCE(l.laborer_type, 'daily') <> 'contract') AS daily_cnt,
      (SELECT COUNT(DISTINCT da.laborer_id)
         FROM public.daily_attendance da
         JOIN public.laborers l ON l.id = da.laborer_id
         WHERE da.settlement_group_id = sg.id
           AND da.is_archived = false
           AND l.laborer_type = 'contract') AS contract_cnt,
      (SELECT COUNT(*) FROM public.market_laborer_attendance ma WHERE ma.settlement_group_id = sg.id) AS mkt_cnt
    FROM public.settlement_groups sg
    WHERE sg.site_id = p_site_id AND sg.is_cancelled = false AND sg.is_archived = false
      AND sg.settlement_date IS NOT NULL
      AND (p_subcontract_id IS NULL OR sg.subcontract_id = p_subcontract_id)
      AND (p_date_from IS NULL OR sg.settlement_date >= p_date_from)
      AND (p_date_to   IS NULL OR sg.settlement_date <= p_date_to)
      AND NOT EXISTS (SELECT 1 FROM public.labor_payments lp
                      WHERE lp.settlement_group_id = sg.id AND lp.is_under_contract = true)
      AND (EXISTS (SELECT 1 FROM public.daily_attendance da
                     WHERE da.settlement_group_id = sg.id AND da.is_archived = false)
           OR EXISTS (SELECT 1 FROM public.market_laborer_attendance ma WHERE ma.settlement_group_id = sg.id))
  ),
  paid_dm_rows AS (
    SELECT 'p:'||p.id::text AS id, p.settlement_reference AS settlement_ref,
      'daily-market'::text AS row_type, 'daily-market'::text AS subtype,
      p.settlement_date AS date_or_week_start, NULL::date AS week_end,
      (CASE WHEN p.daily_cnt > 0 THEN p.daily_cnt::text || ' daily' ELSE '' END
       || CASE WHEN p.daily_cnt > 0 AND (p.contract_cnt > 0 OR p.mkt_cnt > 0) THEN ' + ' ELSE '' END
       || CASE WHEN p.contract_cnt > 0 THEN p.contract_cnt::text || ' contract' ELSE '' END
       || CASE WHEN p.contract_cnt > 0 AND p.mkt_cnt > 0 THEN ' + ' ELSE '' END
       || CASE WHEN p.mkt_cnt > 0 THEN p.mkt_cnt::text || ' market' ELSE '' END) AS for_label,
      p.total_amount AS amount, TRUE AS is_paid, FALSE AS is_pending, NULL::uuid AS laborer_id,
      CASE WHEN ep.legacy_active AND p.settlement_date < ep.data_started_at THEN 'legacy' ELSE 'current' END AS period,
      p.payment_channel AS payment_channel,
      p.daily_cnt AS daily_cnt,
      p.contract_cnt AS contract_cnt,
      p.mkt_cnt AS mkt_cnt
    FROM paid_dm p CROSS JOIN effective_period ep
  ),
  paid_wk AS (
    SELECT sg.id, sg.settlement_reference, sg.settlement_date, sg.total_amount,
      sg.payment_type, sg.payment_channel,
      EXISTS (SELECT 1 FROM public.labor_payments lp
              WHERE lp.settlement_group_id = sg.id AND lp.is_under_contract = true
                AND lp.is_archived = false) AS has_contract
    FROM public.settlement_groups sg
    WHERE sg.site_id = p_site_id AND sg.is_cancelled = false AND sg.is_archived = false
      AND sg.settlement_date IS NOT NULL
      AND (p_subcontract_id IS NULL OR sg.subcontract_id = p_subcontract_id)
      AND (p_date_from IS NULL OR sg.settlement_date >= p_date_from)
      AND (p_date_to   IS NULL OR sg.settlement_date <= p_date_to)
      AND (EXISTS (SELECT 1 FROM public.labor_payments lp
                   WHERE lp.settlement_group_id = sg.id AND lp.is_under_contract = true)
           OR (NOT EXISTS (SELECT 1 FROM public.daily_attendance da
                          WHERE da.settlement_group_id = sg.id AND da.is_archived = false)
               AND NOT EXISTS (SELECT 1 FROM public.market_laborer_attendance ma
                              WHERE ma.settlement_group_id = sg.id)))
  ),
  paid_wk_with_lab AS (
    SELECT p.*,
      (SELECT lp.laborer_id FROM public.labor_payments lp
         WHERE lp.settlement_group_id = p.id AND lp.is_archived = false LIMIT 1) AS one_laborer_id,
      (SELECT COUNT(DISTINCT lp.laborer_id) FROM public.labor_payments lp
         WHERE lp.settlement_group_id = p.id AND lp.is_archived = false) AS distinct_lab_cnt,
      (SELECT l.name FROM public.laborers l
         JOIN public.labor_payments lp ON lp.laborer_id = l.id
         WHERE lp.settlement_group_id = p.id AND lp.is_archived = false LIMIT 1) AS one_laborer_name
    FROM paid_wk p
  ),
  paid_wk_rows AS (
    SELECT 'p:'||p.id::text AS id, p.settlement_reference AS settlement_ref,
      'weekly'::text AS row_type,
      CASE WHEN p.payment_type = 'salary' AND p.has_contract THEN 'salary-waterfall'
           WHEN p.payment_type = 'advance' THEN 'advance'
           WHEN p.payment_type = 'excess' THEN 'adjustment'
           ELSE 'unclassified' END AS subtype,
      (p.settlement_date - extract(dow FROM p.settlement_date)::int)::date AS date_or_week_start,
      ((p.settlement_date - extract(dow FROM p.settlement_date)::int)::date + 6) AS week_end,
      CASE WHEN p.payment_type = 'excess' THEN COALESCE(p.one_laborer_name || ' · excess return', 'Excess return')
           WHEN p.payment_type = 'advance' THEN COALESCE(p.one_laborer_name || ' · advance', 'Mestri · advance')
           WHEN p.payment_type = 'salary' AND p.has_contract AND p.distinct_lab_cnt = 1 THEN p.one_laborer_name
           WHEN p.payment_type = 'salary' AND p.has_contract AND p.distinct_lab_cnt > 1 THEN 'Group settlement (' || p.distinct_lab_cnt::text || ' laborers)'
           ELSE 'Unclassified settlement' END AS for_label,
      p.total_amount AS amount, TRUE AS is_paid, FALSE AS is_pending,
      CASE WHEN p.distinct_lab_cnt = 1 THEN p.one_laborer_id ELSE NULL END AS laborer_id,
      CASE WHEN ep.legacy_active AND p.settlement_date < ep.data_started_at THEN 'legacy' ELSE 'current' END AS period,
      p.payment_channel AS payment_channel,
      0::integer AS daily_cnt,
      0::integer AS contract_cnt,
      0::integer AS mkt_cnt
    FROM paid_wk_with_lab p CROSS JOIN effective_period ep
  ),
  pending_da AS (
    SELECT d.date AS d, SUM(d.daily_earnings)::numeric AS amt, COUNT(DISTINCT d.laborer_id) AS lab_cnt
    FROM public.daily_attendance d
    JOIN public.laborers l ON l.id = d.laborer_id
    WHERE d.site_id = p_site_id AND d.is_deleted = false AND d.is_archived = false
      AND d.is_paid = false AND d.settlement_group_id IS NULL AND l.laborer_type <> 'contract'
      AND (p_subcontract_id IS NULL OR d.subcontract_id = p_subcontract_id)
      AND d.date < CURRENT_DATE
      AND (p_date_from IS NULL OR d.date >= p_date_from)
      AND (p_date_to   IS NULL OR d.date <= p_date_to)
    GROUP BY d.date
  ),
  pending_ma AS (
    SELECT m.date AS d, SUM(m.total_cost)::numeric AS amt, COUNT(*) AS mkt_cnt
    FROM public.market_laborer_attendance m
    WHERE m.site_id = p_site_id AND m.is_paid = false AND m.settlement_group_id IS NULL
      AND (p_subcontract_id IS NULL OR m.subcontract_id = p_subcontract_id)
      AND m.date < CURRENT_DATE
      AND (p_date_from IS NULL OR m.date >= p_date_from)
      AND (p_date_to   IS NULL OR m.date <= p_date_to)
    GROUP BY m.date
  ),
  pending_dm_rows AS (
    SELECT 'pd:' || COALESCE(da.d, ma.d)::text AS id, NULL::text AS settlement_ref,
      'daily-market'::text AS row_type, 'daily-market'::text AS subtype,
      COALESCE(da.d, ma.d) AS date_or_week_start, NULL::date AS week_end,
      (CASE WHEN COALESCE(da.lab_cnt, 0) > 0 THEN da.lab_cnt::text || ' daily' ELSE '' END
       || CASE WHEN COALESCE(da.lab_cnt, 0) > 0 AND COALESCE(ma.mkt_cnt, 0) > 0 THEN ' + ' ELSE '' END
       || CASE WHEN COALESCE(ma.mkt_cnt, 0) > 0 THEN ma.mkt_cnt::text || ' market' ELSE '' END) AS for_label,
      (COALESCE(da.amt, 0) + COALESCE(ma.amt, 0))::numeric AS amount,
      FALSE AS is_paid, TRUE AS is_pending, NULL::uuid AS laborer_id,
      CASE WHEN ep.legacy_active AND COALESCE(da.d, ma.d) < ep.data_started_at THEN 'legacy' ELSE 'current' END AS period,
      NULL::text AS payment_channel,
      COALESCE(da.lab_cnt, 0)::integer AS daily_cnt,
      0::integer AS contract_cnt,
      COALESCE(ma.mkt_cnt, 0)::integer AS mkt_cnt
    FROM pending_da da FULL OUTER JOIN pending_ma ma ON ma.d = da.d
    CROSS JOIN effective_period ep
  ),
  all_rows AS (
    SELECT * FROM paid_dm_rows
    UNION ALL SELECT * FROM paid_wk_rows
    UNION ALL SELECT * FROM pending_dm_rows
  )
  SELECT r.id, r.settlement_ref, r.row_type, r.subtype, r.date_or_week_start, r.week_end,
    r.for_label, r.amount, r.is_paid, r.is_pending, r.laborer_id, r.period, r.payment_channel,
    r.daily_cnt, r.contract_cnt, r.mkt_cnt
  FROM all_rows r CROSS JOIN effective_period ep
  WHERE (p_status = 'all'
         OR (p_status = 'pending' AND r.is_pending)
         OR (p_status = 'completed' AND r.is_paid))
    AND (p_type = 'all'
         OR (p_type = 'daily-market' AND r.row_type = 'daily-market')
         OR (p_type = 'weekly' AND r.row_type = 'weekly'))
    AND (ep.period = 'all' OR r.period = ep.period)
  ORDER BY r.is_pending DESC, r.date_or_week_start DESC
  LIMIT 2000;
$function$;

GRANT EXECUTE ON FUNCTION public.get_payments_ledger(uuid, date, date, text, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_payments_ledger(uuid, date, date, text, text, text, uuid) TO service_role;
