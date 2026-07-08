-- ============================================================================
-- Support for the on-page workspace toggle (Workstream D).
--
-- Turning a trade's workspace ON migrates its detailed contracts' contract-page
-- payments into Salary Settlements (see 20260708120000). Those new settlement_groups
-- + labor_payments rows would trip the existing "can't switch OFF once data exists"
-- lock (v_site_trade_workspace_usage). This adds:
--   1) v_site_trade_migration_usage — how many of a site+trade's workspace rows are
--      migration artefacts, so the lock can be reconciled: genuine = total - migration.
--   2) undo_trade_contract_payments_migration — reverse every live migration batch of a
--      site+trade (used when the user switches the workspace back OFF).
-- ============================================================================

-- 1) Migration-artefact usage, on the SAME row basis as v_site_trade_workspace_usage
--    (each migrated payment = 1 settlement_group row + 1 labor_payment row). Definer-
--    rights view (reads the definer-only journal); exposes only aggregate counts.
CREATE OR REPLACE VIEW public.v_site_trade_migration_usage AS
SELECT sc.site_id, sc.trade_category_id, count(*) AS migration_rows
FROM (
  SELECT l.subcontract_id
  FROM public.contract_payment_migration_log l
  WHERE l.undone_at IS NULL
    AND EXISTS (SELECT 1 FROM public.settlement_groups sg WHERE sg.id = l.new_settlement_group_id)
  UNION ALL
  SELECT l.subcontract_id
  FROM public.contract_payment_migration_log l
  WHERE l.undone_at IS NULL
    AND EXISTS (SELECT 1 FROM public.labor_payments lp WHERE lp.id = l.new_labor_payment_id)
) m
JOIN public.subcontracts sc ON sc.id = m.subcontract_id
WHERE sc.trade_category_id IS NOT NULL
GROUP BY sc.site_id, sc.trade_category_id;

GRANT SELECT ON public.v_site_trade_migration_usage TO authenticated, service_role;

COMMENT ON VIEW public.v_site_trade_migration_usage IS
  'Workspace rows (settlement_groups + labor_payments) created by live contract-payment migration batches, per site+trade. Subtract from v_site_trade_workspace_usage to get genuine (non-migration) usage for the workspace OFF-lock.';

-- 2) Reverse every live migration batch of a site+trade (workspace switched OFF).
CREATE OR REPLACE FUNCTION public.undo_trade_contract_payments_migration(
  p_site_id uuid, p_trade_category_id uuid
) RETURNS int   -- number of batches undone
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE b uuid; n int := 0;
BEGIN
  FOR b IN
    SELECT DISTINCT l.batch_id
    FROM contract_payment_migration_log l
    JOIN subcontracts s ON s.id = l.subcontract_id
    WHERE l.undone_at IS NULL
      AND s.site_id = p_site_id
      AND s.trade_category_id = p_trade_category_id
  LOOP
    PERFORM public.undo_contract_payments_migration(b);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.undo_trade_contract_payments_migration(uuid, uuid) TO authenticated, service_role;
