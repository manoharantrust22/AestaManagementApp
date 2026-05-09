-- Phase 1.1 of the material flow redesign: hard-block PO creation for site engineers.
-- Site engineers must go through the Material Request flow. Mirrors UI gate
-- (canCreatePurchaseOrders in src/lib/permissions.ts).
--
-- Existing state:
--   * allow_all_purchase_orders        -> permissive (TO authenticated USING true WITH CHECK true)
--   * allow_all_purchase_order_items   -> permissive (same)
--   * allow_select_purchase_orders     -> redundant SELECT-only policy
--
-- New state:
--   * SELECT remains open to all authenticated users.
--   * INSERT is restricted to admin/office. Updates/deletes stay open so
--     site engineers can still drive existing flows (mark-as-ordered, record
--     delivery, cancel) until a future role-rebalancing pass tightens those.
--
-- The same restriction is applied to purchase_order_items so a site engineer
-- cannot insert items directly even if a PO row were created via some other
-- path.

-- Drop both the original initial-schema policies and the blanket permissive
-- policies added by 20260111100000_fix_all_rls_policies.sql. PostgreSQL ORs
-- multiple permissive policies, so leaving any open INSERT policy in place
-- would defeat the role check below.
DROP POLICY IF EXISTS "allow_all_purchase_orders" ON "public"."purchase_orders";
DROP POLICY IF EXISTS "allow_select_purchase_orders" ON "public"."purchase_orders";
DROP POLICY IF EXISTS "allow_authenticated_select_purchase_orders" ON "public"."purchase_orders";
DROP POLICY IF EXISTS "allow_authenticated_insert_purchase_orders" ON "public"."purchase_orders";
DROP POLICY IF EXISTS "allow_authenticated_update_purchase_orders" ON "public"."purchase_orders";
DROP POLICY IF EXISTS "allow_authenticated_delete_purchase_orders" ON "public"."purchase_orders";
DROP POLICY IF EXISTS "allow_anon_select_purchase_orders" ON "public"."purchase_orders";
DROP POLICY IF EXISTS "allow_anon_insert_purchase_orders" ON "public"."purchase_orders";
DROP POLICY IF EXISTS "allow_anon_update_purchase_orders" ON "public"."purchase_orders";
DROP POLICY IF EXISTS "allow_anon_delete_purchase_orders" ON "public"."purchase_orders";

CREATE POLICY "purchase_orders_select"
  ON "public"."purchase_orders"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "purchase_orders_insert"
  ON "public"."purchase_orders"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (
    "public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'office'::"public"."user_role"])
  );

CREATE POLICY "purchase_orders_update"
  ON "public"."purchase_orders"
  FOR UPDATE
  TO "authenticated"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "purchase_orders_delete"
  ON "public"."purchase_orders"
  FOR DELETE
  TO "authenticated"
  USING (true);

DROP POLICY IF EXISTS "allow_all_purchase_order_items" ON "public"."purchase_order_items";
DROP POLICY IF EXISTS "allow_authenticated_select_purchase_order_items" ON "public"."purchase_order_items";
DROP POLICY IF EXISTS "allow_authenticated_insert_purchase_order_items" ON "public"."purchase_order_items";
DROP POLICY IF EXISTS "allow_authenticated_update_purchase_order_items" ON "public"."purchase_order_items";
DROP POLICY IF EXISTS "allow_authenticated_delete_purchase_order_items" ON "public"."purchase_order_items";
DROP POLICY IF EXISTS "allow_anon_select_purchase_order_items" ON "public"."purchase_order_items";
DROP POLICY IF EXISTS "allow_anon_insert_purchase_order_items" ON "public"."purchase_order_items";
DROP POLICY IF EXISTS "allow_anon_update_purchase_order_items" ON "public"."purchase_order_items";
DROP POLICY IF EXISTS "allow_anon_delete_purchase_order_items" ON "public"."purchase_order_items";

CREATE POLICY "purchase_order_items_select"
  ON "public"."purchase_order_items"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "purchase_order_items_insert"
  ON "public"."purchase_order_items"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (
    "public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'office'::"public"."user_role"])
  );

CREATE POLICY "purchase_order_items_update"
  ON "public"."purchase_order_items"
  FOR UPDATE
  TO "authenticated"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "purchase_order_items_delete"
  ON "public"."purchase_order_items"
  FOR DELETE
  TO "authenticated"
  USING (true);
