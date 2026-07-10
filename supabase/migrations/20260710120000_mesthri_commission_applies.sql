-- Mesthri commission — per-contract "direct-pay WITHOUT commission" switch.
--
-- The "Pay each laborer directly" mode (mesthri_commission_enabled) previously always
-- deducted the per-day maistry commission. This adds a second per-contract flag so a
-- contract can pay each laborer their FULL wage directly (net = gross), with NO per-head
-- commission to the maistry — while STILL being settled inside the trade pane and kept
-- off the weekly company salary page (the is_commission_crew_day / _own_day flags are
-- intentionally left unchanged).
--
-- Default true => every existing direct-pay contract is byte-for-byte unchanged; only a
-- contract explicitly switched off loses commission.

-- ---------------------------------------------------------------------------
-- 1) The flag on both contract kinds (package precedence mirrors enabled/effective_from).
-- ---------------------------------------------------------------------------
ALTER TABLE public.task_work_packages
  ADD COLUMN IF NOT EXISTS mesthri_commission_applies boolean NOT NULL DEFAULT true;

ALTER TABLE public.subcontracts
  ADD COLUMN IF NOT EXISTS mesthri_commission_applies boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.task_work_packages.mesthri_commission_applies IS
  'When direct-pay (mesthri_commission_enabled) is on: true = deduct the per-day maistry commission; false = pay each laborer their full wage directly, no commission to the maistry. Ignored when direct-pay is off.';
COMMENT ON COLUMN public.subcontracts.mesthri_commission_applies IS
  'When direct-pay (mesthri_commission_enabled) is on: true = deduct the per-day maistry commission; false = pay each laborer their full wage directly, no commission to the maistry. Ignored when direct-pay is off.';

-- ---------------------------------------------------------------------------
-- 2) Recompute the commission view: zero commission (net = gross) when the contract
--    waives it. Column set is IDENTICAL to 20260705120100 so CREATE OR REPLACE is safe.
--    is_commission_crew_day / is_commission_mesthri_own_day are deliberately NOT gated on
--    the new flag, so these days stay settled in the pane and excluded from the weekly page.
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
  -- crew day that moves to direct-pay under the new model (UNCHANGED — not gated on
  -- commission_applies, so no-commission crew days still settle in the pane, off the week):
  ( ctx.enabled
    AND (ctx.effective_from IS NULL OR d.date >= ctx.effective_from)
    AND ctx.collector_id IS NOT NULL
    AND l.laborer_type = 'contract'
    AND d.laborer_id <> ctx.collector_id )     AS is_commission_crew_day,
  -- the mesthri's OWN day on an enabled contract (UNCHANGED, same reason):
  ( ctx.enabled
    AND (ctx.effective_from IS NULL OR d.date >= ctx.effective_from)
    AND ctx.collector_id IS NOT NULL
    AND d.laborer_id = ctx.collector_id )       AS is_commission_mesthri_own_day,
  -- live (estimate) commission + net; commission is ZERO when the contract waives it
  -- (commission_applies = false) → net = gross. Settled rows read the snapshot column instead.
  public.mesthri_commission_of(
    ( ctx.enabled
      AND (ctx.effective_from IS NULL OR d.date >= ctx.effective_from)
      AND ctx.collector_id IS NOT NULL
      AND l.laborer_type = 'contract'
      AND d.laborer_id <> ctx.collector_id
      AND ctx.commission_applies ),
    d.daily_earnings, l.commission_per_day, COALESCE(d.work_days, 1)
  )                                            AS commission_amount,
  d.daily_earnings - public.mesthri_commission_of(
    ( ctx.enabled
      AND (ctx.effective_from IS NULL OR d.date >= ctx.effective_from)
      AND ctx.collector_id IS NOT NULL
      AND l.laborer_type = 'contract'
      AND d.laborer_id <> ctx.collector_id
      AND ctx.commission_applies ),
    d.daily_earnings, l.commission_per_day, COALESCE(d.work_days, 1)
  )                                            AS net_amount
FROM public.daily_attendance d
JOIN public.laborers l ON l.id = d.laborer_id
LEFT JOIN LATERAL (
  SELECT
    -- package toggle wins when the day is attributed to a package (package precedence)
    COALESCE(twp.mesthri_commission_enabled, sc.mesthri_commission_enabled, false)        AS enabled,
    COALESCE(twp.mesthri_commission_effective_from, sc.mesthri_commission_effective_from) AS effective_from,
    COALESCE(twp.mesthri_commission_applies, sc.mesthri_commission_applies, true)         AS commission_applies,
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

-- Preserve the SECURITY INVOKER advisor fix (20260705120400) + grants across the replace.
ALTER VIEW public.v_daily_attendance_commission SET (security_invoker = true);

COMMENT ON VIEW public.v_daily_attendance_commission IS
  'Per-attendance-row commission projection: resolves the contract toggle/cutover, the contract mesthri (collector), crew/own-day flags, and the live estimate commission + net. commission_amount is zero when the contract has mesthri_commission_applies = false (direct-pay with no commission). Single source of truth reused by the ledger, salary waterfall, settle, and payable RPCs. Settled rows should read daily_attendance.mesthri_commission_amount (snapshot) instead of commission_amount here.';

GRANT SELECT ON public.v_daily_attendance_commission TO authenticated, service_role;
