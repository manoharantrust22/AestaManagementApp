# Engineer Wallet — Payer-Source Attribution + Misc Expense Redesign

**Author:** Claude (brainstormed with @findhari93)
**Date:** 2026-05-20
**Status:** Draft for review

## TL;DR

Today, deposits to a site engineer's wallet carry a `payer_source` (Amma, Client, Trust, etc.) but spends from the wallet do not. Reports can show "Amma deposited ₹19,440 into Ajith's wallet" but cannot answer "how much of Amma's money has Ajith actually spent, and on what." This spec adds a deposit-to-spend allocation layer using a **proportional** allocation rule, removes the now-redundant manual payer-source picker from every wallet-channel flow when a site engineer is paying, and redesigns the MiscExpenseDialog around a wallet-only mental model with a live balance preview. The change ships in 4 sequential phases so Ajith can keep working through the rollout.

## Goals

1. **Strip manual payer-source selection** from every wallet-channel dialog when the payer is a site engineer. The source is implicit from the wallet's deposit composition — asking the user to pick again is redundant at best and incorrect at worst.
2. **Auto-attribute each wallet spend** across the active deposit source pools using a proportional rule. Every `site_engineer_transactions` row of type `spend` gains one or more rows in a new `engineer_wallet_spend_allocations` table.
3. **Surface the attribution** in `v_all_expenses` and on `/site/my-wallet` so the user can read "Amma funded ₹X of this misc expense" and "Amma's pool currently has ₹Y unspent in Ajith's wallet at this site."
4. **Redesign the MiscExpenseDialog** for site engineers around a wallet-only flow: balance card, amount field, after-balance preview (red when negative, submit still enabled), no source picker, no payer-type radios.
5. **Allow the wallet to go negative.** Spending past the balance does not block; the negative is settled by the next deposit (proportionally against whatever sources fund that top-up).

## Non-goals

- Changing the LIFO ordering of deposits/spends in time (used by `useEngineerWalletV2`); only adding attribution metadata on top.
- Touching `payer_sources` table or `PayerSourceSelector` for non-wallet (`company_direct`) flows — those keep the manual picker.
- Reworking deposits — they already carry `payer_source` correctly.
- Changing how `engineer_transaction_id` links a misc/settlement row to its wallet transaction. The new allocation rows hang off the wallet `spend` row, not directly off the expense row.

## Background

Confirmed in prod on 2026-05-20:

```
SELECT transaction_type, payer_source, payer_name, COUNT(*), SUM(amount)
FROM site_engineer_transactions
WHERE cancelled_at IS NULL
GROUP BY transaction_type, payer_source, payer_name;

deposit | amma_money    | NULL | 2  | 19,440
deposit | client_money  | NULL | 3  | 89,250
deposit | trust_account | NULL | 1  |  1,760
spend   | NULL          | NULL | 10 | 1,01,100   ← attribution gap
```

Ten spend rows totalling ₹1,01,100 are unattributed. Across `misc_expenses`, `subcontract_payments`, `material_purchase_expenses`, `tea_shop_settlements`, `rental_settlements`, `labor_payments`, every site-engineer-funded row currently links to a `spend` transaction with `payer_source = NULL`. Reports either fall back to the row's own `payer_source` field (which the engineer was forced to pick manually, often wrong) or show "uncategorised."

The 2026-05-15 [SettleViaWallet unification](settle_via_wallet_consolidation_2026_05_15.md) consolidated the spend path so every wallet-channel flow ultimately calls into the same v2 wallet primitive (`useV2Wallet`). That means one allocation point covers every consumer.

The 2026-05-20 [misc-expense wallet-only lock](feedback_site_engineer_wallet_only.md) (commit `7ce55db`) closed the UI escape hatch where a site engineer could uncheck "Deduct from wallet" and end up with a phantom-debit row. That fix is the floor this spec builds on.

## Decomposition into 4 ships

| # | Ship | What lands | Days |
|---|---|---|---|
| **1** | MiscExpenseDialog redesign + wallet-only stripdown across all dialogs | New "Experience Designer" layout for MiscExpenseDialog. Audit the 12 wallet-channel dialogs that consume `PayerSourceSelector` and hide it whenever `payerType === "site_engineer" && createWalletTransaction`. Add a `WalletBalancePreview` sub-component (current balance → amount → after balance, red if negative). Negative submit allowed. **Attribution still NULL** on spends — reports unchanged. | 1 |
| **2** | Allocation backend | New table `engineer_wallet_spend_allocations` + service-side allocator + trigger or RPC. Backfill the 10 existing spend rows. | 2–3 |
| **3** | Reporting | `v_all_expenses.payer_source_split` JSONB column. `/site/my-wallet` per-source running balance card. "By payer source" aggregation in `/company/reports` and `/site/expenses`. | 1–2 |
| **4** | Negative-balance UX polish | Explicit "overdraft" mode on `/site/my-wallet` (company owes engineer ₹X), top-up auto-applies to the negative first. | 0.5 |

