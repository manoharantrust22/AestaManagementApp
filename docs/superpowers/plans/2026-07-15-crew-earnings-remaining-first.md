# Crew Earnings — Remaining-First Strip, Week History, Project Default — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On `/site/trades` → contract detail → "Crew earnings & commission": open on Project, list every week separately under Week, and make the mesthri strip lead with what is still owed (wages + commission) instead of a gross lifetime total.

**Architecture:** Pure math/grouping helpers extracted to `src/lib/workforce/` and unit-tested first (TDD); three SQL RPCs updated/added; the 339-line `ContractLaborLedger.tsx` split into container + strip + week list. Commission payouts gain a contract tag so per-contract commission owed becomes real going forward.

**Tech Stack:** Next.js 15, MUI v7, React Query, Supabase (PostgreSQL), Vitest, dayjs.

**Spec:** `docs/superpowers/specs/2026-07-15-crew-earnings-remaining-first-design.md`

## Global Constraints

- **Week convention: Sunday → Saturday.** Reuse `weekStartOf`/`weekEndOf` from `src/lib/utils/weekUtils.ts`. Never use `startOf("week")` (locale-dependent). SQL equivalent: `date_trunc('week', d.date::timestamp + interval '1 day')::date - 1` (verified equal to `weekUtils` across 400 days incl. year boundary).
- **Any change to a `RETURNS TABLE` shape requires `DROP FUNCTION` first, then `CREATE`, then re-`GRANT`.** `CREATE OR REPLACE` alone fails with "cannot change return type of existing function".
- **Migrations are written to files only — do NOT apply to prod.** They are applied at "move to prod" per `CLAUDE.md`. There is no Aesta staging DB; validate SQL with `BEGIN; … ROLLBACK;` dry-runs.
- **Aesta prod is `mcp__supabase__*` (project `ocutbpoaibjxtyjkrnda`), NOT `mcp__supabase-prod__*`** (that MCP points at a different app). Verify with `get_project_url` before any DB call.
- **Money never silently changes scope.** A number labelled for a week must be computed from that week. A project-scoped number must say so ("owed in total").
- Currency via `formatCurrencyFull` from `@/lib/formatters`. Tokens via `wsColors`/`wsRadius` from `@/lib/workforce/workspaceTokens`.
- Migration timestamps continue after the latest existing file (`20260716110100_*`): use `20260716120000`, `20260716120100`, `20260716120200`.

---

### Task 1: Mesthri strip math (pure)

The strip's arithmetic, isolated from React so it can be tested exhaustively.

**Files:**
- Create: `src/lib/workforce/mesthriStripMath.ts`
- Test: `src/lib/workforce/mesthriStripMath.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `computeMesthriStrip(input: MesthriStripInput): MesthriStripView`, types `MesthriStripInput`, `MesthriStripView`. Used by Task 7.

- [ ] **Step 1: Write the failing test**

Create `src/lib/workforce/mesthriStripMath.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeMesthriStrip } from "./mesthriStripMath";

// Real WaterTank/Jithin figures: own labour ₹15,750 (₹9,800 already paid),
// commission accrued ₹1,825, plus ₹3,000 of older site-wide untagged payouts.
const jithin = {
  ownNet: 15750,
  ownPaid: 9800,
  commissionAccrued: 1825,
  commissionPaid: 0,
  untaggedCommissionPaid: 3000,
  commissionApplies: true,
};

