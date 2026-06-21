-- Workforce "Workspace" redesign — per-task-work "work done %" for the exposure meter.
--
-- The redesigned Workforce home introduces an "exposure" metric:
--   exposure = paid - (quoted * work%)   -- + = paid AHEAD of work (risk), - = held back (safe)
-- This needs a progress fraction per task work (subcontracts row). None exists today
-- (daily_attendance.work_progress_percent is per-day and defaults to 100 — not a clean
-- per-contract headline), so we add one explicit, supervisor-set column.
--
-- NULLABLE ON PURPOSE: NULL means "progress not tracked yet". The UI renders a neutral
-- "set progress" state for NULL rather than computing a misleading day-one high-risk verdict
-- across the whole existing portfolio (every paid-but-untracked contract would read red).
-- Once a supervisor sets it, the exposure meter computes.
--
-- Additive only: one nullable column on subcontracts. No drops, no narrowing, no data changes.
-- RLS already governs subcontracts; no policy change needed for an added column.

ALTER TABLE public.subcontracts
  ADD COLUMN IF NOT EXISTS work_progress_percent integer
  CHECK (work_progress_percent IS NULL OR (work_progress_percent BETWEEN 0 AND 100));

COMMENT ON COLUMN public.subcontracts.work_progress_percent IS
  'Supervisor-set %% of this task work that is complete (0-100). NULL = not tracked yet (exposure meter shows a neutral "set progress" state). Drives the Workforce exposure metric: exposure = paid - total_value * work_progress_percent/100.';