Phase 1 unblocks Ajith on day one. Phases 2–4 are sequential because each depends on the previous shipping.

Each phase is its own implementation plan (writing-plans output produces 4 plans, not one). Phase 1 ships before Phase 2 starts; we don't try to bundle the UI strip and the backend allocator into the same PR.

## Architecture

### Data model — Phase 2

```sql
CREATE TABLE engineer_wallet_spend_allocations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  spend_id          uuid NOT NULL REFERENCES site_engineer_transactions(id) ON DELETE CASCADE,
  deposit_id        uuid NOT NULL REFERENCES site_engineer_transactions(id),
  payer_source      text NOT NULL,          -- denormalised from deposit_id at write time
  payer_name        text,                   -- denormalised; nullable for built-in sources
  amount            numeric(12,2) NOT NULL CHECK (amount > 0),
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX ON engineer_wallet_spend_allocations (spend_id);
CREATE INDEX ON engineer_wallet_spend_allocations (deposit_id);
CREATE INDEX ON engineer_wallet_spend_allocations (payer_source);
```

Invariant: `SUM(amount) WHERE spend_id = X == site_engineer_transactions.amount WHERE id = X` (enforced by allocator, not a DB constraint — the spend may exceed available pools when overdrawn; see Negative balance section).

This is the same pattern `payment_week_allocations` uses for the wages waterfall — proven to work on this codebase.

### Allocation algorithm — proportional

Pseudocode for the allocator, called inside the same transaction that creates a spend row:

```
1. Compute current pool balance per source:
     pools[source] = SUM(deposit.amount where deposit.payer_source = source AND not cancelled)
                   - SUM(prior_allocations.amount where allocation.payer_source = source)

   (Exclude `source = null`, which is invalid for deposits, but defensively skip.)

2. total_available = SUM(pools.values where value > 0)

3. If total_available <= 0:
     Write a single allocation row: spend_id = new spend, deposit_id = sentinel(*),
     payer_source = 'overdraft', amount = full spend amount.
     Return.

4. If spend_amount <= total_available:
     For each source with positive balance:
       share = (pools[source] / total_available) * spend_amount
       Write allocation: amount = share (HALF_UP to paise),
         payer_source = source,
         deposit_id = oldest non-zero deposit of that source (arbitrary
         choice — proportional allocation isn't intrinsically tied to a
         single deposit; we pick oldest for the FK so the row points at
         a real deposit and reports can show "first deposit from Amma
         on May 5").

5. If spend_amount > total_available (partial overdraft):
     Distribute total_available proportionally across sources (step 4).
     Write one extra allocation row with payer_source = 'overdraft',
       deposit_id = NULL, kind = 'overdraft' for the remainder.

6. Reconciliation: SUM(allocation.amount where spend_id = X) MUST equal
   site_engineer_transactions.amount for that spend (exactly, after
   HALF_UP rounding distributes the leftover paise to the largest pool).
   Allocator asserts this before COMMIT; any drift is a bug.
```

(*) The `'overdraft'` sentinel needs a host deposit_id for FK integrity. Options:
- (a) NULL-able `deposit_id` + a `kind` enum column (`source` / `overdraft`)
- (b) Create a synthetic "overdraft" deposit row per (user, site) on first overdraft
- (c) Drop the FK on deposit_id and document it as nullable when payer_source='overdraft'

Recommendation: **(a)** — least magic, least extra rows. Add `kind text NOT NULL DEFAULT 'source' CHECK (kind IN ('source','overdraft'))` and make `deposit_id` nullable. The FK still validates when present.

**Rounding:** allocate using HALF_UP at paise precision; assign the leftover paise (e.g., a ₹0.01 remainder from ⅓ splits) to the largest pool. Documented in the allocator unit tests.

**Cancellation of a spend:** delete its allocation rows (CASCADE handles this). Pool balances rebound automatically.

**Cancellation of a deposit:** Phase 2 leaves this brittle — if a deposit is cancelled and its `payer_source` had already been allocated against by later spends, the cancellation can leave the wallet apparently negative for that source. Out of scope for Phase 2; flagged for Phase 4 polish where we'll trigger a re-allocation cascade or block the cancellation.

### Backfill — Phase 2

For each of the 10 existing spend rows (in chronological order):
1. Compute the pool composition **as of** the spend's `transaction_date` (deposits up to that date, minus already-backfilled allocations).
2. Apply the proportional rule above.
3. Write allocation rows.

