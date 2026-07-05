# Painting-contract attribution: keep a trade's labour on its own contract, out of Civil

Date: 2026-07-05
Site of record: Srinivasan House & Shop (Padmavathy/other sites inherit the same behaviour generically)

## Problem

Asis (the Painter) has his own in-house trade contract, **"Painting — In-house"**. When his
attendance is recorded on `/site/attendance` **without** picking a contract, his day lands
with `daily_attendance.subcontract_id = NULL`. Those untagged days:

- do **not** show inside the Painting trade workspace (which is scoped to the painting
  subcontract), and
- **do** show in the default "Company Settlement" tab on `/site/payments`, which is a
  company-wide (all-contracts) view — so painting work reads as if it were mixed into the
  Civil/company settlement.

The owner settles painting **separately** inside the Painting workspace. Counting the same
day in both places = paying for one day of work twice, and it blurs the line between Asis's
painting contract and Jithin's Civil contract.

## Current state (verified against prod)

Trade model lives in `public.labor_categories` (company-global system seeds):
- **Civil** `96dce093-2509-4f5f-8aa3-326e7f8f15d4` — `has_workspace=true`, `display_order=1`.
  The default trade; the default "Company Settlement" view is built around it.
- **Painting** `d862a9a3-a0ab-4674-b4ca-9a25d3baed40` — `has_workspace=true`. Gets its own
  trade workspace view.

Srinivasan subcontracts:
- `71a92fdb…` **Painting — In-house** — trade=Painting, `is_in_house=true`,
  `laborer_id = 22090769…` (Asis the Painter is its in-house mesthri).
- `e1e2eb8d…` **Jithin Civil** (parent) + children `1f5fae1d…` House Construction,
  `d04f1101…` Shop construction (trade=Civil). `9f706ae8…` Civil — In-house is cancelled.

Asis the Painter (`22090769…`) attendance — 6 days:
| date | subcontract_id | note |
|------|----------------|------|
| 2026-06-25 | 71a92fdb Painting | ✓ correct |
| 2026-06-26 | 71a92fdb Painting | ✓ correct |
| 2026-06-27 | **NULL** | ✗ untagged |
| 2026-06-29 | 71a92fdb Painting | ✓ correct |
| 2026-06-30 | 71a92fdb Painting | ✓ correct |
| 2026-07-01 | **NULL** | ✗ untagged |

Only **2 days (₹2,000)** are untagged. **None** of his days are on any Civil subcontract —
his pay is not currently linked to Jithin.

Attribution mechanism (already in the schema):
- `daily_attendance.subcontract_id` scopes a company laborer's day to a trade/contract.
- The Company Settlement RPCs `get_salary_waterfall` / `get_salary_slice_summary` filter
  `d.subcontract_id = p_subcontract_id` when `p_subcontract_id` is passed.
- `/site/payments` calls those RPCs with `p_subcontract_id = NULL` in the default view
  (`selectedSubcontractId = scopeTradeId ? contractIdParam : null`), i.e. **all contracts**.
  Non-Civil trades (Painting…) are opened via the trade chip into a **separate**
  `TradeSettlementView` scoped to that contract.
- `/site/expenses` (`page.v2.tsx`) already groups/filters by trade via a
  `contract_id → trade` map (`contractToTrade`) and `useExpenseTradeSummary`.
- Precedent: `task_work_package_id`-tagged days are already excluded from BOTH the Daily+Market
  and Company settlements and shown greyed as "Paid via contract" (migs 20260702130000 /
  20260704100200 / 20260705100000). This spec applies the **same shape** with the dividing
  line being *trade* rather than *task-work package*.

## Decisions (from brainstorming)

1. In the default Company Settlement view, a laborer's **non-Civil trade-contract** days are
   shown **greyed with a trade chip** and **excluded from the Civil/company settleable math**
   (not hidden, not left counted).
2. **Go-forward:** attendance saved with no contract selected, for a laborer who is the
   **in-house mesthri (`subcontracts.laborer_id`) of a non-Civil trade contract**, auto-defaults
   that day's `subcontract_id` to that contract. Overridable — recording a civil day means
   picking Civil explicitly.
3. The "it's Painting" indication appears on **all three** surfaces: Payments Company-Settlement
   per-day expansion, the `/site/expenses` full-site ledger, and the Painting workspace itself.

## Design

### Piece 1 — Data fix (existing stray days)
One-off prod UPDATE: set `subcontract_id = 71a92fdb…` on Asis's two untagged, non-deleted,
non-archived days (2026-06-27, 2026-07-01). Show the exact rows and get explicit confirmation
before running (prod write). No other rows touched. His 4 correct days and all Civil data are
left untouched.

### Piece 2 — Company Settlement math excludes non-Civil trades (RPC)
`CREATE OR REPLACE` `get_salary_waterfall` and `get_salary_slice_summary` (reproduce current
prod defs verbatim — base is mig 20260705100000 — plus one guard). In the daily_attendance
source CTE, a day counts toward the **default/company** waterfall only when it is Civil or
untagged:

```
AND (
  d.subcontract_id IS NULL
  OR EXISTS (
    SELECT 1 FROM public.subcontracts sc
    JOIN public.labor_categories lc ON lc.id = sc.trade_category_id
    WHERE sc.id = d.subcontract_id AND lc.name = 'Civil'
  )
)
```

Constraints:
- Applies **only when `p_subcontract_id IS NULL`** (the company-wide view). When the caller
  scopes to a specific `p_subcontract_id` (any trade contract, incl. Painting), that
  contract's days must still show — so gate the new predicate behind `p_subcontract_id IS NULL`.
