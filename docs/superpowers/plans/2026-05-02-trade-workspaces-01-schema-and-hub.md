# Trade Workspaces — Plan 01: Schema + Trades Hub shell

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the additive schema dimension (`trade_category_id` + `labor_tracking_mode` + `is_in_house` on `subcontracts`; new `subcontract_role_rates`, `subcontract_headcount_attendance`, `v_subcontract_reconciliation`; archive flags on `labor_categories`), backfill an in-house Civil contract for every site that has orphan civil attendance, and ship a new `/site/trades` hub page that lists trades as cards. Hub cards link out to the existing `/site/subcontracts/<id>` flow as a temporary bridge — Plan 02 replaces that with the dedicated Trade Workspace.

**Architecture:** One migration (schema + seed + backfill in a single file so we can roll it back atomically), one new hook (`useTrades`), one new page (`/site/trades`), one new card component, one side-nav entry. No existing route is removed; no existing data is destroyed. The end-state of this plan is "you can navigate to Trades and see your civil + any existing subcontracts grouped per trade." Headcount entry, reconciliation banner, admin settings, and cross-trade roll-up are deferred to subsequent plans.

**Tech Stack:** Next.js 15 (app router), React 18, MUI v7, `@tanstack/react-query`, Supabase (PostgreSQL), Tailwind, Vitest + React Testing Library, Playwright MCP for visual verification, Supabase MCP for migration apply.

**Spec:** [docs/superpowers/specs/2026-05-02-trade-workspaces-design.md](../specs/2026-05-02-trade-workspaces-design.md)

**Plan series:**
- **01 (this plan)** — Schema + Trades hub shell.
- 02 — Trade Workspace internals (per-contract tabs: Attendance · Advances & Money · Settlements · Ledger · Notes; replaces the temporary `/site/subcontracts/<id>` bridge).
- 03 — Headcount attendance + Role Rate Card + Reconciliation banner.
- 04 — Company admin: Trades & Roles settings tab inside `/company/laborers`.
- 05 — Cross-trade `/site/payments` read-only roll-up + Dashboard "Trade breakdown" card; remove `/site/attendance` and `/site/subcontracts` entries from nav.

---

## Files Touched

