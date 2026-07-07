# Contract-laborer amount-based pay + "already-paid" credit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or
> subagent-driven-development) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make per-contract-laborer pay amount-based so partial / already-paid amounts stick, add a
reusable "record an amount already paid" affordance, and reconcile WaterTank's floating ₹800 lump into
Jithin's already-paid credit — counted in expenses exactly once.

**Architecture:** The "paid" ledger for contract laborers switches from whole `is_paid` attendance-days
to a **rupee amount** recorded as a `settlement_groups` row linked to `(contract_ref_kind,
contract_ref_id, contract_laborer_id)`. `net_unpaid = max(0, net − Σ linked group amounts)`. A new RPC
`record_contract_laborer_payment` clamps each payment to the server-computed remaining (no overpay) and
sets the link. The proven wallet + `reverse_settlement` + `v_all_expenses` paths are reused unchanged.

**Tech Stack:** Postgres (Supabase RPCs/migrations), Next.js 15, React Query, MUI v7, Vitest.

## Global Constraints
- **Design doc:** `docs/superpowers/specs/2026-07-07-contract-laborer-amount-based-pay-design.md`.
- **Prod-only DB:** there is no working local Supabase (`db:reset` is broken). Schema migrations are
  applied to prod via `mcp__supabase__apply_migration` **after explicit owner confirmation** (money
  path), following move-to-prod ordering: **schema first, then code push.**
- **No overpay, counted once:** every payment clamped to remaining; the ₹800 reconciliation reuses the
  existing wallet debit and soft-deletes the source lump.
- **Scope:** only direct-pay (`mesthri_commission_enabled`) contract laborers. Lump-mode contracts and
  `task_work_payments` lump payments are untouched.
- **Verified facts:** `settle_contract_laborer` is called only by `settlementService.ts` (no other DB
  or client caller). All contract laborers currently have `net_paid = 0` (zero backfill). WaterTank pkg
  `e9a82b54-239e-4422-811b-7387cca76f10`, maistry Jithin `6c1b5fc8-f943-4524-909a-e430c1209772`, cutover
  2026-06-30. Live lump `task_work_payments` `fb45b1ce-a5a2-48c2-8201-f4613308261b` = ₹800, wallet txn
  `902c78d2-88b5-485b-82c0-2cf610058cee`, ref `TW-260701-001`. Deleted duplicate `32bce789…` (wallet
  `372f6aa3…`).

---

### Task 1: Pure client helpers for remaining / clamp (mirror the SQL)

Mirrors `record_contract_laborer_payment`'s math so the dialog can show "₹X will still be owed" and
prevent overpay client-side, exactly as `commission.ts` mirrors its SQL helper.

**Files:**
- Create: `src/lib/workforce/contractPay.ts`
- Test: `src/lib/workforce/contractPay.test.ts`

**Interfaces:**
- Produces: `remainingOwed(netOwed: number, alreadyPaid: number): number`,
  `clampPayment(amount: number, remaining: number): number`.

- [ ] **Step 1: Write the failing test** — `src/lib/workforce/contractPay.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { remainingOwed, clampPayment } from "./contractPay";

describe("remainingOwed", () => {
  it("net minus already-paid", () => {
    expect(remainingOwed(6825, 800)).toBe(6025);
  });
  it("never negative (overpaid)", () => {
    expect(remainingOwed(6825, 7000)).toBe(0);
  });
  it("treats nullish/NaN as 0", () => {
    expect(remainingOwed(NaN as unknown as number, 800)).toBe(0);
    expect(remainingOwed(6825, undefined as unknown as number)).toBe(6825);
  });
});

describe("clampPayment", () => {
  it("caps at the remaining", () => {
    expect(clampPayment(800, 6025)).toBe(800);
    expect(clampPayment(9000, 6025)).toBe(6025);
  });
  it("floors at 0", () => {
    expect(clampPayment(-50, 6025)).toBe(0);
    expect(clampPayment(500, 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npm test -- src/lib/workforce/contractPay.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `src/lib/workforce/contractPay.ts`

```ts
/**
 * Contract-laborer pay math — pure, mirrored from the SQL RPC
 * `record_contract_laborer_payment` so the dialog and the server never disagree.
 * "Paid" for a contract laborer is a rupee amount (Σ linked settlement groups),
 * NOT whole attendance-days.
 */