Ship as a `supabase/migrations/YYYYMMDDHHMMSS_backfill_wallet_spend_allocations.sql` migration. Idempotent guard: skip rows that already have allocations.

### v_all_expenses — Phase 3

Add a JSONB column populated via a LATERAL join:

```sql
SELECT
  ...existing columns...,
  COALESCE(
    (SELECT jsonb_object_agg(payer_source, sum_amount)
     FROM (
       SELECT payer_source, SUM(amount) AS sum_amount
       FROM engineer_wallet_spend_allocations a
       WHERE a.spend_id = e.engineer_transaction_id
       GROUP BY payer_source
     ) g),
    '{}'::jsonb
  ) AS payer_source_split
FROM ...
```

Rows where `engineer_transaction_id IS NULL` (i.e., company-direct rows) get `payer_source_split = '{}'`, and reports fall back to the row's own `payer_source` field.

### UI changes — Phase 1

#### MiscExpenseDialog — site engineer view

```
┌─ Add Miscellaneous Expense ─────────────────────────────┐
│                                                          │
│  ┌─ Your Wallet · Padmavathy Apartments ────────────┐   │
│  │                                                    │  │
│  │  Current balance                          ₹10,000 │  │
│  │  This expense                              −₹  330 │  │
│  │  ─────────────────────────────────────────────────  │  │
│  │  After this expense                       ₹ 9,670 │  │
│  │                                                    │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Amount        [ ₹ 330 _________________ ]               │
│  Date          [ 2026-05-20 ]                            │
│  Category      [ Material Expenses          ▼ ]          │
│  Vendor        [ Rahmaniya Shop              ▼ ]          │
│  Description   [ ____________________________ ]          │
│                                                          │
│  Payment mode  [ ● Cash   ○ UPI   ○ Bank ]              │
│  Subcontract   [ none                       ▼ ]          │
│  Notes         [ ____________________________ ]          │
│                                                          │
│  ╶─ no "Who is paying?" radio                            │
│  ╶─ no "Payment source" chip row                         │
│  ╶─ no "Deduct from wallet" checkbox                     │
│                                                          │
│                              [ Cancel ]  [ Add Expense ]│
└──────────────────────────────────────────────────────────┘
```

When `currentBalance − amount < 0`, the After-this-expense row turns red and shows a one-liner below the balance card:

> ⚠ Wallet overdraft — company will owe you ₹X after this expense.

Submit stays enabled.

#### Admin / office view of the same dialog

Unchanged from today's behaviour. Admins still see the "Who is paying?" radio, the payment-source picker, and the "Deduct from wallet" checkbox — they have legitimate reasons to pick (recording an out-of-wallet company purchase, or attributing an expense to a specific company-direct funding source).

#### Other wallet-channel dialogs — audit & strip pass

Per the 2026-05-20 grep, 12 dialogs render `PayerSourceSelector` in a context where a site engineer might be paying:

`MaterialSettlementDialog`, `InitiateBatchSettlementDialog`, `TeaShopSettlementDialog`, `PaymentDialog`, `RentalSettlementDialog`, `MestriSettleDialog`, `RentalAdvanceDialog`, `UnifiedSettlementDialog`, `GroupTeaShopSettlementDialog`, `ContractPaymentRecordDialog`, `HistoricalRentalDialog`, `MiscExpenseDialog`.

Each gets the same conditional treatment:

```tsx
const isSiteEngineerPayingFromWallet =
  userProfile?.role === "site_engineer" &&    // role check (closes manual override by office)
  payerType === "site_engineer" &&            // explicit wallet path
  createWalletTransaction === true;           // toggle is true (now forced for engineers — see Phase-1 floor)

{!isSiteEngineerPayingFromWallet && (
  <PayerSourceSelector ... />
)}
```

The exact wiring per dialog (which state variable holds `payerType`, whether `createWalletTransaction` exists or needs to be added, etc.) gets enumerated in the writing-plans output. Some flows (e.g., `MestriSettleDialog`) already have a `payerType` state; others (`PaymentDialog`, `MaterialSettlementDialog`) need a slight refactor to expose the same predicate.

`PayerSourceSelector` itself is unchanged. `AddFundsDialog` and `EditDepositDialog` (deposits, not spends) keep the picker — that's the canonical authoring point for source attribution.

### /site/my-wallet — Phase 3

Add a per-source breakdown beneath the existing balance card:

```
Your wallet · Padmavathy Apartments

  Balance               ₹10,000   ← unchanged big number
  ──────────────────────────────
  by source
    Client money        ₹ 8,800     (88%)
    Amma money          ₹ 1,200     (12%)
    Trust account       ₹     0     (used up)
```

