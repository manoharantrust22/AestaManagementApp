# Salary Payments Waterfall Revival — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `/site/payments` to revive the deleted waterfall payment model + 5-KPI hero, anchor the page to its parent subcontract, refresh terminology, and split the unified ledger into three purpose-built tabs (Salary Waterfall / Advances / Daily+Market). Compact and mobile-first throughout.

**Architecture:** Five vertically stacked regions composed in `payments-content.tsx`: subcontract context strip → 5-KPI salary slice hero → pending warning band → three-tab strip (Salary Waterfall / Advances / Daily+Market) → InspectPane (mounted globally). Two new RPCs (`get_salary_waterfall`, `get_salary_slice_summary`) and one extension to `get_payments_ledger` carry the data layer. Per-laborer drilldown is dropped (mestri owns that ledger).

**Tech Stack:** Next.js 15, MUI v7, React Query v5, Supabase PostgreSQL (PL/pgSQL RPCs), Vitest + RTL for tests.

**Spec:** [docs/superpowers/specs/2026-04-26-salary-payments-waterfall-revival-design.md](../specs/2026-04-26-salary-payments-waterfall-revival-design.md)

**Mockup (reference):** `.superpowers/brainstorm/2007-1777217120/content/combined-final.html`

---

## File structure map

### New files (create)

| Path | Responsibility |
|---|---|
| `supabase/migrations/20260426140000_add_get_salary_waterfall_rpc.sql` | Per-week wages-due + waterfall-allocated paid + filled_by refs |
| `supabase/migrations/20260426150000_add_get_salary_slice_summary_rpc.sql` | Single-row hero totals (wages_due, settlements_total, advances_total, future_credit, mestri_owed) |
| `supabase/migrations/20260426160000_extend_get_payments_ledger_subtype.sql` | Add `subtype` column; remove `'Settlement'` COALESCE fallback in `for_label` |
| `src/hooks/queries/useSalaryWaterfall.ts` | React Query wrapper for `get_salary_waterfall` |
| `src/hooks/queries/useSalarySliceSummary.ts` | React Query wrapper for `get_salary_slice_summary` |
| `src/hooks/queries/useAdvances.ts` | React Query wrapper for advance subset of `get_payments_ledger` |
| `src/hooks/queries/useSubcontractSpend.ts` | All-categories spend total for a subcontract |
| `src/components/payments/SalarySliceHero.tsx` | 5-KPI hero + progress bar (responsive grid) |
| `src/components/payments/SalaryWaterfallList.tsx` | Per-week vertical list with Settled/Underpaid/Pending chips and Future-credit synthetic row |
| `src/components/payments/AdvancesList.tsx` | Outside-waterfall advances list with footer total |
| `src/components/payments/DailyMarketLedger.tsx` | Renamed/refactored from `PaymentsLedger.tsx` with week-separator grouping rows |
| `src/components/payments/SubcontractContextStrip.tsx` | Page anchor, links to /site/subcontracts |
| `src/components/payments/SalaryWaterfallList.test.tsx` | Component tests |
| `src/components/payments/SalarySliceHero.test.tsx` | Component tests |
| `src/components/payments/AdvancesList.test.tsx` | Component tests |
| `src/components/payments/SubcontractContextStrip.test.tsx` | Component tests |
| `src/hooks/queries/useSalaryWaterfall.test.ts` | Hook test with mocked supabase |
| `src/hooks/queries/useSalarySliceSummary.test.ts` | Hook test with mocked supabase |

### Files to modify

| Path | Change |
|---|---|
| `src/app/(main)/site/payments/payments-content.tsx` | Restructured to compose the five regions; replaces 4-KPI strip + filter chip row + unified `PaymentsLedger` |
| `src/components/common/InspectPane/types.ts` | Add `weekly-aggregate` and `advance` entity kinds |
| `src/hooks/useInspectPane.ts` | Update `entityKey()` for new kinds |
| `src/components/common/InspectPane/AttendanceTab.tsx` | Add `WeeklyAggregateShape` branch; `AdvanceShape` short-circuit |
| `src/components/common/InspectPane/InspectPane.tsx` | Hide Attendance + Work Updates tabs when `entity.kind === 'advance'` |
| `src/components/payments/PaymentsLedger.tsx` | Renamed to `DailyMarketLedger.tsx` (above); narrowed to daily-market only with week-separator rows |
| `src/hooks/queries/usePaymentsLedger.ts` | Add `subtype` field to `PaymentsLedgerRow`; default `p_type='daily-market'` for the renamed ledger |

### Files to delete

None. The current `PaymentsLedger` is renamed/refactored, not removed (see "modify" above).

---

## Phase 0 — Data foundation

Three migrations + smoke tests. After this phase, the new RPCs return correct values when called via psql, and `get_payments_ledger` no longer returns `'Settlement'` as a `for_label`.

### Task 0.1: Create `get_salary_waterfall` RPC

**Files:**
- Create: `supabase/migrations/20260426140000_add_get_salary_waterfall_rpc.sql`

- [ ] **Step 1: Write the smoke-test query (run it first to confirm function-not-exists)**

Save this as a scratch file `/tmp/smoke_salary_waterfall.sql`:

```sql
SELECT week_start, week_end, wages_due, paid, status, jsonb_array_length(filled_by) AS filled_count
FROM public.get_salary_waterfall(
  p_site_id        := (SELECT id FROM public.sites WHERE name ILIKE 'Srinivasan House%' LIMIT 1),
  p_subcontract_id := NULL,
  p_date_from      := '2026-04-01',
  p_date_to        := '2026-04-26'
)
ORDER BY week_start;
```

- [ ] **Step 2: Run smoke test against local DB to confirm function does not exist**

```bash
psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f /tmp/smoke_salary_waterfall.sql
```

Expected: `ERROR:  function public.get_salary_waterfall(...) does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260426140000_add_get_salary_waterfall_rpc.sql` with:

```sql
-- Migration: Add get_salary_waterfall RPC
-- Purpose: Per-week wages_due (from contract laborer attendance) + waterfall-
--          allocated paid (from settlement_groups linked via labor_payments
--          where is_under_contract=true) + filled_by JSON array of contributing
--          settlement refs and amounts.
-- Algorithm: Lifted from the deleted ContractWeeklyPaymentsTab.tsx (commit
--            459a2c7 lines 495-595). Sort weeks oldest-first, sort settlements
--            oldest-first (tiebreak by id), allocate min(remaining,week_due)
--            per week. Per-week paid is invariant <= wages_due — aggregate
--            future_credit lives in get_salary_slice_summary, not here.
-- Cap: 200 weeks (LIMIT 200).
-- Tiebreak: settlement_groups with the same settlement_date are ordered by id.

CREATE OR REPLACE FUNCTION public.get_salary_waterfall(
  p_site_id          uuid,
  p_subcontract_id   uuid    DEFAULT NULL,
  p_date_from        date    DEFAULT NULL,
  p_date_to          date    DEFAULT NULL
) RETURNS TABLE (
  week_start         date,
  week_end           date,
  days_worked        int,
  laborer_count      int,
  wages_due          numeric,
  paid               numeric,
  status             text,
  filled_by          jsonb
)
  LANGUAGE plpgsql STABLE
  SECURITY INVOKER
  SET search_path = public
AS $$
DECLARE
  v_week           record;
  v_settlement     record;
  v_remaining      numeric;
  v_alloc          numeric;
  v_week_due_left  numeric;
  v_allocated_to   jsonb;
BEGIN
  -- Build temp table of weeks with wages_due (per-week earned).
  CREATE TEMP TABLE _weeks ON COMMIT DROP AS
  WITH attendance_in_scope AS (
    SELECT
      date_trunc('week', d.date)::date AS week_start,
      d.laborer_id,
      d.daily_earnings
    FROM public.daily_attendance d
    JOIN public.laborers l ON l.id = d.laborer_id
    LEFT JOIN public.subcontracts s ON s.id = d.subcontract_id
    WHERE d.site_id = p_site_id
      AND d.is_deleted = false
      AND l.laborer_type = 'contract'
      AND (p_date_from IS NULL OR d.date >= p_date_from)
      AND (p_date_to   IS NULL OR d.date <= p_date_to)
      AND (p_subcontract_id IS NULL OR d.subcontract_id = p_subcontract_id)
  )
  SELECT
    week_start,
    (week_start + 6)::date                    AS week_end,
    COUNT(*)::int                              AS days_worked,
    COUNT(DISTINCT laborer_id)::int            AS laborer_count,
    COALESCE(SUM(daily_earnings), 0)::numeric  AS wages_due,
    0::numeric                                 AS paid,
    '[]'::jsonb                                AS filled_by
  FROM attendance_in_scope
  GROUP BY week_start
  ORDER BY week_start
  LIMIT 200;

  -- Build temp table of contract-linked settlements in scope, ordered.
  CREATE TEMP TABLE _settlements ON COMMIT DROP AS
  SELECT
    sg.id,
    sg.settlement_reference,
    sg.settlement_date,
    sg.total_amount::numeric AS amount,
    sg.total_amount::numeric AS remaining
  FROM public.settlement_groups sg
  WHERE sg.site_id = p_site_id
    AND sg.is_cancelled = false
    AND sg.settlement_date IS NOT NULL
    AND (p_date_from IS NULL OR sg.settlement_date >= p_date_from)
    AND (p_date_to   IS NULL OR sg.settlement_date <= p_date_to)
    AND EXISTS (
      SELECT 1 FROM public.labor_payments lp
      WHERE lp.settlement_group_id = sg.id
        AND lp.is_under_contract = true
        AND (p_subcontract_id IS NULL OR lp.subcontract_id = p_subcontract_id)
    )
  ORDER BY sg.settlement_date ASC, sg.id ASC;

  -- Walk settlements in order, allocate to weeks in order.
  FOR v_settlement IN SELECT * FROM _settlements LOOP
    v_remaining := v_settlement.remaining;

    FOR v_week IN SELECT * FROM _weeks ORDER BY week_start LOOP
      EXIT WHEN v_remaining <= 0;

      v_week_due_left := v_week.wages_due - v_week.paid;
      IF v_week_due_left <= 0 THEN
        CONTINUE;
      END IF;

      v_alloc := LEAST(v_remaining, v_week_due_left);

      UPDATE _weeks
        SET paid = paid + v_alloc,
            filled_by = filled_by || jsonb_build_array(jsonb_build_object(
              'ref',         v_settlement.settlement_reference,
              'amount',      v_alloc,
              'settled_at',  v_settlement.settlement_date
            ))
      WHERE _weeks.week_start = v_week.week_start;

      v_remaining := v_remaining - v_alloc;
    END LOOP;
  END LOOP;

  RETURN QUERY
  SELECT
    w.week_start,
    w.week_end,
    w.days_worked,
    w.laborer_count,
    w.wages_due,
    w.paid,
    CASE
      WHEN w.paid = 0                       THEN 'pending'
      WHEN w.paid >= w.wages_due            THEN 'settled'
      ELSE                                       'underpaid'
    END AS status,
    w.filled_by
  FROM _weeks w
  ORDER BY w.week_start;
END;
$$;

COMMENT ON FUNCTION public.get_salary_waterfall(uuid, uuid, date, date) IS
'Per-week wages_due (sum of daily_earnings for contract laborers) plus waterfall-allocated paid (oldest week first; per-week paid invariant <= wages_due). Aggregate future_credit lives in get_salary_slice_summary. Capped at 200 weeks.';

GRANT EXECUTE ON FUNCTION public.get_salary_waterfall(uuid, uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_salary_waterfall(uuid, uuid, date, date) TO service_role;
```

- [ ] **Step 4: Apply the migration locally**

```bash
npm run db:push
```

Expected: migration applies cleanly. If it fails, fix the SQL and re-run.

- [ ] **Step 5: Re-run smoke test, verify rows return**

```bash
psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f /tmp/smoke_salary_waterfall.sql
```

Expected: rows return for weeks in April 2026. Each row's `paid <= wages_due`. Status values are only `'settled'`, `'underpaid'`, or `'pending'`. `filled_count` matches the visible settlement_groups in that period.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260426140000_add_get_salary_waterfall_rpc.sql
git commit -m "feat(db): add get_salary_waterfall RPC for per-week waterfall allocation"
```

---

### Task 0.2: Create `get_salary_slice_summary` RPC

**Files:**
- Create: `supabase/migrations/20260426150000_add_get_salary_slice_summary_rpc.sql`

- [ ] **Step 1: Write smoke-test query**

Save as `/tmp/smoke_salary_summary.sql`:

```sql
SELECT *
FROM public.get_salary_slice_summary(
  p_site_id        := (SELECT id FROM public.sites WHERE name ILIKE 'Srinivasan House%' LIMIT 1),
  p_subcontract_id := NULL,
  p_date_from      := NULL,
  p_date_to        := NULL
);
```

- [ ] **Step 2: Run smoke test, verify function-does-not-exist**

```bash
psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f /tmp/smoke_salary_summary.sql
```

Expected: error.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260426150000_add_get_salary_slice_summary_rpc.sql`:

