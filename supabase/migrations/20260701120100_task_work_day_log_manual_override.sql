-- Migration: manual-vs-derived separation on task-work day logs
--
-- Purpose:
--   Attendance can now DERIVE a package's day log (see 20260701120200_*). A derived
--   log must never clobber one a human entered by hand on /site/trades, and a hand
--   edit must never be overwritten by a later attendance change. This mirrors the
--   tea-shop pattern exactly (tea_shop_entry_allocations.is_manual_override, guarded
--   in recalculate_tea_shop_allocations_for_date).
--
--   Semantics:
--     is_manual_override = true  -> entered/edited by a person (the "Log a day"
--                                   dialog). Auto-derivation SKIPS these rows.
--     is_manual_override = false -> auto-derived from attendance assignments.
--                                   Re-derivation may freely rebuild/remove them.
--
--   DEFAULT true backfills every EXISTING row as manual (they were all hand-entered),
--   so nothing already in the table can be touched by the new derivation. Additive
--   and safe.

ALTER TABLE public.task_work_day_logs
  ADD COLUMN IF NOT EXISTS is_manual_override boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.task_work_day_logs.is_manual_override IS
  'true = hand-entered/edited via the Log-a-day dialog (protected; attendance derivation never overwrites it). false = auto-derived from attendance task_work_package_id assignments (rebuilt/removed by the derivation trigger). Mirrors tea_shop_entry_allocations.is_manual_override.';
