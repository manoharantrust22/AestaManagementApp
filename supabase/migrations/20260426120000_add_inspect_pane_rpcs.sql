-- Migration: Add Inspect Pane RPCs (get_attendance_for_date, get_laborer_week_breakdown)
--
-- Purpose:
--   Power the InspectPane Attendance tab on /site/payments,
--   /site/expenses, and /site/attendance. Both shapes (a daily date row
--   and a per-laborer-per-week row) need a single round-trip read of
--   the attendance + market + tea-shop + holiday data so the pane
--   opens within ~100ms of the click.
--
--   These mirror the get_payment_summary / get_attendance_summary
--   pattern (LANGUAGE sql STABLE, SECURITY INVOKER, search_path public,
--   GRANT EXECUTE TO authenticated + service_role) and return jsonb
--   rather than a TABLE so the client can map snake_case -> camelCase
--   in one place (the hook).
--
-- Schema deviations from the spec:
--   - The plan describes a separate `contract_amount` for piece-rate
--     work. In production, `daily_attendance.daily_earnings` already
--     reflects whatever `work_days` * `daily_rate_applied` produced
--     (including subcontract overrides). There is no separate
--     piece-rate table queryable per laborer-per-week. So
--     `contract_amount` is emitted as 0 and `total` equals
--     `daily_salary`. The UI still shows the three tiles -- contract
--     simply renders ₹0 for now. A future iteration could pull from
--     `subcontracts.total_value` pro-rated by week if the product
--     decides piece-rate visibility is required.
--   - "role" comes from `laborers.role_id -> labor_roles.name`. Daily
--     laborers without a role row get "Unknown"; market laborers
--     without a role row get "Worker" (matching the client fallback
--     in attendance-content.tsx).
--   - "full_day" is derived as `work_days >= 1`. `work_days = 0.5`
--     becomes "half day"; this matches the existing daily_attendance
--     reality (no `is_full_day` boolean exists).
--   - Days-not-worked is the set of in-week dates that appear in
--     `site_holidays` AND have no `daily_attendance` row for the
--     laborer. Plain absent days (not a holiday, no attendance row)
--     are intentionally NOT included -- the per-day strip already
--     surfaces them as "off". The "days didn't work" section answers
--     "why no attendance?" via the holiday reason.
--
-- Validation:
--   Both function bodies were validated against production
--   (Srinivasan House & Shop site, dates 2026-04-23 / week 2026-04-19
--   to 2026-04-25 for laborer Chintu) by running the same WITH ...
--   SELECT inlined as a read-only query before this migration was
--   committed. Daily totals match attendance-content.tsx for the
--   spot-checked dates.

-- ============================================================
-- get_attendance_for_date
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_attendance_for_date(
  p_site_id uuid,
  p_date date
) RETURNS jsonb
  LANGUAGE sql STABLE
  SECURITY INVOKER
  SET search_path = public
AS $$
  WITH
  daily_lab AS (
    SELECT
      d.id,
      l.name AS lab_name,
      COALESCE(lr.name, 'Unknown') AS role,
      (d.work_days >= 1) AS full_day,
      d.daily_earnings AS amount
    FROM public.daily_attendance d
    JOIN public.laborers l ON l.id = d.laborer_id
    LEFT JOIN public.labor_roles lr ON lr.id = l.role_id
    WHERE d.site_id = p_site_id
      AND d.date = p_date
      AND d.is_deleted = false
    ORDER BY l.name
  ),
  market_lab AS (
    SELECT
      m.id,
      COALESCE(lr.name, 'Worker') AS role,
      m.count,
      m.total_cost AS amount
    FROM public.market_laborer_attendance m
    LEFT JOIN public.labor_roles lr ON lr.id = m.role_id
    WHERE m.site_id = p_site_id
      AND m.date = p_date
    ORDER BY lr.name
  ),
  -- Tea-shop math mirrors get_attendance_summary.own_tea / alloc_tea
  -- so the pane's Tea tile matches the page's KPI for the same date.
  own_tea AS (
    SELECT COALESCE(SUM(t.total_amount), 0)::numeric AS amount
    FROM public.tea_shop_entries t
    WHERE t.site_id = p_site_id
      AND t.date = p_date
      AND NOT (
        t.is_group_entry = true
        AND EXISTS (
          SELECT 1 FROM public.tea_shop_entry_allocations a
          WHERE a.entry_id = t.id
            AND a.site_id = p_site_id
        )
      )
  ),
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
      AND e.date = p_date
  )
  SELECT jsonb_build_object(
    'daily_total',     COALESCE((SELECT SUM(amount) FROM daily_lab), 0),
    'market_total',    COALESCE((SELECT SUM(amount) FROM market_lab), 0),
    'tea_shop_total',  ((SELECT amount FROM own_tea) + (SELECT amount FROM alloc_tea)),
    'daily_laborers',
      COALESCE(
        (SELECT jsonb_agg(jsonb_build_object(
          'id',       dl.id,
          'name',     dl.lab_name,
          'role',     dl.role,
          'full_day', dl.full_day,
          'amount',   dl.amount
        )) FROM daily_lab dl),
        '[]'::jsonb
      ),
    'market_laborers',
      COALESCE(
        (SELECT jsonb_agg(jsonb_build_object(
          'id',     ml.id,
          'role',   ml.role,
          'count',  ml.count,
          'amount', ml.amount
        )) FROM market_lab ml),
        '[]'::jsonb
      )
  );
