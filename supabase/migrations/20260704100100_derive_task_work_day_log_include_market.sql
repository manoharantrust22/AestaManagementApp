-- Include MARKET (unnamed) laborers in the derived task-work day log.
--
-- 20260701120200 derives a package's day log from daily_attendance rows tagged
-- with task_work_package_id (one 'laborer' line each). Now that market laborers
-- can carry the same tag (20260704100000), fold them in too: one role-grouped
-- 'role' line per (role, rate), count = Σ(headcount × day_units) = the man-day
-- contribution, rate = rate_per_person. The task_work_day_logs.worker_lines
-- schema already supports { kind:'role', ref_id, label, count, daily_rate }, so
-- the storage + contract Day Log UI need no change.
--
-- ATTRIBUTION ONLY (unchanged): writes only to task_work_day_logs; never touches
-- pay, is_paid, or salary settlement. Manual (is_manual_override = true) day logs
-- are still never touched.

-- =============================================================================
-- 1. RECALC FUNCTION — now UNIONs daily_attendance + market_laborer_attendance
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

  -- Combined worker lines for this (package, date, site):
  --   * one 'laborer' line per assigned company attendance row
  --       count = day_units (man-day contribution), rate = applied daily rate
  --   * one 'role' line per (role, rate) of assigned market crews
  --       count = Σ(headcount × day_units), rate = rate_per_person
  WITH lines AS (
    SELECT
      jsonb_build_object(
        'kind',       'laborer',
        'ref_id',     d.laborer_id,
        'label',      COALESCE(l.name, 'Laborer'),
        'count',      COALESCE(d.day_units, d.work_days, 1),
        'daily_rate', COALESCE(d.daily_rate_applied, l.daily_rate, 0)
      )                                              AS line,
      COALESCE(d.day_units, d.work_days, 1)          AS md,
      1                                              AS sort_grp,
      COALESCE(l.name, 'Laborer')                    AS sort_key
    FROM public.daily_attendance d
    JOIN public.laborers l ON l.id = d.laborer_id
    WHERE d.task_work_package_id = p_package_id
      AND d.date    = p_log_date
      AND d.site_id = p_site_id
      AND d.is_deleted  = false
      AND d.is_archived = false

    UNION ALL

    SELECT
      jsonb_build_object(
        'kind',       'role',
        'ref_id',     m.role_id,
        'label',      COALESCE(r.name, 'Worker'),
        'count',      SUM(m.count * COALESCE(m.day_units, m.work_days, 1)),
        'daily_rate', m.rate_per_person
      )                                                        AS line,
      SUM(m.count * COALESCE(m.day_units, m.work_days, 1))     AS md,
      2                                                        AS sort_grp,
      COALESCE(r.name, 'Worker')                               AS sort_key
    FROM public.market_laborer_attendance m
    LEFT JOIN public.labor_roles r ON r.id = m.role_id
    WHERE m.task_work_package_id = p_package_id
      AND m.date    = p_log_date
      AND m.site_id = p_site_id
    GROUP BY m.role_id, r.name, m.rate_per_person
  )
  SELECT
    jsonb_agg(line ORDER BY sort_grp, sort_key),
    COALESCE(SUM(md), 0)
  INTO v_lines, v_man_days
  FROM lines;

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
  'Rebuilds the auto-derived task_work_day_logs row for a (package, date, site) from daily_attendance (per-laborer lines) AND market_laborer_attendance (role-grouped lines) tagged with that package. count = man-day contribution, rate = daily rate / rate_per_person. Skips/preserves is_manual_override = true rows. Attribution only — never touches pay.';

-- =============================================================================
-- 2. TRIGGER FUNCTION on market_laborer_attendance — resync package day log(s)
--    Mirrors trigger_attendance_derive_task_work on daily_attendance.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.trigger_market_attendance_derive_task_work()
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
       OR OLD.count           IS DISTINCT FROM NEW.count
       OR OLD.day_units       IS DISTINCT FROM NEW.day_units
       OR OLD.work_days       IS DISTINCT FROM NEW.work_days
       OR OLD.rate_per_person IS DISTINCT FROM NEW.rate_per_person
       OR OLD.role_id         IS DISTINCT FROM NEW.role_id
       OR OLD.date            IS DISTINCT FROM NEW.date
       OR OLD.site_id         IS DISTINCT FROM NEW.site_id
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

COMMENT ON FUNCTION public.trigger_market_attendance_derive_task_work() IS
  'Resyncs derived task_work_day_logs when market_laborer_attendance rows carrying a task_work_package_id are inserted/updated/deleted. Recalcs both the OLD and NEW package on reassignment.';

DROP TRIGGER IF EXISTS trg_market_attendance_derive_task_work ON public.market_laborer_attendance;
CREATE TRIGGER trg_market_attendance_derive_task_work
  AFTER INSERT OR UPDATE OR DELETE ON public.market_laborer_attendance
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_market_attendance_derive_task_work();

-- =============================================================================
-- 3. GRANTS
-- =============================================================================
GRANT EXECUTE ON FUNCTION public.trigger_market_attendance_derive_task_work()
  TO authenticated, service_role;
