# Salary Payments — Waterfall Revival + Subcontract Context — Design Spec

- **Date:** 2026-04-26
- **Scope:** Redesign `/site/payments` to revive the waterfall payment model + 5-KPI salary slice hero (deleted in commit `11a2ce9`), anchor the page to its parent subcontract from `/site/subcontracts`, refresh terminology, and split the unified ledger into three purpose-built tabs (Salary Waterfall / Advances / Daily+Market). Compact and mobile-first throughout.
- **Builds on:** `docs/superpowers/specs/2026-04-26-salary-settlement-ux-redesign-design.md` — keeps that spec's pending warning band, `PageHeader` + `ScopeChip`, Fullscreen toggle, single-scroll layout, and InspectPane mount. Reverts that spec's flat unified `PaymentsLedger` for the salary slice while keeping the honest-table version for Daily+Market.
- **Out of scope:**
  - Subcontract burn-down across non-salary categories (materials, equipment, etc.) — that lives on `/site/subcontracts` and is only *linked to*, not duplicated, here.
  - Per-laborer ledger / "verify mestri's distribution to his crew" — the user explicitly stated no such data exists; the mestri owns it.
  - Editing the existing `DailySettlementDialog` / `WeeklySettlementDialog` / advance-settlement dialogs — they're reused as-is.
  - Native mobile app (this is responsive web).

---

## 1. Problem statement

Three layered problems with the page that shipped in commit `11a2ce9`:

1. **Project-manager jobs-to-be-done are no longer answerable on this page.**
   The PM's primary question is *"Am I on track against the salary slice of the subcontract?"* — i.e. has the mestri been paid roughly what he's earned, or am I underpaying / overpaying him over time? The current page surfaces individual settlement events but provides no per-week reconciliation, no "wages due" total against "paid" total, and no excess/shortfall view. The previous design answered this via the 5-KPI `ContractSummaryDashboardV2` and per-week waterfall in `ContractWeeklyPaymentsTab` — both deleted in `11a2ce9`.

2. **The unified ledger collapses three genuinely different surfaces into one row stream.**
   Salary settlements (waterfall-allocated against per-week earned wages), emergency advances (parallel cash, never deducted from salary math), and daily+market wages (per-date attendance settlement) share one table with the same column shape. The result, on the current production page, is six rows for week 20–26 Apr that all show "Settlement / Weekly / Settlement" with no laborer or context — because the SQL falls through to a `'Settlement'` COALESCE fallback when a settlement_group has no `labor_payments` link (as is the case for advance/excess settlements bucketed under "Weekly"). The `for_label` column is structurally incapable of telling these apart.

3. **The page chip is decorative, not load-bearing.**
   "Footing Horizontal Foundation · Foundation" is shown at the top of the screenshot but doesn't link anywhere, doesn't show the subcontract's lump-sum value, and doesn't tell the PM what fraction of *all* expenses (salary + materials + …) the salary slice represents. The subcontract is the natural anchor for everything on this page, but the UI doesn't treat it that way.

A fourth problem, downstream of (2): the InspectPane Attendance tab shows ₹0 for every "weekly" settlement_group whose `laborer_id` is null (i.e., advance/excess), because the Weekly InspectPane shape is keyed on `(laborer × week)`. That bug is fixed *for free* by Approach 4 splitting the surfaces, since advance rows are no longer rendered through the weekly InspectPane.

## 2. Solution overview — Approach 4 (Combined)

A single page composed of five vertically-stacked regions, each compact and mobile-responsive:

1. **Subcontract context strip** — anchors the page to the parent subcontract; shows lump-sum + all-categories spend; deep-links to `/site/subcontracts` for the cross-category burn-down.
2. **Salary slice hero** — 5 KPIs (Wages Due / Paid / Advances / Total Cash Out / Mestri Owed-or-Excess) + progress bar. Revives `ContractSummaryDashboardV2` with new terminology and a denser layout.
3. **Pending warning band** — kept from the current page (the one piece that works); wires to the existing settle-from-attendance flow.
4. **Three-tab surface** — `Salary Waterfall · Advances · Daily+Market`. Each tab is purpose-built; no mode-blending compromises.
5. **InspectPane** — kept; rendering branches by row type so the ₹0 Attendance bug disappears.

