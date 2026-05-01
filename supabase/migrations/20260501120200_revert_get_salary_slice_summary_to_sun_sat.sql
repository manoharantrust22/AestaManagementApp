-- Migration: Revert get_salary_slice_summary weeks_count grouping to Sun-Sat
-- Date: 2026-05-01
-- Purpose: Companion to 20260501110000 / 20260501110100. weeks_count is the
--          headline "weeks" tile on the /site/payments salary slice hero —
--          it must align with the same Sun-Sat bucket boundary as
--          get_salary_waterfall so the two RPCs return matching weekly counts.
--          Only the date_trunc('week', d.date) expression changes; signature,
--          discriminator, and aggregate logic are unchanged from
--          20260426150000_add_get_salary_slice_summary_rpc.

CREATE OR REPLACE FUNCTION public.get_salary_slice_summary(
  p_site_id          uuid,
  p_subcontract_id   uuid    DEFAULT NULL,
  p_date_from        date    DEFAULT NULL,
  p_date_to          date    DEFAULT NULL
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
  wages AS (
    SELECT
      COALESCE(SUM(d.daily_earnings), 0)::numeric                                     AS amt,
      COUNT(DISTINCT (d.date - extract(dow FROM d.date)::int))::int                   AS weeks
    FROM public.daily_attendance d
    JOIN public.laborers l ON l.id = d.laborer_id
    WHERE d.site_id = p_site_id
      AND d.is_deleted = false
      AND l.laborer_type = 'contract'
      AND (p_date_from IS NULL OR d.date >= p_date_from)
      AND (p_date_to   IS NULL OR d.date <= p_date_to)
      AND (p_subcontract_id IS NULL OR d.subcontract_id = p_subcontract_id)
  ),
  setts AS (
    SELECT
      COALESCE(SUM(sg.total_amount), 0)::numeric AS amt,
      COUNT(*)::int                              AS cnt
    FROM public.settlement_groups sg
    WHERE sg.site_id = p_site_id
      AND sg.is_cancelled = false
      AND sg.settlement_date IS NOT NULL
      AND sg.payment_type = 'salary'
      AND (p_date_from IS NULL OR sg.settlement_date >= p_date_from)
      AND (p_date_to   IS NULL OR sg.settlement_date <= p_date_to)
      AND (p_subcontract_id IS NULL OR sg.subcontract_id = p_subcontract_id)
      AND EXISTS (
        SELECT 1 FROM public.labor_payments lp
        WHERE lp.settlement_group_id = sg.id
          AND lp.is_under_contract = true
      )
  ),
  advs AS (
    SELECT
      COALESCE(SUM(sg.total_amount), 0)::numeric AS amt,
      COUNT(*)::int                              AS cnt
    FROM public.settlement_groups sg
    WHERE sg.site_id = p_site_id
      AND sg.is_cancelled = false
      AND sg.settlement_date IS NOT NULL
      AND sg.payment_type = 'advance'
      AND (p_date_from IS NULL OR sg.settlement_date >= p_date_from)
      AND (p_date_to   IS NULL OR sg.settlement_date <= p_date_to)
      AND (p_subcontract_id IS NULL OR sg.subcontract_id = p_subcontract_id)
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

COMMENT ON FUNCTION public.get_salary_slice_summary(uuid, uuid, date, date) IS
'Single-row aggregate totals for the 5-KPI salary slice hero on /site/payments. weeks_count groups by Sunday-anchored buckets (reverted from ISO Mon-Sun on 2026-05-01) to match get_salary_waterfall.';

GRANT EXECUTE ON FUNCTION public.get_salary_slice_summary(uuid, uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_salary_slice_summary(uuid, uuid, date, date) TO service_role;
