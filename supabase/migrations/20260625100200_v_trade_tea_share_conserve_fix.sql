-- Fix v_trade_tea_share to conserve EXACTLY (final-review findings):
--  (1) per-member ROUND() leaked pennies for 2+ member pools -> use cumulative
--      rounding (share_i = round(cum_i) - round(cum_{i-1})) so Σ shares = pool total.
--  (2) no-attendance day of a pool whose host is 'off' dropped the money -> the
--      fallback recipient is now the first member (host-first ordering), which
--      always exists when the pool has any member.
--  (3) COALESCE(total_amount, amount) preferred a 0-defaulting column -> NULLIF.
-- Ordering is host-first then trade id, so the host bears the rounding remainder
-- and the no-attendance fallback; the JS preview util mirrors this exactly.
CREATE OR REPLACE VIEW public.v_trade_tea_share
WITH (security_invoker = true) AS
WITH
tea_at_site AS (
  SELECT te.site_id,
         te.date,
         COALESCE(te.trade_pool_host_category_id,
                  public.default_tea_pool_host(s.company_id)) AS pool_host,
         COALESCE(NULLIF(te.total_amount, 0), te.amount) AS amount
    FROM public.tea_shop_entries te
    JOIN public.sites s ON s.id = te.site_id
   WHERE te.is_group_entry = false
     AND te.site_id IS NOT NULL
  UNION ALL
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
member AS (
  SELECT lc.id AS trade_category_id,
         COALESCE(lc.tea_pool_host_category_id,
                  public.default_tea_pool_host(lc.company_id)) AS pool_host
    FROM public.labor_categories lc
   WHERE lc.tea_mode <> 'off'
),
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
),
ranked AS (
  SELECT mu.site_id, mu.date, mu.pool_host, mu.trade_category_id,
         mu.pool_amount, pt.total_units,
         ROW_NUMBER() OVER w AS rn,
         SUM(mu.units) OVER w AS run_units
    FROM member_units mu
    JOIN pool_totals pt
      ON pt.site_id = mu.site_id AND pt.date = mu.date AND pt.pool_host = mu.pool_host
  WINDOW w AS (
    PARTITION BY mu.site_id, mu.date, mu.pool_host
    ORDER BY (mu.trade_category_id = mu.pool_host) DESC, mu.trade_category_id
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  )
),
shared AS (
  SELECT site_id, date, trade_category_id,
         CASE
           WHEN total_units > 0 THEN
             ROUND(pool_amount * run_units / NULLIF(total_units, 0))
             - COALESCE(LAG(ROUND(pool_amount * run_units / NULLIF(total_units, 0))) OVER w2, 0)
           WHEN rn = 1 THEN ROUND(pool_amount)   -- no attendance: first member (host) bears it
           ELSE 0
         END AS amount
    FROM ranked
  WINDOW w2 AS (
    PARTITION BY site_id, date, pool_host
    ORDER BY (trade_category_id = pool_host) DESC, trade_category_id
  )
)
SELECT site_id, date, trade_category_id, amount
  FROM shared
 WHERE amount <> 0;

GRANT SELECT ON public.v_trade_tea_share TO authenticated;