The waterfall logic, the 5-KPI math, and the advance-vs-salary discrimination are **revived from git** (commits `459a2c7` and `11a2ce9^`), not reinvented. Only the terminology, the subcontract anchoring, the pending-warning-band integration, and the responsive/compact layout are new.

## 3. Domain model — what we're modelling

### 3.1 Subcontract → mestri → salary slice

A **subcontract** is a lump-sum agreement between the company and a **mestri** (labor manager) for a specific scope on a building (e.g., "Footing Horizontal Foundation"). Schema: `subcontracts(id, site_id, title, total_value, status, …)`, joined to a `laborers` row (the mestri).

Many expense categories burn the subcontract budget — daily salary, weekly contract settlements, advances, materials, etc. **This page covers only the salary slice.** All other categories live on `/site/subcontracts`.

**Salary slice** comprises three streams:

- **Daily salary** + **market wages** — non-contract laborers paid per attendance day. Already settled per-date via existing flows.
- **Weekly contract settlements** — payments to the mestri against the running balance of his crew's earned wages. *Subject to the waterfall.*
- **Advances** — emergency money to the mestri. *NOT subject to the waterfall* — does not reduce wages-due math.

### 3.2 The waterfall mechanic

For the **weekly contract settlement** stream only:

- Each week, the mestri's crew works some attendance × rate days → generates a **wages-due** amount for that week.
- Settlements arrive as a stream over time (could be one per week, multiple per week, sometimes spanning weeks). They are sorted oldest-first by `settlement_date`.
- Each settlement's amount waterfall-allocates: it fills the oldest unfilled week first, with the *minimum of (remaining settlement, this week's remaining due)*; overflow walks to the next week. Continues until the settlement amount is exhausted or all known weeks are filled.
- **Per-week status** (the only states that can appear on a week row, since the algorithm never allocates past `wages_due`):
  - `paid == due` → **Settled** ✓
  - `0 < paid < due` → **Underpaid** by `(due − paid)` ⚠
  - `paid == 0` → **Pending** —
- **Aggregate-level excess** (NOT a per-week state) appears when the *total* of all settlements exceeds the *total* of all wages due across known weeks. The leftover is "future credit" — the mestri has been paid for work he hasn't yet performed. Surfaced in the hero KPI #5 as **Excess Paid** and as a synthetic trailing row in the waterfall list: *"🟦 Future credit · ₹X paid in advance · will absorb future weeks"*.

Settlement ordering on the same `settlement_date`: tiebreak by `settlement_groups.id` ASC for determinism.

The waterfall preserves **transaction provenance**: each week tracks which settlement refs filled it. A user can see "Week 6–12 Apr filled by SET-260408 ₹40,000 + SET-260411 ₹12,000."

The exact algorithm is preserved in `git show 459a2c7 -- src/components/payments/ContractWeeklyPaymentsTab.tsx`. We will reuse it verbatim, extracted to a server-side RPC (see §6).

### 3.3 What we do NOT model

- Per-laborer-within-mestri-crew distribution. The mestri keeps that ledger. We see only payments going *to* the mestri.
- Sub-pieces of the subcontract (e.g., "first half of the foundation"). The whole subcontract is one unit.

## 4. Information architecture

### 4.1 Region 1 — Subcontract context strip

Single row, ~44–52px tall on desktop, wraps to 2 lines on mobile:

```
📍 Footing Horizontal Foundation  │  Subcontract ₹4,00,000  │  Spent ₹2,77,950 (69%)  │  ↗ Full burn-down
```

- Pin icon + subcontract title (bold).
- Lump-sum from `subcontracts.total_value`.
- Spent-all-categories computed from `useSubcontractPaymentBreakdown` (existing) for the active scope.
- Progress percentage colored neutral until ≥90%, then warning, then error.
- The deep-link sends user to `/site/subcontracts?focus=<subcontract_id>` — leverages the existing detail surface there.

**If the user has not selected a subcontract** (`/site/payments` without the chip set), the strip collapses to:

```
📍 All subcontracts on this site  │  ↗ Choose a subcontract to see budget context
```

