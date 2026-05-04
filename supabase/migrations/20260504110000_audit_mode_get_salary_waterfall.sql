-- Audit-mode update: get_salary_waterfall — sealed allocation pools per period.
--
-- Companion to 20260504100000_add_site_audit_lifecycle.sql.
--
-- Behavior:
--   Site is 'none'      → unchanged from 20260501120000 (Sun-Sat baseline).
--   Site is 'auditing'  → each contract week is tagged period = 'legacy' if
--                         week_start < data_started_at, else 'current'. Each
--                         settlement is tagged the same way by settlement_date.
--                         Allocation only fires when settlement.period =
--                         week.period — sealed pools.
--   Site is 'reconciled'→ gating off (treated like 'none'), but is_archived =
--                         false filters applied so a Mode B roll-up reconcile
--                         hides its archived legacy rows.
--
-- New parameter: p_period text DEFAULT 'all' — 'all' | 'legacy' | 'current'.
--   For non-auditing sites, p_period is ignored (treated as 'all').
--   For auditing sites:
--     - 'all'      → both bands returned, but allocation still sealed
--     - 'legacy'   → only legacy weeks (week_start < data_started_at) returned
--     - 'current'  → only current weeks (week_start >= data_started_at) returned
--
-- New return column: period text — 'legacy' or 'current' on every row.
--
-- Week period rule: a week's period is determined by its week_start.
--   week_start  >= data_started_at  → 'current'
--   week_start  <  data_started_at  → 'legacy'
-- A week that straddles the cutoff (e.g. week starting Sun Nov 9 when cutoff
-- is Sat Nov 15) is therefore classified by its anchor day. In practice the
-- cutoff is chosen to fall on a Sun-Sat boundary or on/very-near the launch
-- day, so straddling is an edge case the user already accepts.

DROP FUNCTION IF EXISTS public.get_salary_waterfall(uuid, uuid, date, date);
DROP FUNCTION IF EXISTS public.get_salary_waterfall(uuid, uuid, date, date, text);

CREATE OR REPLACE FUNCTION public.get_salary_waterfall(
  p_site_id          uuid,
  p_subcontract_id   uuid    DEFAULT NULL,
  p_date_from        date    DEFAULT NULL,
  p_date_to          date    DEFAULT NULL,
  p_period           text    DEFAULT 'all'
) RETURNS TABLE (
  week_start         date,
  week_end           date,
  days_worked        int,
  laborer_count      int,
  wages_due          numeric,
  paid               numeric,
  status             text,
  filled_by          jsonb,
  period             text
)
  LANGUAGE plpgsql VOLATILE
  SECURITY INVOKER
  SET search_path = public
AS $$
DECLARE
  v_legacy_status   text;
  v_data_started_at date;
  v_legacy_active   boolean;
  v_period          text;
  v_week            record;
  v_settlement      record;
  v_remaining       numeric;
  v_alloc           numeric;
  v_week_due_left   numeric;
BEGIN
  -- Resolve site lifecycle once.
  SELECT s.legacy_status, s.data_started_at
    INTO v_legacy_status, v_data_started_at
    FROM public.sites s
   WHERE s.id = p_site_id;

  v_legacy_active := (v_legacy_status = 'auditing' AND v_data_started_at IS NOT NULL);

  -- Non-auditing sites ignore p_period entirely.
  IF NOT v_legacy_active THEN
    v_period := 'all';
  ELSE
    IF p_period NOT IN ('all', 'legacy', 'current') THEN
      RAISE EXCEPTION 'get_salary_waterfall: invalid p_period %', p_period;
    END IF;
    v_period := p_period;
  END IF;

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
      AND d.is_archived = false
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
    '[]'::jsonb                                  AS filled_by,
    CASE
      WHEN v_legacy_active AND a.w_start < v_data_started_at THEN 'legacy'
      ELSE 'current'
    END                                          AS period
  FROM attendance_in_scope a
  GROUP BY a.w_start
  ORDER BY a.w_start
  LIMIT 200;

  CREATE TEMP TABLE _settlements ON COMMIT DROP AS
  SELECT
    sg.id,
    sg.settlement_reference,
    sg.settlement_date,
    sg.total_amount::numeric AS amount,
    CASE
      WHEN v_legacy_active AND sg.settlement_date < v_data_started_at THEN 'legacy'
      ELSE 'current'
    END AS period
  FROM public.settlement_groups sg
  WHERE sg.site_id = p_site_id
    AND sg.is_cancelled = false
    AND sg.is_archived  = false
    AND sg.settlement_date IS NOT NULL
    AND sg.payment_type = 'salary'
    AND (p_date_from IS NULL OR sg.settlement_date >= p_date_from)
    AND (p_date_to   IS NULL OR sg.settlement_date <= p_date_to)
    AND (p_subcontract_id IS NULL OR sg.subcontract_id = p_subcontract_id)
    AND EXISTS (
      SELECT 1 FROM public.labor_payments lp
      WHERE lp.settlement_group_id = sg.id
        AND lp.is_under_contract   = true
        AND lp.is_archived         = false
    )
  ORDER BY sg.settlement_date ASC, sg.id ASC;

  -- Walk settlements in order; for each settlement, allocate only to weeks
  -- in the SAME period (sealed pools). Non-auditing sites have everything
  -- tagged 'current' so the period match is always true.
  FOR v_settlement IN SELECT * FROM _settlements LOOP
    v_remaining := v_settlement.amount;

    FOR v_week IN
      SELECT *
        FROM _weeks w
       WHERE w.period = v_settlement.period
       ORDER BY w.week_start
    LOOP
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
      WHEN w.paid = 0            THEN 'pending'
      WHEN w.paid >= w.wages_due THEN 'settled'
      ELSE                            'underpaid'
    END AS status,
    w.filled_by,
    w.period
  FROM _weeks w
  WHERE v_period = 'all'
     OR w.period = v_period
  ORDER BY w.week_start;
END;
$$;

COMMENT ON FUNCTION public.get_salary_waterfall(uuid, uuid, date, date, text) IS
'Per-week wages_due (Sunday→Saturday buckets, contract laborers) with waterfall-allocated paid. Returns a period column (legacy/current) for sites with legacy_status=auditing; allocation is sealed per period. p_period filters output rows. is_archived=false on attendance/settlements/labor_payments to honor Mode B reconcile soft-archive.';

GRANT EXECUTE ON FUNCTION public.get_salary_waterfall(uuid, uuid, date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_salary_waterfall(uuid, uuid, date, date, text) TO service_role;
