-- Migration: Laborer rate cascade RPCs
--
-- Purpose:
--   When a laborer's daily_rate is renegotiated (e.g. ₹1100 → ₹1050), the
--   change must propagate to every historical attendance row and to every
--   affected settlement_groups.total_amount in a single atomic transaction.
--
--   - preview_laborer_rate_cascade(): read-only, used to populate the
--     impact summary in the RateCascadeDialog before the user confirms.
--   - update_laborer_rate_cascade(): runs the cascade. Locks the laborer
--     row, updates laborers.daily_rate, rewrites daily_attendance.daily_rate_applied
--     for all non-deleted, non-overridden rows (the existing UPDATE trigger
--     auto-recomputes daily_earnings), and recomputes total_amount on every
--     non-cancelled settlement_groups whose attendance was touched.
--
--   Per-date manual overrides (daily_attendance.salary_override IS NOT NULL)
--   are preserved — they are user-set per-day amounts that should not be
--   blown away by a global rate change.
--
--   Cancelled settlement_groups are skipped — they're financially voided.

-- ============================================================
-- preview_laborer_rate_cascade
-- ============================================================
CREATE OR REPLACE FUNCTION public.preview_laborer_rate_cascade(
  p_laborer_id uuid,
  p_new_rate numeric
) RETURNS jsonb
  LANGUAGE plpgsql STABLE
  SECURITY INVOKER
  SET search_path = public
AS $$
DECLARE
  v_old_rate numeric;
  v_affected_attendance int;
  v_overridden_skipped int;
  v_total_delta numeric;
  v_affected_settlements int;
  v_cancelled_skipped int;
BEGIN
  SELECT daily_rate INTO v_old_rate
  FROM laborers
  WHERE id = p_laborer_id;

  IF v_old_rate IS NULL THEN
    RAISE EXCEPTION 'laborer % not found', p_laborer_id;
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE salary_override IS NULL),
    COUNT(*) FILTER (WHERE salary_override IS NOT NULL),
    COALESCE(SUM(
      CASE WHEN salary_override IS NULL
        THEN COALESCE(work_days, 1) * (p_new_rate - COALESCE(daily_rate_applied, 0))
        ELSE 0
      END
    ), 0)
  INTO v_affected_attendance, v_overridden_skipped, v_total_delta
  FROM daily_attendance
  WHERE laborer_id = p_laborer_id
    AND is_deleted = false;

  WITH affected_groups AS (
    SELECT DISTINCT d.settlement_group_id
    FROM daily_attendance d
    WHERE d.laborer_id = p_laborer_id
      AND d.is_deleted = false
      AND d.settlement_group_id IS NOT NULL
      AND d.salary_override IS NULL
  )
  SELECT
    COUNT(*) FILTER (WHERE NOT sg.is_cancelled),
    COUNT(*) FILTER (WHERE sg.is_cancelled)
  INTO v_affected_settlements, v_cancelled_skipped
  FROM affected_groups ag
  JOIN settlement_groups sg ON sg.id = ag.settlement_group_id;

  RETURN jsonb_build_object(
    'old_rate',             v_old_rate,
    'new_rate',             p_new_rate,
    'affected_attendance',  COALESCE(v_affected_attendance, 0),
    'overridden_skipped',   COALESCE(v_overridden_skipped, 0),
    'affected_settlements', COALESCE(v_affected_settlements, 0),
    'cancelled_skipped',    COALESCE(v_cancelled_skipped, 0),
    'total_delta',          COALESCE(v_total_delta, 0)
  );
END;
$$;

COMMENT ON FUNCTION public.preview_laborer_rate_cascade(uuid, numeric) IS
'Read-only preview of update_laborer_rate_cascade impact. Returns counts of affected attendance rows, settlements, skipped overrides and cancelled settlements, and the net wage delta.';

