-- Per-(site,date,trade) tea share. Sits ON TOP of the existing per-site
-- allocation; the per-site split (tea_shop_entry_allocations / single-site
-- entries) is unchanged. Splits each pool's per-site tea across the pool's
-- member trades by present day_units; off-trades get 0; money is conserved.
CREATE OR REPLACE VIEW public.v_trade_tea_share
WITH (security_invoker = true) AS
WITH
-- a) Tea landed at a (site, date), tagged to a pool host (NULL -> company default).
tea_at_site AS (
  -- single-site entries
  SELECT te.site_id,
         te.date,
         COALESCE(te.trade_pool_host_category_id,
                  public.default_tea_pool_host(s.company_id)) AS pool_host,
         COALESCE(te.total_amount, te.amount) AS amount
    FROM public.tea_shop_entries te
    JOIN public.sites s ON s.id = te.site_id
   WHERE te.is_group_entry = false
     AND te.site_id IS NOT NULL
  UNION ALL
  -- group entries: per-site allocated slice
  SELECT a.site_id,
         te.date,
         COALESCE(te.trade_pool_host_category_id,
                  public.default_tea_pool_host(s.company_id)) AS pool_host,
         a.allocated_amount AS amount
    FROM public.tea_shop_entry_allocations a
    JOIN public.tea_shop_entries te ON te.id = a.entry_id
    JOIN public.sites s ON s.id = a.site_id
   WHERE te.is_group_entry = true
),
pool_tea AS (
  SELECT site_id, date, pool_host, SUM(amount) AS pool_amount
    FROM tea_at_site
   GROUP BY site_id, date, pool_host
),
-- b) Present day_units per (site, date, trade) = named + market.
trade_units AS (
  SELECT da.site_id, da.date, l.category_id AS trade_category_id,
         SUM(COALESCE(da.day_units, 1))::numeric AS units
    FROM public.daily_attendance da
    JOIN public.laborers l ON l.id = da.laborer_id
   WHERE COALESCE(da.is_deleted, false) = false
     AND l.category_id IS NOT NULL
   GROUP BY da.site_id, da.date, l.category_id
  UNION ALL
  SELECT mla.site_id, mla.date, lr.category_id AS trade_category_id,
         SUM(COALESCE(mla.count, 0))::numeric AS units
    FROM public.market_laborer_attendance mla
    JOIN public.labor_roles lr ON lr.id = mla.role_id
   WHERE lr.category_id IS NOT NULL
   GROUP BY mla.site_id, mla.date, lr.category_id
),
trade_units_rolled AS (
  SELECT site_id, date, trade_category_id, SUM(units) AS units
    FROM trade_units
   GROUP BY site_id, date, trade_category_id
),
-- c) Member trades of each pool (non-off; host resolved like the entries').
member AS (
  SELECT lc.id AS trade_category_id,
         COALESCE(lc.tea_pool_host_category_id,
                  public.default_tea_pool_host(lc.company_id)) AS pool_host
    FROM public.labor_categories lc
   WHERE lc.tea_mode <> 'off'
),
-- d) Each member trade's present units within its pool, per (site, date).
member_units AS (
  SELECT pt.site_id, pt.date, pt.pool_host, pt.pool_amount,
         m.trade_category_id,
         COALESCE(tu.units, 0) AS units
    FROM pool_tea pt
    JOIN member m ON m.pool_host = pt.pool_host
    LEFT JOIN trade_units_rolled tu
           ON tu.site_id = pt.site_id AND tu.date = pt.date
          AND tu.trade_category_id = m.trade_category_id
),
pool_totals AS (
  SELECT site_id, date, pool_host, SUM(units) AS total_units
    FROM member_units
   GROUP BY site_id, date, pool_host
)
SELECT mu.site_id,
       mu.date,
       mu.trade_category_id,
       CASE
         WHEN pt.total_units > 0
           THEN ROUND(mu.pool_amount * (mu.units / pt.total_units))
         -- pool tea with no attributable attendance -> host bears it (no money lost)
         WHEN mu.trade_category_id = mu.pool_host THEN ROUND(mu.pool_amount)
         ELSE 0
       END AS amount
  FROM member_units mu
  JOIN pool_totals pt
    ON pt.site_id = mu.site_id AND pt.date = mu.date AND pt.pool_host = mu.pool_host
 WHERE mu.units > 0 OR (pt.total_units = 0 AND mu.trade_category_id = mu.pool_host);

GRANT SELECT ON public.v_trade_tea_share TO authenticated;
