# Handoff: All Site Expenses — Redesign

A redesign of the **All Site Expenses** screen in the Aesta construction-management app. The screen shows total spend on a site, how it splits across kinds and trades, and a full searchable/filterable table of every expense record. Includes desktop and mobile.

---

## 1 · About the design files

The files in `reference/` are **design references created in HTML/React** (loaded as `<script type="text/babel">` with Babel-in-the-browser). They are **prototypes showing intended look and behavior** — *not production code to copy directly*.

Your task is to **recreate this design inside the existing Aesta codebase**, using whatever framework, component library, and styling system it already uses (React + Tailwind, Vue, etc.). The HTML reference is the source of truth for **visual design, IA, copy, and interaction**; your codebase is the source of truth for **how to build it**.

If no environment exists yet for this screen, pick the framework that matches the rest of the app and follow that.

To inspect the design locally, open `reference/All Site Expenses.html` in a browser. The page renders a **pan/zoom canvas** with multiple artboards (desktop, mobile, three trade-strip variants). Click the expand icon on any artboard to open it fullscreen and interact with the filters/sort/search in the table.

---

## 2 · Fidelity

**High-fidelity.** Final colors, type, spacing, copy, and interaction are all decided. Recreate pixel-close, but use your codebase's primitives where they exist (Button, Card, Badge, Input, Select, Table) — don't reimplement them. Match the tokens in section 9.

---

## 3 · Problem this solves

The previous screen had three problems:
1. **No project-health signal.** It showed *what was spent* but not *how the site is doing* — no link to contract value, collected amount, budget, progress, or burn.
2. **Three overlapping breakdowns.** A Labor/Building bar at the top, a set of category cards, and a row of 9 horizontally-scrolling Trade cards — most of which were empty. The same money was visually accounted for in two or three places.
3. **The expenses table was buried at the bottom** and reduced to a thin accordion. Users primarily come to this page to *find a specific expense* — that surface should be primary.

The redesign reorganizes around two ideas:
- **Every expense has two tags: a Kind and a Trade.** Kind = *what was bought* (Labor / Material / Machinery / Misc). Trade = *which work area it served* (Civil / Painting / Plumbing…). Kind is the primary breakdown (matches the data model). Trade is a filter/lens.
- **The table is the primary surface.** Everything above it is summary; the table is the working area.

---

## 4 · Screen inventory

| ID | Name | Viewport | File | Purpose |
|---|---|---|---|---|
| `desktop` | All Site Expenses — Desktop | 1440 × tall | `reference/desktop.jsx` | Full screen on desktop |
| `mobile` | All Site Expenses — Mobile | 390 × tall | `reference/mobile.jsx` | On-site phone use |
| `trade-detailed` | Trade strip · Detailed cards variant | 920 × 360 | `reference/trades.jsx` → `TradeDetailed` | Default desktop trade browser |
| `trade-compact` | Trade strip · Compact rows variant | 920 × 420 | `reference/trades.jsx` → `TradeCompact` | Alt density |
| `trade-chips` | Trade strip · Chips variant | 920 × 220 | `reference/trades.jsx` → `TradeChips` | Tightest density / mobile default |

The three trade-strip variants are **interchangeable presentations of the same data**. Ship one (recommended: detailed on desktop, chips on mobile). The others are there so the team can pick.

---

## 5 · Page structure (desktop, top → bottom)

