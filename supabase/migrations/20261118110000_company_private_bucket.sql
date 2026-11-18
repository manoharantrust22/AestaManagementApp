-- Private per-company storage (authorised signatory signature, and similar
-- files that must never be publicly downloadable).
--
-- Objects live under "<company_id>/..." and are visible only to signed-in
-- members of that company (get_user_companies()). The bucket is NOT public:
-- files are read with the authenticated storage API, never a public URL.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('company-private', 'company-private', false, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.is_own_company_path(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_folder text := split_part(p_name, '/', 1);
begin
  if v_folder !~ '^[0-9a-fA-F-]{36}$' then
    return false;
  end if;
  return v_folder::uuid = any(public.get_user_companies());
end;
$$;

grant execute on function public.is_own_company_path(text) to authenticated;

drop policy if exists company_private_obj_select on storage.objects;
create policy company_private_obj_select on storage.objects
  for select to authenticated
  using (bucket_id = 'company-private' and public.is_own_company_path(name));

drop policy if exists company_private_obj_insert on storage.objects;
create policy company_private_obj_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'company-private' and public.is_own_company_path(name));

drop policy if exists company_private_obj_update on storage.objects;
create policy company_private_obj_update on storage.objects
  for update to authenticated
  using (bucket_id = 'company-private' and public.is_own_company_path(name));

drop policy if exists company_private_obj_delete on storage.objects;
create policy company_private_obj_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'company-private' and public.is_own_company_path(name));