describe("computeMesthriStrip", () => {
  it("leads with what is still owed, and demotes the lifetime total", () => {
    const v = computeMesthriStrip(jithin);
    expect(v.ownRemaining).toBe(5950);
    expect(v.commissionRemaining).toBe(1825);
    expect(v.stillToPay).toBe(7775);
    expect(v.totalPaid).toBe(9800);
    expect(v.totalEarned).toBe(17575);
    expect(v.pctPaid).toBe(56);
    expect(v.isSettled).toBe(false);
  });

  it("reports untagged site-wide commission so it is never silently counted", () => {
    expect(computeMesthriStrip(jithin).untaggedNote).toBe(3000);
  });

  it("subtracts commission that IS tagged to this contract", () => {
    const v = computeMesthriStrip({ ...jithin, commissionPaid: 1000 });
    expect(v.commissionRemaining).toBe(825);
    expect(v.stillToPay).toBe(6775);
    expect(v.totalPaid).toBe(10800);
  });

  it("ignores commission entirely when commissionApplies is false", () => {
    const v = computeMesthriStrip({ ...jithin, commissionApplies: false });
    expect(v.commissionRemaining).toBe(0);
    expect(v.stillToPay).toBe(5950);
    expect(v.totalEarned).toBe(15750);
    expect(v.untaggedNote).toBe(0);
  });

  it("marks fully-paid as settled at 100%", () => {
    const v = computeMesthriStrip({
      ownNet: 15750, ownPaid: 15750, commissionAccrued: 1825,
      commissionPaid: 1825, untaggedCommissionPaid: 0, commissionApplies: true,
    });
    expect(v.stillToPay).toBe(0);
    expect(v.isSettled).toBe(true);
    expect(v.pctPaid).toBe(100);
  });

  it("treats a sub-rupee residue as settled (float noise, not real debt)", () => {
    const v = computeMesthriStrip({
      ownNet: 15750.4, ownPaid: 15750, commissionAccrued: 0,
      commissionPaid: 0, untaggedCommissionPaid: 0, commissionApplies: true,
    });
    expect(v.isSettled).toBe(true);
  });

  it("clamps overpayment to zero rather than showing negative debt", () => {
    const v = computeMesthriStrip({
      ownNet: 15750, ownPaid: 20000, commissionAccrued: 0,
      commissionPaid: 0, untaggedCommissionPaid: 0, commissionApplies: true,
    });
    expect(v.ownRemaining).toBe(0);
    expect(v.stillToPay).toBe(0);
  });

  it("does not divide by zero on a contract with no earnings yet", () => {
    const v = computeMesthriStrip({
      ownNet: 0, ownPaid: 0, commissionAccrued: 0,
      commissionPaid: 0, untaggedCommissionPaid: 0, commissionApplies: true,
    });
    expect(v.pctPaid).toBe(0);
    expect(v.isSettled).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/workforce/mesthriStripMath.test.ts`
Expected: FAIL — `Failed to resolve import "./mesthriStripMath"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/workforce/mesthriStripMath.ts`:

```ts
/**
 * Mesthri pay-strip arithmetic for one contract.
 *
 * All inputs are PROJECT-scoped (lifetime) — the strip answers "what do I still owe
 * him on this contract", which payments only ever have a project scope for.
 *
 * Commission accrues per contract but is paid per (site, collector). Only payouts
 * explicitly tagged with this contract count as `commissionPaid`; older untagged ones
 * are surfaced via `untaggedNote` instead, because counting them would understate the
 * debt and ignoring them silently would overstate it.
 */

export interface MesthriStripInput {
  /** Net earned by the mesthri's OWN days. Equals gross: the commission view
   *  self-excludes the collector, so he accrues no commission on himself. */
  ownNet: number;
  /** Paid against own wages, tagged to this contract. */
  ownPaid: number;
  /** Commission accrued on THIS contract's crew days. */
  commissionAccrued: number;
  /** Commission paid AND tagged to THIS contract. */
  commissionPaid: number;
  /** Commission paid to him site-wide with no contract tag (legacy payouts). */
  untaggedCommissionPaid: number;
  /** The contract's mesthri_commission_applies flag. */
  commissionApplies: boolean;
}

export interface MesthriStripView {
  ownRemaining: number;
  commissionRemaining: number;
  /** The headline: own wages + commission still to pay. */
  stillToPay: number;
  totalPaid: number;
  totalEarned: number;
  /** 0..100, rounded. 0 when nothing has been earned. */
  pctPaid: number;
  isSettled: boolean;
  /** Untagged site-wide commission to warn about; 0 when there is nothing to say. */
  untaggedNote: number;
}

/** Below this, a residue is float noise rather than real debt. */
const SETTLED_EPSILON = 0.5;

export function computeMesthriStrip(input: MesthriStripInput): MesthriStripView {
  const accrued = input.commissionApplies ? input.commissionAccrued : 0;
  const commPaid = input.commissionApplies ? input.commissionPaid : 0;

  const ownRemaining = Math.max(input.ownNet - input.ownPaid, 0);
  const commissionRemaining = Math.max(accrued - commPaid, 0);
  const stillToPay = ownRemaining + commissionRemaining;
  const totalPaid = input.ownPaid + commPaid;
  const totalEarned = input.ownNet + accrued;

  return {
    ownRemaining,
    commissionRemaining,
    stillToPay,
    totalPaid,
    totalEarned,
    pctPaid: totalEarned > 0 ? Math.round((totalPaid / totalEarned) * 100) : 0,
    isSettled: totalEarned > 0 && stillToPay <= SETTLED_EPSILON,
    untaggedNote: input.commissionApplies ? Math.max(input.untaggedCommissionPaid, 0) : 0,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/workforce/mesthriStripMath.test.ts`
Expected: PASS — 8 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/workforce/mesthriStripMath.ts src/lib/workforce/mesthriStripMath.test.ts
git commit -m "feat(workforce): mesthri strip remaining-first math"
```

---

### Task 2: Week grouping + labels (pure)

**Files:**
- Create: `src/lib/workforce/ledgerWeeks.ts`
- Test: `src/lib/workforce/ledgerWeeks.test.ts`

**Interfaces:**
- Consumes: `weekEndOf` from `src/lib/utils/weekUtils.ts`.
- Produces: `groupRowsByWeek(rows: WeeklyLedgerRow[]): LedgerWeekBucket[]`, `formatWeekRange(weekStart: string): string`, types `WeeklyLedgerRow`, `LedgerWeekBucket`. Used by Tasks 4 and 8.

- [ ] **Step 1: Write the failing test**

Create `src/lib/workforce/ledgerWeeks.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatWeekRange, groupRowsByWeek, type WeeklyLedgerRow } from "./ledgerWeeks";

const row = (over: Partial<WeeklyLedgerRow>): WeeklyLedgerRow => ({
  weekStart: "2026-06-28", laborerId: "l1", laborerName: "Hemanta", roleName: "Male Helper",
  manDays: 4.5, dayCount: 5, gross: 3600, commission: 0, net: 3600,
  netTotal: 10125, netPaid: 5200, netUnpaid: 4925, isMesthri: false, ...over,
});

describe("formatWeekRange", () => {
  it("labels a Sunday-start week through its Saturday", () => {
    expect(formatWeekRange("2026-06-28")).toBe("Sun 28 Jun – Sat 4 Jul");
  });

  it("labels a week that stays inside one month", () => {
    expect(formatWeekRange("2026-06-07")).toBe("Sun 7 Jun – Sat 13 Jun");
  });
});

describe("groupRowsByWeek", () => {
  it("returns weeks newest-first", () => {
    const out = groupRowsByWeek([
      row({ weekStart: "2026-06-14" }),
      row({ weekStart: "2026-06-28" }),
      row({ weekStart: "2026-06-21" }),
    ]);
    expect(out.map((w) => w.weekStart)).toEqual(["2026-06-28", "2026-06-21", "2026-06-14"]);
  });

  it("totals each week's earnings from that week's rows only", () => {
    const out = groupRowsByWeek([
      row({ weekStart: "2026-06-28", laborerId: "a", net: 3600 }),
      row({ weekStart: "2026-06-28", laborerId: "b", net: 2850 }),
      row({ weekStart: "2026-06-21", laborerId: "a", net: 9999 }),
    ]);
    expect(out[0].totalNet).toBe(6450);
    expect(out[1].totalNet).toBe(9999);
  });

  it("puts the mesthri first within a week, then by earnings", () => {
    const out = groupRowsByWeek([
      row({ laborerId: "a", laborerName: "Hemanta", net: 3600 }),
      row({ laborerId: "m", laborerName: "Jithin", net: 100, isMesthri: true }),
      row({ laborerId: "b", laborerName: "Sadha", net: 5000 }),
    ]);
    expect(out[0].rows.map((r) => r.laborerName)).toEqual(["Jithin", "Sadha", "Hemanta"]);
  });

  it("carries a human label for each week", () => {
    expect(groupRowsByWeek([row({ weekStart: "2026-06-28" })])[0].label)
      .toBe("Sun 28 Jun – Sat 4 Jul");
  });

  it("returns no weeks for no rows", () => {
    expect(groupRowsByWeek([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/workforce/ledgerWeeks.test.ts`
Expected: FAIL — `Failed to resolve import "./ledgerWeeks"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/workforce/ledgerWeeks.ts`:

```ts
/**
 * Week bucketing for the contract labor ledger.
 *
 * `weekStart` is produced Sunday-aligned by get_contract_labor_ledger_weekly; this
 * module only groups and labels. `net` is the week's EARNINGS (windowed, honest);
 * netTotal/netPaid/netUnpaid are PROJECT-scoped and must be labelled as such in the UI —
 * payments are not recorded against a week, so a per-week "remaining" cannot exist.
 */

import dayjs from "dayjs";
import { weekEndOf } from "@/lib/utils/weekUtils";

export interface WeeklyLedgerRow {
  /** Sunday of the week, YYYY-MM-DD. */
  weekStart: string;
  laborerId: string;
  laborerName: string;
  roleName: string;
  /** Windowed to this week. */
  manDays: number;
  dayCount: number;
  gross: number;
  commission: number;
  net: number;
  /** Project-scoped — NOT this week's. */
  netTotal: number;
  netPaid: number;
  netUnpaid: number;
  isMesthri: boolean;
}

export interface LedgerWeekBucket {
  weekStart: string;
  /** e.g. "Sun 28 Jun – Sat 4 Jul" */
  label: string;
  /** Σ net earned in this week. */
  totalNet: number;
  rows: WeeklyLedgerRow[];
}

export function formatWeekRange(weekStart: string): string {
  const start = dayjs(weekStart);
  return `${start.format("ddd D MMM")} – ${weekEndOf(start).format("ddd D MMM")}`;
}

export function groupRowsByWeek(rows: WeeklyLedgerRow[]): LedgerWeekBucket[] {
  const byWeek = new Map<string, WeeklyLedgerRow[]>();
  for (const r of rows) {
    const bucket = byWeek.get(r.weekStart);
    if (bucket) bucket.push(r);
    else byWeek.set(r.weekStart, [r]);
  }

  return [...byWeek.entries()]
    .map(([weekStart, weekRows]) => ({
      weekStart,
      label: formatWeekRange(weekStart),
      totalNet: weekRows.reduce((sum, r) => sum + r.net, 0),
      rows: [...weekRows].sort(
        (a, b) =>
          Number(b.isMesthri) - Number(a.isMesthri) ||
          b.net - a.net ||
          a.laborerName.localeCompare(b.laborerName),
      ),
    }))
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/workforce/ledgerWeeks.test.ts`
Expected: PASS — 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/workforce/ledgerWeeks.ts src/lib/workforce/ledgerWeeks.test.ts
git commit -m "feat(workforce): week bucketing + labels for contract ledger"
```

---

### Task 3: Fix `net_unpaid` scope mixing (migration + hook)

**The bug:** `get_contract_labor_ledger` windows `gross`/`commission`/`net` by the date range but computes `net_paid` project-wide, then does `net_unpaid = GREATEST(windowed_net − project_paid, 0)`. Outside Project view that clamps most rows to `₹0 owed` and prints captions like "₹5,200 paid of ₹3,600". Fix: `net_total` (project-scoped net) joins alongside, and `net_unpaid = GREATEST(net_total − net_paid, 0)` — always project-scoped, whatever the window.

**Also:** the `paid` CTE keys on `contract_laborer_id IS NOT NULL` without filtering `payment_type`. Once Task 6 tags commission payouts to contracts, a commission row could be counted as the mesthri's own wages. Add `payment_type <> 'commission'` (defence #2 of 2; defence #1 is in Task 6).

**Files:**
- Create: `supabase/migrations/20260716120000_contract_labor_ledger_project_scoped_unpaid.sql`
- Modify: `src/hooks/queries/useContractLaborLedger.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ContractLaborLedgerRow.netTotal: number` and `ContractLaborLedger.totalNetTotal: number` (both project-scoped net). `netPaid`/`netUnpaid`/`totalNetPaid`/`totalNetUnpaid` keep their names but are now guaranteed project-scoped on every tab. Used by Tasks 7 and 8.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260716120000_contract_labor_ledger_project_scoped_unpaid.sql`:

```sql
-- Fix scope mixing in get_contract_labor_ledger.
--
-- Before: gross/commission/net were windowed by p_date_from/p_date_to but net_paid was
-- project-wide, so net_unpaid = windowed_net - project_paid. Only correct at Project view
-- (the old header admitted as much). On Day/Week it clamped rows to 0 and produced
-- captions like "₹5,200 paid of ₹3,600".
--
-- After: net_total is the laborer's PROJECT-scoped net; net_unpaid = net_total - net_paid,
-- so paid/remaining are project-scoped on every tab and the UI labels them "in total".
-- gross/commission/net stay windowed — they are the honest "earned in this window".
--
-- Also: the paid CTE now excludes payment_type='commission'. Commission payouts gain a
-- contract tag in a later migration; without this filter one would be miscounted as the
-- mesthri's own wages paid, inflating net_paid and hiding real debt.

-- RETURNS TABLE gains net_total → the function must be dropped, not replaced.
DROP FUNCTION IF EXISTS public.get_contract_labor_ledger(text, uuid, date, date);

CREATE FUNCTION public.get_contract_labor_ledger(
  p_kind text,                       -- 'task_work' | 'subcontract'
  p_ref_id uuid,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
) RETURNS TABLE(
  laborer_id uuid,
  laborer_name text,
  role_name text,
  man_days numeric,
  day_count integer,
  gross numeric,
  commission numeric,
  net numeric,
  net_total numeric,
  net_paid numeric,
  net_unpaid numeric,
  is_mesthri boolean
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT
      d.laborer_id,
      l.name                                                        AS laborer_name,
      COALESCE(lr.name, 'Unknown')                                  AS role_name,
      d.date,
      COALESCE(d.work_days, 1)::numeric                             AS work_days,
      d.daily_earnings,
      COALESCE(d.mesthri_commission_amount, vc.commission_amount)   AS comm,
      (vc.collector_id = d.laborer_id)                              AS is_mesthri_day
    FROM public.daily_attendance d
    JOIN public.laborers l ON l.id = d.laborer_id
    LEFT JOIN public.labor_roles lr ON lr.id = l.role_id
    JOIN public.v_daily_attendance_commission vc ON vc.attendance_id = d.id
    WHERE d.is_deleted = false
      AND d.is_archived = false
      AND l.laborer_type = 'contract'
      AND (
        (p_kind = 'task_work'   AND d.task_work_package_id = p_ref_id)
        OR
        (p_kind = 'subcontract' AND d.subcontract_id = p_ref_id AND d.task_work_package_id IS NULL)
      )
  ),
  windowed AS (
    SELECT
      base.laborer_id, base.laborer_name, base.role_name,
      COALESCE(SUM(base.work_days), 0)::numeric              AS man_days,
      COUNT(*)::int                                          AS day_count,
      COALESCE(SUM(base.daily_earnings), 0)::numeric         AS gross,
      COALESCE(SUM(base.comm), 0)::numeric                   AS commission,
      COALESCE(SUM(base.daily_earnings - base.comm), 0)::numeric AS net,
      bool_or(base.is_mesthri_day)                           AS is_mesthri
    FROM base
    WHERE (p_date_from IS NULL OR base.date >= p_date_from)
      AND (p_date_to   IS NULL OR base.date <= p_date_to)
    GROUP BY base.laborer_id, base.laborer_name, base.role_name
  ),
  lifetime AS (
    SELECT base.laborer_id,
           COALESCE(SUM(base.daily_earnings - base.comm), 0)::numeric AS net_total
    FROM base
    GROUP BY base.laborer_id
  ),
  paid AS (
    SELECT sg.contract_laborer_id AS laborer_id,
           COALESCE(SUM(sg.total_amount), 0)::numeric AS net_paid
    FROM public.settlement_groups sg
    WHERE sg.contract_ref_kind = p_kind
      AND sg.contract_ref_id = p_ref_id
      AND sg.contract_laborer_id IS NOT NULL
      AND sg.payment_type <> 'commission'   -- commission is not own-wages
      AND sg.is_cancelled = false
      AND sg.is_archived = false
    GROUP BY sg.contract_laborer_id
  )
  SELECT
    w.laborer_id, w.laborer_name, w.role_name, w.man_days, w.day_count,
    w.gross, w.commission, w.net,
    COALESCE(lt.net_total, 0)::numeric                                        AS net_total,
    COALESCE(p.net_paid, 0)::numeric                                          AS net_paid,
    GREATEST(COALESCE(lt.net_total, 0) - COALESCE(p.net_paid, 0), 0)::numeric AS net_unpaid,
    w.is_mesthri
  FROM windowed w
  LEFT JOIN lifetime lt ON lt.laborer_id = w.laborer_id
  LEFT JOIN paid p      ON p.laborer_id  = w.laborer_id
  ORDER BY w.is_mesthri DESC, w.net DESC, w.laborer_name;
$function$;

COMMENT ON FUNCTION public.get_contract_labor_ledger(text, uuid, date, date) IS
  'Per-company-laborer ledger for one contract. man_days/gross/commission/net are WINDOWED by p_date_from/p_date_to (earned in the window). net_total/net_paid/net_unpaid are PROJECT-scoped (lifetime) because payments are only ever project-scoped — the UI must label them "in total". Read-only.';

GRANT EXECUTE ON FUNCTION public.get_contract_labor_ledger(text, uuid, date, date)
  TO authenticated, service_role;
```

- [ ] **Step 2: Dry-run the SQL against prod without committing anything**

First confirm the MCP points at Aesta (`ocutbpoaibjxtyjkrnda`), because `mcp__supabase-prod__*` is a different app:

Run: `mcp__supabase__get_project_url`
Expected: a URL containing `ocutbpoaibjxtyjkrnda`. **If it does not, stop and re-check the MCP.**

Then run the migration body wrapped in a transaction that is thrown away, via `mcp__supabase__execute_sql`:

```sql
BEGIN;
-- paste the full migration body here
-- then prove the two fixes on a real contract:
SELECT laborer_name, net, net_total, net_paid, net_unpaid
FROM public.get_contract_labor_ledger(
  'task_work',
  (SELECT id FROM public.task_work_packages WHERE mesthri_commission_enabled ORDER BY created_at DESC LIMIT 1),
  '2026-06-28', '2026-07-04'
);
ROLLBACK;
```

Expected: `net` (one week) is small while `net_total`/`net_unpaid` show lifetime figures — i.e. `net_unpaid` no longer collapses to 0 and no longer depends on the window.

- [ ] **Step 3: Update the hook to expose `netTotal`**

In `src/hooks/queries/useContractLaborLedger.ts`, add to `ContractLaborLedgerRow` after `net`:

```ts
  /** Project-scoped net earned (lifetime), regardless of the query window. */
  netTotal: number;
```

Replace the two existing doc comments on `netPaid`/`netUnpaid` with:

```ts
  /** Project-scoped net already settled. NOT windowed — label it "in total" in UI. */
  netPaid: number;
  /** Project-scoped net still owed = max(netTotal - netPaid, 0). NOT windowed. */
  netUnpaid: number;
```

In the row mapper, add after the `net` line:

```ts
        netTotal: toNumber(r.net_total),
```

Add to the `ContractLaborLedger` interface, after `totalNet`:

```ts
  /** Σ project-scoped net across all laborers. Pairs with totalNetPaid/totalNetUnpaid —
   *  totalNet is windowed and must NOT be used as their denominator. */
  totalNetTotal: number;
```

and to the returned object, after the `totalNet` line:

```ts
        totalNetTotal: rows.reduce((s, r) => s + r.netTotal, 0),
```

- [ ] **Step 4: Verify the app still typechecks and tests pass**

Run: `npx tsc --noEmit && npx vitest run src/lib/workforce`
Expected: no type errors; Task 1 + Task 2 tests still PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260716120000_contract_labor_ledger_project_scoped_unpaid.sql src/hooks/queries/useContractLaborLedger.ts
git commit -m "fix(workforce): make ledger paid/remaining project-scoped on every tab"
```

---

### Task 4: Weekly ledger RPC + hook

One query returns every week bucketed, rather than N queries for N weeks.

**Files:**
- Create: `supabase/migrations/20260716120100_get_contract_labor_ledger_weekly.sql`
- Create: `src/hooks/queries/useContractLaborLedgerWeekly.ts`

**Interfaces:**
- Consumes: `WeeklyLedgerRow` from Task 2; `ContractLedgerKind` from `useContractLaborLedger`.
- Produces: `useContractLaborLedgerWeekly(kind, refId, enabled?)` returning `UseQueryResult<WeeklyLedgerRow[]>`. Used by Task 8.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260716120100_get_contract_labor_ledger_weekly.sql`:

```sql
-- Per-week, per-laborer ledger for one contract — powers the Week tab's list of
-- separate weeks (wages are paid weekly, so each past week is its own event).
--
-- week_start is Sunday-aligned to match src/lib/utils/weekUtils.ts (weekStartOf = .day(0))
-- and the salary waterfall: date_trunc('week', ...) alone yields Monday, so shift +1 day
-- before truncating and -1 day after. Verified equal to weekUtils across 400 days.
--
-- gross/commission/net are the WEEK's earnings. net_total/net_paid/net_unpaid are
-- PROJECT-scoped — payments are never recorded against a week, so a per-week "remaining"
-- cannot exist. The UI labels these "owed in total".

CREATE OR REPLACE FUNCTION public.get_contract_labor_ledger_weekly(
  p_kind text,                       -- 'task_work' | 'subcontract'
  p_ref_id uuid
) RETURNS TABLE(
  week_start date,
  laborer_id uuid,
  laborer_name text,
  role_name text,
  man_days numeric,
  day_count integer,
  gross numeric,
  commission numeric,
  net numeric,
  net_total numeric,
  net_paid numeric,
  net_unpaid numeric,
  is_mesthri boolean
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT
      (date_trunc('week', d.date::timestamp + interval '1 day')::date - 1) AS week_start,
      d.laborer_id,
      l.name                                                        AS laborer_name,
      COALESCE(lr.name, 'Unknown')                                  AS role_name,
      COALESCE(d.work_days, 1)::numeric                             AS work_days,
      d.daily_earnings,
      COALESCE(d.mesthri_commission_amount, vc.commission_amount)   AS comm,
      (vc.collector_id = d.laborer_id)                              AS is_mesthri_day
    FROM public.daily_attendance d
    JOIN public.laborers l ON l.id = d.laborer_id
    LEFT JOIN public.labor_roles lr ON lr.id = l.role_id
    JOIN public.v_daily_attendance_commission vc ON vc.attendance_id = d.id
    WHERE d.is_deleted = false
      AND d.is_archived = false
      AND l.laborer_type = 'contract'
      AND (
        (p_kind = 'task_work'   AND d.task_work_package_id = p_ref_id)
        OR
        (p_kind = 'subcontract' AND d.subcontract_id = p_ref_id AND d.task_work_package_id IS NULL)
      )
  ),
  lifetime AS (
    SELECT base.laborer_id,
           COALESCE(SUM(base.daily_earnings - base.comm), 0)::numeric AS net_total
    FROM base
    GROUP BY base.laborer_id
  ),
  paid AS (
    SELECT sg.contract_laborer_id AS laborer_id,
           COALESCE(SUM(sg.total_amount), 0)::numeric AS net_paid
    FROM public.settlement_groups sg
    WHERE sg.contract_ref_kind = p_kind
      AND sg.contract_ref_id = p_ref_id
      AND sg.contract_laborer_id IS NOT NULL
      AND sg.payment_type <> 'commission'
      AND sg.is_cancelled = false
      AND sg.is_archived = false
    GROUP BY sg.contract_laborer_id
  ),
  wk AS (
    SELECT
      base.week_start, base.laborer_id, base.laborer_name, base.role_name,
      COALESCE(SUM(base.work_days), 0)::numeric                  AS man_days,
      COUNT(*)::int                                              AS day_count,
      COALESCE(SUM(base.daily_earnings), 0)::numeric             AS gross,
      COALESCE(SUM(base.comm), 0)::numeric                       AS commission,
      COALESCE(SUM(base.daily_earnings - base.comm), 0)::numeric AS net,
      bool_or(base.is_mesthri_day)                               AS is_mesthri
    FROM base
    GROUP BY base.week_start, base.laborer_id, base.laborer_name, base.role_name
  )
  SELECT
    wk.week_start, wk.laborer_id, wk.laborer_name, wk.role_name, wk.man_days, wk.day_count,
    wk.gross, wk.commission, wk.net,
    COALESCE(lt.net_total, 0)::numeric                                        AS net_total,
    COALESCE(p.net_paid, 0)::numeric                                          AS net_paid,
    GREATEST(COALESCE(lt.net_total, 0) - COALESCE(p.net_paid, 0), 0)::numeric AS net_unpaid,
    wk.is_mesthri
  FROM wk
  LEFT JOIN lifetime lt ON lt.laborer_id = wk.laborer_id
  LEFT JOIN paid p      ON p.laborer_id  = wk.laborer_id
  ORDER BY wk.week_start DESC, wk.is_mesthri DESC, wk.net DESC, wk.laborer_name;
$function$;

COMMENT ON FUNCTION public.get_contract_labor_ledger_weekly(text, uuid) IS
  'Per-week per-laborer ledger for one contract, weeks Sunday-aligned (matches weekUtils + the salary waterfall). gross/commission/net are the week''s earnings; net_total/net_paid/net_unpaid are project-scoped. Read-only.';

GRANT EXECUTE ON FUNCTION public.get_contract_labor_ledger_weekly(text, uuid)
  TO authenticated, service_role;
```

- [ ] **Step 2: Dry-run and prove the Sunday alignment on real data**

Run via `mcp__supabase__execute_sql` (confirm `get_project_url` shows `ocutbpoaibjxtyjkrnda` first):

```sql
BEGIN;
-- paste the full migration body here
SELECT DISTINCT week_start, to_char(week_start, 'Dy') AS dow
FROM public.get_contract_labor_ledger_weekly(
  'task_work',
  (SELECT id FROM public.task_work_packages WHERE mesthri_commission_enabled ORDER BY created_at DESC LIMIT 1)
)
ORDER BY week_start DESC;
ROLLBACK;
```

Expected: **every** `dow` is `Sun`, and more than one distinct `week_start` (proving weeks separate).

- [ ] **Step 3: Write the hook**

Create `src/hooks/queries/useContractLaborLedgerWeekly.ts`:

```ts
/**
 * useContractLaborLedgerWeekly
 *
 * Every week a contract's crew worked, one row per (week, laborer), from
 * get_contract_labor_ledger_weekly. Powers the Week tab's list of separate weeks.
 *
 * gross/commission/net are the WEEK's earnings. netTotal/netPaid/netUnpaid are
 * PROJECT-scoped — payments are not recorded against a week. Read-only.
 */

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { withTimeout, TIMEOUTS } from "@/lib/utils/timeout";
import type { ContractLedgerKind } from "./useContractLaborLedger";
import type { WeeklyLedgerRow } from "@/lib/workforce/ledgerWeeks";

function toNumber(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function useContractLaborLedgerWeekly(
  kind: ContractLedgerKind | null,
  refId: string | null,
  enabled = true,
) {
  const supabase = createClient();
  return useQuery<WeeklyLedgerRow[]>({
    queryKey: ["contract-labor-ledger-weekly", kind, refId],
    enabled: Boolean(enabled && kind && refId),
    staleTime: 30_000,
    queryFn: async ({ signal }): Promise<WeeklyLedgerRow[]> => {
      const { data, error } = await withTimeout(
        Promise.resolve(
          (supabase as any)
            .rpc("get_contract_labor_ledger_weekly", { p_kind: kind, p_ref_id: refId })
            .abortSignal(signal),
        ),
        TIMEOUTS.QUERY,
        "Weekly contract labor ledger query timed out. Please retry.",
      );
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        weekStart: String(r.week_start ?? ""),
        laborerId: String(r.laborer_id ?? ""),
        laborerName: String(r.laborer_name ?? "Unknown"),
        roleName: String(r.role_name ?? "Unknown"),
        manDays: toNumber(r.man_days),
        dayCount: toNumber(r.day_count),
        gross: toNumber(r.gross),
        commission: toNumber(r.commission),
        net: toNumber(r.net),
        netTotal: toNumber(r.net_total),
        netPaid: toNumber(r.net_paid),
        netUnpaid: toNumber(r.net_unpaid),
        isMesthri: Boolean(r.is_mesthri),
      }));
    },
  });
}
```

- [ ] **Step 4: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260716120100_get_contract_labor_ledger_weekly.sql src/hooks/queries/useContractLaborLedgerWeekly.ts
git commit -m "feat(workforce): weekly contract labor ledger RPC + hook"
```

---

### Task 5: Per-contract commission payable (migration + hook)

**Files:**
- Create: `supabase/migrations/20260716120200_mesthri_commission_payable_by_contract.sql`
- Modify: `src/hooks/queries/useMesthriCommissionPayable.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `useMesthriCommissionPayable(siteId, collectorId?, dateFrom?, dateTo?, contractRefKind?, contractRefId?, enabled?)`; `MesthriCommissionPayableRow.untaggedPaid: number`. Used by Tasks 6 and 7.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260716120200_mesthri_commission_payable_by_contract.sql`:

```sql
-- Scope commission accrued/paid to ONE contract, so a contract pane can show
-- "commission still owed on THIS contract" instead of the mesthri's whole-site pot.
--
-- Accrual has always been per-contract (daily_attendance carries the contract). Paid
-- was not: a commission payout is a settlement_groups row keyed only by site + collector.
-- Payouts now optionally carry contract_ref_kind/contract_ref_id (see settlementService),
-- so paid can be scoped too — but only for payouts recorded AFTER that change.
--
-- untagged_paid reports commission paid to this collector at this site with NO contract
-- tag (i.e. every legacy payout). The UI shows it as an explicit caveat. It is deliberately
-- NOT subtracted from payable: we cannot know which contract it settled, and guessing
-- would write fiction into the money ledger.

-- RETURNS TABLE gains untagged_paid → drop before create.
DROP FUNCTION IF EXISTS public.get_mesthri_commission_payable(uuid, uuid, date, date);

CREATE FUNCTION public.get_mesthri_commission_payable(
  p_site_id uuid,
  p_collector_id uuid DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_contract_ref_kind text DEFAULT NULL,   -- 'task_work' | 'subcontract' | NULL = whole site
  p_contract_ref_id uuid DEFAULT NULL
) RETURNS TABLE(
  collector_id uuid,
  collector_name text,
  accrued numeric,
  paid numeric,
  payable numeric,
  crew_day_count integer,
  untagged_paid numeric
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH accr AS (
    SELECT
      COALESCE(d.mesthri_commission_collector_id, vc.collector_id) AS coll,
      COALESCE(d.mesthri_commission_amount, vc.commission_amount)  AS comm
    FROM public.daily_attendance d
    JOIN public.laborers l ON l.id = d.laborer_id
    JOIN public.v_daily_attendance_commission vc ON vc.attendance_id = d.id
    WHERE d.site_id = p_site_id
      AND d.is_deleted = false
      AND d.is_archived = false
      AND (vc.is_commission_crew_day OR d.mesthri_commission_amount IS NOT NULL)
      AND (p_date_from IS NULL OR d.date >= p_date_from)
      AND (p_date_to   IS NULL OR d.date <= p_date_to)
      AND (
        p_contract_ref_kind IS NULL
        OR (p_contract_ref_kind = 'task_work'   AND d.task_work_package_id = p_contract_ref_id)
        OR (p_contract_ref_kind = 'subcontract' AND d.subcontract_id = p_contract_ref_id
                                                AND d.task_work_package_id IS NULL)
      )
  ),
  acc AS (
    SELECT coll, SUM(comm)::numeric AS accrued, COUNT(*)::int AS crew_day_count
    FROM accr WHERE coll IS NOT NULL GROUP BY coll
  ),
  pay AS (
    SELECT sg.commission_collector_laborer_id AS coll, SUM(sg.total_amount)::numeric AS paid
    FROM public.settlement_groups sg
    WHERE sg.site_id = p_site_id
      AND sg.payment_type = 'commission'
      AND sg.is_cancelled = false
      AND sg.is_archived  = false
      AND sg.commission_collector_laborer_id IS NOT NULL
      AND (p_date_from IS NULL OR sg.settlement_date >= p_date_from)
      AND (p_date_to   IS NULL OR sg.settlement_date <= p_date_to)
      AND (
        p_contract_ref_kind IS NULL
        OR (sg.contract_ref_kind = p_contract_ref_kind AND sg.contract_ref_id = p_contract_ref_id)
      )
    GROUP BY sg.commission_collector_laborer_id
  ),
  untagged AS (
    SELECT sg.commission_collector_laborer_id AS coll, SUM(sg.total_amount)::numeric AS untagged_paid
    FROM public.settlement_groups sg
    WHERE sg.site_id = p_site_id
      AND sg.payment_type = 'commission'
      AND sg.is_cancelled = false
      AND sg.is_archived  = false
      AND sg.commission_collector_laborer_id IS NOT NULL
      AND sg.contract_ref_id IS NULL
    GROUP BY sg.commission_collector_laborer_id
  )
  SELECT
    a.coll                                        AS collector_id,
    lb.name                                       AS collector_name,
    a.accrued                                     AS accrued,
    COALESCE(p.paid, 0)                           AS paid,
    (a.accrued - COALESCE(p.paid, 0))             AS payable,
    a.crew_day_count                              AS crew_day_count,
    -- Only meaningful when scoped to a contract; site-wide mode already counts everything.
    CASE WHEN p_contract_ref_kind IS NULL THEN 0 ELSE COALESCE(u.untagged_paid, 0) END
                                                  AS untagged_paid
  FROM acc a
  LEFT JOIN pay p        ON p.coll = a.coll
  LEFT JOIN untagged u   ON u.coll = a.coll
  LEFT JOIN public.laborers lb ON lb.id = a.coll
  WHERE (p_collector_id IS NULL OR a.coll = p_collector_id)
  ORDER BY payable DESC;
$function$;

COMMENT ON FUNCTION public.get_mesthri_commission_payable(uuid, uuid, date, date, text, uuid) IS
  'Per-mesthri commission accrued vs paid → payable. Scoped by site + optional collector + date window + optional contract ref. With a contract ref, paid counts only payouts tagged to that contract and untagged_paid reports legacy site-wide payouts (surfaced as a UI caveat, never subtracted — which contract they settled is unknowable).';

GRANT EXECUTE ON FUNCTION public.get_mesthri_commission_payable(uuid, uuid, date, date, text, uuid)
  TO authenticated, service_role;
```

- [ ] **Step 2: Dry-run and confirm existing 4-arg callers still work**

Run via `mcp__supabase__execute_sql` (confirm `get_project_url` first):

```sql
BEGIN;
-- paste the full migration body here
-- 4-arg call must still resolve via defaults (CommissionPayoutDialog site-wide mode):
SELECT collector_name, accrued, paid, payable, untagged_paid
FROM public.get_mesthri_commission_payable(
  (SELECT id FROM public.sites WHERE name ILIKE '%Padmavathy%' LIMIT 1)
);
ROLLBACK;
```

Expected: rows return, `untagged_paid` = 0 in site-wide mode. No "function does not exist" error.

- [ ] **Step 3: Update the hook**

In `src/hooks/queries/useMesthriCommissionPayable.ts`, add to `MesthriCommissionPayableRow`:

```ts
  /** Commission paid site-wide with no contract tag. Only set when a contract ref is
   *  passed; shown as a caveat, never subtracted from payable. */
  untaggedPaid: number;
```

Replace the signature and query with:

```ts
export function useMesthriCommissionPayable(
  siteId: string | null | undefined,
  collectorId: string | null = null,
  dateFrom: string | null = null,
  dateTo: string | null = null,
  contractRefKind: "task_work" | "subcontract" | null = null,
  contractRefId: string | null = null,
  enabled = true,
) {
  const supabase = createClient();
  return useQuery<MesthriCommissionPayableRow[]>({
    queryKey: [
      "mesthri-commission-payable", siteId, collectorId, dateFrom, dateTo,
      contractRefKind, contractRefId,
    ],
    enabled: Boolean(enabled && siteId),
    staleTime: 30_000,
    queryFn: async ({ signal }): Promise<MesthriCommissionPayableRow[]> => {
      const { data, error } = await withTimeout(
        Promise.resolve(
          (supabase as any)
            .rpc("get_mesthri_commission_payable", {
              p_site_id: siteId,
              p_collector_id: collectorId,
              p_date_from: dateFrom,
              p_date_to: dateTo,
              p_contract_ref_kind: contractRefKind,
              p_contract_ref_id: contractRefId,
            })
            .abortSignal(signal),
        ),
        TIMEOUTS.QUERY,
        "Mesthri commission payable query timed out. Please retry.",
      );
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        collectorId: String(r.collector_id ?? ""),
        collectorName: String(r.collector_name ?? "Unknown"),
        accrued: toNumber(r.accrued),
        paid: toNumber(r.paid),
        payable: toNumber(r.payable),
        crewDayCount: toNumber(r.crew_day_count),
        untaggedPaid: toNumber(r.untagged_paid),
      }));
    },
  });
}
```

- [ ] **Step 4: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors (existing callers pass ≤4 args and keep working via defaults).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260716120200_mesthri_commission_payable_by_contract.sql src/hooks/queries/useMesthriCommissionPayable.ts
git commit -m "feat(workforce): scope mesthri commission payable to a contract"
```

---

### Task 6: Tag commission payouts with their contract (write path)

**Files:**
- Modify: `src/lib/services/settlementService.ts:948-1014`
- Modify: `src/hooks/mutations/usePayMesthriCommission.ts`
- Modify: `src/components/workforce/CommissionPayoutDialog.tsx`

**Interfaces:**
- Consumes: `useMesthriCommissionPayable` (Task 5).
- Produces: `PayMesthriCommissionArgs.contractRefKind?: "task_work" | "subcontract"`, `.contractRefId?: string`; `CommissionPayoutDialog` props `contractRefKind?`, `contractRefId?`. Used by Task 7.

**Critical:** the payout sets `contract_ref_kind`/`contract_ref_id` but **must leave `contract_laborer_id` NULL**. The ledger's `paid` CTE keys on `contract_laborer_id IS NOT NULL`; setting it would count this commission as the mesthri's *own wages* paid, inflating `net_paid` and hiding real debt. (Task 3's `payment_type <> 'commission'` filter is the second, independent defence.)

- [ ] **Step 1: Thread the contract ref through the service**

In `src/lib/services/settlementService.ts`, add to the `payMesthriCommission` config object type (after `collectorName?: string;`):

```ts
    /** Tag the payout to the contract it was paid from, so per-contract commission
     *  owed is computable. Omit for a site-wide payout. */
    contractRefKind?: "task_work" | "subcontract";
    contractRefId?: string;
```

Replace the `idempotencyKey` block so two payouts of the same amount on the same day to the same mesthri from *different* contracts are not deduped into one:

```ts
    const contractTag = config.contractRefId ?? "site";
    const idempotencyKey = await deterministicSettlementKey({
      siteId: config.siteId,
      recordIds: [],
      amount: config.amount,
      paymentChannel: config.paymentChannel,
      date: paymentDate,
      extra: `commission:${config.collectorLaborerId}:${contractTag}:${paymentDate}`,
    });
```

Replace the follow-up update (currently at :1011-1014):

```ts
    // create_settlement_group doesn't know the commission columns — set them now.
    // contract_laborer_id stays NULL on purpose: get_contract_labor_ledger's paid CTE
    // keys on it, and a commission row there would be miscounted as own wages paid.
    await supabase
      .from("settlement_groups")
      .update({
        commission_collector_laborer_id: config.collectorLaborerId,
        ...(config.contractRefKind && config.contractRefId
          ? { contract_ref_kind: config.contractRefKind, contract_ref_id: config.contractRefId }
          : {}),
      })
      .eq("id", settlementGroupId);
```

- [ ] **Step 2: Thread it through the mutation**

In `src/hooks/mutations/usePayMesthriCommission.ts`, add to `PayMesthriCommissionArgs` after `collectorName?: string;`:

```ts
  contractRefKind?: "task_work" | "subcontract";
  contractRefId?: string;
```

Add to `onSuccess`, after the existing `contract-labor-ledger` invalidation:

```ts
      qc.invalidateQueries({ queryKey: ["contract-labor-ledger-weekly"] });
      qc.invalidateQueries({ queryKey: ["contract-payment-history"] });
```

- [ ] **Step 3: Thread it through the dialog**

In `src/components/workforce/CommissionPayoutDialog.tsx`, extend the props:

```ts
export default function CommissionPayoutDialog({
  open,
  onClose,
  siteId,
  collectorLaborerId,
  collectorName,
  contractRefKind,
  contractRefId,
}: {
  open: boolean;
  onClose: () => void;
  siteId: string;
  collectorLaborerId: string;
  collectorName: string;
  /** When set, the payout is tagged to this contract and the amount defaults to the
   *  contract's payable rather than the mesthri's whole-site pot. */
  contractRefKind?: "task_work" | "subcontract";
  contractRefId?: string;
}) {
```

Scope the payable lookup:

```ts
  const { data: payableRows } = useMesthriCommissionPayable(
    open ? siteId : null,
    collectorLaborerId,
    null,
    null,
    contractRefKind ?? null,
    contractRefId ?? null,
  );
```

Pass the tag on submit — add to the `payMut.mutateAsync({...})` object after `collectorName,`:

```ts
      contractRefKind,
      contractRefId,
```

Make the title say which scope is being paid, so it can't be misread:

```tsx
      <DialogTitle>
        Pay commission — {collectorName}
        <Typography variant="caption" color="text.secondary" component="div">
          Outstanding {contractRefId ? "on this contract" : "across this site"}:{" "}
          {formatCurrencyFull(payable)}
        </Typography>
      </DialogTitle>
```

- [ ] **Step 4: Verify it typechecks and nothing regressed**

Run: `npx tsc --noEmit && npm run test`
Expected: no type errors; full suite PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/settlementService.ts src/hooks/mutations/usePayMesthriCommission.ts src/components/workforce/CommissionPayoutDialog.tsx
git commit -m "feat(workforce): tag mesthri commission payouts to their contract"
```

---

### Task 7: Remaining-first mesthri strip

Replaces `Own labour ₹15,750 + commission ₹1,825 = ₹17,575` with the same shape the laborer rows already use: big remaining, small "paid of".

**Files:**
- Create: `src/components/workforce/MesthriPayStrip.tsx`
- Modify: `src/components/workforce/ContractLaborLedger.tsx`

**Interfaces:**
- Consumes: `computeMesthriStrip` (Task 1); `useContractLaborLedger` + `netTotal` (Task 3); `useMesthriCommissionPayable` + `untaggedPaid` (Task 5); `CommissionPayoutDialog` contract props (Task 6).
- Produces: `<MesthriPayStrip>` default export. Used by Task 8's container.

**Scope note:** the strip is always PROJECT-scoped, on every tab — it asks its own `useContractLaborLedger(kind, refId, null, null)`. On the Project tab that shares a query key with the container's query, so React Query dedupes it to zero extra cost; on Day/Week it's one cached extra query and stays correct even in a week the mesthri didn't work.

- [ ] **Step 1: Create the strip**

Create `src/components/workforce/MesthriPayStrip.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Box, Typography, Button, LinearProgress } from "@mui/material";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import { useContractLaborLedger, type ContractLedgerKind } from "@/hooks/queries/useContractLaborLedger";
import { useMesthriCommissionPayable } from "@/hooks/queries/useMesthriCommissionPayable";
import { computeMesthriStrip } from "@/lib/workforce/mesthriStripMath";
import { wsColors, wsRadius } from "@/lib/workforce/workspaceTokens";
import { formatCurrencyFull } from "@/lib/formatters";
import CommissionPayoutDialog from "./CommissionPayoutDialog";
import ContractLaborerPayDialog from "./ContractLaborerPayDialog";

const num = { fontVariantNumeric: "tabular-nums" as const };

/**
 * The mesthri's pay console for ONE contract: what is still owed (own wages +
 * commission) leading, the lifetime total demoted to a caption.
 *
 * Always PROJECT-scoped regardless of the panel's Day/Week/Project tab — payments only
 * ever have a project scope, so it asks for the unwindowed ledger itself. On the Project
 * tab that key matches the container's query and React Query dedupes it.
 */
export default function MesthriPayStrip({
  kind,
  refId,
  siteId,
  mesthriLaborerId,
  mesthriName,
  commissionApplies,
  canPay,
}: {
  kind: ContractLedgerKind;
  refId: string;
  siteId?: string;
  mesthriLaborerId?: string | null;
  mesthriName?: string | null;
  commissionApplies: boolean;
  canPay: boolean;
}) {
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [payOwnOpen, setPayOwnOpen] = useState(false);

  // Project-scoped on purpose (null window).
  const { data: project } = useContractLaborLedger(kind, refId, null, null);
  const mesthriRow = project?.rows.find((r) => r.isMesthri) ?? null;
  const effectiveMesthriId = mesthriLaborerId ?? mesthriRow?.laborerId ?? null;
  const displayName = mesthriName ?? project?.mesthriName ?? null;

  const { data: payableRows } = useMesthriCommissionPayable(
    siteId ?? null,
    effectiveMesthriId,
    null,
    null,
    kind,
    refId,
  );
  const payable = payableRows?.[0];

  if (!displayName) return null;

  const view = computeMesthriStrip({
    ownNet: mesthriRow?.netTotal ?? 0,
    ownPaid: mesthriRow?.netPaid ?? 0,
    commissionAccrued: payable?.accrued ?? 0,
    commissionPaid: payable?.paid ?? 0,
    untaggedCommissionPaid: payable?.untaggedPaid ?? 0,
    commissionApplies,
  });

  return (
    <Box
      sx={{
        px: 1.5,
        py: 1.25,
        borderRadius: `${wsRadius.input}px`,
        bgcolor: view.isSettled ? wsColors.greenBg : wsColors.primaryTint,
        border: `1px solid ${view.isSettled ? wsColors.green : wsColors.primary}22`,
      }}
    >
      <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: wsColors.muted, textTransform: "uppercase", letterSpacing: ".04em" }}>
        Mesthri {displayName} · this contract
      </Typography>

      {view.isSettled ? (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 0.5 }}>
          <CheckCircleRounded sx={{ fontSize: 20, color: wsColors.green }} />
          <Typography sx={{ fontSize: 14, fontWeight: 800, color: wsColors.green, ...num }}>
            All settled · {formatCurrencyFull(view.totalEarned)} paid
          </Typography>
        </Box>
      ) : (
        <>
          <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 1, mt: 0.5 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 800, color: wsColors.muted, textTransform: "uppercase", letterSpacing: ".04em" }}>
              Still to pay
            </Typography>
            <Typography sx={{ fontSize: 20, fontWeight: 900, color: wsColors.ink, ...num }}>
              {formatCurrencyFull(view.stillToPay)}
            </Typography>
          </Box>

          <Typography sx={{ fontSize: 12, color: wsColors.ink2, ...num }}>
            Own wages {formatCurrencyFull(view.ownRemaining)}
            {commissionApplies ? <> · Commission {formatCurrencyFull(view.commissionRemaining)}</> : null}
          </Typography>

          <LinearProgress
            variant="determinate"
            value={view.pctPaid}
            sx={{
              mt: 0.75, height: 5, borderRadius: 3, bgcolor: "#ffffff",
              "& .MuiLinearProgress-bar": { bgcolor: wsColors.primary, borderRadius: 3 },
            }}
          />
          <Typography sx={{ fontSize: 11, color: wsColors.muted, mt: 0.4, ...num }}>
            {formatCurrencyFull(view.totalPaid)} paid of {formatCurrencyFull(view.totalEarned)}
          </Typography>
        </>
      )}

      {view.untaggedNote > 0 && (
        <Typography sx={{ fontSize: 11, color: "#8a5a00", bgcolor: "#fff3d6", borderRadius: 1, px: 0.75, py: 0.5, mt: 0.75 }}>
          ⚠ {formatCurrencyFull(view.untaggedNote)} commission paid to {displayName} site-wide
          earlier, not tagged to a contract — not counted above.
        </Typography>
      )}

      {canPay && !view.isSettled && (
        <Box sx={{ display: "flex", gap: 1, mt: 0.75, flexWrap: "wrap" }}>
          {mesthriRow && view.ownRemaining > 0 && (
            <Button
              size="small"
              variant="outlined"
              onClick={() => setPayOwnOpen(true)}
              sx={{ textTransform: "none", fontWeight: 700, py: 0.25 }}
            >
              Pay own wages {formatCurrencyFull(view.ownRemaining)}
            </Button>
          )}
          {effectiveMesthriId && commissionApplies && view.commissionRemaining > 0 && (
            <Button
              size="small"
              variant="text"
              onClick={() => setPayoutOpen(true)}
              sx={{ textTransform: "none", fontWeight: 700, color: wsColors.primary, py: 0.25 }}
            >
              Pay commission {formatCurrencyFull(view.commissionRemaining)}
            </Button>
          )}
        </Box>
      )}

      {payoutOpen && siteId && effectiveMesthriId && (
        <CommissionPayoutDialog
          open={payoutOpen}
          onClose={() => setPayoutOpen(false)}
          siteId={siteId}
          collectorLaborerId={effectiveMesthriId}
          collectorName={displayName}
          contractRefKind={kind}
          contractRefId={refId}
        />
      )}

      {payOwnOpen && siteId && mesthriRow && (
        <ContractLaborerPayDialog
          open={payOwnOpen}
          onClose={() => setPayOwnOpen(false)}
          siteId={siteId}
          kind={kind}
          refId={refId}
          laborerId={mesthriRow.laborerId}
          laborerName={mesthriRow.laborerName}
          amountOwed={view.ownRemaining}
          dateFrom={null}
          dateTo={null}
          windowLabel="in total"
        />
      )}
    </Box>
  );
}
```

- [ ] **Step 2: Wire it in, and default the panel to Project**

In `src/components/workforce/ContractLaborLedger.tsx`:

Replace the `windowFor` helper (lines 19-30) so week math comes from the shared helper:

```ts
import { weekStartStr, weekEndStr } from "@/lib/utils/weekUtils";