```
┌─────────────────────────────────────────────────────────────────────┐
│ App chrome: Sidebar (existing) · TopBar (existing site selector)    │
├─────────────────────────────────────────────────────────────────────┤
│  ◀ All Site Expenses  [All time]               [Import] [+ Add]     │
│  Track everything spent on Srinivasan House & Shop.                 │
│  Linked to Contracts & Payments ↗                                   │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────┬──────────┬──────────┬──────────┐                      │
│  │ Total    │ Cash     │ Budget   │ Burn /   │   ← HERO KPIs (4)    │
│  │ spent    │ position │ vs       │ week     │                      │
│  │          │          │ progress │          │                      │
│  └──────────┴──────────┴──────────┴──────────┘                      │
├─────────────────────────────────────────────────────────────────────┤
│  WHERE THE MONEY WENT                          [Subcontracts][Rpt]  │
│  ₹9,30,726     312 records · 2 kinds                                │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░    ← Single stacked bar         │
│  ● Daily wages ₹1.69L 18%  ● Contract ₹3.54L 38%  …                 │
├─────────────────────────────────────────────────────────────────────┤
│  BY TRADE                                          1 of 9 active    │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐        │
│  │ │ CIVIL    │ │ │ CARPENTRY│ │ │ PAINTING │ │ │ PLUMBING │ ...    │
│  │ │ ₹6.42L   │ │ │ + no expe│ │ │ + no expe│ │ │ + no expe│        │
│  │ │ 284 rec  │ │ │ nses yet │ │ │ nses yet │ │ │ nses yet │        │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘        │
├─────────────────────────────────────────────────────────────────────┤
│  ALL EXPENSES                                                       │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ [Search…]  [All|Labor|Building]  [Trades▾][Sub▾][Status▾]   │    │
│  │ 24 records · Clear         Group by: [None|Trade|Kind|Date|V]│    │
│  ├─────────────────────────────────────────────────────────────┤    │
│  │ DATE  REF    VENDOR / DESC  TRADE   KIND     STATUS  AMOUNT │    │
│  │ 12May EX-2841 R. Murugan… ● Civil  ● Contract Paid  ₹48,500 │    │
│  │ …                                                            │    │
│  ├─────────────────────────────────────────────────────────────┤    │
│  │ Labor ₹6.24L   Building ₹3.06L         FILTERED TOTAL ₹9.31L│    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### Section spacing
- Page content: max-width fluid, padding `22px 28px 40px`, vertical `gap: 18px` between sections.
- Hero KPI row: `gap: 14px`.
- Section labels (`BY TRADE`, `ALL EXPENSES`): tiny uppercase, `font-size: 11px`, `letter-spacing: 0.6px`, color `subtle` (#94a3b8).

---

## 6 · Component-by-component spec

### 6.1 Page header

```
[◀ back btn 34×34, radius 9] [H1] [Badge: All time]
                              "Track everything spent on …  Linked to Contracts & Payments ↗"
                                                          [Import] [+ Add expense]
