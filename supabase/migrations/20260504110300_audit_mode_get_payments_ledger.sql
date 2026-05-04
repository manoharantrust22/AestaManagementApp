-- Audit-mode update: get_payments_ledger — adds period column + p_period filter.
--
-- Companion to 20260504100000_add_site_audit_lifecycle.sql.
--
-- The ledger feed is what /site/payments tabs render. In auditing mode the UI
-- needs to bucket each row into Legacy or Current bands. This migration:
--   1. Adds p_period parameter (default 'all').
--   2. Adds period column to every row in the response.
--   3. Adds is_archived = false on daily_attendance / settlement_groups /
--      labor_payments to honor Mode B roll-up reconcile.
--
-- Period rule:
--   - For paid_dm and paid_wk rows: period derived from settlement_date.
--   - For pending_dm rows: period derived from the attendance date.
--   - Non-auditing sites: period column always = 'current' (informational
--     consistency; no filter applied since p_period is treated as 'all').

DROP FUNCTION IF EXISTS public.get_payments_ledger(uuid, date, date, text, text);
DROP FUNCTION IF EXISTS public.get_payments_ledger(uuid, date, date, text, text, text);

CREATE OR REPLACE FUNCTION public.get_payments_ledger(
  p_site_id   uuid,
  p_date_from date    DEFAULT NULL,
  p_date_to   date    DEFAULT NULL,
  p_status    text    DEFAULT 'all',
  p_type      text    DEFAULT 'all',
  p_period    text    DEFAULT 'all'
) RETURNS TABLE (
  id                  text,
  settlement_ref      text,
  row_type            text,
  subtype             text,
  date_or_week_start  date,
  week_end            date,
  for_label           text,
  amount              numeric,
  is_paid             boolean,
  is_pending          boolean,
  laborer_id          uuid,
  period              text
)
  LANGUAGE sql STABLE
  SECURITY INVOKER
  SET search_path = public
