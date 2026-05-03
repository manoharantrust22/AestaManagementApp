# Client Payments Redesign + Additional Works — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/site/client-payments` using the salary-settlement design language (`MobileCollapsibleHero` + `KpiTile` + tabs + `InspectPane`), introduce a new `site_additional_works` data model for variation orders the client requests mid-project, allow optional tagging of incoming payments to a phase or extra, and surface a "Site Money Overview" rollup (Base + Extras − Paid − Supervisor cost = In hand) on both the page and the site dashboard.

**Architecture:** Seven phases. Phase 1 lays the database foundation (table, ALTERs, function, RLS, indexes) and regenerates types. Phase 2 builds the React Query hooks. Phase 3 builds the standalone hero component. Phase 4 builds the three tab components and updates the record-payment dialog. Phase 5 wires everything into the rewritten page. Phase 6 drops a condensed version of the hero onto the site dashboard. Phase 7 verifies end-to-end and gates the production migration on explicit user confirmation.

**Tech Stack:** Next.js 15 (app router), React 18, MUI v7 (`@mui/material`), `@tanstack/react-query` v5, Supabase (PostgreSQL + RLS), Tailwind CSS, Vitest + React Testing Library (hook + helper unit tests), Playwright MCP (visual + flow verification).

**Spec:** [docs/superpowers/specs/2026-05-03-client-payments-redesign-design.md](../specs/2026-05-03-client-payments-redesign-design.md)

**User-supplied preferences:** All dates in this feature render as **DD MMM YY** (e.g. "03 May 26"). New helper `formatDateDDMMMYY` lives in [src/lib/formatters.ts](../../../src/lib/formatters.ts).

---

## Files Touched

| Path | Phase | Nature |
|---|---|---|
| `supabase/migrations/20260503100000_site_additional_works.sql` | 1 | **New** — table + 2 ALTERs on `client_payments` + function + RLS + indexes |
| `src/types/database.types.ts` | 1 | Regenerated from local schema |
| `src/types/site.types.ts` | 1 | Edit — add `SiteAdditionalWork` row alias + `AdditionalWorkStatus` enum |
| `src/lib/formatters.ts` | 1 | Edit — add `formatDateDDMMMYY` |
| `src/lib/formatters.test.ts` | 1 | Edit — add tests for `formatDateDDMMMYY` |
| `src/hooks/queries/useSiteAdditionalWorks.ts` | 2 | **New** — list + create + update + delete hooks |
| `src/hooks/queries/useSiteAdditionalWorks.test.tsx` | 2 | **New** — vitest hook test |
| `src/hooks/queries/useSiteFinancialSummary.ts` | 2 | **New** — combined rollup hook for the hero |
| `src/hooks/queries/useSiteFinancialSummary.test.tsx` | 2 | **New** — vitest hook test |
| `src/hooks/queries/useClientPayments.ts` | 2 | Edit — add `taggedAdditionalWorkId` (and surface existing `paymentPhaseId`) on create/update payloads |
| `src/components/client-payments/SiteMoneyOverviewHero.tsx` | 3 | **New** — 6-KpiTile hero + collected-progress bar, wrapped in `MobileCollapsibleHero` |
| `src/components/client-payments/SiteMoneyOverviewHero.test.tsx` | 3 | **New** — RTL render test for math + labels |
| `src/components/client-payments/ContractTab.tsx` | 4 | **New** — base contract summary + optional phases list |
| `src/components/client-payments/AdditionalWorkDialog.tsx` | 4 | **New** — add/edit dialog (title, description, estimated, confirmed, dates, quote upload) |
| `src/components/client-payments/AdditionalWorksTab.tsx` | 4 | **New** — list/table of variation orders with status chips |
| `src/components/client-payments/PaymentsReceivedTab.tsx` | 4 | **New** — chronological payments table |
| `src/components/client-payments/RecordPaymentDialog.tsx` | 4 | **New** — replaces inline dialog in old page; adds Apply-to dropdown |
| `src/app/(main)/site/client-payments/page.tsx` | 5 | **Rewrite** — header + hero + tabs + InspectPane wiring |
| `src/components/site/SiteMoneyMiniCard.tsx` | 6 | **New** — 3-tile condensed version for the dashboard |
| `src/app/(main)/site/page.tsx` | 6 | Edit — mount the mini card |

**Files NOT touched (reused as-is):**
- [src/components/payments/KpiTile.tsx](../../../src/components/payments/KpiTile.tsx) — `formatINR` helper imported from here
- [src/components/payments/MobileCollapsibleHero.tsx](../../../src/components/payments/MobileCollapsibleHero.tsx)
- [src/components/common/InspectPane/InspectPane.tsx](../../../src/components/common/InspectPane/InspectPane.tsx) — already supports the tab/entity model we need
- [src/hooks/useInspectPane.ts](../../../src/hooks/useInspectPane.ts)
- [src/components/common/FileUploader.tsx](../../../src/components/common/FileUploader.tsx) — used for `quote_document_url`
- `src/contexts/SiteContext` — `useSite()` provides the active site

---

## Pre-flight

- [ ] **Verify branch and clean tree**

  Run: `git status` and `git rev-parse --abbrev-ref HEAD`
  Expected: working tree shows only the spec file under `docs/superpowers/specs/` and this plan. If on `main`, create a feature branch:
  ```bash
  git checkout -b feature/client-payments-redesign
  ```

- [ ] **Run baseline test suite**

  Run: `npm run test`
  Expected: all tests pass. Capture any pre-existing failures so they're not mistaken for regressions.

- [ ] **Run baseline build**

  Run: `npm run build`
  Expected: clean compile. If it fails on `main`, fix before starting.

- [ ] **Capture baseline screenshot of current `/site/client-payments`**

  Use Playwright MCP — `http://localhost:3000/dev-login`, then visit `/site/client-payments` (with a site selected via the site picker). Save as `baseline-client-payments.png` for visual diff later.

- [ ] **Confirm local Supabase is running and on the latest migration**

  Run: `npm run db:start` (no-op if already running). Then list applied migrations:
  ```bash
  psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "select version from supabase_migrations.schema_migrations order by 1 desc limit 5;"
  ```
  Expected: most recent timestamp matches the latest file in `supabase/migrations/`.

- [ ] **Confirm referenced upstream tables exist locally**

  ```bash
  psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "\d sites" | head -40
  psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "\d client_payments"
  psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "\d payment_phases"
  psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "\d subcontracts" | head -30
  psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "\d subcontract_payments" | head -30
  ```
  Expected: all five tables present. Note actual column names — use them verbatim in Phase 1.

---

# PHASE 1 — Database Foundation

**Independent. Mergeable alone. No UI change.**
Adds the `site_additional_works` table, two nullable tagging columns on `client_payments` (mutually exclusive via check constraint), the `get_site_supervisor_cost(uuid)` function, RLS policies, indexes, and regenerates `database.types.ts`.

## Task 1.1: Author the migration SQL

**Files:**
- Create: `supabase/migrations/20260503100000_site_additional_works.sql`

**Why:** A single migration file keeps the schema changes atomic and reversible. Naming follows the existing `YYYYMMDDHHMMSS_<slug>.sql` convention (e.g. `20260204100000_add_performance_indexes.sql`).

- [ ] **Step 1: Inspect a comparable migration for RLS / function patterns**

  Read: `supabase/migrations/20260203100000_equipment_management.sql`
  Note: how it declares an enum, creates a table with an `updated_at` trigger, and writes RLS policies using the project's `is_company_user()` / `has_site_access()` helpers (whichever the codebase uses — confirm by reading 30 lines of that migration).

- [ ] **Step 2: Write the migration SQL**

  Create `supabase/migrations/20260503100000_site_additional_works.sql`:

  ```sql
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

  -- 3. updated_at trigger (uses existing helper if present, otherwise inline) -
  create or replace function public.set_updated_at()
  returns trigger language plpgsql as $$
  begin new.updated_at = now(); return new; end $$;

  drop trigger if exists trg_site_additional_works_updated_at on public.site_additional_works;
  create trigger trg_site_additional_works_updated_at
    before update on public.site_additional_works
    for each row execute function public.set_updated_at();

  -- 4. RLS ------------------------------------------------------------------
  alter table public.site_additional_works enable row level security;

  -- Authenticated users with access to the parent site can read/write.
  -- Mirrors client_payments policies. Confirm helper name in your repo
  -- (e.g. has_site_access(site_id) or is_company_user()) and substitute below.
  create policy "site_additional_works_select"
    on public.site_additional_works for select
    using (
      exists (
        select 1 from public.client_payments cp
        where cp.site_id = site_additional_works.site_id
        limit 1
      )
      or auth.role() = 'authenticated'
    );

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
  ```

  **Verified column names (from `supabase/migrations/00000000000000_initial_schema.sql`):**
  - `client_payments.site_id` ✓ (line 4270, NOT NULL)
  - `client_payments.payment_phase_id` ✓ (line 4271, already exists — reuse for phase tagging)
  - `subcontracts.site_id` ✓ (line 6310), `subcontracts.contract_type` ✓ (line 6307, enum mesthri/specialist)
  - `subcontract_payments.contract_id` ✓ (line 6255, FK to subcontracts.id), `.amount` ✓ (line 6258)
  - `payment_phases.phase_name` (line 5447), `.amount` (line 5450), `.expected_date` (line 5451), `.sequence_order` (line 5452) — used by ContractTab in Phase 4

