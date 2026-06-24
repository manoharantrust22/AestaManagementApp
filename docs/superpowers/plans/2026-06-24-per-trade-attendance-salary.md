# Per-trade Attendance + Salary — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let every workspace-trade (Painting, Electrical, …) run its own per-labourer daily attendance + wage settlement, exactly like Civil — separate per trade.

**Architecture:** Each workspace-trade gets a lazily-created `{Trade} — In-house` **detailed** contract (mirrors Civil's `is_in_house` one). The existing site-wide per-labourer attendance + settlement flow is made **trade-scoped** (reused, not rebuilt): when opened for a detailed contract it shows only that trade's labourers (`laborers.category_id = trade` ∪ anyone with existing attendance under that contract) and tags new rows to that contract. Scoping is applied **client-side** (the server fetch already joins `laborers.category_id`), keeping server changes to zero.

**Tech Stack:** Next.js 15 (App Router), Supabase (Postgres + RLS), React Query, MUI v7, Vitest. Supabase writes use `supabase as any` casts (generated types are intentionally not regenerated).

## Global Constraints

- Migrations: filename `YYYYMMDDHHMMSS_slug.sql`; apply to prod via `mcp__supabase__apply_migration` BEFORE pushing code; schema-first.
- New SQL functions: `SECURITY DEFINER` + `SET search_path TO 'public'` (avoids the `function_search_path_mutable` lint); `GRANT EXECUTE … TO authenticated`.
- New SQL views (if any): `WITH (security_invoker = true)`.
- Supabase client calls in hooks: `const supabase: any = createClient()` then `.rpc(...)`/`.from(...)`.
- Money/identity rule: a move/creation must never change amounts; the in-house resolver is idempotent (one row per site+trade).
- Civil's existing behaviour and data must not regress — the labourer-scope rule's "∪ historically-attended" clause is mandatory, not optional.
- Reuse, don't duplicate: do NOT build a second per-labourer UI; scope the existing one.
- Verify before claiming done: `npx tsc --noEmit` clean on source files (the 4 pre-existing `*.test.tsx` errors are known — ignore only those); affected vitest green; live Playwright check on prod data with any test writes reversed.
- Spec: `docs/superpowers/specs/2026-06-24-per-trade-attendance-salary-design.md`.

---

### Task 1: `ensure_trade_in_house_contract` RPC + hook

**Files:**
- Create: `supabase/migrations/20260624120000_trade_in_house_contract.sql`
- Create: `src/hooks/queries/useTradeInHouseContract.ts`

**Interfaces:**
- Produces (SQL): `ensure_trade_in_house_contract(p_site_id uuid, p_trade_category_id uuid) RETURNS uuid` — returns the existing/created in-house contract id.
- Produces (TS): `useEnsureTradeInHouseContract(siteId): { mutateAsync: (tradeCategoryId: string) => Promise<string> }`.

- [ ] **Step 1: Write the migration.** Model the body on the Civil in-house creation in `supabase/migrations/20260502120000_add_trade_dimension.sql` (the `INSERT INTO public.subcontracts (… is_in_house, labor_tracking_mode='detailed' …)` block). Resolve the trade name for the title from `labor_categories`.

```sql
-- Lazy, idempotent in-house DETAILED contract per (site, trade). The trade's own day-to-day
-- labour records attendance + settles wages against this contract — exactly like Civil's
-- "Civil — In-house". is_in_house=true exempts the contract_party_check (no team/laborer needed).
CREATE OR REPLACE FUNCTION public.ensure_trade_in_house_contract(
  p_site_id            uuid,
  p_trade_category_id  uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id    uuid;
  v_name  text;
BEGIN
  -- Reuse the existing in-house contract for this site+trade if present.
  SELECT id INTO v_id
    FROM public.subcontracts
   WHERE site_id = p_site_id
     AND trade_category_id = p_trade_category_id
     AND is_in_house = true
   LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  SELECT name INTO v_name FROM public.labor_categories WHERE id = p_trade_category_id;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Trade % not found', p_trade_category_id;
  END IF;

  INSERT INTO public.subcontracts (
    id, site_id, trade_category_id, contract_type, title,
    is_in_house, labor_tracking_mode, status, total_value, is_rate_based
  ) VALUES (
    gen_random_uuid(), p_site_id, p_trade_category_id, 'mesthri', v_name || ' — In-house',
    true, 'detailed', 'active', 0, false
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.ensure_trade_in_house_contract(uuid, uuid) IS
  'Idempotent: returns the {trade} in-house DETAILED contract for a site, creating it on first use. Drives per-trade attendance + salary.';

GRANT EXECUTE ON FUNCTION public.ensure_trade_in_house_contract(uuid, uuid) TO authenticated;
```

- [ ] **Step 2: Apply to prod + verify idempotency (read-safe).** Apply via `mcp__supabase__apply_migration` (name `trade_in_house_contract`). Then verify Civil returns its EXISTING contract (no new row) and the function is idempotent:

Run (MCP `execute_sql`):
```sql
-- Civil for a known site → must return the existing 'Civil — In-house' id, twice the same:
WITH c AS (SELECT id AS civil FROM public.labor_categories WHERE name='Civil' LIMIT 1),
     s AS (SELECT site_id FROM public.subcontracts WHERE is_in_house AND title LIKE 'Civil%' LIMIT 1)
SELECT public.ensure_trade_in_house_contract((SELECT site_id FROM s),(SELECT civil FROM c)) AS a,
       public.ensure_trade_in_house_contract((SELECT site_id FROM s),(SELECT civil FROM c)) AS b;
```
Expected: `a = b` and both equal the existing Civil in-house id (no new contract created).

- [ ] **Step 3: Write the hook.**

```typescript
// src/hooks/queries/useTradeInHouseContract.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

/** Resolve (creating on first use) the {Trade} — In-house DETAILED contract for a site.
 *  Drives per-trade attendance + salary. Idempotent server-side. */
export function useEnsureTradeInHouseContract(siteId: string | undefined) {
  const supabase: any = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tradeCategoryId: string): Promise<string> => {
      const { data, error } = await supabase.rpc("ensure_trade_in_house_contract", {
        p_site_id: siteId,
        p_trade_category_id: tradeCategoryId,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trades", "site", siteId] });
    },
  });
}
```

- [ ] **Step 4: Typecheck.** Run: `npx tsc --noEmit 2>&1 | grep -E "useTradeInHouseContract" || echo OK`. Expected: `OK`.

- [ ] **Step 5: Commit.**
```bash
git add supabase/migrations/20260624120000_trade_in_house_contract.sql src/hooks/queries/useTradeInHouseContract.ts
git commit -m "feat(workforce): lazy {trade} in-house detailed contract resolver (RPC + hook)"
```

---

### Task 2: Pure labourer-scope selector + unit test

**Files:**
- Create: `src/lib/workforce/laborerScope.ts`
- Test: `src/lib/workforce/laborerScope.test.ts`

**Interfaces:**
- Produces: `scopedLaborerIds(input: { laborers: {id:string; category_id:string|null}[]; tradeCategoryId: string; historicallyAttendedIds: string[] }): Set<string>` — ids to show for a trade's attendance = `category_id === tradeCategoryId` ∪ `historicallyAttendedIds`.
- Produces: `isLaborerInTradeScope(scope: Set<string>, laborerId: string): boolean`.

- [ ] **Step 1: Write the failing test.**
```typescript
// src/lib/workforce/laborerScope.test.ts
import { describe, it, expect } from "vitest";
import { scopedLaborerIds, isLaborerInTradeScope } from "./laborerScope";

const labs = [
  { id: "a", category_id: "civil" },
  { id: "b", category_id: "paint" },
  { id: "c", category_id: null },
  { id: "d", category_id: "paint" },
];

describe("laborerScope", () => {
  it("includes labourers of the trade", () => {
    const s = scopedLaborerIds({ laborers: labs, tradeCategoryId: "paint", historicallyAttendedIds: [] });
    expect([...s].sort()).toEqual(["b", "d"]);
  });
  it("unions historically-attended labourers (even of other/blank trades) so none disappear", () => {
    const s = scopedLaborerIds({ laborers: labs, tradeCategoryId: "paint", historicallyAttendedIds: ["c", "a"] });
    expect([...s].sort()).toEqual(["a", "b", "c", "d"]);
  });
  it("isLaborerInTradeScope reflects membership", () => {
    const s = scopedLaborerIds({ laborers: labs, tradeCategoryId: "civil", historicallyAttendedIds: [] });
    expect(isLaborerInTradeScope(s, "a")).toBe(true);
    expect(isLaborerInTradeScope(s, "b")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, verify it fails.** Run: `npx vitest run src/lib/workforce/laborerScope.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement.**
```typescript
// src/lib/workforce/laborerScope.ts
/** Which labourers a trade's per-labourer attendance lists: the trade's own labourers
 *  (laborers.category_id = trade) UNION anyone who already has attendance under that
 *  trade's in-house contract — so historical labourers never silently disappear. */
export function scopedLaborerIds(input: {
  laborers: { id: string; category_id: string | null }[];
  tradeCategoryId: string;
  historicallyAttendedIds: string[];
}): Set<string> {
  const set = new Set<string>(input.historicallyAttendedIds);
  for (const l of input.laborers) {
    if (l.category_id === input.tradeCategoryId) set.add(l.id);
  }
  return set;
}

export function isLaborerInTradeScope(scope: Set<string>, laborerId: string): boolean {
  return scope.has(laborerId);
}
```

- [ ] **Step 4: Run tests, verify pass.** Run: `npx vitest run src/lib/workforce/laborerScope.test.ts`. Expected: PASS (3 tests).

- [ ] **Step 5: Commit.**
```bash
git add src/lib/workforce/laborerScope.ts src/lib/workforce/laborerScope.test.ts
git commit -m "feat(workforce): pure labourer-scope selector (trade ∪ historically-attended)"
```

---

### Task 3: Resolve the active trade scope on `/site/attendance`

**Files:**
- Modify: `src/app/(main)/site/attendance/attendance-content.tsx` (the `TradeChipSelection` block, ~lines 336–359, and where `attendanceRecords` + the labourer roster are consumed)
- Reference: `src/lib/data/attendance.ts` (already selects `laborers(... category_id ...)` and `subcontract_id` on each row — no change)

**Interfaces:**
- Consumes: `scopedLaborerIds` (Task 2); the page already reads `searchParams.get("contractId")`.
- Produces: a resolved `tradeScope: { contractId: string; tradeCategoryId: string; laborerIds: Set<string> } | null` available to the default per-labourer view + drawer.

- [ ] **Step 1:** At the seam where the page reads `contractId` (the `TradeChipSelection` initialiser, ~line 336), additionally look up the contract's `trade_category_id` + `labor_tracking_mode`. Use a small query hook (add to `src/hooks/queries/useTrades.ts` or inline): `useSubcontractMeta(contractId)` selecting `id, trade_category_id, labor_tracking_mode, is_in_house` from `subcontracts`. Only build a `tradeScope` when `labor_tracking_mode === 'detailed'`.

- [ ] **Step 2:** Compute `historicallyAttendedIds` = distinct `laborer_id` from the already-fetched `attendanceRecords` where `subcontract_id === contractId`. Then `laborerIds = scopedLaborerIds({ laborers: <distinct {id,category_id} from attendanceRecords + the roster>, tradeCategoryId, historicallyAttendedIds })`.

- [ ] **Step 3:** Filter the **displayed** `attendanceRecords` (and the day's per-labourer summary) to `laborerIds` when `tradeScope` is set. Civil's in-house contract flows through this same path (scoped to Civil). When `tradeScope` is null (no contractId / non-detailed), behaviour is unchanged (all site labourers).

- [ ] **Step 4: Typecheck + existing attendance tests.** Run: `npx tsc --noEmit 2>&1 | grep -E "attendance-content" || echo OK` → `OK`. Run any `attendance` vitest: `npx vitest run src/ -t attendance` (expect no new failures).

- [ ] **Step 5: Commit.**
```bash
git add "src/app/(main)/site/attendance/attendance-content.tsx" src/hooks/queries/useTrades.ts
git commit -m "feat(attendance): scope the per-labourer view to a detailed contract's trade"
```

---

### Task 4: Scope the attendance labourer roster (AttendanceDrawer)

**Files:**
- Modify: `src/components/attendance/AttendanceDrawer.tsx` (the "all active labourers" query, ~line 578: `.from("laborers").select(...).eq("status","active").order("name")`)

**Interfaces:**
- Consumes: the `tradeScope.laborerIds` from Task 3 (pass as a prop `scopeLaborerIds?: Set<string>` into the drawer), and `tradeScope.contractId` (the subcontract to tag new rows with).

- [ ] **Step 1:** Thread `scopeLaborerIds?: Set<string>` and `defaultSubcontractId?: string` props from `attendance-content.tsx` into `AttendanceDrawer`.

- [ ] **Step 2:** After the existing `.from("laborers")...eq("status","active")` fetch returns, filter the roster to `scopeLaborerIds` when provided (`list.filter(l => scopeLaborerIds.has(l.id))`). Leave unfiltered when the prop is absent (Civil default page with no contract — unchanged).

- [ ] **Step 3:** When writing a new `daily_attendance` row in a scoped context, set `subcontract_id = defaultSubcontractId` (so the row rolls up to the trade's in-house contract). Find the existing insert payload in `AttendanceDrawer` and set `subcontract_id` from the prop (it currently sets it from `wholeContract ? scopedContractId : null`).

- [ ] **Step 4: Typecheck.** Run: `npx tsc --noEmit 2>&1 | grep -E "AttendanceDrawer" || echo OK` → `OK`.

- [ ] **Step 5: Commit.**
```bash
git add src/components/attendance/AttendanceDrawer.tsx "src/app/(main)/site/attendance/attendance-content.tsx"
git commit -m "feat(attendance): roster + write scoped to the trade's in-house contract"
```

---

### Task 5: Scope the settlement (payments) flow

**Files:**
- Modify: `src/app/(main)/site/payments/payments-content.tsx` (the `TradeChipSelection` block, ~lines 220–234, and the settlement list/waterfall data consumers)
- Reference: `src/lib/services/settlementService.ts` (settlement queries — scope the labourer list the same way)

**Interfaces:**
- Consumes: `scopedLaborerIds` (Task 2); same `useSubcontractMeta(contractId)` as Task 3.

- [ ] **Step 1:** Mirror Task 3 on the payments page: when `?contractId=` resolves to a `detailed` contract, build the same `tradeScope` (contractId, tradeCategoryId, laborerIds = trade ∪ historically-settled-under-contract from the fetched settlements/payments).

- [ ] **Step 2:** Filter the settlement waterfall / labourer rows to `laborerIds`; tag new `settlement_groups` / `labor_payments` with `subcontract_id = contractId`. (The default Civil tabs already write to the in-house contract; reuse that path, just scoped.)

- [ ] **Step 3: Typecheck + existing payments/settlement tests.** Run: `npx tsc --noEmit 2>&1 | grep -E "payments-content|settlementService" || echo OK` → `OK`; `npx vitest run src/ -t settlement` (expect no new failures).

- [ ] **Step 4: Commit.**
```bash
git add "src/app/(main)/site/payments/payments-content.tsx" src/lib/services/settlementService.ts
git commit -m "feat(payments): scope per-labourer settlement to a detailed contract's trade"
```

---

### Task 6: Per-trade entry points (ensure-and-deep-link)

**Files:**
- Modify: `src/components/workforce/WorkspaceLayout.tsx` and/or `src/components/workforce/ContractTree.tsx` (trade header) + `src/components/workforce/RecordDrawer.tsx`
- Consumes: `useEnsureTradeInHouseContract` (Task 1), `buildContractScopeHref` (`src/lib/workforce/contractScope.ts`)

**Interfaces:**
- Produces: a per-workspace-trade "Attendance" + "Settle salary" affordance that calls `ensureTradeInHouseContract(tradeCategoryId)` → gets `contractId` → `router.push(buildContractScopeHref("/site/attendance" | "/site/payments", { id: contractId, mode: "detailed", isInHouse: true, tradeCategoryId, tradeName }))`.

- [ ] **Step 1:** Add the affordance only for trades with `hasWorkspace` (Phase-1 flag, already on `WorkspaceTask`/`TradeCategory`). Place it on the trade header in `ContractTree` (next to the trade's "+"), or as an empty-state CTA when a workspace-trade has no in-house contract yet. Civil already has its in-house contract → the action resolves to it (no new row).

- [ ] **Step 2:** Wire the click: `const contractId = await ensureTradeInHouseContract.mutateAsync(tradeCategoryId); router.push(buildContractScopeHref(base, { id: contractId, mode: "detailed", isInHouse: true, tradeCategoryId, tradeName }));`. Confirm `buildContractScopeHref` sends in-house detailed to `/site/attendance?contractId=` (Task 3 makes that page trade-scope itself).

- [ ] **Step 3: Typecheck.** Run: `npx tsc --noEmit | grep -E "ContractTree|WorkspaceLayout|RecordDrawer" || echo OK` → `OK`.

- [ ] **Step 4: Commit.**
```bash
git add src/components/workforce/
git commit -m "feat(workforce): per-trade Attendance + Settle-salary entry (ensure in-house contract + deep-link)"
```

---

### Task 7: Data check + live verification + ship

**Files:** none (verification only)

- [ ] **Step 1: Read-only data check** (MCP `execute_sql`) — labourers that would drop off Civil's list:
```sql
SELECT
  count(*) FILTER (WHERE category_id IS NULL) AS uncategorised,
  count(*) FILTER (WHERE category_id <> (SELECT id FROM labor_categories WHERE name='Civil')) AS non_civil
FROM public.laborers WHERE status='active';
-- And: active labourers with attendance under a Civil in-house contract but category_id <> Civil
```
Surface the counts to the owner. The "∪ historically-attended" clause already protects anyone with rows under the contract; this quantifies any roster-picker gaps for new entries.

- [ ] **Step 2: `tsc` + full affected tests.** Run: `npx tsc --noEmit 2>&1 | grep -E "error TS" | grep -vE "\.test\.(ts|tsx)\(|__tests__" || echo "NO SOURCE ERRORS"`; `npx vitest run src/lib/workforce`.

- [ ] **Step 3: Live (Playwright MCP, prod data).** `/dev-login`; then:
  - `/site/attendance` (Civil, no contract param): the labourer list is sane (Civil labourers + any historically-attended). Compare against the data-check counts.
  - From `/site/trades`, use the new entry on the **Painting** trade → confirm a `Painting — In-house` contract is created (check via SQL), the attendance page lists ONLY Painting-scoped labourers, mark one day, confirm the row is tagged to that contract, then settle it on `/site/payments`. 0 console errors.
  - **Reverse any test writes** (delete the test attendance/settlement rows + the test in-house contract via SQL) exactly as in Phase 2, and confirm restoration.

- [ ] **Step 4: Ship** (only on owner's go-ahead): migration already on prod; push the code commits to `main` (isolated from the unrelated wallet/material-hub WIP), Vercel auto-deploys.

---

## Self-review notes
- **Spec coverage:** model (Task 1), reuse-scoping (Tasks 3–5), labourer rule (Task 2 + used in 3/4/5), entry points (Task 6), Civil risk + data check (Task 7). All covered.
- **Type consistency:** `scopedLaborerIds` / `isLaborerInTradeScope` (Task 2) used verbatim in Tasks 3–5; `useEnsureTradeInHouseContract` (Task 1) used in Task 6; `tradeScope` shape consistent across 3–5.
- **Known imprecision:** Tasks 3–5 edit large existing files; exact surrounding lines are located by the named seam/grep target at implementation time (the new code + the transformation are specified; the insertion point is found in-situ). This is deliberate, not a placeholder.