AS $$
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
  paid_dm AS (
    SELECT
      sg.id,
      sg.settlement_reference,
      sg.settlement_date,
      sg.total_amount,
      (SELECT COUNT(DISTINCT da.laborer_id)
         FROM public.daily_attendance da
         WHERE da.settlement_group_id = sg.id
           AND da.is_archived = false) AS daily_lab,
      (SELECT COUNT(*)
         FROM public.market_laborer_attendance ma
         WHERE ma.settlement_group_id = sg.id) AS mkt_cnt
    FROM public.settlement_groups sg
    WHERE sg.site_id = p_site_id
      AND sg.is_cancelled = false
      AND sg.is_archived  = false
      AND sg.settlement_date IS NOT NULL
      AND (p_date_from IS NULL OR sg.settlement_date >= p_date_from)
      AND (p_date_to   IS NULL OR sg.settlement_date <= p_date_to)
      AND (
        EXISTS (SELECT 1 FROM public.daily_attendance da
                  WHERE da.settlement_group_id = sg.id AND da.is_archived = false)
        OR EXISTS (SELECT 1 FROM public.market_laborer_attendance ma
                  WHERE ma.settlement_group_id = sg.id)
      )
  ),
  paid_dm_rows AS (
    SELECT
      'p:'||p.id::text                                    AS id,
      p.settlement_reference                              AS settlement_ref,
      'daily-market'::text                                AS row_type,
      'daily-market'::text                                AS subtype,
      p.settlement_date                                   AS date_or_week_start,
      NULL::date                                          AS week_end,
      (
        CASE WHEN p.daily_lab > 0 THEN p.daily_lab::text || ' lab' ELSE '' END
        || CASE WHEN p.daily_lab > 0 AND p.mkt_cnt > 0 THEN ' + ' ELSE '' END
        || CASE WHEN p.mkt_cnt   > 0 THEN p.mkt_cnt::text || ' mkt' ELSE '' END
      )                                                    AS for_label,
      p.total_amount                                       AS amount,
      TRUE                                                 AS is_paid,
      FALSE                                                AS is_pending,
      NULL::uuid                                           AS laborer_id,
      CASE
        WHEN ep.legacy_active AND p.settlement_date < ep.data_started_at THEN 'legacy'
        ELSE 'current'
      END                                                  AS period
    FROM paid_dm p CROSS JOIN effective_period ep
  ),
  paid_wk AS (
    SELECT
      sg.id,
      sg.settlement_reference,
      sg.settlement_date,
      sg.total_amount,
      sg.payment_type,
      EXISTS (SELECT 1 FROM public.labor_payments lp
              WHERE lp.settlement_group_id = sg.id
                AND lp.is_under_contract   = true
                AND lp.is_archived         = false) AS has_contract
    FROM public.settlement_groups sg
    WHERE sg.site_id = p_site_id
      AND sg.is_cancelled = false
      AND sg.is_archived  = false
      AND sg.settlement_date IS NOT NULL
      AND (p_date_from IS NULL OR sg.settlement_date >= p_date_from)
      AND (p_date_to   IS NULL OR sg.settlement_date <= p_date_to)
      AND NOT EXISTS (SELECT 1 FROM public.daily_attendance da
                        WHERE da.settlement_group_id = sg.id AND da.is_archived = false)
      AND NOT EXISTS (SELECT 1 FROM public.market_laborer_attendance ma
                        WHERE ma.settlement_group_id = sg.id)
  ),
  paid_wk_with_lab AS (
    SELECT
      p.*,
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
    SELECT
      'p:'||p.id::text                                                  AS id,
      p.settlement_reference                                            AS settlement_ref,
      'weekly'::text                                                    AS row_type,
      CASE
        WHEN p.payment_type = 'salary'  AND p.has_contract THEN 'salary-waterfall'
        WHEN p.payment_type = 'advance'                    THEN 'advance'
        WHEN p.payment_type = 'excess'                     THEN 'adjustment'
        ELSE                                                    'unclassified'
      END                                                               AS subtype,
      (p.settlement_date - extract(dow FROM p.settlement_date)::int)::date AS date_or_week_start,
      ((p.settlement_date - extract(dow FROM p.settlement_date)::int)::date + 6) AS week_end,
      CASE
        WHEN p.payment_type = 'excess' THEN
          COALESCE(p.one_laborer_name || ' · excess return', 'Excess return')
        WHEN p.payment_type = 'advance' THEN
          COALESCE(p.one_laborer_name || ' · advance', 'Mestri · advance')
        WHEN p.payment_type = 'salary' AND p.has_contract AND p.distinct_lab_cnt = 1 THEN
          p.one_laborer_name
        WHEN p.payment_type = 'salary' AND p.has_contract AND p.distinct_lab_cnt > 1 THEN
          'Group settlement (' || p.distinct_lab_cnt::text || ' laborers)'
        ELSE
          'Unclassified settlement'
      END                                                               AS for_label,
      p.total_amount                                                    AS amount,
      TRUE                                                              AS is_paid,
      FALSE                                                             AS is_pending,
      CASE WHEN p.distinct_lab_cnt = 1 THEN p.one_laborer_id ELSE NULL END AS laborer_id,
      CASE
        WHEN ep.legacy_active AND p.settlement_date < ep.data_started_at THEN 'legacy'
        ELSE 'current'
      END                                                               AS period
    FROM paid_wk_with_lab p CROSS JOIN effective_period ep
  ),
  pending_da AS (
    SELECT
      d.date AS d,
      SUM(d.daily_earnings)::numeric AS amt,
      COUNT(DISTINCT d.laborer_id) AS lab_cnt
    FROM public.daily_attendance d
    JOIN public.laborers l ON l.id = d.laborer_id
    WHERE d.site_id = p_site_id
      AND d.is_deleted  = false
      AND d.is_archived = false
      AND d.is_paid     = false
      AND l.laborer_type <> 'contract'
      AND (p_date_from IS NULL OR d.date >= p_date_from)
      AND (p_date_to   IS NULL OR d.date <= p_date_to)
    GROUP BY d.date
  ),
  pending_ma AS (
    SELECT
      m.date AS d,
      SUM(m.total_cost)::numeric AS amt,
      COUNT(*) AS mkt_cnt
    FROM public.market_laborer_attendance m
    WHERE m.site_id = p_site_id
      AND m.is_paid = false
      AND (p_date_from IS NULL OR m.date >= p_date_from)
      AND (p_date_to   IS NULL OR m.date <= p_date_to)
    GROUP BY m.date
  ),
  pending_dm_rows AS (
    SELECT
      'pd:' || COALESCE(da.d, ma.d)::text                               AS id,
      NULL::text                                                        AS settlement_ref,
      'daily-market'::text                                              AS row_type,
      'daily-market'::text                                              AS subtype,
      COALESCE(da.d, ma.d)                                              AS date_or_week_start,
      NULL::date                                                        AS week_end,
      (
        CASE WHEN COALESCE(da.lab_cnt, 0) > 0
          THEN da.lab_cnt::text || ' daily lab' ELSE '' END
        || CASE WHEN COALESCE(da.lab_cnt, 0) > 0 AND COALESCE(ma.mkt_cnt, 0) > 0
          THEN ' + ' ELSE '' END
        || CASE WHEN COALESCE(ma.mkt_cnt, 0) > 0
          THEN ma.mkt_cnt::text || ' mkt' ELSE '' END
      )                                                                  AS for_label,
      (COALESCE(da.amt, 0) + COALESCE(ma.amt, 0))::numeric              AS amount,
      FALSE                                                              AS is_paid,
      TRUE                                                               AS is_pending,
      NULL::uuid                                                         AS laborer_id,
      CASE
        WHEN ep.legacy_active AND COALESCE(da.d, ma.d) < ep.data_started_at THEN 'legacy'
        ELSE 'current'
      END                                                                AS period
    FROM pending_da da
    FULL OUTER JOIN pending_ma ma ON ma.d = da.d
    CROSS JOIN effective_period ep
  ),
  all_rows AS (
    SELECT * FROM paid_dm_rows
    UNION ALL
    SELECT * FROM paid_wk_rows
    UNION ALL
    SELECT * FROM pending_dm_rows
  )
  SELECT
    r.id, r.settlement_ref, r.row_type, r.subtype,
    r.date_or_week_start, r.week_end, r.for_label, r.amount,
    r.is_paid, r.is_pending, r.laborer_id, r.period
  FROM all_rows r CROSS JOIN effective_period ep
  WHERE
    (p_status = 'all'
      OR (p_status = 'pending'   AND r.is_pending)
      OR (p_status = 'completed' AND r.is_paid))
    AND (p_type = 'all'
      OR (p_type = 'daily-market' AND r.row_type = 'daily-market')
      OR (p_type = 'weekly'        AND r.row_type = 'weekly'))
    AND (ep.period = 'all' OR r.period = ep.period)
  ORDER BY r.is_pending DESC, r.date_or_week_start DESC
  LIMIT 2000;
$$;

COMMENT ON FUNCTION public.get_payments_ledger(uuid, date, date, text, text, text) IS
'Unified ledger feed for /site/payments tabs. Each row tagged with period (legacy/current). p_period filters output for sites in auditing state. is_archived=false honors Mode B reconcile.';

GRANT EXECUTE ON FUNCTION public.get_payments_ledger(uuid, date, date, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_payments_ledger(uuid, date, date, text, text, text) TO service_role;