- [ ] **Step 3: Confirm RLS policy helpers**

  Run: `grep -rn "create policy" supabase/migrations/ | head -20`
  Read whatever helper function names recur (e.g. `is_company_user()`, `has_site_access()`). Replace the placeholder `auth.role() = 'authenticated'` checks above with the project's standard helpers so policies match the rest of the app. If no helpers exist, leave the authenticated-role check.

- [ ] **Step 4: Commit the SQL only (do not apply yet)**

  ```bash
  git add supabase/migrations/20260503100000_site_additional_works.sql
  git commit -m "feat(db): add site_additional_works + client_payments tagging + supervisor cost rpc"
  ```

## Task 1.2: Apply migration locally and verify

**Files:** none (DB side-effect only)

**Why:** Apply to the local Supabase before generating types or writing hooks. Catches SQL errors immediately.

- [ ] **Step 1: Reset local DB to apply the new migration**

  Run: `npm run db:reset`
  Expected: all migrations apply cleanly, including the new one. Watch stderr for `relation "X" does not exist` — that means a column-name mismatch in Task 1.1.

- [ ] **Step 2: Inspect the new table**

  ```bash
  psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "\d site_additional_works"
  ```
  Expected: 14 columns, two indexes (`site_id_idx`, `status_idx`), one trigger (`trg_site_additional_works_updated_at`), RLS enabled.

- [ ] **Step 3: Inspect the ALTERed `client_payments`**

  ```bash
  psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "\d client_payments"
  ```
  Expected: ONE new nullable column (`tagged_additional_work_id`) — the existing `payment_phase_id` is reused for phase tagging. Check constraint `client_payments_tag_mutex` enforces mutex of `tagged_additional_work_id` against `payment_phase_id`. One new partial index (`client_payments_tagged_additional_work_idx`).

- [ ] **Step 4: Smoke-test the function**

  ```bash
  psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "select get_site_supervisor_cost('00000000-0000-0000-0000-000000000000'::uuid);"
  ```
  Expected: returns `0` (no error). A non-zero value with a real site UUID confirms the join works.

- [ ] **Step 5: Smoke-test the mutex constraint**

  ```bash
  psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "
    insert into client_payments (id, site_id, amount, payment_date, payment_mode, tagged_additional_work_id, payment_phase_id)
    values (gen_random_uuid(), (select id from sites limit 1), 1, current_date, 'cash', gen_random_uuid(), gen_random_uuid());
  "
  ```
  Expected: ERROR mentioning `client_payments_tag_mutex`. Confirms the constraint blocks dual-tagging.

  Note: Windows hosts without `psql` on PATH can run the same statement via the Supabase MCP `execute_sql` tool against the **local** project, or via `docker exec` into the supabase Postgres container.

## Task 1.3: Regenerate `database.types.ts`

**Files:**
- Modify: `src/types/database.types.ts`

- [ ] **Step 1: Regenerate from local schema**

  Run: `npx supabase gen types typescript --local > src/types/database.types.ts`
  Expected: file rewritten, includes `site_additional_works` table type and `additional_work_status` enum.

- [ ] **Step 2: Verify**

  ```bash
  grep -n "site_additional_works" src/types/database.types.ts | head -5
  grep -n "tagged_additional_work_id" src/types/database.types.ts | head -5
  grep -n "additional_work_status" src/types/database.types.ts | head -5
  ```
  Expected: each grep returns at least one match.

- [ ] **Step 3: Build to surface any breakages from the regen**

  Run: `npm run build`
  Expected: clean. If a pre-existing site referenced `database.types.ts` in a way that broke after regen (per memory entry `sites_company_id_latent_bug`), fix that file as part of this task — don't let it stop progress.

## Task 1.4: Add custom types & date formatter

**Files:**
- Modify: `src/types/site.types.ts`
- Modify: `src/lib/formatters.ts`
- Modify: `src/lib/formatters.test.ts`

- [ ] **Step 1: Add row aliases to `site.types.ts`**

  Append to `src/types/site.types.ts`:

  ```ts
  import type { Database } from "./database.types";

  export type SiteAdditionalWork =
    Database["public"]["Tables"]["site_additional_works"]["Row"];

  export type SiteAdditionalWorkInsert =
    Database["public"]["Tables"]["site_additional_works"]["Insert"];

  export type SiteAdditionalWorkUpdate =
    Database["public"]["Tables"]["site_additional_works"]["Update"];

  export type AdditionalWorkStatus =
    Database["public"]["Enums"]["additional_work_status"];

  export const ADDITIONAL_WORK_STATUS_LABELS: Record<AdditionalWorkStatus, string> = {
    quoted: "Quoted",
    confirmed: "Confirmed",
    paid: "Paid",
    cancelled: "Cancelled",
  };
  ```

- [ ] **Step 2: Add `formatDateDDMMMYY` to `formatters.ts`**

  In `src/lib/formatters.ts`, after `formatDateShort`, add:

  ```ts
  /**
   * Format a date as "03 May 26" — day, abbreviated month, 2-digit year.
   * Used across the client-payments feature per user preference.
   */
  export function formatDateDDMMMYY(date: string | Date | null | undefined): string {
    if (!date) return "-";
    const d = typeof date === "string" ? new Date(date) : date;
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "2-digit",
    });
  }
  ```

- [ ] **Step 3: Add tests**

  In `src/lib/formatters.test.ts`, append a new `describe` block:

  ```ts
  import { formatDateDDMMMYY } from './formatters';

  describe('formatDateDDMMMYY', () => {
    it('returns "-" for null/undefined/invalid', () => {
      expect(formatDateDDMMMYY(null)).toBe('-');
      expect(formatDateDDMMMYY(undefined)).toBe('-');
      expect(formatDateDDMMMYY('not-a-date')).toBe('-');
    });

    it('formats a date as DD MMM YY', () => {
      expect(formatDateDDMMMYY('2026-05-03')).toBe('03 May 26');
      expect(formatDateDDMMMYY('2026-12-31')).toBe('31 Dec 26');
    });

    it('accepts a Date object', () => {
      expect(formatDateDDMMMYY(new Date('2026-01-09'))).toBe('09 Jan 26');
    });
  });
  ```

  (The existing import line at the top of `formatters.test.ts` should be extended to include `formatDateDDMMMYY` — do not duplicate the import.)

- [ ] **Step 4: Run the formatter tests**

  Run: `npx vitest run src/lib/formatters.test.ts`
  Expected: all pass.

- [ ] **Step 5: Commit Phase 1**

  ```bash
  git add src/types/database.types.ts src/types/site.types.ts src/lib/formatters.ts src/lib/formatters.test.ts
  git commit -m "feat(types): add SiteAdditionalWork types + formatDateDDMMMYY helper"
  ```

---

# PHASE 2 — Hooks Layer

**Depends on Phase 1.**
Three React Query hooks plus tagging-field extension on `useClientPayments`.

## Task 2.1: `useSiteAdditionalWorks` (CRUD)

**Files:**
- Create: `src/hooks/queries/useSiteAdditionalWorks.ts`
- Create: `src/hooks/queries/useSiteAdditionalWorks.test.tsx`

**Why:** A single hook file exposing list + create + update + delete keeps callers DRY. Mirrors `useClientPayments.ts` structure.

- [ ] **Step 1: Read the existing `useClientPayments.ts` to match conventions**

  Read: `src/hooks/queries/useClientPayments.ts` (first 80 lines). Note: how it imports the Supabase client, how `queryKey` is structured (e.g. `["client-payments", siteId]`), and how mutations invalidate.

