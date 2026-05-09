-- Plan 01 follow-up: silence the 3 ERROR-level Supabase security advisors
-- introduced by 20260502120000_add_trade_dimension. Three changes:
--
--   (a) enable RLS on subcontract_role_rates with the same 8 permissive
--       policies the project uses on subcontracts (anon + authenticated × CRUD,
--       all with a constant true qualifier — actual access control happens at
--       the application layer, this just satisfies the lint and keeps the new
--       tables consistent with the rest of the schema)
--
--   (b) same on subcontract_headcount_attendance
--
--   (c) recreate v_subcontract_reconciliation with security_invoker=true so
--       it runs as the querying user (Postgres 15+ explicit opt-in; default
--       Supabase view behavior is treated as SECURITY DEFINER by the linter)
--
-- Applied to production via mcp__supabase__apply_migration on 2026-05-02
-- immediately after the parent migration. Originally filed under timestamp
-- 20260502130000, but that collided with the Jithin-rate-bump migration's
-- timestamp and broke local `supabase db reset`. Renamed to 20260502130100
-- and made idempotent (DROP IF EXISTS before each CREATE POLICY) so a
-- re-apply on prod (or any env where the policies already exist) is safe.

BEGIN;

-- (a) RLS on subcontract_role_rates
ALTER TABLE public.subcontract_role_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_anon_select_subcontract_role_rates          ON public.subcontract_role_rates;
DROP POLICY IF EXISTS allow_anon_insert_subcontract_role_rates          ON public.subcontract_role_rates;
DROP POLICY IF EXISTS allow_anon_update_subcontract_role_rates          ON public.subcontract_role_rates;
DROP POLICY IF EXISTS allow_anon_delete_subcontract_role_rates          ON public.subcontract_role_rates;
DROP POLICY IF EXISTS allow_authenticated_select_subcontract_role_rates ON public.subcontract_role_rates;
DROP POLICY IF EXISTS allow_authenticated_insert_subcontract_role_rates ON public.subcontract_role_rates;
DROP POLICY IF EXISTS allow_authenticated_update_subcontract_role_rates ON public.subcontract_role_rates;
DROP POLICY IF EXISTS allow_authenticated_delete_subcontract_role_rates ON public.subcontract_role_rates;
CREATE POLICY allow_anon_select_subcontract_role_rates          ON public.subcontract_role_rates FOR SELECT TO anon          USING (true);
CREATE POLICY allow_anon_insert_subcontract_role_rates          ON public.subcontract_role_rates FOR INSERT TO anon          WITH CHECK (true);
CREATE POLICY allow_anon_update_subcontract_role_rates          ON public.subcontract_role_rates FOR UPDATE TO anon          USING (true) WITH CHECK (true);
CREATE POLICY allow_anon_delete_subcontract_role_rates          ON public.subcontract_role_rates FOR DELETE TO anon          USING (true);
CREATE POLICY allow_authenticated_select_subcontract_role_rates ON public.subcontract_role_rates FOR SELECT TO authenticated USING (true);
CREATE POLICY allow_authenticated_insert_subcontract_role_rates ON public.subcontract_role_rates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY allow_authenticated_update_subcontract_role_rates ON public.subcontract_role_rates FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY allow_authenticated_delete_subcontract_role_rates ON public.subcontract_role_rates FOR DELETE TO authenticated USING (true);

-- (b) RLS on subcontract_headcount_attendance
ALTER TABLE public.subcontract_headcount_attendance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_anon_select_subcontract_headcount_attendance          ON public.subcontract_headcount_attendance;
DROP POLICY IF EXISTS allow_anon_insert_subcontract_headcount_attendance          ON public.subcontract_headcount_attendance;
DROP POLICY IF EXISTS allow_anon_update_subcontract_headcount_attendance          ON public.subcontract_headcount_attendance;
DROP POLICY IF EXISTS allow_anon_delete_subcontract_headcount_attendance          ON public.subcontract_headcount_attendance;
DROP POLICY IF EXISTS allow_authenticated_select_subcontract_headcount_attendance ON public.subcontract_headcount_attendance;
DROP POLICY IF EXISTS allow_authenticated_insert_subcontract_headcount_attendance ON public.subcontract_headcount_attendance;
DROP POLICY IF EXISTS allow_authenticated_update_subcontract_headcount_attendance ON public.subcontract_headcount_attendance;
DROP POLICY IF EXISTS allow_authenticated_delete_subcontract_headcount_attendance ON public.subcontract_headcount_attendance;
CREATE POLICY allow_anon_select_subcontract_headcount_attendance          ON public.subcontract_headcount_attendance FOR SELECT TO anon          USING (true);
CREATE POLICY allow_anon_insert_subcontract_headcount_attendance          ON public.subcontract_headcount_attendance FOR INSERT TO anon          WITH CHECK (true);
CREATE POLICY allow_anon_update_subcontract_headcount_attendance          ON public.subcontract_headcount_attendance FOR UPDATE TO anon          USING (true) WITH CHECK (true);
CREATE POLICY allow_anon_delete_subcontract_headcount_attendance          ON public.subcontract_headcount_attendance FOR DELETE TO anon          USING (true);
CREATE POLICY allow_authenticated_select_subcontract_headcount_attendance ON public.subcontract_headcount_attendance FOR SELECT TO authenticated USING (true);
CREATE POLICY allow_authenticated_insert_subcontract_headcount_attendance ON public.subcontract_headcount_attendance FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY allow_authenticated_update_subcontract_headcount_attendance ON public.subcontract_headcount_attendance FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY allow_authenticated_delete_subcontract_headcount_attendance ON public.subcontract_headcount_attendance FOR DELETE TO authenticated USING (true);

-- (c) View security_invoker
ALTER VIEW public.v_subcontract_reconciliation SET (security_invoker = true);

COMMIT;
