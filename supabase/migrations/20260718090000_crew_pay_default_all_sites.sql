-- Crew weekly pay ("By laborer" view) — default ON for every site.
--
-- 20260717120000 introduced crew_pay_enabled as an opt-in flag, enabled only on
-- Padmavathy's Civil contract. Per-laborer direct pay is now the default model:
-- every top-level Civil contract with a head mesthri gets crew mode.
--
-- Part A backfills existing contracts with the same cutover as Padmavathy
-- (2026-07-12): weeks before it keep today's behavior (waterfall fills are
-- considered distributed to laborers; shortfalls still settle as lumps to the
-- mesthri), weeks on/after it are payable per-laborer at net.
--
-- Part B auto-enables FUTURE contracts via trigger, cutover = the week of
-- creation (a brand-new contract has no history to reinterpret).
--
-- Opt-out escape hatch: the trigger only fires while crew_pay_effective_from
-- IS NULL. To turn crew mode off for a contract, set crew_pay_enabled=false
-- but LEAVE crew_pay_effective_from set — the trigger will not re-enable it.

-- ---------------------------------------------------------------------------
-- Part A: backfill existing top-level Civil contracts with a mesthri.
-- ---------------------------------------------------------------------------
UPDATE public.subcontracts sc
SET crew_pay_enabled = true,
    crew_pay_effective_from = DATE '2026-07-12'
FROM public.labor_categories lc
WHERE lc.id = sc.trade_category_id
  AND lc.name = 'Civil'
  AND sc.parent_subcontract_id IS NULL
  AND sc.laborer_id IS NOT NULL
  AND sc.crew_pay_enabled = false
  AND sc.crew_pay_effective_from IS NULL
  AND sc.mesthri_commission_enabled = false  -- the two flags must never coexist
  AND sc.status IN ('draft', 'active', 'on_hold');

-- ---------------------------------------------------------------------------
-- Part B: auto-enable crew pay when a top-level Civil contract gains a mesthri.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_enable_crew_pay()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.parent_subcontract_id IS NULL
     AND NEW.laborer_id IS NOT NULL
     AND NOT NEW.crew_pay_enabled
     AND NEW.crew_pay_effective_from IS NULL      -- never explicitly configured
     AND NEW.mesthri_commission_enabled IS NOT TRUE
     AND EXISTS (
       SELECT 1 FROM public.labor_categories lc
       WHERE lc.id = NEW.trade_category_id AND lc.name = 'Civil'
     )
  THEN
    NEW.crew_pay_enabled := true;
    -- This week's Sunday (waterfall week anchor; satisfies the Sunday CHECK).
    NEW.crew_pay_effective_from :=
      CURRENT_DATE - extract(dow FROM CURRENT_DATE)::int;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.auto_enable_crew_pay() IS
  'Crew weekly pay is the default: any top-level Civil contract gaining a head mesthri gets crew_pay_enabled with cutover = its creation week. Opt-out by setting crew_pay_enabled=false while keeping crew_pay_effective_from non-NULL.';

DROP TRIGGER IF EXISTS trg_auto_enable_crew_pay ON public.subcontracts;
CREATE TRIGGER trg_auto_enable_crew_pay
  BEFORE INSERT OR UPDATE OF laborer_id ON public.subcontracts
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_enable_crew_pay();