…and the hero in §4.2 still shows totals, but the "Mestri Owed" math is suppressed (it has no clear owner). This degrades gracefully — the page is still useful at the all-subcontracts scope.

### 4.2 Region 2 — Salary slice hero (5 KPIs + progress)

Five KPIs in a CSS grid. Desktop ≥1024px: `grid-template-columns: repeat(5, 1fr)`. Tablet 768–1023px: `repeat(3, 1fr)` with the 4th and 5th wrapping below. Mobile <768px: `repeat(2, 1fr)` with the 5th (status) full-width below.

| # | Label                  | Value                              | Color band   | Sub-line                          |
|---|------------------------|------------------------------------|--------------|-----------------------------------|
| 1 | **Wages Due**          | ₹ sum of earned across weeks       | neutral      | "based on attendance · N weeks"   |
| 2 | **Paid (waterfall)**   | ₹ sum allocated across weeks       | success      | "N settlements"                   |
| 3 | **Advances**           | ₹ sum of separate advance bucket   | warning      | "N records · separate"            |
| 4 | **Total Cash Out**     | Paid + Advances                    | info (blue)  | "paid + advances"                 |
| 5 | **Mestri Owed** *or* **Settled** *or* **Excess Paid** (sign-aware) | `Wages Due − Paid` (signed) | error / success / info | "due based on work done" / "fully paid" / "rolls forward" |

A horizontal progress bar below the grid: `Paid ÷ WagesDue × 100%`. Colors: <50% red, 50–80% amber, ≥80% green (matches old `getProgressColor`).

KPI formula sub-lines are intentionally tiny (`9.5px`, secondary color) — present for the user who wants to learn the math, invisible noise for the user who just reads numbers.

**Compactness targets:**
- KPI card height: 72–80px desktop, 64–72px mobile.
- Hero region total height: ~150px desktop, ~280px mobile (5 cards stacked + progress bar).

### 4.3 Region 3 — Pending warning band

Unchanged from the current production page. Surfaces unsettled attendance dates with a primary CTA that opens the existing `DailySettlementDialog` (or routes to `/site/attendance` if more than one date). Not modified by this redesign.

### 4.4 Region 4 — Three tabs

A standard `Tabs` strip below the warning band. Tabs in left-to-right order:

| Tab                | Badge (count)                       | Default? |
|--------------------|-------------------------------------|----------|
| 💼 Salary Waterfall | weeks count                         | **yes**  |
| 💸 Advances         | record count                        | no       |
| 📅 Daily + Market  | warning-coloured *pending* count    | no       |

Mobile (<768px): tabs render as icon-only with the count badge; tap reveals a tooltip-style label briefly. This keeps the strip from wrapping or scrolling.

#### 4.4.1 Salary Waterfall tab

A vertical list, one row per week, oldest-first. Each row:

```
[Week 20–26 Apr · 6 days · 4 lab.]   [Wages due ₹52,400]   [Paid ₹38,200]   [progress-mini]   [⚠ Underpaid 27%]
   ↳ Filled by SET-260423 ₹38,200 · ₹14,200 still owed   [+ Add settlement to fill ▶]
```

- Status chip variants on a real week row: **✓ Settled** (green) / **⚠ Underpaid N%** (amber) / **— Pending** (grey). Aggregate excess is a separate synthetic row at the end of the list, not a per-week state.
- Sub-line "Filled by" lists the settlement refs and individual amounts that allocated to this week. Each ref is clickable → opens the InspectPane scoped to that single settlement.
- Underpaid weeks expose an inline `[+ Add settlement to fill ▶]` CTA. The CTA's onClick **must call `e.stopPropagation()`** so the row's own click handler doesn't also fire. CTA opens the existing `WeeklySettlementDialog` prefilled to fill the gap.
- Click anywhere on the row body (outside the CTA and outside ref chips) → InspectPane opens in **week-aggregate** mode (see §5).
- **Future credit row** (only when aggregate excess > 0) renders at the bottom of the list as a non-interactive synthetic row: blue tint, "🟦 Future credit · ₹X paid in advance · will absorb future weeks." This is computed from `Sum(Paid) − Sum(Wages Due)`, surfaced at this position to give the user a visual home for the excess that lives outside any specific week.