```
- H1: 22px / 700 / letter-spacing -0.4 / slate-900
- Subline: 13px / 500 / slate-500, with the project name in slate-900 700 and "Contracts & Payments ↗" as a primary-colored link
- Buttons: secondary (Import), primary (Add expense). 36px height.

### 6.2 Hero KPIs

Four equal-width cards. Each: white bg, slate-200 border, 12px radius, padding `18px 20px`, internal `gap: 6px`.

| KPI | Format | Sub | Foot |
|---|---|---|---|
| **Total spent** | `₹9,30,726` (28px / 700, tabular-nums, letter-spacing -0.4) | `across 312 records` | trend arrow + "+12% vs last 30 days" |
| **Cash position** | `+₹2,69,274` (success-green if ≥0, danger-red if <0) | `collected − spent` | `₹12L in / ₹9.31L out` · "Contracts →" link |
| **Budget vs progress** | `42%` | `of ₹22L budget` | **BudgetGauge** (see below). Trailing **Badge** in top-right: `success` "X% under" or `warn`/`danger` "X% over" |
| **Burn rate** | `₹86.4k` | `per week · 4-wk avg` | `~14 wks runway` + 84×26 **Spark** |

**BudgetGauge** (the key visual): a 6px-tall pill-shaped track (`hairline` background), filled to `spent/budget` in green/yellow/red, with a **2px vertical black marker at the progress%** position. Two labels below: `42% of budget spent` (left, percent bolded in tone color) · `38% complete` (right, slate-500). Healthy = budget% ≤ progress% + 5%.

**Spark** (sparkline): tiny SVG of the last 8 weeks of burn. Line + soft area fill at 12% opacity in primary blue, with a 2.5px filled dot at the endpoint.

### 6.3 Breakdown card (`Where the money went`)

A single white card containing:
- Header row: section label `WHERE THE MONEY WENT` (uppercase 11.5/700/slate-400) on the left; right side has two ghost buttons "Subcontracts" and "Report".
- Below header: total amount `₹9,30,726` at 24/700/letter-spacing -0.3, with the meta line `312 records · 2 kinds` at 13/500/slate-500.
- **BreakdownBar**: 14px-tall stacked pill divided into segments for each non-zero sub-kind, ordered as in the data (Labor sub-kinds first, then Building sub-kinds). 1.5px white separator between segments. Below: a wrapped legend with color square + label + amount + percent for each segment.

### 6.4 Trade strip (3 variants)

All variants iterate `TRADES`. Active = `amount > 0`, empty = `amount === 0`.

#### Variant A — **Detailed cards** (recommended desktop default)
- CSS grid: `repeat(auto-fill, minmax(220px, 1fr))`, gap 12.
- **Active card**: white bg, `border: 1px solid slate-200`, `border-left: 3px solid <trade.color>`, radius 10, padding 14×16, hover lifts (`translateY(-1px)` + soft shadow).
  - Top row: trade label (uppercase 11/700/slate-400) + record count (slate-400 11px tabular).
  - Big amount (20/700/tabular-nums, letter-spacing -0.2).
  - Sub-rows: label-left / amount-right pairs in 12.5px (slate-500 / slate-900 700).
- **Empty card** (`TradeAddCard`): dashed slate-200 border, transparent bg, "No expenses yet" + a small `+` icon top-right. On hover, fills to white and the border darkens to slate-400.

#### Variant B — **Compact rows**
- One white card containing all active trades as rows. Each row: 5-col grid `auto 1fr 180px 80px 16px` = color dot · label · progress bar · amount · chevron. Row hover tints to `bg`. Hairline (slate-100) separators.
- Empty trades appear below as a chip row: `Not used: [Carpentry] [Electrical] …`, each dashed pill.

#### Variant C — **Chips**
- Flex-wrapped row. Each chip: rounded pill with color dot, label, amount, `· records`. Empty chips: dashed border, no amount, small `+` icon. Used as the mobile default.

### 6.5 Expenses table (the priority surface)

The Excel-like working area. See `reference/table.jsx` for the full implementation.

#### Toolbar (top of card)
Two rows:
1. **Search input** (`Search ref code, vendor, description…`, leading magnifier, trailing × clear) · Kind pills `[All|Labor|Building]` · `Select` for Trades · `Select` for Sub-kinds · `Select` for Status · spacer · ghost `Export` button.
2. **Row count** ("24 records" + "Clear filters" link if any filter active) — right side: `Group by` segmented control with options None/Trade/Kind/Date/Vendor (white pill in slate-100 track for active) · density toggle button (list/grid icon, 30×28).

#### Selects (filter pills)
- Native `<select>` styled to look like a pill (radius 99). When value is non-default, background becomes `primarySoft` and text becomes `primary`. When at default, `chip` background and `muted` text.

#### Kind pills
- Three pills: All / Labor / Building. Active = `bg: slate-900, color: white`; inactive = `bg: chip, color: muted`.

#### Table columns (left → right, sortable ones marked)
1. **Date** ⇅ — `12 May`, 12.5px slate-500, tabular-nums. Width 88.
2. **Ref** ⇅ — `EX-2841`, 12px JetBrains Mono, slate-500. Width 84.
3. **Vendor / description** ⇅ (sort = vendor) — vendor 13.5/700/slate-900; description 12/500/slate-500 on a second line (hidden when dense).
4. **Trade** — color dot + label, 12.5/500/slate-900. Width 110.
5. **Kind** — **Badge** with `primary` tone for Labor and `pink` tone for Building, showing the sub-kind label (Daily wages, Contract, Material, etc.). Width 140.
6. **Status** — **Badge**: `success` Paid, `warn` Pending, `primary` Advance; uses `flag` text if present (Advance, Review, Tag worker). Width 100.
7. **Amount** ⇅ — `₹48,500`, 13.5/700/slate-900, tabular-nums, right-aligned. Width 120.
8. **⋮** — overflow menu trigger, 36px col.

#### Header
- Sticky `top: 0`, background `bg` (slate-50), bottom shadow `inset 0 -1px 0 border`.
- Cells 11/600 uppercase letter-spacing 0.5 slate-500. Sortable headers show an up/down arrow when active.

#### Rows
- 1px slate-100 top border. Hover: background `bg`.
- Padding `12px 12px` (comfortable) or `7px 12px` (dense).
- Description line hidden in dense mode.

#### Group rows (when Group by ≠ None)
- Insert a row with `bg: slate-50`, single 8×16px cell spanning all 8 columns.
- Content: chevron + group label + `· {count}` (slate-400 600) + right-aligned group total (slate-900 700 tabular).
- Group labels resolve as: `trade` → trade.label; `kind` → KIND_META[k].label; `date` → `12 May 2026`; otherwise raw key.

#### Footer (sticky bottom of card)
- `bg`, top hairline.
- Left: `Labor ₹6.24L` · `Building ₹3.06L` (12.5px slate-500, amounts slate-900 700 tabular).
- Right: `FILTERED TOTAL` (or `VISIBLE TOTAL` if no filters) + amount at 18/700, tabular, letter-spacing -0.2.

#### Empty state
- "No expenses match your filters." centered, 40px vertical padding, 13px slate-400.

---

## 7 · Interaction & behavior spec

| Surface | Behavior |
|---|---|
| Hero KPIs | Static numbers. Cash position card has a primary-blue "Contracts →" link that navigates to the Contracts module. Burn card shows a sparkline of last 8 weeks of burn. |
| BudgetGauge | The vertical black tick is the **progress marker** — it shows where spend *should* be if you're on budget. If the colored fill is to the LEFT of the tick → under-spending (healthy). If well right → over-spending. |
| Breakdown legend | Static. (Future: clicking a segment filters the table below to that kind.) |
| Trade cards | Click an active card → filter the expenses table to that trade + scroll to it. Click an empty card → open Add Expense modal pre-tagged with that trade. |
| Table search | Filters by `id`, `vendor`, `desc` (case-insensitive substring). Clear × when non-empty. |
| Kind pills | Single-select. `All` shows everything. |
| Trade / Sub / Status selects | Single-select. Default value `all`. |
| Sort | Click sortable header → toggle desc/asc. First click on a non-active column sorts desc. |
| Group by | Re-groups rows by the chosen key. Each group is bordered by a label row showing count + group total. Default `None`. |
| Density toggle | Toggle between comfortable (12px padding, description visible) and compact (7px padding, description hidden). |
| Clear filters | Visible only when at least one filter is active. Resets search + all selects + kind pill to All. |
| Hover state on rows | Background tints to `bg` (slate-50). |
| Add expense / Import | Stub for now; open existing modals if they exist. |

### Currency & date formatting
- **`₹` Indian numbering**: groups last three digits then twos: `9,30,726`, `1,68,675`. Never `930,726`. See `inrInt()` in `reference/utils.jsx` for the regex.
- **Compact**: `₹86.4k`, `₹6.42L`, `₹2.5Cr`. Suffix at ≥1k / ≥1L / ≥1Cr.
- **Dates**: short = `12 May` (table); long = `12 May 2026` (group rows, mobile cards).

---

## 8 · Mobile (390 wide)

```
┌──────────────────────────────────────┐
│ ☰ Aesta                       🔔     │  ← top bar
├──────────────────────────────────────┤
│ ◀ All Site Expenses                  │
│   Srinivasan House & Shop · All time │
├──────────────────────────────────────┤
│ ┌──────────────────────────────────┐ │
│ │ TOTAL SPENT                      │ │
│ │ ₹9,30,726         312 records    │ │
│ │ ┌──────────────┬──────────────┐  │ │
│ │ │ CASH POS     │ BURN / WEEK  │  │ │
│ │ │ +₹2.69L      │ ₹86.4k       │  │ │
│ │ │ ₹12L collect.│ ~14 wks run. │  │ │
│ │ └──────────────┴──────────────┘  │ │
│ │ ┌──────────────────────────────┐ │ │
│ │ │ Budget vs progress           │ │ │
│ │ │ [▓▓▓▓░░░░░░░|░░]  42% / 38%  │ │ │
│ │ └──────────────────────────────┘ │ │
│ │ [🔗 Contracts & payments       →]│ │
│ └──────────────────────────────────┘ │
├──────────────────────────────────────┤
│ Overview │ Expenses (24)              │
├──────────────────────────────────────┤
│ [Search…]                       [⫶]  │
│ [All] [Labor] [Building] [Civil] …   │
│                                      │
│ 12 MAY 2026                  ₹89.4k  │
│ ┌──────────────────────────────────┐ │
│ │ R. Murugan         ₹48,500       │ │
│ │ Roof slab concret. EX-2841       │ │
│ │ ● Civil · Contract · Paid        │ │
│ ├──────────────────────────────────┤ │
│ │ …                                │ │
│ └──────────────────────────────────┘ │
│                                      │
│         [+  Add expense]   ← FAB     │
└──────────────────────────────────────┘
```

- **Hero card**: one tall white card with everything. Total spent at 30/700.
- **Tabs**: Overview / Expenses; Expenses shows count badge.
- **Expense cards**: grouped under date headers; one rounded card per date with hairline-separated rows.
- **Each row**: vendor (700) + description (slate-500) · right-aligned amount + tiny ref code · meta chips below (trade dot, kind badge, optional status badge).
- **FAB**: 52px-tall pill in primary blue, bottom-right, `+ Add expense`, shadow `0 10px 24px rgba(37, 99, 235, .35)`.
- **Trade strip** on Overview: chips variant (most compact).

---

## 9 · Design tokens (recreate in your codebase)

These are tuned to match Aesta's existing theme — slate-based neutrals + brand blue + pink. Verify against the live app and adjust if your project already names them differently.

```ts
// Color
text:        '#0f172a'  // slate-900   — primary text
muted:       '#64748b'  // slate-500   — secondary text
subtle:      '#94a3b8'  // slate-400   — tertiary text / labels
border:      '#e2e8f0'  // slate-200   — card borders
hairline:    '#f1f5f9'  // slate-100   — row separators, faint dividers
bg:          '#f5f7fa'                 // page background
chip:        '#f1f5f9'                 // chip / filter background
card:        '#ffffff'                 // card background

