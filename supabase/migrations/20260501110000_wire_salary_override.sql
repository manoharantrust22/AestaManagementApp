-- Migration: Wire salary_override into earnings + auto-sync settlement totals
--
-- Purpose:
--   1. The salary_override column on daily_attendance was added by
--      20260108100001_add_salary_override.sql but never consulted by the
--      trigger that computes daily_earnings — meaning the AttendanceDrawer's
--      override field was visually present but had no effect on payroll.
--      This migration finishes the wiring: when salary_override IS NOT NULL,
--      it becomes the daily_earnings (otherwise the existing
--      work_days × daily_rate_applied formula stands).
--
--   2. Until now, settlement_groups.total_amount was a frozen column that
--      went stale whenever attendance earnings changed afterwards. This
--      migration adds an AFTER trigger on daily_attendance that keeps the
--      parent settlement_groups.total_amount in sync (sum of non-deleted
--      child attendance daily_earnings) on INSERT / UPDATE / DELETE.
--
--   3. get_attendance_for_date now exposes is_overridden + override_reason
--      + laborer_id, so the InspectPane can show an "overridden" badge and
--      deep-link to the AttendanceDrawer for that laborer + date.

-- ============================================================
-- process_attendance_before_insert (replace existing)
-- ============================================================
CREATE OR REPLACE FUNCTION public.process_attendance_before_insert() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_laborer_record RECORD;
    v_log_id UUID;
BEGIN
    SELECT daily_rate, team_id INTO v_laborer_record
    FROM laborers
    WHERE id = NEW.laborer_id;

    IF NEW.daily_rate_applied IS NULL OR NEW.daily_rate_applied = 0 THEN
        NEW.daily_rate_applied := COALESCE(v_laborer_record.daily_rate, 0);
    END IF;

    IF NEW.team_id IS NULL THEN
        NEW.team_id := v_laborer_record.team_id;
    END IF;

    IF NEW.start_time IS NOT NULL AND NEW.end_time IS NOT NULL THEN
        NEW.hours_worked := EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time)) / 3600;
        IF NEW.hours_worked < 0 THEN
            NEW.hours_worked := NEW.hours_worked + 24;
        END IF;
    END IF;

    -- Honour salary_override when set; otherwise compute from rate × work_days.
    NEW.daily_earnings := COALESCE(
        NEW.salary_override,
        COALESCE(NEW.work_days, 1) * COALESCE(NEW.daily_rate_applied, 0)
    );

    IF NEW.hours_worked IS NOT NULL THEN
        CASE
            WHEN NEW.work_days = 1 THEN
                IF NEW.hours_worked > 9.5 THEN
                    NEW.work_variance := 'overtime';
                ELSIF NEW.hours_worked < 8.5 THEN
                    NEW.work_variance := 'undertime';
                ELSE
                    NEW.work_variance := 'standard';
                END IF;
            WHEN NEW.work_days = 0.5 THEN
                IF NEW.hours_worked > 5 THEN
                    NEW.work_variance := 'overtime';
                ELSIF NEW.hours_worked < 4 THEN
                    NEW.work_variance := 'undertime';
                ELSE
                    NEW.work_variance := 'standard';
                END IF;
            WHEN NEW.work_days = 1.5 THEN
                IF NEW.hours_worked > 14 THEN
                    NEW.work_variance := 'overtime';
                ELSIF NEW.hours_worked < 12 THEN
                    NEW.work_variance := 'undertime';
                ELSE
                    NEW.work_variance := 'standard';
                END IF;
            WHEN NEW.work_days = 2 THEN
                IF NEW.hours_worked > 18 THEN
                    NEW.work_variance := 'overtime';
                ELSIF NEW.hours_worked < 15 THEN
                    NEW.work_variance := 'undertime';
                ELSE
                    NEW.work_variance := 'standard';
                END IF;
            ELSE
                NEW.work_variance := 'standard';
        END CASE;
    END IF;

    SELECT id INTO v_log_id
    FROM daily_logs
    WHERE site_id = NEW.site_id AND date = NEW.date;

    IF v_log_id IS NULL THEN
        INSERT INTO daily_logs (site_id, date, logged_by)
        VALUES (NEW.site_id, NEW.date, NEW.entered_by)
        RETURNING id INTO v_log_id;
    END IF;

    NEW.daily_log_id := v_log_id;

    RETURN NEW;
END;
$$;


-- ============================================================
-- process_attendance_before_update (replace existing)
-- ============================================================
CREATE OR REPLACE FUNCTION public.process_attendance_before_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.start_time IS NOT NULL AND NEW.end_time IS NOT NULL THEN
        NEW.hours_worked := EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time)) / 3600;
        IF NEW.hours_worked < 0 THEN
            NEW.hours_worked := NEW.hours_worked + 24;
        END IF;
    END IF;

    NEW.daily_earnings := COALESCE(
        NEW.salary_override,
        COALESCE(NEW.work_days, 1) * COALESCE(NEW.daily_rate_applied, 0)
    );

    IF NEW.hours_worked IS NOT NULL THEN
        CASE
            WHEN NEW.work_days = 1 THEN
                IF NEW.hours_worked > 9.5 THEN
                    NEW.work_variance := 'overtime';
                ELSIF NEW.hours_worked < 8.5 THEN
                    NEW.work_variance := 'undertime';
                ELSE
                    NEW.work_variance := 'standard';
                END IF;
            WHEN NEW.work_days = 0.5 THEN
                IF NEW.hours_worked > 5 THEN
                    NEW.work_variance := 'overtime';
                ELSIF NEW.hours_worked < 4 THEN
                    NEW.work_variance := 'undertime';
                ELSE
                    NEW.work_variance := 'standard';
                END IF;
            WHEN NEW.work_days = 1.5 THEN
                IF NEW.hours_worked > 14 THEN
                    NEW.work_variance := 'overtime';
                ELSIF NEW.hours_worked < 12 THEN
                    NEW.work_variance := 'undertime';
                ELSE
                    NEW.work_variance := 'standard';
                END IF;
            WHEN NEW.work_days = 2 THEN
                IF NEW.hours_worked > 18 THEN
                    NEW.work_variance := 'overtime';
                ELSIF NEW.hours_worked < 15 THEN
                    NEW.work_variance := 'undertime';
                ELSE
                    NEW.work_variance := 'standard';
                END IF;
            ELSE
                NEW.work_variance := 'standard';
        END CASE;
    END IF;

    NEW.updated_at := NOW();

    RETURN NEW;
