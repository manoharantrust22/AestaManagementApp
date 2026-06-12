-- Let site engineers complete material/PO settlements.
--
-- PROBLEM: completing a vendor/material settlement INSERTs a
-- material_purchase_expenses row with purchase_type 'own_site' or 'group_stock'
-- (e.g. the Hub "settle" / "Complete bulk settlement" flows do a direct client
-- insert). The current INSERT policy only allows a site_engineer to insert when
-- purchase_type = 'spot' AND payment_channel = 'engineer_wallet', so any non-spot
-- settlement by a site engineer fails with
--   "new row violates row-level security policy for table material_purchase_expenses".
-- Admin/office are exempt, so it works for them but not for site engineers
-- (observed: Ajith Kumar, assigned to Padmavathy + Srinivasan).
--
-- FIX: align the INSERT policy with the UPDATE/DELETE policies, which already
-- trust a site engineer for any row on a site they can access
-- (USING/ WITH CHECK can_access_site(site_id)). Inserting an expense for an
-- accessible site grants no more power than updating one, which is already
-- allowed. Historical backfill (is_historical = true) stays admin/office only.

DROP POLICY IF EXISTS material_purchase_expenses_insert ON public.material_purchase_expenses;

CREATE POLICY material_purchase_expenses_insert
ON public.material_purchase_expenses
FOR INSERT
WITH CHECK (
  (get_user_role() = ANY (ARRAY['admin'::user_role, 'office'::user_role]))
  OR (
    get_user_role() = 'site_engineer'::user_role
    AND is_historical = false
    AND can_access_site(site_id)
  )
);
