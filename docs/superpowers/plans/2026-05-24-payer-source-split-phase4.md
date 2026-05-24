# Multi-Source Payer Split — Phase 4 (Tea Shop + Materials + Wallet Deposits + Edit Dialogs) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) for tracking.

**Goal:** Complete the "everywhere" coverage. Wire payer-source-split into the remaining 6 write dialogs (`TeaShopSettlementDialog`, `GroupTeaShopSettlementDialog`, `MaterialSettlementDialog`, `InitiateBatchSettlementDialog`, `AddFundsDialog`, `EditDepositDialog`) and the 4 settlement edit dialogs (`DateSettlementsEditDialog`, `DailySettlementEditDialog`, `ContractSettlementEditDialog`, `WeekSettlementsDialogV3`). Extend `v_all_expenses` for the 3 remaining UNION branches (tea_shop_settlements, subcontract_payments, material_purchase_expenses). After Phase 4, every write dialog supports user-entered splits and `v_all_expenses` surfaces splits from every payer-source-bearing domain.

**Architecture:** Phase 1 established the patterns; Phase 2-3 proved them across 9 write dialogs. Phase 4 applies the same recipe to the final 10 dialogs and the 3 remaining view branches.

**Spec:** [docs/superpowers/specs/2026-05-23-payer-source-split-design.md](../specs/2026-05-23-payer-source-split-design.md)
**Phase 3 plan:** [docs/superpowers/plans/2026-05-24-payer-source-split-phase3-rentals.md](2026-05-24-payer-source-split-phase3-rentals.md)

---

## File map

**Create:**
- `supabase/migrations/20260524130000_v_all_expenses_final_split.sql` — extend the 3 remaining UNION branches

**Modify (write dialogs):**
- `src/components/tea-shop/TeaShopSettlementDialog.tsx`
- `src/components/tea-shop/GroupTeaShopSettlementDialog.tsx`
- `src/components/materials/MaterialSettlementDialog.tsx`
- `src/components/materials/InitiateBatchSettlementDialog.tsx`
- `src/components/wallet-v2/AddFundsDialog.tsx`
- `src/components/wallet-v2/EditDepositDialog.tsx`

**Modify (edit dialogs):**
- `src/components/payments/DateSettlementsEditDialog.tsx`
- `src/components/payments/DailySettlementEditDialog.tsx`
- `src/components/payments/ContractSettlementEditDialog.tsx`
- `src/components/payments/WeekSettlementsDialogV3.tsx`

**Modify (service + types as needed):**
- `src/lib/services/engineerWalletV2.ts` — `recordDeposit` accepts `payer: PayerSourceInput`, writes `payer_source_split` JSONB
- Type files for tea-shop / material / wallet-deposit row types — extend with optional `payer_source_split`
- Tea-shop and material hooks (in `useCombinedTeaShop.ts`, `useGroupTeaShop.ts`, materials hooks) — update insert/update payloads only if they don't transparently spread form data

**Out of scope:** `MoneySourceSummaryCard` rollup aggregation (component currently has no consumers — verify and skip if confirmed unused); PDF/export consumers; the magic-string `PAYER_SOURCES` cleanup in `MultiPartySettlementDialog` (separate refactor); deletion of unused `processRentalAdvance` / `processRentalSettlement`.

---

## Task 1: View migration — extend the 3 remaining UNION branches

**File to create:** `supabase/migrations/20260524130000_v_all_expenses_final_split.sql`

The latest view migration is `20260524120000_v_all_expenses_rental_split.sql`. Read it end-to-end. The three branches still hardcoding `NULL::jsonb AS row_payer_source_split` are: `tea_shop_settlements`, `subcontract_payments`, `material_purchase_expenses`. Capture their actual table aliases (likely `ts`, `sp`, `mpe` — verify).

- [ ] **Step 1: Locate the previous view migration**

```bash
ls supabase/migrations/*v_all_expenses*.sql | sort | tail -3
```

- [ ] **Step 2: Write the new migration**

Create `supabase/migrations/20260524130000_v_all_expenses_final_split.sql` with the SAME view body as `20260524120000_v_all_expenses_rental_split.sql`, with THREE projection swaps:

