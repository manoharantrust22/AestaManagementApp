# Handoff: Aesta Workforce — Contracts workspace

## Overview
A redesign of the **Workforce** area of Aesta (a construction-management web app used to run building projects in Tamil Nadu, India). It unifies the old Trades / Subcontracts / Task-Work features into one navigable workspace and introduces a single "aha" metric — **paid vs. value of work done** — that tells a non-technical site supervisor, at a glance, whether they have paid a crew *ahead* of the work (and are exposed if the crew walks off) or are safely holding money back.

Information architecture:
```
PROJECT (the site, e.g. "Padmavathy Apartments") — one unified money ledger
└─ CONTRACT = a TRADE / discipline (Civil, Electrical, Painting, Tiling, Plumbing…)
   └─ STAGE (optional grouping: Ground Floor, First Floor, Roof Slab)
      └─ TASK WORK (a priced piece of work given to a mesthri team or specialist)
```
Stages organise records only; they never split money. All spend rolls up to the project.

## About the design files
The files in this bundle are **design references created in HTML** — interactive prototypes showing the intended look and behaviour. They are **not** production code to copy directly. The task is to **recreate these designs in the target codebase's existing environment** (the live app is **Next.js + React + Material UI v7 + Tailwind, with React Query for data**) using its established components, patterns and data layer. Treat MUI as the baseline component kit; the visual style below can be implemented on top of it.

The HTML is authored as "Design Components" (a streaming-preview format). The `*.dc.html` files load a runtime (`support.js`, included) — ignore the runtime; what matters is the **markup, the visual system, and the logic described in this README**. All real behaviour (the exposure math, state mutations) is documented below so you can implement it without reading the runtime.

## Fidelity
**High-fidelity.** Final colours, typography, spacing, copy and interactions are all specified. Recreate the UI faithfully using the codebase's component library. Exact hex values, sizes and the core formula are given below.

---

## Screens / Views

### 1. Desktop workspace — `Aesta Workspace.dc.html` (primary)
A three-pane master/detail layout filling the viewport (`height:100vh; display:flex`).

**Pane A — Nav rail** (left, collapsible)
- Width `244px` expanded / `76px` collapsed; `transition:width .22s ease`. Background `#0f1626`, text `#cbd2e0`.
- Top: 30×30 brand tile (`#2f6bed`, white "A", radius 8) + "Aesta" wordmark (hidden when collapsed).
- Nav groups: **GENERAL** (Overview) · **WORKFORCE** (Contracts [active], Contract details, Attendance, Salary settlements, Holidays). Section labels are `10px/800`, letter-spacing `.1em`, colour `#67718c`.
- Active item: background `#2f6bed`, white text, `box-shadow:0 4px 14px rgba(47,107,237,.4)`. Inactive icon/text colour `#9aa6bd`.
- Icons: Google **Material Symbols Rounded** (e.g. `groups`, `table_rows`, `event_available`, `payments`, `beach_access`, `space_dashboard`). Active item uses filled variant (`font-variation-settings:'FILL' 1`).
- Footer: "Collapse" toggle (`left_panel_close` / `right_panel_open`).

**Pane B — Contract list** (width `400px`, background `#fff`, right border `1px #e9ebf0`)
- Header: breadcrumb "Workforce › Contracts" (`11px/600 #8a8f9c`), project title "Padmavathy Apartments" (`19px/800`), and a primary **Add** button (`#2f6bed`, white, radius 10).
- Site summary: three tiles (Paid / Work done / At risk). **Paid** value colour `#2f6bed`. **At risk** tile turns amber (`bg #fdf2e0`, text `#d9870b`) when site exposure > ₹50,000, else green (`bg #e8f6ee`, text `#1f9d57`). Values use compact notation (₹52.1L, ₹95k, ₹1.2Cr).
- Search field (visual only here): `bg #f4f6f9`, border `1px #e9ebf0`, radius 10.
- **Tree**: each trade is a collapsible group row → chevron (rotates 0°→90° on open) + trade icon + name (`14.5px/800`) + count pill + a **mini dual progress bar** + a severity dot. Expanding reveals stage labels (`10.5px/800 #9aa0ad`, letter-spacing `.05em`) and task rows.
- **Task row**: severity dot + title (`13.5px`; selected → `800` and `#2f6bed`) + "{who} · paid {x%} of work {y%}" subline + a 46px dual progress bar. Selected row: `bg #eaf1fe`, border `1px #d3e0fb`.

**Pane C — Task detail** (flex:1, background `#f4f6f9`)
- Header (60px, white): breadcrumb "{Trade} › {Stage}", task title, **Update progress** (secondary) and **Record payment** (primary) buttons.
- Body:
  1. Identity row: 46px avatar (initials, `bg #dfe7f6`, text `#2f6bed`), "{who} · {party} · {mode}" with a mode icon, and a status pill (Active `#1f9d57`/`#e8f6ee`, Completed `#2f6bed`/`#eaf1fe`, Draft `#8a8f9c`/`#f0f2f6`).
  2. Three stat cards: **Contract value** / **Work done** (₹ value + "{x%} complete") / **Paid out** (value in `#2f6bed` + "{x%} of value").
  3. **THE BALANCE METER** (hero — see "The exposure model" below).
  4. Bottom row: **Payments** history card (list of payments: 32px icon tile, amount, "{date} · {method}") + a column with a **"Is the price a good deal?"** card (day-wage benchmark vs agreed, "Saves" in green) and a **Log attendance** card (tappable).