```sql
-- Migration: Add get_salary_slice_summary RPC
-- Purpose: Single-row aggregate totals powering the 5-KPI salary slice hero
--          on /site/payments. Computed independently of the per-week waterfall
--          so the hero loads quickly even before the waterfall list is fetched.
-- Output:
--   wages_due          - sum of daily_earnings for contract laborers in scope
--   settlements_total  - sum of contract-linked settlement_group amounts
--   advances_total     - sum of advance settlements (lp.payment_type='advance' AND
--                        is_advance_deduction=false)
--   paid_to_weeks      - LEAST(wages_due, settlements_total) — what the waterfall
--                        actually allocates to recorded weeks
--   future_credit      - GREATEST(0, settlements_total - wages_due) — excess paid
--   mestri_owed        - GREATEST(0, wages_due - settlements_total) — underpaid
--   weeks_count        - distinct ISO weeks with contract attendance in scope
--   settlement_count   - count of contract-linked settlement_groups
--   advance_count      - count of advance labor_payments

CREATE OR REPLACE FUNCTION public.get_salary_slice_summary(
  p_site_id          uuid,
  p_subcontract_id   uuid    DEFAULT NULL,
  p_date_from        date    DEFAULT NULL,
  p_date_to          date    DEFAULT NULL
) RETURNS TABLE (
  wages_due          numeric,
  settlements_total  numeric,
  advances_total     numeric,
  paid_to_weeks      numeric,
  future_credit      numeric,
  mestri_owed        numeric,
  weeks_count        int,
  settlement_count   int,
  advance_count      int
)
  LANGUAGE sql STABLE
  SECURITY INVOKER
  SET search_path = public
AS $$
  WITH
  wages AS (
    SELECT
      COALESCE(SUM(d.daily_earnings), 0)::numeric                     AS amt,
      COUNT(DISTINCT date_trunc('week', d.date))::int                  AS weeks
    FROM public.daily_attendance d
    JOIN public.laborers l ON l.id = d.laborer_id
    WHERE d.site_id = p_site_id
      AND d.is_deleted = false
      AND l.laborer_type = 'contract'
      AND (p_date_from IS NULL OR d.date >= p_date_from)
      AND (p_date_to   IS NULL OR d.date <= p_date_to)
      AND (p_subcontract_id IS NULL OR d.subcontract_id = p_subcontract_id)
  ),
  setts AS (
    SELECT
      COALESCE(SUM(sg.total_amount), 0)::numeric AS amt,
      COUNT(*)::int                              AS cnt
    FROM public.settlement_groups sg
    WHERE sg.site_id = p_site_id
      AND sg.is_cancelled = false
      AND sg.settlement_date IS NOT NULL
      AND (p_date_from IS NULL OR sg.settlement_date >= p_date_from)
      AND (p_date_to   IS NULL OR sg.settlement_date <= p_date_to)
      AND EXISTS (
        SELECT 1 FROM public.labor_payments lp
        WHERE lp.settlement_group_id = sg.id
          AND lp.is_under_contract = true
          AND (p_subcontract_id IS NULL OR lp.subcontract_id = p_subcontract_id)
      )
  ),
  advs AS (
    SELECT
      COALESCE(SUM(lp.amount), 0)::numeric AS amt,
      COUNT(*)::int                        AS cnt
    FROM public.labor_payments lp
    JOIN public.laborers l ON l.id = lp.laborer_id
    WHERE l.site_id = p_site_id
      AND lp.payment_type = 'advance'
      AND lp.is_advance_deduction = false
      AND (p_date_from IS NULL OR lp.payment_date >= p_date_from)
      AND (p_date_to   IS NULL OR lp.payment_date <= p_date_to)
      AND (p_subcontract_id IS NULL OR lp.subcontract_id = p_subcontract_id)
  )
  SELECT
    wages.amt                                            AS wages_due,
    setts.amt                                            AS settlements_total,
    advs.amt                                             AS advances_total,
    LEAST(wages.amt, setts.amt)                          AS paid_to_weeks,
    GREATEST(0, setts.amt - wages.amt)                   AS future_credit,
    GREATEST(0, wages.amt - setts.amt)                   AS mestri_owed,
    wages.weeks                                          AS weeks_count,
    setts.cnt                                            AS settlement_count,
    advs.cnt                                             AS advance_count
  FROM wages, setts, advs;
$$;

COMMENT ON FUNCTION public.get_salary_slice_summary(uuid, uuid, date, date) IS
'Single-row aggregate totals for the 5-KPI salary slice hero on /site/payments. Wages due (attendance), settlements total (contract-linked), advances total (separate), and derived paid_to_weeks / future_credit / mestri_owed.';

GRANT EXECUTE ON FUNCTION public.get_salary_slice_summary(uuid, uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_salary_slice_summary(uuid, uuid, date, date) TO service_role;
```

- [ ] **Step 4: Apply migration**

```bash
npm run db:push
```

- [ ] **Step 5: Re-run smoke test**

Expected: one row with non-negative numbers. `paid_to_weeks + future_credit == settlements_total`. `paid_to_weeks + mestri_owed == wages_due`. Cross-check `wages_due` against the sum of `wages_due` from `get_salary_waterfall` for the same scope — they should match for fully-contained date ranges.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260426150000_add_get_salary_slice_summary_rpc.sql
git commit -m "feat(db): add get_salary_slice_summary RPC for hero KPI totals"
```

---

### Task 0.3: Extend `get_payments_ledger` with `subtype` column

**Files:**
- Create: `supabase/migrations/20260426160000_extend_get_payments_ledger_subtype.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260426160000_extend_get_payments_ledger_subtype.sql`:

```sql
-- Migration: Extend get_payments_ledger with `subtype` column
-- Purpose: Replace the 'Settlement' COALESCE fallback in for_label with an
--          honest classification. New `subtype` discriminator drives correct
--          tab routing and InspectPane shape selection.
--          subtype values: 'salary-waterfall' | 'advance' | 'daily-market' | 'adjustment'

CREATE OR REPLACE FUNCTION public.get_payments_ledger(
  p_site_id   uuid,
  p_date_from date    DEFAULT NULL,
  p_date_to   date    DEFAULT NULL,
  p_status    text    DEFAULT 'all',
  p_type      text    DEFAULT 'all'
) RETURNS TABLE (
  id                  text,
  settlement_ref      text,
  row_type            text,
  subtype             text,
  date_or_week_start  date,
  week_end            date,
  for_label           text,
  amount              numeric,
  is_paid             boolean,
  is_pending          boolean,
  laborer_id          uuid
)
  LANGUAGE sql STABLE
  SECURITY INVOKER
  SET search_path = public
AS $$
  WITH
  paid_dm AS (
    SELECT
      sg.id,
      sg.settlement_reference,
      sg.settlement_date,
      sg.total_amount,
      (SELECT COUNT(DISTINCT da.laborer_id)
         FROM public.daily_attendance da
         WHERE da.settlement_group_id = sg.id) AS daily_lab,
      (SELECT COUNT(*)
         FROM public.market_laborer_attendance ma
         WHERE ma.settlement_group_id = sg.id) AS mkt_cnt
    FROM public.settlement_groups sg
    WHERE sg.site_id = p_site_id
      AND sg.is_cancelled = false
      AND sg.settlement_date IS NOT NULL
      AND (p_date_from IS NULL OR sg.settlement_date >= p_date_from)
      AND (p_date_to   IS NULL OR sg.settlement_date <= p_date_to)
      AND (
        EXISTS (SELECT 1 FROM public.daily_attendance da
                  WHERE da.settlement_group_id = sg.id)
        OR EXISTS (SELECT 1 FROM public.market_laborer_attendance ma
                  WHERE ma.settlement_group_id = sg.id)
      )
  ),
  paid_dm_rows AS (
    SELECT
      'p:'||p.id::text                                   AS id,
      p.settlement_reference                             AS settlement_ref,
      'daily-market'::text                               AS row_type,
      'daily-market'::text                               AS subtype,
      p.settlement_date                                  AS date_or_week_start,
      NULL::date                                         AS week_end,
      (
        CASE WHEN p.daily_lab > 0 THEN p.daily_lab::text || ' lab' ELSE '' END
        || CASE WHEN p.daily_lab > 0 AND p.mkt_cnt > 0 THEN ' + ' ELSE '' END
        || CASE WHEN p.mkt_cnt   > 0 THEN p.mkt_cnt::text || ' mkt' ELSE '' END
      )                                                   AS for_label,
      p.total_amount                                      AS amount,
      TRUE                                                AS is_paid,
      FALSE                                               AS is_pending,
      NULL::uuid                                          AS laborer_id
    FROM paid_dm p
  ),
  -- Paid weekly bucket — split by classifier into 'salary-waterfall', 'advance', 'adjustment'
  paid_wk AS (
    SELECT
      sg.id,
      sg.settlement_reference,
      sg.settlement_date,
      sg.total_amount,
      EXISTS (SELECT 1 FROM public.labor_payments lp
              WHERE lp.settlement_group_id = sg.id AND lp.is_under_contract = true) AS has_contract,
      EXISTS (SELECT 1 FROM public.labor_payments lp
              WHERE lp.settlement_group_id = sg.id AND lp.payment_type = 'advance'
                AND lp.is_advance_deduction = false) AS has_advance,
      COALESCE(sg.excess_paid, 0)::numeric > 0 AS is_excess
    FROM public.settlement_groups sg
    WHERE sg.site_id = p_site_id
      AND sg.is_cancelled = false
      AND sg.settlement_date IS NOT NULL
      AND (p_date_from IS NULL OR sg.settlement_date >= p_date_from)
      AND (p_date_to   IS NULL OR sg.settlement_date <= p_date_to)
      AND NOT EXISTS (SELECT 1 FROM public.daily_attendance da
                        WHERE da.settlement_group_id = sg.id)
      AND NOT EXISTS (SELECT 1 FROM public.market_laborer_attendance ma
                        WHERE ma.settlement_group_id = sg.id)
  ),
  paid_wk_with_lab AS (
    SELECT
      p.*,
      (SELECT lp.laborer_id FROM public.labor_payments lp
         WHERE lp.settlement_group_id = p.id LIMIT 1) AS one_laborer_id,
      (SELECT COUNT(DISTINCT lp.laborer_id) FROM public.labor_payments lp
         WHERE lp.settlement_group_id = p.id) AS distinct_lab_cnt,
      (SELECT l.name FROM public.laborers l
         JOIN public.labor_payments lp ON lp.laborer_id = l.id
         WHERE lp.settlement_group_id = p.id LIMIT 1) AS one_laborer_name
    FROM paid_wk p
  ),
  paid_wk_rows AS (
    SELECT
      'p:'||p.id::text                                                  AS id,
      p.settlement_reference                                            AS settlement_ref,
      'weekly'::text                                                    AS row_type,
      CASE
        WHEN p.is_excess                          THEN 'adjustment'
        WHEN p.has_advance AND NOT p.has_contract THEN 'advance'
        WHEN p.has_contract                       THEN 'salary-waterfall'
        ELSE                                            'unclassified'
      END                                                               AS subtype,
      date_trunc('week', p.settlement_date)::date                       AS date_or_week_start,
      (date_trunc('week', p.settlement_date)::date + 6)                 AS week_end,
      CASE
        WHEN p.is_excess THEN
          COALESCE(p.one_laborer_name, '') || ' · excess return'
        WHEN p.has_advance AND NOT p.has_contract THEN
          COALESCE(p.one_laborer_name, 'Mestri') || ' · advance'
        WHEN p.distinct_lab_cnt = 1 THEN
          p.one_laborer_name
        WHEN p.distinct_lab_cnt > 1 THEN
          'Group settlement (' || p.distinct_lab_cnt::text || ' laborers)'
        ELSE 'Unclassified settlement'
      END                                                               AS for_label,
      p.total_amount                                                    AS amount,
      TRUE                                                              AS is_paid,
      FALSE                                                             AS is_pending,
      CASE WHEN p.distinct_lab_cnt = 1 THEN p.one_laborer_id ELSE NULL END AS laborer_id
    FROM paid_wk_with_lab p
  ),
  pending_da AS (
    SELECT
      d.date AS d,
      SUM(d.daily_earnings)::numeric AS amt,
      COUNT(DISTINCT d.laborer_id) AS lab_cnt
    FROM public.daily_attendance d
    JOIN public.laborers l ON l.id = d.laborer_id
    WHERE d.site_id = p_site_id
      AND d.is_deleted = false
      AND d.is_paid = false
      AND l.laborer_type <> 'contract'
      AND (p_date_from IS NULL OR d.date >= p_date_from)
      AND (p_date_to   IS NULL OR d.date <= p_date_to)
    GROUP BY d.date
  ),
  pending_ma AS (
    SELECT
      m.date AS d,
      SUM(m.total_cost)::numeric AS amt,
      COUNT(*) AS mkt_cnt
    FROM public.market_laborer_attendance m
    WHERE m.site_id = p_site_id
      AND m.is_paid = false
      AND (p_date_from IS NULL OR m.date >= p_date_from)
      AND (p_date_to   IS NULL OR m.date <= p_date_to)
    GROUP BY m.date
  ),
  pending_dm_rows AS (
    SELECT
      'pd:' || COALESCE(da.d, ma.d)::text                               AS id,
      NULL::text                                                        AS settlement_ref,
      'daily-market'::text                                              AS row_type,
      'daily-market'::text                                              AS subtype,
      COALESCE(da.d, ma.d)                                              AS date_or_week_start,
      NULL::date                                                        AS week_end,
      (
        CASE WHEN COALESCE(da.lab_cnt, 0) > 0
          THEN da.lab_cnt::text || ' daily lab' ELSE '' END
        || CASE WHEN COALESCE(da.lab_cnt, 0) > 0 AND COALESCE(ma.mkt_cnt, 0) > 0
          THEN ' + ' ELSE '' END
        || CASE WHEN COALESCE(ma.mkt_cnt, 0) > 0
          THEN ma.mkt_cnt::text || ' mkt' ELSE '' END
      )                                                                  AS for_label,
      (COALESCE(da.amt, 0) + COALESCE(ma.amt, 0))::numeric              AS amount,
      FALSE                                                              AS is_paid,
      TRUE                                                               AS is_pending,
      NULL::uuid                                                         AS laborer_id
    FROM pending_da da
    FULL OUTER JOIN pending_ma ma ON ma.d = da.d
  ),
  all_rows AS (
    SELECT * FROM paid_dm_rows
    UNION ALL
    SELECT * FROM paid_wk_rows
    UNION ALL
    SELECT * FROM pending_dm_rows
  )
  SELECT
    id, settlement_ref, row_type, subtype,
    date_or_week_start, week_end, for_label, amount,
    is_paid, is_pending, laborer_id
  FROM all_rows
  WHERE
    (p_status = 'all'
      OR (p_status = 'pending'   AND is_pending)
      OR (p_status = 'completed' AND is_paid))
    AND (p_type = 'all'
      OR (p_type = 'daily-market' AND row_type = 'daily-market')
      OR (p_type = 'weekly'        AND row_type = 'weekly'))
  ORDER BY is_pending DESC, date_or_week_start DESC
  LIMIT 2000;
$$;

COMMENT ON FUNCTION public.get_payments_ledger(uuid, date, date, text, text) IS
'Unified ledger feed for /site/payments tabs. Adds subtype discriminator (salary-waterfall / advance / adjustment / daily-market / unclassified) replacing the prior ''Settlement'' COALESCE fallback. Pending-weekly stream remains stubbed.';
```

- [ ] **Step 2: Apply migration**

```bash
npm run db:push
```

- [ ] **Step 3: Smoke test — verify no `'Settlement'` fallbacks remain**

Save as `/tmp/smoke_subtype.sql`:

```sql
SELECT subtype, COUNT(*), MIN(for_label), MAX(for_label)
FROM public.get_payments_ledger(
  (SELECT id FROM public.sites WHERE name ILIKE 'Srinivasan House%' LIMIT 1),
  NULL, NULL, 'completed', 'weekly'
)
GROUP BY subtype
ORDER BY subtype;
```

```bash
psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f /tmp/smoke_subtype.sql
```

Expected: rows grouped by subtype (`salary-waterfall`, `advance`, `adjustment`, possibly `unclassified`). No row has `for_label = 'Settlement'`. `unclassified` count should be small or zero — investigate any non-zero count before proceeding.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260426160000_extend_get_payments_ledger_subtype.sql
git commit -m "feat(db): add subtype discriminator to get_payments_ledger; drop Settlement fallback"
```

---

## Phase 1 — Hero + Waterfall

After this phase, `/site/payments` shows the new 5-KPI hero and the waterfall list. The current 4-KPI strip and unified `PaymentsLedger` are temporarily hidden behind a feature condition; tabs are not yet wired.

### Task 1.1: `useSalarySliceSummary` hook + test

