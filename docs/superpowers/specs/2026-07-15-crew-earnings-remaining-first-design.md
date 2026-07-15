# Crew Earnings & Commission — remaining-first mesthri strip, week history, project default

**Date:** 2026-07-15
**Surface:** `/site/trades` → contract detail → "Crew earnings & commission"
**Component:** `src/components/workforce/ContractLaborLedger.tsx`

## Problem

Three complaints from real use on the WaterTank package (mesthri Jithin):

1. **The panel opens on Week.** The useful default is the whole-project cost.
2. **Week only ever shows the current week.** Wages are paid weekly, so each past week
   is its own event with its own earnings. There is no way to see week 2 of a contract.
3. **The mesthri strip leads with a meaningless total.** It reads
   `Own labour ₹15,750 + commission ₹1,825 = ₹17,575` — a gross lifetime figure.
   Every laborer row below already leads with what is *still owed* and demotes the
   total to a `₹5,200 paid of ₹10,125` caption. The mesthri — the person handling the
   most money — is the one row that doesn't answer "what do I still owe him?".

## Findings that constrain the design

These were verified against the migrations, not assumed.

### F1 — Commission accrues per contract but is paid per site

`get_contract_labor_ledger(p_kind, p_ref_id, …)` scopes commission **accrual** to one
contract via `daily_attendance.task_work_package_id` / `subcontract_id`.

`get_mesthri_commission_payable` (`20260705130100`) computes **paid** as
`Σ settlement_groups WHERE payment_type='commission' AND commission_collector_laborer_id = <mesthri>`
— filtered by **site only**. There is no contract link on a commission payout.

**Therefore "commission still owed on THIS contract" does not exist in the data today.**

Related existing conflation: `get_contract_payment_history` branch 3
(`20260707140300` L63) lists *all* of the mesthri's site-wide commission payouts under
every contract he collects on, matching only the collector. Out of scope to fix here,
but it is the same root cause.

### F2 — `net_unpaid` mixes scopes (existing bug)

In `20260707140100_get_contract_labor_ledger_amount_paid.sql`:

- the `days` CTE **is** windowed by `p_date_from`/`p_date_to` → `gross`/`commission`/`net` are windowed
- the `paid` CTE has **no** date filter → `net_paid` is project-wide
- `net_unpaid = GREATEST(days.net - paid.net_paid, 0)`

So outside the Project view, `net_unpaid` = *windowed net − project-wide paid*. The
migration header admits this: *"at the default Project view windowed net = project net
so net_unpaid is exact."* On the Week tab the clamp drives most rows to `₹0 owed`
and captions read nonsense like `₹5,200 paid of ₹3,600`.

Payment is already project-scoped regardless of tab — `ContractLaborLedger.tsx:206-207`
passes `dateFrom={null} dateTo={null} windowLabel="in total"`.

### F3 — No new column is needed to tag commission to a contract

`settlement_groups` already has `contract_ref_kind` / `contract_ref_id` /
`contract_laborer_id` (`20260707140000`), and they are not restricted to
`payment_type='salary'`. `settlementService.ts:1011` already performs a follow-up
`.update()` to set `commission_collector_laborer_id` — the contract ref can ride along.

### F4 — The mesthri accrues no commission on his own days

`v_daily_attendance_commission` L60 gates `is_commission_crew_day` on
`d.laborer_id <> ctx.collector_id` (self-exclusion). So for the mesthri's own row
`gross == net`, which makes `own ₹15,750 + commission ₹1,825 = ₹17,575` a sound
denominator and `netUnpaid` (net-based) a sound "own wages remaining".

### F5 — A canonical week helper already exists

`src/lib/utils/weekUtils.ts` — `weekStartOf`/`weekEndOf`, Sunday→Saturday, locale-independent.
`ContractLaborLedger.windowFor` currently re-implements the same math inline.

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Default tab = **Project** | What the user asked for; also the only scope where paid/remaining is exact (F2) |
| D2 | Week tab = **all weeks, newest first**, collapsible, "Load earlier weeks" | Matches the weekly pay rhythm |
| D3 | Weeks show **earned only** | Per-week remaining is not computable — payments aren't recorded against a week |
| D4 | **Tag new commission payouts** with `contract_ref_kind`/`contract_ref_id` | Makes per-contract commission real going forward, no new column (F3) |
| D5 | Past untagged payouts get an **explicit caveat line**, never silently counted | Counting them would understate; ignoring them silently would overstate |
| D6 | **No FIFO backfill** of historical payouts | Would write an inferred guess into the money ledger |
| D7 | **Pay stays on every tab** | User's explicit choice; made safe by D8 |
| D8 | Remaining is **always project-scoped and labelled** ("owed in total") | Fixes F2 without removing Pay |

