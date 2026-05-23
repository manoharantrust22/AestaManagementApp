# Multi-Source Payer Split — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the foundation for multi-source payer splits — schema, validator, reusable input component, and the first dialog wired through (PaymentDialog). Also remove the legacy "Via Site Engineer" channel toggle from PaymentDialog.

**Architecture:** A nullable `payer_source_split jsonb` column on `settlement_groups` (and the other 7 domain tables, schema-only for now) stores 2- or 3-row splits; when present, `payer_source = 'split'` acts as a sentinel. A shared SQL validator `validate_payer_source_split(jsonb, numeric)` enforces sum-to-total, registry-membership, and no-duplicate-source. The TypeScript layer adds a `PayerSourceInput` union type plus a `PayerSourceSplitInput` React component that wraps the existing `PayerSourceSelector`.

**Tech Stack:** PostgreSQL JSONB, Supabase MCP `apply_migration`, MUI v7, React 19, Vitest + React Testing Library, TanStack Query.

**Spec:** [docs/superpowers/specs/2026-05-23-payer-source-split-design.md](../specs/2026-05-23-payer-source-split-design.md)

---

## File map

**Create:**
- `supabase/migrations/20260523140000_payer_source_split_foundation.sql` — column + validator + CHECK constraints + sentinel guard
- `supabase/migrations/20260523140100_create_settlement_group_split.sql` — extend RPC signature with `p_payer_source_split`
- `supabase/migrations/20260523140200_v_all_expenses_settlement_split.sql` — extend view to surface `payer_source_split` for settlement_groups
- `src/lib/settlement/payerSource.ts` — `PayerSourceInput` helpers (`toRpcArgs`, `validatePayerSourceInput`, `formatPayerSource`)
- `src/lib/settlement/payerSource.test.ts` — unit tests for helpers
- `src/components/settlement/PayerSourceSplitInput.tsx` — toggle + 1–3 source rows + live sum hint
- `src/components/settlement/PayerSourceSplitInput.test.tsx` — RTL component tests
- `src/components/settlement/PayerSourceChip.tsx` — single-row chip that renders single OR split summary

**Modify:**
- `src/types/settlement.types.ts` — add `PayerSourceSplitRow`, `PayerSourceInput` types
- `src/lib/services/settlementService.ts` — `processSettlement` accepts `payer: PayerSourceInput`, forwards `p_payer_source_split` to RPC
- `src/components/payments/PaymentDialog.tsx` — drop in `PayerSourceSplitInput`; remove "Via Site Engineer" channel toggle + engineer selector + `paymentChannel === "engineer_wallet"` submit branch

**Out of scope for Phase 1:** Other 7 dialogs, edit dialogs, rollup card aggregation, `formatPayerSource` consumption beyond the post-submit toast.

---

## Task 1: Migration — add `payer_source_split` column to all 8 tables

**Files:**
- Create: `supabase/migrations/20260523140000_payer_source_split_foundation.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Multi-Source Payer Split — Foundation
-- Spec: docs/superpowers/specs/2026-05-23-payer-source-split-design.md
--
-- Adds payer_source_split JSONB to every payer-source-bearing table.
-- Phase 1 only wires settlement_groups end-to-end; the other 7 columns
-- ship now so Phase 2/3 don't have to add them piecemeal.
--
-- Semantics:
--   payer_source_split IS NULL     -> single source, read payer_source column (unchanged)
--   payer_source_split IS NOT NULL -> multi-source split, payer_source = 'split' sentinel

-- 1. Add column to every domain table.
-- Note: material_purchase_expenses uses column name `settlement_payer_source`
-- (not `payer_source`); its sentinel write target is therefore
-- settlement_payer_source='split'. The new column on that table is still
-- named `payer_source_split` for cross-table consistency.
ALTER TABLE settlement_groups            ADD COLUMN IF NOT EXISTS payer_source_split jsonb;
ALTER TABLE misc_expenses                ADD COLUMN IF NOT EXISTS payer_source_split jsonb;
ALTER TABLE tea_shop_settlements         ADD COLUMN IF NOT EXISTS payer_source_split jsonb;
ALTER TABLE tea_shop_group_settlements   ADD COLUMN IF NOT EXISTS payer_source_split jsonb;
ALTER TABLE material_purchase_expenses   ADD COLUMN IF NOT EXISTS payer_source_split jsonb;
ALTER TABLE rental_settlements           ADD COLUMN IF NOT EXISTS payer_source_split jsonb;
ALTER TABLE rental_advances              ADD COLUMN IF NOT EXISTS payer_source_split jsonb;
ALTER TABLE site_engineer_transactions   ADD COLUMN IF NOT EXISTS payer_source_split jsonb;

-- 2. CHECK constraint: array length 2 or 3, with per-element type tightening
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'settlement_groups',
    'misc_expenses',
    'tea_shop_settlements',
    'tea_shop_group_settlements',
    'material_purchase_expenses',
    'rental_settlements',
    'rental_advances',
    'site_engineer_transactions'
  ]
  LOOP
    EXECUTE format(
      'ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I',
      tbl, tbl || '_payer_source_split_len_chk'
    );
    EXECUTE format(
      $CHK$ALTER TABLE %I ADD CONSTRAINT %I CHECK (
        payer_source_split IS NULL OR (
          jsonb_typeof(payer_source_split) = 'array'
          AND jsonb_array_length(payer_source_split) BETWEEN 2 AND 3
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(payer_source_split) e
             WHERE jsonb_typeof(e->'amount') <> 'number'
                OR jsonb_typeof(e->'source') <> 'string'
          )
        )
      )$CHK$,
      tbl, tbl || '_payer_source_split_len_chk'
    );
  END LOOP;
END $$;

-- 3. Guard against a registry row colliding with the 'split' sentinel
ALTER TABLE payer_sources DROP CONSTRAINT IF EXISTS payer_sources_no_split_key_chk;
ALTER TABLE payer_sources
  ADD CONSTRAINT payer_sources_no_split_key_chk
  CHECK (key <> 'split');

-- 4. Shared validator
-- SECURITY INVOKER is intentional: this helper only reads payer_sources,
-- which has permissive RLS. search_path is pinned to defend against
-- shadowing attacks (codebase convention; see atomic_record_wallet_spend).
CREATE OR REPLACE FUNCTION validate_payer_source_split(
  p_split jsonb,
  p_total numeric,
  p_site_id uuid
) RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count      int;
  v_sum        numeric;
  v_bad_source text;
BEGIN
  IF jsonb_typeof(p_split) <> 'array' THEN
    RAISE EXCEPTION 'payer_source_split must be a JSON array' USING ERRCODE = '22023';
  END IF;
  v_count := jsonb_array_length(p_split);
  IF v_count NOT BETWEEN 2 AND 3 THEN
    RAISE EXCEPTION 'payer_source_split must have 2 or 3 rows (got %)', v_count USING ERRCODE = '22023';
  END IF;
  -- Reject non-positive row amounts before summing (TS validator also checks,
  -- but the SQL helper is the source of truth — a negative row that nets to
  -- the total would otherwise slip past the sum check).
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_split) elem
     WHERE (elem->>'amount')::numeric <= 0
  ) THEN
    RAISE EXCEPTION 'payer_source_split row amounts must be positive'
      USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(SUM((elem->>'amount')::numeric), 0)
    INTO v_sum
    FROM jsonb_array_elements(p_split) elem;
  IF abs(v_sum - p_total) > 1 THEN
    RAISE EXCEPTION 'payer_source_split sum % does not equal total %', v_sum, p_total
      USING ERRCODE = '22023';
  END IF;
  -- Capture the offending source key for the error message; scope the
  -- registry lookup to the caller's site (payer_sources is UNIQUE on
  -- (site_id, key), not globally unique on key).
  SELECT elem->>'source' INTO v_bad_source
    FROM jsonb_array_elements(p_split) elem
   WHERE NOT EXISTS (
     SELECT 1 FROM payer_sources ps
      WHERE ps.site_id = p_site_id
        AND ps.key = elem->>'source'
   )
   LIMIT 1;
  IF v_bad_source IS NOT NULL THEN
    RAISE EXCEPTION 'unknown payer source ''%'' in payer_source_split', v_bad_source
      USING ERRCODE = '22023';
  END IF;
  IF (
    SELECT COUNT(DISTINCT elem->>'source')
      FROM jsonb_array_elements(p_split) elem
  ) <> v_count THEN
    RAISE EXCEPTION 'payer_source_split cannot repeat the same source twice'
      USING ERRCODE = '22023';
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION validate_payer_source_split TO authenticated;
GRANT EXECUTE ON FUNCTION validate_payer_source_split TO service_role;

COMMENT ON FUNCTION validate_payer_source_split IS
  'Asserts a payer_source_split JSONB matches the spec: array length 2-3, sum within 1 of total, every source key exists in payer_sources registry, no duplicate sources within a single split.';
```

