-- Migration: Add get_attendance_summary RPC
-- Purpose: Provide server-side aggregates for the Attendance page summary cards
--          (Period Total / Salary / Tea Shop / Daily / Contract / Market /
--          Paid / Pending / Avg-per-day) so the cards stay accurate at any
--          scope (including All Time) without having to stream every row to
--          the client. The table itself loads one week at a time via
--          infinite scroll; this RPC is what keeps the top cards correct.
--
--          Mirrors the client-side periodTotals reducer in
--          src/app/(main)/site/attendance/attendance-content.tsx so swapping
--          to the RPC produces the same numbers users already see.

CREATE OR REPLACE FUNCTION public.get_attendance_summary(
  p_site_id uuid,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
) RETURNS jsonb
  LANGUAGE sql STABLE
  SECURITY INVOKER
  SET search_path = public
  AS $$
  WITH
  -- Daily attendance rows in scope, joined to laborers for laborer_type filter
  da AS (
    SELECT
      d.date,
      d.daily_earnings,
      d.is_paid,
      l.laborer_type
    FROM public.daily_attendance d
    JOIN public.laborers l ON l.id = d.laborer_id
    WHERE d.site_id = p_site_id
      AND (p_date_from IS NULL OR d.date >= p_date_from)
      AND (p_date_to   IS NULL OR d.date <= p_date_to)
  ),
  -- Market laborer attendance rows in scope
  ma AS (
    SELECT
      m.date,
      m.count,
      m.total_cost,
      m.is_paid
    FROM public.market_laborer_attendance m
    WHERE m.site_id = p_site_id
      AND (p_date_from IS NULL OR m.date >= p_date_from)
      AND (p_date_to   IS NULL OR m.date <= p_date_to)
  ),
  -- Tea shop entries directly attributed to this site, EXCLUDING group entries
  -- that have an allocation row for this site (those are counted via the
  -- allocations CTE so the share is right even if total_amount changes).
  own_tea AS (
    SELECT COALESCE(SUM(t.total_amount), 0)::numeric AS amount
    FROM public.tea_shop_entries t
    WHERE t.site_id = p_site_id
      AND (p_date_from IS NULL OR t.date >= p_date_from)
      AND (p_date_to   IS NULL OR t.date <= p_date_to)
      AND NOT (
        t.is_group_entry = true
        AND EXISTS (
          SELECT 1 FROM public.tea_shop_entry_allocations a
          WHERE a.entry_id = t.id
            AND a.site_id = p_site_id
        )
      )
  ),
  -- This site's share of group tea-shop entries (any site can host the entry).
  -- Recalculate from percentage when available so it matches the client's
  -- recalculation in attendance-content.tsx (line ~1355).
  alloc_tea AS (
    SELECT COALESCE(SUM(
      CASE
        WHEN a.allocation_percentage IS NOT NULL AND e.total_amount IS NOT NULL
          THEN ROUND((a.allocation_percentage / 100.0) * e.total_amount)
        ELSE COALESCE(a.allocated_amount, 0)
      END
    ), 0)::numeric AS amount
    FROM public.tea_shop_entry_allocations a
    JOIN public.tea_shop_entries e ON e.id = a.entry_id
    WHERE a.site_id = p_site_id
      AND (p_date_from IS NULL OR e.date >= p_date_from)
      AND (p_date_to   IS NULL OR e.date <= p_date_to)
  ),
  -- Distinct day count (for Avg/Day). Mirrors dateSummaries.length on the
  -- client: a date counts when it has either daily_attendance or market data.
  active_days AS (
    SELECT COUNT(DISTINCT d) AS n
    FROM (
      SELECT date AS d FROM da
      UNION
      SELECT date AS d FROM ma
    ) u
  ),
  -- Per-bucket sums from daily_attendance
  da_totals AS (
    SELECT
      COALESCE(SUM(daily_earnings), 0)::numeric                                          AS salary_all,
      COALESCE(SUM(daily_earnings) FILTER (WHERE laborer_type <> 'contract'), 0)::numeric AS daily_amount,
      COALESCE(SUM(daily_earnings) FILTER (WHERE laborer_type  = 'contract'), 0)::numeric AS contract_amount,
      -- Paid / pending mirror the client: contract laborers are excluded.
      COALESCE(SUM(daily_earnings) FILTER (WHERE is_paid AND laborer_type <> 'contract'), 0)::numeric     AS paid_amount_da,
      COUNT(*) FILTER (WHERE is_paid AND laborer_type <> 'contract')::bigint                              AS paid_count_da,
      COALESCE(SUM(daily_earnings) FILTER (WHERE NOT is_paid AND laborer_type <> 'contract'), 0)::numeric AS pending_amount_da,
      COUNT(*) FILTER (WHERE NOT is_paid AND laborer_type <> 'contract')::bigint                          AS pending_count_da,
      COUNT(*)::bigint AS total_laborer_rows
    FROM da
  ),
  -- Per-bucket sums from market_laborer_attendance.
  -- Paid / pending here mirror the client behaviour where market rows only
  -- contribute on dates with NO daily_attendance (lines ~1483-1496 of
  -- attendance-content.tsx). Preserved here so card numbers don't shift.
  ma_totals AS (
    SELECT
      COALESCE(SUM(total_cost), 0)::numeric      AS market_amount,
      COALESCE(SUM(count), 0)::bigint            AS market_count,
      COALESCE(SUM(total_cost) FILTER (
        WHERE is_paid AND NOT EXISTS (
          SELECT 1 FROM da WHERE da.date = ma.date
        )
      ), 0)::numeric AS paid_amount_ma,
      COALESCE(SUM(count) FILTER (
        WHERE is_paid AND NOT EXISTS (
          SELECT 1 FROM da WHERE da.date = ma.date
        )
      ), 0)::bigint  AS paid_count_ma,
      COALESCE(SUM(total_cost) FILTER (
        WHERE NOT is_paid AND NOT EXISTS (
          SELECT 1 FROM da WHERE da.date = ma.date
        )
      ), 0)::numeric AS pending_amount_ma,
      COALESCE(SUM(count) FILTER (
        WHERE NOT is_paid AND NOT EXISTS (
          SELECT 1 FROM da WHERE da.date = ma.date
        )
      ), 0)::bigint  AS pending_count_ma
    FROM ma
  )
  SELECT jsonb_build_object(
    'total_salary',     (d.salary_all + m.market_amount),
    'total_tea_shop',   (o.amount + al.amount),
    'total_expense',    (d.salary_all + m.market_amount + o.amount + al.amount),
    'daily_amount',     d.daily_amount,
    'contract_amount',  d.contract_amount,
    'market_amount',    m.market_amount,
    'paid_amount',      (d.paid_amount_da + m.paid_amount_ma),
    'paid_count',       (d.paid_count_da  + m.paid_count_ma),
    'pending_amount',   (d.pending_amount_da + m.pending_amount_ma),
    'pending_count',    (d.pending_count_da  + m.pending_count_ma),
    'total_laborers',   (d.total_laborer_rows + m.market_count),
    'active_days',      ad.n,
    'avg_per_day',
      CASE WHEN ad.n > 0
        THEN ((d.salary_all + m.market_amount + o.amount + al.amount) / ad.n)
        ELSE 0
      END
  )
  FROM da_totals d
  CROSS JOIN ma_totals m
  CROSS JOIN own_tea o
  CROSS JOIN alloc_tea al
  CROSS JOIN active_days ad;
$$;

COMMENT ON FUNCTION public.get_attendance_summary(uuid, date, date) IS
'Server-side aggregation for Attendance page summary cards. Returns total salary / tea-shop / paid / pending / per-laborer-type sums and active-day count for a site within an optional date range. Mirrors the client periodTotals reducer so the card numbers do not change when the table is loaded one week at a time.';

GRANT EXECUTE ON FUNCTION public.get_attendance_summary(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_attendance_summary(uuid, date, date) TO service_role;