primary:     '#2563eb'  // blue-600    — brand, Labor accent, buttons
primarySoft: '#eff6ff'  // blue-50
primaryHover:'#1d4ed8'  // blue-700

pink:        '#ec4899'  // pink-500    — Building accent
pinkSoft:    '#fdf2f8'  // pink-50

success:     '#10b981'  // emerald-500
successSoft: '#ecfdf5'
warn:        '#f59e0b'  // amber-500
warnSoft:    '#fffbeb'
danger:      '#ef4444'  // red-500
dangerSoft:  '#fef2f2'

// Trade colors
civil:       '#2563eb'
carpentry:   '#d97706'
electrical:  '#dc2626'
fabrication: '#0891b2'
flooring:    '#7c3aed'
painting:    '#db2777'
plumbing:    '#0e9b6e'
scaffolding: '#64748b'

// Type
fontUI:    'Inter, system-ui, -apple-system, sans-serif'
fontMono:  'JetBrains Mono, ui-monospace, "SF Mono", Menlo, monospace'

// Typography scale used
display:        28 / 700 / letter-spacing -0.4   // hero KPI numbers
h1:             22 / 700 / -0.4
title-md:       20 / 700 / -0.2                  // trade card amount
body-bold:      13.5 / 700                       // vendor name
body:           13 / 500
body-sm:        12.5 / 500
label-uppercase:11 / 700 / letter-spacing 0.5 / uppercase  // section labels
ref-mono:       12 / JetBrainsMono                // ref code