/** Compute the [from, to] window for a period. Project = whole lifetime (null bounds). */
function windowFor(period: Period): { from: string | null; to: string | null } {
  if (period === "project") return { from: null, to: null };
  if (period === "day") {
    const d = dayjs().format("YYYY-MM-DD");
    return { from: d, to: d };
  }
  return { from: weekStartStr(dayjs()), to: weekEndStr(dayjs()) };
}
```

Change the default period (line 46):

```ts
  defaultPeriod = "project",
```

Delete the inline mesthri console block (lines 135-183) and the now-unused `payoutOpen` state, `mesthriOwn`/`mesthriTotal`/`totalCommission` locals, and the `CommissionPayoutDialog` block (lines 185-193). Replace the console with:

```tsx
      {commissionEnabled && siteId && (
        <MesthriPayStrip
          kind={kind}
          refId={refId}
          siteId={siteId}
          mesthriLaborerId={mesthriLaborerId}
          mesthriName={mesthriName}
          commissionApplies={commissionApplies}
          canPay={canPay}
        />
      )}
```

Add the import:

```ts
import MesthriPayStrip from "./MesthriPayStrip";
```

- [ ] **Step 3: Verify it builds and the app renders**

Run: `npx tsc --noEmit && npm run test`
Expected: no type errors; suite PASS. (Remove any now-unused imports `tsc` flags.)

- [ ] **Step 4: See it in the real app**

Ensure nothing else owns port 3000 (a second `next dev` or a concurrent `npm run build` corrupts `.next` and serves 404 chunks), then `npm run dev:cloud`.

Via Playwright MCP: navigate to `http://localhost:3000/dev-login`, then `/site/trades`, open the **WaterTank** package under *Water tank roof*.
Expected: the panel opens on **Project**; the strip leads with **STILL TO PAY ₹7,775**, shows `Own wages ₹5,950 · Commission ₹1,825`, and captions `₹9,800 paid of ₹17,575`. Take a screenshot; check console is clean.

