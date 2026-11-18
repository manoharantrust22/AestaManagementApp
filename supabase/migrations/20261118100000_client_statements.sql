-- Client Statements of Account
--
-- Every time a statement is shared with (or downloaded for) a client from
-- /site/client-payments we keep a numbered snapshot of exactly what the
-- client was shown. This answers "what did we send them, and when?" and lets
-- the page flag when payments/extras changed after the last statement.
--
-- Additive only: new table + RLS. No changes to existing tables.

create table if not exists public.client_statements (
  id                uuid primary key default gen_random_uuid(),
  site_id           uuid not null references public.sites(id) on delete cascade,
  seq               integer not null,
  statement_no      text not null,
  title             text not null,
  as_of_date        date not null,
  due_label         text,
  total_contract    numeric(14,2) not null,
  total_received    numeric(14,2) not null,
  balance           numeric(14,2) not null,          -- negative = client has paid in excess (credit)
  snapshot          jsonb not null,
  sent_via          text not null check (sent_via in ('whatsapp', 'share', 'download')),
  sent_to_client_id uuid references public.clients(id) on delete set null,
  created_by        uuid references auth.users(id) on delete set null default auth.uid(),
  created_at        timestamptz not null default now(),
  constraint client_statements_site_seq_unique unique (site_id, seq)
);

create index if not exists client_statements_site_created_idx
  on public.client_statements (site_id, created_at desc);

alter table public.client_statements enable row level security;

create policy "client_statements_select"
  on public.client_statements for select
  using (auth.role() = 'authenticated');

create policy "client_statements_insert"
  on public.client_statements for insert
  with check (auth.role() = 'authenticated');

create policy "client_statements_delete"
  on public.client_statements for delete
  using (auth.role() = 'authenticated');