END;
$$;


-- ============================================================
-- recompute_settlement_total_after_attendance (NEW)
-- ============================================================
-- Keeps settlement_groups.total_amount in sync when an attendance row's
-- earnings change, when it joins/leaves a settlement, or when it gets
-- soft-deleted. Operates on AFTER triggers so it sees committed values.
CREATE OR REPLACE FUNCTION public.recompute_settlement_total_after_attendance()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_groups uuid[];
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.settlement_group_id IS NOT NULL THEN
            v_groups := ARRAY[NEW.settlement_group_id];
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        IF (OLD.settlement_group_id IS DISTINCT FROM NEW.settlement_group_id)
            OR (OLD.daily_earnings IS DISTINCT FROM NEW.daily_earnings)
            OR (OLD.is_deleted IS DISTINCT FROM NEW.is_deleted) THEN
            v_groups := ARRAY(
                SELECT g
                FROM unnest(ARRAY[OLD.settlement_group_id, NEW.settlement_group_id]) g
                WHERE g IS NOT NULL
            );
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.settlement_group_id IS NOT NULL THEN
            v_groups := ARRAY[OLD.settlement_group_id];
        END IF;
    END IF;

    IF v_groups IS NULL OR array_length(v_groups, 1) IS NULL THEN
        RETURN NULL;
    END IF;

    UPDATE settlement_groups sg
    SET total_amount = COALESCE((
            SELECT SUM(d.daily_earnings)
            FROM daily_attendance d
            WHERE d.settlement_group_id = sg.id
              AND d.is_deleted = false
        ), 0),
        updated_at = NOW()
    WHERE sg.id = ANY(v_groups)
      AND sg.is_cancelled = false;

    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS recompute_settlement_total_after_attendance_trigger ON public.daily_attendance;
CREATE TRIGGER recompute_settlement_total_after_attendance_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.daily_attendance
FOR EACH ROW
EXECUTE FUNCTION public.recompute_settlement_total_after_attendance();


-- ============================================================
-- get_attendance_for_date (replace — adds is_overridden / override_reason / laborer_id)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_attendance_for_date(
  p_site_id uuid,
  p_date date
) RETURNS jsonb
  LANGUAGE sql STABLE
  SECURITY INVOKER
  SET search_path = public
AS $$
  WITH
  daily_lab AS (
    SELECT
      d.id,
      l.name AS lab_name,
      COALESCE(lr.name, 'Unknown') AS role,
      (d.work_days >= 1) AS full_day,
      d.daily_earnings AS amount,
      (d.salary_override IS NOT NULL) AS is_overridden,
      d.salary_override_reason AS override_reason,
      d.laborer_id
    FROM public.daily_attendance d
    JOIN public.laborers l ON l.id = d.laborer_id
    LEFT JOIN public.labor_roles lr ON lr.id = l.role_id
    WHERE d.site_id = p_site_id
      AND d.date = p_date
      AND d.is_deleted = false
    ORDER BY l.name
  ),
  market_lab AS (
    SELECT
      m.id,
      COALESCE(lr.name, 'Worker') AS role,
      m.count,
      m.total_cost AS amount
    FROM public.market_laborer_attendance m
    LEFT JOIN public.labor_roles lr ON lr.id = m.role_id
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
    'daily_total',     COALESCE((SELECT SUM(amount) FROM daily_lab), 0),
    'market_total',    COALESCE((SELECT SUM(amount) FROM market_lab), 0),
    'tea_shop_total',  ((SELECT amount FROM own_tea) + (SELECT amount FROM alloc_tea)),
    'daily_laborers',
      COALESCE(
        (SELECT jsonb_agg(jsonb_build_object(
          'id',              dl.id,
          'name',            dl.lab_name,
          'role',            dl.role,
          'full_day',        dl.full_day,
          'amount',          dl.amount,
          'is_overridden',   dl.is_overridden,
          'override_reason', dl.override_reason,
          'laborer_id',      dl.laborer_id
        )) FROM daily_lab dl),
        '[]'::jsonb
      ),
    'market_laborers',
      COALESCE(
        (SELECT jsonb_agg(jsonb_build_object(
          'id',     ml.id,
          'role',   ml.role,
          'count',  ml.count,
          'amount', ml.amount
        )) FROM market_lab ml),
        '[]'::jsonb
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_attendance_for_date(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_attendance_for_date(uuid, date) TO service_role;