function n(v: number | null | undefined): number {
  return v == null || !Number.isFinite(v) ? 0 : v;
}

/** What's still owed to a contract laborer = net earned − already paid (never < 0). */
export function remainingOwed(netOwed: number | null | undefined, alreadyPaid: number | null | undefined): number {
  return Math.max(0, n(netOwed) - n(alreadyPaid));
}

/** A payment can never exceed the remaining or go below 0 (matches the server clamp). */
export function clampPayment(amount: number | null | undefined, remaining: number | null | undefined): number {
  return Math.min(Math.max(0, n(amount)), Math.max(0, n(remaining)));
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npm test -- src/lib/workforce/contractPay.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/workforce/contractPay.ts src/lib/workforce/contractPay.test.ts
git commit -m "feat(trades): pure contract-pay remaining/clamp helpers + tests"
```

---

### Task 2: Migration — link columns on `settlement_groups`

**Files:**
- Create: `supabase/migrations/20260707140000_settlement_groups_contract_laborer_link.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Link a settlement_group to ONE contract laborer so a rupee payment (full, partial, or
-- already-paid) can be attributed without needing whole is_paid attendance-days.
ALTER TABLE public.settlement_groups
  ADD COLUMN IF NOT EXISTS contract_ref_kind text
    CHECK (contract_ref_kind IN ('task_work','subcontract')),
  ADD COLUMN IF NOT EXISTS contract_ref_id uuid,
  ADD COLUMN IF NOT EXISTS contract_laborer_id uuid;

CREATE INDEX IF NOT EXISTS idx_settlement_groups_contract_laborer
  ON public.settlement_groups (contract_ref_kind, contract_ref_id, contract_laborer_id)
  WHERE contract_ref_kind IS NOT NULL;
```

- [ ] **Step 2: Commit** (apply to prod happens in Task 8, gated)

```bash
git add supabase/migrations/20260707140000_settlement_groups_contract_laborer_link.sql
git commit -m "feat(trades): settlement_groups contract-laborer link columns"
```

---

### Task 3: Migration — `get_contract_labor_ledger` net_paid from linked groups

`net_paid` becomes Σ of linked non-cancelled `settlement_groups.total_amount` (project-wide);
`net_unpaid = max(0, net − net_paid)`. Windowed `gross/commission/net` for display are unchanged. At the
owner's default Project view, windowed net = project net, so `net_unpaid` is exact.

**Files:**
- Create: `supabase/migrations/20260707140100_get_contract_labor_ledger_amount_paid.sql`

- [ ] **Step 1: Write the migration** (full `CREATE OR REPLACE`, same signature/return columns)

```sql
CREATE OR REPLACE FUNCTION public.get_contract_labor_ledger(
  p_kind text, p_ref_id uuid, p_date_from date DEFAULT NULL, p_date_to date DEFAULT NULL
)
RETURNS TABLE(laborer_id uuid, laborer_name text, role_name text, man_days numeric,
              day_count integer, gross numeric, commission numeric, net numeric,
              net_paid numeric, net_unpaid numeric, is_mesthri boolean)
LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  WITH days AS (
    SELECT
      d.laborer_id,
      l.name                                                             AS laborer_name,
      COALESCE(lr.name, 'Unknown')                                       AS role_name,
      COALESCE(SUM(COALESCE(d.work_days, 1)), 0)::numeric                AS man_days,
      COUNT(*)::int                                                      AS day_count,
      COALESCE(SUM(d.daily_earnings), 0)::numeric                        AS gross,
      COALESCE(SUM(COALESCE(d.mesthri_commission_amount, vc.commission_amount)), 0)::numeric AS commission,
      COALESCE(SUM(d.daily_earnings
                   - COALESCE(d.mesthri_commission_amount, vc.commission_amount)), 0)::numeric AS net,
      bool_or(vc.collector_id = d.laborer_id)                            AS is_mesthri
    FROM public.daily_attendance d
    JOIN public.laborers l ON l.id = d.laborer_id
    LEFT JOIN public.labor_roles lr ON lr.id = l.role_id
    JOIN public.v_daily_attendance_commission vc ON vc.attendance_id = d.id
    WHERE d.is_deleted = false
      AND d.is_archived = false
      AND l.laborer_type = 'contract'
      AND (p_date_from IS NULL OR d.date >= p_date_from)
      AND (p_date_to   IS NULL OR d.date <= p_date_to)
      AND (
        (p_kind = 'task_work'  AND d.task_work_package_id = p_ref_id)
        OR
        (p_kind = 'subcontract' AND d.subcontract_id = p_ref_id AND d.task_work_package_id IS NULL)
      )
    GROUP BY d.laborer_id, l.name, lr.name
  ),
  paid AS (
    SELECT sg.contract_laborer_id AS laborer_id,
           COALESCE(SUM(sg.total_amount), 0)::numeric AS net_paid
    FROM public.settlement_groups sg
    WHERE sg.contract_ref_kind = p_kind
      AND sg.contract_ref_id = p_ref_id
      AND sg.contract_laborer_id IS NOT NULL
      AND sg.is_cancelled = false
      AND sg.is_archived = false
    GROUP BY sg.contract_laborer_id
  )
  SELECT
    days.laborer_id, days.laborer_name, days.role_name, days.man_days, days.day_count,
    days.gross, days.commission, days.net,
    COALESCE(paid.net_paid, 0)::numeric                                   AS net_paid,
    GREATEST(days.net - COALESCE(paid.net_paid, 0), 0)::numeric           AS net_unpaid,
    days.is_mesthri
  FROM days
  LEFT JOIN paid ON paid.laborer_id = days.laborer_id
  ORDER BY days.is_mesthri DESC, days.net DESC, days.laborer_name;
$function$;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260707140100_get_contract_labor_ledger_amount_paid.sql
git commit -m "feat(trades): ledger net_paid from linked settlement groups (amount-based)"
```

---

### Task 4: Migration — `record_contract_laborer_payment` RPC (replaces `settle_contract_laborer`)

**Files:**
- Create: `supabase/migrations/20260707140200_record_contract_laborer_payment.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Retire the day-based settle (only settlementService called it; no other DB/client caller).
DROP FUNCTION IF EXISTS public.settle_contract_laborer(
  text, uuid, uuid, date, date, uuid, boolean, date, text, text, uuid, text, text, text, text);

-- Record a RUPEE payment against one contract laborer's dues. Clamps to the live remaining
-- (net earned − already-paid, project-wide) so net can never go negative, links the passed
-- settlement_group, and sets its total_amount to the recorded amount. No day marking.
CREATE OR REPLACE FUNCTION public.record_contract_laborer_payment(
  p_kind text, p_ref_id uuid, p_laborer_id uuid,
  p_settlement_group_id uuid, p_amount numeric
) RETURNS numeric
LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE
  v_net_owed numeric;
  v_already_paid numeric;
  v_remaining numeric;
  v_record numeric;
BEGIN
  SELECT COALESCE(SUM(d.daily_earnings
           - COALESCE(d.mesthri_commission_amount, vc.commission_amount)), 0)
  INTO v_net_owed
  FROM public.daily_attendance d
  JOIN public.laborers l ON l.id = d.laborer_id
  JOIN public.v_daily_attendance_commission vc ON vc.attendance_id = d.id
  WHERE d.laborer_id = p_laborer_id
    AND d.is_deleted = false AND d.is_archived = false
    AND l.laborer_type = 'contract'
    AND (
      (p_kind = 'task_work'  AND d.task_work_package_id = p_ref_id)
      OR
      (p_kind = 'subcontract' AND d.subcontract_id = p_ref_id AND d.task_work_package_id IS NULL)
    );

  SELECT COALESCE(SUM(sg.total_amount), 0)
  INTO v_already_paid
  FROM public.settlement_groups sg
  WHERE sg.contract_ref_kind = p_kind
    AND sg.contract_ref_id = p_ref_id
    AND sg.contract_laborer_id = p_laborer_id
    AND sg.id <> p_settlement_group_id
    AND sg.is_cancelled = false
    AND sg.is_archived = false;

  v_remaining := GREATEST(v_net_owed - v_already_paid, 0);
  v_record := LEAST(GREATEST(p_amount, 0), v_remaining);

  UPDATE public.settlement_groups
    SET contract_ref_kind   = p_kind,
        contract_ref_id     = p_ref_id,
        contract_laborer_id = p_laborer_id,
        total_amount        = v_record
    WHERE id = p_settlement_group_id;

  RETURN v_record;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.record_contract_laborer_payment(text, uuid, uuid, uuid, numeric)
  TO authenticated, service_role;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260707140200_record_contract_laborer_payment.sql
git commit -m "feat(trades): record_contract_laborer_payment (amount-based, clamped)"
```

---

### Task 5: Migration — `get_contract_payment_history` discovers linked credits

Extend the `laborer_settlement` branch to find groups by the new link columns **or** the legacy day-join
(none exist today, but keep for safety). Branches 1 (maistry lump) and 3 (commission) unchanged.

**Files:**
- Create: `supabase/migrations/20260707140300_contract_payment_history_linked.sql`

- [ ] **Step 1: Write the migration** (full `CREATE OR REPLACE`; only branch 2 changes)

```sql
CREATE OR REPLACE FUNCTION public.get_contract_payment_history(p_kind text, p_ref_id uuid)
RETURNS TABLE(source text, ref_id uuid, payment_date date, amount numeric, payee_name text,
              detail text, payment_mode text, payer_source text, payer_name text,
              is_wallet boolean, reference text, proof_url text)
LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  -- 1. Maistry lump payments (task-work packages)
  SELECT
    'package_payment'::text, twp.id, twp.payment_date, twp.amount::numeric,
    COALESCE(pkg.maistry_name, 'Maistry')::text, 'Contract payment'::text,
    twp.payment_mode::text, twp.payer_source, twp.payer_name,
    (twp.payment_channel = 'engineer_wallet'), twp.reference_number, twp.proof_url
  FROM public.task_work_payments twp
  JOIN public.task_work_packages pkg ON pkg.id = twp.package_id
  WHERE p_kind = 'task_work' AND twp.package_id = p_ref_id AND twp.is_deleted = false

  UNION ALL

  -- 2. Per-laborer rupee settlements: linked via contract columns (new) OR day-join (legacy)
  SELECT
    'laborer_settlement'::text, sg.id,
    COALESCE(sg.actual_payment_date, sg.settlement_date), sg.total_amount::numeric,
    COALESCE(
      ll.name,
      (SELECT l.name FROM public.daily_attendance da
         JOIN public.laborers l ON l.id = da.laborer_id
        WHERE da.settlement_group_id = sg.id LIMIT 1),
      'Laborer')::text,
    'Paid to laborer'::text,
    sg.payment_mode::text, sg.payer_source, sg.payer_name,
    (sg.payment_channel = 'engineer_wallet'), sg.settlement_reference, sg.proof_url
  FROM public.settlement_groups sg
  LEFT JOIN public.laborers ll ON ll.id = sg.contract_laborer_id
  WHERE sg.is_cancelled = false AND sg.is_archived = false AND sg.payment_type = 'salary'
    AND (
      (sg.contract_ref_kind = p_kind AND sg.contract_ref_id = p_ref_id)
      OR sg.id IN (
        SELECT DISTINCT da.settlement_group_id
        FROM public.daily_attendance da
        WHERE da.settlement_group_id IS NOT NULL
          AND (
            (p_kind = 'task_work'  AND da.task_work_package_id = p_ref_id)
            OR (p_kind = 'subcontract' AND da.subcontract_id = p_ref_id AND da.task_work_package_id IS NULL)
          )
      )
    )

  UNION ALL

  -- 3. Commission payouts to this contract's maistry (unchanged)
  SELECT
    'commission'::text, sg.id,
    COALESCE(sg.actual_payment_date, sg.settlement_date), sg.total_amount::numeric,
    COALESCE(lb.name, 'Maistry')::text, 'Maistry commission'::text,
    sg.payment_mode::text, sg.payer_source, sg.payer_name,
    (sg.payment_channel = 'engineer_wallet'), sg.settlement_reference, sg.proof_url
  FROM public.settlement_groups sg
  JOIN public.laborers lb ON lb.id = sg.commission_collector_laborer_id
  WHERE sg.is_cancelled = false AND sg.is_archived = false AND sg.payment_type = 'commission'
    AND sg.commission_collector_laborer_id = (
      CASE
        WHEN p_kind = 'task_work' THEN
          (SELECT maistry_laborer_id FROM public.task_work_packages WHERE id = p_ref_id)
        WHEN p_kind = 'subcontract' THEN
          (SELECT CASE sc.contract_type
             WHEN 'mesthri'    THEN tm.leader_laborer_id
             WHEN 'specialist' THEN sc.laborer_id
             ELSE NULL END
           FROM public.subcontracts sc
           LEFT JOIN public.teams tm ON tm.id = sc.team_id
           WHERE sc.id = p_ref_id)
      END
    )

  ORDER BY 3 DESC;
$function$;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260707140300_contract_payment_history_linked.sql
git commit -m "feat(trades): contract payment history finds linked rupee credits"
```

---

### Task 6: Service — `settleContractLaborer` becomes amount-based

Reorder to: create group → **record RPC (clamp + link)** → guard `amount ≤ 0` → **wallet debit the
recorded amount**. Remove the old `settle_contract_laborer` call, the `rows_settled` branch, and the
`total_net` reconcile step.

**Files:**
- Modify: `src/lib/services/settlementService.ts` (the `settleContractLaborer` body,
  lines ~1116–1251; header comment ~1070–1079)

**Interfaces:**
- Consumes: `create_settlement_group` (unchanged), new `record_contract_laborer_payment(p_kind,
  p_ref_id, p_laborer_id, p_settlement_group_id, p_amount) → numeric` (Task 4), `recordSpend`,
  `reverse_settlement`.
- Produces: `settleContractLaborer` signature unchanged (`SettleContractLaborerArgs`).

- [ ] **Step 1: Replace the header comment** (~1070–1079)

```ts
/**
 * Pay ONE company laborer their contract wages directly from the pane (direct-pay mode) — full
 * remaining OR a partial / already-paid amount. Creates a settlement_group (payment_type='salary',
 * laborer_count=1), then records a RUPEE amount against the laborer via
 * record_contract_laborer_payment, which clamps to what's still owed and links the group to
 * (contract, laborer). Writes NO labor_payments, so it stays out of the site-wide salary waterfall,
 * and surfaces in v_all_expenses + the contract payment feed. Also serves the maistry's own wages.
 */
```

- [ ] **Step 2: Replace the body** — everything from `// 1. Create the settlement group…` (line 1116)
  through the end of the `try`'s success `return` (line 1247), with:

```ts
    // 1. Create the settlement group (payment_type='salary', laborer_count=1). No linked
    //    attendance days — it is a rupee credit against the laborer's contract dues.
    const { data: groupResult, error: groupError } = await supabase.rpc(
      "create_settlement_group",
      {
        p_site_id: config.siteId,
        p_settlement_date: paymentDate,
        p_total_amount: config.amount,
        p_laborer_count: 1,
        p_payment_channel: config.paymentChannel,
        p_payment_mode: config.paymentMode,
        p_payer_source: config.payerSource,
        p_payer_name: requiresPayerName(config.payerSource) ? config.customPayerName : null,
        p_proof_url: config.proofUrl || null,
        p_notes: config.notes
          ? `Contract wages: ${config.notes}`
          : `Paid ${config.laborerName ?? "laborer"} — contract wages`,
        p_subcontract_id: null,
        p_engineer_transaction_id: null,
        p_created_by: config.userId,
        p_created_by_name: config.userName,
        p_payment_type: "salary",
        p_idempotency_key: idempotencyKey,
      },
    );
    if (groupError) throw groupError;
    const groupData = Array.isArray(groupResult) ? groupResult[0] : groupResult;
    if (!groupData?.id) throw new Error("Failed to create settlement group");
    const settlementGroupId = groupData.id as string;
    const settlementReference = groupData.settlement_reference as string;

    // 2. Link the group to (contract, laborer) and clamp to what's still owed (server-authoritative,
    //    never lets net go negative). Returns the recorded rupee amount.
    const { data: recordData, error: recordError } = await supabase.rpc(
      "record_contract_laborer_payment",
      {
        p_kind: config.kind,
        p_ref_id: config.refId,
        p_laborer_id: config.laborerId,
        p_settlement_group_id: settlementGroupId,
        p_amount: config.amount,
      },
    );
    if (recordError) {
      await supabase.rpc("reverse_settlement", {
        p_settlement_group_id: settlementGroupId,
        p_reason: "Contract laborer record failed",
      });
      throw recordError;
    }
    const amountRecorded = Number(Array.isArray(recordData) ? recordData[0] : recordData) || 0;
    if (amountRecorded <= 0) {
      await supabase.rpc("reverse_settlement", {
        p_settlement_group_id: settlementGroupId,
        p_reason: "Nothing owed to settle",
      });
      return {
        success: false,
        error: "Nothing to record — this laborer is already fully paid on this contract.",
      };
    }

    // 3. Engineer-wallet debit (optional) — debit the AUTHORITATIVE recorded amount.
    if (config.paymentChannel === "engineer_wallet" && config.engineerId) {
      const walletPaymentMode: "cash" | "upi" | "bank_transfer" =
        config.paymentMode === "upi"
          ? "upi"
          : config.paymentMode === "net_banking"
            ? "bank_transfer"
            : "cash";
      try {
        const { id: txId } = await recordSpend(supabase, {
          engineer_id: config.engineerId,
          site_id: config.siteId,
          amount: amountRecorded,
          transaction_date: paymentDate,
          payment_mode: walletPaymentMode,
          proof_url: config.proofUrl || null,
          notes: config.notes || null,
          recorded_by: config.userName,
          recorded_by_user_id: config.userId,
          description: `Contract wages ${settlementReference}`,
          settlement_group_id: settlementGroupId,
        });
        engineerTransactionId = txId;
        await supabase
          .from("settlement_groups")
          .update({ engineer_transaction_id: engineerTransactionId })
          .eq("id", settlementGroupId);
      } catch (walletErr: any) {
        await supabase
          .from("settlement_groups")
          .update({
            is_cancelled: true,
            cancelled_at: new Date().toISOString(),
            cancelled_by: config.userName,
            cancelled_by_user_id: config.userId,
            cancellation_reason: `Engineer wallet debit failed: ${walletErr?.message ?? walletErr}`,
          })
          .eq("id", settlementGroupId);
        throw walletErr;
      }
    }

    return {
      success: true,
      settlementReference,
      settlementGroupId,
      engineerTransactionId: engineerTransactionId || undefined,
    };
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit` (or `npm run build` in Task 8).
Expected: no errors in `settlementService.ts`. (`supabase.rpc` here is loosely typed — the untyped
`SupabaseClient` accepts the new RPC name; generated types need no change.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/services/settlementService.ts
git commit -m "feat(trades): settleContractLaborer records a clamped rupee amount"
```

---

### Task 7: UI — project-scope pay + partial-aware dialog

**Files:**
- Modify: `src/components/workforce/ContractLaborLedger.tsx` (the two `ContractLaborerPayDialog`
  usages / pay wiring, lines ~190–204)
- Modify: `src/components/workforce/ContractLaborerPayDialog.tsx` (Amount helper + header comment)

- [ ] **Step 1: Pay project-scope in `ContractLaborLedger.tsx`** — replace the `payLaborer` dialog block
  (lines ~190–204) so pay is against **total contract dues**, not the period window:

```tsx
      {payLaborer && siteId && (
        <ContractLaborerPayDialog
          open={Boolean(payLaborer)}
          onClose={() => setPayLaborer(null)}
          siteId={siteId}
          kind={kind}
          refId={refId}
          laborerId={payLaborer.laborerId}
          laborerName={payLaborer.laborerName}
          amountOwed={payLaborer.netUnpaid}
          dateFrom={null}
          dateTo={null}
          windowLabel="in total"
        />
      )}
```

(`netUnpaid` is already project-wide from the RPC, so this is consistent regardless of the Day/Week/
Project toggle.)

- [ ] **Step 2: Partial-aware Amount helper in `ContractLaborerPayDialog.tsx`** — replace the `TextField`
  `helperText` (line ~173) so a partial reads clearly:

```tsx
            helperText={
              amount > amountOwed
                ? "More than what's still owed"
                : amount > 0 && amount < amountOwed
                  ? `Partial — ${formatCurrencyFull(amountOwed - amount)} will still be owed`
                  : undefined
            }
```

- [ ] **Step 3: Update the dialog header comment** (~43–47) to reflect amount-based recording:

```tsx
/**
 * Record a payment to ONE company laborer against their contract dues (direct-pay mode) — the full
 * remaining or a partial / already-paid amount (back-date via the Date field). Company/office picks a
 * payer source; a site engineer pays from their own wallet only. Reused from the crew ledger rows and
 * the maistry strip. The amount is clamped server-side to what's still owed.
 */
```

- [ ] **Step 4: Verify build + tests**

Run: `npm test -- src/lib/workforce/contractPay.test.ts` (still green) and rely on Task 8's build.

- [ ] **Step 5: Commit**

```bash
git add src/components/workforce/ContractLaborLedger.tsx src/components/workforce/ContractLaborerPayDialog.tsx
git commit -m "feat(trades): project-scope per-laborer pay + partial-aware dialog"
```

---

### Task 8: Verify, deploy schema, reconcile the ₹800, ship

- [ ] **Step 1: Full test + build (stop the dev server first)**

Run: `npm test` then `npm run build`. Expected: green. (If `dev:cloud` holds `:3000`, stop it before
building — it corrupts `.next`.)

- [ ] **Step 2: Owner confirmation to apply schema to prod.** Migrations 140000–140300 are additive /
  `CREATE OR REPLACE` and safe, but they change behavior for direct-pay contracts → **confirm with the
  owner**, then apply each in order via `mcp__supabase__apply_migration` (name = the file slug, SQL = the
  file contents). Stop and surface if any fails.

- [ ] **Step 3: Reconciliation baseline read (prod, read-only).** Before touching money, confirm state:

```sql
-- a) The two wallet txns behind the ₹800 (live + the deleted duplicate). Confirm the deleted
--    duplicate 372f6aa3 was already refunded/reversed, so there is no phantom debit.
select id, amount, transaction_type, is_reversed, reversal_transaction_id, settlement_group_id, notes
from site_engineer_transactions
where id in ('902c78d2-88b5-485b-82c0-2cf610058cee','372f6aa3-7544-43f4-98a1-46b463f6009d');

-- b) The live lump we will convert + the fields we need to reuse.
select id, site_id, amount, engineer_transaction_id, created_by, created_by_name, payment_date, is_deleted
from task_work_payments where id = 'fb45b1ce-a5a2-48c2-8201-f4613308261b'::uuid;