**Save screenshots to the scratchpad, never the repo** — a prior session clobbered tracked files this way.

- [ ] **Step 5: Commit**

```bash
git add src/components/workforce/MesthriPayStrip.tsx src/components/workforce/ContractLaborLedger.tsx
git commit -m "feat(workforce): remaining-first mesthri strip, default to Project"
```

---

### Task 8: Week tab — every week, newest first

**Files:**
- Create: `src/components/workforce/ContractLedgerWeekList.tsx`
- Modify: `src/components/workforce/ContractLaborLedger.tsx`

**Interfaces:**
- Consumes: `useContractLaborLedgerWeekly` (Task 4); `groupRowsByWeek` (Task 2).
- Produces: `<ContractLedgerWeekList>` default export.

**Copy rule:** a week's earnings say "earned"; the row's remaining says **"owed in total"**. The Pay button settles the project (as it always has), so the figure beside it must never read as weekly.

- [ ] **Step 1: Create the week list**

Create `src/components/workforce/ContractLedgerWeekList.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { Box, Typography, Skeleton, Button, Collapse } from "@mui/material";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import { useContractLaborLedgerWeekly } from "@/hooks/queries/useContractLaborLedgerWeekly";
import { groupRowsByWeek, type WeeklyLedgerRow } from "@/lib/workforce/ledgerWeeks";
import type { ContractLedgerKind } from "@/hooks/queries/useContractLaborLedger";
import { wsColors, wsRadius } from "@/lib/workforce/workspaceTokens";
import { formatCurrencyFull } from "@/lib/formatters";

const num = { fontVariantNumeric: "tabular-nums" as const };
const INITIAL_WEEKS = 4;

/**
 * Every week the crew worked this contract, newest first — wages are paid weekly, so
 * each past week is its own event.
 *
 * A week shows what was EARNED in it. Remaining is project-scoped (payments are never
 * recorded against a week) and is captioned "owed in total" so it cannot be misread.
 */
export default function ContractLedgerWeekList({
  kind,
  refId,
  canPay,
  onPay,
}: {
  kind: ContractLedgerKind;
  refId: string;
  canPay: boolean;
  onPay: (row: WeeklyLedgerRow) => void;
}) {
  const { data, isLoading } = useContractLaborLedgerWeekly(kind, refId);
  const weeks = useMemo(() => groupRowsByWeek(data ?? []), [data]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [shown, setShown] = useState(INITIAL_WEEKS);

  // Newest week open by default, without fighting the user's later choices.
  const openWeek = expanded ?? weeks[0]?.weekStart ?? null;

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
        {[0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={52} />)}
      </Box>
    );
  }

  if (weeks.length === 0) {
    return (
      <Box sx={{ py: 3, textAlign: "center" }}>
        <Typography sx={{ fontSize: 13, color: wsColors.muted }}>
          No company laborers on this contract yet.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
      {weeks.slice(0, shown).map((w) => {
        const isOpen = openWeek === w.weekStart;
        return (
          <Box key={w.weekStart} sx={{ borderRadius: `${wsRadius.row}px`, border: `1px solid ${wsColors.hairline}`, overflow: "hidden" }}>
            <Box
              role="button"
              tabIndex={0}
              onClick={() => setExpanded(isOpen ? "" : w.weekStart)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setExpanded(isOpen ? "" : w.weekStart); }}
              sx={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                gap: 1, px: 1.25, py: 0.9, cursor: "pointer", bgcolor: wsColors.surface,
                "&:hover": { bgcolor: wsColors.primaryTint },
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 0 }}>
                <ExpandMoreRounded
                  sx={{ fontSize: 18, color: wsColors.muted, transform: isOpen ? "none" : "rotate(-90deg)", transition: "transform .15s" }}
                />
                <Typography sx={{ fontSize: 13, fontWeight: 700, color: wsColors.ink }} noWrap>
                  {w.label}
                </Typography>
              </Box>
              <Typography sx={{ fontSize: 13.5, fontWeight: 800, color: wsColors.ink, flexShrink: 0, ...num }}>
                {formatCurrencyFull(w.totalNet)}{" "}
                <Box component="span" sx={{ fontSize: 11, fontWeight: 600, color: wsColors.muted }}>earned</Box>
              </Typography>
            </Box>

            <Collapse in={isOpen} unmountOnExit>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, px: 1, pb: 1, pt: 0.25 }}>
                {w.rows.map((r) => {
                  const settled = r.netUnpaid <= 0.5 && r.netTotal > 0;
                  return (
                    <Box
                      key={r.laborerId}
                      sx={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        gap: 1, px: 1, py: 0.75, borderRadius: `${wsRadius.row}px`,
                        bgcolor: r.isMesthri ? wsColors.primaryTint : "transparent",
                      }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontSize: 13, fontWeight: 700, color: wsColors.ink }} noWrap>
                          {r.laborerName}
                        </Typography>
                        <Typography sx={{ fontSize: 11.5, color: wsColors.muted, ...num }} noWrap>
                          {r.roleName} · {r.manDays} day{r.manDays === 1 ? "" : "s"} · earned {formatCurrencyFull(r.net)}
                        </Typography>
                      </Box>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
                        <Box sx={{ textAlign: "right" }}>
                          <Typography sx={{ fontSize: 13.5, fontWeight: 800, color: settled ? wsColors.green : wsColors.ink, ...num }}>
                            {settled ? formatCurrencyFull(r.netTotal) : formatCurrencyFull(r.netUnpaid)}
                          </Typography>
                          <Typography sx={{ fontSize: 10.5, color: wsColors.muted, ...num }}>
                            {settled ? "paid in total" : "owed in total"}
                          </Typography>
                        </Box>
                        {canPay && (settled ? (
                          <CheckCircleRounded sx={{ fontSize: 18, color: wsColors.green }} />
                        ) : (
                          <Button
                            size="small"
                            variant="contained"
                            onClick={() => onPay(r)}
                            sx={{ textTransform: "none", fontWeight: 700, py: 0.15, minWidth: 0, px: 1 }}
                          >
                            Pay
                          </Button>
                        ))}
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            </Collapse>
          </Box>
        );
      })}

      {weeks.length > shown && (
        <Button
          size="small"
          onClick={() => setShown((n) => n + INITIAL_WEEKS)}
          sx={{ textTransform: "none", fontWeight: 700, color: wsColors.primary, alignSelf: "center", mt: 0.5 }}
        >
          Load earlier weeks
        </Button>
      )}
    </Box>
  );
}
```

