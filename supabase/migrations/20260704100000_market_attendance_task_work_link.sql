-- Link market (unnamed) laborers to a task-work package from the attendance drawer.
--
-- Company laborers already carry daily_attendance.task_work_package_id
-- (20260701120000): when set, their day feeds the package day log and leaves the
-- daily salary settlement. Market laborers (role + rate + count, no named person)
-- had no equivalent, so a site engineer could not attribute an ad-hoc crew to a
-- contract without leaving attendance. This adds the same link to the market table.
--
-- Attribution only — pay is unchanged. The derivation trigger (next migration)
-- reads this column to build role-grouped day-log lines, and the settlement RPCs
-- use it to exclude an assigned market crew from the per-day waterfall.

ALTER TABLE public.market_laborer_attendance
  ADD COLUMN IF NOT EXISTS task_work_package_id uuid
    REFERENCES public.task_work_packages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_mla_task_work_package
  ON public.market_laborer_attendance (task_work_package_id)
  WHERE task_work_package_id IS NOT NULL;

COMMENT ON COLUMN public.market_laborer_attendance.task_work_package_id IS
  'When set, this market crew worked on a task-work package: its labour feeds the package day log and it leaves the daily salary settlement. Attribution only — pay unchanged. Mirrors daily_attendance.task_work_package_id.';
