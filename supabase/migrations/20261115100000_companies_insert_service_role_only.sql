-- Invite-only login, Phase 0c: no signed-in user may create a company directly.
--
-- `create_company` (made in Studio) allowed INSERT on companies for every
-- authenticated user (WITH CHECK true), so anyone with a session could create
-- companies through the REST API regardless of what the UI shows. Companies
-- are now created only by POST /api/admin/companies, which checks for an
-- active admin and writes with the service role (which bypasses RLS).
--
-- With no INSERT policy left, RLS refuses INSERT for anon/authenticated.
-- No data is touched.

drop policy if exists create_company on public.companies;