-- c) Ledger before.
select laborer_id, laborer_name, net, net_paid, net_unpaid
from get_contract_labor_ledger('task_work','e9a82b54-239e-4422-811b-7387cca76f10', null, null);
```

**Guard:** if `372f6aa3`'s wallet debit was NOT reversed (still an active spend with no reversal), STOP
and surface — the wallet has a phantom ₹800 that must be handled first.

- [ ] **Step 4: Owner confirmation + reconcile the ₹800 (prod write, no new money).** With the owner's
  explicit OK, in a single transaction:

```sql
-- Convert the floating ₹800 lump into Jithin's already-paid credit, reusing the SAME wallet debit.
DO $$
DECLARE
  v_twp   public.task_work_payments%ROWTYPE;
  v_group uuid;
  v_ref   text;
  v_rec   numeric;
BEGIN
  SELECT * INTO v_twp FROM public.task_work_payments
   WHERE id = 'fb45b1ce-a5a2-48c2-8201-f4613308261b';
  IF v_twp.is_deleted THEN RAISE EXCEPTION 'lump already deleted'; END IF;

  -- 1. Create the credit group (reuse the existing wallet txn; do NOT move money).
  SELECT id, settlement_reference INTO v_group, v_ref FROM public.create_settlement_group(
    p_site_id => v_twp.site_id,
    p_settlement_date => v_twp.payment_date,
    p_total_amount => v_twp.amount,
    p_laborer_count => 1,
    p_payment_channel => 'engineer_wallet',
    p_payment_mode => v_twp.payment_mode::text,
    p_payer_source => NULL,
    p_payer_name => NULL,
    p_proof_url => NULL,
    p_notes => 'Contract wages — Jithin (WaterTank), reconciled from legacy lump ' || v_twp.reference_number,
    p_subcontract_id => NULL,
    p_engineer_transaction_id => v_twp.engineer_transaction_id,   -- REUSE 902c78d2
    p_created_by => v_twp.created_by,
    p_created_by_name => v_twp.created_by_name,
    p_payment_type => 'salary',
    p_idempotency_key => 'reconcile-twp-' || v_twp.id::text
  );

  -- 2. Link + clamp (records 800 against Jithin; 800 ≤ 6825 remaining).
  SELECT public.record_contract_laborer_payment(
    'task_work', 'e9a82b54-239e-4422-811b-7387cca76f10',
    '6c1b5fc8-f943-4524-909a-e430c1209772', v_group, v_twp.amount
  ) INTO v_rec;
  IF v_rec <> v_twp.amount THEN RAISE EXCEPTION 'clamped to %, expected %', v_rec, v_twp.amount; END IF;

  -- 3. Point the reused wallet txn at the new group (so reverse_settlement refunds it cleanly).
  UPDATE public.site_engineer_transactions
     SET settlement_group_id = v_group
   WHERE id = v_twp.engineer_transaction_id;

  -- 4. Soft-delete the source lump WITHOUT touching its wallet txn (money stays, counted once).
  UPDATE public.task_work_payments SET is_deleted = true WHERE id = v_twp.id;
