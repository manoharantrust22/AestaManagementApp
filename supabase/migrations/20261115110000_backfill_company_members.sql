-- Invite-only login, Phase 1 backfill.
--
-- hasAccess (src/lib/auth/access.ts) requires every active user to belong to
-- at least one company. Give each active `users` row that has no
-- company_members row a membership in the single existing company, so the
-- new check locks nobody out.
--
-- Role mapping follows the values already in company_members:
--   users.role 'admin'                  -> 'admin'
--   users.role 'office'/'site_engineer' -> 'member'
--
-- Safe to re-run (only rows with no membership). If there is not exactly one
-- company it does nothing and says so, rather than guessing.
-- Checked on prod 2026-11-15: 0 rows to insert (5 active users, all members).

do $$
declare
  v_company_count int;
  v_company_id uuid;
  v_inserted int;
begin
  select count(*) into v_company_count from public.companies;
  if v_company_count <> 1 then
    raise notice 'backfill_company_members: % companies found, expected 1 - skipped', v_company_count;
    return;
  end if;

  select id into v_company_id from public.companies limit 1;

  insert into public.company_members (company_id, user_id, role, is_primary)
  select v_company_id,
         u.id,
         case when u.role = 'admin' then 'admin' else 'member' end,
         true
  from public.users u
  where u.status = 'active'
    and not exists (select 1 from public.company_members m where m.user_id = u.id);

  get diagnostics v_inserted = row_count;
  raise notice 'backfill_company_members: inserted % rows', v_inserted;
end $$;