- [ ] **Step 2: Render it on the Week tab**

In `src/components/workforce/ContractLaborLedger.tsx`, import:

```ts
import ContractLedgerWeekList from "./ContractLedgerWeekList";
import type { WeeklyLedgerRow } from "@/lib/workforce/ledgerWeeks";
```

Skip the windowed ledger query while the Week tab is showing (the week list has its own):

```ts
  const { data, isLoading } = useContractLaborLedger(kind, refId, from, to, period !== "week");
```

Branch the rows region. The existing structure is:

```tsx
      {/* Rows */}
      {isLoading ? (
        …skeletons…
      ) : crewRows.length === 0 ? (
        …empty state…
      ) : (
        …rows + totals footer…
      )}
```

Add **one new branch in front of it**, leaving all three existing branches exactly as they are. Change only the opening line `{isLoading ? (` to:

```tsx
      {/* Rows */}
      {period === "week" ? (
        <ContractLedgerWeekList
          kind={kind}
          refId={refId}
          canPay={canPay}
          onPay={(r: WeeklyLedgerRow) =>
            setPayLaborer({
              laborerId: r.laborerId, laborerName: r.laborerName, roleName: r.roleName,
              manDays: r.manDays, dayCount: r.dayCount, gross: r.gross,
              commission: r.commission, net: r.net, netTotal: r.netTotal,
              netPaid: r.netPaid, netUnpaid: r.netUnpaid, isMesthri: r.isMesthri,
            })
          }
        />
      ) : isLoading ? (
```

