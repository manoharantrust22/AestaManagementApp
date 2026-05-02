# Multi-Trade (Subcontract) Workspaces — Design Spec

> Approved 2026-05-02. Source plan-mode file: `C:\Users\Haribabu\.claude\plans\so-now-in-the-curried-goblet.md`. Implementation plan(s) live at `docs/superpowers/plans/2026-05-02-trade-workspaces*.md`.

## Context

A current project has a painting subcontract with an external mesthri named **Asis**, who quoted a lump-sum for the whole painting scope. Plan: pay him daily expenses + bulk advances + final settlement — same flow as the existing civil-work labor settlement. Tiling, electrical, plumbing, etc. will follow with separate mesthris.

Today the salary-settlement experience is built around civil work. Other trades have nowhere to live with the same first-class treatment. The need: make every trade (civil, painting, tiling, electrical, …) a first-class workspace at the site level — its own attendance, advances, ledger, settlements — with the *same* familiar UX as today's civil flow but cleanly separated. Plus a **labor-vs-paid reconciliation** view so the engineer can tell whether a mesthri is paid ahead, paid behind, or fairly compensated relative to actual labor done.

## Current state (key finding)

The app **already has** most of the schema and one route (~1,706 LOC `/site/subcontracts`) for per-contract management. The gap is one schema dimension (`trade_category_id`), a per-role headcount mode, a per-contract role-rate card, a reconciliation view, the IA reorganization that puts you inside one trade at a time, and admin UI for managing trades.

### What exists
- `subcontracts` table with `contract_type`, `team_id`, `laborer_id`, `assigned_sections[]`, `total_value`, `is_rate_based`, `weekly_advance_rate`, `maestri_margin_per_day`, `status`.
- `subcontract_payments` ledger with `payment_type` (`weekly_advance`/`milestone`/`part_payment`/`final_settlement`), `payment_channel`, running `balance_after_payment`.
- `settlement_groups.subcontract_id` (nullable) — daily salary settlements can already attach to a contract.
- `daily_attendance.subcontract_id` + `section_id` — attendance is already contract-aware.
- `labor_categories` and `labor_roles` tables (the schema comment anticipates "Civil, Electrical, Plumbing, etc.").
- `/site/subcontracts` page — fully implemented mesthri vs specialist contract management.

### What's missing
1. No `trade` / `work_category` dimension on `subcontracts` — `scope_of_work` is free text.
2. No "trade workspace" surface — `/site/subcontracts` is a flat list, `/site/payments` reads as civil-first.
3. Civil work is implicit — most civil settlements have `subcontract_id IS NULL` (asymmetric).
4. No headcount-only attendance mode (per-role or otherwise).
5. No per-contract role-rate card.
6. No labor-vs-paid reconciliation.
7. No company-level admin UI for managing trade categories.

---

## Decisions captured

| # | Decision | Choice |
|---|----------|--------|
| 1 | **Trade model** | **Trade Workspace per trade** — each trade gets its own focused workspace (attendance, advances, settlements, ledger, photos), all scoped to that trade. |
| 2 | **Civil parity** | **Civil also becomes a workspace.** Auto-create a default *"Civil — In-house"* workspace per site; existing civil data migrates into it. Full symmetry. |
| 3 | **Labor-tracking modes** (per contract, picked at creation) | **3 selectable levels.** *Detailed* — per-laborer + in/out time. *Headcount* — daily count **per role** (e.g., "1 technical + 2 helpers"). *Mesthri-only* — no daily count, only payments. |
| 4 | **Navigation** | **New top-level `/site/trades` hub.** Cards per trade → trade workspace. `/site/attendance` and `/site/subcontracts` are absorbed (redirect into trade workspace). `/site/payments` becomes a cross-trade read-only roll-up. |
| 5 | **Reason for headcount tracking** | **Labor-vs-paid reconciliation.** Per-role rate card on each contract. Headcount × rates yields implied labor value. Banner shows paid-ahead / paid-behind / on-track. At settlement: quoted-vs-labor reveals mesthri margin so future contracts can be re-priced. |
| 6 | **Custom trades (in scope v1)** | Company admin can add / rename / archive custom trade categories (with default roles + rates) from `/company/laborers`. New trades immediately appear in the trade picker on every site. |

### Defaults
- 7 seeded categories: `civil`, `painting`, `tiling`, `electrical`, `plumbing`, `carpentry`, `other`. Stored as FK to `labor_categories`.
- `/site/payments` survives as cross-trade payments roll-up (read-only).
- Single active contract per trade per site for v1 (multi-concurrent is v2).