- [ ] **Step 2: Apply locally and verify**

Run: `npm run db:reset` (local Supabase only — applies all migrations including this one).
Then in `psql`:

```sql
-- Pick any seeded site for the registry-scoped lookups below.
\set site_id `SELECT id FROM sites LIMIT 1`

-- Should succeed
SELECT validate_payer_source_split(
  '[{"source":"amma_money","amount":3000},{"source":"trust_account","amount":2500}]'::jsonb,
  5500,
  (SELECT id FROM sites LIMIT 1)
);

-- Should raise "sum does not equal total"
SELECT validate_payer_source_split(
  '[{"source":"amma_money","amount":3000},{"source":"trust_account","amount":2000}]'::jsonb,
  5500,
  (SELECT id FROM sites LIMIT 1)
);

-- Should raise "must have 2 or 3 rows"
SELECT validate_payer_source_split('[]'::jsonb, 0, (SELECT id FROM sites LIMIT 1));

-- Should raise "unknown payer source 'foo'"
SELECT validate_payer_source_split(
  '[{"source":"foo","amount":3000},{"source":"trust_account","amount":2500}]'::jsonb,
  5500,
  (SELECT id FROM sites LIMIT 1)
);

-- Should raise "cannot repeat the same source twice"
SELECT validate_payer_source_split(
  '[{"source":"amma_money","amount":3000},{"source":"amma_money","amount":2500}]'::jsonb,
  5500,
  (SELECT id FROM sites LIMIT 1)
);

-- Should raise "row amounts must be positive"
SELECT validate_payer_source_split(
  '[{"source":"amma_money","amount":-100},{"source":"trust_account","amount":5600}]'::jsonb,
  5500,
  (SELECT id FROM sites LIMIT 1)
);
```

Expected: query 1 returns NULL (void); queries 2-6 raise the expected exception.

- [ ] **Step 3: Verify the sentinel guard**

```sql
-- Should fail with "payer_sources_no_split_key_chk"
INSERT INTO payer_sources (site_id, key, label) VALUES (
  (SELECT id FROM sites LIMIT 1), 'split', 'BadRow'
);
```

Expected: ERROR mentioning `payer_sources_no_split_key_chk`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260523140000_payer_source_split_foundation.sql
git commit -m "feat(db): payer_source_split JSONB column + validator on 8 domain tables"
```

---

## Task 2: Extend `create_settlement_group` RPC to accept the split

**Files:**
- Create: `supabase/migrations/20260523140100_create_settlement_group_split.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Extend create_settlement_group with p_payer_source_split.
-- When NULL: existing single-source behaviour (writes p_payer_source as-is).
-- When NOT NULL: validates against the shared helper, writes
--   payer_source='split', payer_source_split=<input>.

