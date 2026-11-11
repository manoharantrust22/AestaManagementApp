-- Lock the anon (logged-out) role out of the public schema.
--
-- Before this migration, ~108 public tables had `allow_anon_*` policies with
-- USING (true) / WITH CHECK (true) for SELECT/INSERT/UPDATE/DELETE, every view
-- was SELECT-able by anon (and 7 views are security-definer, so they bypass RLS
-- entirely), and ~70 SECURITY DEFINER RPCs (wallet spends, settlement reversal,
-- payouts, import purge, ...) were EXECUTE-able by anon. The anon key ships in
-- every browser bundle, so anyone could read or wipe the business data without
-- logging in.
--
-- Nothing in the app talks to Postgres before login: /login, /forgot-password
-- and /reset-password only call Supabase Auth; /register-company runs after
-- sign-up (authenticated). Logged-in users use the `authenticated` role, which
-- this migration does not touch. Server routes use the service role.
--
-- Rollback (if something unexpected needed anon): re-grant the specific object,
--   grant select on public.<table> to anon;
-- and add a narrowly-scoped policy for it. Do not restore the blanket policies.

begin;

-- 1. Drop every public-schema policy that applies to anon only.
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public' and roles = '{anon}'::name[]
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- 2. Remove table/view/sequence privileges. Grants are the real gate: a
--    security-definer view ignores RLS, so only the missing grant stops anon.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- 3. SECURITY DEFINER functions bypass RLS. Remove anon/PUBLIC execute and
--    keep it for authenticated + service_role. Trigger functions are skipped
--    (EXECUTE is not checked when a trigger fires).
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.prokind = 'f'
      and p.prorettype <> 'trigger'::regtype
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e') -- skip extension-owned
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop;
end $$;

-- 4. Stop future objects created by migrations (owner postgres) from being
--    granted to anon automatically.
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon;

commit;