END $$;
```

- [ ] **Step 5: Reconciliation verify (prod, read-only).** Confirm:

```sql
-- Jithin now 800 paid / 6025 remaining; others unchanged; total owed 16,375.
select laborer_name, net, net_paid, net_unpaid
from get_contract_labor_ledger('task_work','e9a82b54-239e-4422-811b-7387cca76f10', null, null);

-- Pane feed: floating package_payment gone, a 'laborer_settlement' "Paid to laborer" ₹800 for Jithin.
select source, amount, payee_name, detail from get_contract_payment_history('task_work','e9a82b54-239e-4422-811b-7387cca76f10');

-- Expenses: the ₹800 appears exactly once (settlement group), the deleted lump is gone.
select source_type, amount, description, is_deleted
from v_all_expenses where settlement_reference = 'TW-260701-001'
   or engineer_transaction_id = '902c78d2-88b5-485b-82c0-2cf610058cee';
```

Expected: Jithin `net_paid=800, net_unpaid=6025`; one `laborer_settlement` ₹800; the ₹800 present once
in `v_all_expenses`, the old `task_work_payment` row now `is_deleted=true` (excluded).

- [ ] **Step 6: Playwright (dev:cloud) on WaterTank.** Log in via `/dev-login`, open WaterTank: confirm
  Jithin shows "Own labour ₹6,825 · ₹800 paid · ₹6,025 remaining"; record a **partial** payment to a crew
  laborer → row shows "₹X paid of ₹Y · remaining"; the payments feed + `/site/expenses?ref=TW-260701-001`
  reflect it; reverse it and confirm it returns to owed and the wallet is refunded. 0 console errors.

- [ ] **Step 7: Ship the code.** Commit any remaining changes; push the branch / merge per the
  finishing-a-development-branch skill; Vercel deploys on push. No `cloudflare-proxy/` changes.

- [ ] **Step 8: Update memory** — append an iteration note to `contract_pay_console_2026_07_07.md`
  (amount-based paid ledger; the ₹800 reconciliation; new RPC/columns) and refresh the `MEMORY.md`
  pointer line.

---

## Self-review notes
- **Spec coverage:** amount-based ledger (T3), record RPC + clamp (T4), history discovery (T5), service
  (T6), UI partial + project-scope (T7), ₹800 reconciliation (T8). Covered.
- **Type consistency:** `record_contract_laborer_payment(text,uuid,uuid,uuid,numeric)→numeric` is used
  identically in T4 (definition), T6 (service call), and T8 (reconciliation). `net_paid`/`net_unpaid`
  columns keep their names/positions in T3 so `useContractLaborLedger` needs no change.
- **Known cosmetic (deferred, not a blocker):** a day-less salary group shows in `v_all_expenses` under
  the "Unlinked salary" branch (correct amount, counted once) — its description carries the "Contract
  wages — Jithin…" note. A dedicated "Contract Salary" label branch is a future polish; not done here to
  avoid regenerating the 400-line view.
