-- Migration: Revert get_salary_waterfall week boundary back to Sunday → Saturday
-- Date: 2026-05-01
-- Purpose: The 2026-04-30 alignment to ISO Mon-Sun (date_trunc('week', date))
--          contradicted how the user reasons about payroll weeks (he records
--          mesthri payments on a Sun-Sat calendar — Sunday belongs to the new
--          week, the prior Saturday closes the old one). Revert the per-week
--          bucket boundary to Sun-Sat across the whole stack.
--
-- Algorithm: Unchanged from 20260429120000. Only the week-anchoring expression
--            changes:
--              w_start = (d.date - extract(dow FROM d.date)::int)::date
--                        -- dow is 0=Sunday, 1=Monday, …, so subtracting dow
--                        -- lands on the Sunday of the same week
--              week_end = (a.w_start + 6)::date  (Sun + 6 = Sat — unchanged shape)
--
-- Companion migrations (all 2026-05-01):
--   20260501110100_revert_get_payments_ledger_to_sun_sat.sql
--   20260501110200_revert_get_salary_slice_summary_to_sun_sat.sql
--   20260501110300_backfill_payment_week_allocations_to_sun_sat.sql
--   20260501110400_align_payment_week_allocations_comments_to_sun_sat.sql

CREATE OR REPLACE FUNCTION public.get_salary_waterfall(
  p_site_id          uuid,
  p_subcontract_id   uuid    DEFAULT NULL,
  p_date_from        date    DEFAULT NULL,
  p_date_to          date    DEFAULT NULL
) RETURNS TABLE (
  week_start         date,
  week_end           date,
  days_worked        int,
  laborer_count      int,
  wages_due          numeric,
  paid               numeric,
  status             text,
  filled_by          jsonb
)
  LANGUAGE plpgsql VOLATILE
  SECURITY INVOKER
  SET search_path = public
AS $$
DECLARE
  v_week           record;
  v_settlement     record;
  v_remaining      numeric;
  v_alloc          numeric;
  v_week_due_left  numeric;
BEGIN
  CREATE TEMP TABLE _weeks ON COMMIT DROP AS
  WITH attendance_in_scope AS (
    SELECT
      (d.date - extract(dow FROM d.date)::int)::date AS w_start,
      d.laborer_id,
      d.daily_earnings
    FROM public.daily_attendance d
    JOIN public.laborers l ON l.id = d.laborer_id
    WHERE d.site_id = p_site_id
      AND d.is_deleted = false
      AND l.laborer_type = 'contract'
      AND (p_date_from IS NULL OR d.date >= p_date_from)
      AND (p_date_to   IS NULL OR d.date <= p_date_to)
      AND (p_subcontract_id IS NULL OR d.subcontract_id = p_subcontract_id)
  )
  SELECT
    a.w_start                                   AS week_start,
    (a.w_start + 6)::date                       AS week_end,
    COUNT(*)::int                                AS days_worked,
    COUNT(DISTINCT a.laborer_id)::int            AS laborer_count,
    COALESCE(SUM(a.daily_earnings), 0)::numeric  AS wages_due,
    0::numeric                                   AS paid,
    '[]'::jsonb                                  AS filled_by
  FROM attendance_in_scope a
  GROUP BY a.w_start
  ORDER BY a.w_start
  LIMIT 200;

  CREATE TEMP TABLE _settlements ON COMMIT DROP AS
  SELECT
    sg.id,
    sg.settlement_reference,
    sg.settlement_date,
    sg.total_amount::numeric AS amount
  FROM public.settlement_groups sg
  WHERE sg.site_id = p_site_id
    AND sg.is_cancelled = false
    AND sg.settlement_date IS NOT NULL
    AND sg.payment_type = 'salary'
    AND (p_date_from IS NULL OR sg.settlement_date >= p_date_from)
    AND (p_date_to   IS NULL OR sg.settlement_date <= p_date_to)
    AND (p_subcontract_id IS NULL OR sg.subcontract_id = p_subcontract_id)
    AND EXISTS (
      SELECT 1 FROM public.labor_payments lp
      WHERE lp.settlement_group_id = sg.id
        AND lp.is_under_contract = true
    )
  ORDER BY sg.settlement_date ASC, sg.id ASC;

  -- Walk settlements in order, allocate to weeks in order. Each filled_by
  -- entry embeds the gross settlement amount (added 2026-04-29) alongside
  -- the per-week slice so the UI can render carry-forward context.
  FOR v_settlement IN SELECT * FROM _settlements LOOP
    v_remaining := v_settlement.amount;

    FOR v_week IN SELECT * FROM _weeks w ORDER BY w.week_start LOOP
      EXIT WHEN v_remaining <= 0;

      v_week_due_left := v_week.wages_due - v_week.paid;
      IF v_week_due_left <= 0 THEN
        CONTINUE;
      END IF;

      v_alloc := LEAST(v_remaining, v_week_due_left);

      UPDATE _weeks w
        SET paid = w.paid + v_alloc,
            filled_by = w.filled_by || jsonb_build_array(jsonb_build_object(
              'ref',          v_settlement.settlement_reference,
              'amount',       v_alloc,
              'gross_amount', v_settlement.amount,
              'settled_at',   v_settlement.settlement_date
            ))
      WHERE w.week_start = v_week.week_start;

      v_remaining := v_remaining - v_alloc;
    END LOOP;
  END LOOP;

  RETURN QUERY
  SELECT
    w.week_start,
    w.week_end,
    w.days_worked,
    w.laborer_count,
    w.wages_due,
    w.paid,
    CASE
      WHEN w.paid = 0                       THEN 'pending'
      WHEN w.paid >= w.wages_due            THEN 'settled'
      ELSE                                       'underpaid'
    END AS status,
    w.filled_by
  FROM _weeks w
  ORDER BY w.week_start;
END;
$$;

COMMENT ON FUNCTION public.get_salary_waterfall(uuid, uuid, date, date) IS
'Per-week wages_due (sum of daily_earnings for contract laborers, bucketed Sunday → Saturday) plus waterfall-allocated paid (oldest week first; per-week paid invariant <= wages_due). filled_by entries include gross_amount alongside per-week amount. Discriminator: settlement_groups.payment_type=''salary'' AND contract-linked labor_payments. Capped at 200 weeks. Reverted to Sun-Sat on 2026-05-01 (was ISO Mon-Sun 2026-04-30 → 2026-05-01).';
