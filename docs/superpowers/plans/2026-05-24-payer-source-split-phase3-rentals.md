# Multi-Source Payer Split — Phase 3 (Rentals) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend payer-source-split to the rentals domain — write dialogs (`RentalSettlementDialog`, `RentalAdvanceDialog`, `RentalSettleViaWallet`, `HistoricalRentalDialog`), the edit dialog (`RentalSettlementEditDialog`), the multi-party flow (`MultiPartySettlementDialog`), the display surface (`RentalCostBreakdown`), and the service layer (`processRentalAdvance`, `processRentalSettlement`). Also extend `v_all_expenses` for `rental_settlements` + `rental_advances`.

**Architecture:** Patterns are inherited from Phase 1 + 2 — `PayerSourceSplitInput` is the form input, `validatePayerSourceInput` is the TS gate, `toRpcArgs` maps to the insert payload, `payer_source_split` JSONB is the storage shape. The two rental domain tables (`rental_settlements` + `rental_advances`) already have the column from Phase 1's foundation migration.

**Tech Stack:** PostgreSQL JSONB, MUI v7, React 19, Vitest + RTL, TanStack Query.

**Spec:** [docs/superpowers/specs/2026-05-23-payer-source-split-design.md](../specs/2026-05-23-payer-source-split-design.md)
**Phase 1 plan:** [docs/superpowers/plans/2026-05-23-payer-source-split-phase1.md](2026-05-23-payer-source-split-phase1.md)
**Phase 2 plan:** [docs/superpowers/plans/2026-05-23-payer-source-split-phase2.md](2026-05-23-payer-source-split-phase2.md)

---

## File map

**Create:**
- `supabase/migrations/20260524100000_v_all_expenses_rental_split.sql` — extend view's `rental_settlements` + `rental_advances` subqueries to surface `payer_source_split`

