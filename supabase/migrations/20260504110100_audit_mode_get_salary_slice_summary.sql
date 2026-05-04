-- Audit-mode update: get_salary_slice_summary — period-aware aggregates.
--
-- Companion to 20260504100000_add_site_audit_lifecycle.sql.
--
-- Adds p_period parameter (default 'all'). For sites with legacy_status =
-- 'auditing', callers can request totals for one band ('legacy' or 'current')
-- to drive split KPI rendering on /site/payments. Non-auditing sites ignore
-- p_period (treated as 'all').
--
-- Adds is_archived = false filters everywhere is_deleted = false / is_cancelled
-- = false appear, to honor a Mode B roll-up reconcile.

DROP FUNCTION IF EXISTS public.get_salary_slice_summary(uuid, uuid, date, date);
DROP FUNCTION IF EXISTS public.get_salary_slice_summary(uuid, uuid, date, date, text);

CREATE OR REPLACE FUNCTION public.get_salary_slice_summary(
  p_site_id          uuid,
  p_subcontract_id   uuid    DEFAULT NULL,
  p_date_from        date    DEFAULT NULL,
  p_date_to          date    DEFAULT NULL,
  p_period           text    DEFAULT 'all'
) RETURNS TABLE (
  wages_due          numeric,
  settlements_total  numeric,
  advances_total     numeric,
  paid_to_weeks      numeric,
  future_credit      numeric,
  mestri_owed        numeric,
  weeks_count        int,
  settlement_count   int,
  advance_count      int
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
  wages AS (
    -- Period filter is on week_start (matches get_salary_waterfall's bucketing).
    -- A day in a straddling week (e.g. Nov 15 in the Nov 9-15 week when cutoff=Nov 15)
    -- belongs to whichever period the WEEK belongs to, not the day. This keeps
    -- KPI hero totals consistent with the per-week list.
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
      AND (p_date_from IS NULL OR d.date >= p_date_from)
      AND (p_date_to   IS NULL OR d.date <= p_date_to)
      AND (p_subcontract_id IS NULL OR d.subcontract_id = p_subcontract_id)
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
$$;

COMMENT ON FUNCTION public.get_salary_slice_summary(uuid, uuid, date, date, text) IS
'Salary slice 5-KPI hero aggregates. p_period (all/legacy/current) lets callers split totals when site is in auditing state. is_archived=false on attendance/settlements honors Mode B reconcile.';

GRANT EXECUTE ON FUNCTION public.get_salary_slice_summary(uuid, uuid, date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_salary_slice_summary(uuid, uuid, date, date, text) TO service_role;
