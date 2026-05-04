-- Audit-mode update: get_attendance_for_date — period tag + is_archived filter.
--
-- Companion to 20260504100000_add_site_audit_lifecycle.sql.
--
-- The InspectPane per-date drawer needs to know whether the date being viewed
-- belongs to the legacy or current band. Adds:
--   1. is_archived = false on daily_attendance (Mode B compatibility).
--   2. New top-level 'period' field in the returned jsonb: 'legacy' | 'current'.
--      For non-auditing sites, period is always 'current'.
--
-- Function signature unchanged (still takes uuid + date, returns jsonb), so
-- existing callers continue to work — they simply ignore the new field.

CREATE OR REPLACE FUNCTION public.get_attendance_for_date(
  p_site_id uuid,
  p_date    date
) RETURNS jsonb
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
  daily_lab AS (
    SELECT
      d.id,
      l.name AS lab_name,
      COALESCE(lr.name, 'Unknown') AS role,
      (d.work_days >= 1) AS full_day,
      d.daily_earnings AS amount,
      l.laborer_type AS laborer_type
    FROM public.daily_attendance d
    JOIN public.laborers l ON l.id = d.laborer_id
    LEFT JOIN public.labor_roles lr ON lr.id = l.role_id
    WHERE d.site_id = p_site_id
      AND d.date = p_date
      AND d.is_deleted  = false
      AND d.is_archived = false
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
    'period',
      (SELECT
         CASE
           WHEN ast.legacy_active AND p_date < ast.data_started_at THEN 'legacy'
           ELSE 'current'
         END
       FROM audit_state ast),
    'daily_total',     COALESCE((SELECT SUM(amount) FROM daily_lab), 0),
    'market_total',    COALESCE((SELECT SUM(amount) FROM market_lab), 0),
    'tea_shop_total',  ((SELECT amount FROM own_tea) + (SELECT amount FROM alloc_tea)),
    'daily_laborers',
      COALESCE(
        (SELECT jsonb_agg(jsonb_build_object(
          'id',           dl.id,
          'name',         dl.lab_name,
          'role',         dl.role,
          'full_day',     dl.full_day,
          'amount',       dl.amount,
          'laborer_type', dl.laborer_type
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
'InspectPane per-date data: totals + laborer detail. Adds top-level period (legacy/current) for sites in auditing state. is_archived=false on daily_attendance honors Mode B reconcile.';

GRANT EXECUTE ON FUNCTION public.get_attendance_for_date(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_attendance_for_date(uuid, date) TO service_role;