Negative-balance mode (Phase 4):

```
  Balance              −₹  650     ← red
  ──────────────────────────────
  overdraft             ₹  650     ← company owes you
```

## Risks

1. **Cancellation cascades.** A cancelled deposit invalidates earlier allocations. Phase 2 leaves this brittle (allocator runs once at spend creation; cancellation doesn't re-run). Phase 4 either blocks deposit cancellation when subsequent allocations exist, or implements a re-allocation pass. Flagged here so the writing-plans output captures it.

2. **Backfill non-determinism.** If the order of historical deposits and spends is ambiguous on the same date (timestamps tie), the backfill's "as of" pool calculation can drift by a few paise per row. Acceptable — the totals reconcile.

3. **Reports breakage between phases.** Between Phase 1 ship and Phase 3 ship, the existing `payer_source` column on expense rows continues to be the source of truth for "who paid" reports. For wallet-channel rows in that window, this value will be NULL or stale (since Phase 1 removes the manual picker for site engineers). Reports will show "unknown" for those rows until Phase 3 lands. **Mitigation:** ship Phase 3 within 1 week of Phase 1.

4. **`v_all_expenses` perf.** Adding a LATERAL aggregation per row could slow the view at large data volumes. Today the codebase has 54 expense rows + 90 material purchase rows etc. — perf is irrelevant for this dataset. Revisit only if the dataset grows 10×.

5. **Multi-site engineers.** An engineer with active wallets on multiple sites (Ajith: Padmavathy + Srinivasan) has independent pools per `(user_id, site_id)`. The allocator must scope by `site_id`. Easy to get wrong — covered by the allocator unit tests.

## Open questions (resolved inline, redirect at review if wrong)

- **Q: Does the existing `payer_source` column on `misc_expenses` (and the 5 other expense tables) stay populated?**
  A: Keep the column. For site-engineer wallet rows: populate post-write as the *dominant* source from the allocation rows (or `'mixed_wallet'` literal when no single source ≥ 50%). For company-direct rows: same as today (manual picker). Reports prefer `payer_source_split` JSONB when present, fall back to the column otherwise.

- **Q: Should non-engineer users (admin / office) get the source picker stripped when they manually create an expense "via site engineer"?**
  A: No — they keep it. Stripping it for them would lose useful editorial control over attribution on retroactively entered rows.

- **Q: How are deposits with NULL `payer_source` handled?**
  A: There are none in prod today; all 6 existing deposits carry a source. The allocator treats a deposit with NULL `payer_source` as if it were `'unspecified'` (a sentinel source) — defensive only.

- **Q: Does the 2026-05-15 wallet-v2 LIFO ordering change?**
  A: No. The LIFO is about transaction *time* ordering for the running balance; the new allocator is about *source* attribution across deposits regardless of order. They're orthogonal.

## Acceptance criteria — top-level

- [ ] Site engineer opens MiscExpenseDialog → sees only the wallet balance card + after-balance preview. No payer-type radio, no source picker, no checkbox.
- [ ] Site engineer enters amount > balance → After-balance turns red, "company will owe you" message renders, Submit stays enabled.
- [ ] After Phase 2 ship: a site-engineer-created misc expense produces N `engineer_wallet_spend_allocations` rows where N = number of active deposit sources (+ 1 extra row if the spend pushed wallet negative), and `SUM(amount) = spend amount` exactly after HALF_UP rounding.
- [ ] After Phase 3 ship: `SELECT payer_source_split FROM v_all_expenses WHERE engineer_transaction_id IS NOT NULL` returns a non-empty JSONB for every wallet-channel expense created post-Phase-2.
- [ ] After Phase 3 ship: `/site/my-wallet` shows a per-source breakdown summing to the headline balance.
- [ ] After Phase 4 ship: Wallet can go negative without UI blocking; the next deposit auto-allocates to the negative first.
- [ ] Backfill applied: all 10 historical spend rows have allocation rows. `SELECT COUNT(*) FROM site_engineer_transactions WHERE transaction_type='spend' AND cancelled_at IS NULL AND NOT EXISTS (SELECT 1 FROM engineer_wallet_spend_allocations a WHERE a.spend_id = site_engineer_transactions.id)` → 0.

## Out of scope (deferred)

- A `/company/reports/by-payer-source` cross-site dashboard. Useful but a follow-up.
- Re-attribution UI (let an admin manually shift X paise from Amma's pool to Client's). Edge case; defer.
- Deposit cancellation cascade. Tracked under Phase 4 risk; if cancellations turn out to be frequent, prioritise; if rare, leave for after Phase 4.