// Spacing scale
4 · 6 · 8 · 10 · 12 · 14 · 16 · 18 · 22 · 28 · 40

// Radii
sm: 6   // badges, small chips
md: 7-8 // pills, buttons, selects, density toggle
lg: 10  // cards (interior), trade cards
xl: 12  // KPI cards, breakdown card
xxl:14  // expenses table

// Shadows
card-hover:    0 6px 16px rgba(0,0,0,.05)
fab:           0 10px 24px rgba(37, 99, 235, .35)
header-inset:  inset 0 -1px 0 #e2e8f0   // sticky table header

// Tabular numerics
ALL amounts use `font-variant-numeric: tabular-nums`.
```

---

## 10 · Data model

Drives both views. Source of truth: `reference/data.js`.

### Expense record
```ts
type Expense = {
  id:     string;           // "EX-2841" — display as ref code
  date:   string;           // "2026-05-12" ISO
  vendor: string;           // "R. Murugan", "Lakshmi Cements", "Daily — 6 workers"
  desc:   string;           // "Roof slab concreting — labour"
  trade:  TradeId;          // 'civil' | 'carpentry' | …
  kind:   'labor' | 'building';
  sub:    SubKindId;        // 'daily' | 'contract' | 'tea' | 'excess' | 'unlinked' | 'material' | 'machinery' | 'misc' | 'general'
  amount: number;           // in paise/rupees, raw integer
  status: 'paid' | 'pending' | 'advance';
  paidBy: 'UPI' | 'Bank' | 'Cash';
  flag?:  string;           // optional override label for the status badge
};
```

### Site
```ts
type Site = {
  name: string; location: string; status: 'active'|'on-hold'|'completed';
  contract: { value: number; collected: number; invoiced: number;
              nextMilestone: { label: string; amount: number; dueOn: string } };
  budget: number;
  spent: number;          // computed from expenses
  records: number;        // computed: count
  progress: number;       // 0..1, supplied by supervisor
  burnPerWeek: number;
  burnTrend: number[];    // last 8 weeks
};
```

### KindBreakdown
```ts
// Two-level tree. `BY_KIND.labor.children[i].children[]` allows the
// Salary settlement → Daily/Contract drilldown shown in the source data,
// but the breakdown bar flattens this to a single level (top-level
// children of each kind). Use the same shape in your store.
type KindNode = {
  id: string; label: string; amount: number; records: number;
  flag?: 'review' | 'attention';
  note?: string;
  children?: KindNode[];
};
```

### Trade
```ts
type Trade = {
  id: string; label: string; amount: number; records: number; color: string;
  sub?: { label: string; amount: number }[]; // mini breakdown shown on detailed cards
};
```

---

## 11 · Implementation notes & gotchas

- **Indian number format** is non-obvious — make sure to test with values across boundaries (`999`, `1,000`, `99,999`, `1,00,000`, `9,99,99,999`). The reference uses a regex on the prefix; verify against your existing utility if there is one.
- **Cash position can be negative.** When `collected < spent`, render the value with a `-` and switch the KPI tile's accent to `danger`. The screenshot's mock data has it positive.
- **Healthy budget logic**: `healthy = budgetPct ≤ progressPct + 0.05`. Else `warn`. Gap > 15 percentage points → `danger`. Reproduce this in your component.
- **Sticky header in scrollable table**: the table card has `max-height: 520px; overflow: auto`. `thead` is `position: sticky; top: 0` with the same background as the toolbar. Test in your table component — some have their own sticky-header mode.
- **Group rows are *real rows***, not card chrome. Spanning all 8 columns and using a slightly tinted background. Don't reach for a separate Accordion component; keep them as part of the table.
- **The 3 trade-strip variants share data and click handlers** — implement once with a `variant` prop, not three components.
- **Empty trades on desktop** render as dashed `TradeAddCard`s. On mobile they collapse to dashed chips. Both navigate to the same "Add Expense pre-tagged" flow.
- **All `gap`-based layouts**, not margins between siblings. Aligns with the system-prompt guidance to use flex/grid with gap for drag-reorder friendliness.

---

## 12 · Files in this bundle

```
reference/
├─ All Site Expenses.html   ← Open this in a browser to see the live design
├─ app.jsx                  ← Root: composes DesignCanvas with all artboards
├─ data.js                  ← Mock data (Site, Expenses, Trades, Kind tree, meta)
├─ utils.jsx                ← Tokens (T), Icon, Badge, Pill, Btn, Card, Section,
│                              formatters (inr, inrK, fmtDate)
├─ kpis.jsx                 ← HeroKpis, KpiCard, BudgetGauge, Spark, BreakdownBar
├─ trades.jsx               ← TradeStrip (variant=detailed|compact|chips),
│                              TradeCard, TradeAddCard
├─ table.jsx                ← ExpensesTable + Th + Row + StatusBadge + Select +
│                              groupHeader
├─ desktop.jsx              ← DesktopPage = SiteSidebar + TopBar + PageHeader +
│                              HeroKpis + breakdown card + trade section + table
├─ mobile.jsx               ← MobilePage with Overview/Expenses tabs + FAB
└─ design-canvas.jsx        ← Pan/zoom canvas chrome — NOT part of the screen.
                              Do not port this to production. It only exists
                              to present the artboards side-by-side.