- [ ] **Step 2: Write the hook**

  Create `src/hooks/queries/useSiteAdditionalWorks.ts`:

  ```ts
  "use client";

  import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
  import { createClient } from "@/lib/supabase/client";
  import type {
    SiteAdditionalWork,
    SiteAdditionalWorkInsert,
    SiteAdditionalWorkUpdate,
  } from "@/types/site.types";

  const KEY = (siteId: string | undefined) => ["site-additional-works", siteId];

  export function useSiteAdditionalWorks(siteId: string | undefined) {
    return useQuery({
      queryKey: KEY(siteId),
      enabled: !!siteId,
      queryFn: async (): Promise<SiteAdditionalWork[]> => {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("site_additional_works")
          .select("*")
          .eq("site_id", siteId!)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return data ?? [];
      },
    });
  }

  export function useCreateSiteAdditionalWork() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: async (input: SiteAdditionalWorkInsert) => {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("site_additional_works")
          .insert(input)
          .select()
          .single();
        if (error) throw error;
        return data as SiteAdditionalWork;
      },
      onSuccess: (row) => {
        qc.invalidateQueries({ queryKey: KEY(row.site_id) });
        qc.invalidateQueries({ queryKey: ["site-financial-summary", row.site_id] });
      },
    });
  }

  export function useUpdateSiteAdditionalWork() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: async (
        args: { id: string; siteId: string; patch: SiteAdditionalWorkUpdate },
      ) => {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("site_additional_works")
          .update(args.patch)
          .eq("id", args.id)
          .select()
          .single();
        if (error) throw error;
        return data as SiteAdditionalWork;
      },
      onSuccess: (_row, vars) => {
        qc.invalidateQueries({ queryKey: KEY(vars.siteId) });
        qc.invalidateQueries({ queryKey: ["site-financial-summary", vars.siteId] });
      },
    });
  }

  export function useDeleteSiteAdditionalWork() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: async (args: { id: string; siteId: string }) => {
        const supabase = createClient();
        const { error } = await supabase
          .from("site_additional_works")
          .delete()
          .eq("id", args.id);
        if (error) throw error;
      },
      onSuccess: (_v, vars) => {
        qc.invalidateQueries({ queryKey: KEY(vars.siteId) });
        qc.invalidateQueries({ queryKey: ["site-financial-summary", vars.siteId] });
      },
    });
  }
  ```

  Note: confirm the `createClient` import path matches the rest of `src/hooks/queries/` (could be `@/lib/supabase/client` or similar). Match what `useClientPayments.ts` uses.

- [ ] **Step 3: Write hook tests**

  Create `src/hooks/queries/useSiteAdditionalWorks.test.tsx` mirroring `useSalarySliceSummary.test.tsx`:

  ```tsx
  import React from "react";
  import { describe, it, expect, vi, beforeEach } from "vitest";
  import { renderHook, waitFor, act } from "@testing-library/react";
  import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
  import {
    useSiteAdditionalWorks,
    useCreateSiteAdditionalWork,
  } from "./useSiteAdditionalWorks";

  const mockFrom = vi.fn();
  vi.mock("@/lib/supabase/client", () => ({
    createClient: () => ({ from: mockFrom }),
  }));

  function wrapper({ children }: { children: React.ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }

  describe("useSiteAdditionalWorks", () => {
    beforeEach(() => mockFrom.mockReset());

    it("queries by site_id and returns rows", async () => {
      const rows = [{ id: "w1", site_id: "site-1", title: "Extra balcony", status: "quoted" }];
      mockFrom.mockReturnValue({
        select: () => ({
          eq: () => ({
            order: async () => ({ data: rows, error: null }),
          }),
        }),
      });

      const { result } = renderHook(() => useSiteAdditionalWorks("site-1"), { wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(rows);
    });

    it("is disabled when siteId is undefined", () => {
      const { result } = renderHook(() => useSiteAdditionalWorks(undefined), { wrapper });
      expect(result.current.fetchStatus).toBe("idle");
    });
  });

  describe("useCreateSiteAdditionalWork", () => {
    beforeEach(() => mockFrom.mockReset());

    it("inserts and returns the row", async () => {
      const row = { id: "new", site_id: "site-1", title: "X", status: "quoted" };
      mockFrom.mockReturnValue({
        insert: () => ({
          select: () => ({
            single: async () => ({ data: row, error: null }),
          }),
        }),
      });

      const { result } = renderHook(() => useCreateSiteAdditionalWork(), { wrapper });
      let returned: unknown;
      await act(async () => {
        returned = await result.current.mutateAsync({
          site_id: "site-1",
          title: "X",
          estimated_amount: 1000,
        } as never);
      });
      expect(returned).toEqual(row);
    });
  });
  ```

- [ ] **Step 4: Run hook tests**

  Run: `npx vitest run src/hooks/queries/useSiteAdditionalWorks.test.tsx`
  Expected: all pass.

## Task 2.2: `useSiteFinancialSummary` (rollup)

**Files:**
- Create: `src/hooks/queries/useSiteFinancialSummary.ts`
- Create: `src/hooks/queries/useSiteFinancialSummary.test.tsx`

**Why:** The hero needs six numbers from three sources (`sites`, `client_payments`, `site_additional_works`, `get_site_supervisor_cost`). Centralising this in one hook means the page and the dashboard mini-card use the same math.

- [ ] **Step 1: Write the hook**

  Create `src/hooks/queries/useSiteFinancialSummary.ts`:

  ```ts
  "use client";

  import { useQuery } from "@tanstack/react-query";
  import { createClient } from "@/lib/supabase/client";

  export interface SiteFinancialSummary {
    baseContract: number;
    additionalWorksConfirmed: number;
    totalContract: number;
    clientPaid: number;
    remainingFromClient: number;
    supervisorCost: number;
    netInHand: number;
    progressPct: number;
  }

  export function useSiteFinancialSummary(siteId: string | undefined) {
    return useQuery({
      queryKey: ["site-financial-summary", siteId],
      enabled: !!siteId,
      queryFn: async (): Promise<SiteFinancialSummary> => {
        const supabase = createClient();

        const [siteRes, paymentsRes, worksRes, supervisorRes] = await Promise.all([
          supabase
            .from("sites")
            .select("project_contract_value")
            .eq("id", siteId!)
            .single(),
          supabase
            .from("client_payments")
            .select("amount")
            .eq("site_id", siteId!),
          supabase
            .from("site_additional_works")
            .select("confirmed_amount, status")
            .eq("site_id", siteId!),
          supabase.rpc("get_site_supervisor_cost", { p_site_id: siteId! }),
        ]);

        if (siteRes.error) throw siteRes.error;
        if (paymentsRes.error) throw paymentsRes.error;
        if (worksRes.error) throw worksRes.error;
        if (supervisorRes.error) throw supervisorRes.error;

        const baseContract = Number(siteRes.data?.project_contract_value ?? 0);

        const additionalWorksConfirmed = (worksRes.data ?? [])
          .filter((w) => w.status !== "cancelled" && w.confirmed_amount != null)
          .reduce((sum, w) => sum + Number(w.confirmed_amount), 0);

        const totalContract = baseContract + additionalWorksConfirmed;

        const clientPaid = (paymentsRes.data ?? [])
          .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);

        const remainingFromClient = Math.max(0, totalContract - clientPaid);

        const supervisorCost = Number(supervisorRes.data ?? 0);
        const netInHand = clientPaid - supervisorCost;

        const progressPct = totalContract > 0
          ? Math.min(100, Math.round((clientPaid / totalContract) * 100))
          : 0;

        return {
          baseContract,
          additionalWorksConfirmed,
          totalContract,
          clientPaid,
          remainingFromClient,
          supervisorCost,
          netInHand,
          progressPct,
        };
      },
    });
  }
  ```

- [ ] **Step 2: Write hook test (math verification)**

  Create `src/hooks/queries/useSiteFinancialSummary.test.tsx`:

  ```tsx
  import React from "react";
  import { describe, it, expect, vi, beforeEach } from "vitest";
  import { renderHook, waitFor } from "@testing-library/react";
  import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
  import { useSiteFinancialSummary } from "./useSiteFinancialSummary";

  const mockFrom = vi.fn();
  const mockRpc = vi.fn();
  vi.mock("@/lib/supabase/client", () => ({
    createClient: () => ({ from: mockFrom, rpc: mockRpc }),
  }));

  function wrapper({ children }: { children: React.ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }

  describe("useSiteFinancialSummary", () => {
    beforeEach(() => {
      mockFrom.mockReset();
      mockRpc.mockReset();
    });

    it("computes the rollup correctly and excludes cancelled extras", async () => {
      mockFrom.mockImplementation((table: string) => {
        switch (table) {
          case "sites":
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: { project_contract_value: "5000000" },
                    error: null,
                  }),
                }),
              }),
            };
          case "client_payments":
            return {
              select: () => ({
                eq: async () => ({
                  data: [{ amount: "3000000" }, { amount: "800000" }],
                  error: null,
                }),
              }),
            };
          case "site_additional_works":
            return {
              select: () => ({
                eq: async () => ({
                  data: [
                    { confirmed_amount: "400000", status: "confirmed" },
                    { confirmed_amount: "200000", status: "paid" },
                    { confirmed_amount: "999999", status: "cancelled" }, // excluded
                    { confirmed_amount: null, status: "quoted" },          // excluded
                  ],
                  error: null,
                }),
              }),
            };
          default:
            throw new Error(`unexpected table ${table}`);
        }
      });
      mockRpc.mockResolvedValue({ data: "350000", error: null });

      const { result } = renderHook(() => useSiteFinancialSummary("site-1"), { wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const s = result.current.data!;
      expect(s.baseContract).toBe(5_000_000);
      expect(s.additionalWorksConfirmed).toBe(600_000);
      expect(s.totalContract).toBe(5_600_000);
      expect(s.clientPaid).toBe(3_800_000);
      expect(s.remainingFromClient).toBe(1_800_000);
      expect(s.supervisorCost).toBe(350_000);
      expect(s.netInHand).toBe(3_450_000);
      expect(s.progressPct).toBe(68); // 3.8M / 5.6M = 67.86 → 68
    });
  });
  ```

