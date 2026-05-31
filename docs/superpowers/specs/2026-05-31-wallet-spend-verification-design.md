# Wallet Spend Verification — Design

**Date:** 2026-05-31
**Status:** Approved (design)
**Surfaces:** `/company/engineer-wallet` (office) and `/site/my-wallet` (engineer)

## Problem

The engineer-wallet **Spends** activity feed lists every wallet spend (misc
expenses, salary settlements, contract payments, material/rental spends) as a
one-line row: type, amount, date, payment mode, and a description. Office staff
cannot, from this feed, see **what was actually purchased** or the **bill/proof**
behind a spend. Verification today means leaving the page and hunting in the
expenses or settlement screens.

The trigger case: a misc expense like `Misc expense MISC-260530-003 - Pudukai
Building Materials` shows ₹150 CASH and nothing else. The vendor bill image and
the "what/why" are recorded but invisible here.

## Goal

Make every **spend** row (and, for free, **return** rows) tappable. Tapping
opens a read-only **Spend details** dialog that shows the row's own data plus any
attached images, and — for misc expenses — the linked vendor bill, vendor name,
category and full description. Verification happens in-app without navigating
away.

## Non-goals (YAGNI)

- No editing or cancelling from this dialog. Verification only.
- No rebuild of the settlement / material / rental detail screens. At most a
  link-out to an existing one.
- No database/schema change. Every field already exists.

## Data model & linkage (verified)

A spend in the feed is a `site_engineer_transactions` row
(`WalletLedgerEntry`). The ledger query already filters `cancelled_at IS NULL`,
so only live rows appear. Relevant fields already on the row:

- `description` — e.g. `Misc expense MISC-260530-003 - <vendor>`,
  `Salary settlement SET-260528-003`, `Contract payment for X (SET-…)`.
- `proof_url` — the **payment** screenshot, populated for misc (`createMiscExpense`)
  and salary/contract (`settlementService.recordSpend`, passes `config.proofUrl`).
- `notes`, `amount`, `transaction_date`, `payment_mode`, `payer_source`,
  `payer_name`, `recorded_by`, `settlement_reference`.

The richer **misc** detail lives in the separate `misc_expenses` table, linked by
`misc_expenses.engineer_transaction_id = <wallet row id>`. Fields of interest:

- `bill_url` — the **vendor bill** image (spot-purchase capture), distinct from
  `proof_url` (payment screenshot).
- `vendor_name`, `description`, `notes`, `amount`, `category_id` (+ joined
  `expense_categories.name`).

Linkage is by `engineer_transaction_id` (robust) rather than parsing the
reference out of the description.

## UX

```
┌─ Spend details ───────────────────────────×─┐
│  ↓  Misc expense              − ₹150  [CASH] │
│     30 May 2026 · MISC-260530-003            │
│ ─────────────────────────────────────────── │
│  Vendor      Pudukai Building Materials      │
│  Category    Hardware                        │
│  For         "Plastering"                    │
│  Paid by     Site Cash                       │
│  Recorded    by Srinivasan · 30 May 2026     │
│ ─────────────────────────────────────────── │
│  ATTACHMENTS                                 │
│   ┌────────┐  ┌────────┐                     │
│   │  bill  │  │ payment│   ← tap → fullscreen │
│   └────────┘  └────────┘      zoom lightbox   │
│   Vendor bill   Payment proof                │
└──────────────────────────────────────────────┘
```

Per-type behavior:

- **Misc expense** → full treatment above (vendor, category, "for…", vendor bill
  image + payment proof).
- **Salary / contract settlement** (`SET-…`) → friendly label + payment proof +
  a "View full settlement →" link. **Stretch goal**: wired only if a clean
  existing route can be supplied from this page; dropped otherwise (see Scope).
- **Material / rental / other** → universal block (amount, date, mode, payer,
  notes) + any `proof_url` image on the row.
- **Nothing attached** → an explicit "No bill or payment proof attached" line, so
  a missing bill is visible rather than ambiguous (nudges attaching going
  forward).

