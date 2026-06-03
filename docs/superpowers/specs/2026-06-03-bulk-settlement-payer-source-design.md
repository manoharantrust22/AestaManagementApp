# Payer source on advance / bulk settlements — design

**Date:** 2026-06-03
**Status:** Approved (ready for implementation plan)
**Scope:** Frontend + React Query hook only. **No migration** — the target columns already exist on `material_purchase_expenses`.

## Problem

The "Complete Bulk Settlement" dialog (group-stock advance-PO vendor payment) has no
payment-source selector. Admin/office users settling a bulk group-stock vendor payment
cannot attribute which money source paid the vendor (Own / Amma / Client / Trust / Other
site / custom), and cannot split it across sources — even though every other settlement
dialog in the app offers this via `PayerSourceSplitInput`.

Root cause: in `MaterialSettlementDialog.tsx` the payer-source block is gated behind
`!isPOAdvancePayment`. "Complete Bulk Settlement" is the `isGroupStockAdvancePO` case,
which *requires* `isPOAdvancePayment`, so the picker is never shown for any advance/bulk
flow.

A second, related gap: for the **admin/direct** path, `useRecordAdvancePayment` only stamps
`purchase_orders.advance_paid` and creates **no** `material_purchase_expenses` row — so there
is nowhere to persist a payer source. (The expense row is created only on the
**engineer-wallet** branch, and even there it is created *without* line items and *without*
a payer source.)

## Decisions (from brainstorming)

- **Picker style:** full parity — reuse `PayerSourceSplitInput` (single source by default,
  optional 2–3-way split).
- **Scope:** all advance-payment flows (group-stock "Complete Bulk Settlement" **and** the
  plain "Record Advance Payment" dialog).
- **Approach:** **A — Unified, no migration.** Materialize the `material_purchase_expenses`
  row (with line items + payer source) at payment time; rely on the delivery flow's existing
  skip-guard to avoid duplicates.

## Key facts established during investigation

- `material_purchase_expenses` already has `settlement_payer_source`,
  `settlement_payer_name`, and `payer_source_split` columns (written today by
  `useSettleMaterialPurchase`). → no migration needed.
- `purchase_orders` has `advance_paid` but **no** payer-source columns. Material-PO advances
  do **not** appear in `v_all_expenses` (only `settlement_groups` advances and
  `rental_advances` do).
- Both delivery hooks (`useRecordDelivery` ~L2270, `useRecordAndVerifyDelivery` ~L2888)
  look up an existing `material_purchase_expenses` row **by `purchase_order_id` for any PO**
  and **skip creation** (expense **and** its line items) if one exists. So creating the row
  early — for group **or** own-site POs — is safe from double-counting.
- Today's wallet branch of `useRecordAdvancePayment` creates the expense row **without**
  `material_purchase_expense_items` → delivery then skips item creation → the row never gets
  its items (breaks landed cost / material detail). This is a latent bug on the same code
  path we are touching, so we fix it here.

## Design

### 1. Dialog — `src/components/materials/MaterialSettlementDialog.tsx`

- Change the payer-source gate from `!isPOAdvancePayment && !isSiteEngineer` to
  **`!isSiteEngineer`**. Admin/office then see `PayerSourceSplitInput` on regular settle,
  group-stock vendor payment, **and** advance/bulk flows. Engineers remain on wallet-LIFO
  auto-attribution everywhere (unchanged).
- `siteId` passed to `PayerSourceSplitInput`: fall back to `purchaseOrder?.site_id` when
  `purchase` is null (the advance path). Keep `total = Number(amountPaid) || purchaseAmount`.
- In the advance branch of `handleSubmit`:
  - Run `validatePayerSourceInput(payer, finalAmountPaid)`; on failure set `error` and return.
  - Convert with `toRpcArgs(payer)` and pass `payer_source` (the `p_payer_source` value, may
    be the `"split"` sentinel), `payer_name`, and `payer_source_split` to
    `advancePaymentMutation.mutateAsync(...)`.
  - Pass `is_complete: isGroupStockAdvancePO` so the hook knows a bulk settlement is a full
    payment even if the amount was bargained below `total_amount`.
- Extend the submit-disabled logic so an invalid **split** also blocks the advance branch
  (mirror the existing regular-settle guard).