---

## Final Design

### 1. Conceptual model

```
Company
  └─ Site
       └─ Trade  (Civil | Painting | Tiling | Electrical | Plumbing | Carpentry | Other | <custom>)
            └─ Trade Contract  (one mesthri or specialist)
                 ├─ Attendance (mode: detailed | headcount | mesthri_only)
                 ├─ Advances & daily expenses
                 ├─ Settlements
                 ├─ Ledger (running balance)
                 └─ Photos & notes
```

A Trade Contract is just a `subcontracts` row with the new `trade_category_id` and `labor_tracking_mode` fields.

### 2. Schema changes (additive, low-risk)

```sql
-- Seed labor_categories with 7 trade categories (idempotent), seed labor_roles per trade.
-- Civil → Mason, Helper, Centering Worker (existing)
-- Painting → Technical Painter, Helper Painter
-- Tiling → Technical Tiler, Helper Tiler
-- Electrical → Technical Electrician, Wireman, Helper Electrician
-- Plumbing → Plumber, Helper Plumber
-- Carpentry → Carpenter, Helper Carpenter

-- Trade dimension on subcontracts
ALTER TABLE subcontracts
  ADD COLUMN trade_category_id uuid REFERENCES labor_categories(id),
  ADD COLUMN labor_tracking_mode text
    CHECK (labor_tracking_mode IN ('detailed','headcount','mesthri_only'))
    DEFAULT 'detailed',
  ADD COLUMN is_in_house boolean DEFAULT false;

-- Per-contract role rate card
CREATE TABLE subcontract_role_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subcontract_id uuid NOT NULL REFERENCES subcontracts(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES labor_roles(id),
  daily_rate numeric(10,2) NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (subcontract_id, role_id)
);

-- Per-day per-role headcount (used when labor_tracking_mode = 'headcount')
CREATE TABLE subcontract_headcount_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subcontract_id uuid NOT NULL REFERENCES subcontracts(id) ON DELETE CASCADE,
  attendance_date date NOT NULL,
  role_id uuid NOT NULL REFERENCES labor_roles(id),
  units numeric(4,2) NOT NULL,  -- e.g. 1.0, 1.5, 2.0
  note text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES users(id),
  UNIQUE (subcontract_id, attendance_date, role_id)
);
CREATE INDEX ON subcontract_headcount_attendance (subcontract_id, attendance_date);

-- Custom-trade lifecycle flags on labor_categories
ALTER TABLE labor_categories
  ADD COLUMN is_archived boolean DEFAULT false,
  ADD COLUMN is_system_seed boolean DEFAULT false;
-- system-seed rows can only be archived, not deleted; custom rows can be deleted if unused.

-- Reconciliation snapshot view
CREATE OR REPLACE VIEW v_subcontract_reconciliation AS
SELECT
  sc.id AS subcontract_id, sc.site_id, sc.trade_category_id,
  sc.total_value AS quoted_amount,
  COALESCE(SUM(sp.amount), 0) AS amount_paid,
  COALESCE((
    SELECT SUM(sha.units * srr.daily_rate)
      FROM subcontract_headcount_attendance sha
      JOIN subcontract_role_rates srr
        ON srr.subcontract_id = sha.subcontract_id
       AND srr.role_id = sha.role_id
     WHERE sha.subcontract_id = sc.id
  ), 0) AS implied_labor_value_headcount,
  COALESCE((
    SELECT SUM(da.units_worked * COALESCE(da.daily_rate, l.daily_rate))
      FROM daily_attendance da
      LEFT JOIN laborers l ON l.id = da.laborer_id
     WHERE da.subcontract_id = sc.id
  ), 0) AS implied_labor_value_detailed
FROM subcontracts sc
LEFT JOIN subcontract_payments sp ON sp.subcontract_id = sc.id
GROUP BY sc.id, sc.site_id, sc.trade_category_id, sc.total_value;

-- Backfill: per-site "Civil — In-house" subcontract; relink existing civil attendance + settlements.
WITH new_civil AS (
  INSERT INTO subcontracts (site_id, trade_category_id, contract_type,
                            title, is_in_house, labor_tracking_mode, status)
  SELECT s.id,
         (SELECT id FROM labor_categories WHERE name='Civil'),
         'mesthri',
         'Civil — In-house',
         true, 'detailed', 'active'
    FROM sites s
   WHERE EXISTS (
     SELECT 1 FROM daily_attendance da
      WHERE da.site_id = s.id AND da.subcontract_id IS NULL
   )
  RETURNING id, site_id
)
UPDATE daily_attendance da
   SET subcontract_id = nc.id
  FROM new_civil nc
 WHERE da.site_id = nc.site_id AND da.subcontract_id IS NULL;

UPDATE settlement_groups sg
   SET subcontract_id = nc.id
  FROM (SELECT id, site_id FROM subcontracts WHERE is_in_house) nc
 WHERE sg.site_id = nc.site_id AND sg.subcontract_id IS NULL;
```