The rest of the block (skeletons / empty / rows / footer / closing `)}`) is untouched.

Three copy fixes in that untouched block, now that paid/remaining are project-scoped on **every** tab (Task 3) and the Day tab would otherwise imply they are today's:

1. Line ~273: `? "paid"` → `? "paid in total"`
2. Line ~276: `: "owed"` → `: "owed in total"`
3. Line ~320, the totals footer label:

```tsx
              {commissionEnabled ? "Still owed to laborers in total" : "Total earned"}
```

Leave the `${r.netPaid} paid of ${r.net}` caption on line 275 alone **only if** you change `r.net` to `r.netTotal` — mixing windowed `net` with project `netPaid` is the exact bug Task 3 fixed:

```tsx
                            ? `${formatCurrencyFull(r.netPaid)} paid of ${formatCurrencyFull(r.netTotal)}`
```

Same for the paid-state figure on line 269 (`formatCurrencyFull(r.net)` → `formatCurrencyFull(r.netTotal)`) and the `paid` boolean on line 227:

```tsx
            const paid = r.netUnpaid <= 0.5 && r.netTotal > 0;
```

And in the totals footer, `data?.totalNet` is a windowed sum while `data?.totalNetPaid` is project-scoped — on the Day tab that pairing lies. Use the project-scoped total instead (line ~330):

