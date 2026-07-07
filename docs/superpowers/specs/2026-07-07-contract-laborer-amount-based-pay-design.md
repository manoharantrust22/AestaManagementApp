# Contract-laborer amount-based pay + "already-paid" credit — Design

**Date:** 2026-07-07
**Status:** Approved (owner), pre-plan
**Builds on:** the direct-pay per-laborer settlement shipped as iteration 2 (`5e480c9`) and the
commission-start-date clarity fix (`2aea93c`). See memory
`contract_pay_console_2026_07_07`.

## Problem

On WaterTank (`/site/trades`, task-work package `e9a82b54-239e-4422-811b-7387cca76f10`, direct-pay
mode, maistry **Jithin** `6c1b5fc8-f943-4524-909a-e430c1209772`) there is a legacy **₹800 lump
"contract payment" to Jithin** — `task_work_payments` row `fb45b1ce-a5a2-48c2-8201-f4613308261b`,
dated 30 Jun, paid from the site engineer's wallet (txn `902c78d2-88b5-485b-82c0-2cf610058cee`), ref
`TW-260701-001` — recorded on 3 Jul, **before** the pane was switched to pay-each-laborer-directly.

It just **floats** in the payments feed and reduces nobody's balance. The owner wants it recognised as
**₹800 already paid to Jithin**, and wants this to be **reusable** for any future already-made /
partial payment.

### Why it doesn't "just work" today

`get_contract_labor_ledger` derives `net_paid` **purely from whole `is_paid` attendance-days**, and
`settle_contract_laborer` settles **all** of a laborer's unpaid days regardless of the amount entered.
So a ₹800 partial (less than one of Jithin's ~₹1,050 days) **cannot be represented** — the day-granular
model has no notion of "₹X paid toward a running balance". Every contract laborer currently has
`net_paid = 0`, so nothing has been paid through this path yet.

Current WaterTank ledger (all `net_paid = 0`):

| Laborer | role | net owed |
|---|---|---|
| Jithin (mesthri) | own labour | ₹6,825 (+ ₹650 commission collected) |
| Jugeswar Dora | Mason | ₹3,600 |
| Hemanta | Male Helper | ₹3,375 |
| Sadha | Male Helper | ₹1,875 |
| Utam rana | Male Helper | ₹1,500 |
| **Still owed** | | **₹17,175** |

## Goal

1. Make per-laborer pay **amount-based** so a partial / already-paid amount sticks correctly.
2. Let the owner **record an amount already paid** to any contract laborer or the mesthri (back-dated,
   any payer/mode), crediting against what they're owed and landing in the payments feed + Site
   Expenses like any payment.
3. One-time: **reconcile the existing ₹800** into Jithin's already-paid credit, reusing the wallet
   debit that already happened, so it counts in expenses exactly once.

## Architecture: switch the "paid" ledger from days → rupees

**Single source of truth for "paid" becomes a ₹ amount recorded as a `settlement_group` linked to
(contract, laborer)** — not `daily_attendance.is_paid`. Because `net_paid` is 0 everywhere, this basis
change has **zero backfill**.

- `net_paid(laborer, contract)` = Σ `settlement_groups.total_amount` linked to that laborer + contract
  and not cancelled/archived.
- `net_unpaid = max(0, net − net_paid)`, where `net` (owed) stays the live earnings-minus-commission
  sum over the laborer's days.
- **One `settlement_group` per payment** (full remaining, partial, or already-paid). We record the
  **rupee amount paid**, not a set of whole days. Day `is_paid` marking and the per-day commission
  snapshot are **retired for contract laborers** — commission stays live (computed from
  `v_daily_attendance_commission`). This is acceptable: rates/cutover are owner-controlled and stable
  post-payment; it removes the day-vs-rupee mismatch entirely.

### The link

Add three nullable columns to `settlement_groups` (mirrors the existing optional-context columns
`subcontract_id`, `commission_collector_laborer_id`):

- `contract_ref_kind text` — `'task_work'` | `'subcontract'`
- `contract_ref_id uuid` — the package id or subcontract id
- `contract_laborer_id uuid` — the paid laborer

A partial/already-paid credit is a `settlement_group` with these set, `payment_type='salary'`,
`laborer_count=1`, **no linked attendance days**.

### Why this rides the proven path

Verified against `v_all_expenses` and `get_contract_payment_history`:

- **Site Expenses:** a day-less `payment_type='salary'` group already surfaces via the view's
  **"Unlinked Salary"** branch (`NOT EXISTS daily_attendance … AND NOT EXISTS market_laborer_attendance`).
  So the credit shows in expenses with no view change required. (Optional polish: add a branch that
  labels linked-contract-laborer groups "Contract Salary" instead of "Unlinked Salary".)
- **Reversal:** `reverse_settlement` cancels the group (`is_cancelled=true`) and refunds any wallet
  debit — `net_paid` drops automatically because the Σ excludes cancelled groups. No new reversal code.

## Components to change

### DB (migrations, schema-first, additive)
1. **`settlement_groups`** — add the three link columns above (+ an index on
   `(contract_ref_kind, contract_ref_id, contract_laborer_id)`).
2. **`get_contract_labor_ledger`** — `net_paid` becomes `Σ` of linked non-cancelled
   `settlement_groups.total_amount` per laborer; `net_unpaid = max(0, net − net_paid)`. `net` unchanged.
3. **Amount-based settle RPC** — replace `settle_contract_laborer`'s "settle all unpaid days" body with:
   compute `remaining = net_owed_live − already_paid`; **clamp** `p_amount` to `[0, remaining]`
   (server-authoritative, prevents overpay); set the link columns + `total_amount = clamped amount` on
   the passed `settlement_group`; **do not** mark days or snapshot commission. Returns
   `(amount_recorded)`.
4. **`get_contract_payment_history`** — the `laborer_settlement` branch discovers groups via the new
   link columns (keep the legacy day-join in a `UNION` for safety; none exist today). Detail label
   "Paid to <laborer>".

### Client
- **`settlementService.settleContractLaborer`** — create the `settlement_group` with the link columns +
  `total_amount = amount`; call the amount-based RPC; wallet debit + `reverse_settlement` unchanged.
- **`useContractLaborLedger`** row type / **`ContractLaborLedger`** — no shape change (already renders
  `netPaid`/`netUnpaid`). Per-laborer pay operates on **project-lifetime** dues (null window) regardless
  of the Day/Week/Project toggle, so a partial ₹ credit isn't scoped to a confusing sub-window.
- **`ContractLaborerPayDialog`** — reused as-is for both "Pay the remaining" and "record an amount
  already paid": Amount is editable (partial sticks now), Date is back-dateable. Copy tweak so it reads
  as recording a payment (helper under Amount: "Enter a partial amount to record only part as paid").
  No new dialog, no new buttons — the crew rows already have **Pay**, the mesthri strip has **Pay own
  wages**, both driven by `netUnpaid`.

### One-time data reconciliation (prod, owner-confirmed, no new money)
Convert the floating ₹800 into Jithin's credit:
1. **Pre-check** the already-deleted duplicate `32bce789…` (wallet txn `372f6aa3…`): confirm its wallet
   debit was refunded when it was deleted, so there's no phantom ₹800 sitting in the wallet. Surface
   and stop if it wasn't.
2. Insert a `settlement_group`: `payment_type='salary'`, `laborer_count=1`, `total_amount=800`,
   `payment_mode='cash'`, `payment_channel='engineer_wallet'`,
   `engineer_transaction_id='902c78d2…'` (**reuse** the existing wallet debit), `settlement_date=2026-06-30`,
   link columns → task_work / WaterTank / Jithin, `created_by` = the original payer.
3. **Soft-delete** the `task_work_payments` row `fb45b1ce…` (`is_deleted=true`) **without** touching its
   wallet txn — it drops from the pane feed and the "Task Work (advance)" expense branch; the ₹800 now
   surfaces via the settlement group's expense branch instead. Net: expenses unchanged (still ₹800, same
   wallet txn, counted once), pane shows "Paid to Jithin ₹800", `net_paid(Jithin)=800`,
   `net_unpaid=6,025`, still-owed ₹17,175 → **₹16,375**.

