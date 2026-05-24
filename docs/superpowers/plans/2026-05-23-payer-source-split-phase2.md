# Multi-Source Payer Split — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the multi-source payer-split feature to the salary-contract path (`MestriSettleDialog`, `UnifiedSettlementDialog`, `ContractPaymentRecordDialog`) and to misc expenses (`MiscExpenseDialog`), then surface splits in the read-side display components. Also finish removing "Via Site Engineer" from the two remaining channel-bearing dialogs.

**Architecture:** Phase 1 shipped the JSONB column on 8 domain tables, the shared SQL validator, the TS helpers (`toRpcArgs`, `validatePayerSourceInput`, `formatPayerSource`), and the `PayerSourceSplitInput` + `PayerSourceChip` components. Phase 2 wires those into 4 more write dialogs, extends `v_all_expenses` for misc_expenses, and updates 3 read-side surfaces to render splits.

**Tech Stack:** PostgreSQL JSONB, MUI v7, React 19, Vitest + React Testing Library, TanStack Query.

**Spec:** [docs/superpowers/specs/2026-05-23-payer-source-split-design.md](../specs/2026-05-23-payer-source-split-design.md)
**Phase 1 plan:** [docs/superpowers/plans/2026-05-23-payer-source-split-phase1.md](2026-05-23-payer-source-split-phase1.md)

---

## File map

**Create:**
- `supabase/migrations/20260523150000_v_all_expenses_misc_split.sql` — extend view's `misc_expenses` subquery to surface `payer_source_split`

**Modify:**
- `src/lib/services/settlementService.ts` — `processContractPayment` accepts `payer: PayerSourceInput`; drop `// TODO(payer-split-phase-2)` marker
- `src/lib/services/miscExpenseService.ts` — `createMiscExpense` + `updateMiscExpense` accept `payer: PayerSourceInput`, write `payer_source_split` JSONB
- `src/components/payments/MestriSettleDialog.tsx` — replace `PayerSourceSelector` with `PayerSourceSplitInput`; reshape submit to pass `payer`
- `src/components/expenses/MiscExpenseDialog.tsx` — replace `PayerSourceSelector` with `PayerSourceSplitInput`; reshape submit to pass `payer`
- `src/components/settlement/UnifiedSettlementDialog.tsx` — replace `PayerSourceSelector`, reshape submit; remove "Via Site Engineer" channel toggle + engineer selector + `paymentChannel === "engineer_wallet"` branches
- `src/components/payments/ContractPaymentRecordDialog.tsx` — same wire-in + Via-Engineer removal as UnifiedSettlementDialog
- `src/components/payments/SettlementEditDialog.tsx` — swap `PayerSourceSelector` for `PayerSourceSplitInput`; the existing edit-update flow (which sets `payer_source` directly) now also writes `payer_source_split`
- `src/components/expenses/MiscExpenseViewDialog.tsx` — render via `PayerSourceChip` (handles single + split)
- `src/components/payments/SalarySettlementTable.tsx` — render row chip via `PayerSourceChip` for rows where the parent `settlement_group.payer_source = 'split'`

**Out of scope (Phase 3):** Tea shop, Materials, Rentals, Wallet-deposit dialogs; `MoneySourceSummaryCard` rollup; edit dialogs beyond `SettlementEditDialog`; PDF/export consumers.

---

## Task 1: View migration — extend `v_all_expenses` for misc_expenses splits

**Files:**
- Create: `supabase/migrations/20260523150000_v_all_expenses_misc_split.sql`

Phase 1's view migration (`20260523140200_v_all_expenses_settlement_split.sql`) populated `payer_source_split` only for the 5 `settlement_groups` UNION branches; the other 7 branches still hardcode `NULL::jsonb AS row_payer_source_split`. This task wires the `misc_expenses` branch to read its own `payer_source_split` column.

- [ ] **Step 1: Locate the current view body**

```bash
ls supabase/migrations/*v_all_expenses*.sql | sort | tail -3
```

The latest is `20260523140200_v_all_expenses_settlement_split.sql`. Read it end-to-end — the new migration republishes the same `CREATE OR REPLACE VIEW` with one projection swap in the `misc_expenses` subquery.

- [ ] **Step 2: Identify the misc_expenses branch**

In the Phase 1 migration, find the `UNION ALL` branch whose `FROM` clause references `misc_expenses` (table alias is typically `me`). It currently has `NULL::jsonb AS row_payer_source_split`. Capture the branch's `FROM`/`JOIN` chain verbatim — only the projection changes.

- [ ] **Step 3: Write the new migration**