### 2. Hook — `useRecordAdvancePayment` (`src/hooks/queries/usePurchaseOrders.ts`)

New params on the mutation input:

```
payer_source?: PayerSource | "split";
payer_name?: string;
payer_source_split?: PayerSourceSplitRow[] | null;
is_complete?: boolean;   // dialog passes isGroupStockAdvancePO
```

Restructure the body so the `material_purchase_expenses` row is created/updated for **both**
the admin/direct path and the wallet path:

1. Look up an existing row by `purchase_order_id` (existing pattern).
2. Resolve `purchase_type` from the PO's `internal_notes.is_group_stock`
   (`"group_stock"` | `"own_site"`) plus its `site_group_id` / `payment_source_site_id`,
   exactly as the delivery hooks do.
3. Compute `isFullyPaid = is_complete || amount_paid >= total_amount`.
4. **Insert** (when no row exists) with:
   - identity/amount fields as today (`ref_code`, `site_id`, `vendor_id`, `vendor_name`,
     `purchase_date = payment_date`, `total_amount = po.total_amount`, `transport_cost`,
     `amount_paid`, group-stock tracking fields for group POs),
   - `status: "recorded"`,
   - `is_paid: isFullyPaid`, `paid_date: isFullyPaid ? payment_date : null`,
   - `payment_mode`, `payment_reference`, `payment_screenshot_url`, `notes`,
   - `payment_channel`: `"engineer_wallet"` (wallet path) or `"direct"` (admin path),
   - **`settlement_payer_source` / `settlement_payer_name` / `payer_source_split`** from the
     new params. (Wallet path writes the auto-attributed LIFO source it already computes.)
   - **`material_purchase_expense_items`** built from `po.items`
     (`{ purchase_expense_id, material_id, brand_id, unit_price, quantity }`) — fixes the
     missing-items gap for both paths.
   **Update** (when a row already exists) the payer-source columns + paid fields rather than
   inserting a duplicate (idempotent re-record).
5. Wallet path keeps its `recordSpend` debit + the existing roll-back-on-failure behavior
   (`engineer_transaction_id`, delete expense on wallet error).
6. Ordering for the **direct** path: create expense (+items) first; if it errors, **throw**
   (do not half-stamp `advance_paid`). On success, update `purchase_orders.advance_paid`
   (and `payment_terms`) as today.
7. `onSuccess`: keep the current `materialPurchases.all` + `purchaseOrders.bySite`
   invalidations; add the expenses/ledger query keys so the new row surfaces immediately on
   `/site/expenses` and the Material Hub.

### 3. Edge cases & known limitations

- **Engineers** never see the picker; wallet branch persists the LIFO source so wallet bulk
  settlements are attributed too.
- **Plain partial advance** (own-site, `amount_paid < total_amount`): the row is created
  `is_paid: false` carrying the chosen source as a pre-seed. When the balance is later
  settled via the regular `MaterialSettlementDialog` (`useSettleMaterialPurchase`), that
  dialog's payer-source choice is authoritative and may overwrite the pre-seed. We accept
  this; full per-advance source attribution would require a separate advance ledger and is
  out of scope.
- **Idempotent re-record:** existing row → update payer columns, never duplicate.
- No double counting: exactly one expense row per PO (delivery skip-guard); `advance_paid`
  on the PO is separate metadata and not part of `v_all_expenses`.

### 4. Testing

- **Manual (required by CLAUDE.md):** Playwright `/dev-login` → Material Hub → "Settle
  vendor" on a group bulk → confirm the picker renders for admin/office, pick a split,
  confirm → verify the `material_purchase_expenses` row has `settlement_payer_source`
  (+ split JSON) and `material_purchase_expense_items`, and the source chip renders on
  `/site/expenses`. Check console for zero errors.
- **Unit:** add a focused test that `useRecordAdvancePayment` builds the expense payload with
  the payer-source columns + items for the direct path (mock Supabase client). Existing
  `payerSource` validation tests already cover `validatePayerSourceInput` / `toRpcArgs`.

## Out of scope

- No schema migration.
- No new advance-payments ledger; partial-advance source attribution stays best-effort.
- No changes to the delivery hooks (they already skip when the row exists).