## Error handling / invariants
- **No overpay:** the RPC clamps every payment to the laborer's server-computed remaining.
- **Counted once:** the migration reuses the existing wallet txn and soft-deletes the source lump; no
  second debit, no double expense.
- **Reversible:** reversing the migrated credit cancels the group and refunds wallet txn `902c78d2…`
  (owner should know — it undoes the ₹800 cleanly).
- **Weekly page untouched:** contract crew are excluded from `/site/payments` by the commission-crew-day
  flags, not `is_paid`; retiring `is_paid` marking here does not change that.
- **Lump-mode contracts unchanged:** this only affects direct-pay (`mesthri_commission_enabled`)
  contract laborers; `task_work_payments` lump payments in lump mode are byte-for-byte unchanged.

## Testing (verify, don't assert)
1. **Unit:** ledger math — `net_unpaid = max(0, net − Σcredits)`; the clamp caps at remaining; a second
   payment after a partial sums correctly to (not beyond) `net`.
2. **SQL reconciliation on prod-shaped data:** after the migration, `get_contract_labor_ledger` returns
   Jithin `net_paid=800 / net_unpaid=6025`; `v_all_expenses` shows the ₹800 exactly once; the floating
   `package_payment` is gone from `get_contract_payment_history` and a `laborer_settlement` "Paid to
   Jithin ₹800" appears.
3. **Playwright (dev:cloud) on WaterTank:** record a partial payment to a crew laborer → row shows
   "₹X paid of ₹Y · remaining"; reverse it → back to owed and wallet refunded; confirm it appears in
   `/site/expenses`. 0 console errors.
4. `npm run build` — stop the dev server first.

## Risks / sequencing
- Ship code (columns + RPCs + service/UI) the normal build → migrate-to-prod → push way. Run the
  one-time ₹800 reconciliation **only after** the code is live and the owner has seen the exact
  before/after numbers.
- Retiring `is_paid`/commission-snapshot for contract laborers is a deliberate model simplification;
  the plan must grep for any other reader of contract-crew `is_paid` before dropping the marking.