```tsx
                  {formatCurrencyFull(data?.totalNetPaid ?? 0)} paid of {formatCurrencyFull(data?.totalNetTotal ?? 0)}
```

(`totalNetTotal` was added to the hook in Task 3 Step 3.)

- [ ] **Step 3: Verify it builds**

Run: `npx tsc --noEmit && npm run test`
Expected: no type errors; suite PASS.

- [ ] **Step 4: See the weeks in the real app**

With `npm run dev:cloud` running, via Playwright MCP open `/site/trades` → **WaterTank** → click **Week**.
Expected: several weeks listed newest-first, each `Sun D MMM – Sat D MMM` with `₹N earned`; newest expanded; older collapsed; each laborer reads `… · earned ₹N` on the left and `₹N owed in total` on the right. Console clean. Screenshot to the scratchpad.

- [ ] **Step 5: Commit**

```bash
git add src/components/workforce/ContractLedgerWeekList.tsx src/components/workforce/ContractLaborLedger.tsx
git commit -m "feat(workforce): list every week separately on the Week tab"
```

---

### Task 9: End-to-end verification

**Files:** none modified — this task only observes.

- [ ] **Step 1: Full suite + production build**

Run: `npm run test && npm run build`
Expected: all tests PASS; build completes with no errors.
**Stop `next dev` first** — a concurrent build corrupts the shared `.next` and serves 400/404 chunks.

