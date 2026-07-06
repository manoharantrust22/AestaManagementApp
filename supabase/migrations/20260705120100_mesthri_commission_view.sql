-- Mesthri commission — Part A, Migration B: computation view + scalar helper.
--
-- Single source of truth for the commission math, consumed by the ledger RPC (Part A),
-- the salary waterfall/slice RPCs, the settle write path, and the payable RPC (Part B).
-- A generated column can't be used because the commission depends on OTHER tables
-- (the contract toggle, the resolved collector, self-exclusion), so we use a view for
-- live computation + a per-day snapshot column (written at settle time) for locked money.
--
-- Commission basis = daily_attendance.work_days (the SAME fraction that computes
-- daily_earnings = work_days × daily_rate_applied). Full work-day → full rate; half → half.
-- Floored at daily_earnings so commission can never exceed the day's pay (net ≥ 0).

-- ---------------------------------------------------------------------------
-- Scalar helper: the ₹ commission for one day (0 when not a commission crew day).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mesthri_commission_of(
  p_is_crew boolean,
  p_daily_earnings numeric,
  p_rate numeric,
  p_work_days numeric
) RETURNS numeric
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_is_crew
      THEN LEAST(COALESCE(p_daily_earnings, 0), COALESCE(p_rate, 0) * COALESCE(p_work_days, 1))
    ELSE 0
  END;
$$;

COMMENT ON FUNCTION public.mesthri_commission_of(boolean, numeric, numeric, numeric) IS
  'Mesthri commission for one attendance day: crew day → LEAST(daily_earnings, rate × work_days), else 0. Floored so commission never exceeds the day''s pay.';

GRANT EXECUTE ON FUNCTION public.mesthri_commission_of(boolean, numeric, numeric, numeric)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Per-row projection: resolves the contract toggle + collector + crew/own flags,
-- and precomputes the live (estimate) commission + net for each attendance row.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_daily_attendance_commission AS
SELECT
  d.id                                         AS attendance_id,
  d.site_id,
  d.date,
  d.laborer_id,
  l.laborer_type,
  d.subcontract_id,
  d.task_work_package_id,
  d.daily_earnings,
  COALESCE(d.work_days, 1)::numeric            AS work_days_eff,
  l.commission_per_day,
  ctx.enabled,
  ctx.effective_from,
  ctx.collector_id,
  -- crew day that moves to direct-pay (net) under the new model:
  ( ctx.enabled
    AND (ctx.effective_from IS NULL OR d.date >= ctx.effective_from)
    AND ctx.collector_id IS NOT NULL
    AND l.laborer_type = 'contract'
    AND d.laborer_id <> ctx.collector_id )     AS is_commission_crew_day,
  -- the mesthri's OWN day on an enabled contract (settles GROSS in the company week):
  ( ctx.enabled
    AND (ctx.effective_from IS NULL OR d.date >= ctx.effective_from)
    AND ctx.collector_id IS NOT NULL
    AND d.laborer_id = ctx.collector_id )       AS is_commission_mesthri_own_day,
  -- live (estimate) commission + net; settled rows read the snapshot column instead.
  public.mesthri_commission_of(
    ( ctx.enabled
      AND (ctx.effective_from IS NULL OR d.date >= ctx.effective_from)
      AND ctx.collector_id IS NOT NULL
      AND l.laborer_type = 'contract'
      AND d.laborer_id <> ctx.collector_id ),
    d.daily_earnings, l.commission_per_day, COALESCE(d.work_days, 1)
  )                                            AS commission_amount,
  d.daily_earnings - public.mesthri_commission_of(
    ( ctx.enabled
      AND (ctx.effective_from IS NULL OR d.date >= ctx.effective_from)
      AND ctx.collector_id IS NOT NULL
      AND l.laborer_type = 'contract'
      AND d.laborer_id <> ctx.collector_id ),
    d.daily_earnings, l.commission_per_day, COALESCE(d.work_days, 1)
  )                                            AS net_amount
FROM public.daily_attendance d
JOIN public.laborers l ON l.id = d.laborer_id
LEFT JOIN LATERAL (
  SELECT
    -- package toggle wins when the day is attributed to a package (package precedence)
    COALESCE(twp.mesthri_commission_enabled, sc.mesthri_commission_enabled, false)        AS enabled,
    COALESCE(twp.mesthri_commission_effective_from, sc.mesthri_commission_effective_from) AS effective_from,
    CASE
      WHEN d.task_work_package_id IS NOT NULL THEN twp.maistry_laborer_id
      WHEN d.subcontract_id IS NOT NULL THEN
        CASE sc.contract_type
          WHEN 'mesthri'    THEN tm.leader_laborer_id
          WHEN 'specialist' THEN sc.laborer_id
          ELSE NULL                       -- day_work: external gang, no laborer collector
        END
      ELSE NULL
    END AS collector_id
  FROM (SELECT 1) _
  LEFT JOIN public.task_work_packages twp ON twp.id = d.task_work_package_id
  LEFT JOIN public.subcontracts sc        ON sc.id  = d.subcontract_id
  LEFT JOIN public.teams tm               ON tm.id  = sc.team_id
) ctx ON true;

COMMENT ON VIEW public.v_daily_attendance_commission IS
  'Per-attendance-row commission projection: resolves the contract toggle/cutover, the contract mesthri (collector), crew/own-day flags, and the live estimate commission + net. Single source of truth reused by the ledger, salary waterfall, settle, and payable RPCs. Settled rows should read daily_attendance.mesthri_commission_amount (snapshot) instead of commission_amount here.';

GRANT SELECT ON public.v_daily_attendance_commission TO authenticated, service_role;
