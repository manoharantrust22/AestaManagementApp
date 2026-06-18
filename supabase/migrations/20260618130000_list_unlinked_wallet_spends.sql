-- List ORPHAN wallet spends for a scope (engineer(s) + optional site).
--
-- WHY: a wallet spend not linked to any expense/settlement is a red flag (e.g. the
-- duplicate-reference bug's phantom debits). There was no way to surface these at a
-- glance — linkage for non-salary spends lives on the SOURCE table
-- (…​.engineer_transaction_id), not on the transaction row, so the ledger query can't
-- tell. This read-only helper returns the (rare) unlinked spend rows so the UI can
-- badge them and offer a "show only unlinked" filter.
--
-- Mirrors get_wallet_spend_source's linkage checks: salary via settlement_group_id,
-- and material/misc/rental/tea via each source table's engineer_transaction_id.

CREATE OR REPLACE FUNCTION public.list_unlinked_wallet_spends(
  p_user_ids uuid[],
  p_site_id  uuid DEFAULT NULL
)
RETURNS SETOF site_engineer_transactions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT t.*
  FROM site_engineer_transactions t
  WHERE t.user_id = ANY(p_user_ids)
    AND t.transaction_type = 'spend'
    AND t.cancelled_at IS NULL
    AND (p_site_id IS NULL OR t.site_id = p_site_id)
    AND t.settlement_group_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM material_purchase_expenses x WHERE x.engineer_transaction_id = t.id)
    AND NOT EXISTS (SELECT 1 FROM misc_expenses x          WHERE x.engineer_transaction_id = t.id)
    AND NOT EXISTS (SELECT 1 FROM rental_advances x        WHERE x.engineer_transaction_id = t.id)
    AND NOT EXISTS (SELECT 1 FROM rental_settlements x     WHERE x.engineer_transaction_id = t.id)
    AND NOT EXISTS (SELECT 1 FROM tea_shop_settlements x   WHERE x.site_engineer_transaction_id = t.id)
  ORDER BY t.transaction_date DESC, t.id DESC;
$function$;

GRANT EXECUTE ON FUNCTION public.list_unlinked_wallet_spends(uuid[], uuid) TO authenticated;

COMMENT ON FUNCTION public.list_unlinked_wallet_spends(uuid[], uuid) IS
  'Read-only: returns wallet SPEND rows for the given engineer ids (optionally one site) that are not linked to any salary/material/misc/rental/tea source — i.e. orphan/phantom debits. Powers the "Not linked" badge and the "show only unlinked" ledger filter.';