### 2. Mobile workspace — `Aesta Workspace Mobile.dc.html`
Same data and logic, single-column, in a 390-wide phone frame. Two screens:
- **List screen**: app bar (menu / "Padmavathy Apts" / avatar) → 3 summary chips → search → collapsible trade cards with task rows → **FAB** (`+`, 56px, `#2f6bed`, bottom-right) → bottom tab bar (Contracts active, Attendance, Salary, More).
- **Detail screen**: back-arrow app bar → identity → 3 stat tiles → balance meter → Progress / Attendance buttons → Payments list → good-deal card → sticky **Record payment** bar at the bottom.
- All four actions are **bottom sheets** (slide up from bottom, `@keyframes` translateY 100%→0, scrim `rgba(15,22,38,.45)`), where desktop uses centered modals.

### 3. Exploration — `Aesta Workforce.dc.html` (reference only)
The original three design directions (Trade Workspace tabs, Master/Detail, Site Dashboard) and the over/under gauge in four states. Useful for rationale and alternative layouts; **Workspace** (#1/#2) is the chosen direction.

---

## The exposure model (core logic — implement exactly)

For any task work with `quoted` (agreed lump sum, ₹), `paid` (₹ paid so far) and `work` (fraction complete, 0–1):

```
workValue = quoted * work               // ₹ value of work actually done
exposure  = paid - workValue            // + = paid AHEAD of work (risk); − = held back (safe)
ratio     = exposure / quoted
```

**Verdict / severity** (drives colour, icon, copy):
| ratio | sev | meaning | colour | icon |
|---|---|---|---|---|
| `work==0 && paid==0` | `none` | Not started | `#c2c7d2` | `hourglass_empty` |
| `> 0.15` | `high` | High risk — paid well ahead | `#d64545` | `warning` |
| `> 0.04` | `watch` | Watch — slightly ahead | `#d9870b` | `priority_high` |
| `-0.04 … 0.04` | `instep` | In step | `#2f6bed` | `check_circle` |
| `< -0.04` | `safe` | Safe — money in hand | `#1f9d57` | `shield` |

Verdict background tints: high `#fbeaea`, watch `#fdf2e0`, safe `#e8f6ee`, instep `#eaf1fe`, none `#f0f2f6`.

**Meter geometry** (a horizontal diverging bar; centre = "in step"):
- Track: left half background `#e8f6ee` (safe), right half `#fdeede` (exposed), a 2px centre divider `#c2c7d2` at 50%.
- Let `maxR = 0.30`, `cl = clamp(ratio, -0.30, 0.30)`, `w% = abs(cl)/0.30 * 50`.
- Fill bar colour = severity colour. If `exposure ≥ 0`: `left:50%`, `width:w%` (extends right). Else `left:(50−w)%`, `width:w%` (extends left).
- A 3px black marker (`#0f1626`) sits at the end of the fill (`left:(50±w)%`).
- Labels under the bar: "◀ Safe — money still in hand" (`#1f9d57`) · "In step" (`#9aa0ad`) · "Exposed — paid ahead ▶" (`#d9870b`).

**Trade rollup & site rollup**: sum `quoted`, `paid` and `workValue` across the relevant tasks, then run the same formula on the totals. Site "At risk" = `Σ max(0, exposure)` across all tasks.

**Secondary "good deal" metric** (kept from the brief): `benchmark` (day-wage estimate) vs `quoted`; `saving = max(0, benchmark − quoted)`. This answers "is the price itself fair", separate from the exposure check.

---

## Interactions & Behaviour

- **Select task**: clicking a tree/list row sets `selected`; detail pane re-renders. Mobile pushes to the detail screen.
- **Collapse rail** (desktop): toggles `collapsed`; width animates, labels hide.
- **Expand/collapse trade**: toggles per-trade `open` flag; chevron rotates.
- **Record payment** → modal/sheet. Fields: amount (number input + quick-add chips +₹10k/+₹25k/+₹50k), method (UPI / Cash / Bank). A **live preview banner** recomputes exposure for `paid + amount` *before* confirming and warns ("After this you'll be ₹X ahead of work" with the matching severity colour/icon). Confirm → `paid += amount`, `pays += 1`, prepend `{amount, date, method, icon}` to the payments list, close, toast "Paid ₹X recorded".
- **Update progress** → modal/sheet with a range slider (0–100, step 5) and a **live meter preview** that swings as you drag. Confirm → `work = value/100`, toast.
- **Log attendance** → stepper (worker count). Confirm → `days += 1`, toast "Day logged · N workers".
- **Add task work** (Add button / FAB) → modal/sheet: Trade chips, contractor type (Mesthri team / Specialist), party name (text), title (text), quoted total (number), Stage chips, tracking-mode cards (Mesthri-only / Headcount / Mid / Detailed, 2×2). Confirm → creates a task (`paid:0, work:0, days:0, pays:0, bench:round(quoted*1.12)`), inserts into its trade group, selects it, toast "Task work created".
- **Toasts**: dark pill (`#0f1626`), bottom-right (desktop) / above the FAB (mobile), auto-dismiss after 2.8s, leading filled icon coloured by tone (good `#36d07f`).
- **Modals**: scrim fade-in `.15s`; card `@keyframes` pop (translateY 10px + scale .98 → 0/1) `.2s`. Click scrim to close; click card stops propagation. Sheets (mobile) slide up `.26s cubic-bezier(.2,.8,.2,1)`.
- **Indian number formatting**: group the last 3 digits, then in 2s (₹6,65,000 — *not* ₹665,000). Negative prefix `-`. Compact: `₹{n/1e7}Cr` ≥1cr, `₹{n/1e5}L` ≥1L, else `₹{n/1e3}k`.

## State management
Single source of truth — a list of task objects in component state (here React class state; in the app, server state via React Query + optimistic local updates):

```
task = { id, trade, stage, title, who, party, initial, mode, modeIcon,
         quoted, paid, work /*0–1*/, days, pays, bench, payments:[ {amountF, date, method, icon} ] }
```
UI state: `selected` (task id), `open` (map of trade→bool), `collapsed` (rail), `sheet` (null | 'payment'|'progress'|'attendance'|'add'), `draft` (working values for the open sheet), `toast`. All derived views (tree, rollups, meter, verdict, previews) are **computed from state** on each render — no duplicated state. In production, payment/progress/attendance/add map to mutations that update the project ledger; the exposure numbers are always derived, never stored.

---

## Design tokens

**Colour**
| Token | Hex | Use |
|---|---|---|
| Primary | `#2f6bed` | brand, paid, primary actions |
| Primary tint | `#eaf1fe` | selected rows, secondary buttons, chips |
| Ink | `#18202f` | primary text |
| Ink-2 | `#5b6678` | secondary text |
| Muted | `#8a8f9c` / `#9aa0ad` | labels, captions |
| Canvas | `#f4f6f9` | app background |
| Surface | `#ffffff` | cards, panes |
| Hairline | `#e9ebf0` / `#eef1f6` | borders, dividers |
| Rail bg | `#0f1626` | nav rail, toast |
| **Verdict green** | `#1f9d57` (bg `#e8f6ee`) | safe / fair |
| **Verdict amber** | `#d9870b` (bg `#fdf2e0`) | watch / overpaid |
| **Verdict red** | `#d64545` (bg `#fbeaea`) | high risk / underpaid |
| Work-done bar | `#cdd5e2` | the grey "work" layer under the blue "paid" layer |

Reserve green/amber/red strictly for the exposure verdict — neutral greys everywhere else.

**Typography** — **Plus Jakarta Sans** (weights 400/500/600/700/800), tabular numerals on (`font-variant-numeric:tabular-nums`). Scale used: 10–12px labels, 13–14px body, 15–17px titles, 19–22px stat values, headings to 30px. Tight tracking on big numbers/titles (`letter-spacing:-.01em` to `-.03em`). Worker/owner names are Tamil/romanised (Karthik, Murugan, Anbu, Saravanan, Vignesh, Anand, Ramesh).

**Radius**: cards 14–16px, rows/inputs/buttons 10–13px, pills 999px, avatars 11–12px.
**Spacing**: 8/9/11/13/14/16/18/22/24px rhythm.
**Shadows**: card `0 1px 2px rgba(20,28,46,.04)`; raised button `0 4px 14px rgba(47,107,237,.32)`; modal `0 30px 80px rgba(15,22,38,.4)`; toast `0 12px 30px rgba(15,22,38,.4)`.
**Animation**: 0.15–0.3s ease; sheets cubic-bezier(.2,.8,.2,1).

## Assets
- **Fonts**: Plus Jakarta Sans + Material Symbols Rounded (Google Fonts). Swap to whatever the codebase already loads; MUI ships its own icon set — map the Material Symbol names (`payments`, `groups`, `foundation`, `bolt`, `format_paint`, `grid_view`, `plumbing`, `trending_up`, `how_to_reg`, `shield`, `warning`, `check_circle`, `chevron_right`, `expand_more`, `account_balance`, `account_balance_wallet`, etc.) to MUI equivalents.
- No raster images or logos. The "A" brand tile is a coloured square with a letter.

## Files
- `Aesta Workspace.dc.html` — desktop 3-pane working prototype (primary reference).
- `Aesta Workspace Mobile.dc.html` — mobile working prototype (sheets, FAB, bottom nav).
- `Aesta Workforce.dc.html` — three-direction exploration + gauge studies (rationale/alternatives).
- `support.js` — DC preview runtime (needed only to open the HTML locally; **not** to be ported).

To run the prototypes locally, serve this folder and open any `.dc.html` in a browser. Implement against the README, not the runtime.