- Keep the existing `laborer_type='contract'` and `task_work_package_id IS NULL` guards.
- Civil identified by the company's `labor_categories.name = 'Civil'` seed (stable,
  `is_system_seed=true`). Untagged (`subcontract_id IS NULL`) days remain in the company view.
- **Apply the SAME "Civil-or-untagged only, when `p_subcontract_id IS NULL`" filter to the
  settlement/advance CTEs** (`setts`/`advs` on `settlement_groups.subcontract_id`, and the
  `_settlements` temp table in `get_salary_waterfall`). Otherwise a settlement made in the
  Painting workspace would still count as "paid" in the company view while its wages are now
  excluded — inflating `future_credit` / breaking the paid-vs-due reconciliation. Both the wages
  side and the paid side must move together.
- Re-`GRANT EXECUTE` to `authenticated, service_role`.

Net effect: MESTRI OWED / weekly wages-due AND the matching paid total in the default view drop
by exactly the non-Civil trade amount; painting is settled only in its own workspace. No data
migration — RPCs recompute live.

### Piece 3 — Per-day drawer: greyed "Painting" row
- `get_attendance_for_date` (RPC): add per daily-laborer row `subcontract_id`,
  `subcontract_title`, and `trade_name` (join `subcontracts` → `labor_categories`). Currently
  it returns none of these.
- `useAttendanceForDate.ts`: carry the new fields on `AttendanceLaborerRow`; add a bucket for
  **non-Civil trade-contract** rows (parallel to the existing `taskWork` bucket).
- `InspectPane/AttendanceTab.tsx` (`DayDetailExpansion`, contract-primary mode + `DailyShape`):
  render a greyed section for trade-contract laborers — a **trade chip** (e.g. "Painting") on
  each row + note "Not included in this settlement's calculation — settled separately under
  {trade} ({contract title}).", styled like the existing task-work / cross-tab greyed sections.
  Excluded from the settleable subtotal so the panel matches the corrected RPC. `N worked on
  this day` still counts everyone.

### Piece 4 — `/site/expenses` full-site ledger
Mostly data-driven once Piece 1 tags the days:
- Verify labour-expense rows for painting attendance carry `contract_id = Painting — In-house`
  (attendance→expense sync path). If the expense row does not inherit `subcontract_id`, fill
  the gap so `contractToTrade` resolves it to **Painting** rather than "unlinked".
- Confirm the existing trade group/filter and `useExpenseTradeSummary` then surface painting
  labour as its own **Painting**-tagged line in the full ledger — included in the site total,
  visually separated from Civil. No new UI shape expected; this is verify + small fill.

### Piece 5 — Painting workspace (TradeSettlementView)
Minor: ensure the header/labelling makes the **"Painting — In-house"** contract explicit so
settling there is unambiguous. It is already scoped to that contract's days; this is a clarity
tweak, not new logic.

### Piece 6 — Go-forward auto-default in the attendance save path
When an attendance row is being created and no `subcontract_id` was chosen:
- Look up whether the laborer is the `laborer_id` of an active `is_in_house` subcontract whose
  trade is **non-Civil** (Asis → Painting — In-house). If exactly one, default this day's
  `subcontract_id` to it.
- If the recorder explicitly picked a contract (incl. Civil), honour that — no override.
- Scope: only in-house trade mesthris. Laborers with no such contract, or Civil mesthris, are
  unaffected (untagged stays untagged / Civil).
- Location: the attendance create/save logic used by `/site/attendance` (AttendanceDrawer /
  attendance-content insert path). Prefer a single shared helper so both grid and drawer entry
  paths get the default.

## Not doing (scope guard)
- No change to how anyone is **paid** or to the Painting/Civil payment features themselves —
  only which bucket a day is *counted* in.
- No touching Jithin's Civil contract or its children.
- No auto-tagging of laborers who are not the in-house mesthri of a non-Civil trade contract.
- No backfill beyond Asis's 2 stray days (Piece 1).
- Header/overview totals that represent *labour deployed* (not settlement obligation) stay
  all-inclusive, consistent with the task-work decision.

## Edge cases
- A laborer who is a Civil mesthri **and** has painting days: painting days (tagged to the
  painting contract) still leave the Civil math; Civil/untagged days remain. Fine.
- Multiple in-house trade contracts for one laborer: auto-default only fires when exactly one
  matches; otherwise leave untagged (no guess).
- A day tagged to a **cancelled** trade contract: treat as its trade for display, but confirm it
  doesn't resurrect settleable rows (cancelled Civil child `9f706ae8` exists).
- Scoped Painting view (`p_subcontract_id = 71a92fdb`) must be unchanged by Piece 2.

## Verification
1. `npm run build` + `npm run test` green.
2. Rolled-back / read-only prod SELECTs: default `get_salary_slice_summary(site, NULL)` mestri
   owed drops by exactly Asis's painting total after Piece 1+2; the Painting-scoped call
   (`p_subcontract_id = 71a92fdb`) is unchanged and shows all 6 days.
3. Playwright on dev:cloud (Srinivasan):
   - Payments → Company Settlement (default): Asis's painting days greyed with a **Painting**
     chip + "settled under Painting"; not in the settleable total; Civil unaffected.
   - Payments → Painting chip → workspace shows all 6 days / its own settle flow.
   - `/site/expenses`: painting labour appears under a **Painting** tag/group in the full
     ledger, separated from Civil, not "unlinked".
   - `/site/attendance`: record a new Asis day with no contract → it defaults to Painting;
     recording an explicit Civil day stays Civil.
   - Console clean; close browser.

## Deploy
Migrations are additive `CREATE OR REPLACE` (read-path only). Apply to prod **only** on explicit
"move to prod"; schema-first then code, per CLAUDE.md. Piece 1 (data UPDATE) requires separate
explicit confirmation before running.
