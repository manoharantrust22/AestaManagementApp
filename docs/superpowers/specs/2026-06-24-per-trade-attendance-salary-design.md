# Per-trade attendance + salary — design spec

_2026-06-24 · Phase 3, slice 1 of 3 (attendance + salary; tea-shop & holidays are later slices)._

## Context / problem

"Workspace-per-trade" (Phases 1–2) made a *workspace* a property of a trade and added the
flag + guarded toggle + drag-drop ladder. But the **operating surface** Civil runs —
per-labourer **attendance** + **wage settlement** — still only works for Civil:

- Only Civil has an auto-created in-house **detailed** contract (`is_in_house=true`,
  `labor_tracking_mode='detailed'`, `trade_category_id=Civil`). It's created/backfilled in
  `supabase/migrations/20260502120000_add_trade_dimension.sql`.
- Phase 1 **removed `detailed` from the node-creation picker** (it's a trade-level thing now),
  so a Painting workspace has **no way** to run per-labourer attendance.
- The per-labourer attendance + settlement flow (`/site/attendance`, `/site/payments`) is
  **site-wide and Civil-centric**: it fetches all site attendance and lists *all* site
  labourers (`src/lib/data/attendance.ts` filters on `site_id` only; `AttendanceDrawer` lists
  all active labourers). It ignores `?contractId=`.
- `TradeAttendanceView` / `TradeSettlementView` handle **headcount/mid** trades (contract-scoped)
  but render an explicit **placeholder** for `detailed` ("ships in the next slice"). This *is*
  that slice.

Goal: each workspace-trade can mark its own labourers' daily attendance and settle their wages,
exactly like Civil — separate per trade.

## Decisions (approved)

1. **Model — auto "In-house" contract per trade.** Each workspace-trade gets a
   `{Trade} — In-house` detailed contract mirroring Civil's, reusing all existing detailed
   attendance + settlement machinery. No new tables.
2. **Creation — lazy, on first use.** Created the first time someone opens that trade's
   attendance / settles a wage there. No eager backfill.
3. **Reuse, don't rebuild.** Make the **existing** per-labourer flow trade-scoped rather than
   filling the trade-view detailed placeholders with a duplicate UI. One battle-tested flow,
   parametrised by trade. Headcount/mid keep using the trade views.
4. **Labourer scoping rule.** A trade's attendance lists labourers where
   `laborers.category_id = trade` **plus** anyone who already has attendance under that
   in-house contract (so no historical labourer disappears).

## Architecture

### a. Lazy in-house contract resolver
`ensureTradeInHouseContract(siteId, tradeCategoryId) → contractId` — idempotent. Returns the
existing `is_in_house=true` detailed contract for that (site, trade), else creates it
(title `{Trade} — In-house`, `labor_tracking_mode='detailed'`, `is_in_house=true`,
`status='active'`, `is_rate_based=false`, `total_value=0`). Implement as a SECURITY DEFINER
RPC (matches `contract_party_check`'s in-house exemption + avoids client-side race on
concurrent first-clicks). Civil's existing in-house contract is returned unchanged.

### b. Trade-scope the existing per-labourer flow
When `/site/attendance` (and `/site/payments`) is opened with a `?contractId=` that resolves to
a **detailed** contract, scope the page to that contract's trade:
- **Labourer list**: `category_id = contract.trade_category_id` **∪** labourers with existing
  `daily_attendance.subcontract_id = contractId`.
- **Attendance rows shown**: the site's rows for those scoped labourers within the date window
  (scoping is by labourer, not by `subcontract_id`, so a Civil labourer's historical rows under
  any contract still show).
- **New rows written**: tagged `subcontract_id = contractId` (so they roll up to the trade).
- Civil's in-house contract flows through the *same* path → scoped to Civil labourers.

Routing: `buildContractScopeHref` (`src/lib/workforce/contractScope.ts`) keeps detailed/in-house
contracts on the default per-labourer page (it already emits `?contractId=`); the page gains the
contract→trade scoping above. The triple (`categoryId`+`contractId`+`trade`) continues to route
headcount/mid to the trade views (unchanged).

### c. Entry points
Each workspace-trade surfaces a first-class **Attendance** + **Settle salary** entry. The
in-house contract row already exposes these via the Phase-1 `RecordDrawer` (gated by
`hasWorkspace` + detailed). The new bit: a per-trade affordance (trade header / empty-state CTA)
that calls `ensureTradeInHouseContract` then deep-links — so the user never hand-creates it.
Civil's experience is unchanged.

## Key files / seams
- `supabase/migrations/<new>_trade_in_house_contract.sql` — `ensure_trade_in_house_contract` RPC.
- `src/lib/data/attendance.ts` + `src/app/(main)/site/attendance/attendance-content.tsx` — add
  contract→trade scoping to the default flow (labourer list + rows + write-tagging).
- `src/components/attendance/AttendanceDrawer.tsx` — scope the labourer roster (the "all active
  labourers" query) by the resolved trade + historical-attendance union.
- `src/app/(main)/site/payments/payments-content.tsx` + `src/lib/services/settlementService.ts`
  — same trade scoping for the settlement waterfall.
- `src/lib/workforce/contractScope.ts` — confirm detailed/in-house routing (likely unchanged).
- Workforce entry points: `src/components/workforce/` (trade header / RecordDrawer wiring) +
  a hook `useEnsureTradeInHouseContract`.

## Risk + mitigation
**Civil behaviour change.** Civil's attendance goes from "all site labourers" to "Civil-trade
labourers + historically-attended". Mitigations: (1) the historical-attendance union keeps
anyone already tracked; (2) a **read-only data check** on `laborers.category_id` before ship —
count labourers with NULL/uncategorised category and any who've attended under Civil's in-house
contract but aren't `category_id=Civil`; surface gaps to the owner; (3) ship behind verification
against the Padmavathy data.

## Non-goals (this slice)
- Tea-shop per trade; holidays per trade (separate slices).
- Headcount/mid trade views (already shipped).
- Removing the trade-view `detailed` placeholders (they're simply not reached; optional cleanup
  later).

## Verification
- Unit: the labourer-scoping selector (trade ∪ historical) is pure → testable.
- `tsc` clean; existing attendance/settlement tests green.
- Live (Playwright, prod data): Civil attendance still lists the right labourers; create a
  Painting in-house contract via the entry point, mark a Painting labourer's day + settle it,
  confirm it's scoped to Painting and rolls up; 0 console errors. Reversible / restore any test
  writes, as in Phase 2.
- Data check (read-only SQL) on `laborers.category_id` coverage before ship.