```

When porting, **ignore `design-canvas.jsx` and `app.jsx`** — those are display chrome for the handoff. Start from `desktop.jsx` and `mobile.jsx`, which call into the real components in `kpis.jsx`, `trades.jsx`, `table.jsx`.

---

## 13 · Suggested build order

1. **Tokens** in your styling system (Tailwind config, theme.ts, CSS vars — whatever you use). Match section 9.
2. **Primitives** — confirm or build: `Badge`, `Pill`, `Button`, `Card`, `Select`, `Input` with leading icon, density-toggle `IconButton`.
3. **Formatters** — `inr`, `inrK`, `fmtDate`. Likely already exist; if so, verify Indian grouping.
4. **BreakdownBar + BudgetGauge + Spark** — three small data-viz components, pure SVG/divs.
5. **HeroKpis** — composes `KpiCard` × 4 + the three vizzes above.
6. **TradeStrip** — `variant` prop, three internal sub-components.
7. **ExpensesTable** — the big one. State for search/filters/sort/group/density lives at this component's level. Memoize the filtered/sorted/grouped data.
8. **DesktopPage** / **MobilePage** — composition only; pull `Site`, `Expenses`, `Trades` from your store.
9. **Wire up** Add expense, Import, Contracts link, trade-click → table-filter, row click → expense detail.

---

## 14 · Open questions for the team

These were not specified during design — confirm before implementing:

- **Where does `budget` come from?** It's a separate setting from `contract.value`. Today the design assumes `budget < contract` (so margin = `value − budget`). If your data model has only `contract.value`, either add `budget` or change the KPI to "% of contract spent".
- **Burn rate window** — design shows 4-week average. Confirm with finance.
- **Excess / Unlinked salary** are flagged in red on the table. Confirm those are real states in your data, and whether they should also pop a `warn` badge at the top of the screen ("12 unlinked salaries — tag a worker").
- **`progress` (%)** — where does this number come from? Manual supervisor entry? Computed from milestones?
- **Subcontracts link target** — assumed to be a sibling page. Confirm route.