$$;

COMMENT ON FUNCTION public.get_attendance_for_date(uuid, date) IS
'InspectPane daily-shape data: per-date totals (daily / market / tea) plus laborer + market-laborer detail rows for one site + one date. Tea-shop math mirrors get_attendance_summary.';

GRANT EXECUTE ON FUNCTION public.get_attendance_for_date(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_attendance_for_date(uuid, date) TO service_role;

-- ============================================================
-- get_laborer_week_breakdown
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_laborer_week_breakdown(
  p_site_id uuid,
  p_laborer_id uuid,
  p_week_start date,
  p_week_end date
) RETURNS jsonb
  LANGUAGE sql STABLE
  SECURITY INVOKER
  SET search_path = public
AS $$
  WITH
  -- Generate the 7-day window. Caller is expected to pass a
  -- contiguous Mon..Sun (or Sun..Sat) range; we don't enforce a
  -- specific anchor here so callers using either convention work.
  span AS (
    SELECT (p_week_start + g.offs)::date AS d
    FROM generate_series(0, (p_week_end - p_week_start)::int) AS g(offs)
  ),
  laborer_info AS (
    SELECT
      l.name AS laborer_name,
      COALESCE(lr.name, '') AS role
    FROM public.laborers l
    LEFT JOIN public.labor_roles lr ON lr.id = l.role_id
    WHERE l.id = p_laborer_id
  ),
  attendance_rows AS (
    SELECT
      d.date,
      d.work_days,
      d.daily_earnings
    FROM public.daily_attendance d
    WHERE d.site_id = p_site_id
      AND d.laborer_id = p_laborer_id
      AND d.date BETWEEN p_week_start AND p_week_end
      AND d.is_deleted = false
  ),
  holiday_rows AS (
    SELECT h.date, h.reason
    FROM public.site_holidays h
    WHERE h.site_id = p_site_id
      AND h.date BETWEEN p_week_start AND p_week_end
  ),
  day_rows AS (
    SELECT
      span.d AS date,
      to_char(span.d, 'Dy') AS day_name,
      CASE
        WHEN ar.work_days IS NULL THEN
          CASE WHEN hr.date IS NOT NULL THEN 'holiday' ELSE 'off' END
        WHEN ar.work_days >= 1 THEN 'full'
        WHEN ar.work_days >= 0.5 THEN 'half'
        ELSE 'off'
      END AS status,
      COALESCE(ar.daily_earnings, 0)::numeric AS amount
    FROM span
    LEFT JOIN attendance_rows ar ON ar.date = span.d
    LEFT JOIN holiday_rows hr ON hr.date = span.d
  )
  SELECT jsonb_build_object(
    'laborer_name',    COALESCE((SELECT laborer_name FROM laborer_info), ''),
    'role',            COALESCE((SELECT role FROM laborer_info), ''),
    'daily_salary',    COALESCE((SELECT SUM(daily_earnings) FROM attendance_rows), 0),
    -- Schema deviation: contract_amount is materialized as 0 because
    -- piece-rate amounts aren't tracked at a per-laborer-per-week
    -- granularity in production. See migration header.
    'contract_amount', 0,
    'total',           COALESCE((SELECT SUM(daily_earnings) FROM attendance_rows), 0),
    'days',
      COALESCE(
        (SELECT jsonb_agg(jsonb_build_object(
          'date',     dr.date,
          'day_name', dr.day_name,
          'status',   dr.status,
          'amount',   dr.amount
        ) ORDER BY dr.date) FROM day_rows dr),
        '[]'::jsonb
      ),
    'days_not_worked',
      COALESCE(
        (SELECT jsonb_agg(jsonb_build_object(
          'date',   hr.date,
          'reason', hr.reason
        ) ORDER BY hr.date)
         FROM holiday_rows hr
         WHERE NOT EXISTS (
           SELECT 1 FROM attendance_rows ar WHERE ar.date = hr.date
         )),
        '[]'::jsonb
      )
  );
$$;

COMMENT ON FUNCTION public.get_laborer_week_breakdown(uuid, uuid, date, date) IS
'InspectPane weekly-shape data: 7-day strip + salary breakdown for one laborer in one week. Status maps work_days (>=1 -> full, >=0.5 -> half, NULL+holiday -> holiday, else off). contract_amount is 0 today (see migration header).';

GRANT EXECUTE ON FUNCTION public.get_laborer_week_breakdown(uuid, uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_laborer_week_breakdown(uuid, uuid, date, date) TO service_role;
