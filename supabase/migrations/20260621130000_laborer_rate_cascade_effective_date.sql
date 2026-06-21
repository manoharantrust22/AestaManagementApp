-- Migration: effective-dated laborer rate cascade
--
-- Purpose:
--   Extend the rate-cascade RPCs (20260501100000_laborer_rate_cascade.sql) with an
--   optional p_effective_from date so a rate change can apply only FROM a chosen date
--   forward, leaving earlier days at their old snapshotted rate. This supports the
--   real-world case where a laborer's pay is renegotiated "from certain days" (a
--   returning worker resuming at a new rate, a mid-engagement raise/cut) without
--   retroactively rewriting their entire history.
--
--   - p_effective_from IS NULL  -> unchanged whole-history behaviour.
--   - p_effective_from = a date -> only touch daily_attendance rows with
--                                  date >= p_effective_from (still is_deleted=false
--                                  AND salary_override IS NULL).
--
--   laborers.daily_rate is ALWAYS set to p_new_rate (date-scope only bounds the
--   historical rewrite) so future attendance marks snapshot the new rate. The
--   returned jsonb shape is identical to the prior 2-arg version.
--
--   Manual per-day overrides (salary_override IS NOT NULL) are preserved.
--   Cancelled settlement_groups are skipped — they're financially voided.
--
-- Note: the prior 2-arg signatures are dropped first. Adding a 3rd parameter with a
-- DEFAULT would otherwise make a 2-arg call ambiguous between (uuid,numeric) and
-- (uuid,numeric,date). Only laborerService.ts calls these (by named params).

DROP FUNCTION IF EXISTS public.preview_laborer_rate_cascade(uuid, numeric);
DROP FUNCTION IF EXISTS public.update_laborer_rate_cascade(uuid, numeric);

-- ============================================================
-- preview_laborer_rate_cascade
-- ============================================================
CREATE OR REPLACE FUNCTION public.preview_laborer_rate_cascade(
  p_laborer_id uuid,
  p_new_rate numeric,
  p_effective_from date DEFAULT NULL
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
    AND is_deleted = false
    AND (p_effective_from IS NULL OR date >= p_effective_from);

  WITH affected_groups AS (
    SELECT DISTINCT d.settlement_group_id
    FROM daily_attendance d
    WHERE d.laborer_id = p_laborer_id
      AND d.is_deleted = false
      AND d.settlement_group_id IS NOT NULL
      AND d.salary_override IS NULL
      AND (p_effective_from IS NULL OR d.date >= p_effective_from)
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

COMMENT ON FUNCTION public.preview_laborer_rate_cascade(uuid, numeric, date) IS
'Read-only preview of update_laborer_rate_cascade impact. p_effective_from NULL = whole history; a date restricts impact to attendance on/after that date. Returns counts of affected attendance rows, settlements, skipped overrides and cancelled settlements, and the net wage delta.';

GRANT EXECUTE ON FUNCTION public.preview_laborer_rate_cascade(uuid, numeric, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_laborer_rate_cascade(uuid, numeric, date) TO service_role;


-- ============================================================
-- update_laborer_rate_cascade
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_laborer_rate_cascade(
  p_laborer_id uuid,
  p_new_rate numeric,
  p_effective_from date DEFAULT NULL
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

  -- Compute summary numbers up-front so we can report them after the cascade.
  -- Both respect the optional date bound.
  SELECT COUNT(*)
  INTO v_overridden_skipped
  FROM daily_attendance
  WHERE laborer_id = p_laborer_id
    AND is_deleted = false
    AND salary_override IS NOT NULL
    AND (p_effective_from IS NULL OR date >= p_effective_from);

  SELECT COALESCE(SUM(
    COALESCE(work_days, 1) * (p_new_rate - COALESCE(daily_rate_applied, 0))
  ), 0)
  INTO v_total_delta
  FROM daily_attendance
  WHERE laborer_id = p_laborer_id
    AND is_deleted = false
    AND salary_override IS NULL
    AND (p_effective_from IS NULL OR date >= p_effective_from);

  -- 1) Update the laborer's live rate (always whole-rate, not date-scoped, so
  --    future attendance marks snapshot the new value).
  UPDATE laborers
  SET daily_rate = p_new_rate,
      updated_at = NOW()
  WHERE id = p_laborer_id;

  -- 2) Cascade to in-range, non-overridden, non-deleted attendance rows.
  --    The BEFORE UPDATE trigger recomputes daily_earnings.
  WITH updated AS (
    UPDATE daily_attendance
    SET daily_rate_applied = p_new_rate
    WHERE laborer_id = p_laborer_id
      AND is_deleted = false
      AND salary_override IS NULL
      AND (p_effective_from IS NULL OR date >= p_effective_from)
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_affected_attendance FROM updated;

  -- 3) Recompute total_amount on every non-cancelled settlement_groups that
  --    holds an in-range, non-overridden row for this laborer. The sum spans ALL
  --    non-deleted member rows, so groups straddling the cutoff stay correct
  --    (earlier rows keep old earnings, on/after rows carry the new ones).
  WITH affected_groups AS (
    SELECT DISTINCT settlement_group_id
    FROM daily_attendance
    WHERE laborer_id = p_laborer_id
      AND is_deleted = false
      AND settlement_group_id IS NOT NULL
      AND salary_override IS NULL
      AND (p_effective_from IS NULL OR date >= p_effective_from)
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

COMMENT ON FUNCTION public.update_laborer_rate_cascade(uuid, numeric, date) IS
'Apply a laborer rate change atomically. p_effective_from NULL = whole history; a date restricts the daily_rate_applied rewrite to attendance on/after that date (earlier days keep their old snapshot). Always sets laborers.daily_rate := p_new_rate, recomputes settlement_groups.total_amount for affected non-cancelled groups. Returns same shape as preview_laborer_rate_cascade.';

GRANT EXECUTE ON FUNCTION public.update_laborer_rate_cascade(uuid, numeric, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_laborer_rate_cascade(uuid, numeric, date) TO service_role;
