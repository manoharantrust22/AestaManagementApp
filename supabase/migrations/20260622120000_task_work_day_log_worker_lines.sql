-- Migration: Task Work day log — per-type worker breakdown (costed day log)
--
-- Purpose:
--   The "Log a day" dialog used to capture only a plain headcount (worker_count).
--   With no labour TYPE and no RATE, we could not value a day's work, so we could
--   not tell whether the maistry has been paid ahead of (overpaid) or behind
--   (underpaid) the work actually done.
--
--   This adds ONE nullable JSONB column holding the per-type breakdown for the
--   day. Each element is:
--       { "kind": "role"|"laborer"|"custom",
--         "ref_id": "<uuid|null>",
--         "label": "Mason",
--         "count": 2,
--         "daily_rate": 1000 }
--
--   The day's labour value = Σ(count × daily_rate) and is rolled up CLIENT-SIDE
--   (the day logs are already fully loaded), exactly like the man-day totals are
--   today — so no view changes are required. worker_count / man_days are derived
--   from the lines by the upsert service.
--
--   Purely additive: existing rows keep worker_lines = NULL and still render via
--   their worker_count (legacy display). Zero risk to existing data or queries.

ALTER TABLE public.task_work_day_logs
  ADD COLUMN IF NOT EXISTS worker_lines jsonb;

COMMENT ON COLUMN public.task_work_day_logs.worker_lines IS
  'Per-type worker breakdown for the day: array of {kind, ref_id, label, count, daily_rate}. Day labour value = Σ(count × daily_rate); rolled up client-side. NULL on legacy headcount-only rows.';
