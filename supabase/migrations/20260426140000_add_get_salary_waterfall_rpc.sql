-- Migration: Add get_salary_waterfall RPC
-- Purpose: Per-week wages_due (from contract laborer attendance) + waterfall-
--          allocated paid (from settlement_groups with payment_type='salary'
--          and contract-linked labor_payments) + filled_by JSON array of
--          contributing settlement refs and amounts.
--
-- Algorithm: Lifted from the deleted ContractWeeklyPaymentsTab.tsx (commit
--            459a2c7 lines 495-595). Sort weeks oldest-first, sort settlements
--            oldest-first (tiebreak by id), allocate min(remaining, week_due)
--            per week. Per-week paid is invariant <= wages_due — aggregate
--            future_credit lives in get_salary_slice_summary, not here.
--
-- Discriminator: settlement_groups.payment_type = 'salary' identifies the
--                contract-payment stream. Combined with the existence of
--                a labor_payments row with is_under_contract=true to filter
--                out orphaned salary settlements (~26 in production reference
--                data) that would otherwise distort the waterfall.
--
-- Tiebreak: settlement_groups with the same settlement_date are ordered by id
--           so allocation is deterministic across runs.
--
-- Cap: 200 weeks (LIMIT 200 on the wages CTE).
--
-- Validation: Read-only inlined CTE was used to verify the algorithm against
--             production data for site Srinivasan House & Shop, weeks
--             2026-03-30 / 2026-04-06 / 2026-04-20:
--               wages_due:     33400 / 24800 / 23800 = 82000
--               settlements:   9 contract-linked, totalling 73000
--               waterfall:     33400 / 24800 / 14800 = 73000
--               status:        settled / settled / underpaid (62%)
--               mestri_owed:   9000

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
  LANGUAGE plpgsql STABLE
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
  -- Per-week wages_due from contract-laborer attendance, scoped optionally
  -- to a single subcontract.
  CREATE TEMP TABLE _weeks ON COMMIT DROP AS
  WITH attendance_in_scope AS (
    SELECT
      date_trunc('week', d.date)::date AS week_start,
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
    week_start,
    (week_start + 6)::date                    AS week_end,
    COUNT(*)::int                              AS days_worked,
    COUNT(DISTINCT laborer_id)::int            AS laborer_count,
    COALESCE(SUM(daily_earnings), 0)::numeric  AS wages_due,
    0::numeric                                 AS paid,
    '[]'::jsonb                                AS filled_by
  FROM attendance_in_scope
  GROUP BY week_start
  ORDER BY week_start
  LIMIT 200;

  -- Contract-linked settlements in scope, ordered oldest-first with id tiebreak.
  -- Filter: payment_type='salary' (the salary stream) AND has at least one
  -- contract-linked labor_payment (is_under_contract=true) — excludes the
  -- orphaned salary settlements that have no labor_payments at all.
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

  -- Walk settlements in order, allocate to weeks in order.
  FOR v_settlement IN SELECT * FROM _settlements LOOP
    v_remaining := v_settlement.amount;

    FOR v_week IN SELECT * FROM _weeks ORDER BY week_start LOOP
      EXIT WHEN v_remaining <= 0;

      v_week_due_left := v_week.wages_due - v_week.paid;
      IF v_week_due_left <= 0 THEN
        CONTINUE;
      END IF;

      v_alloc := LEAST(v_remaining, v_week_due_left);

      UPDATE _weeks
        SET paid = paid + v_alloc,
            filled_by = filled_by || jsonb_build_array(jsonb_build_object(
              'ref',         v_settlement.settlement_reference,
              'amount',      v_alloc,
              'settled_at',  v_settlement.settlement_date
            ))
      WHERE _weeks.week_start = v_week.week_start;

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
'Per-week wages_due (sum of daily_earnings for contract laborers) plus waterfall-allocated paid (oldest week first; per-week paid invariant <= wages_due). Discriminator: settlement_groups.payment_type=''salary'' AND contract-linked labor_payments. Aggregate future_credit lives in get_salary_slice_summary. Capped at 200 weeks.';

GRANT EXECUTE ON FUNCTION public.get_salary_waterfall(uuid, uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_salary_waterfall(uuid, uuid, date, date) TO service_role;
