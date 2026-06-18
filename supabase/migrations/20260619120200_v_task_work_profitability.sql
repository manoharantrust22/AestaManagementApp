-- Migration: Task Work profitability view
--
-- One row per package with the four insights the office cares about:
--   (a) company saving vs the daywage benchmark,
--   (b) the crew's effective ₹/man-day,
--   (c) the ₹/unit rate (for the rate book), and
--   (d) the schedule inputs for planned-vs-actual.
--
-- SECURITY INVOKER (the default) so the base-table RLS (can_access_site) applies
-- to every caller automatically — no extra policy needed on the view.

CREATE OR REPLACE VIEW public.v_task_work_profitability AS
SELECT
  p.id                                AS package_id,
  p.site_id,
  p.package_number,
  p.title,
  p.labor_category_id,
  lc.name                             AS category_name,
  p.status,
  p.parent_subcontract_id,
  p.total_value,
  p.total_units,
  p.measurement_unit,
  p.benchmark_daily_rate,
  p.retention_percent,
  p.estimated_days,
  p.estimated_crew_size,
  p.planned_start_date,
  p.planned_end_date,
  p.actual_start_date,
  p.actual_end_date,
  COALESCE(dl.actual_man_days, 0)     AS actual_man_days,
  COALESCE(dl.actual_working_days, 0) AS actual_working_days,
  COALESCE(pay.paid, 0)               AS paid,
  p.total_value - COALESCE(pay.paid, 0) AS balance,
  ROUND(p.total_value * p.retention_percent / 100.0, 2) AS retention_held,
  ROUND(COALESCE(dl.actual_man_days, 0) * COALESCE(p.benchmark_daily_rate, 0), 2)
    AS daywage_benchmark_cost,
  ROUND(
    (COALESCE(dl.actual_man_days, 0) * COALESCE(p.benchmark_daily_rate, 0))
    - p.total_value, 2
  ) AS company_saving,
  CASE
    WHEN COALESCE(dl.actual_man_days, 0) * COALESCE(p.benchmark_daily_rate, 0) > 0
    THEN ROUND(
      ((COALESCE(dl.actual_man_days, 0) * COALESCE(p.benchmark_daily_rate, 0)) - p.total_value)
      / (COALESCE(dl.actual_man_days, 0) * COALESCE(p.benchmark_daily_rate, 0)) * 100, 1
    )
    ELSE NULL
  END AS saving_pct,
  CASE
    WHEN COALESCE(dl.actual_man_days, 0) > 0
    THEN ROUND(p.total_value / dl.actual_man_days, 2)
    ELSE NULL
  END AS crew_effective_daily,
  CASE
    WHEN COALESCE(p.total_units, 0) > 0
    THEN ROUND(p.total_value / p.total_units, 2)
    ELSE NULL
  END AS computed_rate_per_unit
FROM public.task_work_packages p
LEFT JOIN public.labor_categories lc ON lc.id = p.labor_category_id
LEFT JOIN (
  SELECT package_id,
         SUM(man_days)            AS actual_man_days,
         COUNT(DISTINCT log_date) AS actual_working_days
  FROM public.task_work_day_logs
  GROUP BY package_id
) dl ON dl.package_id = p.id
LEFT JOIN (
  SELECT package_id, SUM(amount) AS paid
  FROM public.task_work_payments
  WHERE is_deleted = false
  GROUP BY package_id
) pay ON pay.package_id = p.id;

GRANT SELECT ON public.v_task_work_profitability TO authenticated, service_role;

COMMENT ON VIEW public.v_task_work_profitability IS
  'Per-package task-work profitability: company saving vs daywage, crew effective ₹/man-day, ₹/unit rate, and schedule. SECURITY INVOKER — base-table RLS applies.';