Applies on both `/company/engineer-wallet` and `/site/my-wallet` (shared
`WalletLedgerList`). The dialog is read-only, so no role gating.

## Components & wiring

- **New** `src/components/wallet-v2/SpendDetailDialog.tsx`
  - Props: `{ open: boolean; onClose: () => void; row: WalletLedgerEntry | null }`.
  - Classifies the row, renders the universal block + type-specific enrichment,
    holds local lightbox state.
  - Reuses the existing `src/components/dashboard/PhotoLightbox.tsx`. Its
    `WorkPhoto[]` only reads `{ id, url, description }`, so images are passed as
    `[{ id: "bill", url: bill_url, description: "Vendor bill" }, { id: "proof",
    url: proof_url, description: "Payment proof" }]` (filtered to those present).
  - MUI Dialog: follow the codebase hydration rules (no block elements inside
    `<p>` wrappers) and, if any Autocomplete is ever added, the portal rule. (No
    Autocomplete is needed here.)

- **New** pure helpers (exported for unit testing), colocated with the dialog:
  - `classifySpend(row): "misc" | "salary" | "contract" | "other"` from
    `description` / `settlement_reference`.
  - `parseMiscReference(description): string | null` (`MISC-\d{6}-…`), used only
    for display of the reference; the data fetch uses `engineer_transaction_id`.

- **New** query hook `src/hooks/queries/useMiscExpenseForTransaction.ts`
  - `useMiscExpenseForTransaction(transactionId: string | null, enabled)` —
    React Query; selects `bill_url, vendor_name, description, notes, amount,
    expense_categories(name)` from `misc_expenses` where
    `engineer_transaction_id = transactionId`. `enabled` only for misc rows and
    when the dialog is open. Returns a single row or null.
  - **Proof-image source of truth**: the **payment proof** always comes from the
    wallet row's own `proof_url` (present on every spend type). `misc_expenses`
    contributes only the **`bill_url`** (vendor bill) — the one image the wallet
    row does not carry. The two are written from the same capture at creation, so
    the wallet row's `proof_url` is authoritative and no second proof field is
    fetched.

- **Wiring**:
  - `WalletLedgerList.tsx` — `isClickable` becomes true for `spend` and `return`
    too (currently `deposit` only). Add a subtle affordance (cursor/hover already
    handled by `isClickable`).
  - `engineer-wallet/page.tsx` and `my-wallet/page.tsx` — route `onRowClick`:
    `deposit` → existing edit dialog; `spend` / `return` → open
    `SpendDetailDialog` with the row. Both pages own a
    `const [detailRow, setDetailRow] = useState<WalletLedgerEntry | null>(null)`.

## Edge cases

- Misc fetch **loading** → small inline spinner in the enrichment block; the
  universal block renders immediately from the row.
- Misc row but **no linked `misc_expenses` row** (legacy / cancelled) → silently
  fall back to the universal block.
- **Network error** on the misc fetch → inline "Couldn't load bill details" note;
  dialog still shows the row's own data + proof.
- **Broken image URL** → the lightbox/thumbnail shows the browser's broken-image
  state; acceptable (matches existing PhotoLightbox behavior).
- **RLS**: reading `misc_expenses` cross-site (office) and own-site (engineer)
  must be permitted. Verified during implementation; the company wallet page
  already reads cross-site wallet data so office has broad read.

## Testing

- **Vitest** unit tests for `classifySpend` and `parseMiscReference`, mirroring
  the existing `WalletLedgerList.dates.test.ts` pattern (pure helpers, table of
  cases incl. misc / salary / contract / material / null description).
- Manual Playwright verification per CLAUDE.md after the UI lands: open a misc
  spend with a bill, confirm the bill + payment proof render and zoom; open a
  cash misc with no attachments, confirm the "nothing attached" line; check
  console clean.

## Rollout

- Frontend-only. **No migration, no Cloudflare Worker change.** Ships via a plain
  "move to prod" (build → commit all → push; no schema step).