Create `supabase/migrations/20260523150000_v_all_expenses_misc_split.sql` with the SAME view body as `20260523140200_v_all_expenses_settlement_split.sql`, with one diff: the `misc_expenses` branch's projection changes from `NULL::jsonb AS row_payer_source_split` to `me.payer_source_split AS row_payer_source_split` (where `me` is the actual table alias — verify in step 2).

Header comment:

```sql
-- Phase 2: extend v_all_expenses to surface misc_expenses.payer_source_split.
-- The 5 settlement_groups branches were wired in Phase 1
-- (20260523140200_v_all_expenses_settlement_split.sql); this migration
-- adds the misc_expenses branch. The other 5 branches (tea_shop_settlements,
-- subcontract_payments, material_purchase_expenses, rental_settlements,
-- rental_advances) stay on NULL and get wired in Phase 3.
```

The trailing `SELECT base.*, COALESCE(base.row_payer_source_split, <Phase 4 fallback>) AS payer_source_split FROM base;` block is unchanged.

- [ ] **Step 4: Apply locally (skip if Docker down)**

Check `npx supabase status`. If up, run `npm run db:reset` then:

```sql
-- Should return the misc_expenses row's payer_source_split JSONB (or NULL)
SELECT id, source_type, payer_source, payer_source_split
FROM v_all_expenses
WHERE source_type = 'misc_expense' AND payer_source = 'split'
ORDER BY created_at DESC
LIMIT 3;
```