**Mobile layout per row:** Two lines instead of one. Line 1: week label + status chip (right). Line 2: due / paid / progress mini-bar. Sub-line ("Filled by") collapses to "N transactions · tap for detail" and expands on tap.

**Compactness targets:**
- Desktop row height: ~56px collapsed (without sub-line) / ~76px with sub-line.
- Mobile row height: ~80px (two-line) / ~104px with sub-line.

#### 4.4.2 Advances tab

A list of advance records (separate from the waterfall):

```
SET-260403   Krishnan · 3 Apr · medical advance         ₹15,000
SET-260411   Murugan · 11 Apr · personal                ₹12,000
…
─────────────────────────────────────────────────────────
Total · NOT deducted from salary above                  ₹43,400
```

- Each row: ref-mini chip · description (mestri name + date + reason) · amount.
- Footer row makes the relationship to the hero math explicit: this total is in the "Advances" KPI (#3) and the "Total Cash Out" KPI (#4), but **not** subtracted from "Mestri Owed" (#5).
- Click a row → InspectPane in **advance** mode (see §5.2).

**Mobile:** ref + amount on one line, description below.

#### 4.4.3 Daily + Market tab

The honest-table fix from Approach 2 of brainstorming, narrowed to non-contract rows:

- Pending separator at the top (one collapsible group of pending dates with their own warning treatment).
- One week-separator row per ISO week. Click separator → expand/collapse the rows. Click "Open week" → InspectPane in **week-aggregate (daily-market shape)** mode.
- Per-row columns: Ref · Type chip (always "Daily+Mkt" green here) · Date · For label (existing "N lab + M mkt" format) · Amount.

This tab is the *only* tab that uses `get_payments_ledger` as it stands today, with a `p_type='daily-market'` filter.

**Mobile:** Reduce to four columns (drop "Type" since it's always Daily+Mkt in this tab). Date and For wrap onto two lines.

### 4.5 Region 5 — InspectPane (mounted globally on the page)

Three entity shapes, branching on row type:

1. **`weekly-aggregate`** (NEW) — opened by clicking a Salary Waterfall row or "Open week" on a Daily+Mkt week separator. Tabs: Attendance (per-day strip across that week × all laborers) / Work Updates (already works for ranges) / Settlements (the refs that touched this week) / Audit.
2. **`daily-date`** (existing) — opened by clicking a Daily+Mkt row.
3. **`advance`** (NEW) — opened by clicking an Advance row. Tabs: Detail (mestri, date, reason, amount) / Audit. Attendance + Work Updates tabs are intentionally absent — an advance has no attendance link, and rendering empty placeholders was the source of the ₹0 bug.

The current `useInspectPane` hook supports this with one new entity-kind discriminator (`weekly-aggregate`) and one new (`advance`). The shell is unchanged.

## 5. Components to build, revive, and modify

| Component | Action | Source |
|---|---|---|
| `SubcontractContextStrip` (new) | New compact component, ~30 lines. Uses `useSiteSubcontracts` + a new `useSubcontractSpend` hook that aggregates across all categories. | Net-new |
| `SalarySliceHero` (new) | Replaces the current 4-KPI strip in `payments-content.tsx`. 5 KPIs + progress bar, responsive grid. | Adapts `ContractSummaryDashboardV2` (recoverable via `git show 11a2ce9^:src/components/payments/ContractSummaryDashboardV2.tsx`). New terminology, denser layout, mobile breakpoints. |
| `SalaryWaterfallList` (new) | Per-week vertical list with waterfall status chips and "Filled by" sub-line. | Adapts the rendering inside the deleted `ContractWeeklyPaymentsTab`. Uses the new `get_salary_waterfall` RPC (§6). |
| `AdvancesList` (new) | Simple list of advance records with footer-total. | Net-new but the data is already in `settlement_groups` — see §6.2 for classification. |
| `DailyMarketLedger` (rename of current `PaymentsLedger`) | The current unified ledger, narrowed to `p_type='daily-market'`, with week-separator grouping rows added. | Modifies existing `src/components/payments/PaymentsLedger.tsx`. |
| `payments-content.tsx` | Restructured to compose the five regions above. | Modifies existing. |
| `useInspectPane` | Adds `weekly-aggregate` and `advance` entity kinds. | Modifies existing. |
| `AttendanceTab` (in InspectPane) | Adds a "weekly-aggregate" branch that aggregates across all laborers for the week. Today it has only `DailyShape` and `WeeklyShape` (per-laborer). | Modifies existing. |

## 6. Data layer

### 6.1 `get_salary_waterfall` RPC — new

```
get_salary_waterfall(
  p_site_id          uuid,
  p_subcontract_id   uuid,    -- nullable; if null, aggregates across the site
  p_date_from        date,
  p_date_to          date
)
RETURNS TABLE (
  week_start         date,
  week_end           date,
  days_worked        int,
  laborer_count      int,
  wages_due          numeric,
  paid               numeric,           -- always ≤ wages_due (algorithm invariant)
  status             text,              -- 'settled' | 'underpaid' | 'pending'
  filled_by          jsonb              -- [{ ref: 'SET-xxx', amount: 38200, settled_at: '...'}]
)
```

Algorithm (lifted verbatim from `git show 459a2c7`):

1. For each ISO week in `[date_from, date_to]`, compute `wages_due` = sum over contract laborers of (attendance days × per-day rate). Filter to laborers attached to `p_subcontract_id` if set.
2. Order weeks by `week_start` ascending.
3. Order all `settlement_groups` (non-cancelled, no daily/market attendance link) for that subcontract by `settlement_date` ascending.
4. Walk settlements in order; for each settlement, walk weeks in order; allocate `min(remaining, week_due)` to that week; update `remaining`, `week_due`. Record allocation in `filled_by`. Move to next week. Continue with next settlement.
5. After allocation, derive each week's `status`: `'settled'` if `paid == wages_due` and both > 0; `'underpaid'` if `0 < paid < wages_due`; `'pending'` if `paid == 0`. By construction `paid > wages_due` is impossible at the per-week level — overflow is captured as aggregate `future_credit` in §6.1.1, not per-week excess.

Tiebreak rule for settlements with identical `settlement_date`: order by `id` ASC, so allocation is deterministic across runs.

**Cap:** 200 weeks (≈4 years). `LIMIT 200`.

**Performance budget:** ≤300ms for a typical site (12-month range, 50 weeks, 200 settlement_groups). The current RPCs in this code-path target similar budgets.

**Note:** This RPC's per-week `paid` is invariant-capped at `wages_due`. To compute hero totals (especially the aggregate "Future credit / Excess Paid"), the page calls a companion RPC `get_salary_slice_summary` (§6.1.1) which returns the unallocated settlement total directly.

### 6.1.1 `get_salary_slice_summary` RPC — new (companion)

```
get_salary_slice_summary(
  p_site_id          uuid,
  p_subcontract_id   uuid,
  p_date_from        date,
  p_date_to          date
)
RETURNS TABLE (
  wages_due          numeric,
  settlements_total  numeric,    -- raw sum of contract-settlement amounts in scope
  advances_total     numeric,    -- raw sum of advance amounts in scope
  paid_to_weeks      numeric,    -- = LEAST(wages_due, settlements_total) effectively
  future_credit      numeric,    -- = GREATEST(0, settlements_total - wages_due)
  mestri_owed        numeric,    -- = GREATEST(0, wages_due - settlements_total)
  weeks_count        int,
  settlement_count   int,
  advance_count      int
)
```

Single-row result. Powers the 5-KPI hero directly. Computed independently of the per-week waterfall so the hero loads quickly even before the full waterfall list is fetched.

### 6.2 `get_payments_ledger` extension — modify

Add a fifth output column: `subtype text`. Values: `'salary-waterfall'` | `'advance'` | `'daily-market'` | `'adjustment'`. Classification rules:

- `daily-market` → as today, settlement_groups with attendance link (or pending dates).
- `salary-waterfall` → settlement_groups with `labor_payments.is_under_contract=true` (existing flag).
- `advance` → settlement_groups with `labor_payments.is_under_contract=false` AND `labor_payments.is_advance=true` (or whatever the existing discriminator is; settlement_type is unreliable per the prior spec's tracked follow-up).
- `adjustment` → excess returns and similar (existing `excess_paid` flag if present).

The `for_label` "Settlement" COALESCE fallback is removed. If a row's classification is ambiguous, it surfaces as `subtype='unclassified'` with a clear label so we can fix the data, not hide it.

**Scope guard:** This is the *minimum* SQL change required to make Approach 4 work. A larger refactor of `get_payments_ledger` is not in this spec.

### 6.3 `useSubcontractSpend` hook — new

Wraps an existing service (`SubcontractPaymentBreakdown.tsx` already aggregates across categories — we'll extract its query into a hook). Returns `{ spent: number, percentOfTotal: number }` for a given subcontract.

If extracting from that component is non-trivial, a fallback is to query:
- `settlement_groups.total_amount` summed for that subcontract
- plus material POs / equipment rentals / etc. summed by subcontract link

The existing service is the right starting point; spec-time discovery for the next step (writing-plans) will resolve.

### 6.4 What we're NOT changing in the data layer

- Settlement creation flows (`processSettlement`, `processWeeklySettlement`).
- The `settlement_groups` table itself.
- The InspectPane's per-day attendance RPC (`get_attendance_for_date`) and per-laborer-week RPC (`get_laborer_week_breakdown`).

## 7. Compact + mobile-first design notes

These are global rules, not tab-specific:

1. **Single-scroll page.** No nested scroll containers. Hero, warning, tabs, and tab body all scroll as one document. Matches the attendance pattern.
2. **Mobile breakpoints:** `xs` (<600px), `sm` (600–899px), `md` (≥900px). MUI default. Test against 360px width as the small-target.
3. **Touch targets:** Minimum 44×44px for any tappable thing. Status chips on waterfall rows are decorative-only; the whole row is the touch target.
4. **Number formatting:** Indian grouping (₹2,34,400 not ₹234,400). Use the existing `formatINR` utility if present, otherwise `(n).toLocaleString('en-IN')`.
5. **Sticky regions on scroll:**
   - Subcontract context strip: NOT sticky (it's reference, not action).
   - Pending warning band: sticky on mobile only (the action it triggers is high-frequency and otherwise easy to scroll past).
   - Tab strip: sticky on all viewports — the user always wants to know which tab they're in.
6. **Dark mode:** Inherit from MUI theme. All custom colors use theme palette tokens, not hex.
7. **Skeleton loading:** Each region loads independently. Hero skeleton is 5 grey rects. Waterfall skeleton is 4 grey row stubs. Tabs render after the active tab's data resolves.
8. **Empty states:**
   - No subcontract selected → §4.1 fallback strip.
   - No weekly attendance in date range → "No contract laborer attendance recorded for this period."
   - No advances → "No outside-waterfall advances in this period."
   - No daily/market → existing empty state.
9. **Error states:** Each region has its own `<Alert severity="error">`. One region failing does not blank the page.

## 8. Phased rollout

| Phase | Description | Done when |
|---|---|---|
| **0 — Data foundation** | Build `get_salary_waterfall` RPC. Extend `get_payments_ledger` with `subtype` column and remove the `'Settlement'` COALESCE fallback. Build `useSubcontractSpend` hook. | RPCs deployed locally; smoke tests pass on Srinivasan House & Shop reference site (12-week coverage; matches sums from old `ContractWeeklyPaymentsTab` against same period). |
| **1 — Hero + waterfall** | Build `SalarySliceHero` and `SalaryWaterfallList`. Wire to the Phase 0 RPC. Replace the current 4-KPI strip on `/site/payments`. Salary Waterfall becomes the default tab. | Visual review against the mockup. Underpaid/Settled/Excess all render correctly on real data. |
| **2 — Advances + Daily+Market tabs** | Build `AdvancesList`. Modify `PaymentsLedger` → `DailyMarketLedger` with week-separator rows. Wire the three-tab strip. | All three tabs render. Old unified ledger no longer rendered. |
| **3 — Subcontract anchor** | Build `SubcontractContextStrip`. Mount above the hero. Wire the `↗ Full burn-down` link to `/site/subcontracts?focus=<id>`. | Strip renders for selected and all-subcontracts scopes. Deep-link navigates correctly. |
| **4 — InspectPane shapes** | Add `weekly-aggregate` and `advance` entity kinds. Add the corresponding `AttendanceTab` branches. | Clicking any row in any tab opens the right pane shape. ₹0 Attendance bug verified gone for advance rows. |
| **5 — Polish** | Compact tuning. Mobile QA on real devices (360px / 414px / iPad). Sticky region behavior. Empty/error/skeleton coverage. | UI review on three viewports. No layout shift on data load. |

Each phase is independently shippable behind a feature flag (`enableWaterfallV2`) if rollback risk warrants. The user's preference is fast forward — flag-free unless we discover a reason during Phase 0.

## 9. Risk register

| Risk | Mitigation |
|---|---|
| `get_salary_waterfall` performance on long histories | Cap at 200 weeks; window the query with `p_date_from`. The user's existing scope-chip date filter clamps this naturally. |
| `is_under_contract` / `is_advance` flags on `labor_payments` may not be reliable for historical rows | Phase 0 includes a one-time backfill audit. If discrepancies > 5%, escalate before Phase 2. |
| Subcontract spend aggregation across categories may drift from `/site/subcontracts` | Use the *same* underlying service; never duplicate. |
| Mestri (subcontract.laborer_id) missing for legacy subcontracts | Strip degrades to "Unknown mestri"; doesn't block the page. |
| Mobile layout shift from progressive data load | Reserve hero card heights with skeletons matching final size. |
| Excess rolling forward into a future week creates display ambiguity if that future week is also rendered | Render the excess sub-line on the *paying* week only; the receiving week shows it as part of its `paid` total without re-attribution. Mockup demonstrates this; Phase 1 visual QA confirms. |

## 10. Tracked open questions (to resolve during writing-plans, not now)

- Is there a single `useSubcontractPaymentBreakdown`-style aggregation already production-ready that gives "spent across all categories for a subcontract"? Or do we need to compose it from primitives?
- Does `labor_payments.is_under_contract` cover *all* salary-waterfall settlements historically, or do some pre-flag rows need backfill?
- Should the "Mestri Owed" KPI be hidden when no subcontract is selected, or shown as a site-aggregate? (Spec currently says hidden — confirm during Phase 1.)
- Mobile sticky tab behavior: does the existing `PageHeader` already manage scroll-position offsets, or do we need to add `top: var(--page-header-height)` manually?

## 11. Acceptance criteria

The redesign is acceptable when:

1. Opening `/site/payments` with a subcontract selected shows: subcontract strip → 5-KPI hero → warning band → three tabs with Salary Waterfall as default.
2. Hero KPIs match the values returned by `get_salary_slice_summary`. Numbers reconcile against the deleted `ContractSummaryDashboardV2`'s output for any historical week.
3. Each waterfall row's `paid` sums to its `filled_by` array's amounts. `paid` never exceeds `wages_due` on any row. Status chip is one of {Settled, Underpaid, Pending} — never per-week Excess.
4. When aggregate `future_credit > 0`, a synthetic "Future credit · ₹X" row appears at the end of the waterfall list and the hero KPI #5 reads "Excess Paid ₹X" in info-blue. When `mestri_owed > 0`, KPI #5 reads "Mestri Owed ₹X" in error-red. When both are zero, KPI #5 reads "Settled" in success-green.
5. The pending warning band still surfaces unsettled attendance dates; the existing settle-from-attendance flow opens unchanged.
6. Three viewports tested (desktop ≥1280px, tablet 768px, mobile 360px). Hero, waterfall, advances, daily+market all readable on each.
7. ₹0 Attendance bug from the current page is gone for advance rows (they no longer route through the per-laborer InspectPane shape).
8. No regressions to `/site/expenses` (which mounts the same InspectPane).

---

*Spec author note: the design was iterated through five rounds in the brainstorming session that preceded this document. Three approaches (Journal, Honest Table, View Toggle) were considered and rejected once the subcontract / mestri / waterfall domain context emerged from the user. Approach 4 — revival of the deleted waterfall plus subcontract anchoring plus terminology refresh — won. The mockup is preserved at `.superpowers/brainstorm/2007-1777217120/content/combined-final.html`.*
