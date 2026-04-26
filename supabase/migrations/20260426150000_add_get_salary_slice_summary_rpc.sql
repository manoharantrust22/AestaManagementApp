-- Migration: Add get_salary_slice_summary RPC
-- Purpose: Single-row aggregate totals powering the 5-KPI salary slice hero
--          on /site/payments. Computed independently of the per-week waterfall
--          so the hero loads quickly even before the waterfall list is fetched.
--
-- Discriminator: settlement_groups.payment_type values:
--                  'salary'  -> contract-linked salary settlements (waterfall stream)
--                  'advance' -> outside-waterfall advances (separate bucket)
--                  'excess'  -> adjustment / excess returns (NOT counted in this RPC;
--                               surface only in get_payments_ledger as 'adjustment')
--
-- Output:
--   wages_due          - sum of daily_earnings for contract laborers in scope
--   settlements_total  - sum of payment_type='salary' settlement_group amounts
--                        with at least one is_under_contract=true labor_payment
--   advances_total     - sum of payment_type='advance' settlement_group amounts
--   paid_to_weeks      - LEAST(wages_due, settlements_total) — what the waterfall
--                        actually allocates to recorded weeks
--   future_credit      - GREATEST(0, settlements_total - wages_due) — excess paid
--   mestri_owed        - GREATEST(0, wages_due - settlements_total) — underpaid
--   weeks_count        - distinct ISO weeks with contract attendance in scope
--   settlement_count   - count of contract-linked salary settlement_groups
--   advance_count      - count of advance settlement_groups
--
-- Validated against production for site Srinivasan House & Shop (no scope
-- filters): wages_due aggregates align with the 3-week waterfall validation;
-- advances are correctly counted only from payment_type='advance'.

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
      COALESCE(SUM(d.daily_earnings), 0)::numeric                     AS amt,
      COUNT(DISTINCT date_trunc('week', d.date))::int                  AS weeks
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
'Single-row aggregate totals for the 5-KPI salary slice hero on /site/payments. Wages due (attendance), settlements total (settlement_groups.payment_type=''salary'' with contract-linked labor_payment), advances total (settlement_groups.payment_type=''advance''), and derived paid_to_weeks / future_credit / mestri_owed.';

GRANT EXECUTE ON FUNCTION public.get_salary_slice_summary(uuid, uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_salary_slice_summary(uuid, uuid, date, date) TO service_role;
