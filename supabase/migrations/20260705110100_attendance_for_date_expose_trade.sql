-- Expose each daily laborer's subcontract + trade in get_attendance_for_date.
--
-- The InspectPane per-day expansion needs to know which company laborers worked
-- on a non-Civil trade contract (e.g. Painting — In-house) so it can grey them out
-- with a trade chip ("settled separately under the trade's workspace"), mirroring
-- the existing task-work / daily-market treatment. This adds subcontract_id,
-- subcontract_title, and trade_name to each element of `daily_laborers`.
--
-- Read-path only, additive — every existing key is unchanged. Body reproduced
-- verbatim from the live prod def (pg_get_functiondef, == mig 20260705100100) with
-- two LEFT JOINs (subcontracts + labor_categories) and three jsonb keys added.

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
      twp.title AS task_work_title,
      d.subcontract_id AS subcontract_id,
      sc.title AS subcontract_title,
      lc.name AS trade_name
    FROM public.daily_attendance d
    JOIN public.laborers l ON l.id = d.laborer_id
    LEFT JOIN public.labor_roles lr ON lr.id = l.role_id
    LEFT JOIN public.task_work_packages twp ON twp.id = d.task_work_package_id
    LEFT JOIN public.subcontracts sc ON sc.id = d.subcontract_id
    LEFT JOIN public.labor_categories lc ON lc.id = sc.trade_category_id
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
          'task_work_title',      dl.task_work_title,
          'subcontract_id',       dl.subcontract_id,
          'subcontract_title',    dl.subcontract_title,
          'trade_name',           dl.trade_name
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
