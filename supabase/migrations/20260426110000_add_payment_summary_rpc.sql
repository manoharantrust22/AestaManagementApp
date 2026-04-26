-- Migration: Add get_payment_summary RPC
-- Purpose: Provide server-side aggregates for the new Salary Settlement ledger
--          KPI strip (pending vs paid, with paid split by daily+market vs weekly
--          contract). Mirrors the get_expense_summary / get_attendance_summary
--          pattern so the cards stay accurate at any scope (including All Time)
--          without streaming every row to the client.
--
-- Bucketing rules (verified against production schema):
--   - Pending = distinct attendance dates within scope that still have unpaid
--     money (daily_attendance.is_paid=false excluding contract laborers, or
--     market_laborer_attendance.is_paid=false). Contract laborers settle via
--     labor_payments, not attendance.is_paid, so they are excluded here just
--     like they are in get_attendance_summary's pending columns.
--   - Paid daily+market = non-cancelled settlement_groups linked to at least
--     one daily_attendance or market_laborer_attendance row (i.e. created via
--     the date-wise daily settlement dialog).
--   - Paid weekly = non-cancelled settlement_groups with NO attendance link
--     (i.e. weekly contract settlements via labor_payments, plus advance /
--     excess settlements which the UX groups under the contract bucket).
--   This partition is mutually exclusive and exhaustive over non-cancelled
--   settlement_groups, so daily_market + weekly = total paid.
--   - Tea-shop unpaid is intentionally excluded here. Tea-shop expenses live in
--     tea_shop_entries / tea_shop_settlements, not on attendance.is_paid, so
--     they don't fit the per-date attendance pending pattern. The Pending
--     banner on /site/payments shows attendance pending only; tea-shop pending
--     is surfaced separately on /site/tea-shop.

CREATE OR REPLACE FUNCTION public.get_payment_summary(
  p_site_id uuid,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
) RETURNS TABLE (
  pending_amount numeric,
  pending_dates_count integer,
  paid_amount numeric,
  paid_count integer,
  daily_market_amount numeric,
  daily_market_count integer,
  weekly_amount numeric,
  weekly_count integer
)
  LANGUAGE sql STABLE
  SECURITY INVOKER
  SET search_path = public
AS $$
  WITH
  -- Per-date pending money on daily_attendance, excluding contract laborers
  -- (those are tracked through labor_payments, not is_paid on attendance).
  pending_da AS (
    SELECT
      d.date AS d,
      SUM(d.daily_earnings)::numeric AS amt
    FROM public.daily_attendance d
    JOIN public.laborers l ON l.id = d.laborer_id
    WHERE d.site_id = p_site_id
      AND d.is_deleted = false
      AND d.is_paid = false
      AND l.laborer_type <> 'contract'
      AND (p_date_from IS NULL OR d.date >= p_date_from)
      AND (p_date_to   IS NULL OR d.date <= p_date_to)
    GROUP BY d.date
  ),
  -- Per-date pending money on market_laborer_attendance.
  pending_ma AS (
    SELECT
      m.date AS d,
      SUM(m.total_cost)::numeric AS amt
    FROM public.market_laborer_attendance m
    WHERE m.site_id = p_site_id
      AND m.is_paid = false
      AND (p_date_from IS NULL OR m.date >= p_date_from)
      AND (p_date_to   IS NULL OR m.date <= p_date_to)
    GROUP BY m.date
  ),
  -- Distinct dates with any pending money, with the date-level total summed
  -- across daily + market. Counted once per date for pending_dates_count.
  pending_by_date AS (
    SELECT
      COALESCE(d_da.d, d_ma.d) AS d,
      COALESCE(d_da.amt, 0) + COALESCE(d_ma.amt, 0) AS amt
    FROM pending_da d_da
    FULL OUTER JOIN pending_ma d_ma ON d_ma.d = d_da.d
  ),
  -- Non-cancelled settlement_groups in scope, partitioned by linkage.
  -- A group counts as "daily_market" iff it has at least one linked attendance
  -- row (daily or market). Otherwise it counts as "weekly" (this captures
  -- contract weekly settlements via labor_payments plus advance/excess
  -- settlements that the UX groups under the contract bucket).
  paid_groups AS (
    SELECT
      sg.id,
      sg.total_amount,
      EXISTS (
        SELECT 1 FROM public.daily_attendance da WHERE da.settlement_group_id = sg.id
      )
      OR EXISTS (
        SELECT 1 FROM public.market_laborer_attendance ma WHERE ma.settlement_group_id = sg.id
      ) AS is_daily_market
    FROM public.settlement_groups sg
    WHERE sg.site_id = p_site_id
      AND sg.is_cancelled = false
      AND (p_date_from IS NULL OR sg.settlement_date >= p_date_from)
      AND (p_date_to   IS NULL OR sg.settlement_date <= p_date_to)
  ),
  paid_totals AS (
    SELECT
      COALESCE(SUM(total_amount) FILTER (WHERE is_daily_market), 0)::numeric    AS dm_amt,
      COUNT(*) FILTER (WHERE is_daily_market)::integer                          AS dm_cnt,
      COALESCE(SUM(total_amount) FILTER (WHERE NOT is_daily_market), 0)::numeric AS wk_amt,
      COUNT(*) FILTER (WHERE NOT is_daily_market)::integer                       AS wk_cnt
    FROM paid_groups
  ),
  pending_totals AS (
    SELECT
      COALESCE(SUM(amt), 0)::numeric  AS pend_amt,
      COUNT(*)::integer               AS pend_dates
    FROM pending_by_date
  )
  SELECT
    p.pend_amt                                    AS pending_amount,
    p.pend_dates                                  AS pending_dates_count,
    (t.dm_amt + t.wk_amt)::numeric                AS paid_amount,
    (t.dm_cnt + t.wk_cnt)::integer                AS paid_count,
    t.dm_amt                                      AS daily_market_amount,
    t.dm_cnt                                      AS daily_market_count,
    t.wk_amt                                      AS weekly_amount,
    t.wk_cnt                                      AS weekly_count
  FROM pending_totals p CROSS JOIN paid_totals t;
$$;

COMMENT ON FUNCTION public.get_payment_summary(uuid, date, date) IS
'Server-side aggregation for the Salary Settlement ledger KPI strip. Returns pending money (distinct attendance dates with unpaid daily/market work) plus paid money (non-cancelled settlement_groups, split by daily+market vs weekly contract) for a site within an optional date range. Daily-market vs weekly partition is based on whether the settlement_group has linked attendance rows.';

GRANT EXECUTE ON FUNCTION public.get_payment_summary(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_payment_summary(uuid, date, date) TO service_role;