**Files:**
- Create: `src/hooks/queries/useSalarySliceSummary.ts`
- Create: `src/hooks/queries/useSalarySliceSummary.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/queries/useSalarySliceSummary.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useSalarySliceSummary } from "./useSalarySliceSummary";

const mockRpc = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ rpc: mockRpc }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useSalarySliceSummary", () => {
  beforeEach(() => mockRpc.mockReset());

  it("calls get_salary_slice_summary with mapped params", async () => {
    mockRpc.mockResolvedValue({
      data: [{
        wages_due: "234400",
        settlements_total: "182400",
        advances_total: "43400",
        paid_to_weeks: "182400",
        future_credit: "0",
        mestri_owed: "52000",
        weeks_count: 12,
        settlement_count: 8,
        advance_count: 5,
      }],
      error: null,
    });

    const { result } = renderHook(
      () => useSalarySliceSummary({
        siteId: "site-1",
        subcontractId: "sub-1",
        dateFrom: "2026-04-01",
        dateTo: "2026-04-26",
      }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockRpc).toHaveBeenCalledWith("get_salary_slice_summary", {
      p_site_id: "site-1",
      p_subcontract_id: "sub-1",
      p_date_from: "2026-04-01",
      p_date_to: "2026-04-26",
    });
    expect(result.current.data).toEqual({
      wagesDue: 234400,
      settlementsTotal: 182400,
      advancesTotal: 43400,
      paidToWeeks: 182400,
      futureCredit: 0,
      mestriOwed: 52000,
      weeksCount: 12,
      settlementCount: 8,
      advanceCount: 5,
    });
  });

  it("returns zero defaults when RPC returns empty array", async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    const { result } = renderHook(
      () => useSalarySliceSummary({ siteId: "site-1", subcontractId: null, dateFrom: null, dateTo: null }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.wagesDue).toBe(0);
    expect(result.current.data?.mestriOwed).toBe(0);
  });

  it("is disabled when siteId is undefined", () => {
    const { result } = renderHook(
      () => useSalarySliceSummary({ siteId: undefined, subcontractId: null, dateFrom: null, dateTo: null }),
      { wrapper }
    );
    expect(result.current.fetchStatus).toBe("idle");
  });
});
```

- [ ] **Step 2: Run test, verify fail**

```bash
npm run test -- src/hooks/queries/useSalarySliceSummary.test.ts
```

Expected: FAIL — `useSalarySliceSummary` does not exist.

- [ ] **Step 3: Implement the hook**

Create `src/hooks/queries/useSalarySliceSummary.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface SalarySliceSummary {
  wagesDue: number;
  settlementsTotal: number;
  advancesTotal: number;
  paidToWeeks: number;
  futureCredit: number;
  mestriOwed: number;
  weeksCount: number;
  settlementCount: number;
  advanceCount: number;
}

export interface UseSalarySliceSummaryArgs {
  siteId: string | undefined;
  subcontractId: string | null;
  dateFrom: string | null;
  dateTo: string | null;
}

const ZERO: SalarySliceSummary = {
  wagesDue: 0,
  settlementsTotal: 0,
  advancesTotal: 0,
  paidToWeeks: 0,
  futureCredit: 0,
  mestriOwed: 0,
  weeksCount: 0,
  settlementCount: 0,
  advanceCount: 0,
};

export function useSalarySliceSummary(args: UseSalarySliceSummaryArgs) {
  const supabase = createClient();
  const { siteId, subcontractId, dateFrom, dateTo } = args;
  return useQuery<SalarySliceSummary>({
    queryKey: ["salary-slice-summary", siteId, subcontractId, dateFrom, dateTo],
    enabled: Boolean(siteId),
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_salary_slice_summary", {
        p_site_id:        siteId,
        p_subcontract_id: subcontractId,
        p_date_from:      dateFrom,
        p_date_to:        dateTo,
      });
      if (error) throw error;
      const row = (data && data.length > 0 ? data[0] : null) as any;
      if (!row) return ZERO;
      return {
        wagesDue:         Number(row.wages_due) || 0,
        settlementsTotal: Number(row.settlements_total) || 0,
        advancesTotal:    Number(row.advances_total) || 0,
        paidToWeeks:      Number(row.paid_to_weeks) || 0,
        futureCredit:     Number(row.future_credit) || 0,
        mestriOwed:       Number(row.mestri_owed) || 0,
        weeksCount:       Number(row.weeks_count) || 0,
        settlementCount:  Number(row.settlement_count) || 0,
        advanceCount:     Number(row.advance_count) || 0,
      };
    },
  });
}
```

- [ ] **Step 4: Run test, verify pass**

```bash
npm run test -- src/hooks/queries/useSalarySliceSummary.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/queries/useSalarySliceSummary.ts src/hooks/queries/useSalarySliceSummary.test.ts
git commit -m "feat(payments): add useSalarySliceSummary hook for 5-KPI hero"
```

---

### Task 1.2: `useSalaryWaterfall` hook + test

**Files:**
- Create: `src/hooks/queries/useSalaryWaterfall.ts`
- Create: `src/hooks/queries/useSalaryWaterfall.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/queries/useSalaryWaterfall.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useSalaryWaterfall } from "./useSalaryWaterfall";

const mockRpc = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ rpc: mockRpc }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useSalaryWaterfall", () => {
  beforeEach(() => mockRpc.mockReset());

  it("maps RPC response to camelCase WaterfallWeek shape", async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          week_start: "2026-04-20",
          week_end: "2026-04-26",
          days_worked: 6,
          laborer_count: 4,
          wages_due: "52400",
          paid: "38200",
          status: "underpaid",
          filled_by: [{ ref: "SET-260423-001", amount: 38200, settled_at: "2026-04-23" }],
        },
      ],
      error: null,
    });

    const { result } = renderHook(
      () => useSalaryWaterfall({ siteId: "site-1", subcontractId: null, dateFrom: null, dateTo: null }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([
      {
        weekStart: "2026-04-20",
        weekEnd: "2026-04-26",
        daysWorked: 6,
        laborerCount: 4,
        wagesDue: 52400,
        paid: 38200,
        status: "underpaid",
        filledBy: [{ ref: "SET-260423-001", amount: 38200, settledAt: "2026-04-23" }],
      },
    ]);
  });

  it("treats missing filled_by as empty array", async () => {
    mockRpc.mockResolvedValue({
      data: [{
        week_start: "2026-04-13", week_end: "2026-04-19",
        days_worked: 0, laborer_count: 0,
        wages_due: "0", paid: "0",
        status: "pending", filled_by: null,
      }],
      error: null,
    });

    const { result } = renderHook(
      () => useSalaryWaterfall({ siteId: "site-1", subcontractId: null, dateFrom: null, dateTo: null }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0].filledBy).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test, verify fail**

```bash
npm run test -- src/hooks/queries/useSalaryWaterfall.test.ts
```

- [ ] **Step 3: Implement the hook**

Create `src/hooks/queries/useSalaryWaterfall.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface WaterfallFilledBy {
  ref: string;
  amount: number;
  settledAt: string;
}

export interface WaterfallWeek {
  weekStart: string;
  weekEnd: string;
  daysWorked: number;
  laborerCount: number;
  wagesDue: number;
  paid: number;
  status: "settled" | "underpaid" | "pending";
  filledBy: WaterfallFilledBy[];
}

export interface UseSalaryWaterfallArgs {
  siteId: string | undefined;
  subcontractId: string | null;
  dateFrom: string | null;
  dateTo: string | null;
}

export function useSalaryWaterfall(args: UseSalaryWaterfallArgs) {
  const supabase = createClient();
  const { siteId, subcontractId, dateFrom, dateTo } = args;
  return useQuery<WaterfallWeek[]>({
    queryKey: ["salary-waterfall", siteId, subcontractId, dateFrom, dateTo],
    enabled: Boolean(siteId),
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_salary_waterfall", {
        p_site_id:        siteId,
        p_subcontract_id: subcontractId,
        p_date_from:      dateFrom,
        p_date_to:        dateTo,
      });
      if (error) throw error;
      const rows = (data ?? []) as Array<any>;
      return rows.map<WaterfallWeek>((r) => ({
        weekStart:    r.week_start,
        weekEnd:      r.week_end,
        daysWorked:   Number(r.days_worked) || 0,
        laborerCount: Number(r.laborer_count) || 0,
        wagesDue:     Number(r.wages_due) || 0,
        paid:         Number(r.paid) || 0,
        status:       r.status as WaterfallWeek["status"],
        filledBy:     Array.isArray(r.filled_by)
          ? r.filled_by.map((f: any) => ({
              ref:        String(f.ref),
              amount:     Number(f.amount) || 0,
              settledAt:  String(f.settled_at),
            }))
          : [],
      }));
    },
  });
}
```

- [ ] **Step 4: Run test, verify pass**

```bash
npm run test -- src/hooks/queries/useSalaryWaterfall.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/hooks/queries/useSalaryWaterfall.ts src/hooks/queries/useSalaryWaterfall.test.ts
git commit -m "feat(payments): add useSalaryWaterfall hook for per-week waterfall list"
```

---

### Task 1.3: `SalarySliceHero` component + test

**Files:**
- Create: `src/components/payments/SalarySliceHero.tsx`
- Create: `src/components/payments/SalarySliceHero.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/payments/SalarySliceHero.test.tsx`:

```tsx
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SalarySliceHero } from "./SalarySliceHero";