If Docker is down, document the skip — the controller applies at integration time.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260523150000_v_all_expenses_misc_split.sql
git commit -m "feat(db): surface payer_source_split from misc_expenses in v_all_expenses"
```

---

## Task 2: `processContractPayment` accepts `PayerSourceInput`

**Files:**
- Modify: `src/lib/services/settlementService.ts`

`processContractPayment` writes contract weekly settlements via the same `create_settlement_group` RPC that Phase 1 already extended. Only the TS signature needs updating.

- [ ] **Step 1: Locate the function**

Search for `export async function processContractPayment(` in `settlementService.ts`. It currently has a config shape:

```ts
{
  ...
  payerSource: PayerSource;
  customPayerName?: string;
  ...
}
```

And a `// TODO(payer-split-phase-2): migrate to PayerSourceInput` marker above it.

- [ ] **Step 2: Update the config shape**

Replace:

```ts
payerSource: PayerSource;
customPayerName?: string;
```

with:

```ts
payer: PayerSourceInput;
```

Remove the `// TODO(payer-split-phase-2)` marker.

- [ ] **Step 3: Update the RPC call site**

Inside `processContractPayment`, find the `supabase.rpc('create_settlement_group', { ... })` call (or `createSettlementWithRetry`). Before the call, add validation:

```ts
const payerCheck = validatePayerSourceInput(config.payer, config.amount);
if (!payerCheck.ok) {
  return { success: false, error: `Invalid payer source: ${payerCheck.reason}` };
}
const payerRpc = toRpcArgs(config.payer);
```

In the params object, replace `p_payer_source: config.payerSource` and `p_payer_name: requiresPayerName(config.payerSource) ? config.customPayerName : null` with:

```ts
p_payer_source: payerRpc.p_payer_source,
p_payer_name: payerRpc.p_payer_name,
p_payer_source_split: payerRpc.p_payer_source_split,
```

Imports already include `toRpcArgs` and `validatePayerSourceInput` from Phase 1's `processSettlement` work — no new imports needed.

- [ ] **Step 4: Type-check**

`npx tsc --noEmit` will surface callers of `processContractPayment` that still pass `payerSource` / `customPayerName`. The known callers are `MestriSettleDialog`, `ContractPaymentRecordDialog`, `UnifiedSettlementDialog`, and the weekly-payment branch of `PaymentDialog` (currently has the Phase 2 guard). They get reshaped in subsequent tasks.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/settlementService.ts
git commit -m "feat(settlement): processContractPayment accepts PayerSourceInput"
```

---

## Task 3: `createMiscExpense` / `updateMiscExpense` accept `PayerSourceInput`

**Files:**
- Modify: `src/lib/services/miscExpenseService.ts`

Misc expenses are written by direct table inserts from `miscExpenseService.ts` (not an atomic RPC). The split lives entirely in the TS service + the table's JSONB column (and CHECK constraint, already in place from Phase 1).

- [ ] **Step 1: Update `createMiscExpense` signature**

In `src/lib/services/miscExpenseService.ts` find the `createMiscExpense` function. Its `formData` parameter currently includes `payer_source: PayerSource` and `custom_payer_name?: string`. Replace those two fields with:

```ts
payer: PayerSourceInput;
```

Imports: add `PayerSourceInput, PayerSourceSplitRow` from `@/types/settlement.types`; add `validatePayerSourceInput, toRpcArgs` from `@/lib/settlement/payerSource`.

- [ ] **Step 2: Update the insert**

Before the existing `expenseData` construction, validate:

```ts
const payerCheck = validatePayerSourceInput(formData.payer, formData.amount);
if (!payerCheck.ok) {
  return { success: false, error: `Invalid payer source: ${payerCheck.reason}` };
}
const payerRpc = toRpcArgs(formData.payer);
```

In `expenseData`, replace:

```ts
payer_source: formData.payer_source,
payer_name: (formData.payer_source === "custom" || formData.payer_source === "other_site_money")
  ? formData.custom_payer_name
  : null,
```

with:

```ts
payer_source: payerRpc.p_payer_source,
payer_name: payerRpc.p_payer_name,
payer_source_split: payerRpc.p_payer_source_split,
```

Note: `payerRpc.p_payer_source_split` is `PayerSourceSplitRow[] | null` — the Supabase JS client serialises it to JSONB on insert.

- [ ] **Step 3: Update `updateMiscExpense`**

Find the `updateMiscExpense` function. Its `updates` parameter has the same `payer_source` + `custom_payer_name` shape. Replace with `payer?: PayerSourceInput` (still optional — most edits don't touch payer).

Update the inner logic:

```ts
// Before
if (updates.payer_source) {
  updateData.payer_source = updates.payer_source;
  updateData.payer_name = (updates.payer_source === "custom" || updates.payer_source === "other_site_money")
    ? updates.custom_payer_name
    : null;
  delete updateData.custom_payer_name;
}

// After
if (updates.payer) {
  const payerCheck = validatePayerSourceInput(updates.payer, updates.amount ?? 0);
  // amount may not be in updates; if it isn't, skip the sum check by passing 0
  // — the SQL CHECK constraint and the form's submit-side validation are the
  // true safety nets. The TS check here catches missing names and duplicate
  // sources without needing the amount.
  if (!payerCheck.ok && updates.payer.mode === "split" && !payerCheck.reason.startsWith("split sum")) {
    return { success: false, error: `Invalid payer source: ${payerCheck.reason}` };
  }
  const payerRpc = toRpcArgs(updates.payer);
  updateData.payer_source = payerRpc.p_payer_source;
  updateData.payer_name = payerRpc.p_payer_name;
  updateData.payer_source_split = payerRpc.p_payer_source_split;
}
```

The "skip sum check if amount missing" carve-out exists because the legacy edit path lets users change `payer_source` without changing `amount`. The form's own submit validator (Task 5) enforces sum-to-total before the call. The SQL CHECK on the column rejects malformed shapes regardless.

- [ ] **Step 4: Type-check**

`npx tsc --noEmit` — `MiscExpenseDialog` will error because it still passes the old shape. Task 5 fixes that.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/miscExpenseService.ts
git commit -m "feat(misc-expense): service accepts PayerSourceInput, writes payer_source_split"
```

---

## Task 4: Wire `PayerSourceSplitInput` into `MestriSettleDialog`

**Files:**
- Modify: `src/components/payments/MestriSettleDialog.tsx`

`MestriSettleDialog` is the single-mesthri contract settlement (called from `/site/payments` for contract laborer weekly settles).

- [ ] **Step 1: Replace state**

Find the existing state declarations near the top of the component:

```tsx
const [payerSource, setPayerSource] = useState<PayerSource>("own_money");
const [customPayerName, setCustomPayerName] = useState<string>("");
```

Replace with:

```tsx
const [payer, setPayer] = useState<PayerSourceInput>({
  mode: "single",
  source: "own_money",
});
```

Add import: `import type { PayerSourceInput } from "@/types/settlement.types";`.

If a reset effect re-initializes the legacy fields (e.g. on dialog reopen), update it to reset `payer` to `{ mode: "single", source: "own_money" }`.

- [ ] **Step 2: Replace the selector JSX**

Find:

```tsx
<PayerSourceSelector
  value={payerSource}
  customName={customPayerName}
  onChange={setPayerSource}
  onCustomNameChange={setCustomPayerName}
  ...
/>
```

Replace with:

```tsx
<PayerSourceSplitInput
  value={payer}
  onChange={setPayer}
  total={amount}
  siteId={siteId}
  disabled={submitting}
/>
```

Where `amount` is the local state holding the settlement amount (already exists; verify the variable name in the file). `siteId` is the dialog's `siteId` prop.

Add imports:

```tsx
import PayerSourceSplitInput from "@/components/settlement/PayerSourceSplitInput";
import { validatePayerSourceInput } from "@/lib/settlement/payerSource";
```

Remove `import PayerSourceSelector from "@/components/settlement/PayerSourceSelector";` if no other usage remains in the file.

- [ ] **Step 3: Update submit handler**

Find the `processContractPayment` call. Replace `payerSource: ..., customPayerName: ...` with `payer`. Also delete the inline `customPayerName: payerSource === "custom" || payerSource === "other_site_money" ? customPayerName : undefined` ternary — `toRpcArgs` handles that.

Before the call, add a guard:

```tsx
const payerCheck = validatePayerSourceInput(payer, amount);
if (!payerCheck.ok) {
  setError(payerCheck.reason);
  setSubmitting(false);
  return;
}
```

- [ ] **Step 4: Submit-button disable + inline error**

In the submit button JSX, add `!validatePayerSourceInput(payer, amount).ok` to the disabled condition:

```tsx
disabled={submitting || !validatePayerSourceInput(payer, amount).ok}
```

For inline error display (only when in split mode), find the existing `error` rendering and add a sibling:

```tsx
{(() => {
  const c = validatePayerSourceInput(payer, amount);
  return !c.ok && payer.mode === "split" ? (
    <Typography variant="caption" color="error.main">{c.reason}</Typography>
  ) : null;
})()}
```

- [ ] **Step 5: Type-check**

`npx tsc --noEmit` — `MestriSettleDialog.tsx` should now be clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/payments/MestriSettleDialog.tsx
git commit -m "feat(payments): MestriSettleDialog uses PayerSourceSplitInput"
```

---

## Task 5: Wire `PayerSourceSplitInput` into `MiscExpenseDialog`

**Files:**
- Modify: `src/components/expenses/MiscExpenseDialog.tsx`

`MiscExpenseDialog` handles both create and edit of misc expenses. The dialog currently uses the legacy `payerSource` / `customPayerName` shape and passes them through to `createMiscExpense` / `updateMiscExpense`.

- [ ] **Step 1: Replace state**

Find:

```tsx
const [payerSource, setPayerSource] = useState<PayerSource>("own_money");
const [customPayerName, setCustomPayerName] = useState<string>("");
```

Replace with:

```tsx
const [payer, setPayer] = useState<PayerSourceInput>({
  mode: "single",
  source: "own_money",
});
```

Add import: `import type { PayerSourceInput } from "@/types/settlement.types";`.

In the edit-mode hydration (look for `if (expense)` near where `setPayerSource(expense.payer_source ...)` is called), rebuild the `payer` from the expense row:

```tsx
if (expense.payer_source_split && expense.payer_source_split.length > 0) {
  setPayer({ mode: "split", rows: expense.payer_source_split });
} else {
  setPayer({
    mode: "single",
    source: (expense.payer_source as PayerSource) ?? "own_money",
    name: expense.payer_name ?? undefined,
  });
}
```

This assumes `expense.payer_source_split` is on the misc-expense row type. If the TS type for `MiscExpense` doesn't yet include the column, add it: in whichever types file declares `MiscExpense`, add `payer_source_split?: PayerSourceSplitRow[] | null;`.

- [ ] **Step 2: Replace the selector JSX**

Find:

```tsx
<PayerSourceSelector
  value={payerSource}
  customName={customPayerName}
  onChange={setPayerSource}
  onCustomNameChange={setCustomPayerName}
  ...
/>
```

Replace with:

```tsx
<PayerSourceSplitInput
  value={payer}
  onChange={setPayer}
  total={amount}
  siteId={selectedSite?.id}
  disabled={loading}
/>
```

Imports: add `PayerSourceSplitInput` from `@/components/settlement/PayerSourceSplitInput`, add `validatePayerSourceInput` from `@/lib/settlement/payerSource`. Remove `PayerSourceSelector` import if no longer used.

- [ ] **Step 3: Update submit handler**

The dialog calls either `createMiscExpense` (new) or `updateMiscExpense` (edit). Both signatures changed in Task 3 — they now expect `payer: PayerSourceInput` instead of `payer_source` / `custom_payer_name`.

For `createMiscExpense`:

```tsx
const result = await createMiscExpense(supabase, {
  siteId: selectedSite?.id || "",
  formData: {
    ...existing fields...
    payer,
    payer_type: payerType,
    site_engineer_id: selectedEngineerId,
    subcontract_id: subcontractId || null,
    notes,
  },
  ...
});
```

For `updateMiscExpense`:

```tsx
const result = await updateMiscExpense(
  supabase,
  expense.id,
  {
    ...existing fields...
    payer,
    ...rest...
  },
  ...
);
```

Before either call, validate:

```tsx
const payerCheck = validatePayerSourceInput(payer, amount);
if (!payerCheck.ok) {
  setError(payerCheck.reason);
  setLoading(false);
  return;
}
```

- [ ] **Step 4: Submit-button disable + inline error**

Submit button:

```tsx
disabled={loading || !validatePayerSourceInput(payer, amount).ok}
```

Inline error display in split mode (placement consistent with how the dialog currently shows `error`):

```tsx
{(() => {
  const c = validatePayerSourceInput(payer, amount);
  return !c.ok && payer.mode === "split" ? (
    <Typography variant="caption" color="error.main">{c.reason}</Typography>
  ) : null;
})()}
```

- [ ] **Step 5: Update existing tests**

`src/components/expenses/MiscExpenseDialog.test.tsx` has tests that check whether the legacy payer-source UI renders for admin vs site_engineer (`hides WHO IS PAYING radios for site engineers`, etc.). The test asserts behavior of `PayerSourceSelector`. After replacement, `PayerSourceSplitInput` wraps the selector — the same outer assertions ("radios are visible" / "are hidden") still hold because in single mode the wrapper is transparent. Run the test file and update any assertion that specifically queries by `name=/payer source/i` only if it breaks.

```bash
npx vitest run src/components/expenses/MiscExpenseDialog.test.tsx
```

Expected: passes after edits — if not, surgically adjust queries (don't rewrite the test logic).

- [ ] **Step 6: Type-check**

`npx tsc --noEmit` — file should be clean.

- [ ] **Step 7: Commit**

```bash
git add src/components/expenses/MiscExpenseDialog.tsx
git commit -m "feat(expenses): MiscExpenseDialog uses PayerSourceSplitInput"
```

---

## Task 6: `UnifiedSettlementDialog` — wire-in + Via-Engineer removal

**Files:**
- Modify: `src/components/settlement/UnifiedSettlementDialog.tsx`

This dialog is the unified salary-settlement entry point (used for both single-date and weekly settlements). It currently has:
- `<PayerSourceSelector>` JSX
- "Payment Channel" toggle with Direct Payment / Via Site Engineer
- An engineer selector inside a `<Collapse in={paymentChannel === "engineer_wallet"}>` block
- A submit path that forks on `paymentChannel === "engineer_wallet"`

- [ ] **Step 1: Replace state**

Find the existing state declarations:

```tsx
const [moneySource, setMoneySource] = useState<PayerSource>("own_money");
const [customPayerName, setCustomPayerName] = useState<string>("");
```

(Variable names may be `payerSource` or `moneySource`; grep first and match.) Replace with:

```tsx
const [payer, setPayer] = useState<PayerSourceInput>({
  mode: "single",
  source: "own_money",
});
```

Add `import type { PayerSourceInput } from "@/types/settlement.types";`.

- [ ] **Step 2: Remove "Via Site Engineer" channel**

Find the `Payment Channel` `<ToggleButtonGroup>` block (around line 777 — search for `"Via Site Engineer"`):

```tsx
{!isSiteEngineer && (
  <Box sx={{ mb: 3 }}>
    <Typography variant="subtitle2" gutterBottom>Payment Channel</Typography>
    <ToggleButtonGroup ...>
      <ToggleButton value="direct">Direct Payment</ToggleButton>
      <ToggleButton value="engineer_wallet">Via Site Engineer</ToggleButton>
    </ToggleButtonGroup>
  </Box>
)}
```

Delete the entire block.

Hardcode the channel:

```tsx
// Before
const [paymentChannel, setPaymentChannel] = useState<PaymentChannel>("direct");

// After (keep the variable so downstream `paymentChannel` reads continue to work)
const paymentChannel: PaymentChannel = "direct";
```

Delete the engineer-selection `<Collapse in={paymentChannel === "engineer_wallet"}>` block (around line 803): its engineer dropdown, reference input, deposit-payer-source fetch effect, and any related state (`engineers`, `selectedEngineerId`, `engineerReference`, `loading`).

Delete the submit-side branches that check `paymentChannel === "engineer_wallet"`:
- The early-return at line 443 (`if (paymentChannel === "engineer_wallet" && !selectedEngineerId) return;`)
- The `engineerId` / `engineerReference` / `batchAllocations` fields in the config passed to `processSettlement` / `processContractPayment` (lines 472, 473, 479) — they're now always `undefined`.

In the `isSiteEngineerPayingFromWallet` call at line 750, hardcode `createWalletTransaction: false`.

- [ ] **Step 3: Replace the selector JSX**

Replace `<PayerSourceSelector ...>` with:

```tsx
<PayerSourceSplitInput
  value={payer}
  onChange={setPayer}
  total={amount}
  siteId={selectedSite?.id}
  disabled={settlementMutation.isPending}
/>
```

(Variable holding the total amount may be `amount` or `totalAmount` — match the file's existing usage.)

Imports: add `PayerSourceSplitInput`, add `validatePayerSourceInput`. Drop `PayerSourceSelector`, `WalletIcon`, `PaymentIcon`, `Collapse`, `ToggleButtonGroup`, `ToggleButton` if no other usage remains.

- [ ] **Step 4: Update submit handler**

The dialog forks between `processSettlement` (for date-wise daily/market) and `processContractPayment` (for contract). Both now accept `payer: PayerSourceInput` (Tasks 2 + Phase 1).

Replace `payerSource: ...` and `customPayerName: ...` fields with `payer` in both config-construction sites.

Before the fork, validate:

```tsx
const payerCheck = validatePayerSourceInput(payer, amount);
if (!payerCheck.ok) {
  setError(payerCheck.reason);
  return;
}
```

- [ ] **Step 5: Submit-button disable + inline error**

The submit button's `disabled` prop at line 930 currently has:

```tsx
(paymentChannel === "engineer_wallet" && !selectedEngineerId) || ...
```

Remove the `paymentChannel === "engineer_wallet"` clause and replace with the payer validity:

```tsx
disabled={settlementMutation.isPending || !validatePayerSourceInput(payer, amount).ok}
```

Add the inline-error display near the existing error rendering, scoped to split mode.

- [ ] **Step 6: Type-check**

`npx tsc --noEmit` — file should be clean.

- [ ] **Step 7: Commit**

```bash
git add src/components/settlement/UnifiedSettlementDialog.tsx
git commit -m "feat(settlement): UnifiedSettlementDialog uses PayerSourceSplitInput + drops Via-Engineer"
```

---

## Task 7: `ContractPaymentRecordDialog` — wire-in + Via-Engineer removal

**Files:**
- Modify: `src/components/payments/ContractPaymentRecordDialog.tsx`

Same pattern as Task 6.

- [ ] **Step 1: Replace state**

```tsx
// Before
const [payerSource, setPayerSource] = useState<PayerSource>("own_money");
const [customPayerName, setCustomPayerName] = useState<string>("");

// After
const [payer, setPayer] = useState<PayerSourceInput>({
  mode: "single",
  source: "own_money",
});
```

Add `import type { PayerSourceInput } from "@/types/settlement.types";`.

- [ ] **Step 2: Remove "Via Site Engineer" channel**

Same deletions as Task 6 Step 2 — find the `paymentChannel` toggle JSX, the engineer-selection `<Collapse>` block, the `paymentChannel === "engineer_wallet"` branches in the submit path, and the engineer-fetch effect. Hardcode `paymentChannel = "direct"`.

The dialog has an early-return at line 291 (`if (paymentChannel === "engineer_wallet" && !selectedEngineerId) return;`) — delete it.

- [ ] **Step 3: Replace the selector JSX**

```tsx
<PayerSourceSplitInput
  value={payer}
  onChange={setPayer}
  total={amount}
  siteId={selectedSite?.id}
  disabled={submitting}
/>
```

- [ ] **Step 4: Update submit handler**

The dialog calls `processContractPayment`. Replace the legacy two fields with `payer`:

```tsx
const result = await processContractPayment(supabase, {
  ...,
  payer,
  ...
});
```

Before the call, add the validator guard (same pattern as previous tasks).

- [ ] **Step 5: Submit-button disable + inline error**

Same pattern as Task 6 Step 5.

- [ ] **Step 6: Type-check**

`npx tsc --noEmit` — file should be clean.

- [ ] **Step 7: Commit**

```bash
git add src/components/payments/ContractPaymentRecordDialog.tsx
git commit -m "feat(payments): ContractPaymentRecordDialog uses PayerSourceSplitInput + drops Via-Engineer"
```

---

## Task 8: `SettlementEditDialog` — editable split

**Files:**
- Modify: `src/components/payments/SettlementEditDialog.tsx`

The edit dialog lets the user change `payer_source` on an existing settlement_group. After Phase 2 it must also let them switch between single and split, with the same validator gate.

- [ ] **Step 1: Replace state + hydration**

Find:

```tsx
const [moneySource, setMoneySource] = useState<PayerSource>(...);
```

Replace with a hydrated `payer`:

```tsx
const [payer, setPayer] = useState<PayerSourceInput>(() => {
  if (settlement.payer_source_split && settlement.payer_source_split.length > 0) {
    return { mode: "split", rows: settlement.payer_source_split };
  }
  return {
    mode: "single",
    source: (settlement.payer_source as PayerSource) ?? "own_money",
    name: settlement.payer_name ?? undefined,
  };
});
```

(Variable holding the current settlement may be `settlement` or `group`; verify in the file.)

If the TS type for the settlement_group doesn't include `payer_source_split`, add it.

- [ ] **Step 2: Replace selector JSX**

```tsx
<PayerSourceSplitInput
  value={payer}
  onChange={setPayer}
  total={settlement.total_amount}
  siteId={settlement.site_id}
  disabled={saving}
/>
```

- [ ] **Step 3: Update the save path**

The dialog likely updates the row via a direct supabase update or via a service function. Find the update payload — currently sets `payer_source` and `payer_name`. Now also set `payer_source_split`:

```tsx
const payerRpc = toRpcArgs(payer);
const updatePayload = {
  ...other fields...,
  payer_source: payerRpc.p_payer_source,
  payer_name: payerRpc.p_payer_name,
  payer_source_split: payerRpc.p_payer_source_split,
};
```

Add the validator guard before:

```tsx
const payerCheck = validatePayerSourceInput(payer, settlement.total_amount);
if (!payerCheck.ok) {
  setError(payerCheck.reason);
  return;
}
```

Imports: add `PayerSourceSplitInput`, `PayerSourceInput`, `toRpcArgs`, `validatePayerSourceInput`. Drop `PayerSourceSelector` if unused.

- [ ] **Step 4: Submit-button disable + inline error**

Same pattern as previous tasks.

- [ ] **Step 5: Type-check**

`npx tsc --noEmit` — clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/payments/SettlementEditDialog.tsx
git commit -m "feat(payments): SettlementEditDialog allows editing payer-source as a split"
```

---

## Task 9: `MiscExpenseViewDialog` — display split

**Files:**
- Modify: `src/components/expenses/MiscExpenseViewDialog.tsx`

The view dialog currently renders a single MUI `<Chip>` for the payer source:

```tsx
<Chip
  label={getPayerSourceLabel(expense.payer_source as PayerSource, expense.payer_name || undefined)}
  ...
/>
```

After Phase 2, it should render via `PayerSourceChip` so split rows show "Split (N)" with a tooltip breakdown.

- [ ] **Step 1: Replace the chip**

Find the existing `<Chip ...>` for payer source (around line 249). Replace with:

```tsx
<PayerSourceChip
  row={{
    payer_source: expense.payer_source,
    payer_name: expense.payer_name,
    payer_source_split: expense.payer_source_split ?? null,
  }}
  size="small"
/>
```

Import: `import PayerSourceChip from "@/components/settlement/PayerSourceChip";`.

If the `MiscExpense` TS type doesn't include `payer_source_split`, add it (same as Task 5 Step 1).

- [ ] **Step 2: Type-check**

`npx tsc --noEmit` — clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/expenses/MiscExpenseViewDialog.tsx
git commit -m "feat(expenses): MiscExpenseViewDialog renders splits via PayerSourceChip"
```

---

## Task 10: `SalarySettlementTable` — display split

**Files:**
- Modify: `src/components/payments/SalarySettlementTable.tsx`

The table renders a per-row chip for `record.moneySource`. After Phase 2, when the parent `settlement_group.payer_source` is `'split'`, the chip should reflect the split.

- [ ] **Step 1: Inspect the row type**

The table's rows come from a hook (likely `useSalaryWaterfall` or similar). The row currently has `moneySource: string` and `moneySourceName: string | null`. We need access to the parent settlement_group's `payer_source_split` JSONB. Two options:

A) **If the row already carries `payer_source_split`**: drop in `PayerSourceChip` directly with that field.

B) **If not**: extend the hook's query/selection to include `settlement_groups.payer_source_split`, then map it through to the row type. This is a 1-line SQL addition + 1-line type addition.

Inspect the hook to determine which case applies. If B, do the minimal extension.

- [ ] **Step 2: Replace the chip**

Find the existing `<Chip>` block (around line 970):

```tsx
{record.moneySource ? (
  <Chip
    label={getPayerSourceLabel(record.moneySource as PayerSource, record.moneySourceName || undefined)}
    ...
    color={getPayerSourceColor(record.moneySource as PayerSource)}
  />
) : ...}
```

Replace with:

```tsx
{record.moneySource ? (
  <PayerSourceChip
    row={{
      payer_source: record.moneySource,
      payer_name: record.moneySourceName,
      payer_source_split: record.payer_source_split ?? null,
    }}
    size="small"
  />
) : ...}
```

Import: `PayerSourceChip` from `@/components/settlement/PayerSourceChip`.

The legacy `getPayerSourceColor` color-coding goes away; `PayerSourceChip` uses MUI's default chip color. If color-coding is important, propose extending `PayerSourceChip` to accept a `color` prop in a follow-up — but for Phase 2 take the default.

- [ ] **Step 3: Update the grouping key**

The component groups rows by `moneySource + moneySourceName` (around line 353):

```tsx
const key = r.moneySource
  ? (r.moneySource === "other_site_money" || r.moneySource === "custom")
    ? `${r.moneySource}:${r.moneySourceName || ""}`
    : r.moneySource
  : "unspecified";
```

Split rows have `moneySource = "split"` — they should NOT collapse into a single "Split" group. Use the parent settlement_group ID (or a hash of the split JSONB) to keep them distinct. Simplest:

```tsx
const key = r.moneySource === "split"
  ? `split:${r.id ?? Math.random()}`  // each split row gets its own group
  : r.moneySource
    ? (r.moneySource === "other_site_money" || r.moneySource === "custom")
      ? `${r.moneySource}:${r.moneySourceName || ""}`
      : r.moneySource
    : "unspecified";
```

(Verify by reading the actual hook — `r.id` may not exist. If it doesn't, use a stable JSON-serialised split as the key suffix.)

- [ ] **Step 4: Type-check**

`npx tsc --noEmit` — clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/payments/SalarySettlementTable.tsx
git commit -m "feat(payments): SalarySettlementTable renders splits via PayerSourceChip"
```

---

## Task 11: Final pass — typecheck, build, vitest

- [ ] **Step 1: Full type-check**

```bash
npx tsc --noEmit
```

Expected: no new errors in Phase 2 files. Pre-existing errors in unrelated test files (`ScopePill.test.tsx`, `InventoryCardGrid.test.tsx`, `BrandVariantMatrix.test.tsx`) are tolerated — see Phase 1 plan's same note.

- [ ] **Step 2: Vitest**

```bash
npx vitest run
```

Expected: green. If any tests broke, look at whether they were testing the old payer-source-selector shape and need a surgical update.

- [ ] **Step 3: Production build**

```bash
npm run build
```

Expected: passes. If the build fails on static-prerender for missing `.env.local`, that's an environment issue, not a code issue — document the skip.

- [ ] **Step 4: Commit any incidental fixes**

If the build flagged a downstream caller missed earlier, fix and commit:

```bash
git add <file>
git commit -m "fix(payer-source-split): update <caller> for PayerSourceInput contract"
```

---

## What ships after Phase 2

- 5 of the 13 write dialogs now use `PayerSourceSplitInput`: `PaymentDialog` (Phase 1) + `MestriSettleDialog` + `MiscExpenseDialog` + `UnifiedSettlementDialog` + `ContractPaymentRecordDialog`.
- "Via Site Engineer" channel removed from all three channel-bearing dialogs (`PaymentDialog` in Phase 1; `UnifiedSettlementDialog` + `ContractPaymentRecordDialog` in Phase 2).
- `v_all_expenses` surfaces splits from `settlement_groups` (Phase 1) AND `misc_expenses` (Phase 2). The 5 remaining branches still return NULL for the new column.
- 3 read-side surfaces render splits: `SettlementEditDialog` (also lets you edit splits), `MiscExpenseViewDialog`, `SalarySettlementTable`.
- `processContractPayment` and `createMiscExpense` / `updateMiscExpense` accept `PayerSourceInput`.

## Out of scope (Phase 3)

- Tea shop (`TeaShopSettlementDialog`, `GroupTeaShopSettlementDialog`)
- Materials (`MaterialSettlementDialog`, `InitiateBatchSettlementDialog`)
- Rentals (`RentalSettlementDialog`, `RentalAdvanceDialog`, `HistoricalRentalDialog`)
- Wallet deposits (`AddFundsDialog`, `EditDepositDialog`)
- `v_all_expenses` extensions for the remaining 5 domains
- `MoneySourceSummaryCard` rollup aggregation
- Edit dialogs beyond `SettlementEditDialog` (e.g. `DateSettlementsEditDialog`, `DailySettlementEditDialog`, `ContractSettlementEditDialog`, `WeekSettlementsDialogV3`)
- PDF/export consumers
