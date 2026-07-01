-- Migration: derive task-work day logs from attendance assignments
--
-- Purpose:
--   When laborers are tagged to a task-work package in the attendance drawer
--   (daily_attendance.task_work_package_id), keep that package's day log in sync
--   automatically: one worker line per assigned laborer, count = their day_units
--   (the Half/Full/Double the supervisor already picks — that IS the man-day
--   count), rate = their real applied daily rate. The day's labour VALUE
--   = Σ(count × rate) then reflects the actual company wages lent to the contract.
--
--   This mirrors the proven tea-shop machinery:
--     20260105110000_attendance_tea_shop_auto_recalc.sql (trigger + recalc fn)
--     20260625130000_tea_split_include_contract_presence.sql (is_manual_override guard)
--
--   ATTRIBUTION ONLY: this writes only to task_work_day_logs (effort/profitability).
--   It never touches pay, salary settlement, or is_paid. Assigned laborers stay in
--   the normal salary flow.
--
--   Manual wins: a (package, date) row with is_manual_override = true is NEVER
--   touched. Auto-derived rows carry is_manual_override = false and are freely
--   rebuilt/removed as attendance changes.

-- =============================================================================
-- 1. RECALC FUNCTION — rebuild the DERIVED day log for one (package, date, site)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.recalculate_task_work_day_log_from_attendance(
  p_package_id uuid,
  p_log_date   date,
  p_site_id    uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_manual       boolean;
  v_lines        jsonb;
  v_man_days     numeric;
  v_worker_count integer;
BEGIN
  IF p_package_id IS NULL OR p_log_date IS NULL OR p_site_id IS NULL THEN
    RETURN;
  END IF;

  -- Manual wins: never touch a hand-entered log for this (package, date).
  SELECT is_manual_override INTO v_manual
  FROM public.task_work_day_logs
  WHERE package_id = p_package_id AND log_date = p_log_date;
  IF v_manual IS TRUE THEN
    RETURN;
  END IF;

  -- One "laborer" worker line per assigned attendance row on this date.
  -- count  = day_units (falls back to work_days, else 1)  -> the man-day contribution
  -- rate   = the laborer's applied daily rate (their real wage)
  SELECT
    jsonb_agg(
      jsonb_build_object(
        'kind',       'laborer',
        'ref_id',     d.laborer_id,
        'label',      COALESCE(l.name, 'Laborer'),
        'count',      COALESCE(d.day_units, d.work_days, 1),
        'daily_rate', COALESCE(d.daily_rate_applied, l.daily_rate, 0)
      )
      ORDER BY l.name
    ),
    COALESCE(SUM(COALESCE(d.day_units, d.work_days, 1)), 0)
  INTO v_lines, v_man_days
  FROM public.daily_attendance d
  JOIN public.laborers l ON l.id = d.laborer_id
  WHERE d.task_work_package_id = p_package_id
    AND d.date    = p_log_date
    AND d.site_id = p_site_id
    AND d.is_deleted  = false
    AND d.is_archived = false;

  -- No assigned laborers left -> drop ONLY a derived row (never a manual one).
  IF v_lines IS NULL THEN
    DELETE FROM public.task_work_day_logs
    WHERE package_id = p_package_id
      AND log_date   = p_log_date
      AND is_manual_override = false;
    RETURN;
  END IF;

  v_worker_count := ROUND(v_man_days);

  INSERT INTO public.task_work_day_logs (
    package_id, site_id, log_date, worker_count, man_days,
    worker_lines, worker_note, is_manual_override, recorded_by
  ) VALUES (
    p_package_id, p_site_id, p_log_date, v_worker_count, v_man_days,
    v_lines, NULL, false, NULL
  )
  ON CONFLICT (package_id, log_date) DO UPDATE SET
    worker_count       = EXCLUDED.worker_count,
    man_days           = EXCLUDED.man_days,
    worker_lines       = EXCLUDED.worker_lines,
    site_id            = EXCLUDED.site_id,
    is_manual_override = false
  -- Second guard against a race: if a manual row snuck in, leave it untouched.
  WHERE task_work_day_logs.is_manual_override = false;
END;
$$;

COMMENT ON FUNCTION public.recalculate_task_work_day_log_from_attendance(uuid, date, uuid) IS
  'Rebuilds the auto-derived task_work_day_logs row for a (package, date, site) from daily_attendance rows tagged with that package. count = day_units, rate = daily_rate_applied. Skips/preserves is_manual_override = true rows. Attribution only — never touches pay.';

-- =============================================================================
-- 2. TRIGGER FUNCTION on daily_attendance — resync affected package day log(s)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.trigger_attendance_derive_task_work()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.task_work_package_id IS NOT NULL THEN
      PERFORM public.recalculate_task_work_day_log_from_attendance(
        OLD.task_work_package_id, OLD.date, OLD.site_id);
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Only re-derive when something that affects a derived line changed.
    IF OLD.task_work_package_id IS DISTINCT FROM NEW.task_work_package_id
       OR OLD.day_units          IS DISTINCT FROM NEW.day_units
       OR OLD.work_days          IS DISTINCT FROM NEW.work_days
       OR OLD.daily_rate_applied IS DISTINCT FROM NEW.daily_rate_applied
       OR OLD.is_deleted         IS DISTINCT FROM NEW.is_deleted
       OR OLD.is_archived        IS DISTINCT FROM NEW.is_archived
       OR OLD.date               IS DISTINCT FROM NEW.date
       OR OLD.site_id            IS DISTINCT FROM NEW.site_id
    THEN
      -- Recalc the OLD package/date (handles reassignment + moved date) ...
      IF OLD.task_work_package_id IS NOT NULL THEN
        PERFORM public.recalculate_task_work_day_log_from_attendance(
          OLD.task_work_package_id, OLD.date, OLD.site_id);
      END IF;
      -- ... and the NEW one (harmlessly idempotent if identical).
      IF NEW.task_work_package_id IS NOT NULL THEN
        PERFORM public.recalculate_task_work_day_log_from_attendance(
          NEW.task_work_package_id, NEW.date, NEW.site_id);
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- INSERT
  IF NEW.task_work_package_id IS NOT NULL THEN
    PERFORM public.recalculate_task_work_day_log_from_attendance(
      NEW.task_work_package_id, NEW.date, NEW.site_id);
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trigger_attendance_derive_task_work() IS
  'Resyncs derived task_work_day_logs when daily_attendance rows carrying a task_work_package_id are inserted/updated/deleted. Recalcs both the OLD and NEW package on reassignment.';

DROP TRIGGER IF EXISTS trg_attendance_derive_task_work ON public.daily_attendance;
CREATE TRIGGER trg_attendance_derive_task_work
  AFTER INSERT OR UPDATE OR DELETE ON public.daily_attendance
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_attendance_derive_task_work();

-- =============================================================================
-- 3. GRANTS
-- =============================================================================
GRANT EXECUTE ON FUNCTION public.recalculate_task_work_day_log_from_attendance(uuid, date, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trigger_attendance_derive_task_work()
  TO authenticated, service_role;

-- NOTE (v1 boundary, documented not silent): the copy_day_attendance RPC
-- (20260630160000) does NOT yet copy task_work_package_id, so cloning a day does
-- not carry contract assignments. Fine for v1 — the trigger fires on those INSERTs
-- with a NULL package (no-op). A future revision can add the column to that RPC.