### 3. Information architecture

| Route | Purpose | Status |
|-------|---------|--------|
| `/site/trades` | NEW hub — cards per trade with quoted/paid/labor-done/variance + active contract name. | New |
| `/site/trades/[tradeSlug]/[contractId]` | NEW Trade Workspace — tabs: Attendance · Advances & Money · Settlements · Ledger · Notes. | New |
| `/site/trades/[tradeSlug]/new` | NEW Create-contract wizard. | New |
| `/site/attendance` | Redirect to `/site/trades`. | Modified |
| `/site/subcontracts` | Redirect to `/site/trades`. | Replaced |
| `/site/payments` | Cross-trade read-only roll-up. | Modified |
| `/site/dashboard` | Add "Trade breakdown" card. | Modified |
| `/company/laborers` | Add **Trades & Roles** settings tab. | Modified |
| `/company/contracts` | Reframed as **"Trades Across Sites"** — per-trade KPI strip, risk-first variance alert banner, three view modes (Cards grouped by trade · Table with Trade + Variance columns · Site×Trade Matrix). | Modified — see §5 |

### 4. Trade Workspace internals

**Header**: trade name + mesthri/specialist name · contract status · lump-sum target · paid · balance · "Close contract".

**Reconciliation banner** (the heart of this feature, shown when mode ∈ {detailed, headcount}):
```
Quoted ₹2,50,000 · Paid ₹2,00,000 · Labor done ₹1,60,000  →  PAID AHEAD by ₹40,000  🟠
```
Drill-down: cumulative-paid line vs cumulative-labor-value line over time. At final settlement, reframes as "Quoted vs total labor value → mesthri margin".

**Tabs (conditional on labor_tracking_mode)**:

| Mode | Attendance | Reconciliation? |
|------|------------|-----------------|
| detailed | per-laborer rows, in/out time, rate (today's civil flow) | yes — uses laborer.daily_rate |
| headcount | date rows with per-role unit inputs (`[Technical: 1] [Helper: 2]`) → `subcontract_headcount_attendance` | yes — uses `subcontract_role_rates` |
| mesthri_only | tab hidden, payments+ledger only | no — banner shows quoted vs paid only |

**Role rate card** (sub-tab in contract setup): defaults from `labor_roles.default_daily_rate`, overridable per contract. Engineer can add custom roles per contract.

### 5. Company-level redesign: `/company/contracts` → "Trades Across Sites"

Today's `/company/contracts` page ("All Subcontracts Overview") is a flat cross-site contract list with no trade dimension and no variance signal. In the new model it becomes the company admin's **portfolio view** — answering "where is my money going by trade?" and "which mesthris are paid ahead of work done?" at a glance.

**Page header**
- Title: **Trades Across Sites** (was "All Subcontracts Overview").
- Subtitle: "Cross-site overview of every active and recent contract".
- Primary action: **+ New Subcontract** as a split button — clicking the dropdown lets the admin pick the trade first (Civil / Painting / Tiling / …) before choosing a site, so the create wizard pre-fills `trade_category_id` and pulls the right default role rates.

**Layer 1 — Per-trade KPI strip** (replaces the 7 generic site-aggregate KPI cards)

```
┌──Civil──────┐ ┌──Painting──┐ ┌──Tiling────┐ ┌──Electrical┐ ┌──Plumbing──┐ ┌──Carpentry─┐ ┌──Other─────┐
│ ₹12.4L     │ │ ₹2.8L      │ │ —          │ │ —          │ │ —          │ │ —          │ │ —          │
│ 8 sites    │ │ 2 sites    │ │            │ │            │ │            │ │            │ │            │
│ 11 active  │ │ 2 active   │ │ no contracts│ │ no contracts│ │ no contracts│ │ no contracts│ │ no contracts│
│ 🟢 on track │ │ 🟠 +₹40k   │ │            │ │            │ │            │ │            │ │            │
└────────────┘ └────────────┘ └────────────┘ └────────────┘ └────────────┘ └────────────┘ └────────────┘
```

One card per trade with cross-site totals. Each card carries the trade's color (left-border accent or icon tint). Empty trades stay visible but faded so coverage gaps are obvious. Numbers source from `v_subcontract_reconciliation` aggregated per `trade_category_id`. Card click filters the rest of the page to that trade.

**Layer 2 — Risk-first alert banner** (only shown when contracts need attention)

```
🟠 3 active contracts are paid ahead by more than 20% of labor done
   → Asis (Painting · Site A) · Ravi (Civil · Site B) · Kumar (Painting · Site D)   [Review]
```

This is the bird's-eye reason this page exists for the admin. Surface variance before they have to hunt. Threshold (20%) tunable in settings. Click "Review" → filtered list of just the affected contracts.

**Layer 3 — Filter rail** (replaces the All / Draft / Active / Completed / Cancelled tab row)

```
[ Trade ▾ All ]  [ Site ▾ All ]  [ Mesthri ▾ All ]   Status: All • Draft • Active • Completed • Cancelled
```

Status becomes inline chips (today's tabs); trade + site + mesthri become multi-select dropdowns. Date-range stays in the global header.

**Layer 4 — Three view modes** (toggle, top-right of the content area)

**Cards (default) — grouped by trade, collapsible**
```
▼ Civil  ·  8 contracts  ·  ₹12.4L quoted  ·  ₹9.8L paid  ·  🟢 on track
  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
  │ Site A       │ │ Site B       │ │ Site C       │
  │ In-house     │ │ In-house     │ │ Ravi Mesthri │
  │ ₹2.5L paid   │ │ ₹1.8L paid   │ │ ₹3.0L paid   │
  │ of ₹2.5L     │ │ of ₹2.5L     │ │ of ₹3.5L     │
  │ 🟢 on track  │ │ 🟢 on track  │ │ 🟠 +₹0.4L    │
  └──────────────┘ └──────────────┘ └──────────────┘

▼ Painting  ·  2 contracts  ·  ₹2.8L quoted  ·  ₹1.6L paid  ·  🟠 paid ahead
  …

▶ Tiling     (no contracts)
▶ Electrical (no contracts)
```
Card click → opens that contract's per-site Trade Workspace.

**Table — same flat shape as today + three new columns**

| Trade | Title | Site | Type | Mesthri | Quoted | Paid | **Variance** | Status | Actions |

`Trade` is a colored chip (first column after a checkbox). `Variance` is the reconciliation delta with the traffic-light icon (sortable — admin can sort by "most paid-ahead" instantly to surface risk). Default sort: by trade then variance descending.

**Matrix — sites × trades cross-tab (the new admin power-tool)**
```
                Civil      Painting   Tiling   Electrical   Plumbing   Carpentry
Site A          🟢 ₹2.5L   🟠 ₹1.0L   —        —            —          —
Site B          🟢 ₹1.8L   —          —        —            —          —
Site C          🟠 ₹3.0L   —          —        🟢 ₹0.5L     —          —
Site D          —          🔴 ₹0.6L   —        —            —          —
…
TOTAL           ₹12.4L     ₹2.8L      —        ₹0.5L        —          —
```
Empty cells stay light-gray so coverage gaps stand out. Cell click → filtered Cards view for that site×trade. Powerful for "what's the painting picture across all sites?" and "which sites have nothing happening?".

**Data dependencies**
- New hook: `useCompanyTrades(filters)` — returns `Trade[]` aggregated across all sites the user can access. Reuses `groupContractsByTrade` from Plan 02 but feeds it cross-site data and pulls reconciliation numbers from `v_subcontract_reconciliation`.
- New hook: `useTradeVarianceAlerts(thresholdPct)` — returns the list of contracts paid-ahead by more than `thresholdPct` (default 20). Drives the alert banner.

**Phasing** — built in **Plan 05** alongside the `/site/payments` cross-trade roll-up; both share the same data layer. The matrix view is a deliberate scope addition over today's flat table — call it out in the Plan 05 PR description.

### 6. Out of scope
- Multiple concurrent contracts per trade per site (v2).
- Specialist laborer trade switching (a company laborer working civil Mon, painting Tue).
- Mesthri performance scorecard over time (avg margin per trade, on-time rate). Future analytics.
- Per-mesthri-payable rollup outside the per-contract context. Future report.

### 7. Files & components — see implementation plan.