- [ ] **Step 3: Run hook tests**

  Run: `npx vitest run src/hooks/queries/useSiteFinancialSummary.test.tsx`
  Expected: all pass.

## Task 2.3: Extend `useClientPayments` with tagging fields

**Files:**
- Modify: `src/hooks/queries/useClientPayments.ts`

- [ ] **Step 1: Read the file to identify the create/update mutation payloads**

  Read: `src/hooks/queries/useClientPayments.ts`. Locate the input type/schema for the create and update mutations (look for `useMutation` and the shape of `mutationFn`'s `input` parameter).

- [ ] **Step 2: Surface the tagging fields**

  Wherever the create/update payload type is defined, add:
  ```ts
  taggedAdditionalWorkId?: string | null;
  paymentPhaseId?: string | null;   // EXISTING column on client_payments — pass through if present
  ```

  In the `insert` / `update` body sent to Supabase, include:
  ```ts
  tagged_additional_work_id: input.taggedAdditionalWorkId ?? null,
  payment_phase_id:          input.paymentPhaseId          ?? null,
  ```

  Make sure `mutationFn` invalidates BOTH `["site-financial-summary", siteId]` AND any pre-existing `["client-payments", siteId]` key on success.

  Note: the DB check constraint `client_payments_tag_mutex` (added in Phase 1) prevents both fields being set simultaneously — surface that as a friendly error in the catch block.

- [ ] **Step 3: Build to verify types are happy**

  Run: `npm run build`
  Expected: clean. The new columns are now reflected in `database.types.ts` so TS should accept them.

- [ ] **Step 4: Commit Phase 2**

  ```bash
  git add src/hooks/queries/useSiteAdditionalWorks.ts \
          src/hooks/queries/useSiteAdditionalWorks.test.tsx \
          src/hooks/queries/useSiteFinancialSummary.ts \
          src/hooks/queries/useSiteFinancialSummary.test.tsx \
          src/hooks/queries/useClientPayments.ts
  git commit -m "feat(hooks): site_additional_works CRUD + site financial summary + payment tagging"
  ```

---

# PHASE 3 — `SiteMoneyOverviewHero`

**Depends on Phase 2.**
A self-contained component the page and the dashboard both consume.

## Task 3.1: Build the hero

**Files:**
- Create: `src/components/client-payments/SiteMoneyOverviewHero.tsx`

**Why:** Replicates the salary-settlement hero pattern: `MobileCollapsibleHero` shell + 6-tile grid (responsive `Grid` from MUI v7) + collected-progress bar.

- [ ] **Step 1: Write the component**

  Create `src/components/client-payments/SiteMoneyOverviewHero.tsx`:

  ```tsx
  "use client";

  import React from "react";
  import { Box, Typography, useTheme } from "@mui/material";
  import { KpiTile, formatINR } from "@/components/payments/KpiTile";
  import { MobileCollapsibleHero } from "@/components/payments/MobileCollapsibleHero";
  import type { SiteFinancialSummary } from "@/hooks/queries/useSiteFinancialSummary";

  export interface SiteMoneyOverviewHeroProps {
    siteId: string;
    summary: SiteFinancialSummary;
  }

  export function SiteMoneyOverviewHero({ siteId, summary }: SiteMoneyOverviewHeroProps) {
    const theme = useTheme();

    const progressColor =
      summary.progressPct < 50
        ? theme.palette.error.main
        : summary.progressPct < 80
          ? theme.palette.warning.main
          : theme.palette.success.main;

    const netVariant = summary.netInHand >= 0 ? "success" : "error";

    return (
      <MobileCollapsibleHero
        storageKey={`client-payments.hero.${siteId}.expanded`}
        statusLabel="Remaining from Client"
        statusValue={formatINR(summary.remainingFromClient)}
        statusVariant="warning"
        progressPct={summary.progressPct}
        progressColor={progressColor}
      >
        <Box
          sx={{
            display: "grid",
            gap: 1.25,
            gridTemplateColumns: {
              xs: "repeat(2, minmax(0, 1fr))",
              sm: "repeat(3, minmax(0, 1fr))",
              md: "repeat(6, minmax(0, 1fr))",
            },
            mb: 1.5,
          }}
        >
          <KpiTile label="Base Contract"        variant="neutral" value={formatINR(summary.baseContract)} />
          <KpiTile label="Additional Works"     variant="info"    value={formatINR(summary.additionalWorksConfirmed)} sub="confirmed only" />
          <KpiTile label="Total Contract"       variant="neutral" value={formatINR(summary.totalContract)} formula="base + extras" />
          <KpiTile label="Client Paid"          variant="success" value={formatINR(summary.clientPaid)} />
          <KpiTile label="Remaining From Client" variant="warning" value={formatINR(summary.remainingFromClient)} />
          <KpiTile label="Net In Hand"          variant={netVariant} value={formatINR(summary.netInHand)} sub="paid − supervisor cost" />
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
          <Typography sx={{ fontSize: 11, color: "text.secondary", minWidth: 130 }}>
            Client collection progress
          </Typography>
          <Box sx={{ flex: 1, height: 10, borderRadius: 1, bgcolor: "divider", overflow: "hidden" }}>
            <Box
              sx={{
                height: "100%",
                width: `${summary.progressPct}%`,
                bgcolor: progressColor,
                transition: "width 200ms",
              }}
            />
          </Box>
          <Typography
            sx={{
              fontSize: 12.5,
              fontWeight: 700,
              fontVariantNumeric: "tabular-nums",
              minWidth: 40,
              textAlign: "right",
            }}
          >
            {summary.progressPct}%
          </Typography>
        </Box>
      </MobileCollapsibleHero>
    );
  }

  export default SiteMoneyOverviewHero;
  ```

## Task 3.2: Test the hero

**Files:**
- Create: `src/components/client-payments/SiteMoneyOverviewHero.test.tsx`

- [ ] **Step 1: Write a render test**

  ```tsx
  import { describe, it, expect } from "vitest";
  import { render, screen } from "@testing-library/react";
  import { ThemeProvider, createTheme } from "@mui/material";
  import { SiteMoneyOverviewHero } from "./SiteMoneyOverviewHero";

  const theme = createTheme();

  function renderHero(overrides: Partial<Parameters<typeof SiteMoneyOverviewHero>[0]["summary"]> = {}) {
    const summary = {
      baseContract: 5_000_000,
      additionalWorksConfirmed: 600_000,
      totalContract: 5_600_000,
      clientPaid: 3_800_000,
      remainingFromClient: 1_800_000,
      supervisorCost: 350_000,
      netInHand: 3_450_000,
      progressPct: 68,
      ...overrides,
    };
    return render(
      <ThemeProvider theme={theme}>
        <SiteMoneyOverviewHero siteId="site-1" summary={summary} />
      </ThemeProvider>
    );
  }

  describe("SiteMoneyOverviewHero", () => {
    it("renders all six KPI labels", () => {
      renderHero();
      expect(screen.getAllByText(/Base Contract/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Additional Works/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Total Contract/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Client Paid/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Remaining From Client/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Net In Hand/i).length).toBeGreaterThan(0);
    });

    it("renders the formatted values", () => {
      renderHero();
      // KpiTile uses formatINR which prefixes ₹ and adds Indian-locale commas
      expect(screen.getByText("₹50,00,000")).toBeInTheDocument(); // Base
      expect(screen.getByText("₹6,00,000")).toBeInTheDocument();  // Extras
      expect(screen.getByText("₹56,00,000")).toBeInTheDocument(); // Total
    });

    it("renders the progress percentage", () => {
      renderHero();
      expect(screen.getByText("68%")).toBeInTheDocument();
    });
  });
  ```

- [ ] **Step 2: Run hero tests**

  Run: `npx vitest run src/components/client-payments/SiteMoneyOverviewHero.test.tsx`
  Expected: all pass.

- [ ] **Step 3: Commit Phase 3**

  ```bash
  git add src/components/client-payments/SiteMoneyOverviewHero.tsx \
          src/components/client-payments/SiteMoneyOverviewHero.test.tsx
  git commit -m "feat(client-payments): site money overview hero (6-tile + progress)"
  ```

---

# PHASE 4 — Tab Components & Dialog

**Depends on Phase 2 (hooks) + Phase 3 (hero only used by page).**

## Task 4.1: `ContractTab`

**Files:**
- Create: `src/components/client-payments/ContractTab.tsx`

**Why:** Read-only display of base contract amount, contract document link, and any existing phases. Editing the base contract amount stays on `/company/sites` (existing site edit form); phase creation/edit is deferred to a follow-up plan. v1 explicitly does not write phases — it just shows them if they exist.

- [ ] **Step 1: Write the component**

  Create `src/components/client-payments/ContractTab.tsx`:

  ```tsx
  "use client";

  import React from "react";
  import {
    Box, Button, Chip, Stack, Typography,
    Table, TableBody, TableCell, TableHead, TableRow, Paper, Alert,
  } from "@mui/material";
  import type { Database } from "@/types/database.types";
  import { formatINR } from "@/components/payments/KpiTile";
  import { formatDateDDMMMYY } from "@/lib/formatters";

  type PaymentPhase = Database["public"]["Tables"]["payment_phases"]["Row"];

  export interface ContractTabProps {
    baseContract: number;
    contractDocumentUrl: string | null;
    phases: PaymentPhase[];
    paidByPhaseId: Map<string, number>;
  }

  export function ContractTab({
    baseContract,
    contractDocumentUrl,
    phases,
    paidByPhaseId,
  }: ContractTabProps) {
    return (
      <Stack spacing={2}>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="overline" color="text.secondary">Base Contract</Typography>
          <Typography variant="h5" sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
            {formatINR(baseContract)}
          </Typography>
          {contractDocumentUrl && (
            <Button size="small" component="a" href={contractDocumentUrl} target="_blank" sx={{ mt: 0.5 }}>
              View contract document
            </Button>
          )}
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            Edit base contract amount on Company → Sites.
          </Typography>
        </Paper>

        <Typography variant="subtitle1">Payment Phases ({phases.length})</Typography>

        {phases.length === 0 ? (
          <Alert severity="info">
            No phases configured. Treating base contract as a single line item.
          </Alert>
        ) : (
          <Paper variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Phase</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  <TableCell>Expected</TableCell>
                  <TableCell align="right">Paid</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {phases.map((phase) => {
                  const paid = paidByPhaseId.get(phase.id) ?? 0;
                  const phaseAmount = Number(phase.amount ?? 0);
                  const settled = phaseAmount > 0 && paid >= phaseAmount;
                  return (
                    <TableRow key={phase.id} hover>
                      <TableCell>{phase.phase_name ?? `Phase ${phase.sequence_order ?? ""}`}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                        {formatINR(phaseAmount)}
                      </TableCell>
                      <TableCell>{formatDateDDMMMYY(phase.expected_date)}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                        {formatINR(paid)}
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={settled ? "Settled" : "Pending"}
                          color={settled ? "success" : "default"}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Paper>
        )}
      </Stack>
    );
  }

  export default ContractTab;
  ```

  Note: `payment_phases` columns confirmed against `00000000000000_initial_schema.sql`: `phase_name`, `amount`, `expected_date`, `sequence_order`. (If the schema later changes, re-confirm.)

## Task 4.2: `AdditionalWorkDialog`

**Files:**
- Create: `src/components/client-payments/AdditionalWorkDialog.tsx`

**Why:** Single dialog for both add and edit. Form fields: title, description, estimated_amount, confirmed_amount, confirmation_date, expected_payment_date, status, quote_document_url, client_approved_by, notes.

- [ ] **Step 1: Write the component**

  Create `src/components/client-payments/AdditionalWorkDialog.tsx`:

  ```tsx
  "use client";

  import React, { useEffect, useState } from "react";
  import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, TextField, Stack, MenuItem, Alert,
  } from "@mui/material";
  import type {
    SiteAdditionalWork,
    SiteAdditionalWorkInsert,
    AdditionalWorkStatus,
  } from "@/types/site.types";
  import {
    useCreateSiteAdditionalWork,
    useUpdateSiteAdditionalWork,
  } from "@/hooks/queries/useSiteAdditionalWorks";
  import FileUploader, { type UploadedFile } from "@/components/common/FileUploader";

  export interface AdditionalWorkDialogProps {
    open: boolean;
    onClose: () => void;
    siteId: string;
    initial?: SiteAdditionalWork;
  }

  type FormState = {
    title: string;
    description: string;
    estimated_amount: string;
    confirmed_amount: string;
    confirmation_date: string;
    expected_payment_date: string;
    status: AdditionalWorkStatus;
    quote_document_url: string;
    client_approved_by: string;
    notes: string;
  };

  const empty: FormState = {
    title: "",
    description: "",
    estimated_amount: "",
    confirmed_amount: "",
    confirmation_date: "",
    expected_payment_date: "",
    status: "quoted",
    quote_document_url: "",
    client_approved_by: "",
    notes: "",
  };

  export function AdditionalWorkDialog({ open, onClose, siteId, initial }: AdditionalWorkDialogProps) {
    const create = useCreateSiteAdditionalWork();
    const update = useUpdateSiteAdditionalWork();
    const [form, setForm] = useState<FormState>(empty);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      if (!open) return;
      if (initial) {
        setForm({
          title: initial.title ?? "",
          description: initial.description ?? "",
          estimated_amount: String(initial.estimated_amount ?? ""),
          confirmed_amount: initial.confirmed_amount == null ? "" : String(initial.confirmed_amount),
          confirmation_date: initial.confirmation_date ?? "",
          expected_payment_date: initial.expected_payment_date ?? "",
          status: initial.status,
          quote_document_url: initial.quote_document_url ?? "",
          client_approved_by: initial.client_approved_by ?? "",
          notes: initial.notes ?? "",
        });
      } else {
        setForm(empty);
      }
      setError(null);
    }, [open, initial]);

    const onChange = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

    async function handleSave() {
      setError(null);
      const estimated = Number(form.estimated_amount);
      if (!form.title.trim()) { setError("Title is required"); return; }
      if (!Number.isFinite(estimated) || estimated < 0) { setError("Estimated amount must be a non-negative number"); return; }

      const confirmedNum = form.confirmed_amount === "" ? null : Number(form.confirmed_amount);
      if (confirmedNum != null && (!Number.isFinite(confirmedNum) || confirmedNum < 0)) {
        setError("Confirmed amount must be a non-negative number"); return;
      }

      // Status auto-derive: quoted → confirmed when confirmed_amount + confirmation_date set
      let status = form.status;
      if (status === "quoted" && confirmedNum != null && form.confirmation_date) {
        status = "confirmed";
      }

      const payload: SiteAdditionalWorkInsert = {
        site_id: siteId,
        title: form.title.trim(),
        description: form.description.trim() || null,
        estimated_amount: estimated,
        confirmed_amount: confirmedNum,
        confirmation_date: form.confirmation_date || null,
        expected_payment_date: form.expected_payment_date || null,
        status,
        quote_document_url: form.quote_document_url || null,
        client_approved_by: form.client_approved_by || null,
        notes: form.notes || null,
      };

      try {
        if (initial) {
          await update.mutateAsync({ id: initial.id, siteId, patch: payload });
        } else {
          await create.mutateAsync(payload);
        }
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    }

    return (
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>{initial ? "Edit Additional Work" : "Add Additional Work"}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField label="Title" value={form.title} onChange={onChange("title")} fullWidth required />
            <TextField label="Description" value={form.description} onChange={onChange("description")} fullWidth multiline rows={2} />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField label="Estimated amount (₹)" type="number" value={form.estimated_amount} onChange={onChange("estimated_amount")} fullWidth required inputProps={{ min: 0, step: "0.01" }} />
              <TextField label="Confirmed amount (₹)" type="number" value={form.confirmed_amount} onChange={onChange("confirmed_amount")} fullWidth inputProps={{ min: 0, step: "0.01" }} />
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField label="Confirmation date" type="date" value={form.confirmation_date} onChange={onChange("confirmation_date")} InputLabelProps={{ shrink: true }} fullWidth />
              <TextField label="Expected payment date" type="date" value={form.expected_payment_date} onChange={onChange("expected_payment_date")} InputLabelProps={{ shrink: true }} fullWidth />
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField label="Approved by (client)" value={form.client_approved_by} onChange={onChange("client_approved_by")} fullWidth />
              <TextField select label="Status" value={form.status} onChange={onChange("status")} fullWidth>
                <MenuItem value="quoted">Quoted</MenuItem>
                <MenuItem value="confirmed">Confirmed</MenuItem>
                <MenuItem value="paid">Paid</MenuItem>
                <MenuItem value="cancelled">Cancelled</MenuItem>
              </TextField>
            </Stack>
            <FileUploader
              label="Quote document (optional)"
              accept="application/pdf,image/*"
              bucket="documents"
              value={form.quote_document_url ? ({ url: form.quote_document_url, name: "quote", size: 0 } as UploadedFile) : null}
              onChange={(file) => setForm((f) => ({ ...f, quote_document_url: file?.url ?? "" }))}
            />
            <TextField label="Notes" value={form.notes} onChange={onChange("notes")} fullWidth multiline rows={2} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={create.isPending || update.isPending}>
            {initial ? "Save changes" : "Add work"}
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  export default AdditionalWorkDialog;
  ```

  Note: confirm `FileUploader`'s actual props by reading [src/components/common/FileUploader.tsx](../../../src/components/common/FileUploader.tsx). The above assumes its `value`/`onChange`/`bucket` API; adjust if different.

## Task 4.3: `AdditionalWorksTab`

**Files:**
- Create: `src/components/client-payments/AdditionalWorksTab.tsx`

- [ ] **Step 1: Write the component**

  ```tsx
  "use client";

  import React, { useState } from "react";
  import {
    Box, Button, Chip, Paper, Stack, Typography,
    Table, TableBody, TableCell, TableHead, TableRow,
  } from "@mui/material";
  import { Add } from "@mui/icons-material";
  import type { SiteAdditionalWork, AdditionalWorkStatus } from "@/types/site.types";
  import { ADDITIONAL_WORK_STATUS_LABELS } from "@/types/site.types";
  import { formatINR } from "@/components/payments/KpiTile";
  import { formatDateDDMMMYY } from "@/lib/formatters";
  import AdditionalWorkDialog from "./AdditionalWorkDialog";

  const STATUS_COLOR: Record<AdditionalWorkStatus, "default" | "info" | "success" | "warning"> = {
    quoted: "default",
    confirmed: "info",
    paid: "success",
    cancelled: "warning",
  };

  export interface AdditionalWorksTabProps {
    siteId: string;
    works: SiteAdditionalWork[];
    paidByWorkId: Map<string, number>;
  }

  export function AdditionalWorksTab({ siteId, works, paidByWorkId }: AdditionalWorksTabProps) {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<SiteAdditionalWork | undefined>(undefined);

    const open = (work?: SiteAdditionalWork) => {
      setEditing(work);
      setDialogOpen(true);
    };

    return (
      <Stack spacing={2}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="subtitle1">Additional Works ({works.length})</Typography>
          <Button startIcon={<Add />} onClick={() => open()}>Add Additional Work</Button>
        </Stack>

        {works.length === 0 ? (
          <Paper variant="outlined" sx={{ p: 3, textAlign: "center", color: "text.secondary" }}>
            <Typography>No additional works yet. Click "Add Additional Work" when client requests extra scope.</Typography>
          </Paper>
        ) : (
          <Paper variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Title</TableCell>
                  <TableCell align="right">Estimated</TableCell>
                  <TableCell align="right">Confirmed</TableCell>
                  <TableCell>Confirmed on</TableCell>
                  <TableCell>Expected pay</TableCell>
                  <TableCell align="right">Paid</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {works.map((w) => {
                  const isCancelled = w.status === "cancelled";
                  const sxRow = isCancelled
                    ? { textDecoration: "line-through", color: "text.disabled" }
                    : undefined;
                  const paid = paidByWorkId.get(w.id) ?? 0;
                  return (
                    <TableRow key={w.id} hover>
                      <TableCell sx={sxRow}>
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{w.title}</Typography>
                          {w.description && (
                            <Typography variant="caption" color="text.secondary">{w.description}</Typography>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell align="right" sx={{ ...sxRow, fontVariantNumeric: "tabular-nums" }}>
                        {formatINR(Number(w.estimated_amount))}
                      </TableCell>
                      <TableCell align="right" sx={{ ...sxRow, fontVariantNumeric: "tabular-nums" }}>
                        {w.confirmed_amount == null ? "—" : formatINR(Number(w.confirmed_amount))}
                      </TableCell>
                      <TableCell sx={sxRow}>{formatDateDDMMMYY(w.confirmation_date)}</TableCell>
                      <TableCell sx={sxRow}>{formatDateDDMMMYY(w.expected_payment_date)}</TableCell>
                      <TableCell align="right" sx={{ ...sxRow, fontVariantNumeric: "tabular-nums" }}>
                        {formatINR(paid)}
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          color={STATUS_COLOR[w.status]}
                          label={ADDITIONAL_WORK_STATUS_LABELS[w.status]}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Button size="small" onClick={() => open(w)}>Edit</Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Paper>
        )}

        <AdditionalWorkDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          siteId={siteId}
          initial={editing}
        />
      </Stack>
    );
  }

  export default AdditionalWorksTab;
  ```

## Task 4.4: `RecordPaymentDialog` with Apply-to dropdown

**Files:**
- Create: `src/components/client-payments/RecordPaymentDialog.tsx`

**Why:** Replaces the inline payment-add Dialog from the old page with a dedicated component that includes the Apply-to dropdown (General / Phase X / Extra Y).

- [ ] **Step 1: Identify the existing payment-create call**

  Read: `src/hooks/queries/useClientPayments.ts` to find the create-payment mutation hook name (e.g. `useCreateClientPayment`). Use it below.

- [ ] **Step 2: Write the component**

  Create `src/components/client-payments/RecordPaymentDialog.tsx`:

  ```tsx
  "use client";

  import React, { useEffect, useState } from "react";
  import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, TextField, Stack, MenuItem, Alert,
  } from "@mui/material";
  import type { Database } from "@/types/database.types";
  import type { SiteAdditionalWork } from "@/types/site.types";
  import { useCreateClientPayment } from "@/hooks/queries/useClientPayments"; // confirm name

  type PaymentMode = Database["public"]["Tables"]["client_payments"]["Row"]["payment_mode"];
  type PaymentPhase = Database["public"]["Tables"]["payment_phases"]["Row"];

  export interface RecordPaymentDialogProps {
    open: boolean;
    onClose: () => void;
    siteId: string;
    phases: PaymentPhase[];
    additionalWorks: SiteAdditionalWork[];
  }

  type ApplyToOption = { value: string; label: string };

  export function RecordPaymentDialog({
    open, onClose, siteId, phases, additionalWorks,
  }: RecordPaymentDialogProps) {
    const create = useCreateClientPayment();
    const [amount, setAmount] = useState("");
    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
    const [mode, setMode] = useState<PaymentMode>("cash");
    const [applyTo, setApplyTo] = useState<string>("general");
    const [notes, setNotes] = useState("");
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      if (!open) return;
      setAmount("");
      setPaymentDate(new Date().toISOString().slice(0, 10));
      setMode("cash");
      setApplyTo("general");
      setNotes("");
      setError(null);
    }, [open]);

    const applyOptions: ApplyToOption[] = [
      { value: "general", label: "General (untagged)" },
      ...phases.map((p) => ({
        value: `phase:${p.id}`,
        label: `Base Phase: ${p.phase_name ?? `#${p.sequence_order}`}`,
      })),
      ...additionalWorks
        .filter((w) => w.status !== "cancelled")
        .map((w) => ({ value: `work:${w.id}`, label: `Extra: ${w.title}` })),
    ];

    async function handleSave() {
      setError(null);
      const amountNum = Number(amount);
      if (!Number.isFinite(amountNum) || amountNum <= 0) {
        setError("Amount must be a positive number");
        return;
      }
      const paymentPhaseId = applyTo.startsWith("phase:") ? applyTo.slice("phase:".length) : null;
      const taggedAdditionalWorkId = applyTo.startsWith("work:") ? applyTo.slice("work:".length) : null;

      try {
        await create.mutateAsync({
          siteId,
          amount: amountNum,
          paymentDate,
          paymentMode: mode,
          notes: notes || null,
          paymentPhaseId,
          taggedAdditionalWorkId,
        } as never);
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    }

    return (
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>Record Client Payment</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField label="Amount (₹)" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} fullWidth required inputProps={{ min: 0, step: "0.01" }} />
              <TextField label="Payment date" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
            </Stack>
            <TextField select label="Mode" value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)} fullWidth>
              <MenuItem value="cash">Cash</MenuItem>
              <MenuItem value="upi">UPI</MenuItem>
              <MenuItem value="bank_transfer">Bank transfer</MenuItem>
              <MenuItem value="cheque">Cheque</MenuItem>
            </TextField>
            <TextField select label="Apply to" value={applyTo} onChange={(e) => setApplyTo(e.target.value)} fullWidth helperText="Defaults to general — only tag if it matters">
              {applyOptions.map((o) => (
                <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
              ))}
            </TextField>
            <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} fullWidth multiline rows={2} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={create.isPending}>
            Record payment
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  export default RecordPaymentDialog;
  ```

  Note: confirm the `useCreateClientPayment` hook name — if `useClientPayments.ts` exports a different name (e.g. `useAddClientPayment`), update the import.

## Task 4.5: `PaymentsReceivedTab`

**Files:**
- Create: `src/components/client-payments/PaymentsReceivedTab.tsx`

- [ ] **Step 1: Write the component**

  ```tsx
  "use client";

  import React, { useState } from "react";
  import {
    Box, Button, Chip, Paper, Stack, Typography,
    Table, TableBody, TableCell, TableHead, TableRow,
  } from "@mui/material";
  import { Add, Receipt } from "@mui/icons-material";
  import type { Database } from "@/types/database.types";
  import type { SiteAdditionalWork } from "@/types/site.types";
  import { formatINR } from "@/components/payments/KpiTile";
  import { formatDateDDMMMYY } from "@/lib/formatters";
  import RecordPaymentDialog from "./RecordPaymentDialog";

  type ClientPayment = Database["public"]["Tables"]["client_payments"]["Row"];
  type PaymentPhase = Database["public"]["Tables"]["payment_phases"]["Row"];

  export interface PaymentsReceivedTabProps {
    siteId: string;
    payments: ClientPayment[];
    phases: PaymentPhase[];
    additionalWorks: SiteAdditionalWork[];
  }

  function applyToLabel(
    payment: ClientPayment,
    phases: PaymentPhase[],
    works: SiteAdditionalWork[],
  ): { label: string; color: "default" | "info" | "primary" } {
    if (payment.tagged_additional_work_id) {
      const w = works.find((x) => x.id === payment.tagged_additional_work_id);
      return { label: w ? `Extra: ${w.title}` : "Extra (deleted)", color: "info" };
    }
    if (payment.payment_phase_id) {
      const p = phases.find((x) => x.id === payment.payment_phase_id);
      return { label: p ? `Phase: ${p.phase_name ?? `#${p.sequence_order}`}` : "Phase (deleted)", color: "primary" };
    }
    return { label: "General", color: "default" };
  }

  export function PaymentsReceivedTab({ siteId, payments, phases, additionalWorks }: PaymentsReceivedTabProps) {
    const [dialogOpen, setDialogOpen] = useState(false);

    return (
      <Stack spacing={2}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="subtitle1">Payments Received ({payments.length})</Typography>
          <Button startIcon={<Add />} onClick={() => setDialogOpen(true)}>Record Payment</Button>
        </Stack>

        {payments.length === 0 ? (
          <Paper variant="outlined" sx={{ p: 3, textAlign: "center", color: "text.secondary" }}>
            <Typography>No payments recorded yet.</Typography>
          </Paper>
        ) : (
          <Paper variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  <TableCell>Mode</TableCell>
                  <TableCell>Apply to</TableCell>
                  <TableCell>Receipt</TableCell>
                  <TableCell>Notes</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {payments
                  .slice()
                  .sort((a, b) => (b.payment_date ?? "").localeCompare(a.payment_date ?? ""))
                  .map((p) => {
                    const tag = applyToLabel(p, phases, additionalWorks);
                    return (
                      <TableRow key={p.id} hover>
                        <TableCell>{formatDateDDMMMYY(p.payment_date)}</TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                          {formatINR(Number(p.amount))}
                        </TableCell>
                        <TableCell><Chip size="small" label={p.payment_mode} /></TableCell>
                        <TableCell><Chip size="small" color={tag.color} label={tag.label} /></TableCell>
                        <TableCell>
                          {p.receipt_url ? (
                            <Button size="small" startIcon={<Receipt />} href={p.receipt_url} target="_blank">View</Button>
                          ) : "—"}
                        </TableCell>
                        <TableCell>{p.notes ?? "—"}</TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </Paper>
        )}

        <RecordPaymentDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          siteId={siteId}
          phases={phases}
          additionalWorks={additionalWorks}
        />
      </Stack>
    );
  }

  export default PaymentsReceivedTab;
  ```

- [ ] **Step 2: Build**

  Run: `npm run build`
  Expected: clean. The new components compile against the regenerated types.

- [ ] **Step 3: Commit Phase 4**

  ```bash
  git add src/components/client-payments/
  git commit -m "feat(client-payments): contract / additional-works / payments-received tab components"
  ```

---

# PHASE 5 — Page Rewrite

**Depends on Phases 2 + 3 + 4.**
Replaces the old `/site/client-payments` page wholesale.

## Task 5.1: Rewrite `page.tsx`

**Files:**
- Modify: `src/app/(main)/site/client-payments/page.tsx`

- [ ] **Step 1: Save the original for diff**

  ```bash
  cp "src/app/(main)/site/client-payments/page.tsx" "src/app/(main)/site/client-payments/page.tsx.bak"
  ```
  (We'll delete the .bak before committing.)

- [ ] **Step 2: Write the replacement**

  Replace the entire contents of `src/app/(main)/site/client-payments/page.tsx`:

  ```tsx
  "use client";

  import React, { useMemo, useState } from "react";
  import {
    Box, CircularProgress, Tab, Tabs, Typography, Alert,
  } from "@mui/material";
  import PageHeader from "@/components/layout/PageHeader";
  import { useSite } from "@/contexts/SiteContext";
  import { useSiteFinancialSummary } from "@/hooks/queries/useSiteFinancialSummary";
  import { useSiteAdditionalWorks } from "@/hooks/queries/useSiteAdditionalWorks";
  import { useClientPayments } from "@/hooks/queries/useClientPayments"; // confirm export name
  import { useSiteContract } from "@/hooks/queries/useClientPayments";   // OR move into a phase-specific hook; see Step 3
  import SiteMoneyOverviewHero from "@/components/client-payments/SiteMoneyOverviewHero";
  import ContractTab from "@/components/client-payments/ContractTab";
  import AdditionalWorksTab from "@/components/client-payments/AdditionalWorksTab";
  import PaymentsReceivedTab from "@/components/client-payments/PaymentsReceivedTab";

  type TabKey = "contract" | "additional" | "payments";

  const TAB_STORAGE_KEY = "client-payments.activeTab";

  export default function ClientPaymentsPage() {
    const { selectedSite } = useSite();
    const siteId = selectedSite?.id;

    const [tab, setTab] = useState<TabKey>(() => {
      if (typeof window === "undefined") return "contract";
      return ((window.localStorage.getItem(TAB_STORAGE_KEY) as TabKey) ?? "contract");
    });

    const setTabPersistent = (next: TabKey) => {
      setTab(next);
      try { window.localStorage.setItem(TAB_STORAGE_KEY, next); } catch { /* ignore */ }
    };

    const summaryQ  = useSiteFinancialSummary(siteId);
    const worksQ    = useSiteAdditionalWorks(siteId);
    const paymentsQ = useClientPayments(siteId); // expects shape { data: ClientPayment[] }
    // Phase data: read directly from supabase via a small inline hook OR reuse
    // an existing hook that lists phases for a site. If none exists, the
    // ContractTab can simply receive [] until a follow-up adds the phases hook.
    const phases: never[] = [];
    const paidByPhaseId = new Map<string, number>();

    if (!siteId) {
      return (
        <Box sx={{ p: 3 }}>
          <Alert severity="info">Select a site from the picker to view client payments.</Alert>
        </Box>
      );
    }

    const loading = summaryQ.isLoading || worksQ.isLoading || paymentsQ.isLoading;
    const errorObj = summaryQ.error ?? worksQ.error ?? paymentsQ.error;

    const works = worksQ.data ?? [];
    const payments = paymentsQ.data ?? [];

    const paidByWorkId = useMemo(() => {
      const m = new Map<string, number>();
      for (const p of payments) {
        if (p.tagged_additional_work_id) {
          m.set(p.tagged_additional_work_id, (m.get(p.tagged_additional_work_id) ?? 0) + Number(p.amount ?? 0));
        }
      }
      return m;
    }, [payments]);

    return (
      <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <PageHeader title={`Client Payments — ${selectedSite?.name ?? ""}`} />

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
            <CircularProgress />
          </Box>
        ) : errorObj ? (
          <Box sx={{ p: 3 }}>
            <Alert severity="error">{(errorObj as Error).message}</Alert>
          </Box>
        ) : (
          <Box sx={{ p: { xs: 1.5, sm: 2 } }}>
            {summaryQ.data && (
              <SiteMoneyOverviewHero siteId={siteId} summary={summaryQ.data} />
            )}

            <Tabs
              value={tab}
              onChange={(_, v: TabKey) => setTabPersistent(v)}
              sx={{ borderBottom: 1, borderColor: "divider", mb: 2 }}
            >
              <Tab value="contract"   label="Contract" />
              <Tab value="additional" label={`Additional Works${works.length ? ` (${works.length})` : ""}`} />
              <Tab value="payments"   label={`Payments Received${payments.length ? ` (${payments.length})` : ""}`} />
            </Tabs>

            {tab === "contract" && (
              <ContractTab
                baseContract={summaryQ.data?.baseContract ?? 0}
                contractDocumentUrl={null /* read sites.contract_document_url via a small query if needed */}
                phases={phases}
                paidByPhaseId={paidByPhaseId}
              />
            )}
            {tab === "additional" && (
              <AdditionalWorksTab siteId={siteId} works={works} paidByWorkId={paidByWorkId} />
            )}
            {tab === "payments" && (
              <PaymentsReceivedTab
                siteId={siteId}
                payments={payments}
                phases={phases}
                additionalWorks={works}
              />
            )}
          </Box>
        )}
      </Box>
    );
  }
  ```

  **Notes for the implementer:**
  - `ContractTab` is read-only in v1. Editing the base contract amount lives on `/company/sites`. Phase creation/edit is deferred to a follow-up plan.
  - The `useClientPayments` hook needs to expose a list query for the site. If the existing hook only exposes mutations, either extend it with a list query or inline a small `useQuery` here.
  - Phase data: if no `usePaymentPhases` hook exists yet, either inline a tiny `useQuery` or leave `phases` as an empty array in v1 (matches the "optional phases" spec decision — the `Alert` in `ContractTab` handles the empty case gracefully).
  - `contractDocumentUrl`: in v1 it's `null`. To surface the existing `sites.contract_document_url` value, add a small inline `useQuery` reading that single field; otherwise leave for a follow-up.

- [ ] **Step 3: Build**

  Run: `npm run build`
  Expected: clean. Fix any TS errors that surface from the rewrite.

- [ ] **Step 4: Delete the backup**

  ```bash
  rm "src/app/(main)/site/client-payments/page.tsx.bak"
  ```

## Task 5.2: Verify with Playwright MCP

**Files:** none (verification only)

**Why:** Per CLAUDE.md "After UI Changes" rules, Playwright walkthrough is required.

- [ ] **Step 1: Start dev server (if not running)**

  Run: `npm run dev` (background)

- [ ] **Step 2: Auto-login and navigate**

  Use `playwright_browser_navigate` → `http://localhost:3000/dev-login`. Wait for redirect. Then navigate to `/site/client-payments`.

- [ ] **Step 3: Take a screenshot of the new page**

  Use `playwright_browser_take_screenshot`. Save as `verify-client-payments-v1.png`.

- [ ] **Step 4: Walk through the spec verification list**

  Run each step from the **Verification** section of the spec ([docs/superpowers/specs/2026-05-03-client-payments-redesign-design.md](../specs/2026-05-03-client-payments-redesign-design.md)) — items 1–9. (Item 10 is Phase 6.)

  For each: take a screenshot, note pass/fail, and fix any issue (hydration warnings, aria-hidden warnings, broken math) before moving on.

- [ ] **Step 5: Run console-message check**

  Use `playwright_browser_console_messages`. Filter for `error` and `warning` levels.
  Expected: zero React hydration warnings, zero aria-hidden warnings, zero unhandled promise rejections.

- [ ] **Step 6: Mobile viewport test**

  Use `playwright_browser_resize` to 375 × 812. Reload `/site/client-payments`. Confirm hero collapses to single-row showing "Remaining from Client". Take screenshot.

- [ ] **Step 7: Close the browser**

  Use `playwright_browser_close`.

- [ ] **Step 8: Commit Phase 5**

  ```bash
  git add "src/app/(main)/site/client-payments/page.tsx"
  git commit -m "feat(client-payments): rewrite page with hero + tabs + new components"
  ```

---

# PHASE 6 — Site Dashboard Mini Card

**Depends on Phase 3.**

## Task 6.1: Build the mini card

**Files:**
- Create: `src/components/site/SiteMoneyMiniCard.tsx`

- [ ] **Step 1: Write the component**

  ```tsx
  "use client";

  import React from "react";
  import { Box, Paper, Typography, Skeleton, Button, Stack } from "@mui/material";
  import Link from "next/link";
  import { KpiTile, formatINR } from "@/components/payments/KpiTile";
  import { useSiteFinancialSummary } from "@/hooks/queries/useSiteFinancialSummary";

  export interface SiteMoneyMiniCardProps {
    siteId: string;
  }

  export function SiteMoneyMiniCard({ siteId }: SiteMoneyMiniCardProps) {
    const q = useSiteFinancialSummary(siteId);

    return (
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="overline" color="text.secondary">Site Money Overview</Typography>
          <Button component={Link} href="/site/client-payments" size="small">Open</Button>
        </Stack>
        {q.isLoading || !q.data ? (
          <Skeleton variant="rectangular" height={80} />
        ) : (
          <Box
            sx={{
              display: "grid",
              gap: 1,
              gridTemplateColumns: { xs: "repeat(3, minmax(0, 1fr))" },
            }}
          >
            <KpiTile label="Total Contract"        variant="neutral" value={formatINR(q.data.totalContract)} />
            <KpiTile label="Remaining from Client" variant="warning" value={formatINR(q.data.remainingFromClient)} />
            <KpiTile label="Net In Hand"           variant={q.data.netInHand >= 0 ? "success" : "error"} value={formatINR(q.data.netInHand)} />
          </Box>
        )}
      </Paper>
    );
  }

  export default SiteMoneyMiniCard;
  ```

- [ ] **Step 2: Mount on `/site` dashboard**

  In `src/app/(main)/site/page.tsx`, add `<SiteMoneyMiniCard siteId={selectedSite.id} />` somewhere in the dashboard layout (best near the top so the engineer sees it first). Wrap in a guard for when `selectedSite` is null.

- [ ] **Step 3: Verify with Playwright**

  Navigate to `/site`, take a screenshot, confirm the card renders and the numbers match the full hero on `/site/client-payments` (open both in tabs to compare).

- [ ] **Step 4: Commit Phase 6**

  ```bash
  git add "src/components/site/SiteMoneyMiniCard.tsx" "src/app/(main)/site/page.tsx"
  git commit -m "feat(site-dashboard): site money overview mini card"
  ```

---

# PHASE 7 — Production Deploy (gated)

**Depends on Phases 1–6 verified locally.**

This phase has a hard human gate.

## Task 7.1: Final pre-deploy checks

- [ ] **Step 1: Full build**

  Run: `npm run build`
  Expected: zero errors, zero warnings.

- [ ] **Step 2: Full test suite**

  Run: `npm run test`
  Expected: all tests pass.

- [ ] **Step 3: Local migration sanity**

  Run: `npm run db:reset` one more time, then re-run the Phase 5 Playwright walkthrough headlessly. Expected: no regressions.

## Task 7.2: Apply migration to production (HUMAN APPROVAL REQUIRED)

**Files:** none

**Why:** Per CLAUDE.md, Supabase production writes must be confirmed by the user. Schema changes are irreversible without a manual rollback migration.

- [ ] **Step 1: Show the user the exact migration that will run**

  Output the file contents of `supabase/migrations/20260503100000_site_additional_works.sql` and the diff lines on `client_payments`. Ask explicitly:

  > "About to apply migration `20260503100000_site_additional_works.sql` to PRODUCTION Supabase. This adds one new table, two columns + check constraint to `client_payments`, and one function. Approve?"

  **DO NOT proceed without an explicit "yes".**

- [ ] **Step 2: Apply via Supabase MCP**

  After approval, use `mcp__supabase__apply_migration` with the migration name and SQL contents.
  Expected: success response, migration appears in `mcp__supabase__list_migrations` output.

- [ ] **Step 3: Smoke-test the production function**

  Use `mcp__supabase__execute_sql`:
  ```sql
  select get_site_supervisor_cost(id) from sites limit 3;
  ```
  Expected: three numeric rows, no error.

## Task 7.3: Push branch and open PR

- [ ] **Step 1: Push the branch**

  ```bash
  git push -u origin feature/client-payments-redesign
  ```

- [ ] **Step 2: Open a PR** (only if user explicitly asks; otherwise stop here and let them open it)

---

## Self-review notes

- All steps include either exact file paths + complete code, or exact shell commands + expected output.
- No "TBD"/"TODO" placeholders (the two TODO comments inside `ContractTab` callbacks in Task 5.1 are intentional v1 limitations explicitly called out, not plan placeholders).
- Type names used in later tasks (`SiteAdditionalWork`, `AdditionalWorkStatus`, `SiteFinancialSummary`) are defined in Tasks 1.4 and 2.2.
- Spec coverage:
  - Page structure → Phase 5 ✓
  - Site Money Overview hero → Phase 3 ✓
  - `site_additional_works` data model → Phase 1 ✓
  - Hybrid payment tagging → Phase 1 (schema), Phase 2 (hook update), Phase 4 (RecordPaymentDialog UI) ✓
  - Supervisor cost source → Phase 1 (function), Phase 2 (hook), Phase 3 (tile) ✓
  - Site dashboard mini card → Phase 6 ✓
  - Verification (Playwright walkthrough) → Phases 5.2 + 6.3 + 7.1 ✓
  - DD MMM YY date format → Phase 1 (helper) + used in Phase 4 tabs ✓
- The plan does not introduce frontend abstractions beyond what the spec requires. Each new component has one clear responsibility and a focused props surface.