| Path | Phase | Nature |
|---|---|---|
| `supabase/migrations/20260502120000_add_trade_dimension.sql` | 1 | **New** — schema + seed + backfill in one atomic migration. |
| `src/types/database.types.ts` | 1 | Regenerated — Supabase-generated types pick up new columns/tables. |
| `src/types/trade.types.ts` | 2 | **New** — `TradeCategory`, `Trade`, `TradeContract`, `LaborTrackingMode`. Hand-rolled UI types (don't pollute `settlement.types.ts`). |
| `src/hooks/queries/useTrades.ts` | 2 | **New** — `useSiteTrades(siteId)` returns trades grouped by category for a site, including the in-house Civil contract. |
| `src/hooks/queries/useTrades.test.ts` | 2 | **New** — unit tests for grouping logic. |
| `src/components/trades/TradeCard.tsx` | 3 | **New** — card showing trade name, mesthri/specialist name, quoted/paid/balance for the active contract; "Add contract" CTA when empty. |
| `src/components/trades/TradeCard.test.tsx` | 3 | **New** — render tests for populated + empty + multiple-contracts states. |
| `src/components/trades/TradesEmptyState.tsx` | 3 | **New** — shown when site has no trades at all (only on a brand-new site). |
| `src/app/(main)/site/trades/page.tsx` | 3 | **New** — Trades hub. Reads `useSiteTrades`, renders one `TradeCard` per category. |
| `src/components/layout/MainLayout.tsx:138-150` | 3 | Edit — insert "Trades" as the first item in the Workforce category (above Attendance). Keep Attendance and Salary Settlements visible until Plan 05 removes them. |

**Files NOT touched** (deliberately deferred):
- `src/app/(main)/site/subcontracts/page.tsx` — kept as the bridge target for trade card clicks until Plan 02 ships the dedicated workspace.
- `src/app/(main)/site/payments/payments-content.tsx` — has uncommitted WIP. Plan 05 will touch it.
- `src/components/payments/SalarySliceHero.tsx` and the three untracked `*Hero.tsx` / `KpiTile.tsx` — uncommitted WIP. Out of scope.
- `src/hooks/queries/useSubcontracts.ts` — extending it would entangle the new `trade_category_id` field with existing callers. We add `useTrades` as a sibling hook instead; `useSiteSubcontracts` keeps its current shape.

---

## Pre-flight

- [ ] **Step 1: Verify branch + handle in-flight WIP**

  Run: `git status --short`
  Expected output should match (or be a subset of) the WIP captured at plan-write time:
  ```
   M .claude/settings.local.json
   M src/app/(main)/site/payments/payments-content.tsx
   M src/components/payments/SalarySliceHero.tsx
  ?? src/components/payments/AllSettlementsHero.tsx
  ?? src/components/payments/DailyMarketHero.tsx
  ?? src/components/payments/KpiTile.tsx
  ```

  Decide WITH THE USER before continuing:
  - Option A — commit the WIP to `main` first as its own commit (small, focused message), THEN branch.
  - Option B — `git stash push -u -m "wip: salary settlement hero refactor"` and branch off clean main; pop the stash later on a separate branch.

  Do NOT proceed past this step until the WIP has been committed or stashed. The `payments-content.tsx` edit overlaps with Plan 05's scope; stale uncommitted work there will become a four-way merge conflict.

- [ ] **Step 2: Create feature branch**

  Run:
  ```bash
  git checkout -b feature/trade-workspaces-01-schema-and-hub
  ```
  Expected: `Switched to a new branch 'feature/trade-workspaces-01-schema-and-hub'`.

- [ ] **Step 3: Run baseline test suite**

  Run: `npm run test`
  Expected: capture the pass/fail summary so any regression introduced by this plan is identifiable. Pre-existing failures are OK; just note them.

- [ ] **Step 4: Run baseline build**

  Run: `npm run build`
  Expected: clean compile. If `main` is broken, do not proceed.

- [ ] **Step 5: Confirm local Supabase is running**

  Run: `npm run db:start` (idempotent — if already running it's a no-op).
  Expected: local stack at `http://127.0.0.1:54321`. If not, follow the README to start Docker first.

- [ ] **Step 6: Inspect existing schema for `labor_categories` / `labor_roles`**

  Use the `supabase` MCP: `mcp__supabase__list_tables` and inspect rows with:
  ```sql
  SELECT id, name FROM labor_categories ORDER BY name;
  SELECT id, name, category_id, default_daily_rate, is_market_role
    FROM labor_roles ORDER BY category_id, name;
  ```
  Note: which categories already exist (so the seed is truly idempotent), and which roles already exist (so we don't double-seed Civil's Mason / Helper rows).

- [ ] **Step 7: Snapshot prod data row counts (for backfill verification)**

  Use the `supabase` MCP `mcp__supabase__execute_sql` against PRODUCTION (read-only — no writes):
  ```sql
  SELECT
    (SELECT COUNT(*) FROM sites) AS site_count,
    (SELECT COUNT(*) FROM daily_attendance WHERE subcontract_id IS NULL) AS orphan_attendance_rows,
    (SELECT COUNT(*) FROM settlement_groups WHERE subcontract_id IS NULL) AS orphan_settlement_rows,
    (SELECT COUNT(DISTINCT site_id) FROM daily_attendance WHERE subcontract_id IS NULL) AS sites_needing_civil_backfill;
  ```
  Save the output. After local backfill, the same query in local should return `orphan_*=0` and the new in-house Civil count should equal `sites_needing_civil_backfill`.

- [ ] **Step 8: Reset local DB to a known state**

  Run: `npm run db:reset`
  Expected: clean schema applied; existing migrations reapplied. Then optionally restore a recent prod data dump per CLAUDE.md "Refreshing Local Data from Production" if you want a realistic backfill test target.

---

# PHASE 1 — Schema + seed + backfill migration

**Independent. Mergeable alone. Zero UI change.** Adds the trade dimension, two new tables, one view, six seeded labor categories, default roles per category, archive flags on `labor_categories`, and creates a "Civil — In-house" subcontract per site that has orphan civil attendance — re-linking that attendance and settlement_groups to the new contract. Existing code paths keep working unchanged because every new column is nullable or defaulted and the existing `subcontracts` rows are untouched.

## Task 1.1: Author the migration

**Files:**
- Create: `supabase/migrations/20260502120000_add_trade_dimension.sql`

**Why:** A single atomic migration keeps schema + seed + backfill rollback-able as one unit. If the backfill fails, the schema doesn't end up in a half-applied state. Splitting into multiple migration files would also work but adds the risk of someone applying the schema migration to prod without the backfill, leaving production with NULL `trade_category_id` on existing subcontracts AND orphan civil attendance — exactly the asymmetry we're trying to remove.

- [ ] **Step 1: Inspect the schema reference for column types**

  Read the labor_categories / labor_roles definitions in `supabase/migrations/00000000000000_initial_schema.sql` so the FK column types and the seeded shape match. Note column names exactly: `labor_categories(id uuid, name text, ...)`, `labor_roles(id uuid, category_id uuid, name text, default_daily_rate numeric, is_market_role boolean, ...)`.

- [ ] **Step 2: Write the migration SQL**

  Create `supabase/migrations/20260502120000_add_trade_dimension.sql`:

  ```sql
  -- Trade Workspaces — Plan 01 schema migration.
  -- Adds the trade dimension to subcontracts, role-rate card + per-role headcount
  -- tables, the reconciliation view, archive flags on labor_categories, and
  -- creates a "Civil — In-house" subcontract per site that owns orphan civil
  -- attendance + settlement rows (so every trade — civil included — is a
  -- first-class subcontract going forward).

  BEGIN;

  -- ---------------------------------------------------------------
  -- 1. Archive lifecycle flags on labor_categories
  -- ---------------------------------------------------------------
  ALTER TABLE public.labor_categories
    ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_system_seed boolean NOT NULL DEFAULT false;

  COMMENT ON COLUMN public.labor_categories.is_system_seed IS
    'True for the seven system-seeded trades (civil, painting, tiling, electrical, plumbing, carpentry, other). System-seed rows can be archived but not deleted.';
  COMMENT ON COLUMN public.labor_categories.is_archived IS
    'When true, the category is hidden from the trade picker for new contracts. Existing contracts keep working.';

  -- ---------------------------------------------------------------
  -- 2. Seed trade categories (idempotent)
  -- ---------------------------------------------------------------
  INSERT INTO public.labor_categories (id, name, is_system_seed)
  VALUES
    (gen_random_uuid(), 'Civil',      true),
    (gen_random_uuid(), 'Painting',   true),
    (gen_random_uuid(), 'Tiling',     true),
    (gen_random_uuid(), 'Electrical', true),
    (gen_random_uuid(), 'Plumbing',   true),
    (gen_random_uuid(), 'Carpentry',  true),
    (gen_random_uuid(), 'Other',      true)
  ON CONFLICT (name) DO UPDATE SET is_system_seed = true;
  -- Note: ON CONFLICT requires labor_categories.name to be UNIQUE. If it
  -- isn't, add the unique index in this migration before the INSERT:
  --   CREATE UNIQUE INDEX IF NOT EXISTS labor_categories_name_key
  --     ON public.labor_categories (name);

  -- ---------------------------------------------------------------
  -- 3. Seed default roles per trade (idempotent)
  -- ---------------------------------------------------------------
  WITH cats AS (
    SELECT id, name FROM public.labor_categories
     WHERE name IN ('Painting','Tiling','Electrical','Plumbing','Carpentry')
  )
  INSERT INTO public.labor_roles (id, category_id, name, default_daily_rate, is_market_role)
  SELECT gen_random_uuid(), c.id, r.name, r.rate, false
    FROM cats c
    JOIN (VALUES
      ('Painting',   'Technical Painter',     800),
      ('Painting',   'Helper Painter',        500),
      ('Tiling',     'Technical Tiler',      1000),
      ('Tiling',     'Helper Tiler',          600),
      ('Electrical', 'Technical Electrician',1200),
      ('Electrical', 'Wireman',               900),
      ('Electrical', 'Helper Electrician',    600),
      ('Plumbing',   'Plumber',              1000),
      ('Plumbing',   'Helper Plumber',        600),
      ('Carpentry',  'Carpenter',            1100),
      ('Carpentry',  'Helper Carpenter',      600)
    ) AS r(category_name, name, rate)
      ON r.category_name = c.name
   WHERE NOT EXISTS (
     SELECT 1 FROM public.labor_roles lr
      WHERE lr.category_id = c.id AND lr.name = r.name
   );

  -- ---------------------------------------------------------------
  -- 4. Trade dimension on subcontracts
  -- ---------------------------------------------------------------
  ALTER TABLE public.subcontracts
    ADD COLUMN IF NOT EXISTS trade_category_id uuid REFERENCES public.labor_categories(id),
    ADD COLUMN IF NOT EXISTS labor_tracking_mode text
      CHECK (labor_tracking_mode IN ('detailed','headcount','mesthri_only'))
      DEFAULT 'detailed',
    ADD COLUMN IF NOT EXISTS is_in_house boolean NOT NULL DEFAULT false;

  COMMENT ON COLUMN public.subcontracts.trade_category_id IS
    'FK to labor_categories — the trade this contract belongs to (Civil, Painting, etc). NULL on legacy rows; set by backfill for in-house Civil and required on new rows.';
  COMMENT ON COLUMN public.subcontracts.labor_tracking_mode IS
    'How attendance is recorded: detailed (per-laborer + in/out time), headcount (per-role daily count), mesthri_only (no daily count).';
  COMMENT ON COLUMN public.subcontracts.is_in_house IS
    'True for the auto-created "Civil — In-house" contract per site. UI surfaces these slightly differently (no mesthri name, no close-contract action).';

  -- ---------------------------------------------------------------
  -- 5. Per-contract role rate card
  -- ---------------------------------------------------------------
  CREATE TABLE IF NOT EXISTS public.subcontract_role_rates (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subcontract_id  uuid NOT NULL REFERENCES public.subcontracts(id) ON DELETE CASCADE,
    role_id         uuid NOT NULL REFERENCES public.labor_roles(id),
    daily_rate      numeric(10,2) NOT NULL CHECK (daily_rate >= 0),
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (subcontract_id, role_id)
  );

  COMMENT ON TABLE public.subcontract_role_rates IS
    'Per-contract daily rate per role. Defaults sourced from labor_roles.default_daily_rate at creation; engineer can override per contract. Drives the reconciliation calculation (units × rate).';

  -- ---------------------------------------------------------------
  -- 6. Per-day per-role headcount attendance
  -- ---------------------------------------------------------------
  CREATE TABLE IF NOT EXISTS public.subcontract_headcount_attendance (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subcontract_id  uuid NOT NULL REFERENCES public.subcontracts(id) ON DELETE CASCADE,
    attendance_date date NOT NULL,
    role_id         uuid NOT NULL REFERENCES public.labor_roles(id),
    units           numeric(4,2) NOT NULL CHECK (units >= 0),
    note            text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid REFERENCES public.users(id),
    UNIQUE (subcontract_id, attendance_date, role_id)
  );
  CREATE INDEX IF NOT EXISTS subcontract_headcount_attendance_contract_date_idx
    ON public.subcontract_headcount_attendance (subcontract_id, attendance_date);

  COMMENT ON TABLE public.subcontract_headcount_attendance IS
    'One row per role per day per contract. Used when subcontracts.labor_tracking_mode = ''headcount''. Units can be fractional (e.g. 1.5 = one full + one half day).';

  -- ---------------------------------------------------------------
  -- 7. Reconciliation snapshot view
  -- ---------------------------------------------------------------
  CREATE OR REPLACE VIEW public.v_subcontract_reconciliation AS
  SELECT
    sc.id                                       AS subcontract_id,
    sc.site_id,
    sc.trade_category_id,
    sc.labor_tracking_mode,
    sc.total_value                              AS quoted_amount,
    COALESCE(SUM(sp.amount), 0)                 AS amount_paid,
    COALESCE((
      SELECT SUM(sha.units * srr.daily_rate)
        FROM public.subcontract_headcount_attendance sha
        JOIN public.subcontract_role_rates srr
          ON srr.subcontract_id = sha.subcontract_id
         AND srr.role_id        = sha.role_id
       WHERE sha.subcontract_id = sc.id
    ), 0)                                       AS implied_labor_value_headcount,
    COALESCE((
      SELECT SUM(da.units_worked * COALESCE(da.daily_rate, l.daily_rate))
        FROM public.daily_attendance da
        LEFT JOIN public.laborers l ON l.id = da.laborer_id
       WHERE da.subcontract_id = sc.id
    ), 0)                                       AS implied_labor_value_detailed
  FROM public.subcontracts sc
  LEFT JOIN public.subcontract_payments sp ON sp.subcontract_id = sc.id
  GROUP BY sc.id, sc.site_id, sc.trade_category_id, sc.labor_tracking_mode, sc.total_value;

  COMMENT ON VIEW public.v_subcontract_reconciliation IS
    'One row per subcontract with quoted, paid, and implied labor value (both modes). Used by the reconciliation banner — Plan 03 wires the UI.';

  -- ---------------------------------------------------------------
  -- 8. Backfill: in-house Civil contract per site with orphan civil work
  -- ---------------------------------------------------------------
  -- For every site that has daily_attendance rows or settlement_groups rows
  -- with NULL subcontract_id, create one "Civil — In-house" subcontract
  -- (is_in_house=true, trade=Civil, mode=detailed, status=active) and re-link
  -- the orphan rows to it. Idempotent — guarded by NOT EXISTS so re-running
  -- the migration won't create duplicates.

  WITH civil_cat AS (
    SELECT id FROM public.labor_categories WHERE name = 'Civil' LIMIT 1
  ),
  sites_needing_backfill AS (
    SELECT DISTINCT site_id
      FROM (
        SELECT site_id FROM public.daily_attendance WHERE subcontract_id IS NULL
        UNION
        SELECT site_id FROM public.settlement_groups WHERE subcontract_id IS NULL
      ) u
     WHERE site_id IS NOT NULL
  ),
  inserted_civil AS (
    INSERT INTO public.subcontracts (
      id, site_id, trade_category_id, contract_type,
      title, is_in_house, labor_tracking_mode, status, total_value
    )
    SELECT
      gen_random_uuid(),
      s.site_id,
      (SELECT id FROM civil_cat),
      'mesthri',
      'Civil — In-house',
      true,
      'detailed',
      'active',
      0
      FROM sites_needing_backfill s
     WHERE NOT EXISTS (
       SELECT 1 FROM public.subcontracts sc
        WHERE sc.site_id = s.site_id AND sc.is_in_house = true
     )
    RETURNING id, site_id
  )
  -- Re-link orphan attendance to the new (or pre-existing) in-house Civil contract.
  UPDATE public.daily_attendance da
     SET subcontract_id = ih.id
    FROM (
      SELECT id, site_id FROM public.subcontracts WHERE is_in_house = true
    ) ih
   WHERE da.site_id = ih.site_id
     AND da.subcontract_id IS NULL;

  -- Re-link orphan settlement_groups likewise.
  UPDATE public.settlement_groups sg
     SET subcontract_id = ih.id
    FROM (
      SELECT id, site_id FROM public.subcontracts WHERE is_in_house = true
    ) ih
   WHERE sg.site_id = ih.site_id
     AND sg.subcontract_id IS NULL;

  COMMIT;
  ```

- [ ] **Step 3: Apply the migration locally**

  Run: `npm run db:reset` (this drops + reapplies all migrations including the new one).
  Expected: completes with no errors. If the seed conflicts because `labor_categories.name` isn't unique, add the unique index commented in Step 2 above the INSERT and re-run.

- [ ] **Step 4: Verify schema applied — read columns**

  Use Supabase MCP `mcp__supabase__execute_sql` (local):
  ```sql
  SELECT column_name, data_type, column_default
    FROM information_schema.columns
   WHERE table_name = 'subcontracts'
     AND column_name IN ('trade_category_id','labor_tracking_mode','is_in_house');
  ```
  Expected: 3 rows. Defaults: `trade_category_id NULL`, `labor_tracking_mode 'detailed'::text`, `is_in_house false`.

- [ ] **Step 5: Verify the seven trade categories exist**

  ```sql
  SELECT name, is_system_seed, is_archived
    FROM public.labor_categories
   WHERE is_system_seed = true
   ORDER BY name;
  ```
  Expected: 7 rows — Carpentry, Civil, Electrical, Other, Painting, Plumbing, Tiling — all `is_system_seed=true`, `is_archived=false`.

- [ ] **Step 6: Verify default roles for non-civil trades**

  ```sql
  SELECT lc.name AS trade, lr.name AS role, lr.default_daily_rate
    FROM public.labor_roles lr
    JOIN public.labor_categories lc ON lc.id = lr.category_id
   WHERE lc.name IN ('Painting','Tiling','Electrical','Plumbing','Carpentry')
   ORDER BY lc.name, lr.name;
  ```
  Expected: 11 rows matching the seed in step 2 of Task 1.1.

- [ ] **Step 7: Verify the reconciliation view is queryable**

  ```sql
  SELECT subcontract_id, quoted_amount, amount_paid,
         implied_labor_value_headcount, implied_labor_value_detailed
    FROM public.v_subcontract_reconciliation
   LIMIT 5;
  ```
  Expected: returns rows (or 0 rows on empty DB) with no error. Numeric columns should be 0 not NULL where there's no data.

- [ ] **Step 8: Verify backfill correctness**

  Compare against the snapshot from Pre-flight Step 7:
  ```sql
  SELECT
    (SELECT COUNT(*) FROM public.daily_attendance WHERE subcontract_id IS NULL) AS orphan_attendance,
    (SELECT COUNT(*) FROM public.settlement_groups WHERE subcontract_id IS NULL) AS orphan_settlements,
    (SELECT COUNT(*) FROM public.subcontracts WHERE is_in_house = true) AS in_house_civil_contracts,
    (SELECT COUNT(DISTINCT site_id) FROM public.subcontracts WHERE is_in_house = true) AS sites_with_in_house_civil;
  ```
  Expected (assuming you restored prod data per Pre-flight Step 8): `orphan_attendance = 0`, `orphan_settlements = 0`, `in_house_civil_contracts = sites_needing_civil_backfill` from the prod snapshot, `sites_with_in_house_civil = in_house_civil_contracts` (one in-house contract per site, no duplicates).

- [ ] **Step 9: Verify migration idempotence**

  Run: `npm run db:reset` AGAIN.
  Expected: completes without error. The seed `INSERT ... ON CONFLICT (name) DO UPDATE` and the backfill `WHERE NOT EXISTS` guards keep this safe. Re-run query from Step 8 — counts should be identical.

- [ ] **Step 10: Regenerate TypeScript types**

  Use Supabase MCP: `mcp__supabase__generate_typescript_types` and write the result to `src/types/database.types.ts`.
  Expected: file regenerated; `subcontracts` row type now includes `trade_category_id`, `labor_tracking_mode`, `is_in_house`; new tables `subcontract_role_rates` and `subcontract_headcount_attendance` appear; `v_subcontract_reconciliation` shows up under `Views`.

- [ ] **Step 11: Build to confirm types compile**

  Run: `npm run build`
  Expected: clean. If any existing call site narrows the subcontracts row type and now complains about new fields, fix by widening the type or selecting only the columns the caller actually uses. Do NOT add `?: undefined` casts to silence the compiler — fix the type properly.

- [ ] **Step 12: Commit Phase 1**

  ```bash
  git add supabase/migrations/20260502120000_add_trade_dimension.sql \
          src/types/database.types.ts
  git commit -m "$(cat <<'EOF'
  feat(trades): add trade dimension to subcontracts + backfill in-house civil

  - New columns subcontracts.{trade_category_id, labor_tracking_mode, is_in_house}.
  - New tables subcontract_role_rates, subcontract_headcount_attendance.
  - New view v_subcontract_reconciliation for paid-vs-labor-done banner.
  - Archive flags on labor_categories (is_system_seed, is_archived).
  - Seeded 7 trade categories + default roles + rates for non-civil trades.
  - Backfill: per-site "Civil — In-house" subcontract that adopts orphan
    daily_attendance and settlement_groups rows, making every trade —
    civil included — a first-class subcontract going forward.

  Spec: docs/superpowers/specs/2026-05-02-trade-workspaces-design.md
  Plan: docs/superpowers/plans/2026-05-02-trade-workspaces-01-schema-and-hub.md

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

# PHASE 2 — Trade types + `useTrades` hook

**Independent of Phase 3.** Adds the UI-shaped `Trade` and `TradeContract` types and a query hook that returns trades grouped by category for a site (including the in-house Civil contract). No UI yet — purely data layer.

## Task 2.1: Define UI types

**Files:**
- Create: `src/types/trade.types.ts`

**Why:** `database.types.ts` is generated and will get noisy as the schema grows. UI components want a hand-rolled, narrow type with the joined fields they actually render.

- [ ] **Step 1: Write the types file**

  Create `src/types/trade.types.ts`:
  ```ts
  import type { Database } from "./database.types";

  export type LaborTrackingMode = "detailed" | "headcount" | "mesthri_only";

  export interface TradeCategory {
    id: string;
    name: string;       // e.g. "Painting"
    isSystemSeed: boolean;
    isArchived: boolean;
  }

  export interface TradeContract {
    id: string;
    siteId: string;
    tradeCategoryId: string | null;
    title: string;
    laborTrackingMode: LaborTrackingMode;
    isInHouse: boolean;
    contractType: "mesthri" | "specialist";
    status: Database["public"]["Tables"]["subcontracts"]["Row"]["status"];
    totalValue: number;
    mesthriOrSpecialistName: string | null;  // joined from team.leader_name or laborer.name
    createdAt: string;
  }

  /**
   * A Trade is a category + the active contracts on this site for it.
   * The hub renders one card per Trade. v1 expects 0–1 active contracts per
   * trade per site (single-active-per-trade), but the array shape is forward-
   * compatible with v2's multi-concurrent.
   */
  export interface Trade {
    category: TradeCategory;
    contracts: TradeContract[];
  }
  ```

- [ ] **Step 2: Build to confirm**

  Run: `npm run build`
  Expected: clean.

## Task 2.2: Implement `useSiteTrades` hook

**Files:**
- Create: `src/hooks/queries/useTrades.ts`
- Create: `src/hooks/queries/useTrades.test.ts`

**Why:** The hub page reads one hook. Grouping logic lives here, not in the page, so future cross-trade reads (Plan 05's roll-up) reuse it.

- [ ] **Step 1: Write the failing test**

  Create `src/hooks/queries/useTrades.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { groupContractsByTrade } from "./useTrades";
  import type { TradeCategory, TradeContract } from "@/types/trade.types";

  const civilCat: TradeCategory = { id: "c1", name: "Civil", isSystemSeed: true, isArchived: false };
  const paintCat: TradeCategory = { id: "p1", name: "Painting", isSystemSeed: true, isArchived: false };
  const tileCat:  TradeCategory = { id: "t1", name: "Tiling", isSystemSeed: true, isArchived: false };

  const mkContract = (id: string, tradeCategoryId: string, isInHouse = false): TradeContract => ({
    id, siteId: "s1", tradeCategoryId, title: id, laborTrackingMode: "detailed",
    isInHouse, contractType: "mesthri", status: "active", totalValue: 0,
    mesthriOrSpecialistName: null, createdAt: "2026-05-02T00:00:00Z",
  });

  describe("groupContractsByTrade", () => {
    it("returns one Trade per category, including categories with no contracts", () => {
      const result = groupContractsByTrade(
        [civilCat, paintCat, tileCat],
        [mkContract("k1", "c1", true), mkContract("k2", "p1")],
      );
      expect(result).toHaveLength(3);
      expect(result.map(t => t.category.name)).toEqual(["Civil", "Painting", "Tiling"]);
      expect(result[0].contracts).toHaveLength(1);
      expect(result[1].contracts).toHaveLength(1);
      expect(result[2].contracts).toHaveLength(0);
    });

    it("places in-house Civil first regardless of category sort", () => {
      const result = groupContractsByTrade(
        [paintCat, civilCat],
        [mkContract("k1", "c1", true), mkContract("k2", "p1")],
      );
      expect(result[0].category.name).toBe("Civil");
    });

    it("excludes archived categories that have no contracts", () => {
      const archived: TradeCategory = { ...tileCat, isArchived: true };
      const result = groupContractsByTrade([civilCat, archived], []);
      expect(result.map(t => t.category.name)).toEqual(["Civil"]);
    });

    it("includes archived categories that still have active contracts", () => {
      const archived: TradeCategory = { ...tileCat, isArchived: true };
      const result = groupContractsByTrade([civilCat, archived], [mkContract("legacy", "t1")]);
      expect(result.map(t => t.category.name)).toEqual(["Civil", "Tiling"]);
    });

    it("filters out contracts whose trade_category_id is null (legacy unmigrated)", () => {
      const orphan = { ...mkContract("orphan", "c1"), tradeCategoryId: null };
      const result = groupContractsByTrade([civilCat], [orphan]);
      expect(result[0].contracts).toHaveLength(0);
    });
  });
  ```

- [ ] **Step 2: Run the test to verify it fails**

  Run: `npx vitest run src/hooks/queries/useTrades.test.ts`
  Expected: FAIL — `groupContractsByTrade` not exported.

- [ ] **Step 3: Implement the hook + grouping helper**

  Create `src/hooks/queries/useTrades.ts`:
  ```ts
  import { useQuery } from "@tanstack/react-query";
  import { createClient } from "@/lib/supabase/client";
  import type {
    LaborTrackingMode,
    Trade,
    TradeCategory,
    TradeContract,
  } from "@/types/trade.types";

  /**
   * Pure grouping function — extracted so it's testable without Supabase.
   * Returns one Trade per visible category. A category is visible when it is
   * not archived OR it has at least one contract. In-house Civil is always
   * placed first; the rest follow alphabetically.
   */
  export function groupContractsByTrade(
    categories: TradeCategory[],
    contracts: TradeContract[],
  ): Trade[] {
    const byCategoryId = new Map<string, TradeContract[]>();
    for (const c of contracts) {
      if (!c.tradeCategoryId) continue;  // legacy unmigrated
      const arr = byCategoryId.get(c.tradeCategoryId) ?? [];
      arr.push(c);
      byCategoryId.set(c.tradeCategoryId, arr);
    }

    const visible = categories
      .filter(cat => !cat.isArchived || (byCategoryId.get(cat.id)?.length ?? 0) > 0)
      .sort((a, b) => {
        if (a.name === "Civil") return -1;
        if (b.name === "Civil") return 1;
        return a.name.localeCompare(b.name);
      });

    return visible.map(category => ({
      category,
      contracts: byCategoryId.get(category.id) ?? [],
    }));
  }

  export function useSiteTrades(siteId: string | undefined) {
    const supabase = createClient();

    return useQuery({
      queryKey: ["trades", "site", siteId],
      enabled: !!siteId,
      staleTime: 5 * 60 * 1000,
      queryFn: async (): Promise<Trade[]> => {
        if (!siteId) return [];

        const [catsRes, contractsRes] = await Promise.all([
          supabase
            .from("labor_categories")
            .select("id, name, is_system_seed, is_archived"),
          supabase
            .from("subcontracts")
            .select(`
              id, site_id, trade_category_id, title,
              labor_tracking_mode, is_in_house, contract_type, status, total_value, created_at,
              team:teams(leader_name),
              laborer:laborers(name)
            `)
            .eq("site_id", siteId)
            .in("status", ["draft", "active", "on_hold"]),
        ]);

        if (catsRes.error) throw catsRes.error;
        if (contractsRes.error) throw contractsRes.error;

        const categories: TradeCategory[] = (catsRes.data ?? []).map(r => ({
          id: r.id,
          name: r.name,
          isSystemSeed: r.is_system_seed,
          isArchived: r.is_archived,
        }));

        const contracts: TradeContract[] = (contractsRes.data ?? []).map((r: any) => ({
          id: r.id,
          siteId: r.site_id,
          tradeCategoryId: r.trade_category_id,
          title: r.title,
          laborTrackingMode: (r.labor_tracking_mode ?? "detailed") as LaborTrackingMode,
          isInHouse: r.is_in_house,
          contractType: r.contract_type,
          status: r.status,
          totalValue: Number(r.total_value ?? 0),
          mesthriOrSpecialistName:
            r.team?.leader_name ?? r.laborer?.name ?? null,
          createdAt: r.created_at,
        }));

        return groupContractsByTrade(categories, contracts);
      },
    });
  }
  ```

- [ ] **Step 4: Run the test to verify it passes**

  Run: `npx vitest run src/hooks/queries/useTrades.test.ts`
  Expected: PASS — all 5 cases green.

- [ ] **Step 5: Commit Phase 2**

  ```bash
  git add src/types/trade.types.ts \
          src/hooks/queries/useTrades.ts \
          src/hooks/queries/useTrades.test.ts
  git commit -m "$(cat <<'EOF'
  feat(trades): add Trade types + useSiteTrades hook with category grouping

  Pure groupContractsByTrade is unit-tested for in-house Civil placement,
  archived-category visibility, and orphan (NULL trade_category_id) filtering.
  useSiteTrades fetches categories + active subcontracts in parallel and
  delegates grouping to the pure helper.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

# PHASE 3 — TradeCard + Trades hub page + side-nav entry

**Depends on Phase 2.** Ships the user-visible slice. Hub at `/site/trades` lists categories. Each card shows: trade name, the active contract's mesthri/specialist name, quoted, paid, balance — or "Add contract" if empty. Card click currently routes to the existing `/site/subcontracts/[id]` page (the bridge); Plan 02 swaps that for the dedicated workspace.

## Task 3.1: TradeCard component

**Files:**
- Create: `src/components/trades/TradeCard.tsx`
- Create: `src/components/trades/TradeCard.test.tsx`

- [ ] **Step 1: Write the failing test**

  Create `src/components/trades/TradeCard.test.tsx`:
  ```tsx
  import { describe, it, expect, vi } from "vitest";
  import { render, screen } from "@testing-library/react";
  import userEvent from "@testing-library/user-event";
  import { TradeCard } from "./TradeCard";
  import type { Trade } from "@/types/trade.types";

  const baseCat = { id: "p1", name: "Painting", isSystemSeed: true, isArchived: false };

  function makeTrade(overrides: Partial<Trade> = {}): Trade {
    return {
      category: baseCat,
      contracts: [],
      ...overrides,
    };
  }

  describe("TradeCard", () => {
    it("shows trade name", () => {
      render(<TradeCard trade={makeTrade()} onContractClick={() => {}} onAddClick={() => {}} />);
      expect(screen.getByText("Painting")).toBeInTheDocument();
    });

    it("shows 'Add contract' CTA when no contracts and fires onAddClick", async () => {
      const onAddClick = vi.fn();
      render(<TradeCard trade={makeTrade()} onContractClick={() => {}} onAddClick={onAddClick} />);
      await userEvent.click(screen.getByRole("button", { name: /add contract/i }));
      expect(onAddClick).toHaveBeenCalledWith("p1");
    });

    it("renders the active contract's mesthri name + quoted total", () => {
      const trade = makeTrade({
        contracts: [{
          id: "k1", siteId: "s1", tradeCategoryId: "p1", title: "Asis Painting",
          laborTrackingMode: "mesthri_only", isInHouse: false, contractType: "mesthri",
          status: "active", totalValue: 250000,
          mesthriOrSpecialistName: "Asis Mesthri",
          createdAt: "2026-05-02T00:00:00Z",
        }],
      });
      render(<TradeCard trade={trade} onContractClick={() => {}} onAddClick={() => {}} />);
      expect(screen.getByText("Asis Mesthri")).toBeInTheDocument();
      expect(screen.getByText(/2,50,000/)).toBeInTheDocument();
    });

    it("fires onContractClick when an active contract row is clicked", async () => {
      const onContractClick = vi.fn();
      const trade = makeTrade({
        contracts: [{
          id: "k1", siteId: "s1", tradeCategoryId: "p1", title: "Asis Painting",
          laborTrackingMode: "mesthri_only", isInHouse: false, contractType: "mesthri",
          status: "active", totalValue: 250000, mesthriOrSpecialistName: "Asis Mesthri",
          createdAt: "2026-05-02T00:00:00Z",
        }],
      });
      render(<TradeCard trade={trade} onContractClick={onContractClick} onAddClick={() => {}} />);
      await userEvent.click(screen.getByRole("button", { name: /asis mesthri/i }));
      expect(onContractClick).toHaveBeenCalledWith("k1");
    });

    it("labels in-house Civil contracts as 'In-house' rather than a mesthri name", () => {
      const trade = makeTrade({
        category: { id: "c1", name: "Civil", isSystemSeed: true, isArchived: false },
        contracts: [{
          id: "k0", siteId: "s1", tradeCategoryId: "c1", title: "Civil — In-house",
          laborTrackingMode: "detailed", isInHouse: true, contractType: "mesthri",
          status: "active", totalValue: 0, mesthriOrSpecialistName: null,
          createdAt: "2026-05-02T00:00:00Z",
        }],
      });
      render(<TradeCard trade={trade} onContractClick={() => {}} onAddClick={() => {}} />);
      expect(screen.getByText(/in-house/i)).toBeInTheDocument();
    });
  });
  ```

- [ ] **Step 2: Run the test to verify it fails**

  Run: `npx vitest run src/components/trades/TradeCard.test.tsx`
  Expected: FAIL — `TradeCard` not exported.

- [ ] **Step 3: Implement the component**

  Create `src/components/trades/TradeCard.tsx`:
  ```tsx
  "use client";

  import { Card, CardContent, Box, Typography, Button, Stack, Chip } from "@mui/material";
  import { Add as AddIcon, ChevronRight as ChevronRightIcon } from "@mui/icons-material";
  import type { Trade, TradeContract } from "@/types/trade.types";

  interface TradeCardProps {
    trade: Trade;
    onContractClick: (contractId: string) => void;
    onAddClick: (tradeCategoryId: string) => void;
  }

  function formatINR(amount: number): string {
    return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(amount);
  }

  function contractLabel(c: TradeContract): string {
    if (c.isInHouse) return "In-house";
    return c.mesthriOrSpecialistName ?? c.title;
  }

  export function TradeCard({ trade, onContractClick, onAddClick }: TradeCardProps) {
    const { category, contracts } = trade;
    const hasContracts = contracts.length > 0;

    return (
      <Card variant="outlined" sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <CardContent sx={{ flex: 1, display: "flex", flexDirection: "column", gap: 1.5 }}>
          <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <Typography variant="h6" fontWeight={600}>{category.name}</Typography>
            {category.isArchived && (
              <Chip label="Archived" size="small" variant="outlined" color="default" />
            )}
          </Box>

          {hasContracts ? (
            <Stack spacing={1}>
              {contracts.map(c => (
                <Button
                  key={c.id}
                  onClick={() => onContractClick(c.id)}
                  variant="outlined"
                  endIcon={<ChevronRightIcon />}
                  sx={{
                    justifyContent: "space-between",
                    textAlign: "left",
                    py: 1.25,
                    px: 1.5,
                    textTransform: "none",
                  }}
                >
                  <Box>
                    <Typography variant="body2" fontWeight={600}>
                      {contractLabel(c)}
                    </Typography>
                    {c.totalValue > 0 && (
                      <Typography variant="caption" color="text.secondary">
                        Quoted ₹{formatINR(c.totalValue)}
                      </Typography>
                    )}
                  </Box>
                </Button>
              ))}
            </Stack>
          ) : (
            <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", py: 2 }}>
              <Typography variant="body2" color="text.secondary">No contracts yet</Typography>
            </Box>
          )}

          <Button
            startIcon={<AddIcon />}
            size="small"
            onClick={() => onAddClick(category.id)}
            sx={{ alignSelf: "flex-start", mt: "auto" }}
          >
            Add contract
          </Button>
        </CardContent>
      </Card>
    );
  }
  ```

- [ ] **Step 4: Run the test to verify it passes**

  Run: `npx vitest run src/components/trades/TradeCard.test.tsx`
  Expected: PASS — all 5 cases green.

## Task 3.2: Trades hub page

**Files:**
- Create: `src/app/(main)/site/trades/page.tsx`
- Create: `src/components/trades/TradesEmptyState.tsx`

- [ ] **Step 1: Write the empty-state component**

  Create `src/components/trades/TradesEmptyState.tsx`:
  ```tsx
  "use client";
  import { Box, Typography, Paper } from "@mui/material";

  export function TradesEmptyState() {
    return (
      <Paper variant="outlined" sx={{ p: 4, textAlign: "center" }}>
        <Typography variant="h6" gutterBottom>No trades yet on this site</Typography>
        <Typography variant="body2" color="text.secondary">
          Trades appear here once you record civil attendance or create a subcontract for any work scope (painting, tiling, electrical, etc.).
        </Typography>
      </Paper>
    );
  }
  ```

- [ ] **Step 2: Write the hub page**

  Create `src/app/(main)/site/trades/page.tsx`:
  ```tsx
  "use client";

  import { useRouter } from "next/navigation";
  import { Box, Typography, Grid, Skeleton, Alert } from "@mui/material";
  import { useSelectedSite } from "@/contexts/SiteContext";
  import { useSiteTrades } from "@/hooks/queries/useTrades";
  import { TradeCard } from "@/components/trades/TradeCard";
  import { TradesEmptyState } from "@/components/trades/TradesEmptyState";
  import PageHeader from "@/components/layout/PageHeader";

  export default function TradesPage() {
    const router = useRouter();
    const { selectedSite } = useSelectedSite();
    const { data: trades, isLoading, error } = useSiteTrades(selectedSite?.id);

    const handleContractClick = (contractId: string) => {
      // Bridge: route to existing subcontracts page until Plan 02 ships the dedicated workspace.
      router.push(`/site/subcontracts?contractId=${contractId}`);
    };

    const handleAddClick = (_tradeCategoryId: string) => {
      // Bridge: route to existing subcontracts create flow until Plan 02 ships the wizard.
      router.push(`/site/subcontracts?action=new`);
    };

    if (!selectedSite) {
      return (
        <Box sx={{ p: 2 }}>
          <Alert severity="info">Select a site from the top bar to view trades.</Alert>
        </Box>
      );
    }

    return (
      <Box sx={{ p: { xs: 1.5, sm: 2 } }}>
        <PageHeader
          title="Trades"
          subtitle={`Per-trade workspaces for ${selectedSite.name}`}
        />

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            Failed to load trades: {error instanceof Error ? error.message : String(error)}
          </Alert>
        )}

        {isLoading && (
          <Grid container spacing={2}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Grid item xs={12} sm={6} md={4} key={i}>
                <Skeleton variant="rectangular" height={180} />
              </Grid>
            ))}
          </Grid>
        )}

        {!isLoading && trades && trades.length === 0 && <TradesEmptyState />}

        {!isLoading && trades && trades.length > 0 && (
          <Grid container spacing={2}>
            {trades.map(trade => (
              <Grid item xs={12} sm={6} md={4} key={trade.category.id}>
                <TradeCard
                  trade={trade}
                  onContractClick={handleContractClick}
                  onAddClick={handleAddClick}
                />
              </Grid>
            ))}
          </Grid>
        )}
      </Box>
    );
  }
  ```

- [ ] **Step 3: Verify the page builds**

  Run: `npm run build`
  Expected: clean. If `PageHeader` doesn't have a `subtitle` prop, drop the prop or check the actual signature in `src/components/layout/PageHeader.tsx`.

## Task 3.3: Side-nav entry

**Files:**
- Modify: `src/components/layout/MainLayout.tsx` (Workforce category, line ~138)

- [ ] **Step 1: Add the Trades NavItem at the top of Workforce**

  Edit `src/components/layout/MainLayout.tsx` — find the `siteNavCategories` array, locate the Workforce category items, and insert "Trades" as the FIRST item (before Attendance):

  ```ts
  {
    label: "Workforce",
    emoji: "👷",
    items: [
      {
        text: "Trades",
        icon: <ConstructionIcon />,
        path: "/site/trades",
      },
      {
        text: "Attendance",
        icon: <AccessTimeIcon />,
        path: "/site/attendance",
      },
      {
        text: "Salary Settlements",
        icon: <PaymentsIcon />,
        path: "/site/payments",
      },
      { text: "Holidays", icon: <EventBusyIcon />, path: "/site/holidays" },
    ],
  },
  ```

  `ConstructionIcon` is already imported at MainLayout.tsx:60 — do not re-import.

- [ ] **Step 2: Build and visually verify the nav entry**

  Run: `npm run dev`. Open `http://localhost:3000/dev-login` (auto-login per CLAUDE.md). After redirect to dashboard, expand the Workforce category in the side nav. Confirm "Trades" is the first item with the construction icon, and clicking it loads `/site/trades`.

## Task 3.4: Commit Phase 3

- [ ] **Step 1: Commit**

  ```bash
  git add src/components/trades/TradeCard.tsx \
          src/components/trades/TradeCard.test.tsx \
          src/components/trades/TradesEmptyState.tsx \
          src/app/\(main\)/site/trades/page.tsx \
          src/components/layout/MainLayout.tsx
  git commit -m "$(cat <<'EOF'
  feat(trades): add /site/trades hub with TradeCard + side-nav entry

  - TradeCard renders trade name, active contracts (mesthri name + quoted),
    and "Add contract" CTA. In-house Civil shows "In-house" instead of a
    mesthri name.
  - /site/trades hub uses useSiteTrades; shows skeleton loading, empty state,
    and grid of cards. Card clicks bridge to existing /site/subcontracts page
    until Plan 02 ships the dedicated workspace.
  - Workforce nav category now leads with "Trades"; Attendance and Salary
    Settlements remain visible until Plan 05 retires them.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

# PHASE 4 — End-to-end verification

**Run after Phases 1–3 are committed.** Verify the slice works end-to-end with realistic data, and that no existing flow regressed.

## Task 4.1: Migration verification on a prod-data-restored local DB

- [ ] **Step 1: Refresh local data from production**

  Per CLAUDE.md "Refreshing Local Data from Production":
  ```bash
  supabase db dump -f supabase/production_backup.sql --data-only
  npm run db:reset
  psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f supabase/production_backup.sql
  ```
  This replays all migrations including `20260502120000_add_trade_dimension.sql` against fresh prod data and forces the backfill to run on real sites.

- [ ] **Step 2: Re-run the verification query**

  Use Supabase MCP `mcp__supabase__execute_sql` (local):
  ```sql
  SELECT
    (SELECT COUNT(*) FROM public.daily_attendance WHERE subcontract_id IS NULL) AS orphan_attendance,
    (SELECT COUNT(*) FROM public.settlement_groups WHERE subcontract_id IS NULL) AS orphan_settlements,
    (SELECT COUNT(*) FROM public.subcontracts WHERE is_in_house = true) AS in_house_civil,
    (SELECT COUNT(DISTINCT site_id) FROM public.subcontracts WHERE is_in_house = true) AS sites_with_in_house;
  ```
  Expected: `orphan_attendance=0`, `orphan_settlements=0`, `in_house_civil` matches the prod-snapshot site count from Pre-flight Step 7, and `in_house_civil = sites_with_in_house` (no duplicates).

- [ ] **Step 3: Spot-check a real site**

  Pick a site UUID known to have civil attendance:
  ```sql
  SELECT sg.settlement_reference, sg.total_amount, sg.subcontract_id, sc.title, sc.is_in_house
    FROM public.settlement_groups sg
    JOIN public.subcontracts sc ON sc.id = sg.subcontract_id
   WHERE sg.site_id = '<known-site-uuid>'
   ORDER BY sg.settlement_date DESC
   LIMIT 5;
  ```
  Expected: every row has a non-null `subcontract_id` pointing at the in-house Civil contract for that site (`is_in_house=true`, `title='Civil — In-house'`).

## Task 4.2: UI verification via Playwright MCP

- [ ] **Step 1: Start the dev server**

  Run: `npm run dev` (or `npm run dev:local` if pointing at the prod-restored local DB).

- [ ] **Step 2: Auto-login + navigate to Trades**

  Use Playwright MCP:
  - `mcp__playwright__browser_navigate` to `http://localhost:3000/dev-login` (auto-redirects to dashboard).
  - Click the Workforce category in the side nav, then click **Trades**.
  - Expected URL: `http://localhost:3000/site/trades`.

- [ ] **Step 3: Take a screenshot**

  Use `mcp__playwright__browser_take_screenshot`. Save as `trades-hub-with-civil.png`. Confirm visually:
  - Page title "Trades".
  - At least a Civil card titled "Civil" with the in-house Civil contract row visible (showing "In-house").
  - Other 6 trade categories appear as empty cards with "Add contract" CTA.

- [ ] **Step 4: Check console for errors**

  Use `mcp__playwright__browser_console_messages`. Capture all messages. Expected: no `error` or `exception` entries. Warnings about React keys or hydration are bugs — fix before continuing.

- [ ] **Step 5: Click an empty trade card → confirm bridge works**

  Click the **Painting** card's "Add contract" button. Expected: navigates to `/site/subcontracts?action=new` (the bridge). The existing subcontract creation flow opens. This proves the bridge works for now; Plan 02 will replace it with a dedicated wizard.

- [ ] **Step 6: Click the Civil contract row → confirm bridge works**

  Back to `/site/trades`. Click the Civil "In-house" contract. Expected: navigates to `/site/subcontracts?contractId=<uuid>`. The existing subcontracts page surfaces — verify the contract exists in the listing.

- [ ] **Step 7: Verify no regression on existing routes**

  Visit each in turn: `/site/attendance`, `/site/payments`, `/site/subcontracts`. Take a screenshot of each. Compare against today's behaviour — none should show new errors, and all data should still render. Backfill changed `subcontract_id` on existing rows — make sure the existing payments / attendance pages still display them correctly (they should: those pages either filter by `site_id` or join on subcontract, both still work).

- [ ] **Step 8: Close the browser**

  Use `mcp__playwright__browser_close`.

## Task 4.3: Final sanity

- [ ] **Step 1: Full test suite**

  Run: `npm run test`
  Expected: all tests pass. New tests from this plan are green; no regressions in existing suites.

- [ ] **Step 2: Production build**

  Run: `npm run build`
  Expected: clean compile.

- [ ] **Step 3: Push the branch**

  ```bash
  git push -u origin feature/trade-workspaces-01-schema-and-hub
  ```
  Open a PR with the title **"feat(trades): schema + Trades hub shell (Plan 01 of 5)"** and link the spec + this plan in the PR body. Do NOT merge to main without user review — even though the migration is additive, the backfill touches every existing site's data.

---

## Roadmap for subsequent plans (NOT in this plan)

These plans get their own files when this one ships. Quick sketch so the team sees the trajectory:

- **Plan 02 — Trade Workspace internals** — Replaces the temporary `/site/subcontracts/[id]` bridge with `/site/trades/[tradeSlug]/[contractId]`. Tabs: Attendance · Advances & Money · Settlements · Ledger · Notes. `detailed` mode reuses today's civil attendance UI; the other modes have placeholder tabs that Plan 03 fills. Adds the Create-Contract wizard at `/site/trades/[tradeSlug]/new` (trade picker, mesthri/specialist toggle, labor mode, lump/rate, role rate card defaulting from `labor_roles.default_daily_rate`).

- **Plan 03 — Headcount + Reconciliation** — `HeadcountAttendanceTable` (per-role unit entry per date, writes to `subcontract_headcount_attendance`). `RoleRateCardEditor` (writes to `subcontract_role_rates`). `ReconciliationBanner` reading `v_subcontract_reconciliation` with the paid-ahead/behind/on-track traffic light. `ReconciliationChart` drill-down. The `mesthri_only` mode hides the attendance tab entirely.

- **Plan 04 — Company admin: Trades & Roles** — `TradesAndRolesSettings` mounted as a tab inside `/company/laborers`. CRUD on `labor_categories` (respecting `is_system_seed` — system rows are archive-only, custom rows can be deleted if unused) and `labor_roles` (default daily rates per role per trade). New trades immediately appear in the Create-Contract wizard's trade picker.

- **Plan 05 — Cross-trade roll-ups + Trades Across Sites + Dashboard + nav cleanup** — Three pieces sharing the same cross-trade data layer:
  1. Convert `/site/payments` into a read-only cross-trade payments roll-up (no entry forms; entry now lives per-trade).
  2. **Reframe `/company/contracts` as "Trades Across Sites"** — per-trade KPI strip, risk-first variance alert banner, three view modes (Cards grouped by trade · Table with Trade + Variance columns · Site×Trade Matrix). New hooks `useCompanyTrades(filters)` and `useTradeVarianceAlerts(thresholdPct)` feed both this page and `/site/dashboard`. Spec §5.
  3. Add "Trade breakdown" card to `/site/dashboard`.
  4. Remove the `/site/attendance` and `/site/subcontracts` nav entries (routes redirect to `/site/trades`).
  
  This is the one that touches the in-flight `payments-content.tsx` work — the hand-off plan with the user must merge that WIP before this plan starts.

---

## Spec coverage check (self-review)

| Spec section | Covered by Plan 01 |
|---|---|
| Schema: `trade_category_id`, `labor_tracking_mode`, `is_in_house` on subcontracts | ✅ Phase 1 |
| Schema: `subcontract_role_rates` table | ✅ Phase 1 (table created; populated by Plan 03) |
| Schema: `subcontract_headcount_attendance` table | ✅ Phase 1 (table created; populated by Plan 03) |
| Schema: `v_subcontract_reconciliation` view | ✅ Phase 1 (view created; consumed by Plan 03) |
| Schema: `is_archived` + `is_system_seed` on `labor_categories` | ✅ Phase 1 |
| Seed 7 trade categories + default roles + rates | ✅ Phase 1 |
| Backfill: in-house Civil per site, re-link orphan attendance + settlements | ✅ Phase 1 |
| `/site/trades` hub page | ✅ Phase 3 |
| `useSiteTrades` hook | ✅ Phase 2 |
| TradeCard component | ✅ Phase 3 |
| Side-nav "Trades" entry | ✅ Phase 3 |
| Trade Workspace internals (tabs, ledger, notes) | Plan 02 |
| Create-Contract wizard | Plan 02 |
| Headcount entry UI | Plan 03 |
| Role Rate Card editor | Plan 03 |
| Reconciliation banner + chart | Plan 03 |
| Admin Trades & Roles | Plan 04 |
| Cross-trade `/site/payments` roll-up | Plan 05 |
| Dashboard "Trade breakdown" card | Plan 05 |
| Remove `/site/attendance` + `/site/subcontracts` nav | Plan 05 |

No placeholders. Every task in this plan is independently executable.