## Design

### Mesthri strip (Project tab)

```
MESTHRI JITHIN · this contract

  STILL TO PAY                    ₹7,775
  Own wages ₹5,950 · Commission ₹1,825

  ₹9,800 paid of ₹17,575    [██████░░░░] 56%

  [ Pay own wages ₹5,950 ]  [ Pay commission ₹1,825 ]
```

- `STILL TO PAY` = own-wages remaining + commission remaining (contract-tagged only).
- `₹17,575` demoted to the denominator — same shape as the laborer rows.
- Fully settled → green `All settled · ₹17,575 paid`, no progress bar.
- `commissionApplies === false` → commission terms omitted entirely; strip shows own wages only.
- Untagged history present → append:

```
  ⚠ ₹3,000 commission paid to Jithin site-wide earlier, not tagged
    to a contract — not counted above.
```

### Week tab

```
▾ Sun 29 Jun – Sat 5 Jul                    ₹12,400 earned
    Hemanta    Male Helper · 4.5d · earned ₹3,600
                              ₹4,925 owed in total   [Pay]
▸ Sun 22 Jun – Sat 28 Jun                   ₹18,750 earned
▸ Sun 15 Jun – Sat 21 Jun                   ₹14,200 earned
                    Load earlier weeks
```

- Newest week expanded by default; older collapsed.
- Left/earned = windowed and honest. Right/remaining = project-scoped, captioned
  **"owed in total"** so it never reads as a weekly figure (D8).
- The mesthri strip stays pinned and project-scoped on every tab.
- Empty state: "No company laborers on this contract yet."

### Day tab

Unchanged in shape; inherits the D8 caption fix.

## Data changes

| Layer | Change |
|---|---|
| `get_contract_labor_ledger` | Add project-scoped `net_total`, keep `net_paid`, redefine `net_unpaid = GREATEST(net_total - net_paid, 0)`. `gross`/`commission`/`net` stay windowed. Add `AND sg.payment_type <> 'commission'` to the `paid` CTE. |
| `get_contract_labor_ledger_weekly` (new) | `(p_kind, p_ref_id)` → rows bucketed by `week_start` (`date_trunc('week', date + 1) - 1` for Sun→Sat, matching `weekUtils`). One query for all weeks. |
| `get_mesthri_commission_payable` | Add optional `p_contract_ref_kind`/`p_contract_ref_id`. When passed, `paid` counts only payouts tagged to that contract, and an extra `untagged_paid` column reports site-wide untagged total for the caveat line (D5). |
| `settlementService.payMesthriCommission` | Accept optional contract ref; include in the existing follow-up `.update()`. **Leave `contract_laborer_id` NULL.** |
| `CommissionPayoutDialog` | Accept + forward contract ref; default amount to the *contract* payable when given. |
| `ContractLaborLedger.tsx` | `defaultPeriod = "project"`; reuse `weekUtils`; new strip; week list. |

### Double-count guard (important)

The ledger's `paid` CTE keys on `contract_laborer_id IS NOT NULL` **without** filtering
`payment_type`. If a tagged commission payout also set `contract_laborer_id`, it would be
counted as the mesthri's **own wages** paid — inflating `net_paid` and hiding real debt.

Two independent defences, both required:
1. Commission rows set `contract_ref_*` but leave `contract_laborer_id` NULL.
2. The `paid` CTE additionally filters `payment_type <> 'commission'`.

## Testing

- **Unit:** week bucketing (Sat/Sun boundary, contract spanning a year end); strip math for
  zero commission, `commissionApplies=false`, fully-paid, and untagged-history cases.
- **DB:** `BEGIN; … ROLLBACK;` dry-run on prod for each RPC (no Aesta staging DB exists).
  Assert per-contract commission paid excludes untagged rows, and that a tagged commission
  payout does **not** change any laborer's `net_paid`.
- **E2E (Playwright, `dev:cloud`):** open WaterTank → panel opens on Project → strip leads
  with STILL TO PAY → switch to Week → multiple weeks listed, each earned-only → console clean.

## Out of scope

- Fixing `get_contract_payment_history` branch 3's site-wide commission conflation (F1).
- Backfilling historical commission attribution (D6).
- Changing how commission accrues.
