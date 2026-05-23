# Multi-Source Payer Split — Design

**Date:** 2026-05-23
**Scope:** Allow a single settlement / expense / deposit to be paid from 2 or 3 different payer sources, with the user specifying the amount per source. Optional toggle, default off. Applied across every write dialog that currently captures a single `payer_source`.

Also: remove the "Via Site Engineer" payment-channel toggle from `PaymentDialog`, `UnifiedSettlementDialog`, and `ContractPaymentRecordDialog`. Reason: site engineers now have a dedicated wallet flow (deposit at `/company/engineer-wallet` → spend from wallet on `/site/payments`); the legacy in-dialog channel duplicates that path and invites attribution drift.

---

## Motivation

Today every payer-source-bearing row stores exactly one source: `settlement_groups.payer_source = 'amma_money'` and the whole `total_amount` is attributed to Amma. In practice, partial-source payments do happen — a ₹5,500 settlement might be ₹3,000 from Amma Money and ₹2,500 from the Trust Account. Currently the user has to either lie (pick one source for the whole amount) or split the settlement into two separate rows, which breaks the laborer-side accounting (two records where there should be one). This spec adds a first-class representation for "this single settlement drew from multiple sources".

The feature is expected to be rare (the user's words). The design optimises for not-paying-a-tax in the common single-source case: existing rows stay untouched, existing RPC callers keep working, and the new UI element is a collapsed toggle.

---

## Storage

### New column on every payer-source-bearing table

Add `payer_source_split jsonb` (nullable, default NULL) to:

- `settlement_groups`
- `misc_expenses`
- `tea_shop_settlements`
- `group_tea_shop_settlements`
- `material_purchase_batches`
- `rental_settlements`
- `rental_advances`
- `site_engineer_transactions` (covers wallet deposits via `AddFundsDialog` / `EditDepositDialog`)

### Semantics

- `payer_source_split IS NULL` → unchanged. The existing `payer_source` text column holds the single source; reads behave exactly as today.
- `payer_source_split IS NOT NULL` → multi-source. The existing `payer_source` column is set to the sentinel string `'split'` so any downstream code that does `WHERE payer_source = 'amma_money'` will *not* match (i.e. will not double-count a split row as fully-Amma). The detailed per-source amounts live in JSONB.

### JSONB shape

```json
[
  { "source": "amma_money",    "name": null,   "amount": 3000 },
  { "source": "trust_account", "name": null,   "amount": 2500 }
]
```

- `source`: one of the keys in the `payer_sources` registry (`own_money`, `amma_money`, `client_money`, `trust_account`, `other_site_money`, `custom`, or any site-specific extension).
- `name`: required when `requiresPayerName(source)` returns true (i.e. for `custom` and `other_site_money`); otherwise NULL.
- `amount`: positive numeric. Sum across rows must equal the row's total within ₹1 of tolerance (rounding allowance).

Array length is 2 or 3. Length 1 is not a valid split — single-source rows leave `payer_source_split = NULL` instead.

### Why JSONB and not a child table

The existing precedent for a "this row split across sources" representation is the child table `engineer_wallet_spend_allocations`. That precedent applies because the wallet-spend allocator is automatic (every spend writes N rows via the proportional rule) and needs indexes for reporting. The new multi-source feature is the opposite: user-entered, rare, and the splits are not aggregated independently of their parent row — they are always shown in the context of "this settlement". A JSONB column gives us:

- One column per domain table (8 columns total) vs. 8 child tables with their own PKs, FKs, RLS policies, indexes.
- No write coordination — the split is part of the same row insert, not a second statement.
- The rollup card (Money Source Summary) can still aggregate via `jsonb_array_elements` in the `v_all_expenses` view; performance is acceptable because splits are expected to be < 1% of rows.

Trade-off accepted: JSONB sacrifices referential integrity on the `source` field (a typo'd source string would be persisted as data, not rejected by FK). Mitigation is the shared SQL validator below, which is called from every domain's atomic RPC and rejects any source key not present in the `payer_sources` registry.

### Shared SQL validator

A single `SECURITY DEFINER` helper used by every domain RPC:

```sql
CREATE OR REPLACE FUNCTION validate_payer_source_split(
  p_split jsonb,
  p_total numeric
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_count int;
  v_sum   numeric;
BEGIN
  IF jsonb_typeof(p_split) <> 'array' THEN
    RAISE EXCEPTION 'payer_source_split must be a JSON array' USING ERRCODE = '22023';
  END IF;
  v_count := jsonb_array_length(p_split);
  IF v_count NOT BETWEEN 2 AND 3 THEN
    RAISE EXCEPTION 'payer_source_split must have 2 or 3 rows (got %)', v_count USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(SUM((row->>'amount')::numeric), 0)
    INTO v_sum
    FROM jsonb_array_elements(p_split) row;
  IF abs(v_sum - p_total) > 1 THEN
    RAISE EXCEPTION 'payer_source_split sum % does not equal total %', v_sum, p_total
      USING ERRCODE = '22023';
  END IF;
  PERFORM 1
    FROM jsonb_array_elements(p_split) row
   WHERE NOT EXISTS (
     SELECT 1 FROM payer_sources ps WHERE ps.key = row->>'source'
   );
  IF FOUND THEN
    RAISE EXCEPTION 'unknown payer source in payer_source_split' USING ERRCODE = '22023';
  END IF;
  -- Reject duplicate source keys within a single split (e.g. Amma + Amma)
  IF (
    SELECT COUNT(DISTINCT row->>'source')
      FROM jsonb_array_elements(p_split) row
  ) <> v_count THEN
    RAISE EXCEPTION 'payer_source_split cannot repeat the same source twice'
      USING ERRCODE = '22023';
  END IF;
END $$;
```

The ₹1 rounding tolerance exists so a three-way split of ₹10,000 entered as 3333.33 / 3333.33 / 3333.34 doesn't get rejected for being a paise off.

---

## UI — `PayerSourceSplitInput`

A new reusable component at `src/components/settlement/PayerSourceSplitInput.tsx` that replaces direct uses of `PayerSourceSelector` in every write dialog. Wraps the existing selector — does not re-implement it.

### Behavior

- Default (collapsed) state: looks identical to today's `PayerSourceSelector`. A small "Split across sources" link/toggle below the selector.
- Toggled on: renders 2 source rows by default (the original selector becomes row 1). Each row has its own `PayerSourceSelector` + an amount `TextField` + a delete button on the second/third row.
- A "+ Add another source" button appears below row 2 when only 2 rows are visible. Disappears at 3 rows (hard cap).
- Below the rows: a live status line — "Remaining: ₹X" (green/grey), "Over by ₹Y" (red), or "OK ✓" (green) when sum matches total within ₹1.
- Collapsing the toggle off discards the split rows and reverts to the single-source state.

### Returned value

The component is controlled. It exposes:

```ts
type PayerSourceInput =
  | { mode: "single"; source: PayerSource; name?: string }
  | { mode: "split"; rows: { source: PayerSource; name?: string; amount: number }[] };
```

Parent dialogs replace their `payerSource` + `customPayerName` state with a single `payer: PayerSourceInput` state, and pass `totalAmount` so the component can compute the remaining-amount hint and the OK/over indicator.

### Submit gating

Dialogs disable the confirm button when `payer.mode === "split"` and any of:
- A row's amount is empty, zero, or non-numeric.
- Two rows have the same `source` value.
- The sum of amounts is not within ₹1 of the dialog's total.
- A row using `custom` or `other_site_money` is missing the `name` field.

These checks are duplicated in TypeScript (so the button reflects validity in real time) and in the SQL validator (source of truth on submit).

---

## RPC contract change

Each domain RPC that writes a payer-source-bearing row gains one new optional parameter:

```sql
p_payer_source_split jsonb DEFAULT NULL
```

Affected RPCs (this list is the authoritative scope of the migration phase):

- `create_settlement_group_atomic` and its variants in `settlement_groups`
- `record_misc_expense_atomic`
- `record_tea_shop_settlement` / `record_group_tea_shop_settlement`
- `process_batch_settlement` (materials)
- The rental settlement / rental advance write paths
- `atomic_record_wallet_deposit` (or whichever RPC backs `AddFundsDialog`)

Inside each RPC:

```sql
IF p_payer_source_split IS NULL THEN
  -- existing behavior, unchanged
  INSERT ... (payer_source, payer_name, payer_source_split, ...)
       VALUES (p_payer_source, p_payer_name, NULL, ...);
ELSE
  PERFORM validate_payer_source_split(p_payer_source_split, p_total_amount);
  INSERT ... (payer_source, payer_name, payer_source_split, ...)
       VALUES ('split', NULL, p_payer_source_split, ...);
END IF;
```

Backwards compatibility: every existing caller passes the new parameter as NULL (or omits it via the DEFAULT) and continues to write single-source rows exactly as today.

### TypeScript service layer

```ts
// src/types/settlement.types.ts
export type PayerSourceSplitRow = {
  source: PayerSource;
  name?: string;
  amount: number;
};

export type PayerSourceInput =
  | { mode: "single"; source: PayerSource; name?: string }
  | { mode: "split"; rows: PayerSourceSplitRow[] };

// src/lib/settlement/payerSource.ts (new)
export function toRpcArgs(payer: PayerSourceInput): {
  p_payer_source: string;
  p_payer_name: string | null;
  p_payer_source_split: PayerSourceSplitRow[] | null;
};
export function validatePayerSourceInput(
  payer: PayerSourceInput,
  total: number,
): { ok: true } | { ok: false; reason: string };
```

Every existing writer (`processSettlement`, `processContractPayment`, `recordMiscExpense`, `processBatchSettlement`, `recordTeaShopSettlement`, etc.) is updated to accept `payer: PayerSourceInput` instead of `payerSource + customPayerName`, and uses `toRpcArgs` internally.

---

## Read-path changes

### `v_all_expenses`

The view already has a `payer_source_split` JSONB column (added in Phase 4 of the engineer-wallet attribution work, for wallet-spend allocations). Extend each subquery that unions into the view to surface the new column from the source domain table:

```sql
-- For settlement_groups
SELECT
  ...
  CASE WHEN sg.payer_source_split IS NOT NULL
       THEN sg.payer_source_split
       ELSE NULL
  END AS payer_source_split,
  sg.payer_source AS payer_source,  -- 'split' sentinel when payer_source_split is set
  ...
FROM settlement_groups sg ...
```

Same pattern for `misc_expenses`, `tea_shop_settlements`, etc. Wallet-spend rows continue to use their `engineer_wallet_spend_allocations`-derived split (unchanged from Phase 4).

### Display helper

```ts
// src/lib/settlement/payerSource.ts
export function formatPayerSource(row: {
  payer_source: string;
  payer_name: string | null;
  payer_source_split: PayerSourceSplitRow[] | null;
}): { kind: "single"; label: string }
  | { kind: "split"; rows: { label: string; amount: number }[]; summary: string };
```

- single → `{ kind: "single", label: "Amma Money" }` (current behaviour, just routed through this helper).
- split → `{ kind: "split", rows: [...], summary: "Split: Amma ₹3,000 · Trust ₹2,500" }`.

Display components decide whether to render the rows fully (detail dialogs) or just the summary string (dense tables, list rows). A new `<PayerSourceChip row={...} />` component encapsulates this choice — single → existing chip, split → chip showing "Split (2)" with a tooltip listing rows.

### Rollup aggregation (`MoneySourceSummaryCard`)

The card sums spending per payer source. Today it groups by `payer_source` directly. After this change:

```sql
-- per-source totals across all expenses
SELECT
  COALESCE(split_row->>'source', e.payer_source) AS source_key,
  SUM(
    CASE WHEN e.payer_source_split IS NULL
         THEN e.amount
         ELSE (split_row->>'amount')::numeric
    END
  ) AS total
FROM v_all_expenses e
LEFT JOIN LATERAL jsonb_array_elements(e.payer_source_split) split_row ON TRUE
GROUP BY 1;
```

Single-source rows (split is NULL) contribute their full amount once. Multi-source rows contribute one tagged amount per split row. The sentinel `payer_source = 'split'` is never returned as a group key because the `LEFT JOIN LATERAL` expands it.

### Edit dialogs

Edit dialogs use the same `PayerSourceSplitInput`. Loading an existing row:
- `payer_source_split IS NULL` → toggle off, single source pre-filled.
- `payer_source_split IS NOT NULL` → toggle on, rows pre-filled.

The user can flip in either direction. The same atomic update RPC parameter list applies.

---

## "Via Site Engineer" channel removal

Scope: `PaymentDialog`, `UnifiedSettlementDialog`, `ContractPaymentRecordDialog`. These are the three dialogs where an admin or office user could pick "Via Site Engineer" as the payment channel — debiting the engineer's wallet from the same dialog instead of using the dedicated `/company/engineer-wallet` deposit flow followed by the engineer's own `/site/payments` action.

### Code changes

In each dialog:
- Remove the `Payment Channel` `ToggleButtonGroup` and its surrounding `Box`.
- Hardcode `paymentChannel = "direct"` in initial state. Keep the variable to minimise downstream changes.
- Remove the engineer-selection `Collapse` (the engineer dropdown + reference field that only renders when channel is `engineer_wallet`).
- Remove the engineer wallet debit branch in the submit path (the `if (config.paymentChannel === "engineer_wallet" && config.engineerId)` block in `processSettlement` / `processContractPayment` is no longer reachable from these dialogs but stays for backward compatibility with historical callers).

### What changes for the user

- Admin/office users: to fund a site engineer, go to `/company/engineer-wallet` (existing redesigned page from the 2026-05-21 ship). The salary settlement dialog is no longer a side door into the wallet.
- Site engineers: no change. They've already had the channel toggle hidden (`!isSiteEngineer && (...)`) and they continue to pay from their wallet via the existing `SettleViaWalletDialog` launcher.

### Historical rows

In-flight or historical settlement rows with `payment_channel = 'engineer_wallet'` keep working — the read side (display, edit, cancel) is unchanged. Only the create path closes the side door.

---

## Execution phasing

Twenty-five-ish dialogs is too big for one PR. Three independently shippable phases:

### Phase 1 — Foundation
- One migration: add `payer_source_split jsonb` to all 8 domain tables, plus the shared `validate_payer_source_split` function and a SQL CHECK constraint on each table (`payer_source_split IS NULL OR jsonb_array_length(payer_source_split) BETWEEN 2 AND 3`).
- TypeScript: `PayerSourceInput` type, `toRpcArgs` + `validatePayerSourceInput` helpers in `src/lib/settlement/payerSource.ts`.
- UI: `PayerSourceSplitInput` component.
- Wire-in: `PaymentDialog` only. RPC extension: `create_settlement_group_atomic` + the bulk settlement service function (`processSettlement`).
- "Via Site Engineer" removal in `PaymentDialog` only.
- Read-side helper (`formatPayerSource`, `PayerSourceChip`) shipped but only consumed by `PaymentDialog`'s post-submit toast for now.
- View update: extend `v_all_expenses` to surface `payer_source_split` for `settlement_groups` only; other domains still return NULL.

### Phase 2 — Salary + Misc, channel removal completion
- Wire `PayerSourceSplitInput` into `MestriSettleDialog`, `UnifiedSettlementDialog`, `ContractPaymentRecordDialog`, `MiscExpenseDialog`.
- Extend `create_settlement_group_atomic` callers (`processContractPayment`) and `record_misc_expense_atomic` to pass the new parameter.
- Remove "Via Site Engineer" channel from `UnifiedSettlementDialog` and `ContractPaymentRecordDialog`.
- `v_all_expenses` extension for `misc_expenses`.
- Read-side: `SettlementEditDialog`, `MiscExpenseViewDialog`, `SalarySettlementTable` (single-row chip → `PayerSourceChip`).
- Edit dialogs for these domains pick up the split toggle.

### Phase 3 — Tea shop + Materials + Rentals + Wallet deposits
- Wire `PayerSourceSplitInput` into the remaining 7 write dialogs.
- Corresponding RPC updates.
- `v_all_expenses` extensions for the remaining 5 tables.
- `MoneySourceSummaryCard` rollup aggregation update — the only consumer that needs the splits aggregated.
- Final sweep of read-side components.

Each phase is committable and deployable independently. After Phase 1, splits work end-to-end for one dialog and the foundation is in place; Phase 2 and Phase 3 are mechanical extensions.

---

## Out of scope

- **Reports / exports**: The rollup card is updated in Phase 3. PDF exports of settlements may need a parallel update once Phase 3 lands; tracked separately.
- **Backfill**: No backfill of historical rows. All existing rows stay with `payer_source_split = NULL` and behave exactly as before.
- **Wallet spend splits**: The engineer-wallet spend allocator is unchanged — it continues to write proportional splits to `engineer_wallet_spend_allocations`. The new user-entered split feature does not apply to wallet spends (the user doesn't choose; the allocator does).
- **More than 3 sources**: Hard cap at 3. If 4+ comes up, revisit.
- **Per-row payer notes**: The JSONB shape allows a `name` per row (for `custom` / `other_site_money`) but no free-text note. Notes still live on the parent row.

---

## Risks

- **Sentinel string collision**: `payer_source = 'split'` is reserved. The `payer_sources` registry must not allow a row with `key = 'split'`. Add a CHECK on `payer_sources` to enforce this.
- **JSONB query cost**: `jsonb_array_elements` in the rollup view is O(N × avg_split_size). With splits expected at < 1% of rows and array size capped at 3, the overhead is negligible. If it ever becomes a hot path, the rollup card can move to a materialized view.
- **Edit re-validation**: Editing a single-source row to a split (or vice versa) on a row whose downstream rollup is cached requires a refresh. Existing edit flows already invalidate the relevant React Query keys; verified during Phase 2 wiring.
- **Source registry drift**: If a site adds a custom source after a row is split-saved, the saved row's source key is still valid as long as the registry row isn't deleted. Deleting a registry row that has rows referencing it (single or split) should remain blocked (existing constraint, verify still holds for the JSONB case).

---

## Testing

- SQL validator unit tests: empty array, single row, four rows, sum mismatch, sum within tolerance, unknown source, duplicate source, valid 2-row, valid 3-row.
- TS validator unit tests: same cases mirrored.
- E2E (Phase 1): `PaymentDialog` — toggle on, fill 2 sources summing to total, confirm, verify `settlement_groups` row has `payer_source = 'split'` and `payer_source_split` JSONB. Toggle off, single source, confirm, verify legacy shape unchanged.
- E2E (Phase 2): edit a single-source settlement to a split, save, verify both shapes survive a round trip.
- Rollup test (Phase 3): create one single-Amma row of ₹3,000 and one split row of ₹3,000-Amma + ₹2,000-Trust; verify Money Source Summary shows Amma = ₹6,000 and Trust = ₹2,000.
