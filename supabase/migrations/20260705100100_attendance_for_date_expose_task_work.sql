-- Expose task-work attribution on the per-day InspectPane RPC.
--
-- get_attendance_for_date powers the InspectPane "Attendance" tab and the
-- Daily+Market per-date ledger expansion. Task-work-tagged laborers are already
-- excluded from the settlement MATH, but the panel still shows them as if
-- settleable. To let the UI grey them out with a "paid via contract" note, the
-- RPC now returns `task_work_package_id` and `task_work_title` per daily and
-- per market laborer row. Additive to the JSONB payload — existing keys
-- unchanged; reproduced verbatim from prod with the two fields added.

CREATE OR REPLACE FUNCTION public.get_attendance_for_date(p_site_id uuid, p_date date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
      l.laborer_type AS laborer_type,
      d.task_work_package_id AS task_work_package_id,
      twp.title AS task_work_title
    FROM public.daily_attendance d
    JOIN public.laborers l ON l.id = d.laborer_id
    LEFT JOIN public.labor_roles lr ON lr.id = l.role_id
    LEFT JOIN public.task_work_packages twp ON twp.id = d.task_work_package_id
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
      m.total_cost AS amount,
      m.task_work_package_id AS task_work_package_id,
      twp.title AS task_work_title
    FROM public.market_laborer_attendance m
    LEFT JOIN public.labor_roles lr ON lr.id = m.role_id
    LEFT JOIN public.task_work_packages twp ON twp.id = m.task_work_package_id
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
          'id',                   dl.id,
          'name',                 dl.lab_name,
          'role',                 dl.role,
          'full_day',             dl.full_day,
          'amount',               dl.amount,
          'laborer_type',         dl.laborer_type,
          'task_work_package_id', dl.task_work_package_id,
          'task_work_title',      dl.task_work_title
        )) FROM daily_lab dl),
        '[]'::jsonb
      ),
    'market_laborers',
      COALESCE(
        (SELECT jsonb_agg(jsonb_build_object(
          'id',                   ml.id,
          'role',                 ml.role,
          'count',                ml.count,
          'amount',               ml.amount,
          'task_work_package_id', ml.task_work_package_id,
          'task_work_title',      ml.task_work_title
        )) FROM market_lab ml),
        '[]'::jsonb
      )
  );
$function$;

GRANT EXECUTE ON FUNCTION public.get_attendance_for_date(uuid, date) TO authenticated, service_role;
