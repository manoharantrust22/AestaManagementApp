-- Slice 6 HOTFIX — restore the 2026-05-08 is_daily_market classification in
-- get_payment_summary.
--
-- 20260627120100 (the subcontract-scope migration) was authored from the
-- 20260504110200 body, which PRE-DATES 20260508131315_align_daily_market_
-- classification.sql — the true latest definition. That tightening excluded
-- pure-contract settlements (those with a contract labor_payments row) from the
-- is_daily_market bucket. 20260627120100 silently reverted it, so the Civil
-- (unscoped) KPI strip mis-split paid settlements (e.g. Srinivasan: 17 groups /
-- ₹49,700 wrongly counted as Daily+Market instead of Contract; the paid TOTAL
-- is unchanged, which is why count-only checks missed it).
--
-- This migration redefines get_payment_summary with the tightened
-- is_daily_market block from 20260508131315 RESTORED, while keeping the
-- p_subcontract_id scope parameter + the three CTE filters from 20260627120100.
-- Result: Civil (p_subcontract_id NULL) matches the pre-slice-6 classification
-- byte-for-byte; a trade scope filters to its in-house contract.
--
-- Signature is already the 5-arg form (from 20260627120100), so this is a plain
-- CREATE OR REPLACE — no DROP / re-GRANT needed (grants persist on replace).

CREATE OR REPLACE FUNCTION public.get_payment_summary(
  p_site_id        uuid,
  p_date_from      date    DEFAULT NULL,
  p_date_to        date    DEFAULT NULL,
  p_period         text    DEFAULT 'all',
  p_subcontract_id uuid    DEFAULT NULL
) RETURNS TABLE (
  pending_amount      numeric,
  pending_dates_count integer,
  paid_amount         numeric,
  paid_count          integer,
  daily_market_amount numeric,
  daily_market_count  integer,
  weekly_amount       numeric,
  weekly_count        integer
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
      ast.data_started_at
    FROM audit_state ast
  ),
  pending_da AS (
    SELECT
      d.date AS d,
      SUM(d.daily_earnings)::numeric AS amt
    FROM public.daily_attendance d
    JOIN public.laborers l ON l.id = d.laborer_id
    CROSS JOIN effective_period ep
    WHERE d.site_id = p_site_id
      AND d.is_deleted  = false
      AND d.is_archived = false
      AND d.is_paid     = false
      AND l.laborer_type <> 'contract'
      AND (p_subcontract_id IS NULL OR d.subcontract_id = p_subcontract_id)
      AND (p_date_from IS NULL OR d.date >= p_date_from)
      AND (p_date_to   IS NULL OR d.date <= p_date_to)
      AND (
        ep.period = 'all'
        OR (ep.period = 'legacy'  AND d.date <  ep.data_started_at)
        OR (ep.period = 'current' AND d.date >= ep.data_started_at)
      )
    GROUP BY d.date
  ),
  pending_ma AS (
    SELECT
      m.date AS d,
      SUM(m.total_cost)::numeric AS amt
    FROM public.market_laborer_attendance m
    CROSS JOIN effective_period ep
    WHERE m.site_id = p_site_id
      AND m.is_paid = false
      AND (p_subcontract_id IS NULL OR m.subcontract_id = p_subcontract_id)
      AND (p_date_from IS NULL OR m.date >= p_date_from)
      AND (p_date_to   IS NULL OR m.date <= p_date_to)
      AND (
        ep.period = 'all'
        OR (ep.period = 'legacy'  AND m.date <  ep.data_started_at)
        OR (ep.period = 'current' AND m.date >= ep.data_started_at)
      )
    GROUP BY m.date
  ),
  pending_by_date AS (
    SELECT
      COALESCE(d_da.d, d_ma.d) AS d,
      COALESCE(d_da.amt, 0) + COALESCE(d_ma.amt, 0) AS amt
    FROM pending_da d_da
    FULL OUTER JOIN pending_ma d_ma ON d_ma.d = d_da.d
  ),
  paid_groups AS (
    SELECT
      sg.id,
      sg.total_amount,
      -- TIGHTENED 2026-05-08 (restored here): pure contract settlements (with a
      -- contract labor_payments row) are excluded from is_daily_market even when
      -- they have linked daily_attendance for contract laborers. Matches
      -- v_all_expenses + useSettlementsList classification.
      (
        NOT EXISTS (
          SELECT 1 FROM public.labor_payments lp
          WHERE lp.settlement_group_id = sg.id
            AND lp.is_under_contract = true
        )
        AND (
          EXISTS (
            SELECT 1 FROM public.daily_attendance da
            WHERE da.settlement_group_id = sg.id
              AND da.is_archived = false
          )
          OR EXISTS (
            SELECT 1 FROM public.market_laborer_attendance ma
            WHERE ma.settlement_group_id = sg.id
          )
        )
      ) AS is_daily_market
    FROM public.settlement_groups sg
    CROSS JOIN effective_period ep
    WHERE sg.site_id = p_site_id
      AND sg.is_cancelled = false
      AND sg.is_archived  = false
      AND sg.settlement_date IS NOT NULL
      AND (p_subcontract_id IS NULL OR sg.subcontract_id = p_subcontract_id)
      AND (p_date_from IS NULL OR sg.settlement_date >= p_date_from)
      AND (p_date_to   IS NULL OR sg.settlement_date <= p_date_to)
      AND (
        ep.period = 'all'
        OR (ep.period = 'legacy'  AND sg.settlement_date <  ep.data_started_at)
        OR (ep.period = 'current' AND sg.settlement_date >= ep.data_started_at)
      )
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

COMMENT ON FUNCTION public.get_payment_summary(uuid, date, date, text, uuid) IS
'Salary Settlement KPI strip aggregates. is_daily_market requires NOT EXISTS contract labor_payments AND (EXISTS daily_attendance OR market_attendance) so pure contract settlements stay in the Contract bucket (aligned with v_all_expenses + useSettlementsList). p_period (all/legacy/current) splits Legacy + Current cards in audit mode. p_subcontract_id (NULL = whole site) scopes the strip to one in-house trade contract.';

GRANT EXECUTE ON FUNCTION public.get_payment_summary(uuid, date, date, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_payment_summary(uuid, date, date, text, uuid) TO service_role;