GRANT EXECUTE ON FUNCTION public.preview_laborer_rate_cascade(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_laborer_rate_cascade(uuid, numeric) TO service_role;


-- ============================================================
-- update_laborer_rate_cascade
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_laborer_rate_cascade(
  p_laborer_id uuid,
  p_new_rate numeric
) RETURNS jsonb
  LANGUAGE plpgsql VOLATILE
  SECURITY INVOKER
  SET search_path = public
AS $$
DECLARE
  v_old_rate numeric;
  v_affected_attendance int;
  v_overridden_skipped int;
  v_total_delta numeric;
  v_affected_settlements int;
BEGIN
  -- Lock the laborer row for the duration of the transaction
  SELECT daily_rate INTO v_old_rate
  FROM laborers
  WHERE id = p_laborer_id
  FOR UPDATE;

  IF v_old_rate IS NULL THEN
    RAISE EXCEPTION 'laborer % not found', p_laborer_id;
  END IF;

  -- Compute summary numbers up-front so we can report them after the cascade
  SELECT COUNT(*)
  INTO v_overridden_skipped
  FROM daily_attendance
  WHERE laborer_id = p_laborer_id
    AND is_deleted = false
    AND salary_override IS NOT NULL;

  SELECT COALESCE(SUM(
    COALESCE(work_days, 1) * (p_new_rate - COALESCE(daily_rate_applied, 0))
  ), 0)
  INTO v_total_delta
  FROM daily_attendance
  WHERE laborer_id = p_laborer_id
    AND is_deleted = false
    AND salary_override IS NULL;

  -- 1) Update the laborer's live rate
  UPDATE laborers
  SET daily_rate = p_new_rate,
      updated_at = NOW()
  WHERE id = p_laborer_id;

  -- 2) Cascade to all non-overridden, non-deleted attendance rows.
  --    The BEFORE UPDATE trigger recomputes daily_earnings.
  WITH updated AS (
    UPDATE daily_attendance
    SET daily_rate_applied = p_new_rate
    WHERE laborer_id = p_laborer_id
      AND is_deleted = false
      AND salary_override IS NULL
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_affected_attendance FROM updated;

  -- 3) Recompute total_amount on every non-cancelled settlement_groups
  --    whose attendance roster includes this laborer.
  WITH affected_groups AS (
    SELECT DISTINCT settlement_group_id
    FROM daily_attendance
    WHERE laborer_id = p_laborer_id
      AND is_deleted = false
      AND settlement_group_id IS NOT NULL
  )
  UPDATE settlement_groups sg
  SET total_amount = COALESCE((
        SELECT SUM(d.daily_earnings)
        FROM daily_attendance d
        WHERE d.settlement_group_id = sg.id
          AND d.is_deleted = false
      ), 0),
      updated_at = NOW()
  FROM affected_groups ag
  WHERE sg.id = ag.settlement_group_id
    AND sg.is_cancelled = false;

  GET DIAGNOSTICS v_affected_settlements = ROW_COUNT;

  RETURN jsonb_build_object(
    'old_rate',             v_old_rate,
    'new_rate',             p_new_rate,
    'affected_attendance',  COALESCE(v_affected_attendance, 0),
    'overridden_skipped',   COALESCE(v_overridden_skipped, 0),
    'affected_settlements', COALESCE(v_affected_settlements, 0),
    'cancelled_skipped',    0,
    'total_delta',          COALESCE(v_total_delta, 0)
  );
END;
$$;

COMMENT ON FUNCTION public.update_laborer_rate_cascade(uuid, numeric) IS
'Apply a laborer rate change atomically: update laborers.daily_rate, rewrite daily_attendance.daily_rate_applied for non-overridden non-deleted rows, recompute settlement_groups.total_amount for all affected non-cancelled groups. Returns same shape as preview_laborer_rate_cascade.';

GRANT EXECUTE ON FUNCTION public.update_laborer_rate_cascade(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_laborer_rate_cascade(uuid, numeric) TO service_role;