**Modify:**
- `src/lib/services/rentalService.ts` — `processRentalAdvance` + `processRentalSettlement` accept `payer: PayerSourceInput`, write `payer_source_split` JSONB
- `src/components/rentals/RentalSettlementDialog.tsx` — wire `PayerSourceSplitInput`
- `src/components/rentals/RentalAdvanceDialog.tsx` — wire `PayerSourceSplitInput`
- `src/components/rentals/RentalSettleViaWallet.tsx` — reshape payload field to `PayerSourceInput` (single-source-only for the wallet path; split deferred)
- `src/components/rentals/RentalSettlementEditDialog.tsx` — editable split via `PayerSourceSplitInput`
- `src/components/rentals/HistoricalRentalDialog.tsx` — wire one `PayerSourceSplitInput` per party (vendor + transport-in + transport-out, max 3 inputs)
- `src/components/rentals/MultiPartySettlementDialog.tsx` — reshape per-party payer to `PayerSourceInput`; single-source only (no split UI per party — deferred to a follow-up because the table-style layout doesn't accommodate a 2-3-row picker per party without a UX rethink)
- `src/components/rentals/RentalCostBreakdown.tsx` — render payer source via `formatPayerSource` / `PayerSourceChip`

**Out of scope (Phase 4 / later):** Tea shop, Materials, Wallet-deposit dialogs; `MoneySourceSummaryCard` rollup; RentalHub V2 redesign (separate project); per-party split inside `MultiPartySettlementDialog`.

---

## Task 1: View migration — extend `v_all_expenses` for rental splits

**Files:**
- Create: `supabase/migrations/20260524100000_v_all_expenses_rental_split.sql`

The latest view migration is `20260523150000_v_all_expenses_misc_split.sql`. It has the `base` CTE with 12 UNION branches; the `rental_settlements` and `rental_advances` branches (last two) currently project `NULL::jsonb AS row_payer_source_split`. This task swaps those two projections to `<alias>.payer_source_split`.

- [ ] **Step 1: Locate the previous view migration**

```bash
ls supabase/migrations/*v_all_expenses*.sql | sort | tail -3
```

The most recent is `20260523150000_v_all_expenses_misc_split.sql`. Read it end-to-end. Note the table aliases for the two rental subqueries (typically `rs` for `rental_settlements`, `ra` for `rental_advances` — verify in the file).

- [ ] **Step 2: Write the new migration**

Create `supabase/migrations/20260524100000_v_all_expenses_rental_split.sql` with the SAME view body as `20260523150000_v_all_expenses_misc_split.sql`, with TWO projection swaps:

- In the `rental_settlements` branch: `NULL::jsonb AS row_payer_source_split` → `rs.payer_source_split AS row_payer_source_split` (use the actual alias)
- In the `rental_advances` branch: `NULL::jsonb AS row_payer_source_split` → `ra.payer_source_split AS row_payer_source_split` (use the actual alias)

Header comment:

```sql
-- Phase 3: extend v_all_expenses to surface payer_source_split for the two
-- rental domain branches. Settlement_groups branches were wired in Phase 1
-- (20260523140200), misc_expenses in Phase 2 (20260523150000); this finishes
-- the rentals contribution. The 3 remaining branches (tea_shop_settlements,
-- subcontract_payments, material_purchase_expenses) stay on NULL — those
-- domains' dialogs are still on the legacy single-source shape and the
-- domain tables' new column is unpopulated.
```

The trailing `SELECT base.*, COALESCE(base.row_payer_source_split, <Phase 4 fallback>) AS payer_source_split FROM base;` is unchanged.

- [ ] **Step 3: Apply locally (skip if Docker down)**

```bash
npx supabase status
```

If up, `npm run db:reset` then verify:

```sql
SELECT id, source_type, payer_source, payer_source_split
FROM v_all_expenses
WHERE source_type IN ('rental_settlement', 'rental_advance')
  AND payer_source = 'split'
ORDER BY created_at DESC
LIMIT 5;
```

If Docker down, document the skip.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260524100000_v_all_expenses_rental_split.sql
git commit -m "feat(db): surface payer_source_split from rental_settlements + rental_advances in v_all_expenses"
```

---

## Task 2: `processRentalAdvance` + `processRentalSettlement` accept `PayerSourceInput`

**File:** `src/lib/services/rentalService.ts`

Same pattern as Phase 2 Task 2 (`processContractPayment`) and Task 3 (`createMiscExpense`).

- [ ] **Step 1: Locate both functions**

`processRentalAdvance` is at line ~86, `processRentalSettlement` at line ~202. Each currently has a `payer_source` field (and probably `payer_name` or `custom_payer_name`) in its config parameter.

- [ ] **Step 2: Replace the config field**

For each function, replace the legacy fields:

```ts
// Before
payer_source: PayerSource | string;
payer_name?: string;  // (or custom_payer_name — match the existing name)

// After
payer: PayerSourceInput;
```

Imports (add to the top of the file if not already present):

```ts
import type { PayerSourceInput } from "@/types/settlement.types";
import { validatePayerSourceInput, toRpcArgs } from "@/lib/settlement/payerSource";
```

- [ ] **Step 3: Update the insert/update bodies**

Each function does a direct supabase insert/update into `rental_advances` or `rental_settlements`. Before the insert/update:

```ts
const payerCheck = validatePayerSourceInput(config.payer, config.amount);
if (!payerCheck.ok) {
  return { success: false, error: `Invalid payer source: ${payerCheck.reason}` };
}
const payerRpc = toRpcArgs(config.payer);
```

In the insert/update payload, replace:

```ts
payer_source: config.payer_source,
payer_name: ...,
```

with:

```ts
payer_source: payerRpc.p_payer_source,
payer_name: payerRpc.p_payer_name,
payer_source_split: payerRpc.p_payer_source_split,
```

The amount-column field on the rental functions may be named `amount` or `final_amount`. Pass the right one as the second arg to `validatePayerSourceInput`.

- [ ] **Step 4: Type-check**

`npx tsc --noEmit` — the 5 rental dialogs will start erroring because they still pass the legacy shape. They get reshaped in Tasks 3-8.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/rentalService.ts
git commit -m "feat(rental): processRentalAdvance + processRentalSettlement accept PayerSourceInput"
```

---

## Task 3: Wire `PayerSourceSplitInput` into `RentalSettlementDialog`

**File:** `src/components/rentals/RentalSettlementDialog.tsx`

Standard wire-in. Apply the Phase 2 Task 4 (MestriSettleDialog) pattern verbatim, swapping the names:

- [ ] **Step 1: Replace state** (legacy `payerSource` + `customPayerName` → `payer: PayerSourceInput`).
- [ ] **Step 2: Replace `<PayerSourceSelector>` JSX** with `<PayerSourceSplitInput value={payer} onChange={setPayer} total={<amount-var>} siteId={<site-id-var>} disabled={submitting} />`. Find the right amount-var by reading the file (likely `finalAmount` or `amount`).
- [ ] **Step 3: Update submit handler** — `processRentalSettlement` config now takes `payer`. Add the validator guard above the submit.
- [ ] **Step 4: Submit-button disable + inline error** (same pattern: `!validatePayerSourceInput(payer, amount).ok`).
- [ ] **Step 5: Type-check** — file should be clean.
- [ ] **Step 6: Commit**

```bash
git add src/components/rentals/RentalSettlementDialog.tsx
git commit -m "feat(rentals): RentalSettlementDialog uses PayerSourceSplitInput"
```

Imports: add `PayerSourceSplitInput`, `PayerSourceInput`, `validatePayerSourceInput`. Drop `PayerSourceSelector` if no other usage.

---

## Task 4: Wire `PayerSourceSplitInput` into `RentalAdvanceDialog`

**File:** `src/components/rentals/RentalAdvanceDialog.tsx`

Same pattern as Task 3, calling `processRentalAdvance`.

- [ ] **Step 1**: Replace state.
- [ ] **Step 2**: Replace `<PayerSourceSelector>` with `<PayerSourceSplitInput>`. The amount-var is probably `amount` or `advanceAmount`.
- [ ] **Step 3**: Update submit handler — `processRentalAdvance` config now takes `payer`. Validator guard above submit.
- [ ] **Step 4**: Submit-button + inline error.
- [ ] **Step 5**: Type-check.
- [ ] **Step 6**: Commit

```bash
git add src/components/rentals/RentalAdvanceDialog.tsx
git commit -m "feat(rentals): RentalAdvanceDialog uses PayerSourceSplitInput"
```

---

## Task 5: Reshape `RentalSettleViaWallet` payload

**File:** `src/components/rentals/RentalSettleViaWallet.tsx`

This dialog is the wallet-path settle (single-source only by design — wallet spends are attributed via Phase 4 allocations, not the user-entered split). The dialog passes a `payload.payerSource` string to a service call.

- [ ] **Step 1: Reshape the payload field** to match the new service signature. If the service this dialog calls is `processRentalSettlement` (or anything migrated in Task 2), the dialog must now pass `payer: { mode: "single", source: payload.payerSource, name: payload.customPayerName || undefined }`.

No UI change — the dialog still picks ONE source. The split UI is not introduced here.

- [ ] **Step 2: Type-check** — file should be clean.
- [ ] **Step 3: Commit**

```bash
git add src/components/rentals/RentalSettleViaWallet.tsx
git commit -m "refactor(rentals): RentalSettleViaWallet passes single-source PayerSourceInput"
```

---

## Task 6: `RentalSettlementEditDialog` — editable split

**File:** `src/components/rentals/RentalSettlementEditDialog.tsx`

Same pattern as Phase 2 Task 8 (`SettlementEditDialog`).

- [ ] **Step 1: Replace state + hydration** — hydrate `payer` from `settlement.payer_source_split` if present, else from `settlement.payer_source` + `settlement.payer_name`. If the `RentalSettlement` TS type doesn't include `payer_source_split`, add the optional field (in whatever types file declares it).
- [ ] **Step 2: Replace `<PayerSourceSelector>`** with `<PayerSourceSplitInput value={payer} onChange={setPayer} total={settlement.final_amount} siteId={settlement.site_id} disabled={saving} />`.
- [ ] **Step 3: Update the save path** to write all three columns (`payer_source`, `payer_name`, `payer_source_split`). Validator guard before.
- [ ] **Step 4: Submit-button + inline error.**
- [ ] **Step 5: Type-check.**
- [ ] **Step 6: Commit**

```bash
git add src/components/rentals/RentalSettlementEditDialog.tsx
git commit -m "feat(rentals): RentalSettlementEditDialog allows editing payer-source as a split"
```

If the `RentalSettlement` type was extended, include that file too.

---

## Task 7: `HistoricalRentalDialog` — per-party wire-in

**File:** `src/components/rentals/HistoricalRentalDialog.tsx`

This dialog records a backfilled historical rental that may include advance + settlement for vendor + transport-in driver + transport-out driver. Each of those three settlement rows currently has a `payerSource` / `inPayerSource` / `outPayerSource` (or similar) tied to its own `<PayerSourceSelector>`.

- [ ] **Step 1: Identify the 3 (or 4) payer-source state pairs.** Grep for `setPayerSource`, `setInPayerSource`, `setOutPayerSource`. Each becomes `setPayer`, `setInPayer`, `setOutPayer` of type `PayerSourceInput`.

- [ ] **Step 2: Replace each `<PayerSourceSelector>` with `<PayerSourceSplitInput>`** keyed to its own party's amount. The vendor settlement amount is `vendorBalance` or similar; the transport-in is `inDriverAmount`; the transport-out is `outDriverAmount`. Verify variable names.

- [ ] **Step 3: Update the submit handler** — for each of the 3 settlements, validate the corresponding `payer` independently and pass it through `processRentalSettlement`. The dialog likely loops or calls the service multiple times; preserve that structure, just swap the payer fields.

```ts
const checks = [
  { name: "vendor", payer, amount: vendorBalance },
  { name: "transport-in", payer: inPayer, amount: inDriverAmount },
  { name: "transport-out", payer: outPayer, amount: outDriverAmount },
];
for (const c of checks) {
  if (c.amount > 0) {
    const v = validatePayerSourceInput(c.payer, c.amount);
    if (!v.ok) {
      setError(`${c.name}: ${v.reason}`);
      setSubmitting(false);
      return;
    }
  }
}
```

- [ ] **Step 4: Submit-button disable + per-row inline errors** — the dialog likely already has per-row error display; reuse the existing affordance.

- [ ] **Step 5: Type-check** — file should be clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/rentals/HistoricalRentalDialog.tsx
git commit -m "feat(rentals): HistoricalRentalDialog per-party PayerSourceSplitInput"
```

---

## Task 8: `MultiPartySettlementDialog` — reshape per-party payer (no split UI)

**File:** `src/components/rentals/MultiPartySettlementDialog.tsx`

This dialog uses a custom `<Select>` (not `PayerSourceSelector`) for each party's `payer_source` because the layout is table-row dense — a 2-3-row split picker per party would explode the layout. For Phase 3, we just reshape the per-party payer to the new `PayerSourceInput` so the service call type-checks; the UI keeps the simple single-source dropdown.

- [ ] **Step 1: Update the per-party type** — wherever a `Party` (or similar) type holds `payer_source: string`, replace with `payer: PayerSourceInput`. Set the default via `{ mode: "single", source: defaultPayer }`.

- [ ] **Step 2: Update the Select's value/onChange** — the dropdown still drives `party.payer.source` (not `party.payer_source`):

```tsx
<Select
  value={party.payer.mode === "single" ? party.payer.source : "split"}  // 'split' option not selectable
  onChange={(e) => updateParty(partyType, {
    payer: { mode: "single", source: e.target.value as PayerSource }
  })}
  ...
>
```

(The `"split"` value never appears as an option — splits aren't authorable here in Phase 3.)

- [ ] **Step 3: Update the submit handler** — each `processRentalSettlement` call now passes `party.payer` (a `PayerSourceInput`) instead of `party.payer_source`. The validator runs server-side (TS) anyway.

- [ ] **Step 4: Type-check** — file should be clean. The dialog stays functionally identical (no split UI), just types changed.

- [ ] **Step 5: Commit**

```bash
git add src/components/rentals/MultiPartySettlementDialog.tsx
git commit -m "refactor(rentals): MultiPartySettlementDialog uses PayerSourceInput (single-source per party)"
```

> Future follow-up: if multi-party splits become a real need, design a denser per-party split UI (e.g. inline 2-row picker, or a "Split" expand affordance per row). Out of scope for Phase 3.

---

## Task 9: `RentalCostBreakdown` — display split

**File:** `src/components/rentals/RentalCostBreakdown.tsx`

The component renders a single payer-source string inline (around line 376):

```tsx
{settlement.payer_source && ` · ${getPayerSourceLabel(settlement.payer_source as any, settlement.payer_name ?? undefined)}`}
```

After Phase 3, it should show split summaries.

- [ ] **Step 1: Use `formatPayerSource`** — replace the inline label with:

```tsx
{settlement.payer_source && (() => {
  const out = formatPayerSource({
    payer_source: settlement.payer_source,
    payer_name: settlement.payer_name ?? null,
    payer_source_split: settlement.payer_source_split ?? null,
  });
  return ` · ${out.kind === "single" ? out.label : out.summary}`;
})()}
```

(The component renders inside a text run, not as a chip — so use the helper's `.label` / `.summary` instead of `PayerSourceChip`.)

- [ ] **Step 2: If the `RentalSettlement` type doesn't include `payer_source_split`**, add the optional field. Likely already there if Task 6 extended it.

- [ ] **Step 3: Type-check** — clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/rentals/RentalCostBreakdown.tsx
git commit -m "feat(rentals): RentalCostBreakdown shows split summary"
```

---

## Task 10: Final pass — typecheck, build, vitest

- [ ] **Step 1: Full type-check**

```bash
npx tsc --noEmit
```

Expected: no new errors in Phase 3 files. The pre-existing ones in `ScopePill.test.tsx`, `InventoryCardGrid.test.tsx`, `BrandVariantMatrix.test.tsx`, `RentalCostBreakdown.test.tsx` are tolerated (Phase 1 + 2 same note).

If new errors surface (e.g. an unmigrated rental-service caller), fix them with a minimal single-source wrap.

- [ ] **Step 2: Vitest**

```bash
npx vitest run
```

Expected: green. The `RentalCostBreakdown.test.tsx` pre-existing test failure is unrelated to this work — don't address.

- [ ] **Step 3: Production build**

```bash
npm run build
```

Expected: passes (or fails only on the env-missing static prerender, per Phase 1's note).

- [ ] **Step 4: Commit any incidental fixes**

```bash
git add <file>
git commit -m "fix(payer-source-split-phase3): <description>"
```

---

## What ships after Phase 3

- 10 of the 13 write dialogs now use `PayerSourceSplitInput` (Phases 1 + 2 + 3):
  - Phase 1: `PaymentDialog`
  - Phase 2: `MestriSettleDialog`, `MiscExpenseDialog`, `UnifiedSettlementDialog`, `ContractPaymentRecordDialog`
  - Phase 3: `RentalSettlementDialog`, `RentalAdvanceDialog`, `HistoricalRentalDialog`, `MultiPartySettlementDialog` (single-source only), `RentalSettleViaWallet` (single-source)
- `v_all_expenses` surfaces splits from `settlement_groups`, `misc_expenses`, `rental_settlements`, `rental_advances`. Three branches still NULL (tea_shop_settlements, subcontract_payments, material_purchase_expenses).
- 4 read-side surfaces render splits: `SettlementEditDialog`, `MiscExpenseViewDialog`, `SalarySettlementTable`, `RentalCostBreakdown`.
- 4 service functions accept `PayerSourceInput`: `processSettlement`, `processContractPayment`, `processWaterfallContractPayment`, `createMiscExpense` / `updateMiscExpense` — plus `processRentalAdvance`, `processRentalSettlement` from Phase 3.
- 1 edit dialog supports editable split per domain so far: `SettlementEditDialog` (Phase 2), `RentalSettlementEditDialog` (Phase 3).

## Out of scope (Phase 4)

- Tea shop (`TeaShopSettlementDialog`, `GroupTeaShopSettlementDialog`)
- Materials (`MaterialSettlementDialog`, `InitiateBatchSettlementDialog`)
- Wallet deposits (`AddFundsDialog`, `EditDepositDialog`)
- `MoneySourceSummaryCard` rollup aggregation
- Per-party split UI inside `MultiPartySettlementDialog`
- Remaining edit dialogs (`DateSettlementsEditDialog`, `DailySettlementEditDialog`, `ContractSettlementEditDialog`, `WeekSettlementsDialogV3`)
- `v_all_expenses` extensions for the remaining 3 branches
- PDF/export consumers
- RentalHub V2 redesign (separate project; will inherit split support when it lands since both v1 and v2 hit the same tables)