CREATE OR REPLACE FUNCTION create_settlement_group(
  p_site_id uuid,
  p_settlement_date date,
  p_total_amount numeric(12,2),
  p_laborer_count integer,
  p_payment_channel text,
  p_payment_mode text DEFAULT NULL,
  p_payer_source text DEFAULT NULL,
  p_payer_name text DEFAULT NULL,
  p_proof_url text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_subcontract_id uuid DEFAULT NULL,
  p_engineer_transaction_id uuid DEFAULT NULL,
  p_created_by uuid DEFAULT NULL,
  p_created_by_name text DEFAULT NULL,
  p_payment_type text DEFAULT 'salary',
  p_actual_payment_date date DEFAULT NULL,
  p_settlement_type text DEFAULT 'date_wise',
  p_week_allocations jsonb DEFAULT NULL,
  p_proof_urls text[] DEFAULT NULL,
  p_payer_source_split jsonb DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  settlement_reference text
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_date_code TEXT;
  v_next_seq INT;
  v_reference TEXT;
  v_lock_key BIGINT;
  v_new_id UUID;
  v_max_retries INT := 3;
  v_retry_count INT := 0;
  v_effective_payer_source TEXT;
  v_effective_payer_name TEXT;
BEGIN
  v_lock_key := ('x' || substr(md5(p_settlement_date::text), 1, 8))::bit(32)::int;
  PERFORM pg_advisory_xact_lock(v_lock_key);
  v_date_code := TO_CHAR(p_settlement_date, 'YYMMDD');

  IF p_payer_source_split IS NOT NULL THEN
    PERFORM validate_payer_source_split(p_payer_source_split, p_total_amount, p_site_id);
    v_effective_payer_source := 'split';
    v_effective_payer_name := NULL;
  ELSE
    v_effective_payer_source := p_payer_source;
    v_effective_payer_name := p_payer_name;
  END IF;

  WHILE v_retry_count < v_max_retries LOOP
    BEGIN
      SELECT COALESCE(MAX(
        CAST(SUBSTRING(sg.settlement_reference FROM 'SET-' || v_date_code || '-(\d+)') AS INT)
      ), 0) + 1
      INTO v_next_seq
      FROM settlement_groups sg
      WHERE sg.settlement_reference LIKE 'SET-' || v_date_code || '-%'
        AND sg.settlement_reference ~ ('^SET-' || v_date_code || '-\d+$');

      IF v_next_seq < 1000 THEN
        v_reference := 'SET-' || v_date_code || '-' || LPAD(v_next_seq::TEXT, 3, '0');
      ELSE
        v_reference := 'SET-' || v_date_code || '-' || v_next_seq::TEXT;
      END IF;

      v_new_id := gen_random_uuid();

      INSERT INTO settlement_groups (
        id, settlement_reference, site_id, settlement_date, total_amount,
        laborer_count, payment_channel, payment_mode, payer_source, payer_name,
        proof_url, notes, subcontract_id, engineer_transaction_id,
        created_by, created_by_name, payment_type, actual_payment_date,
        settlement_type, week_allocations, proof_urls, payer_source_split
      ) VALUES (
        v_new_id, v_reference, p_site_id, p_settlement_date, p_total_amount,
        p_laborer_count, p_payment_channel, p_payment_mode,
        v_effective_payer_source, v_effective_payer_name,
        p_proof_url, p_notes, p_subcontract_id, p_engineer_transaction_id,
        p_created_by, p_created_by_name, p_payment_type,
        COALESCE(p_actual_payment_date, p_settlement_date),
        p_settlement_type, p_week_allocations, p_proof_urls,
        p_payer_source_split
      );

      id := v_new_id;
      settlement_reference := v_reference;
      RETURN NEXT;
      RETURN;
    EXCEPTION
      WHEN unique_violation THEN
        v_retry_count := v_retry_count + 1;
        IF v_retry_count >= v_max_retries THEN RAISE; END IF;
        PERFORM pg_sleep(0.05 * v_retry_count);
    END;
  END LOOP;
  RAISE EXCEPTION 'create_settlement_group: retries exhausted';
END $$;

GRANT EXECUTE ON FUNCTION create_settlement_group TO authenticated;
GRANT EXECUTE ON FUNCTION create_settlement_group TO service_role;

COMMENT ON FUNCTION create_settlement_group IS
  'Atomically creates a settlement_group with unique SET-YYMMDD-NNN reference. Accepts an optional p_payer_source_split JSONB; when provided, validates via validate_payer_source_split and stores payer_source=''split''.';
```

- [ ] **Step 2: Apply and smoke-test**

After `npm run db:reset`, in `psql`:

```sql
-- Single-source path (legacy) — should succeed
SELECT * FROM create_settlement_group(
  p_site_id := (SELECT id FROM sites LIMIT 1),
  p_settlement_date := CURRENT_DATE,
  p_total_amount := 1000,
  p_laborer_count := 1,
  p_payment_channel := 'direct',
  p_payment_mode := 'cash',
  p_payer_source := 'own_money'
);

-- Split path — should succeed
SELECT * FROM create_settlement_group(
  p_site_id := (SELECT id FROM sites LIMIT 1),
  p_settlement_date := CURRENT_DATE,
  p_total_amount := 5500,
  p_laborer_count := 1,
  p_payment_channel := 'direct',
  p_payment_mode := 'cash',
  p_payer_source := 'split',
  p_payer_source_split := '[{"source":"amma_money","amount":3000},{"source":"trust_account","amount":2500}]'::jsonb
);

-- Verify the inserted row
SELECT payer_source, payer_source_split, total_amount
FROM settlement_groups
ORDER BY created_at DESC
LIMIT 2;

-- Split path with mismatch — should ERROR
SELECT * FROM create_settlement_group(
  p_site_id := (SELECT id FROM sites LIMIT 1),
  p_settlement_date := CURRENT_DATE,
  p_total_amount := 5500,
  p_laborer_count := 1,
  p_payment_channel := 'direct',
  p_payment_mode := 'cash',
  p_payer_source := 'split',
  p_payer_source_split := '[{"source":"amma_money","amount":3000},{"source":"trust_account","amount":2000}]'::jsonb
);
```

Expected: two new rows; the second has `payer_source='split'` and the JSONB populated; the mismatch raises `payer_source_split sum ... does not equal total ...`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260523140100_create_settlement_group_split.sql
git commit -m "feat(db): create_settlement_group accepts payer_source_split"
```

---

## Task 3: Extend `v_all_expenses` to surface `payer_source_split` for settlement_groups

**Files:**
- Create: `supabase/migrations/20260523140200_v_all_expenses_settlement_split.sql`

The view already has a `payer_source_split` column (Phase 4 of engineer wallet attribution). We add the settlement_groups subquery's projection so Phase 1's `PaymentDialog` rows surface their splits.

- [ ] **Step 1: Locate the current view definition**

Find the most recent view-recreating migration:

```bash
ls supabase/migrations/*v_all_expenses*.sql | sort | tail -3
```

Read the latest (likely `20260521110100_v_all_expenses_payer_source_split.sql`) and use its body as the base; we re-create the view with the settlement_groups subquery extended.

- [ ] **Step 2: Write the migration**

Replace the file body with the base view's CREATE OR REPLACE VIEW, with the settlement_groups subquery's SELECT list extended:

```sql
-- v_all_expenses — surface payer_source_split from settlement_groups.
-- Other domains (misc_expenses, tea_shop_*, materials, rentals, wallet
-- deposits) stay on NULL for now and get extended in Phase 2/3.

CREATE OR REPLACE VIEW v_all_expenses AS
-- <paste the latest definition here unchanged EXCEPT for the
--  settlement_groups subquery, where the projection line:
--      sg.payer_source_split AS payer_source_split  (or similar)
--  must read FROM settlement_groups directly. If the existing line
--  hardcodes NULL for settlement rows, replace with sg.payer_source_split.>
;

GRANT SELECT ON v_all_expenses TO authenticated;
GRANT SELECT ON v_all_expenses TO service_role;
```

> **Implementation note:** Read the existing view body verbatim before writing — do not paraphrase. The only diff is the settlement_groups subquery's `payer_source_split` projection.

- [ ] **Step 3: Apply and verify**

After `npm run db:reset`:

```sql
SELECT id, payer_source, payer_source_split
FROM v_all_expenses
WHERE payer_source = 'split'
ORDER BY created_at DESC
LIMIT 3;
```

Expected: the split rows inserted in Task 2 surface with their JSONB populated.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260523140200_v_all_expenses_settlement_split.sql
git commit -m "feat(db): surface payer_source_split from settlement_groups in v_all_expenses"
```

---

## Task 4: TS types — `PayerSourceSplitRow` and `PayerSourceInput`

**Files:**
- Modify: `src/types/settlement.types.ts`

- [ ] **Step 1: Add the types**

Insert immediately after the existing `PayerSource` type definition and `requiresPayerName` helper:

```ts
// src/types/settlement.types.ts

// A single row of a multi-source split.
// `name` is required when requiresPayerName(source) is true.
export type PayerSourceSplitRow = {
  source: PayerSource;
  name?: string;
  amount: number;
};

// Discriminated union returned by PayerSourceSplitInput and consumed by
// every writer that previously took { payerSource, customPayerName }.
export type PayerSourceInput =
  | { mode: "single"; source: PayerSource; name?: string }
  | { mode: "split"; rows: PayerSourceSplitRow[] };
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: passes (existing code that uses the old `PayerSource` type is untouched).

- [ ] **Step 3: Commit**

```bash
git add src/types/settlement.types.ts
git commit -m "feat(types): add PayerSourceSplitRow + PayerSourceInput union"
```

---

## Task 5: TS helpers — `toRpcArgs`, `validatePayerSourceInput`, `formatPayerSource`

**Files:**
- Create: `src/lib/settlement/payerSource.ts`
- Create: `src/lib/settlement/payerSource.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/settlement/payerSource.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  toRpcArgs,
  validatePayerSourceInput,
  formatPayerSource,
} from "./payerSource";
import type { PayerSourceInput } from "@/types/settlement.types";

describe("toRpcArgs", () => {
  it("maps single-source input to legacy RPC params", () => {
    const input: PayerSourceInput = { mode: "single", source: "amma_money" };
    expect(toRpcArgs(input)).toEqual({
      p_payer_source: "amma_money",
      p_payer_name: null,
      p_payer_source_split: null,
    });
  });

  it("forwards payer_name only for custom/other_site_money", () => {
    const input: PayerSourceInput = {
      mode: "single",
      source: "custom",
      name: "Brother-in-law",
    };
    expect(toRpcArgs(input)).toMatchObject({
      p_payer_source: "custom",
      p_payer_name: "Brother-in-law",
      p_payer_source_split: null,
    });
  });

  it("drops payer_name for sources that don't need it", () => {
    const input: PayerSourceInput = {
      mode: "single",
      source: "amma_money",
      name: "should-not-be-sent",
    };
    expect(toRpcArgs(input).p_payer_name).toBeNull();
  });

  it("maps split-source input to p_payer_source='split' + JSONB", () => {
    const input: PayerSourceInput = {
      mode: "split",
      rows: [
        { source: "amma_money", amount: 3000 },
        { source: "trust_account", amount: 2500 },
      ],
    };
    expect(toRpcArgs(input)).toEqual({
      p_payer_source: "split",
      p_payer_name: null,
      p_payer_source_split: [
        { source: "amma_money", amount: 3000 },
        { source: "trust_account", amount: 2500 },
      ],
    });
  });
});

describe("validatePayerSourceInput", () => {
  it("accepts a valid single source", () => {
    expect(
      validatePayerSourceInput(
        { mode: "single", source: "amma_money" },
        5000,
      ),
    ).toEqual({ ok: true });
  });

  it("rejects single 'custom' without a name", () => {
    expect(
      validatePayerSourceInput({ mode: "single", source: "custom" }, 5000),
    ).toEqual({ ok: false, reason: "name is required for 'custom'" });
  });

  it("rejects split with 1 row", () => {
    expect(
      validatePayerSourceInput(
        {
          mode: "split",
          rows: [{ source: "amma_money", amount: 5000 }],
        },
        5000,
      ),
    ).toEqual({ ok: false, reason: "split must have 2 or 3 rows (got 1)" });
  });

  it("rejects split with 4 rows", () => {
    expect(
      validatePayerSourceInput(
        {
          mode: "split",
          rows: [
            { source: "amma_money", amount: 1000 },
            { source: "trust_account", amount: 1000 },
            { source: "own_money", amount: 1000 },
            { source: "client_money", amount: 2000 },
          ],
        },
        5000,
      ),
    ).toEqual({ ok: false, reason: "split must have 2 or 3 rows (got 4)" });
  });

  it("rejects split whose sum != total", () => {
    expect(
      validatePayerSourceInput(
        {
          mode: "split",
          rows: [
            { source: "amma_money", amount: 3000 },
            { source: "trust_account", amount: 2000 },
          ],
        },
        5500,
      ),
    ).toEqual({ ok: false, reason: "split sum 5000 does not equal total 5500" });
  });

  it("accepts split within ₹1 of total (rounding tolerance)", () => {
    expect(
      validatePayerSourceInput(
        {
          mode: "split",
          rows: [
            { source: "amma_money", amount: 3333.33 },
            { source: "trust_account", amount: 3333.33 },
            { source: "own_money", amount: 3333.34 },
          ],
        },
        10000,
      ),
    ).toEqual({ ok: true });
  });

  it("rejects duplicate source within a split", () => {
    expect(
      validatePayerSourceInput(
        {
          mode: "split",
          rows: [
            { source: "amma_money", amount: 3000 },
            { source: "amma_money", amount: 2000 },
          ],
        },
        5000,
      ),
    ).toEqual({
      ok: false,
      reason: "split cannot repeat the same source twice",
    });
  });

  it("rejects split row with non-positive amount", () => {
    expect(
      validatePayerSourceInput(
        {
          mode: "split",
          rows: [
            { source: "amma_money", amount: 0 },
            { source: "trust_account", amount: 5000 },
          ],
        },
        5000,
      ),
    ).toEqual({ ok: false, reason: "row 1 amount must be > 0" });
  });

  it("rejects split row missing name when source requires it", () => {
    expect(
      validatePayerSourceInput(
        {
          mode: "split",
          rows: [
            { source: "custom", amount: 3000 },
            { source: "trust_account", amount: 2000 },
          ],
        },
        5000,
      ),
    ).toEqual({ ok: false, reason: "row 1 name is required for 'custom'" });
  });
});

describe("formatPayerSource", () => {
  it("renders single source label", () => {
    const out = formatPayerSource({
      payer_source: "amma_money",
      payer_name: null,
      payer_source_split: null,
    });
    expect(out).toEqual({ kind: "single", label: "Amma Money" });
  });

  it("falls back to payer_name for custom", () => {
    const out = formatPayerSource({
      payer_source: "custom",
      payer_name: "Sister",
      payer_source_split: null,
    });
    expect(out).toEqual({ kind: "single", label: "Sister" });
  });

  it("renders split summary", () => {
    const out = formatPayerSource({
      payer_source: "split",
      payer_name: null,
      payer_source_split: [
        { source: "amma_money", amount: 3000 },
        { source: "trust_account", amount: 2500 },
      ],
    });
    expect(out.kind).toBe("split");
    if (out.kind !== "split") throw new Error("expected split");
    expect(out.summary).toBe("Split: Amma Money ₹3,000 · Trust Account ₹2,500");
    expect(out.rows).toEqual([
      { label: "Amma Money", amount: 3000 },
      { label: "Trust Account", amount: 2500 },
    ]);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run src/lib/settlement/payerSource.test.ts`
Expected: FAIL — `Cannot find module './payerSource'`.

- [ ] **Step 3: Implement the helpers**

Create `src/lib/settlement/payerSource.ts`:

```ts
import type {
  PayerSource,
  PayerSourceInput,
  PayerSourceSplitRow,
} from "@/types/settlement.types";
import { requiresPayerName } from "@/types/settlement.types";

const LABEL_BY_SOURCE: Record<PayerSource, string> = {
  own_money: "Own Money",
  amma_money: "Amma Money",
  client_money: "Client Money",
  trust_account: "Trust Account",
  other_site_money: "Other Site",
  custom: "Other",
  mothers_money: "Mother's Money",
};

function labelFor(row: { source: PayerSource; name?: string | null }): string {
  if (requiresPayerName(row.source) && row.name) return row.name;
  return LABEL_BY_SOURCE[row.source] ?? row.source;
}

const inr = (n: number) =>
  `₹${Math.round(n).toLocaleString("en-IN")}`;

export function toRpcArgs(payer: PayerSourceInput): {
  p_payer_source: string;
  p_payer_name: string | null;
  p_payer_source_split: PayerSourceSplitRow[] | null;
} {
  if (payer.mode === "split") {
    return {
      p_payer_source: "split",
      p_payer_name: null,
      p_payer_source_split: payer.rows.map((r) => ({
        source: r.source,
        ...(r.name && requiresPayerName(r.source) ? { name: r.name } : {}),
        amount: r.amount,
      })),
    };
  }
  return {
    p_payer_source: payer.source,
    p_payer_name:
      requiresPayerName(payer.source) && payer.name ? payer.name : null,
    p_payer_source_split: null,
  };
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

export function validatePayerSourceInput(
  payer: PayerSourceInput,
  total: number,
): ValidationResult {
  if (payer.mode === "single") {
    if (requiresPayerName(payer.source) && !payer.name?.trim()) {
      return { ok: false, reason: `name is required for '${payer.source}'` };
    }
    return { ok: true };
  }
  const n = payer.rows.length;
  if (n < 2 || n > 3) {
    return { ok: false, reason: `split must have 2 or 3 rows (got ${n})` };
  }
  for (let i = 0; i < n; i++) {
    const r = payer.rows[i];
    if (!(r.amount > 0)) {
      return { ok: false, reason: `row ${i + 1} amount must be > 0` };
    }
    if (requiresPayerName(r.source) && !r.name?.trim()) {
      return {
        ok: false,
        reason: `row ${i + 1} name is required for '${r.source}'`,
      };
    }
  }
  const seen = new Set<string>();
  for (const r of payer.rows) {
    if (seen.has(r.source)) {
      return {
        ok: false,
        reason: "split cannot repeat the same source twice",
      };
    }
    seen.add(r.source);
  }
  const sum = payer.rows.reduce((a, r) => a + r.amount, 0);
  if (Math.abs(sum - total) > 1) {
    return {
      ok: false,
      reason: `split sum ${sum} does not equal total ${total}`,
    };
  }
  return { ok: true };
}

export function formatPayerSource(row: {
  payer_source: string | null;
  payer_name: string | null;
  payer_source_split: PayerSourceSplitRow[] | null;
}):
  | { kind: "single"; label: string }
  | {
      kind: "split";
      rows: { label: string; amount: number }[];
      summary: string;
    } {
  if (row.payer_source_split && row.payer_source_split.length > 0) {
    const rows = row.payer_source_split.map((r) => ({
      label: labelFor({ source: r.source, name: r.name }),
      amount: r.amount,
    }));
    const summary =
      "Split: " + rows.map((r) => `${r.label} ${inr(r.amount)}`).join(" · ");
    return { kind: "split", rows, summary };
  }
  const source = (row.payer_source ?? "own_money") as PayerSource;
  return {
    kind: "single",
    label: labelFor({ source, name: row.payer_name }),
  };
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npx vitest run src/lib/settlement/payerSource.test.ts`
Expected: PASS, 13/13.

- [ ] **Step 5: Commit**

```bash
git add src/lib/settlement/payerSource.ts src/lib/settlement/payerSource.test.ts
git commit -m "feat(settlement): payer-source input helpers + tests"
```

---

## Task 6: `PayerSourceSplitInput` component

**Files:**
- Create: `src/components/settlement/PayerSourceSplitInput.tsx`
- Create: `src/components/settlement/PayerSourceSplitInput.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/components/settlement/PayerSourceSplitInput.test.tsx`:

```tsx
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PayerSourceSplitInput from "./PayerSourceSplitInput";
import type { PayerSourceInput } from "@/types/settlement.types";

function withClient(node: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

function Harness({
  initial,
  total,
  onChange,
}: {
  initial: PayerSourceInput;
  total: number;
  onChange?: (v: PayerSourceInput) => void;
}) {
  const [v, setV] = React.useState<PayerSourceInput>(initial);
  return (
    <PayerSourceSplitInput
      value={v}
      total={total}
      onChange={(next) => {
        setV(next);
        onChange?.(next);
      }}
    />
  );
}

describe("PayerSourceSplitInput", () => {
  it("renders a single PayerSourceSelector when mode='single'", () => {
    render(
      withClient(
        <Harness
          initial={{ mode: "single", source: "own_money" }}
          total={5000}
        />,
      ),
    );
    // The split toggle is collapsed by default
    expect(screen.getByRole("button", { name: /split across sources/i })).toBeInTheDocument();
    // Row-1 amount field NOT visible in single mode
    expect(screen.queryByLabelText(/row 1 amount/i)).toBeNull();
  });

  it("switches to split mode with 2 rows and an empty Row-2 source on toggle", () => {
    const onChange = vi.fn();
    render(
      withClient(
        <Harness
          initial={{ mode: "single", source: "amma_money" }}
          total={5000}
          onChange={onChange}
        />,
      ),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /split across sources/i }),
    );
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "split" }),
    );
    const last = onChange.mock.calls.at(-1)![0] as PayerSourceInput;
    expect(last.mode).toBe("split");
    if (last.mode !== "split") throw new Error();
    expect(last.rows).toHaveLength(2);
    expect(last.rows[0].source).toBe("amma_money"); // preserved from single
  });

  it("shows 'Remaining' hint when sum < total", () => {
    render(
      withClient(
        <Harness
          initial={{
            mode: "split",
            rows: [
              { source: "amma_money", amount: 1000 },
              { source: "trust_account", amount: 1000 },
            ],
          }}
          total={5000}
        />,
      ),
    );
    expect(screen.getByText(/remaining.*3,000/i)).toBeInTheDocument();
  });

  it("shows 'Over by' hint when sum > total (red)", () => {
    render(
      withClient(
        <Harness
          initial={{
            mode: "split",
            rows: [
              { source: "amma_money", amount: 4000 },
              { source: "trust_account", amount: 2000 },
            ],
          }}
          total={5000}
        />,
      ),
    );
    expect(screen.getByText(/over by.*1,000/i)).toBeInTheDocument();
  });

  it("shows OK indicator when sum equals total within ₹1", () => {
    render(
      withClient(
        <Harness
          initial={{
            mode: "split",
            rows: [
              { source: "amma_money", amount: 3000 },
              { source: "trust_account", amount: 2000 },
            ],
          }}
          total={5000}
        />,
      ),
    );
    expect(screen.getByText(/ok/i)).toBeInTheDocument();
  });

  it("adds a 3rd row when '+ Add another source' is clicked", () => {
    const onChange = vi.fn();
    render(
      withClient(
        <Harness
          initial={{
            mode: "split",
            rows: [
              { source: "amma_money", amount: 1000 },
              { source: "trust_account", amount: 1000 },
            ],
          }}
          total={5000}
          onChange={onChange}
        />,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: /add another source/i }));
    const last = onChange.mock.calls.at(-1)![0] as PayerSourceInput;
    if (last.mode !== "split") throw new Error();
    expect(last.rows).toHaveLength(3);
  });

  it("hides 'Add another source' at 3 rows", () => {
    render(
      withClient(
        <Harness
          initial={{
            mode: "split",
            rows: [
              { source: "amma_money", amount: 1000 },
              { source: "trust_account", amount: 1000 },
              { source: "own_money", amount: 3000 },
            ],
          }}
          total={5000}
        />,
      ),
    );
    expect(
      screen.queryByRole("button", { name: /add another source/i }),
    ).toBeNull();
  });

  it("collapses back to single when toggle is turned off", () => {
    const onChange = vi.fn();
    render(
      withClient(
        <Harness
          initial={{
            mode: "split",
            rows: [
              { source: "amma_money", amount: 3000 },
              { source: "trust_account", amount: 2000 },
            ],
          }}
          total={5000}
          onChange={onChange}
        />,
      ),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /split across sources/i }),
    );
    const last = onChange.mock.calls.at(-1)![0] as PayerSourceInput;
    expect(last.mode).toBe("single");
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run src/components/settlement/PayerSourceSplitInput.test.tsx`
Expected: FAIL — `Cannot find module './PayerSourceSplitInput'`.

- [ ] **Step 3: Implement the component**

Create `src/components/settlement/PayerSourceSplitInput.tsx`:

```tsx
"use client";

import React from "react";
import {
  Box,
  Button,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  Add as AddIcon,
  Close as CloseIcon,
  CallSplit as SplitIcon,
} from "@mui/icons-material";
import PayerSourceSelector from "./PayerSourceSelector";
import type {
  PayerSourceInput,
  PayerSourceSplitRow,
  PayerSource,
} from "@/types/settlement.types";

interface Props {
  value: PayerSourceInput;
  onChange: (next: PayerSourceInput) => void;
  total: number;
  siteId?: string;
  disabled?: boolean;
}

function defaultSplitFrom(single: { source: PayerSource; name?: string }): PayerSourceInput {
  return {
    mode: "split",
    rows: [
      { source: single.source, name: single.name, amount: 0 },
      { source: "trust_account", amount: 0 },
    ],
  };
}

export default function PayerSourceSplitInput({
  value,
  onChange,
  total,
  siteId,
  disabled,
}: Props) {
  if (value.mode === "single") {
    return (
      <Stack spacing={1}>
        <PayerSourceSelector
          value={value.source}
          customName={value.name ?? ""}
          onChange={(source) => onChange({ ...value, source })}
          onCustomNameChange={(name) => onChange({ ...value, name })}
          siteId={siteId}
          disabled={disabled}
        />
        <Button
          size="small"
          startIcon={<SplitIcon fontSize="small" />}
          onClick={() => onChange(defaultSplitFrom(value))}
          sx={{ alignSelf: "flex-start", textTransform: "none" }}
          disabled={disabled}
        >
          Split across sources
        </Button>
      </Stack>
    );
  }

  const rows = value.rows;
  const sum = rows.reduce((a, r) => a + (Number.isFinite(r.amount) ? r.amount : 0), 0);
  const diff = total - sum;
  const within1 = Math.abs(diff) <= 1;
  const status = within1
    ? { text: "OK", color: "success.main" as const }
    : diff > 0
    ? { text: `Remaining: ₹${Math.round(diff).toLocaleString("en-IN")}`, color: "text.secondary" as const }
    : { text: `Over by: ₹${Math.round(-diff).toLocaleString("en-IN")}`, color: "error.main" as const };

  function updateRow(i: number, patch: Partial<PayerSourceSplitRow>) {
    const next = rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    onChange({ mode: "split", rows: next });
  }
  function removeRow(i: number) {
    if (rows.length <= 2) return;
    onChange({ mode: "split", rows: rows.filter((_, idx) => idx !== i) });
  }
  function addRow() {
    if (rows.length >= 3) return;
    onChange({
      mode: "split",
      rows: [...rows, { source: "own_money", amount: 0 }],
    });
  }
  function turnOff() {
    onChange({ mode: "single", source: rows[0].source, name: rows[0].name });
  }

  return (
    <Stack spacing={1.5}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Typography variant="subtitle2">Payment Sources (split)</Typography>
        <Button
          size="small"
          onClick={turnOff}
          sx={{ textTransform: "none" }}
          disabled={disabled}
          aria-label="Split across sources"
        >
          Use a single source
        </Button>
      </Box>

      {rows.map((row, i) => (
        <Stack key={i} direction="row" spacing={1} alignItems="flex-start">
          <Box sx={{ flex: 1 }}>
            <PayerSourceSelector
              value={row.source}
              customName={row.name ?? ""}
              onChange={(source) => updateRow(i, { source })}
              onCustomNameChange={(name) => updateRow(i, { name })}
              siteId={siteId}
              disabled={disabled}
              compact
            />
          </Box>
          <TextField
            label={`Row ${i + 1} amount`}
            size="small"
            type="number"
            inputProps={{ min: 0, step: 1, inputMode: "numeric" }}
            value={Number.isFinite(row.amount) && row.amount !== 0 ? row.amount : ""}
            onChange={(e) => updateRow(i, { amount: Number(e.target.value) || 0 })}
            sx={{ width: 130 }}
            disabled={disabled}
          />
          {rows.length > 2 && (
            <IconButton
              size="small"
              onClick={() => removeRow(i)}
              aria-label={`remove row ${i + 1}`}
              disabled={disabled}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          )}
        </Stack>
      ))}

      {rows.length < 3 && (
        <Button
          size="small"
          startIcon={<AddIcon fontSize="small" />}
          onClick={addRow}
          sx={{ alignSelf: "flex-start", textTransform: "none" }}
          disabled={disabled}
        >
          Add another source
        </Button>
      )}

      <Typography variant="caption" sx={{ color: status.color, fontWeight: 500 }}>
        {status.text}
      </Typography>
    </Stack>
  );
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npx vitest run src/components/settlement/PayerSourceSplitInput.test.tsx`
Expected: PASS, 8/8.

- [ ] **Step 5: Commit**

```bash
git add src/components/settlement/PayerSourceSplitInput.tsx src/components/settlement/PayerSourceSplitInput.test.tsx
git commit -m "feat(settlement): PayerSourceSplitInput component (toggle + 2-3 rows + sum hint)"
```

---

## Task 7: `PayerSourceChip` display component

**Files:**
- Create: `src/components/settlement/PayerSourceChip.tsx`

A thin wrapper that uses `formatPayerSource` to render either a single chip (current behaviour) or a split chip with tooltip. Phase 1 only consumes this in `PaymentDialog`'s post-submit toast, but the component itself is reusable for Phase 2/3.

- [ ] **Step 1: Implement**

```tsx
"use client";

import React from "react";
import { Chip, Tooltip, Stack, Typography } from "@mui/material";
import { CallSplit as SplitIcon } from "@mui/icons-material";
import { formatPayerSource } from "@/lib/settlement/payerSource";
import type { PayerSourceSplitRow } from "@/types/settlement.types";

interface Props {
  row: {
    payer_source: string | null;
    payer_name: string | null;
    payer_source_split: PayerSourceSplitRow[] | null;
  };
  size?: "small" | "medium";
}

export default function PayerSourceChip({ row, size = "small" }: Props) {
  const out = formatPayerSource(row);
  if (out.kind === "single") {
    return <Chip label={out.label} size={size} />;
  }
  const tooltip = (
    <Stack spacing={0.5}>
      {out.rows.map((r, i) => (
        <Typography key={i} variant="caption">
          {r.label}: ₹{Math.round(r.amount).toLocaleString("en-IN")}
        </Typography>
      ))}
    </Stack>
  );
  return (
    <Tooltip title={tooltip} arrow>
      <Chip
        icon={<SplitIcon fontSize="small" />}
        label={`Split (${out.rows.length})`}
        size={size}
      />
    </Tooltip>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/components/settlement/PayerSourceChip.tsx
git commit -m "feat(settlement): PayerSourceChip — single chip or split-summary with tooltip"
```

---

## Task 8: `processSettlement` accepts `PayerSourceInput`

**Files:**
- Modify: `src/lib/services/settlementService.ts`

- [ ] **Step 1: Update `SettlementConfig`**

In `src/lib/services/settlementService.ts`, replace the `payerSource` / `customPayerName` fields with a `payer: PayerSourceInput`:

```ts
// Before
export interface SettlementConfig {
  // ...
  payerSource: PayerSource;
  customPayerName?: string;
  // ...
}

// After
import type { PayerSourceInput } from "@/types/settlement.types";

export interface SettlementConfig {
  // ...
  payer: PayerSourceInput;
  // ...
}
```

- [ ] **Step 2: Update the RPC call site**

Find the call in `processSettlement` (around line 325):

```ts
// Before
p_payer_source: config.payerSource,
p_payer_name: requiresPayerName(config.payerSource) ? config.customPayerName : null,

// After
import { toRpcArgs, validatePayerSourceInput } from "@/lib/settlement/payerSource";

// At top of processSettlement, before the RPC call:
const payerCheck = validatePayerSourceInput(config.payer, config.totalAmount);
if (!payerCheck.ok) {
  return { success: false, error: `Invalid payer source: ${payerCheck.reason}` };
}
const payerRpc = toRpcArgs(config.payer);

// Then in the createSettlementWithRetry params:
p_payer_source: payerRpc.p_payer_source,
p_payer_name: payerRpc.p_payer_name,
p_payer_source_split: payerRpc.p_payer_source_split,
```

The other settlement-creating functions in this file (`processContractPayment`, `processDailySalarySettlement`, etc.) keep the old `payerSource + customPayerName` signature for Phase 1 — they get migrated in Phase 2. Mark them with a `// TODO(payer-split-phase-2)` comment at the top so the next phase can find them.

- [ ] **Step 3: Type-check + run existing settlement tests**

Run: `npx tsc --noEmit`
Expected: callers of `processSettlement` (notably `PaymentDialog`) will error — that's the point; they get fixed in Task 9.

Then run: `npx vitest run src/lib/services` (if any tests exist).
Expected: any existing settlement service tests still pass for non-`processSettlement` paths; `processSettlement` tests (if any) update in lockstep.

- [ ] **Step 4: Commit**

```bash
git add src/lib/services/settlementService.ts
git commit -m "feat(settlement): processSettlement accepts PayerSourceInput"
```

---

## Task 9: Wire `PayerSourceSplitInput` into `PaymentDialog` + remove "Via Site Engineer"

**Files:**
- Modify: `src/components/payments/PaymentDialog.tsx`

This is the biggest UI change — two distinct edits in one PR because they touch the same dialog and both ship in Phase 1.

- [ ] **Step 1: Replace `moneySource` state with `payer: PayerSourceInput`**

Find the existing state declarations (around lines 100-103):

```tsx
// Before
const [moneySource, setMoneySource] = useState<PayerSource>("own_money");
const [moneySourceName, setMoneySourceName] = useState<string>("");

// After
import type { PayerSourceInput } from "@/types/settlement.types";

const [payer, setPayer] = useState<PayerSourceInput>({
  mode: "single",
  source: "own_money",
});
```

Search for every remaining read/write of `moneySource` / `moneySourceName` in the file and either delete the line or replace with `payer` access. Update the submit-path call to `processSettlement` to pass `payer` instead of the old fields.

- [ ] **Step 2: Replace the `PayerSourceSelector` JSX with `PayerSourceSplitInput`**

Find the existing `PayerSourceSelector` use (around line 746) and replace:

```tsx
// Before
<PayerSourceSelector
  value={moneySource}
  customName={moneySourceName}
  onChange={setMoneySource}
  onCustomNameChange={setMoneySourceName}
  disabled={processing || paymentChannel === "engineer_wallet"}
/>

// After
import PayerSourceSplitInput from "@/components/settlement/PayerSourceSplitInput";

<PayerSourceSplitInput
  value={payer}
  onChange={setPayer}
  total={paymentAmount}
  siteId={selectedSite?.id}
  disabled={processing}
/>
```

The outer `!isSiteEngineerPayingFromWallet({...})` guard stays — it still suppresses the source picker when an engineer is paying from their own wallet.

- [ ] **Step 3: Remove "Via Site Engineer" channel**

Delete lines 714-737 (`Payment Channel` `ToggleButtonGroup` and its surrounding `Box`):

```tsx
// Delete the entire block:
{!isSiteEngineer && (
  <Box sx={{ mb: 3 }}>
    <Typography variant="subtitle2" gutterBottom>
      Payment Channel
    </Typography>
    <ToggleButtonGroup
      exclusive
      value={paymentChannel}
      onChange={(_, v) => v && setPaymentChannel(v)}
      fullWidth
      size="small"
    >
      <ToggleButton value="direct">
        <PaymentIcon sx={{ mr: 1 }} fontSize="small" />
        Direct Payment
      </ToggleButton>
      <ToggleButton value="engineer_wallet">
        <WalletIcon sx={{ mr: 1 }} fontSize="small" />
        Via Site Engineer
      </ToggleButton>
    </ToggleButtonGroup>
  </Box>
)}
```

Hardcode `paymentChannel = "direct"`:

```tsx
// Before
const [paymentChannel, setPaymentChannel] = useState<PaymentChannel>("direct");

// After (state kept so downstream code reads `paymentChannel` unchanged)
const paymentChannel: PaymentChannel = "direct";
```

Delete the engineer-selection `Collapse` block (lines 756-811) — the entire `<Collapse in={paymentChannel === "engineer_wallet"}>` and its content.

In the submit handler, simplify the `processSettlement` call to no longer pass `engineerId` / `engineerReference` (they're now always undefined in this dialog path). Leave the upstream `processSettlement` engineer-wallet branch alone — it stays for the (legacy) callers that still set them.

- [ ] **Step 4: Submit-button disable on invalid split**

Find the Confirm Settlement button (around line 898). Add validation:

```tsx
// Just before the submit button JSX:
import { validatePayerSourceInput } from "@/lib/settlement/payerSource";

const payerCheck = validatePayerSourceInput(payer, paymentAmount);

// In the button's disabled prop:
disabled={processing || !payerCheck.ok}
```

If the spec is followed, the button's existing disabled list already includes loading/processing — just add `|| !payerCheck.ok`.

Surface the reason inline below the button (or in an existing helper area) so the user sees why:

```tsx
{!payerCheck.ok && payer.mode === "split" && (
  <Typography variant="caption" color="error.main" sx={{ display: "block", mt: 1 }}>
    {payerCheck.reason}
  </Typography>
)}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: passes. Any remaining references to `moneySource` / `moneySourceName` / `setSelectedEngineerId` / `engineerReference` / `setPaymentChannel` not deleted will surface here.

- [ ] **Step 6: Visual + console verification (per CLAUDE.md)**

Start dev server (`npm run dev:cloud`), then via Playwright MCP:

1. Navigate to `http://localhost:3000/dev-login` — auto-signs in.
2. Open `/site/payments` → click any unsettled day with multiple records → "Settle" → the bulk salary dialog opens.
3. **Verify single-source path**: pick UPI, leave "Own Money" selected, fill the proof, click Confirm — settlement saves, toast confirms with the existing chip.
4. **Verify split path**: click "Split across sources" → 2 rows appear with Row-1 = Own Money, Row-2 = Trust Account → enter Row-1 amount = ₹3,000, Row-2 amount = ₹2,500 → "OK" status shows in green → click Confirm — settlement saves with `payer_source = 'split'` and JSONB populated.
5. **Verify sum-mismatch blocks confirm**: enter Row-1 = ₹3,000, Row-2 = ₹1,000 → confirm button disabled, "Over by ₹1,000" or "Remaining ₹1,500" shows.
6. **Verify "Via Site Engineer" is gone**: only "Direct Payment" is shown (or the entire channel section is gone for admin/office users).
7. **Console check**: zero errors, zero MUI warnings, zero hydration warnings.

Verify in Supabase (read-only):

```sql
SELECT settlement_reference, payer_source, payer_source_split, total_amount
FROM settlement_groups
ORDER BY created_at DESC
LIMIT 3;
```

Expected: a single-source row (Step 3) with `payer_source = 'own_money'`, `payer_source_split IS NULL`; and a split row (Step 4) with `payer_source = 'split'`, JSONB with two entries.

- [ ] **Step 7: Commit**

```bash
git add src/components/payments/PaymentDialog.tsx
git commit -m "feat(payments): PayerSourceSplitInput + drop Via-Site-Engineer channel"
```

---

## Task 10: Final pass — type-check, build, lint

- [ ] **Step 1: Full type-check + build**

```bash
npx tsc --noEmit
npm run build
```

Expected: both pass.

- [ ] **Step 2: Full vitest run**

```bash
npx vitest run
```

Expected: all green; the two new test files contribute 21 new passing tests.

- [ ] **Step 3: Commit any incidental fixes**

If the build flagged a downstream caller of `processSettlement` we missed, fix and commit:

```bash
git add <file>
git commit -m "fix(settlement): update <caller> for PayerSourceInput contract"
```

---

## What ships after Phase 1

- Schema-ready: all 8 domain tables can store splits; only `settlement_groups` is wired through end-to-end.
- One dialog (`PaymentDialog`) uses the toggle.
- "Via Site Engineer" is gone from `PaymentDialog`. The other two dialogs (`UnifiedSettlementDialog`, `ContractPaymentRecordDialog`) still have it — Phase 2 cleanup.
- `v_all_expenses.payer_source_split` is populated for settlement_groups rows; consumers can rely on it.

## Out of scope (Phase 2 / 3)

- Wiring `PayerSourceSplitInput` into the other 12 write dialogs.
- Extending each domain's atomic RPC (misc_expense, tea_shop, materials, rentals, wallet deposit) to accept `p_payer_source_split`.
- Extending `v_all_expenses` to surface splits from the other 7 tables.
- Updating `MoneySourceSummaryCard` aggregation.
- Edit-dialog support across all domains.
- Read-side migration of `SettlementEditDialog`, `MiscExpenseViewDialog`, etc. to `PayerSourceChip`.

These each get a focused plan once Phase 1 is in prod.
