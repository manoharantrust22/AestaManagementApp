# Wallet spend reverse / delete with cascade — design

## Problem
A wallet spend (`site_engineer_transactions` row, `transaction_type='spend'`) is created when a
site engineer settles something from his company-funded wallet. Today only **salary/contract**
settlements can be reversed (the `reverse_settlement` RPC soft-cancels the spend and un-settles the
source). **Material, misc, rental, and tea** spends are one-way linked with no reverse at all — so a
wrong entry (e.g. a material payment the *company* actually paid) cannot be removed from My Wallet,
and there is no way to push a correction back to the source record.

## Goal
From the Spend detail dialog, let an authorised user reverse a non-salary wallet spend with a choice
of two outcomes, cascading to the linked source:
- **Undo settlement** — the source returns to its pre-settlement state (re-settleable); wallet spend cancelled.
- **Paid by company instead** — the source stays paid but `payment_channel='direct'`; wallet spend cancelled.

In both modes the wallet spend is **soft-cancelled** (`cancelled_at` …) — balance restores, audit kept.
Never a hard delete.

## Source links (already exist)
| Source | link column | "settled" state |
|---|---|---|
| material_purchase_expenses | `engineer_transaction_id` | `is_paid` + `payment_channel` |
| misc_expenses | `engineer_transaction_id` | (no paid flag — needs soft-cancel col) |
| rental_advances / rental_settlements | `engineer_transaction_id` | (needs soft-cancel col) |
| tea_shop_settlements | `site_engineer_transaction_id` | `is_cancelled` + `payment_channel` |
| settlement_groups (salary/contract) | `settlement_group_id` (both ways) | handled by existing `reverse_settlement` |

## Cascade behaviour
| Source | Undo settlement | Paid by company |
|---|---|---|
| material | `is_paid=false`, clear settlement_reference/date/paid_date/amount_paid, `payment_channel='direct'`, unlink | `is_paid=true`, `payment_channel='direct'`, unlink |
| tea | `is_cancelled=true`, unlink | `payment_channel='direct'`, unlink |
| rental | soft-cancel row, unlink | `payment_channel='direct'`, unlink |
| misc | soft-cancel row (void), unlink | reclassify payer → company (`payer_type`/source), unlink |

## Components
1. **Migration — soft-cancel columns:** add `cancelled_at`/`cancelled_by`/`cancellation_reason` to
   `misc_expenses`, `rental_advances`, `rental_settlements` (material uses `is_paid`, tea uses `is_cancelled`).
   Update `v_all_expenses` to exclude cancelled misc/rental.
2. **Migration — `get_wallet_spend_source(p_spend_id)`** → `{source_type, source_id, is_settled}`.
   Checks each source's link column; returns `'salary'` when `settlement_group_id` is set, else the
   matching source, else `'none'`. Lets the UI show the right actions.
3. **Migration — `reverse_wallet_spend(p_spend_id, p_mode, p_reason)`** (atomic, SECURITY DEFINER),
   modelled on `reverse_settlement`: auth = admin/office OR recorder (via `auth.uid()`); advisory lock;
   idempotent (already-cancelled → no-op); resolve the single linked source; soft-cancel the spend;
   cascade per (source_type, mode). Returns a JSONB summary. Rejects salary spends with "use settlement reverse".
4. **TS:** `getWalletSpendSource()` + `reverseWalletSpend()` services and `useWalletSpendSource()` +
   `useReverseWalletSpend()` hooks (mirror `useReverseSettlement`).
5. **Pure helper `spendReverseMode(...)`** (unit-tested) deciding `'settlement' | 'cascade' | 'none'`.
6. **UI:** `SpendDetailDialog.tsx` — salary keeps the existing Reverse button; cascade spends get two
   confirm-gated actions ("Undo settlement", "Paid by company instead") with a required reason.

## Auth, audit, safety
- Authorisation derived from `auth.uid()` inside the RPC (admin/office or the spend's recorder).
- Soft-cancel everywhere (audit trail preserved; balance views filter `cancelled_at IS NULL`).
- Idempotent; advisory lock per engineer:site (matches `atomic_record_wallet_spend`/`reverse_settlement`).

## Risk
Touches `site_engineer_transactions`, the balance views, and misc payer-source — areas the concurrent
wallet-v2 (FIFO) session is reworking. Build on new files; reuse existing soft-cancel/balance
conventions; reconcile at ship time. Migrations + deploy are **held** for the user's move-to-prod
(not applied during the concurrent DB churn).

## Tests
- Unit: `spendReverseMode` (settlement vs cascade vs none across types/return/cancelled).
- Integration (post-deploy, live): each source × {undo, company}; salary still uses settlement reverse;
  office direct settlement untouched.