- `tea_shop_settlements` branch: `NULL::jsonb` → `<alias>.payer_source_split AS row_payer_source_split`
- `subcontract_payments` branch: this branch reads via the `settlement_groups`-shaped subquery (the subcontract payments come from `settlement_groups.payment_type = 'subcontract'` or similar — verify by reading). If it already inherits from settlement_groups, the column should already be wired in Phase 1. Confirm by reading and either swap to the right source column or leave as-is.
- `material_purchase_expenses` branch: `NULL::jsonb` → `<alias>.payer_source_split AS row_payer_source_split`

Note: `material_purchase_expenses` table uses `settlement_payer_source` (not `payer_source`) for the legacy single-source field — but the new `payer_source_split` column on that table is named consistently. Verify the migration `20260523140000_payer_source_split_foundation.sql:17-24` to confirm.

Header comment:

```sql
-- Phase 4: extend v_all_expenses to surface payer_source_split for the
-- last 3 UNION branches: tea_shop_settlements, subcontract_payments,
-- material_purchase_expenses. After this migration, every payer-source-
-- bearing branch surfaces its row's split (if any).
```

- [ ] **Step 3: Apply locally (skip if Docker down)**

If `supabase status` shows up, `npm run db:reset` and verify with:

```sql
SELECT DISTINCT source_type
FROM v_all_expenses
WHERE payer_source_split IS NOT NULL
LIMIT 10;
```

If Docker is down, document the skip.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260524130000_v_all_expenses_final_split.sql
git commit -m "feat(db): surface payer_source_split for the final 3 v_all_expenses branches"
```

**Important:** if the timestamp `20260524130000` is taken (collision), bump by 10000 increments until clean.

---

## Task 2: `recordDeposit` accepts `PayerSourceInput`

**File:** `src/lib/services/engineerWalletV2.ts` (function `recordDeposit` around line 345)

Standard service migration pattern (mirrors Phase 2 `createMiscExpense`).

- [ ] **Step 1: Update the config interface**

Find `RecordDepositInput` (or equivalent — grep for it). Replace `payer_source` / `payer_name` / `custom_payer_name` fields with `payer: PayerSourceInput`.

- [ ] **Step 2: Update the insert body**

Before the insert:

```ts
import type { PayerSourceInput } from "@/types/settlement.types";
import { validatePayerSourceInput, toRpcArgs } from "@/lib/settlement/payerSource";

const payerCheck = validatePayerSourceInput(input.payer, input.amount);
if (!payerCheck.ok) {
  return { success: false, error: `Invalid payer source: ${payerCheck.reason}` };
}
const payerRpc = toRpcArgs(input.payer);
```

In the insert payload, replace legacy fields with:

```ts
payer_source: payerRpc.p_payer_source,
payer_name: payerRpc.p_payer_name,
payer_source_split: payerRpc.p_payer_source_split,
```

- [ ] **Step 3: Update `walletService.ts:recordDeposit` if separate**

`src/lib/services/walletService.ts:228` has another `recordDeposit`. Check whether it's used or legacy. If used, apply the same migration. If legacy (no callers), leave with a `TODO(payer-split-followup)` marker.

- [ ] **Step 4: Type-check**

`npx tsc --noEmit` — the 2 wallet-deposit dialogs (Task 5, 6) will error. That's expected.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/engineerWalletV2.ts <walletService.ts if updated>
git commit -m "feat(wallet): recordDeposit accepts PayerSourceInput"
```

---

## Task 3: Wire `PayerSourceSplitInput` into `AddFundsDialog`

**File:** `src/components/wallet-v2/AddFundsDialog.tsx`

Standard wire-in (Phase 3 pattern). The dialog currently has `payerSource` state (default `"trust_account"` at line 79).

- [ ] **Step 1: Replace state**

```tsx
const [payer, setPayer] = useState<PayerSourceInput>({
  mode: "single",
  source: "trust_account",
});
```

(Note: default is `trust_account`, not `own_money` — wallet deposits come from a specific source per existing UX.)

Remove old `payerSource`, `customPayerName`, and related setters.

Add imports.

- [ ] **Step 2: Replace `<PayerSourceSelector>` (around line 310)** with `<PayerSourceSplitInput value={payer} onChange={setPayer} total={amount} siteId={selectedSite?.id} disabled={loading} />`.

- [ ] **Step 3: Update submit handler**

The dialog calls `recordDeposit` (Task 2). Pass `payer` instead of legacy fields. Add validator guard before submit. Match the file's existing setter/flag names.

- [ ] **Step 4: Submit-button disable + inline error** — standard pattern.

