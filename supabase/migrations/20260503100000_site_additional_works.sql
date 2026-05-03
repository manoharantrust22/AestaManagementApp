-- Site Additional Works (variation orders) + payment tagging + supervisor cost rollup.
-- See docs/superpowers/specs/2026-05-03-client-payments-redesign-design.md
--
-- 1. additional_work_status enum
-- 2. site_additional_works table + indexes
-- 3. updated_at trigger
-- 4. RLS policies (mirror client_payments)
-- 5. ALTER client_payments: add tagged_additional_work_id, mutex check
--    against the EXISTING payment_phase_id column (do not duplicate)
-- 6. get_site_supervisor_cost(uuid) function

-- 1. Enum -----------------------------------------------------------------
do $$ begin
  create type public.additional_work_status as enum
    ('quoted', 'confirmed', 'paid', 'cancelled');
exception when duplicate_object then null; end $$;

-- 2. Table ----------------------------------------------------------------
create table if not exists public.site_additional_works (
  id                       uuid primary key default gen_random_uuid(),
  site_id                  uuid not null references public.sites(id) on delete cascade,
  title                    varchar(255) not null,
  description              text,
  estimated_amount         numeric(15,2) not null check (estimated_amount >= 0),
  confirmed_amount         numeric(15,2) check (confirmed_amount is null or confirmed_amount >= 0),
  confirmation_date        date,
  expected_payment_date    date,
  status                   public.additional_work_status not null default 'quoted',
  quote_document_url       text,
  client_approved_by       varchar(255),
  notes                    text,
  created_by               uuid references auth.users(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists site_additional_works_site_id_idx
  on public.site_additional_works (site_id);
create index if not exists site_additional_works_status_idx
  on public.site_additional_works (status);

-- 3. updated_at trigger ---------------------------------------------------
-- Reuse the project-standard helper (defined in 00000000000000_initial_schema.sql)
-- already used by ~12 other tables. Keeps the trigger surface consistent.
drop trigger if exists update_site_additional_works_updated_at on public.site_additional_works;
create trigger update_site_additional_works_updated_at
  before update on public.site_additional_works
  for each row execute function public.update_updated_at_column();

-- 4. RLS ------------------------------------------------------------------
alter table public.site_additional_works enable row level security;

create policy "site_additional_works_select"
  on public.site_additional_works for select
  using (auth.role() = 'authenticated');

create policy "site_additional_works_insert"
  on public.site_additional_works for insert
  with check (auth.role() = 'authenticated');

create policy "site_additional_works_update"
  on public.site_additional_works for update
  using (auth.role() = 'authenticated');

create policy "site_additional_works_delete"
  on public.site_additional_works for delete
  using (auth.role() = 'authenticated');

-- 5. Tag client_payments to an additional work (mutually exclusive with the
--    EXISTING payment_phase_id column on client_payments — do NOT add a
--    second phase-tag column).
alter table public.client_payments
  add column if not exists tagged_additional_work_id uuid
    references public.site_additional_works(id) on delete set null;

alter table public.client_payments
  drop constraint if exists client_payments_tag_mutex;

alter table public.client_payments
  add constraint client_payments_tag_mutex check (
    tagged_additional_work_id is null or payment_phase_id is null
  );

create index if not exists client_payments_tagged_additional_work_idx
  on public.client_payments (tagged_additional_work_id)
  where tagged_additional_work_id is not null;

-- 6. Supervisor cost rollup ----------------------------------------------
-- Sums subcontract_payments.amount for all mesthri subcontracts on a site.
-- subcontract_payments FK is named contract_id (not subcontract_id).
-- Daily attendance wages NOT included in v1 (documented limitation).
create or replace function public.get_site_supervisor_cost(p_site_id uuid)
returns numeric
language sql
stable
security invoker
as $$
  select coalesce(sum(sp.amount), 0)::numeric
  from public.subcontract_payments sp
  join public.subcontracts s on s.id = sp.contract_id
  where s.site_id = p_site_id
    and s.contract_type = 'mesthri';
$$;

grant execute on function public.get_site_supervisor_cost(uuid) to authenticated;
