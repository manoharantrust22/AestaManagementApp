-- Crew weekly pay (Salary Settlements "By laborer" view) — Part 1: config columns.
--
-- crew_pay_enabled turns on PER-LABORER weekly pay for a site's Civil salary slice:
-- laborers are shown/paid NET of the mesthri's commission (laborers.commission_per_day
-- × work_days, the mesthri_commission_of formula), the mesthri earns own wages +
-- commission, and — from crew_pay_effective_from onward — UNTARGETED pool money
-- (historic lump payments to the mesthri, carried-forward excess) counts toward the
-- MESTHRI ONLY (own wages first, then commission). Laborers stay owed until an
-- explicit per-laborer payment.
--
-- DISTINCT from mesthri_commission_enabled: that flag routes a contract's days OFF
-- the weekly waterfall into the contract-page direct-pay pane (20260707130000).
-- crew_pay_enabled keeps days ON the weekly waterfall and only changes how the pool
-- fills them. The two must never be conflated; a contract should not have both.
--
-- crew_pay_effective_from must be a Sunday (the waterfall's week anchor) so no week
-- straddles the cutover. Weeks BEFORE the cutover are "considered paid via the
-- waterfall" (display-only reinterpretation; no live payable arises from them).

ALTER TABLE public.subcontracts
  ADD COLUMN IF NOT EXISTS crew_pay_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS crew_pay_effective_from date NULL;

ALTER TABLE public.subcontracts
  DROP CONSTRAINT IF EXISTS subcontracts_crew_pay_cutover_chk;
ALTER TABLE public.subcontracts
  ADD CONSTRAINT subcontracts_crew_pay_cutover_chk CHECK (
    NOT crew_pay_enabled
    OR (crew_pay_effective_from IS NOT NULL
        AND extract(dow FROM crew_pay_effective_from) = 0)
  );

COMMENT ON COLUMN public.subcontracts.crew_pay_enabled IS
  'Per-laborer weekly pay for the Civil salary slice (Salary Settlements "By laborer" view). Keeps days ON the weekly waterfall — unlike mesthri_commission_enabled, which routes days into the contract-page direct-pay pane.';
COMMENT ON COLUMN public.subcontracts.crew_pay_effective_from IS
  'Sunday-aligned cutover. Weeks before it: waterfall fills are considered distributed to laborers. Weeks on/after it: untargeted pool money counts toward the mesthri only; laborers are paid per-laborer.';

-- ---------------------------------------------------------------------------
-- The single definition of "the crew config for a site", reused by every money
-- RPC (waterfall, slice summary, crew ledger, laborer clamps, payout console).
-- At most one crew contract per site: the top-level Civil parent with a head
-- mesthri. Returns no row when the site has no crew-enabled contract — every
-- caller must reduce to its pre-crew behavior in that case.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crew_pay_config(p_site_id uuid)
RETURNS TABLE (subcontract_id uuid, mesthri_id uuid, effective_from date)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT sc.id, sc.laborer_id, sc.crew_pay_effective_from
  FROM public.subcontracts sc
  JOIN public.labor_categories lc ON lc.id = sc.trade_category_id
  WHERE sc.site_id = p_site_id
    AND sc.crew_pay_enabled = true
    AND sc.parent_subcontract_id IS NULL
    AND lc.name = 'Civil'
    AND sc.laborer_id IS NOT NULL
    AND sc.crew_pay_effective_from IS NOT NULL
  ORDER BY sc.created_at
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.crew_pay_config(uuid) IS
  'The site''s crew-weekly-pay config (top-level Civil parent with a head mesthri, crew_pay_enabled). No row = crew mode off; callers must behave exactly as before crew mode existed.';

GRANT EXECUTE ON FUNCTION public.crew_pay_config(uuid) TO authenticated, service_role;