- [ ] **Step 5: Type-check** — should be clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/wallet-v2/AddFundsDialog.tsx
git commit -m "feat(wallet): AddFundsDialog uses PayerSourceSplitInput"
```

---

## Task 4: Wire `PayerSourceSplitInput` into `EditDepositDialog`

**File:** `src/components/wallet-v2/EditDepositDialog.tsx`

Same as Task 3, but EDIT mode — hydrate from `deposit.payer_source_split` if present.

- [ ] **Step 1: Replace state with hydration**

```tsx
const [payer, setPayer] = useState<PayerSourceInput>(() => {
  if (deposit.payer_source_split && deposit.payer_source_split.length > 0) {
    return { mode: "split", rows: deposit.payer_source_split };
  }
  return {
    mode: "single",
    source: (deposit.payer_source as PayerSource) ?? "trust_account",
    name: deposit.payer_name ?? undefined,
  };
});
```

If the deposit (or wallet-transaction) type doesn't include `payer_source_split`, extend it (likely in `src/types/wallet.types.ts`).

- [ ] **Step 2: Replace `<PayerSourceSelector>` JSX** with `<PayerSourceSplitInput>`.

- [ ] **Step 3: Update the save path** — call `toRpcArgs(payer)` and write all three columns. Validator guard.

- [ ] **Step 4: Submit-button + inline error.**

- [ ] **Step 5: Type-check.**

- [ ] **Step 6: Commit**

```bash
git add src/components/wallet-v2/EditDepositDialog.tsx <types-file-if-extended>
git commit -m "feat(wallet): EditDepositDialog allows editing payer-source as a split"
```

---

## Task 5: Wire `PayerSourceSplitInput` into `TeaShopSettlementDialog`

**File:** `src/components/tea-shop/TeaShopSettlementDialog.tsx`

The dialog at line 140 has `payerSource` state (default `"own_money"`). At line 578-580 it writes `payer_source` + `payer_name` directly into the insert. At line 1059 the `PayerSourceSelector` is rendered.

- [ ] **Step 1: Inspect the data flow**

Find which hook/service the dialog calls (`useCombinedTeaShop.ts` or similar). Determine whether it spreads `...data` into the insert or constructs the payload explicitly. If spread: extend the form-data type. If explicit: also update the hook's insert payload.

- [ ] **Step 2: Replace state** — standard pattern.

- [ ] **Step 3: Replace `<PayerSourceSelector>` (line 1059)** with `<PayerSourceSplitInput>`.

- [ ] **Step 4: Update the insert (line 578-580)** — call `toRpcArgs(payer)` and write all three columns.

If editing an existing settlement (the dialog at line 206 hydrates from `settlement.payer_source`), also hydrate from `payer_source_split` first.

- [ ] **Step 5: Validator guard + submit-button + inline error** — standard pattern.

- [ ] **Step 6: Update tea-shop row TS type** — extend `TeaShopSettlement` (or equivalent) with `payer_source_split?: PayerSourceSplitRow[] | null` in `src/types/tea-shop.types.ts` or wherever it lives.

- [ ] **Step 7: Type-check.**

- [ ] **Step 8: Commit**

```bash
git add src/components/tea-shop/TeaShopSettlementDialog.tsx <types-file> <hook-file-if-updated>
git commit -m "feat(tea-shop): TeaShopSettlementDialog uses PayerSourceSplitInput"
```

---

## Task 6: Wire `PayerSourceSplitInput` into `GroupTeaShopSettlementDialog`

**File:** `src/components/tea-shop/GroupTeaShopSettlementDialog.tsx`

Same pattern as Task 5 for the group variant. Writes to `tea_shop_group_settlements` table. The hook is likely `useGroupTeaShop.ts`.

The dialog at line 114 has `payerSource` state; at line 281 passes it to the mutation.

- [ ] **Step 1**: Replace state.
- [ ] **Step 2**: Replace `<PayerSourceSelector>`.
- [ ] **Step 3**: Update the submit payload to pass `payer` (or `toRpcArgs(payer)` if direct insert).
- [ ] **Step 4**: Validator + submit-button + inline error.
- [ ] **Step 5**: Extend `TeaShopGroupSettlement` TS type if not already done in Task 5.
- [ ] **Step 6**: Type-check.
- [ ] **Step 7**: Commit

```bash
git add src/components/tea-shop/GroupTeaShopSettlementDialog.tsx <related-files>
git commit -m "feat(tea-shop): GroupTeaShopSettlementDialog uses PayerSourceSplitInput"
```

---

## Task 7: Wire `PayerSourceSplitInput` into `MaterialSettlementDialog`

**File:** `src/components/materials/MaterialSettlementDialog.tsx`

The dialog at line 127 has `payerSource` state. It has interesting site-engineer logic at line 183-186 (auto-sets `payerSource` from deposit attribution).

- [ ] **Step 1: Replace state** — preserve the auto-deposit-attribution logic: convert it to set `payer: { mode: "single", source: depositSourceQuery.data.payer_source }`.

- [ ] **Step 2: Replace `<PayerSourceSelector>` JSX** (find via grep) with `<PayerSourceSplitInput>`. If the dialog rendered the picker conditionally for site engineers (the existing pattern in Phase 1-3), preserve the gate.

- [ ] **Step 3: Update the insert payload (around line 264)** — call `toRpcArgs(payer)` and write all three columns.

**Important:** `material_purchase_expenses` uses `settlement_payer_source` (not `payer_source`) as the legacy single-source column. The new column is `payer_source_split`. Check the insert payload — if it writes `settlement_payer_source`, that's the column to use for the sentinel `"split"` string when in split mode (not `payer_source`).

- [ ] **Step 4: Validator + submit-button + inline error.**

- [ ] **Step 5: Type-check.**

- [ ] **Step 6: Commit**

```bash
git add src/components/materials/MaterialSettlementDialog.tsx <related-files>
git commit -m "feat(materials): MaterialSettlementDialog uses PayerSourceSplitInput"
```

---

## Task 8: Wire `PayerSourceSplitInput` into `InitiateBatchSettlementDialog`

**File:** `src/components/materials/InitiateBatchSettlementDialog.tsx`

Same domain (`material_purchase_expenses`) as Task 7. This dialog likely initiates a batch settlement (a per-material-batch insert). It may call `process_batch_settlement` RPC.

- [ ] **Step 1**: Inspect the data flow — does it call a service function (e.g., `processBatchSettlement` in `materialPurchaseService.ts`)? Or direct insert?
- [ ] **Step 2**: Replace state.
- [ ] **Step 3**: Replace `<PayerSourceSelector>`.
- [ ] **Step 4**: Update the insert/service call.
- [ ] **Step 5**: Validator + submit-button + inline error.
- [ ] **Step 6**: If a service / RPC was identified that takes `payer_source` + `payer_name`, extend it to also accept `payer: PayerSourceInput` (or `p_payer_source_split` parameter). Update its insert/update body.
- [ ] **Step 7**: Type-check.
- [ ] **Step 8**: Commit

```bash
git add src/components/materials/InitiateBatchSettlementDialog.tsx <service-file-if-touched>
git commit -m "feat(materials): InitiateBatchSettlementDialog uses PayerSourceSplitInput"
```

> **Note:** the `process_batch_settlement` RPC was migrated in `20260516120000_process_batch_settlement_payer_source.sql` to accept a `p_settlement_payer_source` parameter. If this dialog calls that RPC, you may need to extend the RPC signature with `p_payer_source_split jsonb DEFAULT NULL` in a follow-up migration — out of scope here unless type-check forces it. If the RPC doesn't need extension (e.g., the column write happens TS-side), skip the migration.

---

## Task 9: Wire 4 settlement edit dialogs

Reshape the 4 remaining edit dialogs to use `PayerSourceSplitInput` for editing payer source as a split. These all currently use `PayerSourceSelector`.

- [ ] **Sub-task 9a: `DateSettlementsEditDialog.tsx`** (lines 38, 176, 308, 619)
- [ ] **Sub-task 9b: `DailySettlementEditDialog.tsx`**
- [ ] **Sub-task 9c: `ContractSettlementEditDialog.tsx`**
- [ ] **Sub-task 9d: `WeekSettlementsDialogV3.tsx`**

For each:
1. Replace `selectedPayerSource` (or equivalent) state with `payer: PayerSourceInput`. Hydrate from `payer_source_split` if present.
2. Replace `<PayerSourceSelector>` with `<PayerSourceSplitInput value={payer} onChange={setPayer} total={<amount>} ... />`.
3. Update the save path — direct supabase update — to write all three columns via `toRpcArgs`.
4. Display chips (around lines 408-413 in DateSettlementsEditDialog): replace `<Chip label={getPayerSourceLabel(...)}>` with `<PayerSourceChip row={{ payer_source: record.moneySource, payer_name: record.moneySourceName, payer_source_split: record.payerSourceSplit ?? null }} />`. (Note: `DailyPaymentRecord.payerSourceSplit` was added in Phase 2 Task 10. Verify it's threaded through to these dialogs' record shape.)
5. Submit-button disable + inline error.
6. Type-check.
7. Commit each sub-task separately:

```bash
git add src/components/payments/<dialog>.tsx
git commit -m "feat(payments): <Dialog> uses PayerSourceSplitInput (Phase 4)"
```

If multiple dialogs share row-types or hooks that need extension, do those once in the first sub-task and the rest pick them up.

---

## Task 10: Final pass — typecheck, build, vitest, mop-up

- [ ] **Step 1: Full type-check**

```bash
npx tsc --noEmit
```

Expected: no new errors. Pre-existing errors in test files (Phase 1 noted: ScopePill, InventoryCardGrid, BrandVariantMatrix, RentalCostBreakdown.test) tolerated.

If new errors surface (likely in display surfaces that read `payer_source` from the affected domains), apply minimal fixes:
- If a display component reads `record.payer_source` + `record.payer_name` directly, swap to `PayerSourceChip` or `formatPayerSource`.
- If a service or hook still has a legacy field, wrap with a single-source `PayerSourceInput`.

- [ ] **Step 2: Vitest**

```bash
npx vitest run
```

Expected: green. Any tests broken by the dialog changes need surgical updates.

- [ ] **Step 3: Production build**

```bash
npm run build
```

Expected: passes (or env-only static-prerender failure documented).

- [ ] **Step 4: Commit any incidental fixes**

```bash
git add <file>
git commit -m "fix(payer-source-split-phase4): <description>"
```

---

## What ships after Phase 4 (= complete)

- All 13 write dialogs use `PayerSourceSplitInput` (Phases 1+2+3+4):
  - Phase 1: PaymentDialog
  - Phase 2: MestriSettleDialog, MiscExpenseDialog, UnifiedSettlementDialog, ContractPaymentRecordDialog
  - Phase 3: RentalSettlementDialog, RentalAdvanceDialog, HistoricalRentalDialog, MultiPartySettlementDialog (single-source), RentalSettleViaWallet
  - Phase 4: TeaShopSettlementDialog, GroupTeaShopSettlementDialog, MaterialSettlementDialog, InitiateBatchSettlementDialog, AddFundsDialog, EditDepositDialog
- All 5 edit dialogs support editable splits (Phase 2 SettlementEditDialog + Phase 3 RentalSettlementEditDialog + Phase 4 DateSettlementsEditDialog / DailySettlementEditDialog / ContractSettlementEditDialog / WeekSettlementsDialogV3).
- All 8 payer-source-bearing domains surface splits via `v_all_expenses`: settlement_groups, misc_expenses, tea_shop_settlements, tea_shop_group_settlements, material_purchase_expenses, rental_settlements, rental_advances, site_engineer_transactions (via wallet deposit edit).
- Subcontract payments are settlement_groups rows (already covered in Phase 1).

## Final out-of-scope

- `MoneySourceSummaryCard` rollup aggregation — component has no consumers; skip unless wired up later.
- Magic-string `PAYER_SOURCES` cleanup in `MultiPartySettlementDialog` — separate refactor; tracked in Phase 3 review.
- Deletion of unused `processRentalAdvance` / `processRentalSettlement` — separate cleanup.
- PDF/export consumers — these read from `v_all_expenses.payer_source_split` going forward; downstream rendering may need updates as users adopt splits.
- Per-party split UI in `MultiPartySettlementDialog` — UX rethink needed.

## Move-to-prod note

After Phase 4 lands locally, apply these migrations in order before pushing the code:
1. `20260523140000_payer_source_split_foundation.sql` (already in prod via Phase 1)
2. `20260523140100_create_settlement_group_split.sql` (Phase 1)
3. `20260523140200_v_all_expenses_settlement_split.sql` (Phase 1)
4. `20260523150000_v_all_expenses_misc_split.sql` (Phase 2)
5. `20260524120000_v_all_expenses_rental_split.sql` (Phase 3)
6. `20260524130000_v_all_expenses_final_split.sql` (Phase 4 — this plan)

Plus any RPC extensions for `process_batch_settlement` if Task 8 needed one.