- [ ] **Step 2: Prove the strip against the database, not just the screen**

Via `mcp__supabase__execute_sql` (verify `get_project_url` = `ocutbpoaibjxtyjkrnda` first) — read-only, no transaction needed:

```sql
SELECT laborer_name, net_total, net_paid, net_unpaid, is_mesthri
FROM public.get_contract_labor_ledger('task_work', '<WaterTank package id>', NULL, NULL)
WHERE is_mesthri;
```

Expected: `net_total − net_paid = net_unpaid`, and that `net_unpaid` equals the strip's "Own wages" figure on screen.

- [ ] **Step 3: Confirm the double-count guard actually holds**

This is the failure that would silently hide real debt, so verify it rather than trusting it:

```sql
SELECT id, payment_type, contract_ref_kind, contract_ref_id, contract_laborer_id
FROM public.settlement_groups
WHERE payment_type = 'commission' AND contract_ref_id IS NOT NULL;
```

Expected: every row has `contract_laborer_id IS NULL`. If any row has it set, the ledger is counting a commission payout as own wages — stop and fix Task 6 Step 1.

- [ ] **Step 4: Record a real commission payout and watch the strip move**

**Ask the user before this step — it writes money to production.** On WaterTank, click `Pay commission ₹1,825`, confirm the dialog says "Outstanding **on this contract**", record it.
Expected: the strip's `Still to pay` drops by exactly that amount, `Commission` goes to ₹0, `paid of` rises, and **no laborer's owed figure changes** (proving the guard). If the user declines, note that this step is unverified rather than claiming it passed.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix(workforce): address verification findings"
```

(Skip if nothing needed fixing.)

---

## Notes for the implementer

- **Do not apply migrations to prod.** They ship at "move to prod", schema-first, per `CLAUDE.md`.
- `mcp__supabase-prod__*` is a **different application**. Aesta prod is plain `mcp__supabase__*`. Always `get_project_url` first.
- There is no Aesta staging database and `db:reset` is currently broken — `BEGIN; … ROLLBACK;` on prod is the validation route.
- Uncommitted work from a prior session is in the tree (`spendDetailHelpers`, `RemoveContractPaymentDialog`, two `20260716*` migrations). Stage only the files each task names.