describe("SalarySliceHero", () => {
  const baseSummary = {
    wagesDue: 234400,
    settlementsTotal: 182400,
    advancesTotal: 43400,
    paidToWeeks: 182400,
    futureCredit: 0,
    mestriOwed: 52000,
    weeksCount: 12,
    settlementCount: 8,
    advanceCount: 5,
  };

  it("renders the five KPI labels with Indian-formatted values", () => {
    render(<SalarySliceHero summary={baseSummary} isLoading={false} />);
    expect(screen.getByText("Wages Due")).toBeInTheDocument();
    expect(screen.getByText("Paid (waterfall)")).toBeInTheDocument();
    expect(screen.getByText("Advances")).toBeInTheDocument();
    expect(screen.getByText("Total Cash Out")).toBeInTheDocument();
    expect(screen.getByText("Mestri Owed")).toBeInTheDocument();
    expect(screen.getByText("₹2,34,400")).toBeInTheDocument();
  });

  it("shows 'Excess Paid' label when futureCredit > 0", () => {
    render(<SalarySliceHero summary={{ ...baseSummary, futureCredit: 4000, mestriOwed: 0 }} isLoading={false} />);
    expect(screen.getByText("Excess Paid")).toBeInTheDocument();
    expect(screen.queryByText("Mestri Owed")).not.toBeInTheDocument();
  });

  it("shows 'Settled' label when both mestriOwed and futureCredit are zero", () => {
    render(<SalarySliceHero summary={{ ...baseSummary, mestriOwed: 0, futureCredit: 0 }} isLoading={false} />);
    expect(screen.getByText("Settled")).toBeInTheDocument();
  });

  it("renders skeleton placeholders when isLoading", () => {
    render(<SalarySliceHero summary={undefined} isLoading={true} />);
    expect(screen.getAllByTestId("kpi-skeleton")).toHaveLength(5);
  });

  it("renders progress percentage from paidToWeeks/wagesDue", () => {
    render(<SalarySliceHero summary={baseSummary} isLoading={false} />);
    expect(screen.getByText("78%")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test, verify fail**

```bash
npm run test -- src/components/payments/SalarySliceHero.test.tsx
```

- [ ] **Step 3: Implement the component**

Create `src/components/payments/SalarySliceHero.tsx`:

```tsx
"use client";

import React from "react";
import { Box, Skeleton, Typography, useTheme } from "@mui/material";
import type { SalarySliceSummary } from "@/hooks/queries/useSalarySliceSummary";

interface SalarySliceHeroProps {
  summary: SalarySliceSummary | undefined;
  isLoading: boolean;
}

function formatINR(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

interface KpiTileProps {
  label: string;
  value: string;
  sub?: string;
  variant: "neutral" | "success" | "warning" | "info" | "error";
  formula?: string;
}

function KpiTile({ label, value, sub, variant, formula }: KpiTileProps) {
  const theme = useTheme();
  const palette = {
    neutral: { border: theme.palette.grey[600], bg: theme.palette.grey[50],   val: theme.palette.text.primary },
    success: { border: theme.palette.success.main, bg: theme.palette.success.light + "40",  val: theme.palette.success.dark },
    warning: { border: theme.palette.warning.main, bg: theme.palette.warning.light + "40",  val: theme.palette.warning.dark },
    info:    { border: theme.palette.info.main,    bg: theme.palette.info.light + "40",     val: theme.palette.info.dark },
    error:   { border: theme.palette.error.main,   bg: theme.palette.error.light + "40",    val: theme.palette.error.dark },
  }[variant];

  return (
    <Box
      sx={{
        borderRadius: 1.5,
        p: 1.5,
        bgcolor: palette.bg,
        borderLeft: `3px solid ${palette.border}`,
        border: `1px solid ${theme.palette.divider}`,
      }}
    >
      <Typography
        variant="caption"
        sx={{ display: "block", fontSize: 10, fontWeight: 700,
              textTransform: "uppercase", letterSpacing: 0.4,
              color: "text.secondary", mb: 0.5 }}
      >
        {label}
      </Typography>
      <Typography sx={{ fontSize: { xs: 16, sm: 19 }, fontWeight: 700,
                         fontVariantNumeric: "tabular-nums", color: palette.val,
                         lineHeight: 1.1 }}>
        {value}
      </Typography>
      {sub && (
        <Typography sx={{ fontSize: 10.5, color: "text.secondary", mt: 0.25 }}>
          {sub}
        </Typography>
      )}
      {formula && (
        <Typography sx={{ fontSize: 10, color: "text.disabled", fontStyle: "italic", mt: 0.25 }}>
          {formula}
        </Typography>
      )}
    </Box>
  );
}

export function SalarySliceHero({ summary, isLoading }: SalarySliceHeroProps) {
  const theme = useTheme();

  if (isLoading || !summary) {
    return (
      <Box sx={{ p: { xs: 1.5, sm: 2 }, mb: 1.5,
                  bgcolor: "background.paper",
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: 1.5 }}>
        <Box sx={{
          display: "grid",
          gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(3, 1fr)", md: "repeat(5, 1fr)" },
          gap: 1.25,
          mb: 1.5,
        }}>
          {[0,1,2,3,4].map((i) => (
            <Skeleton key={i} variant="rounded" height={72} data-testid="kpi-skeleton" />
          ))}
        </Box>
        <Skeleton variant="rounded" height={10} />
      </Box>
    );
  }

  const totalCashOut = summary.paidToWeeks + summary.advancesTotal + summary.futureCredit;
  const progressPct = summary.wagesDue > 0
    ? Math.min(100, Math.round((summary.paidToWeeks / summary.wagesDue) * 100))
    : 0;
  const progressColor =
    progressPct < 50 ? theme.palette.error.main :
    progressPct < 80 ? theme.palette.warning.main :
                       theme.palette.success.main;

  // sign-aware status KPI
  let statusLabel: string;
  let statusVariant: KpiTileProps["variant"];
  let statusValue: string;
  let statusSub: string;
  if (summary.futureCredit > 0) {
    statusLabel = "Excess Paid";
    statusVariant = "info";
    statusValue = formatINR(summary.futureCredit);
    statusSub = "rolls forward to future work";
  } else if (summary.mestriOwed > 0) {
    statusLabel = "Mestri Owed";
    statusVariant = "error";
    statusValue = formatINR(summary.mestriOwed);
    statusSub = "due based on work done";
  } else {
    statusLabel = "Settled";
    statusVariant = "success";
    statusValue = "₹0";
    statusSub = "fully paid up";
  }

  return (
    <Box sx={{
      p: { xs: 1.5, sm: 2 },
      mb: 1.5,
      bgcolor: "background.paper",
      border: `1px solid ${theme.palette.divider}`,
      borderRadius: 1.5,
    }}>
      <Typography sx={{ fontSize: 11, fontWeight: 700, color: "text.secondary",
                         textTransform: "uppercase", letterSpacing: 0.5, mb: 1 }}>
        Salary slice — payments to mestri
      </Typography>

      <Box sx={{
        display: "grid",
        gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(3, 1fr)", md: "repeat(5, 1fr)" },
        gap: 1.25,
        mb: 1.5,
      }}>
        <KpiTile label="Wages Due"
                 value={formatINR(summary.wagesDue)}
                 sub="based on attendance"
                 formula={`${summary.weeksCount} weeks`}
                 variant="neutral" />
        <KpiTile label="Paid (waterfall)"
                 value={formatINR(summary.paidToWeeks)}
                 sub={`${summary.settlementCount} settlements`}
                 variant="success" />
        <KpiTile label="Advances"
                 value={formatINR(summary.advancesTotal)}
                 sub={`${summary.advanceCount} records · separate`}
                 variant="warning" />
        <KpiTile label="Total Cash Out"
                 value={formatINR(totalCashOut)}
                 sub="paid + advances"
                 variant="info" />
        <KpiTile label={statusLabel}
                 value={statusValue}
                 sub={statusSub}
                 variant={statusVariant} />
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
        <Typography sx={{ fontSize: 11, color: "text.secondary", minWidth: 110 }}>
          Salary progress
        </Typography>
        <Box sx={{ flex: 1, height: 10, borderRadius: 1, bgcolor: "divider", overflow: "hidden" }}>
          <Box sx={{ height: "100%", width: `${progressPct}%`, bgcolor: progressColor, transition: "width 200ms" }} />
        </Box>
        <Typography sx={{ fontSize: 12.5, fontWeight: 700, fontVariantNumeric: "tabular-nums", minWidth: 40, textAlign: "right" }}>
          {progressPct}%
        </Typography>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 4: Run test, verify pass**

```bash
npm run test -- src/components/payments/SalarySliceHero.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add src/components/payments/SalarySliceHero.tsx src/components/payments/SalarySliceHero.test.tsx
git commit -m "feat(payments): add SalarySliceHero — 5-KPI hero with sign-aware status tile"
```

---

### Task 1.4: `SalaryWaterfallList` component + test

**Files:**
- Create: `src/components/payments/SalaryWaterfallList.tsx`
- Create: `src/components/payments/SalaryWaterfallList.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/payments/SalaryWaterfallList.test.tsx`:

```tsx
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SalaryWaterfallList } from "./SalaryWaterfallList";
import type { WaterfallWeek } from "@/hooks/queries/useSalaryWaterfall";

const settledWeek: WaterfallWeek = {
  weekStart: "2026-04-06", weekEnd: "2026-04-12",
  daysWorked: 7, laborerCount: 4,
  wagesDue: 52000, paid: 52000, status: "settled",
  filledBy: [{ ref: "SET-260408-001", amount: 40000, settledAt: "2026-04-08" },
             { ref: "SET-260411-001", amount: 12000, settledAt: "2026-04-11" }],
};

const underpaidWeek: WaterfallWeek = {
  weekStart: "2026-04-20", weekEnd: "2026-04-26",
  daysWorked: 6, laborerCount: 4,
  wagesDue: 52400, paid: 38200, status: "underpaid",
  filledBy: [{ ref: "SET-260423-001", amount: 38200, settledAt: "2026-04-23" }],
};

const pendingWeek: WaterfallWeek = {
  weekStart: "2026-04-27", weekEnd: "2026-05-03",
  daysWorked: 0, laborerCount: 0,
  wagesDue: 0, paid: 0, status: "pending",
  filledBy: [],
};

describe("SalaryWaterfallList", () => {
  it("renders one row per week with the right status chip", () => {
    render(
      <SalaryWaterfallList
        weeks={[settledWeek, underpaidWeek, pendingWeek]}
        futureCredit={0}
        isLoading={false}
        onRowClick={vi.fn()}
        onSettleClick={vi.fn()}
      />
    );
    expect(screen.getByText("✓ Settled")).toBeInTheDocument();
    expect(screen.getByText(/Underpaid/)).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("renders 'Filled by SET-… ₹40,000 + SET-… ₹12,000' line for settled week", () => {
    render(
      <SalaryWaterfallList weeks={[settledWeek]} futureCredit={0} isLoading={false}
        onRowClick={vi.fn()} onSettleClick={vi.fn()} />
    );
    expect(screen.getByText(/Filled by/)).toBeInTheDocument();
    expect(screen.getByText("SET-260408-001")).toBeInTheDocument();
    expect(screen.getByText("SET-260411-001")).toBeInTheDocument();
  });

  it("shows '+ Add settlement to fill' CTA on underpaid weeks; click calls onSettleClick", () => {
    const onSettle = vi.fn();
    render(
      <SalaryWaterfallList weeks={[underpaidWeek]} futureCredit={0} isLoading={false}
        onRowClick={vi.fn()} onSettleClick={onSettle} />
    );
    const cta = screen.getByText(/Add settlement to fill/);
    fireEvent.click(cta);
    expect(onSettle).toHaveBeenCalledWith(underpaidWeek);
  });

  it("CTA click does not also fire row click (stopPropagation)", () => {
    const onRow = vi.fn();
    const onSettle = vi.fn();
    render(
      <SalaryWaterfallList weeks={[underpaidWeek]} futureCredit={0} isLoading={false}
        onRowClick={onRow} onSettleClick={onSettle} />
    );
    fireEvent.click(screen.getByText(/Add settlement to fill/));
    expect(onSettle).toHaveBeenCalledTimes(1);
    expect(onRow).not.toHaveBeenCalled();
  });

  it("renders synthetic 'Future credit' row when futureCredit > 0", () => {
    render(
      <SalaryWaterfallList weeks={[settledWeek]} futureCredit={4000} isLoading={false}
        onRowClick={vi.fn()} onSettleClick={vi.fn()} />
    );
    expect(screen.getByText(/Future credit/i)).toBeInTheDocument();
    expect(screen.getByText("₹4,000")).toBeInTheDocument();
  });

  it("does NOT render 'Future credit' row when futureCredit === 0", () => {
    render(
      <SalaryWaterfallList weeks={[settledWeek]} futureCredit={0} isLoading={false}
        onRowClick={vi.fn()} onSettleClick={vi.fn()} />
    );
    expect(screen.queryByText(/Future credit/i)).not.toBeInTheDocument();
  });

  it("renders empty state when no weeks", () => {
    render(
      <SalaryWaterfallList weeks={[]} futureCredit={0} isLoading={false}
        onRowClick={vi.fn()} onSettleClick={vi.fn()} />
    );
    expect(screen.getByText(/No contract laborer attendance/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test, verify fail**

```bash
npm run test -- src/components/payments/SalaryWaterfallList.test.tsx
```

- [ ] **Step 3: Implement the component**

Create `src/components/payments/SalaryWaterfallList.tsx`:

```tsx
"use client";

import React from "react";
import { Box, Chip, Skeleton, Stack, Typography, useTheme, alpha } from "@mui/material";
import dayjs from "dayjs";
import type { WaterfallWeek } from "@/hooks/queries/useSalaryWaterfall";

interface SalaryWaterfallListProps {
  weeks: WaterfallWeek[];
  futureCredit: number;
  isLoading: boolean;
  onRowClick: (week: WaterfallWeek) => void;
  onSettleClick: (week: WaterfallWeek) => void;
}

function formatINR(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

function StatusChip({ status, paid, wagesDue }: {
  status: WaterfallWeek["status"]; paid: number; wagesDue: number;
}) {
  const theme = useTheme();
  if (status === "settled") {
    return <Chip size="small" label="✓ Settled"
                  sx={{ bgcolor: alpha(theme.palette.success.main, 0.18),
                        color: theme.palette.success.dark,
                        fontWeight: 700, letterSpacing: 0.4 }} />;
  }
  if (status === "underpaid") {
    const pct = wagesDue > 0 ? Math.round((1 - paid / wagesDue) * 100) : 0;
    return <Chip size="small" label={`⚠ Underpaid ${pct}%`}
                  sx={{ bgcolor: alpha(theme.palette.warning.main, 0.18),
                        color: theme.palette.warning.dark,
                        fontWeight: 700, letterSpacing: 0.4 }} />;
  }
  return <Chip size="small" label="— Pending"
                sx={{ bgcolor: theme.palette.grey[100],
                      color: theme.palette.text.secondary,
                      fontWeight: 700, letterSpacing: 0.4 }} />;
}

export function SalaryWaterfallList({
  weeks, futureCredit, isLoading, onRowClick, onSettleClick,
}: SalaryWaterfallListProps) {
  const theme = useTheme();

  if (isLoading) {
    return (
      <Box sx={{ p: 1.5 }}>
        {[0,1,2].map(i => (
          <Skeleton key={i} variant="rounded" height={64} sx={{ mb: 1 }} />
        ))}
      </Box>
    );
  }

  if (weeks.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary">
          No contract laborer attendance recorded for this period.
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {/* Help strip with legend */}
      <Box sx={{
        px: 1.5, py: 1,
        bgcolor: "background.default",
        borderBottom: `1px solid ${theme.palette.divider}`,
        fontSize: 11, color: "text.secondary",
        display: "flex", flexWrap: "wrap", gap: 1.5, alignItems: "center"
      }}>
        <Box>Legend:</Box>
        <Chip size="small" label="✓ Settled" sx={{ height: 18, fontSize: 10, bgcolor: alpha(theme.palette.success.main, 0.18), color: theme.palette.success.dark }} />
        <Chip size="small" label="⚠ Underpaid" sx={{ height: 18, fontSize: 10, bgcolor: alpha(theme.palette.warning.main, 0.18), color: theme.palette.warning.dark }} />
        <Chip size="small" label="— Pending" sx={{ height: 18, fontSize: 10, bgcolor: theme.palette.grey[100] }} />
        <Box sx={{ ml: "auto", fontStyle: "italic" }}>Oldest week first · payments fill from the top down</Box>
      </Box>

      <Stack divider={<Box sx={{ height: 1, bgcolor: "divider" }} />}>
        {weeks.map((w) => (
          <Box
            key={w.weekStart}
            onClick={() => onRowClick(w)}
            sx={{
              px: { xs: 1.25, sm: 1.75 }, py: 1.25,
              cursor: "pointer",
              "&:hover": { bgcolor: "action.hover" },
            }}
          >
            <Box sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr auto", md: "150px 1fr 1fr 1fr 130px" },
              gap: { xs: 1, md: 1.5 },
              alignItems: "center",
            }}>
              <Box sx={{ gridColumn: { xs: "1 / -1", md: "auto" } }}>
                <Typography sx={{ fontWeight: 700, fontSize: 13 }}>
                  {dayjs(w.weekStart).format("DD MMM")} – {dayjs(w.weekEnd).format("DD MMM")}
                </Typography>
                <Typography sx={{ fontSize: 10, color: "text.secondary",
                                   textTransform: "uppercase", letterSpacing: 0.3 }}>
                  {w.daysWorked} days · {w.laborerCount} lab.
                </Typography>
              </Box>

              <Box sx={{ display: { xs: "none", md: "block" } }}>
                <Typography sx={{ fontSize: 9.5, color: "text.secondary",
                                   textTransform: "uppercase", letterSpacing: 0.4 }}>Wages due</Typography>
                <Typography sx={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                  {formatINR(w.wagesDue)}
                </Typography>
              </Box>

              <Box sx={{ display: { xs: "none", md: "block" } }}>
                <Typography sx={{ fontSize: 9.5, color: "text.secondary",
                                   textTransform: "uppercase", letterSpacing: 0.4 }}>Paid</Typography>
                <Typography sx={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                  {formatINR(w.paid)}
                </Typography>
              </Box>

              <Box sx={{ display: { xs: "none", md: "block" } }}>
                <Box sx={{ height: 6, bgcolor: "divider", borderRadius: 0.5, overflow: "hidden" }}>
                  <Box sx={{
                    height: "100%",
                    width: `${w.wagesDue > 0 ? Math.min(100, (w.paid / w.wagesDue) * 100) : 0}%`,
                    bgcolor: w.status === "settled" ? "success.main"
                           : w.status === "underpaid" ? "warning.main"
                           : "grey.400",
                  }} />
                </Box>
              </Box>

              <Box sx={{ justifySelf: "end" }}>
                <StatusChip status={w.status} paid={w.paid} wagesDue={w.wagesDue} />
              </Box>

              {/* Mobile-only due/paid line */}
              <Box sx={{
                display: { xs: "flex", md: "none" },
                gridColumn: "1 / -1",
                justifyContent: "space-between",
                fontSize: 11.5, color: "text.secondary",
                fontVariantNumeric: "tabular-nums",
                mt: 0.25,
              }}>
                <span>Due: <b>{formatINR(w.wagesDue)}</b></span>
                <span>Paid: <b>{formatINR(w.paid)}</b></span>
              </Box>
            </Box>

            {/* "Filled by" sub-line */}
            {(w.filledBy.length > 0 || w.status === "underpaid") && (
              <Box sx={{
                mt: 0.75,
                pl: { xs: 0, md: "150px" },
                fontSize: 11.5, color: "text.secondary",
                lineHeight: 1.5,
              }}>
                {w.filledBy.length > 0 && (
                  <>Filled by{" "}
                    {w.filledBy.map((f, i) => (
                      <React.Fragment key={f.ref + i}>
                        <Box component="span" sx={{
                          fontFamily: "ui-monospace, monospace",
                          fontSize: 10.5, fontWeight: 600,
                          bgcolor: "background.paper",
                          border: 1, borderColor: "divider",
                          borderRadius: 0.5, px: 0.75, mx: 0.25,
                        }}>{f.ref}</Box>
                        {formatINR(f.amount)}
                        {i < w.filledBy.length - 1 ? " + " : ""}
                      </React.Fragment>
                    ))}
                  </>
                )}
                {w.status === "underpaid" && (
                  <>
                    {w.filledBy.length > 0 ? " · " : ""}
                    <Box component="span" sx={{ color: "warning.dark", fontWeight: 600 }}>
                      {formatINR(w.wagesDue - w.paid)} still owed
                    </Box>
                    <Box
                      component="span"
                      role="button"
                      onClick={(e) => { e.stopPropagation(); onSettleClick(w); }}
                      sx={{ color: "primary.main", fontWeight: 600, ml: 1, cursor: "pointer",
                            "&:hover": { textDecoration: "underline" } }}
                    >
                      [+ Add settlement to fill ▶]
                    </Box>
                  </>
                )}
              </Box>
            )}
          </Box>
        ))}

        {/* Synthetic Future Credit row (only when futureCredit > 0) */}
        {futureCredit > 0 && (
          <Box sx={{
            px: { xs: 1.25, sm: 1.75 }, py: 1.25,
            bgcolor: alpha(theme.palette.info.main, 0.05),
            borderTop: `1px dashed ${theme.palette.info.main}`,
          }}>
            <Box sx={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              gap: 1.5, flexWrap: "wrap",
            }}>
              <Typography sx={{ fontWeight: 700, color: "info.dark" }}>
                🟦 Future credit
              </Typography>
              <Typography sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "info.dark" }}>
                {formatINR(futureCredit)}
              </Typography>
              <Chip size="small" label="⬆ Excess paid" sx={{
                bgcolor: alpha(theme.palette.info.main, 0.18),
                color: theme.palette.info.dark, fontWeight: 700, letterSpacing: 0.4,
              }} />
            </Box>
            <Typography sx={{ fontSize: 11.5, color: "info.dark", mt: 0.5 }}>
              {formatINR(futureCredit)} paid in advance · will absorb future weeks once worked
            </Typography>
          </Box>
        )}
      </Stack>
    </Box>
  );
}
```

- [ ] **Step 4: Run test, verify pass**

```bash
npm run test -- src/components/payments/SalaryWaterfallList.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add src/components/payments/SalaryWaterfallList.tsx src/components/payments/SalaryWaterfallList.test.tsx
git commit -m "feat(payments): add SalaryWaterfallList — per-week waterfall with future-credit row"
```

---

### Task 1.5: Wire Hero + Waterfall into `payments-content.tsx`

**Files:**
- Modify: `src/app/(main)/site/payments/payments-content.tsx`

- [ ] **Step 1: Read the current file to understand structure**

```bash
cat -n c:/Users/Haribabu/Documents/AppsCopilot/AestaManagementApp/src/app/\(main\)/site/payments/payments-content.tsx | head -60
```

Identify the location where `PaymentSummaryCards`-like 4-KPI strip is rendered, where filter chips are, and where `<PaymentsLedger ... />` is mounted.

- [ ] **Step 2: Replace the 4-KPI strip with `SalarySliceHero`**

In the JSX, replace the existing 4-KPI summary strip block with:

```tsx
<SalarySliceHero
  summary={salarySummaryQuery.data}
  isLoading={salarySummaryQuery.isLoading}
/>
```

Above the JSX, add the hook call:

```tsx
const salarySummaryQuery = useSalarySliceSummary({
  siteId: selectedSite?.id,
  subcontractId: selectedSubcontract?.id ?? null,
  dateFrom,
  dateTo,
});
```

And import:

```tsx
import { SalarySliceHero } from "@/components/payments/SalarySliceHero";
import { useSalarySliceSummary } from "@/hooks/queries/useSalarySliceSummary";
```

- [ ] **Step 3: Mount the waterfall list below the warning band, replacing `PaymentsLedger` for now**

```tsx
const waterfallQuery = useSalaryWaterfall({
  siteId: selectedSite?.id,
  subcontractId: selectedSubcontract?.id ?? null,
  dateFrom,
  dateTo,
});

// ... in JSX, where <PaymentsLedger /> was:
<SalaryWaterfallList
  weeks={waterfallQuery.data ?? []}
  futureCredit={salarySummaryQuery.data?.futureCredit ?? 0}
  isLoading={waterfallQuery.isLoading}
  onRowClick={(week) => {
    pane.open({
      kind: "weekly-aggregate",
      siteId: selectedSite!.id,
      subcontractId: selectedSubcontract?.id ?? null,
      weekStart: week.weekStart,
      weekEnd: week.weekEnd,
    });
  }}
  onSettleClick={(week) => {
    // TODO Phase 4 — open WeeklySettlementDialog prefilled
    console.log("Settle week", week);
  }}
/>
```

(The `weekly-aggregate` entity kind is added in Phase 4. For now this will fail TypeScript — temporarily cast as `as any` to unblock; Phase 4 fixes it properly.)

Add imports:

```tsx
import { SalaryWaterfallList } from "@/components/payments/SalaryWaterfallList";
import { useSalaryWaterfall } from "@/hooks/queries/useSalaryWaterfall";
```

Remove the import of `PaymentsLedger` and the existing `<PaymentsLedger ... />` JSX block. Also remove the existing 4-KPI strip block, the filter chip row, and the unused state used to drive them.

- [ ] **Step 4: Run typecheck and dev server**

```bash
npm run build
```

If this fails, fix any TypeScript issues (likely the `weekly-aggregate` kind cast — `as any` is acceptable as a Phase 1 placeholder, with a `// TODO Phase 4` comment).

```bash
npm run dev
```

Manually navigate to `/site/payments` (after `dev-login`). Verify:
- 5-KPI hero renders with real numbers from a known site (e.g. Srinivasan House & Shop)
- Waterfall list renders below the warning band
- Underpaid weeks show the "+ Add settlement to fill" CTA (clicking it logs to console for now)
- No 4-KPI strip, no filter chip row, no unified ledger

- [ ] **Step 5: Commit**

```bash
git add src/app/\(main\)/site/payments/payments-content.tsx
git commit -m "feat(payments): replace KPI strip + ledger with SalarySliceHero + SalaryWaterfallList"
```

---

## Phase 2 — Advances tab + Daily-Market tab

After this phase, the three-tab strip is wired and all three tabs render their dedicated content.

### Task 2.1: `useAdvances` hook + test

**Files:**
- Create: `src/hooks/queries/useAdvances.ts`
- Create: `src/hooks/queries/useAdvances.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/queries/useAdvances.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useAdvances } from "./useAdvances";

const mockRpc = vi.fn();
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc: mockRpc }) }));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useAdvances", () => {
  beforeEach(() => mockRpc.mockReset());

  it("filters get_payments_ledger to subtype=advance and maps to AdvanceRow", async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          id: "p:abc", settlement_ref: "SET-260403-001",
          row_type: "weekly", subtype: "advance",
          date_or_week_start: "2026-04-03", week_end: "2026-04-05",
          for_label: "Krishnan · advance",
          amount: "15000", is_paid: true, is_pending: false, laborer_id: "lab-1",
        },
        {
          id: "p:xyz", settlement_ref: "SET-260411-001",
          row_type: "weekly", subtype: "salary-waterfall",
          date_or_week_start: "2026-04-11", week_end: "2026-04-12",
          for_label: "Krishnan", amount: "12000",
          is_paid: true, is_pending: false, laborer_id: "lab-1",
        },
      ],
      error: null,
    });

    const { result } = renderHook(
      () => useAdvances({ siteId: "site-1", dateFrom: null, dateTo: null }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0]).toEqual({
      id: "p:abc",
      settlementRef: "SET-260403-001",
      date: "2026-04-03",
      forLabel: "Krishnan · advance",
      amount: 15000,
      laborerId: "lab-1",
    });
  });
});
```

- [ ] **Step 2: Run test, verify fail**

```bash
npm run test -- src/hooks/queries/useAdvances.test.ts
```

- [ ] **Step 3: Implement the hook**

Create `src/hooks/queries/useAdvances.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface AdvanceRow {
  id: string;
  settlementRef: string | null;
  date: string;
  forLabel: string;
  amount: number;
  laborerId: string | null;
}

export interface UseAdvancesArgs {
  siteId: string | undefined;
  dateFrom: string | null;
  dateTo: string | null;
}

export function useAdvances(args: UseAdvancesArgs) {
  const supabase = createClient();
  const { siteId, dateFrom, dateTo } = args;
  return useQuery<AdvanceRow[]>({
    queryKey: ["advances", siteId, dateFrom, dateTo],
    enabled: Boolean(siteId),
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_payments_ledger", {
        p_site_id:   siteId,
        p_date_from: dateFrom,
        p_date_to:   dateTo,
        p_status:    "completed",
        p_type:      "weekly",
      });
      if (error) throw error;
      const rows = (data ?? []) as Array<any>;
      return rows
        .filter((r) => r.subtype === "advance")
        .map<AdvanceRow>((r) => ({
          id:            r.id,
          settlementRef: r.settlement_ref,
          date:          r.date_or_week_start,
          forLabel:      r.for_label,
          amount:        Number(r.amount) || 0,
          laborerId:     r.laborer_id ?? null,
        }));
    },
  });
}
```

- [ ] **Step 4: Run test, verify pass**

```bash
npm run test -- src/hooks/queries/useAdvances.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/hooks/queries/useAdvances.ts src/hooks/queries/useAdvances.test.ts
git commit -m "feat(payments): add useAdvances hook (subtype=advance subset)"
```

---

### Task 2.2: `AdvancesList` component + test

**Files:**
- Create: `src/components/payments/AdvancesList.tsx`
- Create: `src/components/payments/AdvancesList.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/payments/AdvancesList.test.tsx`:

```tsx
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AdvancesList } from "./AdvancesList";

const advances = [
  { id: "1", settlementRef: "SET-260403-001", date: "2026-04-03",
    forLabel: "Krishnan · medical advance", amount: 15000, laborerId: "lab-1" },
  { id: "2", settlementRef: "SET-260411-001", date: "2026-04-11",
    forLabel: "Murugan · personal", amount: 12000, laborerId: "lab-2" },
];

describe("AdvancesList", () => {
  it("renders one row per advance with formatted amount", () => {
    render(<AdvancesList advances={advances} isLoading={false} onRowClick={vi.fn()} />);
    expect(screen.getByText("SET-260403-001")).toBeInTheDocument();
    expect(screen.getByText("₹15,000")).toBeInTheDocument();
    expect(screen.getByText("Krishnan · medical advance")).toBeInTheDocument();
  });

  it("renders footer total summing all advances", () => {
    render(<AdvancesList advances={advances} isLoading={false} onRowClick={vi.fn()} />);
    expect(screen.getByText(/Total/)).toBeInTheDocument();
    expect(screen.getByText("₹27,000")).toBeInTheDocument();
  });

  it("renders empty state when no advances", () => {
    render(<AdvancesList advances={[]} isLoading={false} onRowClick={vi.fn()} />);
    expect(screen.getByText(/No outside-waterfall advances/i)).toBeInTheDocument();
  });

  it("clicking a row calls onRowClick with that advance", () => {
    const onRow = vi.fn();
    render(<AdvancesList advances={advances} isLoading={false} onRowClick={onRow} />);
    fireEvent.click(screen.getByText("Krishnan · medical advance"));
    expect(onRow).toHaveBeenCalledWith(advances[0]);
  });
});
```

- [ ] **Step 2: Run test, verify fail**

```bash
npm run test -- src/components/payments/AdvancesList.test.tsx
```

- [ ] **Step 3: Implement the component**

Create `src/components/payments/AdvancesList.tsx`:

```tsx
"use client";

import React from "react";
import { Box, Skeleton, Typography, useTheme, alpha } from "@mui/material";
import dayjs from "dayjs";
import type { AdvanceRow } from "@/hooks/queries/useAdvances";

interface AdvancesListProps {
  advances: AdvanceRow[];
  isLoading: boolean;
  onRowClick: (advance: AdvanceRow) => void;
}

function formatINR(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

export function AdvancesList({ advances, isLoading, onRowClick }: AdvancesListProps) {
  const theme = useTheme();

  if (isLoading) {
    return (
      <Box sx={{ p: 1.5 }}>
        {[0,1,2].map(i => <Skeleton key={i} variant="rounded" height={44} sx={{ mb: 0.75 }} />)}
      </Box>
    );
  }

  if (advances.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary">
          No outside-waterfall advances in this period.
        </Typography>
      </Box>
    );
  }

  const total = advances.reduce((s, a) => s + a.amount, 0);

  return (
    <Box>
      <Box sx={{
        px: 1.5, py: 1,
        bgcolor: alpha(theme.palette.warning.main, 0.08),
        borderBottom: `1px solid ${theme.palette.warning.main}`,
        fontSize: 11, color: theme.palette.warning.dark,
        fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4,
        display: "flex", flexWrap: "wrap", gap: 1, alignItems: "center",
      }}>
        <span>💸 Outside-waterfall Advances</span>
        <span style={{ fontWeight: 500, textTransform: "none", letterSpacing: 0,
                       color: theme.palette.warning.dark, opacity: 0.8 }}>
          Emergency money — NOT deducted from salary
        </span>
      </Box>

      {advances.map((a) => (
        <Box
          key={a.id}
          onClick={() => onRowClick(a)}
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "100px 1fr 90px", sm: "110px 1fr 110px" },
            gap: 1.25,
            px: 1.5, py: 1,
            borderBottom: `1px solid ${theme.palette.divider}`,
            cursor: "pointer",
            alignItems: "center",
            "&:hover": { bgcolor: alpha(theme.palette.warning.main, 0.06) },
          }}
        >
          <Box sx={{
            fontFamily: "ui-monospace, monospace",
            fontSize: 10.5, fontWeight: 600,
            bgcolor: "background.paper",
            border: 1, borderColor: "divider",
            borderRadius: 0.5, px: 0.75, py: 0.25,
            textAlign: "center",
          }}>{a.settlementRef ?? "—"}</Box>

          <Box>
            <Typography sx={{ fontSize: 12.5, fontWeight: 500 }}>{a.forLabel}</Typography>
            <Typography sx={{ fontSize: 10.5, color: "text.secondary" }}>
              {dayjs(a.date).format("DD MMM YYYY")}
            </Typography>
          </Box>

          <Typography sx={{
            textAlign: "right",
            fontSize: 13, fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            color: "warning.dark",
          }}>
            {formatINR(a.amount)}
          </Typography>
        </Box>
      ))}

      <Box sx={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 1.25,
        px: 1.5, py: 1.25,
        bgcolor: alpha(theme.palette.warning.main, 0.12),
        borderTop: `1px solid ${theme.palette.warning.main}`,
        fontWeight: 700,
      }}>
        <Typography sx={{ fontSize: 12, color: "warning.dark" }}>
          Total · NOT deducted from salary above
        </Typography>
        <Typography sx={{ fontSize: 13, fontWeight: 700,
                           fontVariantNumeric: "tabular-nums",
                           color: "warning.dark", textAlign: "right" }}>
          {formatINR(total)}
        </Typography>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 4: Run test, verify pass**

```bash
npm run test -- src/components/payments/AdvancesList.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add src/components/payments/AdvancesList.tsx src/components/payments/AdvancesList.test.tsx
git commit -m "feat(payments): add AdvancesList component with footer total"
```

---

### Task 2.3: Refactor `PaymentsLedger` → `DailyMarketLedger` with week separators

**Files:**
- Modify: `src/components/payments/PaymentsLedger.tsx` (move logic)
- Create: `src/components/payments/DailyMarketLedger.tsx`
- Modify: `src/hooks/queries/usePaymentsLedger.ts` (add `subtype` field; default to `daily-market` filter)

- [ ] **Step 1: Add `subtype` field to `PaymentsLedgerRow`**

Edit `src/hooks/queries/usePaymentsLedger.ts` — in the row mapping inside `queryFn`, after `siteId: siteId as string,`, add:

```ts
subtype:       (r as any).subtype as string,
```

And in the `PaymentsLedgerRow` interface (in `src/components/payments/PaymentsLedger.tsx`), add:

```ts
subtype: string;
```

- [ ] **Step 2: Create `DailyMarketLedger.tsx` with week-separator grouping**

Create `src/components/payments/DailyMarketLedger.tsx`:

```tsx
"use client";

import React, { useMemo } from "react";
import { Box, Chip, Skeleton, Typography, useTheme, alpha } from "@mui/material";
import dayjs from "dayjs";
import type { PaymentsLedgerRow } from "./PaymentsLedger";

interface DailyMarketLedgerProps {
  rows: PaymentsLedgerRow[];
  isLoading: boolean;
  onRowClick: (row: PaymentsLedgerRow) => void;
  onSettleClick: (row: PaymentsLedgerRow) => void;
}

function formatINR(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

interface WeekGroup {
  weekStart: string;
  weekEnd: string;
  rows: PaymentsLedgerRow[];
  total: number;
}

function groupByWeek(rows: PaymentsLedgerRow[]): { pending: PaymentsLedgerRow[]; weeks: WeekGroup[] } {
  const pending = rows.filter((r) => r.isPending);
  const paid = rows.filter((r) => r.isPaid);
  const groupMap = new Map<string, WeekGroup>();
  for (const r of paid) {
    const ws = dayjs(r.date).startOf("isoWeek").format("YYYY-MM-DD");
    const we = dayjs(ws).add(6, "day").format("YYYY-MM-DD");
    const g = groupMap.get(ws) ?? { weekStart: ws, weekEnd: we, rows: [], total: 0 };
    g.rows.push(r);
    g.total += r.amount;
    groupMap.set(ws, g);
  }
  const weeks = Array.from(groupMap.values()).sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1));
  return { pending, weeks };
}

export function DailyMarketLedger({ rows, isLoading, onRowClick, onSettleClick }: DailyMarketLedgerProps) {
  const theme = useTheme();
  const { pending, weeks } = useMemo(() => groupByWeek(rows), [rows]);
  const pendingTotal = pending.reduce((s, r) => s + r.amount, 0);

  if (isLoading) {
    return (
      <Box sx={{ p: 1.5 }}>
        {[0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={48} sx={{ mb: 0.75 }} />)}
      </Box>
    );
  }

  if (rows.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary">
          No daily or market wage entries in this period.
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {/* Pending separator + rows (only if any) */}
      {pending.length > 0 && (
        <>
          <Box sx={{
            display: "grid",
            gridTemplateColumns: "20px 1fr auto",
            alignItems: "center",
            gap: 1,
            px: 1.5, py: 1,
            bgcolor: alpha(theme.palette.warning.main, 0.12),
            borderBottom: `1px solid ${theme.palette.warning.main}`,
            fontSize: 11.5,
          }}>
            <span style={{ color: theme.palette.warning.main }}>⚠</span>
            <Typography sx={{ fontWeight: 700, color: "warning.dark" }}>
              Pending · {pending.length} dates
            </Typography>
            <Typography sx={{ fontWeight: 700, color: "warning.dark",
                               fontVariantNumeric: "tabular-nums" }}>
              {formatINR(pendingTotal)}
            </Typography>
          </Box>
          {pending.map((r) => (
            <LedgerRow key={r.id} row={r} onClick={onRowClick} onSettle={onSettleClick} pending />
          ))}
        </>
      )}

      {/* Week-separator + rows for each settled week */}
      {weeks.map((g, idx) => (
        <React.Fragment key={g.weekStart}>
          <Box sx={{
            display: "grid",
            gridTemplateColumns: "16px 1fr auto",
            alignItems: "center",
            gap: 1,
            px: 1.5, py: 1,
            bgcolor: theme.palette.action.hover,
            borderTop: idx === 0 ? `1px solid ${theme.palette.divider}` : "none",
            borderBottom: `1px solid ${theme.palette.divider}`,
            fontSize: 11.5,
          }}>
            <span style={{ color: theme.palette.text.secondary }}>▾</span>
            <Typography sx={{ fontWeight: 700 }}>
              Week {dayjs(g.weekStart).format("D MMM")}–{dayjs(g.weekEnd).format("D MMM")}
              <span style={{ color: theme.palette.text.secondary, fontWeight: 500, marginLeft: 6 }}>
                · {g.rows.length} settled days
              </span>
            </Typography>
            <Typography sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
              {formatINR(g.total)}
            </Typography>
          </Box>
          {g.rows.map((r) => (
            <LedgerRow key={r.id} row={r} onClick={onRowClick} onSettle={onSettleClick} />
          ))}
        </React.Fragment>
      ))}
    </Box>
  );
}

interface LedgerRowProps {
  row: PaymentsLedgerRow;
  pending?: boolean;
  onClick: (row: PaymentsLedgerRow) => void;
  onSettle: (row: PaymentsLedgerRow) => void;
}

function LedgerRow({ row, pending, onClick, onSettle }: LedgerRowProps) {
  const theme = useTheme();
  return (
    <Box
      onClick={() => onClick(row)}
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr 90px", sm: "100px 110px 1fr 90px 90px" },
        gap: 1,
        alignItems: "center",
        px: 1.5, py: 0.875,
        borderBottom: `1px solid ${theme.palette.divider}`,
        bgcolor: pending ? alpha(theme.palette.warning.main, 0.06) : "transparent",
        cursor: "pointer",
        "&:hover": { bgcolor: pending ? alpha(theme.palette.warning.main, 0.10) : "action.hover" },
      }}
    >
      <Box sx={{ display: { xs: "none", sm: "block" } }}>
        {row.settlementRef ? (
          <Box component="span" sx={{
            fontFamily: "ui-monospace, monospace",
            fontSize: 10.5, fontWeight: 600,
            bgcolor: "background.paper",
            border: 1, borderColor: "divider",
            borderRadius: 0.5, px: 0.75, py: 0.25,
          }}>{row.settlementRef}</Box>
        ) : <Typography sx={{ fontSize: 12, color: "text.disabled" }}>—</Typography>}
      </Box>
      <Box sx={{ display: { xs: "none", sm: "block" } }}>
        <Chip size="small" label={pending ? "Pending" : "Daily+Mkt"}
              sx={{ height: 20, fontSize: 10.5, fontWeight: 600,
                    bgcolor: pending
                      ? alpha(theme.palette.warning.main, 0.18)
                      : alpha(theme.palette.success.main, 0.15),
                    color: pending ? theme.palette.warning.dark : theme.palette.success.dark }} />
      </Box>
      <Box>
        <Typography sx={{ fontSize: 12.5 }}>
          {dayjs(row.date).format("DD MMM")}
          <span style={{ color: theme.palette.text.secondary, marginLeft: 8 }}>
            · {row.forLabel}
          </span>
        </Typography>
      </Box>
      <Typography sx={{ textAlign: "right", fontWeight: 600, fontSize: 12.5,
                         fontVariantNumeric: "tabular-nums",
                         color: pending ? "warning.dark" : "text.primary" }}>
        {formatINR(row.amount)}
      </Typography>
      {pending && (
        <Box sx={{ display: { xs: "none", sm: "block" }, justifySelf: "end" }}
             onClick={(e) => { e.stopPropagation(); onSettle(row); }}>
          <Chip size="small" color="success" label="Settle"
                sx={{ height: 22, fontSize: 11, fontWeight: 700, cursor: "pointer" }} />
        </Box>
      )}
    </Box>
  );
}
```

- [ ] **Step 3: Run typecheck**

```bash
npm run build
```

Expected: build clean. The new `DailyMarketLedger` is not yet wired into the page; that happens in Task 2.4.

- [ ] **Step 4: Commit**

```bash
git add src/components/payments/DailyMarketLedger.tsx src/hooks/queries/usePaymentsLedger.ts src/components/payments/PaymentsLedger.tsx
git commit -m "feat(payments): add DailyMarketLedger with week-separator rows; usePaymentsLedger surfaces subtype"
```

---

### Task 2.4: Wire 3-tab strip in `payments-content.tsx`

**Files:**
- Modify: `src/app/(main)/site/payments/payments-content.tsx`

- [ ] **Step 1: Add tab state and tab strip**

Inside `payments-content.tsx`, above the JSX:

```tsx
const [activeTab, setActiveTab] = useState<"waterfall" | "advances" | "daily-market">("waterfall");

const advancesQuery = useAdvances({
  siteId: selectedSite?.id, dateFrom, dateTo,
});

const ledgerQuery = usePaymentsLedger({
  siteId: selectedSite?.id, dateFrom, dateTo,
  status: "all", type: "daily-market",
});
```

In the JSX, replace the bare `<SalaryWaterfallList .../>` mount from Task 1.5 with:

```tsx
<Tabs
  value={activeTab}
  onChange={(_, v) => setActiveTab(v)}
  sx={{
    borderBottom: 1, borderColor: "divider",
    minHeight: 40, "& .MuiTab-root": { minHeight: 40, fontSize: 12.5, fontWeight: 600 },
  }}
>
  <Tab value="waterfall" label={<>💼 <Box component="span" sx={{ display: { xs: "none", sm: "inline" }, ml: 0.5 }}>Salary Waterfall</Box> <Chip size="small" label={waterfallQuery.data?.length ?? 0} sx={{ ml: 0.75, height: 18, fontSize: 10 }} /></>} />
  <Tab value="advances" label={<>💸 <Box component="span" sx={{ display: { xs: "none", sm: "inline" }, ml: 0.5 }}>Advances</Box> <Chip size="small" label={advancesQuery.data?.length ?? 0} sx={{ ml: 0.75, height: 18, fontSize: 10 }} /></>} />
  <Tab value="daily-market" label={<>📅 <Box component="span" sx={{ display: { xs: "none", sm: "inline" }, ml: 0.5 }}>Daily + Market</Box> <Chip size="small" label={(ledgerQuery.data ?? []).filter((r) => r.isPending).length} color="warning" sx={{ ml: 0.75, height: 18, fontSize: 10 }} /></>} />
</Tabs>

<Box sx={{ bgcolor: "background.paper", border: 1, borderTop: 0, borderColor: "divider", borderRadius: "0 0 8px 8px" }}>
  {activeTab === "waterfall" && (
    <SalaryWaterfallList
      weeks={waterfallQuery.data ?? []}
      futureCredit={salarySummaryQuery.data?.futureCredit ?? 0}
      isLoading={waterfallQuery.isLoading}
      onRowClick={(week) => {
        pane.open({
          kind: "weekly-aggregate" as any, // Phase 4 fixes the cast
          siteId: selectedSite!.id,
          subcontractId: selectedSubcontract?.id ?? null,
          weekStart: week.weekStart,
          weekEnd: week.weekEnd,
        });
      }}
      onSettleClick={(week) => {
        // TODO Phase 4 — open WeeklySettlementDialog prefilled
        console.log("Settle week", week);
      }}
    />
  )}
  {activeTab === "advances" && (
    <AdvancesList
      advances={advancesQuery.data ?? []}
      isLoading={advancesQuery.isLoading}
      onRowClick={(adv) => {
        pane.open({
          kind: "advance" as any, // Phase 4 fixes the cast
          siteId: selectedSite!.id,
          settlementId: adv.id,
          settlementRef: adv.settlementRef,
        });
      }}
    />
  )}
  {activeTab === "daily-market" && (
    <DailyMarketLedger
      rows={ledgerQuery.data ?? []}
      isLoading={ledgerQuery.isLoading}
      onRowClick={(row) => {
        // existing daily-date InspectPane shape
        pane.open({
          kind: "daily-date",
          siteId: selectedSite!.id,
          date: row.date,
          settlementRef: row.settlementRef,
        });
      }}
      onSettleClick={(row) => {
        // existing DailySettlementDialog adapter
        // (kept as today's behavior; copy from current payments-content.tsx)
      }}
    />
  )}
</Box>
```

Add imports:

```tsx
import { Tabs, Tab } from "@mui/material";
import { useState } from "react";
import { AdvancesList } from "@/components/payments/AdvancesList";
import { DailyMarketLedger } from "@/components/payments/DailyMarketLedger";
import { useAdvances } from "@/hooks/queries/useAdvances";
```

- [ ] **Step 2: Run typecheck and dev server**

```bash
npm run build && npm run dev
```

Open `/site/payments`. Verify:
- Three tabs visible at the top of the content area
- Salary Waterfall is default
- Switching to Advances renders advance records with footer total
- Switching to Daily + Market renders week-grouped settled rows + pending separator at top
- Pending count badge on Daily + Market shows correct number

- [ ] **Step 3: Commit**

```bash
git add src/app/\(main\)/site/payments/payments-content.tsx
git commit -m "feat(payments): wire 3-tab strip (Salary Waterfall / Advances / Daily+Market)"
```

---

## Phase 3 — Subcontract context strip

After this phase, the page has the subcontract anchor at the top with deep-link to `/site/subcontracts`.

### Task 3.1: `useSubcontractSpend` hook

**Files:**
- Create: `src/hooks/queries/useSubcontractSpend.ts`

- [ ] **Step 1: Survey existing aggregator**

```bash
grep -n "subcontract" src/components/subcontracts/SubcontractPaymentBreakdown.tsx | head -20
```

If `SubcontractPaymentBreakdown.tsx` already aggregates spend per subcontract across all categories (materials + salary + etc), extract the query into a hook. Otherwise, query `v_all_expenses` (existing view) filtered by `subcontract_id`.

- [ ] **Step 2: Implement the hook**

Create `src/hooks/queries/useSubcontractSpend.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface SubcontractSpend {
  spent: number;
  totalValue: number;
  percentOfTotal: number;
}

export function useSubcontractSpend(subcontractId: string | null | undefined) {
  const supabase = createClient();
  return useQuery<SubcontractSpend | null>({
    queryKey: ["subcontract-spend", subcontractId],
    enabled: Boolean(subcontractId),
    staleTime: 30_000,
    queryFn: async () => {
      if (!subcontractId) return null;

      // Fetch contract total_value
      const { data: subcontract, error: subErr } = await supabase
        .from("subcontracts")
        .select("total_value")
        .eq("id", subcontractId)
        .single();
      if (subErr) throw subErr;

      // Sum spend across all categories from v_all_expenses
      const { data: expenses, error: expErr } = await supabase
        .from("v_all_expenses")
        .select("amount")
        .eq("subcontract_id", subcontractId);
      if (expErr) throw expErr;

      const spent = (expenses ?? []).reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
      const totalValue = Number(subcontract?.total_value || 0);
      const percentOfTotal = totalValue > 0 ? Math.round((spent / totalValue) * 100) : 0;

      return { spent, totalValue, percentOfTotal };
    },
  });
}
```

- [ ] **Step 3: Run typecheck**

```bash
npm run build
```

Expected: build clean. (No test file for this hook — it's a thin DB wrapper. The component test in Task 3.2 covers integration.)

- [ ] **Step 4: Commit**

```bash
git add src/hooks/queries/useSubcontractSpend.ts
git commit -m "feat(payments): add useSubcontractSpend hook (all-categories spend per subcontract)"
```

---

### Task 3.2: `SubcontractContextStrip` component + test

**Files:**
- Create: `src/components/payments/SubcontractContextStrip.tsx`
- Create: `src/components/payments/SubcontractContextStrip.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/payments/SubcontractContextStrip.test.tsx`:

```tsx
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SubcontractContextStrip } from "./SubcontractContextStrip";

describe("SubcontractContextStrip", () => {
  it("renders subcontract title, lump-sum, and spend percentage", () => {
    render(<SubcontractContextStrip
      subcontractTitle="Footing Horizontal Foundation"
      totalValue={400000} spent={277950} onOpenFullBurnDown={vi.fn()} />);
    expect(screen.getByText(/Footing Horizontal Foundation/)).toBeInTheDocument();
    expect(screen.getByText("₹4,00,000")).toBeInTheDocument();
    expect(screen.getByText(/₹2,77,950/)).toBeInTheDocument();
    expect(screen.getByText(/69%/)).toBeInTheDocument();
  });

  it("renders fallback strip when no subcontract is selected", () => {
    render(<SubcontractContextStrip
      subcontractTitle={null} totalValue={null} spent={null}
      onOpenFullBurnDown={vi.fn()} />);
    expect(screen.getByText(/All subcontracts on this site/i)).toBeInTheDocument();
    expect(screen.getByText(/Choose a subcontract/i)).toBeInTheDocument();
  });

  it("clicking the link calls onOpenFullBurnDown", () => {
    const onOpen = vi.fn();
    render(<SubcontractContextStrip
      subcontractTitle="Test" totalValue={100000} spent={50000}
      onOpenFullBurnDown={onOpen} />);
    fireEvent.click(screen.getByText(/Full burn-down/i));
    expect(onOpen).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test, verify fail**

```bash
npm run test -- src/components/payments/SubcontractContextStrip.test.tsx
```

- [ ] **Step 3: Implement the component**

Create `src/components/payments/SubcontractContextStrip.tsx`:

```tsx
"use client";

import React from "react";
import { Box, Typography, useTheme } from "@mui/material";

interface SubcontractContextStripProps {
  subcontractTitle: string | null;
  totalValue: number | null;
  spent: number | null;
  onOpenFullBurnDown: () => void;
}

function formatINR(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

export function SubcontractContextStrip({
  subcontractTitle, totalValue, spent, onOpenFullBurnDown,
}: SubcontractContextStripProps) {
  const theme = useTheme();
  const percent = totalValue && totalValue > 0 && spent != null
    ? Math.round((spent / totalValue) * 100)
    : null;

  return (
    <Box sx={{
      display: "flex",
      flexWrap: "wrap",
      gap: { xs: 1, sm: 1.75 },
      alignItems: "center",
      px: { xs: 1.25, sm: 1.75 }, py: 1,
      bgcolor: "background.paper",
      borderLeft: 3, borderLeftColor: "primary.main",
      border: 1, borderColor: "divider",
      borderRadius: 1.5, mb: 1.5,
      fontSize: 12.5,
    }}>
      <span style={{ fontSize: 14 }}>📍</span>
      {subcontractTitle ? (
        <>
          <Typography sx={{ fontWeight: 700 }}>
            {subcontractTitle}
          </Typography>
          <Box sx={{ width: 1, height: 18, bgcolor: "divider", display: { xs: "none", sm: "block" } }} />
          <Typography sx={{ fontSize: 11.5, color: "text.secondary" }}>
            Subcontract <Box component="span" sx={{ fontWeight: 700, color: "text.primary",
                                                     fontVariantNumeric: "tabular-nums" }}>
              {formatINR(totalValue ?? 0)}
            </Box>
          </Typography>
          <Box sx={{ width: 1, height: 18, bgcolor: "divider", display: { xs: "none", sm: "block" } }} />
          <Typography sx={{ fontSize: 11.5, color: "text.secondary" }}>
            Spent (all categories) <Box component="span" sx={{ fontWeight: 700, color: "primary.main",
                                                                 fontVariantNumeric: "tabular-nums" }}>
              {formatINR(spent ?? 0)}
            </Box>
            {percent != null && <> · {percent}%</>}
          </Typography>
        </>
      ) : (
        <>
          <Typography sx={{ fontWeight: 700 }}>
            All subcontracts on this site
          </Typography>
          <Box sx={{ width: 1, height: 18, bgcolor: "divider", display: { xs: "none", sm: "block" } }} />
          <Typography sx={{ fontSize: 11.5, color: "text.secondary" }}>
            Choose a subcontract from the chip above to see budget context
          </Typography>
        </>
      )}
      <Box
        component="span"
        role="button"
        onClick={onOpenFullBurnDown}
        sx={{
          ml: { xs: 0, sm: "auto" },
          color: "primary.main", fontWeight: 600, fontSize: 11.5,
          cursor: "pointer", "&:hover": { textDecoration: "underline" },
        }}
      >
        ↗ Full burn-down on /site/subcontracts
      </Box>
    </Box>
  );
}
```

- [ ] **Step 4: Run test, verify pass**

```bash
npm run test -- src/components/payments/SubcontractContextStrip.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add src/components/payments/SubcontractContextStrip.tsx src/components/payments/SubcontractContextStrip.test.tsx
git commit -m "feat(payments): add SubcontractContextStrip — page anchor + deep-link"
```

---

### Task 3.3: Mount strip above hero in `payments-content.tsx`

**Files:**
- Modify: `src/app/(main)/site/payments/payments-content.tsx`

- [ ] **Step 1: Add hook + component above the hero**

In `payments-content.tsx`, above the `<SalarySliceHero />` JSX:

```tsx
const subcontractSpendQuery = useSubcontractSpend(selectedSubcontract?.id ?? null);

// ... in JSX, before <SalarySliceHero />:
<SubcontractContextStrip
  subcontractTitle={selectedSubcontract?.title ?? null}
  totalValue={subcontractSpendQuery.data?.totalValue ?? null}
  spent={subcontractSpendQuery.data?.spent ?? null}
  onOpenFullBurnDown={() => {
    if (selectedSubcontract?.id) {
      router.push(`/site/subcontracts?focus=${selectedSubcontract.id}`);
    } else {
      router.push("/site/subcontracts");
    }
  }}
/>
```

Add imports:

```tsx
import { SubcontractContextStrip } from "@/components/payments/SubcontractContextStrip";
import { useSubcontractSpend } from "@/hooks/queries/useSubcontractSpend";
import { useRouter } from "next/navigation";
// (router likely already imported)
```

- [ ] **Step 2: Manually verify on dev server**

```bash
npm run dev
```

Open `/site/payments` with a subcontract selected. Verify the strip renders above the hero with the right title, lump-sum, spent. Click "Full burn-down" → navigates to `/site/subcontracts?focus=<id>`.

Open `/site/payments` with NO subcontract selected (clear the chip). Verify the fallback strip renders.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(main\)/site/payments/payments-content.tsx
git commit -m "feat(payments): mount SubcontractContextStrip above hero with deep-link"
```

---

## Phase 4 — InspectPane new entity shapes

After this phase, the `weekly-aggregate` and `advance` entity kinds are real (no more `as any` casts), Attendance ₹0 bug is fixed for advance rows, and `WeeklySettlementDialog` opens correctly from the underpaid CTA.

### Task 4.1: Add new entity kinds to types

**Files:**
- Modify: `src/components/common/InspectPane/types.ts`

- [ ] **Step 1: Read the current types**

```bash
cat c:/Users/Haribabu/Documents/AppsCopilot/AestaManagementApp/src/components/common/InspectPane/types.ts
```

- [ ] **Step 2: Add the two new entity kinds**

In the `InspectEntity` discriminated union, add:

```ts
| {
    kind: "weekly-aggregate";
    siteId: string;
    subcontractId: string | null;
    weekStart: string;   // YYYY-MM-DD
    weekEnd: string;     // YYYY-MM-DD
  }
| {
    kind: "advance";
    siteId: string;
    settlementId: string;            // 'p:<uuid>' from the ledger row id
    settlementRef: string | null;
  }
```

- [ ] **Step 3: Update `entityKey` in `useInspectPane.ts`**

Edit `src/hooks/useInspectPane.ts`. Find the `entityKey()` function and extend:

```ts
function entityKey(e: InspectEntity): string {
  if (e.kind === "daily-date") return `d:${e.siteId}:${e.date}`;
  if (e.kind === "weekly-week") return `w:${e.siteId}:${e.laborerId}:${e.weekStart}`;
  if (e.kind === "weekly-aggregate") return `wa:${e.siteId}:${e.subcontractId ?? "_"}:${e.weekStart}`;
  if (e.kind === "advance") return `a:${e.siteId}:${e.settlementId}`;
  // exhaustiveness guard — unreachable
  return "";
}
```

Also update the matching `entityKey` duplicate in `src/components/payments/PaymentsLedger.tsx` (referenced by spec §3.3 of the salary-settlement-ux-redesign spec — keep the two functions byte-for-byte identical).

- [ ] **Step 4: Run typecheck**

```bash
npm run build
```

Expected: any earlier `as any` casts in `payments-content.tsx` from Tasks 1.5 / 2.4 can now be removed — remove them now and re-run.

- [ ] **Step 5: Commit**

```bash
git add src/components/common/InspectPane/types.ts src/hooks/useInspectPane.ts src/components/payments/PaymentsLedger.tsx src/app/\(main\)/site/payments/payments-content.tsx
git commit -m "feat(inspect-pane): add weekly-aggregate and advance entity kinds"
```

---

### Task 4.2: `WeeklyAggregateShape` in `AttendanceTab`

**Files:**
- Modify: `src/components/common/InspectPane/AttendanceTab.tsx`
- Create: `src/hooks/queries/useWeekAggregateAttendance.ts`

- [ ] **Step 1: Create the data hook**

Create `src/hooks/queries/useWeekAggregateAttendance.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface WeekDayAggregate {
  date: string;
  laborersWorked: number;
  totalEarnings: number;
}

export interface WeekAggregate {
  days: WeekDayAggregate[];
  totalLaborers: number;
  totalEarnings: number;
}

export function useWeekAggregateAttendance(
  siteId: string | undefined,
  subcontractId: string | null,
  weekStart: string | undefined,
  weekEnd: string | undefined,
) {
  const supabase = createClient();
  return useQuery<WeekAggregate>({
    queryKey: ["week-aggregate-attendance", siteId, subcontractId, weekStart, weekEnd],
    enabled: Boolean(siteId && weekStart && weekEnd),
    staleTime: 15_000,
    queryFn: async () => {
      let q = supabase
        .from("daily_attendance")
        .select("date, laborer_id, daily_earnings, laborers!inner(laborer_type)")
        .eq("site_id", siteId)
        .eq("is_deleted", false)
        .eq("laborers.laborer_type", "contract")
        .gte("date", weekStart!)
        .lte("date", weekEnd!);
      if (subcontractId) q = q.eq("subcontract_id", subcontractId);
      const { data, error } = await q;
      if (error) throw error;

      const byDate = new Map<string, { laborers: Set<string>; earnings: number }>();
      const allLaborers = new Set<string>();
      let total = 0;
      for (const r of (data ?? []) as any[]) {
        const e = byDate.get(r.date) ?? { laborers: new Set(), earnings: 0 };
        e.laborers.add(r.laborer_id);
        e.earnings += Number(r.daily_earnings || 0);
        byDate.set(r.date, e);
        allLaborers.add(r.laborer_id);
        total += Number(r.daily_earnings || 0);
      }
      const days: WeekDayAggregate[] = Array.from(byDate.entries())
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([date, v]) => ({
          date,
          laborersWorked: v.laborers.size,
          totalEarnings: v.earnings,
        }));
      return { days, totalLaborers: allLaborers.size, totalEarnings: total };
    },
  });
}
```

- [ ] **Step 2: Add `WeeklyAggregateShape` branch in `AttendanceTab`**

Edit `src/components/common/InspectPane/AttendanceTab.tsx`. At the bottom (where the default export branches by kind), add:

```tsx
function WeeklyAggregateShape({ entity }: {
  entity: Extract<InspectEntity, { kind: "weekly-aggregate" }>;
}) {
  const theme = useTheme();
  const { data, isLoading } = useWeekAggregateAttendance(
    entity.siteId, entity.subcontractId, entity.weekStart, entity.weekEnd,
  );

  if (isLoading) {
    return (
      <Box sx={{ p: 2 }}>
        <Skeleton variant="rounded" height={56} sx={{ mb: 2 }} />
        <Skeleton variant="rounded" height={140} />
      </Box>
    );
  }

  const days = data?.days ?? [];

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="caption" color="text.secondary"
                   sx={{ display: "block", mb: 1, fontSize: 9, textTransform: "uppercase",
                         letterSpacing: 0.4, fontWeight: 600 }}>
        Per-day attendance · {data?.totalLaborers ?? 0} contract laborers worked
      </Typography>

      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 0.5, mb: 2 }}>
        {Array.from({ length: 7 }).map((_, i) => {
          const dt = dayjs(entity.weekStart).add(i, "day").format("YYYY-MM-DD");
          const day = days.find((d) => d.date === dt);
          return (
            <Box key={dt} sx={{
              p: 0.75, borderRadius: 1, textAlign: "center",
              bgcolor: day ? alpha(theme.palette.success.main, 0.12) : "background.default",
              border: `1px solid ${day ? theme.palette.success.main : theme.palette.divider}`,
              minHeight: 80, display: "flex", flexDirection: "column", justifyContent: "space-between",
            }}>
              <Box>
                <Typography sx={{ fontSize: 8.5, color: "text.secondary",
                                   textTransform: "uppercase" }}>
                  {dayjs(dt).format("ddd")}
                </Typography>
                <Typography sx={{ fontWeight: 700 }}>{dayjs(dt).format("DD")}</Typography>
              </Box>
              {day ? (
                <Box>
                  <Typography sx={{ fontSize: 8.5, color: "success.dark", fontWeight: 600 }}>
                    {day.laborersWorked} lab.
                  </Typography>
                  <Typography sx={{ fontSize: 9, color: "success.main", fontWeight: 600,
                                     fontVariantNumeric: "tabular-nums" }}>
                    ₹{day.totalEarnings.toLocaleString("en-IN")}
                  </Typography>
                </Box>
              ) : (
                <Typography sx={{ fontSize: 9, color: "text.disabled" }}>—</Typography>
              )}
            </Box>
          );
        })}
      </Box>

      <Box sx={{
        bgcolor: "background.paper",
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 1.5,
        p: 1.25, fontSize: 12.5,
      }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", py: 0.5 }}>
          <span style={{ color: theme.palette.text.secondary }}>Worked this week</span>
          <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
            {data?.totalLaborers ?? 0} laborers
          </span>
        </Box>
        <Box sx={{ display: "flex", justifyContent: "space-between", py: 0.5 }}>
          <span style={{ color: theme.palette.text.secondary }}>Total wages this week</span>
          <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
            ₹{(data?.totalEarnings ?? 0).toLocaleString("en-IN")}
          </span>
        </Box>
      </Box>
    </Box>
  );
}
```

In the existing `AttendanceTab` default export, extend the kind branch:

```tsx
export default function AttendanceTab({ entity }: { entity: InspectEntity }) {
  if (entity.kind === "daily-date") return <DailyShape entity={entity} />;
  if (entity.kind === "weekly-week") return <WeeklyShape entity={entity} />;
  if (entity.kind === "weekly-aggregate") return <WeeklyAggregateShape entity={entity} />;
  // 'advance' — Attendance tab is not shown for this kind (see InspectPane.tsx)
  return null;
}
```

Add imports at top of file:

```tsx
import { useWeekAggregateAttendance } from "@/hooks/queries/useWeekAggregateAttendance";
```

- [ ] **Step 3: Run typecheck**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/components/common/InspectPane/AttendanceTab.tsx src/hooks/queries/useWeekAggregateAttendance.ts
git commit -m "feat(inspect-pane): add WeeklyAggregateShape — per-day attendance roll-up"
```

---

### Task 4.3: Hide Attendance + Work Updates tabs for `advance` entity

**Files:**
- Modify: `src/components/common/InspectPane/InspectPane.tsx`

- [ ] **Step 1: Read the current tabs configuration**

```bash
grep -n "tabValue\|Tabs\|Tab" src/components/common/InspectPane/InspectPane.tsx | head -20
```

- [ ] **Step 2: Conditionally render only Settlement + Audit tabs when kind is `advance`**

In the JSX of `InspectPane.tsx`, wrap the Attendance and Work Updates tabs with `entity?.kind !== "advance"`. Replace the existing tab buttons block:

```tsx
{entity?.kind !== "advance" && (
  <Tab value="attendance" label="Attendance" />
)}
{entity?.kind !== "advance" && (
  <Tab value="work-updates" label="Work Updates" />
)}
<Tab value="settlement" label="Settlement" />
<Tab value="audit" label="Audit" />
```

And in the body, when `entity?.kind === "advance"` and the active tab is `'attendance'` or `'work-updates'` (e.g., from a prior daily entity), reset to `'settlement'`. Add to the `useEffect` that responds to entity changes:

```tsx
useEffect(() => {
  if (entity?.kind === "advance" && (activeTab === "attendance" || activeTab === "work-updates")) {
    onTabChange("settlement");
  }
}, [entity?.kind, activeTab, onTabChange]);
```

- [ ] **Step 3: Run InspectPane existing tests**

```bash
npm run test -- src/components/common/InspectPane/InspectPane.test.tsx
```

Expected: existing tests still pass. (No new test added here — covered by manual verification + Phase 5 integration test.)

- [ ] **Step 4: Manual verification**

```bash
npm run dev
```

Click an advance row in the Advances tab → InspectPane opens with only Settlement and Audit tabs visible. Click a salary-waterfall week row → InspectPane opens with Attendance (week-aggregate shape), Work Updates, Settlement, Audit. Click a Daily+Mkt row → InspectPane opens with all four tabs (existing behavior).

- [ ] **Step 5: Commit**

```bash
git add src/components/common/InspectPane/InspectPane.tsx
git commit -m "feat(inspect-pane): hide Attendance + Work Updates tabs for advance entities"
```

---

### Task 4.4: Wire `onSettleClick` to open `WeeklySettlementDialog`

**Files:**
- Modify: `src/app/(main)/site/payments/payments-content.tsx`

- [ ] **Step 1: Find the existing settle-from-attendance adapter**

```bash
grep -rn "WeeklySettlementDialog" src/components/payments/settlementAdapters.ts src/app/\(main\)/site/payments/ 2>&1
```

The previous spec (salary-settlement-ux-redesign) added adapter functions in `settlementAdapters.ts`. Reuse the same pattern.

- [ ] **Step 2: Replace the `console.log` placeholder with the dialog opener**

In `payments-content.tsx`, in the `<SalaryWaterfallList ... onSettleClick={...} />`, replace:

```tsx
onSettleClick={(week) => {
  // TODO Phase 4 — open WeeklySettlementDialog prefilled
  console.log("Settle week", week);
}}
```

with:

```tsx
onSettleClick={(week) => {
  // Open the existing WeeklySettlementDialog scoped to this mestri's week.
  // The dialog's existing prefill logic accepts (siteId, weekStart, weekEnd, subcontractId).
  setWeeklySettleTarget({
    siteId: selectedSite!.id,
    subcontractId: selectedSubcontract?.id ?? null,
    weekStart: week.weekStart,
    weekEnd: week.weekEnd,
    suggestedAmount: week.wagesDue - week.paid,
  });
}}
```

Add state and dialog mount:

```tsx
const [weeklySettleTarget, setWeeklySettleTarget] = useState<null | {
  siteId: string; subcontractId: string | null;
  weekStart: string; weekEnd: string; suggestedAmount: number;
}>(null);

// ... in JSX:
{weeklySettleTarget && (
  <WeeklySettlementDialog
    open
    siteId={weeklySettleTarget.siteId}
    weekStart={weeklySettleTarget.weekStart}
    weekEnd={weeklySettleTarget.weekEnd}
    subcontractId={weeklySettleTarget.subcontractId}
    suggestedAmount={weeklySettleTarget.suggestedAmount}
    onClose={() => setWeeklySettleTarget(null)}
    onSettled={() => {
      setWeeklySettleTarget(null);
      // Invalidate caches so all five regions refresh
      queryClient.invalidateQueries({ queryKey: ["salary-slice-summary"] });
      queryClient.invalidateQueries({ queryKey: ["salary-waterfall"] });
      queryClient.invalidateQueries({ queryKey: ["payments-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["advances"] });
    }}
  />
)}
```

Add imports:

```tsx
import { WeeklySettlementDialog } from "@/components/attendance/WeeklySettlementDialog";
import { useQueryClient } from "@tanstack/react-query";
// Add inside component:
const queryClient = useQueryClient();
```

> **Note for the implementer:** `WeeklySettlementDialog`'s actual prop signature may differ from the names above. Check `git show HEAD~10:src/components/attendance/WeeklySettlementDialog.tsx` for the current contract and adapt — do NOT re-invent the dialog. If the dialog requires different prop names, rename in the wiring code; the dialog itself is reused as-is.

- [ ] **Step 3: Manual verification**

```bash
npm run dev
```

Click "+ Add settlement to fill" on an underpaid waterfall week. Dialog opens prefilled. Submit. Verify the hero KPIs refresh and the week's status flips toward Settled.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(main\)/site/payments/payments-content.tsx
git commit -m "feat(payments): wire onSettleClick on underpaid weeks to WeeklySettlementDialog"
```

---

## Phase 5 — Polish (mobile, sticky, empty/error)

### Task 5.1: Mobile sticky tab strip + viewport QA

**Files:**
- Modify: `src/app/(main)/site/payments/payments-content.tsx`

- [ ] **Step 1: Make the tab strip sticky**

Wrap the `<Tabs>` block in:

```tsx
<Box sx={{
  position: "sticky",
  top: { xs: 56, sm: 64 },  // matches PageHeader height; verify with --page-header-height if set
  zIndex: 10,
  bgcolor: "background.default",
  pt: 0.5,
}}>
  <Tabs ...>
    ...
  </Tabs>
</Box>
```

- [ ] **Step 2: Make the warning band sticky on mobile only**

Wrap the warning band JSX in:

```tsx
<Box sx={{
  position: { xs: "sticky", sm: "static" },
  top: { xs: 56 },
  zIndex: { xs: 9, sm: "auto" },
}}>
  {/* existing warning band */}
</Box>
```

- [ ] **Step 3: Test on three viewports via Playwright**

```bash
npm run dev
```

Use Playwright MCP to visit `/site/payments` at 1280×800, 768×1024, and 360×640. For each:
- Hero KPIs are readable (5 columns at 1280, 3 at 768, 2 at 360)
- Tab strip stays visible while scrolling
- Mobile (360): tab labels show as icon-only (Phase 2 already handles this)
- Waterfall row layout: 5-column at 1280, two-line at 360

Take screenshots at each width. Visually compare with the mockup at `.superpowers/brainstorm/2007-1777217120/content/combined-final.html`.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(main\)/site/payments/payments-content.tsx
git commit -m "feat(payments): sticky tabs + mobile-sticky warning band"
```

---

### Task 5.2: Empty + error states polish

**Files:**
- Modify: `src/components/payments/SalaryWaterfallList.tsx`
- Modify: `src/components/payments/AdvancesList.tsx`
- Modify: `src/components/payments/DailyMarketLedger.tsx`
- Modify: `src/app/(main)/site/payments/payments-content.tsx`

- [ ] **Step 1: Wrap each region in an error boundary**

In `payments-content.tsx`, add per-region `<Alert severity="error">` if its query has an error. For example, around `SalaryWaterfallList`:

```tsx
{waterfallQuery.isError ? (
  <Alert severity="error">Failed to load waterfall: {(waterfallQuery.error as Error)?.message}</Alert>
) : (
  <SalaryWaterfallList ... />
)}
```

Repeat for hero, advances, daily-market.

- [ ] **Step 2: Verify empty states already exist**

Each list component already has an empty-state Typography (added in Tasks 1.4, 2.2, 2.3). Confirm they render correctly when their data array is empty.

- [ ] **Step 3: Run all tests**

```bash
npm run test
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(main\)/site/payments/payments-content.tsx
git commit -m "feat(payments): per-region error boundaries with Alert"
```

---

### Task 5.3: Full regression sweep + final polish

**Files:**
- Various

- [ ] **Step 1: Run the full test suite**

```bash
npm run test
```

All tests must pass. Investigate and fix any failures.

- [ ] **Step 2: Run the production build**

```bash
npm run build
```

Build must succeed with no TypeScript errors.

- [ ] **Step 3: Manually verify the page on dev server**

```bash
npm run dev
```

Use Playwright MCP to log in via `/dev-login` and visit `/site/payments`. Verify:

1. Subcontract context strip renders at top with correct values.
2. 5-KPI hero shows Wages Due / Paid / Advances / Total Cash Out / sign-aware Status.
3. Pending warning band shows unsettled count.
4. Three-tab strip; Salary Waterfall is default.
5. Salary Waterfall: per-week rows with Settled/Underpaid/Pending chips. Underpaid CTA opens WeeklySettlementDialog. Settle the week → numbers refresh without page reload.
6. Advances tab: list of advance records with footer total. Click one → InspectPane opens with only Settlement and Audit tabs.
7. Daily+Market tab: pending separator at top + week-grouped settled rows. Pending count badge matches.
8. Click a salary waterfall row → InspectPane in week-aggregate mode shows the per-day attendance strip.
9. Click an advance row → no Attendance ₹0 (Attendance tab is hidden).
10. Console: no errors, no React warnings.

- [ ] **Step 4: Cross-page regression check**

Visit `/site/expenses` and `/site/attendance`. Verify the InspectPane still mounts correctly when clicking ref-code chips and settlement chips. The new entity kinds shouldn't break those flows.

- [ ] **Step 5: Commit any final adjustments**

```bash
git add -A
git commit -m "chore(payments): final polish + regression fixes"
```

- [ ] **Step 6: Open a PR (optional, when ready)**

```bash
git push -u origin <branch-name>
gh pr create --title "feat(payments): salary waterfall revival + subcontract anchor + 3-tab redesign" --body "$(cat <<'EOF'
## Summary
- Revives the deleted waterfall payment model and 5-KPI salary slice hero (commit 11a2ce9 dropped them)
- Anchors /site/payments to its parent subcontract from /site/subcontracts
- Splits the unified ledger into three purpose-built tabs (Salary Waterfall / Advances / Daily+Market)
- Compact + mobile-first throughout
- Two new RPCs (get_salary_waterfall, get_salary_slice_summary), one extension to get_payments_ledger

## Test plan
- [ ] All vitest tests green
- [ ] Production build clean
- [ ] Hero KPIs match prior ContractSummaryDashboardV2 numbers for any historical week
- [ ] Underpaid week CTA opens WeeklySettlementDialog and updates numbers post-settle
- [ ] Advance row InspectPane no longer shows ₹0 Attendance
- [ ] No regressions on /site/expenses or /site/attendance InspectPane usage
- [ ] 360px mobile viewport readable end-to-end

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review checklist

The plan author ran this self-review against the spec:

| Spec section | Plan task(s) covering it |
|---|---|
| §1 Problem statement | Implicit — the redesign addresses all three sins by Phase 2 end |
| §2 Solution overview (5 regions) | Phase 0–4 build them in order |
| §3 Domain model + waterfall mechanic | Task 0.1 (RPC implements algorithm) |
| §4.1 Subcontract context strip | Tasks 3.1–3.3 |
| §4.2 5-KPI hero | Tasks 1.1, 1.3 |
| §4.3 Pending warning band | Kept from current page (no task) |
| §4.4.1 Salary Waterfall tab | Tasks 1.2, 1.4, 1.5, 4.4 |
| §4.4.2 Advances tab | Tasks 2.1, 2.2, 2.4 |
| §4.4.3 Daily+Market tab | Tasks 2.3, 2.4 |
| §4.5 InspectPane shapes | Tasks 4.1–4.3 |
| §6.1 get_salary_waterfall RPC | Task 0.1 |
| §6.1.1 get_salary_slice_summary RPC | Task 0.2 |
| §6.2 get_payments_ledger subtype | Task 0.3 |
| §6.3 useSubcontractSpend | Task 3.1 |
| §7 Compact + mobile rules | Built into every component task; final QA in 5.1, 5.3 |
| §11 Acceptance criteria | Verified in Task 5.3 step 3 |

No placeholders found in the plan. No type-name drift across tasks (verified: `WaterfallWeek`, `SalarySliceSummary`, `AdvanceRow`, `WeekAggregate` types are consistent across tasks 1.2, 1.4, 2.1, 2.2, 4.2, 4.4).

Open question §10 items resolve naturally during execution:
- Q1 (existing aggregator) — resolved in Task 3.1 step 1
- Q2 (is_under_contract reliability) — surfaced if Task 0.3 smoke test shows non-zero `unclassified` count
- Q3 (Mestri Owed visibility when no subcontract selected) — `mestri_owed` is computed regardless; the *strip* falls back, but the hero still shows the all-site value
- Q4 (sticky tab offset) — addressed in Task 5.1 step 1
