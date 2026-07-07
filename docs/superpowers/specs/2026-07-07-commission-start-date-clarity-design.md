# Commission start date — honest default + excluded-days warning

> Iteration 2b of the mesthri/contract-pay work. Iteration 2 (`5e480c9`) shipped the direct-pay
> pay-console. This slice fixes a UX trap in *how the commission start date is chosen* — it was
> silently excluding already-worked days — plus a one-off prod data correction to WaterTank.

## Context — the problem the owner hit

Looking at WaterTank (`/site/trades`), the owner expected the mesthri's commission to reflect **every
day** his company laborers worked (₹50 per work-day), but the pane showed only ₹100 (2 days) instead of
₹650 (all 10 crew work-days).

Root cause: when you switch a contract to **direct-pay** (`mesthri_commission_enabled`), the
"Direct-pay from (cutover)" date pre-fills to **the coming Sunday** — a *future* date. Commission and
direct-pay only apply on/after that date (`v_daily_attendance_commission`:
`d.date >= ctx.effective_from`). So every day the crew already worked falls *before* the cutover and
earns nothing. The owner set it on, took the default, and lost the history.

Confirmed on prod for WaterTank: all crew days are **unpaid / unsettled** (no double-pay risk), the
amount math (`₹50 × work_days`, company laborers only) is correct, and the market laborers (the two
"Hindi" workers) + Elanjiyam the "female helper" are all `laborer_type = 'daily_market'` → **already
excluded**. The *only* defect is the start-date default.

## Decision (owner, locked)

Keep the "pick a date" model — do **not** force commission across the whole contract automatically — but
make the date **honest**:

1. Stop defaulting to a future Sunday.
2. Show a clear warning of exactly what a chosen date excludes (N work-days, ₹ commission).

(Owner picked this over "auto-cover from the crew's first day".)

## Scope

**Immediate data correction (DONE, prod):** WaterTank's `mesthri_commission_effective_from` set
`2026-07-07 → 2026-06-30` (the crew's first day). Verified: Hemanta ₹225, Jugeswar ₹200, Sadha ₹125,
Utam ₹100 → **Jithin commission ₹650**; Ramaiya (market) ₹0; Jithin's own days gross ₹6,825, no
self-commission. Live-computed (nothing settled), so it took effect immediately.

**Code (this slice):** two dialogs + one read hook + copy. **No schema change. No change to the
commission math** (`mesthri_commission_of`, the view, the settle RPCs are untouched). Sunday-alignment
guidance is dropped — since iteration 2 separated contract crew from the weekly company page, the
`effective_from` date no longer needs to land on a week bucket.

## Behaviour spec

### 1. `useContractCrewCommissionDays(kind, refId, maistryId)` — new read hook
- `kind: "task_work" | "subcontract"`, `refId: string | null`, `maistryId: string | null`.
- Query `daily_attendance d JOIN laborers l` filtered to the contract
  (`task_work_package_id = refId` or `subcontract_id = refId`), `l.laborer_type = 'contract'`, and
  `d.laborer_id <> maistryId` (the maistry's own days generate no commission — exclude them).
- Returns `{ rows: Array<{ date: string; workDays: number; dailyEarnings: number; commissionPerDay: number }>, earliestDate: string | null }`.
- `enabled` only when `refId` is set (i.e. editing an existing contract). New contracts have no
  attendance → hook returns empty.

### 2. `TaskWorkPackageDialog.tsx` — edit dialog (the trap site)
- **Default / fallback date:** replace both `comingSunday()` uses (toggle-on default at
  [L495-498](src/components/task-work/TaskWorkPackageDialog.tsx#L495-L498) and the save fallback at
  [L312-313](src/components/task-work/TaskWorkPackageDialog.tsx#L312-L313)) with
  `earliestDate ?? todayISO()`. So enabling direct-pay defaults to capturing all the crew's days;
  never a future date.
- **Warning under the date field:** compute in the component (useMemo keyed on the selected date +
  `rows`) using the existing pure helper
  `mesthriCommissionOf(true, dailyEarnings, commissionPerDay, workDays)`:
  - `excluded = rows where date < selected`: `Σ workDays`, `Σ commission`.
  - Counts are in **work-days** (the unit commission is computed from — a 1.5 work-day entry = ₹75),
    formatted with trailing `.0` dropped.
  - If `excluded.workDays > 0` → MUI `Alert severity="warning"`:
    *"{workDays} work-day(s) before {formatted date} won't earn commission (−₹{amount} to the
    mesthri). Pick an earlier date to include them."* — WaterTank at `2026-07-07`: *"11 work-days
    before 07 Jul won't earn commission (−₹550 to the mesthri)."*
  - Else → `Alert severity="success"` (subtle): *"All {includedWorkDays} work-day(s) so far are
    included."*
  - When `rows` is empty (no attendance yet) → no alert.
- **Helper text:** reword to *"Commission applies to company-laborer days on/after this date. Days
  before it are not counted."* Remove the "Use a Sunday" sentence.
- Pass `editing?.id` as `refId` and `editing?.maistry_laborer_id` as `maistryId` to the hook.

### 3. `QuickCreateContractDialog.tsx` — new subcontract
- Change the enabled default at
  [L184-189](src/components/trades/QuickCreateContractDialog.tsx#L184-L189) from the coming-Sunday IIFE
  to **today** (`dayjs().format("YYYY-MM-DD")`). A brand-new contract has no prior work, so no warning
  is shown here (kept deliberately minimal; if backdated attendance is later added, the owner adjusts
  the date via the edit dialog, which has the warning).

## Non-goals
- No change to the commission amount rule (₹50 per work-day, prorated) — the owner confirmed per-day.
- No change to who is charged (company `contract` laborers only; market + the female helper already
  excluded by `laborer_type`).
- No migration, no RPC/view change.
- Subcontract edit dialog does not currently expose this date field; not adding the warning there in
  this slice (task-work packages are the owner's concrete surface). If/when the subcontract editor
  gains the field, it reuses the same hook + warning component.

## Verification
1. **Unit:** a small pure test for the before/after split math (reuse `mesthriCommissionOf`): given
   WaterTank-shaped rows and a cutover of `2026-07-07`, excluded = 11 work-days / ₹550, included =
   2 work-days / ₹100; at `2026-06-30`, excluded = 0, included = 13 work-days / ₹650.
2. **Build:** `npm run build` — stop all dev servers first (owner's `dev:cloud` on :3000).
3. **Playwright (dev:cloud, when the browser is free):** open WaterTank → edit → toggle already on;
   the date shows 30 Jun with "all 13 work-days included"; move it to 07 Jul → warning shows "11
   work-days … −₹550"; move back → success. 0 console errors. (Read-only interaction — do not save
   changes that alter prod money without the owner.)
4. **Prod data check (done):** WaterTank commission = ₹650, market laborer excluded.

## Risk / sequencing
- The prod data fix is already applied and reversible (set the date back). Zero code risk.
- The code change is display + default only; it cannot change already-settled money (settled rows read
  the snapshot, not the view). Ship with the next push.
