-- Migration: per-laborer Task-Work package link on attendance
--
-- Purpose:
--   Let the site engineer tag each present laborer, right in the attendance
--   drawer, with the fixed-price task-work PACKAGE they worked on that day. The
--   package's day-log (task_work_day_logs) then derives automatically from these
--   assignments (see 20260701120200_*), so contract worker-day counts no longer
--   have to be re-keyed on /site/trades.
--
--   ATTRIBUTION ONLY: tagging a laborer does NOT change their pay. They are still
--   paid their normal daily wage via salary settlement exactly as before; the link
--   only records their effort/value against the contract (day-log count +
--   profitability). Nothing here touches daily_earnings, settlement, or is_paid.
--
--   Purely additive + nullable. `subcontract_id` (the legacy day-level contract
--   link) is left untouched — this is a parallel, per-row PACKAGE pointer.

ALTER TABLE public.daily_attendance
  ADD COLUMN IF NOT EXISTS task_work_package_id uuid NULL
    REFERENCES public.task_work_packages(id) ON DELETE SET NULL;

-- Drives the per-(package, date, site) derivation query in
-- recalculate_task_work_day_log_from_attendance().
CREATE INDEX IF NOT EXISTS idx_daily_attendance_task_work_package
  ON public.daily_attendance (task_work_package_id, site_id, date)
  WHERE task_work_package_id IS NOT NULL;

COMMENT ON COLUMN public.daily_attendance.task_work_package_id IS
  'Optional per-laborer link to the task-work package this laborer worked on that day. ATTRIBUTION ONLY: does not change pay/settlement; the package day-log (counts + labour value) derives from these links via trigger. NULL = general site work.';
