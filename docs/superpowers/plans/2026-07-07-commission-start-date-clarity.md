# Commission Start Date Clarity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the "pay laborers directly" toggle from silently excluding already-worked days by defaulting the commission start date to a *future* Sunday, and show an honest warning of what any chosen date excludes.

**Architecture:** Pure split-math helper in `src/lib/workforce/commission.ts` (unit-tested), fed by a new read hook `useContractCrewCommissionDays` that pulls raw crew days from the `v_daily_attendance_commission` view. `TaskWorkPackageDialog` uses the helper to default the date to the crew's first day and render a warning/success `Alert`. `QuickCreateContractDialog` just changes its default date. No schema change; no change to the commission amount rule.

**Tech Stack:** Next.js 15, React, MUI v7, TanStack Query, Supabase JS client, Vitest, dayjs.

## Global Constraints

- **No schema/migration change.** Display + defaults only.
- **No change to the commission amount math** — `mesthriCommissionOf` (₹50 × work_days, floored at daily_earnings) and `v_daily_attendance_commission` are untouched. The helper only *sums* per-day commission on the client.
- **No change to who is charged** — company `laborer_type = 'contract'` only; market/`daily_market` (the two Hindi laborers + the female helper) already excluded upstream.
- **Query the view, not the base table with an embed.** `daily_attendance` has two FKs to `laborers` (`laborer_id` + `mesthri_commission_collector_id`); an un-hinted embed 300s (2026-07-06 regression). The `v_daily_attendance_commission` view already joins `laborers` and exposes `laborer_type` / `commission_per_day` — use it.
- **Cast the Supabase client to `any` for the view query** — the view is not in the generated types (mirrors `useContractLaborLedger`'s `(supabase as any)`).
- WaterTank prod data is already corrected (cutover → `2026-06-30`); this plan is code-only.

---

### Task 1: Pure split-math helper + unit tests

**Files:**
- Modify: `src/lib/workforce/commission.ts`
- Test: `src/lib/workforce/commission.test.ts`

**Interfaces:**
- Consumes: existing `mesthriCommissionOf(isCrew, dailyEarnings, rate, workDays)` in the same file.
- Produces:
  - `interface CommissionDayRow { date: string; workDays: number; dailyEarnings: number; commissionPerDay: number }`
  - `interface CommissionDateSplit { includedWorkDays: number; includedCommission: number; excludedWorkDays: number; excludedCommission: number }`
  - `function splitCrewCommissionByDate(rows: CommissionDayRow[], fromDate: string | null): CommissionDateSplit`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/workforce/commission.test.ts` (add the import name `splitCrewCommissionByDate` and the type `CommissionDayRow` to the existing import from `./commission`):

```ts
import { splitCrewCommissionByDate, type CommissionDayRow } from "./commission";

describe("splitCrewCommissionByDate", () => {
  // WaterTank-shaped crew days (maistry Jithin already excluded by the caller).
  const rows: CommissionDayRow[] = [
    // Hemanta — 3 days, all early
    { date: "2026-07-02", workDays: 1.5, dailyEarnings: 1200, commissionPerDay: 50 },
    { date: "2026-07-03", workDays: 1.5, dailyEarnings: 1200, commissionPerDay: 50 },
    { date: "2026-07-04", workDays: 1.5, dailyEarnings: 1200, commissionPerDay: 50 },
    // Jugeswar — 3 days, all early
    { date: "2026-06-30", workDays: 1.0, dailyEarnings: 950, commissionPerDay: 50 },
    { date: "2026-07-02", workDays: 1.5, dailyEarnings: 1425, commissionPerDay: 50 },
    { date: "2026-07-04", workDays: 1.5, dailyEarnings: 1425, commissionPerDay: 50 },
    // Sadha — 1 early, 1 on cutover
    { date: "2026-07-03", workDays: 1.5, dailyEarnings: 1200, commissionPerDay: 50 },
    { date: "2026-07-07", workDays: 1.0, dailyEarnings: 800, commissionPerDay: 50 },
    // Utam — 1 early, 1 on cutover
    { date: "2026-07-03", workDays: 1.0, dailyEarnings: 800, commissionPerDay: 50 },
    { date: "2026-07-07", workDays: 1.0, dailyEarnings: 800, commissionPerDay: 50 },
  ];

  it("cutover 2026-07-07 excludes the pre-cutover work (11 work-days / ₹550)", () => {
    const s = splitCrewCommissionByDate(rows, "2026-07-07");
    expect(s.includedWorkDays).toBe(2);
    expect(s.includedCommission).toBe(100);
    expect(s.excludedWorkDays).toBe(11);
    expect(s.excludedCommission).toBe(550);
  });

  it("cutover 2026-06-30 includes everything (13 work-days / ₹650)", () => {
    const s = splitCrewCommissionByDate(rows, "2026-06-30");
    expect(s.includedWorkDays).toBe(13);
    expect(s.includedCommission).toBe(650);
    expect(s.excludedWorkDays).toBe(0);
    expect(s.excludedCommission).toBe(0);
  });

  it("null cutover = no gate, everything included", () => {
    const s = splitCrewCommissionByDate(rows, null);
    expect(s.includedWorkDays).toBe(13);
    expect(s.includedCommission).toBe(650);
    expect(s.excludedCommission).toBe(0);
  });

  it("empty rows → all zeros", () => {
    const s = splitCrewCommissionByDate([], "2026-07-07");
    expect(s).toEqual({
      includedWorkDays: 0,
      includedCommission: 0,
      excludedWorkDays: 0,
      excludedCommission: 0,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/workforce/commission.test.ts`
Expected: FAIL — `splitCrewCommissionByDate is not a function` (or an import/type error).

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/workforce/commission.ts` (below `netOfCommission`):

```ts
/** One crew attendance day, the fields the commission split needs. */
export interface CommissionDayRow {
  date: string; // YYYY-MM-DD
  workDays: number;
  dailyEarnings: number;
  commissionPerDay: number;
}

/** Work-day + ₹ totals on each side of a chosen commission start date. */
export interface CommissionDateSplit {
  includedWorkDays: number;
  includedCommission: number;
  excludedWorkDays: number;
  excludedCommission: number;
}

/**
 * Split a contract's crew days at a candidate start date. Days on/after `fromDate`
 * are INCLUDED (earn commission), days before are EXCLUDED — mirrors the view
 * predicate `d.date >= effective_from` (and `effective_from IS NULL` = no gate).
 * Each day's commission = mesthriCommissionOf(true, ...). The caller must have
 * already dropped the maistry's own rows (they earn no commission).
 */
export function splitCrewCommissionByDate(
  rows: CommissionDayRow[],
  fromDate: string | null,
): CommissionDateSplit {
  const split: CommissionDateSplit = {
    includedWorkDays: 0,
    includedCommission: 0,
    excludedWorkDays: 0,
    excludedCommission: 0,
  };
  for (const r of rows) {
    const commission = mesthriCommissionOf(true, r.dailyEarnings, r.commissionPerDay, r.workDays);
    const workDays = n(r.workDays, 1);
    // NULL fromDate = no cutover = everything counts (matches the view).
    if (!fromDate || r.date >= fromDate) {
      split.includedWorkDays += workDays;
      split.includedCommission += commission;
    } else {
      split.excludedWorkDays += workDays;
      split.excludedCommission += commission;
    }
  }
  return split;
}
```

(`n` and `mesthriCommissionOf` already exist at the top of this file.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/workforce/commission.test.ts`
Expected: PASS (all four new tests + the existing `mesthriCommissionOf` tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/workforce/commission.ts src/lib/workforce/commission.test.ts
git commit -m "feat(workforce): splitCrewCommissionByDate — before/after commission split"
```

---

### Task 2: `useContractCrewCommissionDays` read hook

**Files:**
- Create: `src/hooks/queries/useContractCrewCommissionDays.ts`

**Interfaces:**
- Consumes: `CommissionDayRow` from `src/lib/workforce/commission.ts` (Task 1); `createClient`, `withTimeout`, `TIMEOUTS` (existing).
- Produces:
  - `type ContractCrewKind = "task_work" | "subcontract"`
  - `interface ContractCrewCommissionDays { rows: CommissionDayRow[]; earliestDate: string | null }`
  - `function useContractCrewCommissionDays(kind, refId, maistryId, enabled?) => UseQueryResult<ContractCrewCommissionDays>`

- [ ] **Step 1: Create the hook file**

Create `src/hooks/queries/useContractCrewCommissionDays.ts`:

```ts
/**
 * useContractCrewCommissionDays
 *
 * Raw company-laborer ("contract" type) attendance days for ONE contract, used by
 * the package/subcontract dialog to preview how a chosen commission start date
 * splits the crew's already-worked days (see splitCrewCommissionByDate).
 *
 * Reads v_daily_attendance_commission (NOT daily_attendance directly): the view
 * already joins laborers and exposes laborer_type + commission_per_day, so we avoid
 * the two-FK embed ambiguity on daily_attendance→laborers. We pull only the RAW
 * per-day columns (date, work_days_eff, daily_earnings, commission_per_day) and
 * recompute the split on the client, so the current effective_from does not bias
 * the preview. The maistry (collector) is excluded — his own days earn no commission.
 */

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { withTimeout, TIMEOUTS } from "@/lib/utils/timeout";
import type { CommissionDayRow } from "@/lib/workforce/commission";

export type ContractCrewKind = "task_work" | "subcontract";

export interface ContractCrewCommissionDays {
  rows: CommissionDayRow[];
  earliestDate: string | null;
}

export function useContractCrewCommissionDays(
  kind: ContractCrewKind | null,
  refId: string | null,
  maistryId: string | null,
  enabled = true,
) {
  const supabase = createClient();
  return useQuery<ContractCrewCommissionDays>({
    queryKey: ["contract-crew-commission-days", kind, refId, maistryId],
    enabled: Boolean(enabled && kind && refId),
    staleTime: 30_000,
    queryFn: async ({ signal }): Promise<ContractCrewCommissionDays> => {
      const col = kind === "task_work" ? "task_work_package_id" : "subcontract_id";
      let q = (supabase as any)
        .from("v_daily_attendance_commission")
        .select("date, work_days_eff, daily_earnings, commission_per_day")
        .eq(col, refId)
        .eq("laborer_type", "contract");
      if (maistryId) q = q.neq("laborer_id", maistryId);
      const { data, error } = await withTimeout(
        Promise.resolve(q.abortSignal(signal)),
        TIMEOUTS.QUERY,
        "Crew commission days query timed out. Please retry.",
      );
      if (error) throw error;
      const rows: CommissionDayRow[] = (data ?? []).map((r: any) => ({
        date: String(r.date),
        workDays: Number(r.work_days_eff ?? 1),
        dailyEarnings: Number(r.daily_earnings ?? 0),
        commissionPerDay: Number(r.commission_per_day ?? 50),
      }));
      const earliestDate = rows.reduce<string | null>(
        (min, r) => (min === null || r.date < min ? r.date : min),
        null,
      );
      return { rows, earliestDate };
    },
  });
}
```

- [ ] **Step 2: Typecheck the new file compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors referencing `useContractCrewCommissionDays.ts`. (Pre-existing errors elsewhere, if any, are unrelated.)

- [ ] **Step 3: Commit**

```bash
git add src/hooks/queries/useContractCrewCommissionDays.ts
git commit -m "feat(workforce): useContractCrewCommissionDays hook (view-based, no FK embed)"
```

---

### Task 3: Wire the honest default + warning into `TaskWorkPackageDialog`

**Files:**
- Modify: `src/components/task-work/TaskWorkPackageDialog.tsx`

**Interfaces:**
- Consumes: `useContractCrewCommissionDays` (Task 2), `splitCrewCommissionByDate` (Task 1). `Alert`, `Box`, `dayjs`, `useMemo` are already imported in this file.

- [ ] **Step 1: Add imports**

After the existing import block (near line 49, after `blurOnWheel`), add:

```ts
import { useContractCrewCommissionDays } from "@/hooks/queries/useContractCrewCommissionDays";
import { splitCrewCommissionByDate } from "@/lib/workforce/commission";
```

- [ ] **Step 2: Add a work-day formatter next to `comingSunday`**

Below `comingSunday()` (after line 135), add:

```ts
/** Today as YYYY-MM-DD (local). */
function todayISO(): string {
  return dayjs().format("YYYY-MM-DD");
}

/** Format a work-day count, dropping a trailing ".0" (2 → "2", 1.5 → "1.5"). */
function fmtWorkDays(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
```

- [ ] **Step 3: Call the hook + compute the split (inside the component)**

Just before the `selectedMaistryValue` useMemo (around line 331), add:

```tsx
  const { data: crewDays } = useContractCrewCommissionDays(
    "task_work",
    editing?.id ?? null,
    form.maistry_laborer_id,
    open && Boolean(editing?.id),
  );

  const commissionSplit = useMemo(
    () =>
      splitCrewCommissionByDate(
        crewDays?.rows ?? [],
        form.mesthri_commission_effective_from || null,
      ),
    [crewDays?.rows, form.mesthri_commission_effective_from],
  );
```

- [ ] **Step 4: Default the date to the crew's first day (not the coming Sunday)**

Replace the toggle `onChange` default (lines 495-498):

```tsx
                      mesthri_commission_effective_from:
                        on && !p.mesthri_commission_effective_from
                          ? comingSunday()
                          : p.mesthri_commission_effective_from,
```

with:

```tsx
                      mesthri_commission_effective_from:
                        on && !p.mesthri_commission_effective_from
                          ? (crewDays?.earliestDate ?? todayISO())
                          : p.mesthri_commission_effective_from,
```

- [ ] **Step 5: Default the save fallback the same way**

Replace the save fallback (lines 311-313):

```tsx
      // When enabled, a cutover date is required (default to the coming Sunday).
      mesthri_commission_effective_from: form.mesthri_commission_enabled
        ? form.mesthri_commission_effective_from || comingSunday()
        : null,
```

with:

```tsx
      // When enabled, a start date is required (default to the crew's first day so
      // all their worked days count; today if no attendance yet).
      mesthri_commission_effective_from: form.mesthri_commission_enabled
        ? form.mesthri_commission_effective_from || crewDays?.earliestDate || todayISO()
        : null,
```

- [ ] **Step 6: Replace the date field block with date + honest warning + reworded helper**

Replace the whole `{form.mesthri_commission_enabled && ( <TextField … /> )}` block (lines 517-527):

```tsx
            {form.mesthri_commission_enabled && (
              <TextField
                label="Direct-pay from (cutover)"
                type="date"
                value={form.mesthri_commission_effective_from}
                onChange={(e) => set("mesthri_commission_effective_from", e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                helperText="Days before this stay paid via the package. Use a Sunday (week start)."
                sx={{ mt: 1.5, maxWidth: 280 }}
              />
            )}
```

with:

```tsx
            {form.mesthri_commission_enabled && (
              <Box sx={{ mt: 1.5 }}>
                <TextField
                  label="Commission / direct-pay from"
                  type="date"
                  value={form.mesthri_commission_effective_from}
                  onChange={(e) => set("mesthri_commission_effective_from", e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                  helperText="Commission applies to company-laborer days on/after this date. Earlier days are not counted."
                  sx={{ maxWidth: 280 }}
                />
                {(crewDays?.rows.length ?? 0) > 0 &&
                  (commissionSplit.excludedWorkDays > 0 ? (
                    <Alert severity="warning" sx={{ mt: 1 }}>
                      {fmtWorkDays(commissionSplit.excludedWorkDays)} work-day
                      {commissionSplit.excludedWorkDays === 1 ? "" : "s"} before{" "}
                      {dayjs(form.mesthri_commission_effective_from).format("DD MMM")} won&apos;t earn
                      commission (−₹
                      {Math.round(commissionSplit.excludedCommission).toLocaleString("en-IN")} to the
                      mesthri). Pick an earlier date to include them.
                    </Alert>
                  ) : (
                    <Alert severity="success" sx={{ mt: 1 }}>
                      All {fmtWorkDays(commissionSplit.includedWorkDays)} work-day
                      {commissionSplit.includedWorkDays === 1 ? "" : "s"} so far are included.
                    </Alert>
                  ))}
              </Box>
            )}
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors in `TaskWorkPackageDialog.tsx`.

- [ ] **Step 8: Commit**

```bash
git add src/components/task-work/TaskWorkPackageDialog.tsx
git commit -m "feat(task-work): honest commission start date + excluded-days warning in package dialog"
```

---

### Task 4: Fix the `QuickCreateContractDialog` default date

**Files:**
- Modify: `src/components/trades/QuickCreateContractDialog.tsx:183-189`

**Interfaces:**
- Consumes: `dayjs` (already imported and used in this file).

- [ ] **Step 1: Replace the coming-Sunday default with today**

Replace (lines 183-189):

```tsx
        // Cutover = the coming Sunday (company week bucket) when enabled.
        mesthri_commission_effective_from: commissionOn
          ? (() => {
              const d = dayjs();
              return d.add(d.day() === 0 ? 0 : 7 - d.day(), "day").format("YYYY-MM-DD");
            })()
          : null,
```

with:

```tsx
        // Start commission from today (contract start). A brand-new contract has no
        // prior work; if days are backdated later, the edit dialog warns + lets you
        // move this date earlier.
        mesthri_commission_effective_from: commissionOn
          ? dayjs().format("YYYY-MM-DD")
          : null,
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors in `QuickCreateContractDialog.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/trades/QuickCreateContractDialog.tsx
git commit -m "fix(trades): default new-contract commission start to today, not a future Sunday"
```

---

### Task 5: Full build + verification

**Files:** none (verification only).

- [ ] **Step 1: Run the unit tests**

Run: `npx vitest run src/lib/workforce/commission.test.ts`
Expected: PASS.

- [ ] **Step 2: Stop any dev server, then production build**

> The owner's `dev:cloud` runs on :3000 and corrupts `.next` during a concurrent build. Confirm no dev server is running first.

Run: `npm run build`
Expected: build completes with no type/lint errors.

- [ ] **Step 3: Playwright visual check (only when the browser is free; optional)**

`dev:cloud` → `http://localhost:3000/dev-login` → `/site/trades` → open WaterTank → edit. Expected: "Commission / direct-pay from" shows **30 Jun** with the success alert "All 13 work-days so far are included." Move the date to **07 Jul** → warning "11 work-days before 07 Jul won't earn commission (−₹550 to the mesthri)." Move back → success. 0 console errors. **Do not save** — WaterTank is already correct on prod; saving is a no-op but avoid touching prod money.

---

## Self-Review

**Spec coverage:**
- Honest default (no future Sunday) → Task 3 Steps 4-5 (package dialog), Task 4 (subcontract create). ✓
- Excluded-days warning with N work-days / ₹ → Task 3 Step 6 + Task 1 helper. ✓
- Reworded helper text, drop "use a Sunday" → Task 3 Step 6. ✓
- New hook (view-based, excludes maistry) → Task 2. ✓
- No schema change / no math change → Global Constraints; helper only sums. ✓
- WaterTank data fix → already applied (noted, not a code task). ✓
- Unit test numbers (11/₹550 excluded, 13/₹650 total) → Task 1 Step 1. ✓

**Placeholder scan:** none — every code step shows full code, exact paths, exact commands.

**Type consistency:** `CommissionDayRow` (Task 1) is imported by Task 2 and produced by the hook; `splitCrewCommissionByDate` (Task 1) consumed in Task 3; `useContractCrewCommissionDays(kind, refId, maistryId, enabled)` signature matches its call in Task 3 Step 3; `crewDays?.earliestDate` / `crewDays?.rows` match the hook's `ContractCrewCommissionDays` shape; `commissionSplit.excluded*/included*` match `CommissionDateSplit`. ✓
