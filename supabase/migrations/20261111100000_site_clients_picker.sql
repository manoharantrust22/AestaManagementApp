-- Site client roster + client pickers.
--
-- Reuses the pre-existing (previously unused) `clients` + `site_clients`
-- tables so each site has a list of client people (owner, spouse, family
-- member who approves extras, ...) with a photo. Anywhere the app asks
-- "which client?" now picks from this per-site list instead of free text.
--
-- 1. clients.photo_url, site_clients.role
-- 2. FK columns: site_additional_works.client_approved_by_id,
--                client_payments.received_from_client_id
-- 3. Trigger: a site saved with sites.client_name gets that person on its
--    roster automatically (and edits to the name flow to the primary client)
-- 4. Backfill existing sites + link existing "approved by" text to clients
--
-- Additive only: no drops, the legacy free-text columns stay (they now hold
-- a name snapshot so old rows / exports keep reading correctly).

-- 1. Columns ----------------------------------------------------------------
alter table public.clients
  add column if not exists photo_url text;

alter table public.site_clients
  add column if not exists role varchar(60);

comment on column public.clients.photo_url is 'Public URL of the client''s photo (avatars bucket, clients/ folder)';
comment on column public.site_clients.role is 'How this person relates to the site, e.g. Owner, Wife of owner, Son';

-- 2. FK columns --------------------------------------------------------------
alter table public.site_additional_works
  add column if not exists client_approved_by_id uuid
    references public.clients(id) on delete set null;

create index if not exists site_additional_works_client_approved_by_id_idx
  on public.site_additional_works (client_approved_by_id);

alter table public.client_payments
  add column if not exists received_from_client_id uuid
    references public.clients(id) on delete set null;

create index if not exists client_payments_received_from_client_id_idx
  on public.client_payments (received_from_client_id);

-- 3. Keep sites.client_name and the roster in step -------------------------
create or replace function public.sync_site_primary_client()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_name text := nullif(btrim(new.client_name), '');
  v_old_name text := case when tg_op = 'UPDATE' then nullif(btrim(old.client_name), '') else null end;
  v_primary_client uuid;
  v_new_client uuid;
begin
  if v_name is null then
    return new;
  end if;

  if not exists (select 1 from site_clients where site_id = new.id) then
    insert into clients (name, phone, email)
    values (v_name, nullif(btrim(new.client_contact), ''), nullif(btrim(new.client_email), ''))
    returning id into v_new_client;

    insert into site_clients (site_id, client_id, is_primary_client, role)
    values (new.id, v_new_client, true, 'Owner');
    return new;
  end if;

  -- Roster already exists: if the primary client is the one the site form
  -- was describing, carry the edit across so the two don't drift.
  if tg_op = 'UPDATE' then
    select sc.client_id into v_primary_client
    from site_clients sc
    join clients c on c.id = sc.client_id
    where sc.site_id = new.id
      and sc.is_primary_client
      and (v_old_name is null or c.name = v_old_name)
    limit 1;

    if v_primary_client is not null then
      update clients
         set name  = v_name,
             phone = coalesce(nullif(btrim(new.client_contact), ''), phone),
             email = coalesce(nullif(btrim(new.client_email), ''), email)
       where id = v_primary_client;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_site_primary_client on public.sites;
create trigger sync_site_primary_client
  after insert or update of client_name, client_contact, client_email on public.sites
  for each row execute function public.sync_site_primary_client();

-- 4. Backfill -----------------------------------------------------------------
do $$
declare
  s record;
  v_client uuid;
begin
  for s in
    select id, client_name, client_contact, client_email
    from public.sites
    where nullif(btrim(client_name), '') is not null
      and not exists (select 1 from public.site_clients sc where sc.site_id = sites.id)
  loop
    insert into public.clients (name, phone, email)
    values (btrim(s.client_name), nullif(btrim(s.client_contact), ''), nullif(btrim(s.client_email), ''))
    returning id into v_client;

    insert into public.site_clients (site_id, client_id, is_primary_client, role)
    values (s.id, v_client, true, 'Owner');
  end loop;
end $$;

-- Link existing free-text approvals to the site's client when the text is
-- the start of the client's name (e.g. "Gayathri" -> "Gayathri w/o Srinivasan").
update public.site_additional_works w
   set client_approved_by_id = m.client_id
  from (
    select distinct on (w2.id) w2.id as work_id, c.id as client_id
    from public.site_additional_works w2
    join public.site_clients sc on sc.site_id = w2.site_id
    join public.clients c on c.id = sc.client_id
    where w2.client_approved_by_id is null
      and nullif(btrim(w2.client_approved_by), '') is not null
      and lower(c.name) like lower(btrim(w2.client_approved_by)) || '%'
    order by w2.id, sc.is_primary_client desc nulls last
  ) m
 where w.id = m.work_id;
