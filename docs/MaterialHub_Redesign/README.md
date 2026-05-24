# Handoff: Materials Flow Redesign — Aesta

## Overview

Redesign of the Materials lifecycle in the **Aesta** construction management app — collapsing six disconnected pages (Material Requests / Purchase Orders / Delivery / Settlement / Inter-Site / Material Expenses) into one unified **Material Hub** where each request is a *thread* showing its full lifecycle inline.

Adds **Spot Purchase** as a first-class entry path alongside the standard MR/PO flow — the honest, low-ceremony post-facto recording surface for small-quantity walk-in purchases the supervisor has already paid for from their engineer wallet.

Adds a proper **Inventory** surface (warehouse-style card grid with per-category material visuals + switchable filter/sort table), a clearer **Inter-Site Settlement** view with explicit netting math, and a responsive mobile experience focused on the site engineer's daily micro-tasks.

## About the Design Files

The files in this bundle are **design references created in HTML/React (JSX via Babel-standalone)** — interactive prototypes showing intended look and behavior. They are **not production code to copy directly**.

The task is to **recreate these designs in the existing Aesta codebase** (which already uses React, TypeScript, Supabase per the spot-purchase spec) using the project's established patterns: existing component primitives, design tokens, RLS-aware data hooks, and the schema laid out in `supabase/migrations/`. The prototype's state shape is illustrative — the production data model is authoritative.

The prototype runs entirely client-side with in-memory state; the production implementation should hit the existing Supabase tables (`material_requests`, `purchase_orders`, `material_purchase_expenses`, `stock_inventory`, `group_stock_inventory`, `inter_site_material_settlements`, `spot_purchase_allocations`, `site_engineer_transactions`).

## Fidelity

**High-fidelity (hifi).** Layouts, type, color, spacing, density, and interaction states are intentional. Recreate pixel-faithfully using the codebase's existing UI primitives (e.g., your Button / Badge / Modal / Table components) — don't copy the inline styles from the prototype, but match what they render visually.

## Files

The prototype HTML entry point is **`Materials Prototype.html`** (interactive, clickable). It composes these scripts in order:

| File | Purpose |
|---|---|
| `mat-data.js` | Seed data — sites, vendors, materials, engineers, M helper |
| `proto-state.js` | Reducer + initial state for the prototype |
| `utils.jsx` | Tokens (T), formatters (inr/inrK/fmtDate), Icon, primitives (Btn/Badge/Card/Pill) |
| `proto-modals.jsx` | All action modals: CreateRequest, Approve, CreatePO, RecordDelivery, SettleVendor, LogUsage, plus ProtoModal/ProtoField/ProtoInput/ProtoSelect/ProtoRadioCards/ProtoToast primitives |
| `proto-table.jsx` | Hub Table view (sortable headers, per-column filter row, MultiSelect, ColInput) |
| `proto-inventory.jsx` | Inventory page — Cards grid + switchable Table view, MaterialAvatar (category-themed tile) |
| `proto-spot.jsx` | Spot purchase form, NewEntryMenu launcher, SpotAllocationModal, AllocationsQueue |
| `proto-screens.jsx` | ProtoHub, ProtoInterSite (with NettingMath worked example), ProtoThreadRow, ProtoThreadPipeline |
| `proto-app.jsx` | Root component, sidebar, top bar, modal router, responsive shell |

A secondary file **`Materials Redesign.html`** is a static design canvas with the same patterns laid out side-by-side for visual comparison (uses `design-canvas.jsx` + `mat-chrome.jsx` + `mat-hub.jsx` + `mat-thread.jsx` + `mat-intersite.jsx` + `mat-mobile.jsx` + `mat-app.jsx`). Useful for reference but the prototype is the source of truth.

## Information architecture

### Screens

1. **Material Hub** (`/site/materials`) — the unified surface, default landing
2. **Inter-Site Settlement** (`/site/materials/inter-site`) — debt ledger between cluster sites
3. **Inventory** (`/site/materials/inventory`) — warehouse browse of all stocked batches
4. **Mobile · Today** (`/site/today`) — site engineer's daily action surface (in the design canvas only)

### Sidebar nav

Under `Materials`: **Hub · Inter-site · Inventory** (in that order). **Vendors deliberately omitted from the site-side nav** — vendor catalog is a company-level concern (`/company/vendors`), not a per-site one.

---

## Screen 1 — Material Hub

### Purpose

One surface that replaces 5 separate pages. Each row = one material request (a "thread") showing its full lifecycle inline. Admin / office use it to advance threads (Approve → Create PO → Settle); site engineers use it to record delivery and log usage.

### Layout (1440w default)

```
┌─Sidebar(232)─┬─TopBar(56)──────────────────────────────────────────┐
│ Aesta        │  Srinivasan House & Shop · Footing · Foundation     │
│ Site|Company │  Materials / Hub                          [date]    │
│ ─────────    ├─────────────────────────────────────────────────────┤
│ Dashboard    │  Material Hub  · 47 threads      [Cards|Table] [+]  │
│ AI Assistant │  Every material from request to expense.            │
│ Workforce    │                                                      │
│ Expenses     │  ┌─KPI─┬─KPI─┬─KPI─┬─KPI─┐                           │
│ Site Ops     │  │needs│ in  │settl│inter│   (4 tiles, 3px L band)  │
│ ▼ Materials  │  │ 6   │14   │1.38L│-2.4k│                          │
│   • Hub      │  └─────┴─────┴─────┴─────┘                           │
│   • Inter    │                                                      │
│   • Inventory│  [Allocations needed · N batches]  (warn panel)     │
│ Contracts    │                                                      │
│ Settings     │  [All 47] [Needs action 6] [Own 14] [Group 33] …    │
│ ─────────    │                                                      │
│ Demo guide   │  ┌──────────────────────────────────────────────┐   │
│ Reset state  │  │ MR-XXX · GROUP · ADVANCE   [pipeline] [vendor]   [Action]│
│ HA · Admin   │  │ 200 bag · PPC Cement (50kg bag)            │   │
└──────────────┴──── Foundation · Footing · requested 14 May ───┘   │
                                                                      
```

### KPI strip (top, 4 cards · grid 1fr×4 desktop, 1fr×2 mobile)

Each card has a 3px-wide colored left band, soft-tinted icon box (22×22, radius 6), label, big mono value, and 11px muted sub.

| KPI | Tone | Value source |
|---|---|---|
| Needs your action | warn (#f59e0b) | `threads.filter(M.nextAction).length` |
| In flight | primary (#2563eb) | `awaitingPO + awaitingDelivery` |
| Settlement due | danger (#ef4444) | `sum(po.amount where delivered + pending)` |
| Inter-site net | pink (#ec4899) | `protoInterSiteDebt(threads).net` — clickable, navigates to inter-site |

### Allocations needed panel (conditional)

Shows only when there are group spot purchases with `spotStage === 'provisional'`. Yellow background, bell icon, "X batch(es) need(s) allocation". Each row shows thread id (mono, subtle), material name + qty, vendor + amount + provisional split (e.g. "60% SHS · 40% PA"), age tag ("3d old" or "Consumed" if remaining ≤ 0 — overdue if ≥ 7d), and a warn-colored "Finalize" button.

### Filter chips (single-select)

`All · Needs action (warn) · Own · Group (pink) · Advance (warn) · Spot (warn)`. Each chip is `display:inline-flex`, 7×12px padding, 8px radius, white bg, ash text. Active chip: dark text-900 bg, white text. Counts shown as soft-rounded mono pill at right of chip text.

### Thread row (Cards layout)

**Grid:** `4px · 1.4fr · 2fr · 1.2fr · 160px` (5 columns, 14px gap, 16/18px padding).

1. **4px color band** (left, full-height): primary (#2563eb) for own, pink (#ec4899) for group. Own gets opacity 0.35 to be subtler.
2. **Material block:**
   - Top line (chips, row): `MR-XXX` (10.5px mono, subtle), then optional badges (group · cluster pink, advance warn, spot warn, HIGH danger).
   - Title: `<qty mono> <unit muted> · <material name>` (14px, 700)
   - Subline: `<section> · <floor> · requested <date>` (11.5px muted)
3. **Pipeline** — see "Pipeline" below.
4. **Money block:** `<inr(amount) mono 13.5 700>`, then vendor name (icon + name, 11.5px muted, ellipsis), then conditional advance progress bar (4px height, warn track + warn fill) showing `received/total qty`.
   - Spot threads show `Wallet · UPI/CASH` line in warn color underneath.
5. **Next action button:** primary-color bg, white text, 12px 700, "<verb> →" with arrowRt icon. Falls through to a success "All clear" chip with check icon when there's no action.

Click anywhere on the row (except action button) to expand inline → ThreadExpanded (6 detail blocks, see "Expanded thread" below).

Selected state: `border-color: accent`, soft shadow `0 1px 0 {accent}, 0 8px 24px rgba(15,23,42,.06)`.

### Pipeline (per-row mini timeline)

Six stages horizontally: `Req · Approve · PO · Deliver · Settle · In use`. Each is a 14px circle:
- Done (past): solid text-900 with white check icon
- Current: primary-color with white center dot (animated `matPulse` 1.6s ease-in-out), `0 0 0 4px primarySoft` ring
- Future: white with `border: 2px solid border-200`

Connecting line: 2px height, text-900 if next stage done, hairline if not. 14px min-width between stages.

Below each circle: 9px uppercase label, current = primary-color 700 weight.

For **spot purchases**: a different (shorter) pipeline of 2–3 stages: `Bought · In use · [Finalize]` — all in warn-color (#f59e0b) instead of primary. "Finalize" only present for group spot threads; the rest of the chain has no approval/PO/delivery/settlement steps since they're bypassed.

### Table layout (alternative view)

Toggle (segmented: Cards / Table) is top-right next to the New entry button. Mobile always uses Cards.

**Columns** (width in px):
| key | label | sort | width | filter input |
|---|---|---|---|---|
| reqDate | Request # | ✓ (default desc) | 140 | text "MR-…" |
| stage | Stage | ✓ | 130 | MultiSelect of M_STAGES |
| material | Material | ✓ | 220 | text "cement…" |
| qty | Qty | ✓ | 90 (right-aligned) | min/max range |
| section | Section | — | 140 | text "foundation…" |
| type | Type | ✓ | 110 | MultiSelect (own/group/advance/spot) |
| vendor | Vendor | — | 150 | text "vendor…" |
| amount | Amount | ✓ | 110 (right-aligned) | min/max range |
| needBy | Need by | ✓ | 110 | — |
| action | — | — | 140 | — |

- **Sticky** header + filter rows (top: 0 and top: 36)
- Click column header to sort; second click reverses direction
- Filter row toggleable via "Column filters" button in toolbar
- Toolbar shows row count, active filter count, Clear button, current-sort indicator
- Footer with "N rows · Click any column header to sort"

**Stage pill** (compact, in table only): icon + uppercase label, colored bg per stage:
- requested: bg, muted fg, plus icon
- approved: primarySoft, primary, check
- ordered: warnSoft, warn, receipt
- delivered: cyan-50 (#ecfeff), cyan-600 (#0891b2), download
- settled: successSoft, success, check
- in-use: primarySoft, primary, trend
- exhausted: hairline, subtle, check
- rejected: dangerSoft, danger, x

### Expanded thread (inline, on row select)

Renders below the row inside the same card. 6 detail blocks in a 3-column grid (`1fr 1fr 1fr`, 16px gap), padded 18px×22px on a `#fafbfc` background:

1. **Request** — Material, Quantity, Section, Requested (by whom + when), Need by (highlighted danger if priority=high), Note
2. **Purchase order** — PO #, Vendor, Type (Group/Own + Advance badges), Amount, Paid by, plus an inline warn-tinted advance panel showing batches received & next batch date
3. **Delivery & quality** — Received date, By (engineer), Quality (success/warn/danger badge), Notes
4. **Settlement** — Amount, Status badge, Paid by, On date; inline warn hint if pending
5. **Inventory · stock** — Batch #, Received, Used, Remaining (success-color), 6px progress bar, % used / % left
6. **Inter-site usage** (group) OR **Expenses** (own) — for group: per-site usage rows with color swatch, site short, PAYER tag on payer, qty + value (red minus for non-payer); for own: posted-to-expenses confirmation

Each block has a header with a 14px completion circle (success-color check if complete, hairline+border if not), uppercase block title, and optional CTA button on the right when action pending.

---

## Screen 2 — Inter-Site Settlement

### Purpose

Reframe the inter-site reconciliation page as a debt ledger between cluster sites. Make the netting math explicit and visible so the user understands how ₹A owes-direction and ₹B owes-direction collapse to a single net transfer.

### Layout

1. **Back to Hub** chevron-left button (transparent, muted)
2. **Page head** with "Inter-Site Settlement" title + "Pudukkottai Cluster" pink-dot badge + "Net settle ₹X" primary button when non-zero
3. **Balance card** — dark gradient (#1e293b → #0f172a), white text, grid `1fr·auto·1fr`. Left: "You owe" + ₹ in red (#f87171) + records count. Center: 36px circle icon + "NET" uppercase + ±₹X.Xk mono. Right: "Others owe you" + ₹ in green (#34d399) + records count.
4. **Netting math worked example** — white card with header "How this nets · worked example" + "Auto-computed" primary badge. Inside, two DirectionPanels side-by-side, then a dashed-border equation block, then a primary-tinted "Settle now" inline action panel.
5. **Shared batches grid** — 2-column grid of cards, each showing batch id, material + qty, vendor + payer chip, ₹ + % used, stacked usage bar (per-site colors), site usage legend with shorts + qty

### DirectionPanel

```
┌─────────────────────────────────────────┐
│ [PA] → [SHS]  used your batches         │
│ ₹1,240    (success / danger color)      │
│ 2 records                                │
│ ─────────────────────────────────────── │
│ MAT-… · PPC Cement              ₹600   │
│ MAT-… · TMT Rods 12mm           ₹640   │
└─────────────────────────────────────────┘
```

### Equation block

```
The math
  + ₹1,240   (PA owes SHS)
  − ₹3,660   (SHS owes PA)
  ─────────
  = ₹2,420   → SHS pays PA
```

Mono font, primary value sized 16px+ 800, color: success for + line, danger for − line, text-900 for result. Then a primary-soft tinted action row: `info icon + "Srinivasan will transfer ₹2,420 to Padmavathy. Both sites' expense ledgers update automatically." + Settle now button`.

### Live computation

```js
debt = protoInterSiteDebt(threads, mySite='srinivasan')
// returns { iOwe, othersOwe, net, detail: [{ from, to, thread, used, value }] }

// Detail filters:
owedToMe = debt.detail.filter(d => d.to === 'srinivasan')  // PA → SHS
owedByMe = debt.detail.filter(d => d.from === 'srinivasan')// SHS → PA
totalOwedToMe = sum(owedToMe.value)
totalOwedByMe = sum(owedByMe.value)
offset = min(totalOwedToMe, totalOwedByMe)
netAmount = abs(totalOwedToMe - totalOwedByMe)
netPayer = totalOwedByMe > totalOwedToMe ? me : other
```

The math handles spot threads too: `payerId = t.po?.payer ?? t.site` (spot threads carry payer info on `t.site` since the supervisor's wallet was funded by their site).

---

## Screen 3 — Inventory

### Purpose

Warehouse-style browse of all stocked batches. Default Cards view feels like walking the shelves; switchable Table view is for filter/sort-heavy ops.

### Layout

1. Back to Hub
2. Page head with "Inventory" title + "Walk the shelves — what's physically here, what's shared with the cluster, and what's running low." subhead + Cards|Table segmented toggle + "Manual adjustment" secondary button
3. **KPIs row** — 4 cards: Own stock (₹value, primary), Group stock (₹value, pink), Low stock (count, warn), Total batches (count, text-900)
4. **Tabs + search** — `All N · Own N · Group N` segmented control (left) + search input (right, minWidth 220)
5. **Cards view (default):**
   - Grid `repeat(auto-fill, minmax(280px, 1fr))`, 12px gap (1col mobile)
   - Each card: MaterialAvatar tile (140px tall) + body (padding 14, gap 10)
6. **Table view (alternative):**
   - 12 columns: image avatar(44) · batch(130) · material(200) · kind(110) · received(100·right) · used(100·right) · remaining(100·right) · % used(110) · vendor(150) · value(100·right) · paid by(100) · action(100)
   - Filter row mirrors hub-table pattern: text inputs, MultiSelects, min/max ranges
   - Sortable: material, qty, used, remaining, %, amount

### Inventory Card anatomy

**Top: MaterialAvatar (140px tall)** — category-themed visual placeholder. CSS gradient + repeating pattern stand in for product photos:

| Category | Gradient | Pattern |
|---|---|---|
| Cement | #e2dfd6 → #a8a39a (gray) | horizontal lines 0/14/15px, rgba(0,0,0,.05) |
| Aggregates | #e6d4a8 → #b89a6b (tan) | dot grid 9px, rgba(0,0,0,.18) |
| Bricks | #d2745a → #9a3f25 (terracotta) | brick grid (vertical 24/25 + horizontal 12/13, rgba(0,0,0,.18)) |
| Steel | #6b7280 → #2d3540 (dark slate) | vertical stripes 6/7px, rgba(255,255,255,.08) |
| Timber | #b07a4a → #5d3a1c (brown) | wood grain (horizontal 4/5 + 28/30, rgba(0,0,0,.1/.18)) |
| Electrical | #4299e1 → #2b4d8c (blue) | dot grid 14px, rgba(255,255,255,.18) |

Plus a faint centered category initial (C, A, B, S, T, E) at 42% of tile height, opacity 0.35, weight 800. Material name as 10.5px mono watermark in bottom-left, opacity 0.55.

**Drop-in real photos when available** — `MAT_VISUAL[cat]` is the config object; swap for `<img src={mat.photoUrl}>` instead of the gradient div.

LOW badge (top-right, 9.5px white-on-red) when `remaining/received < 0.2`. EMPTY badge (rgba(15,23,42,.7) bg) when `remaining ≤ 0`.

**Card body:**
- Tags row: kind chip (group pink, own primary), advance/spot warn chips, batch ID mono right-aligned
- Title: material name 14px 700, spec 11.5px muted
- Big mono remaining: `<remaining> <unit> · of <received>` (30px 800, mono, letter-spacing -1, color: text-900 / warn / subtle by stock level)
- Stacked usage bar (8px tall, 4px radius) with per-site colors for group, single primary fill for own
- Legend below: site short + qty for each segment, "PAYER" tag on paying site (non-spot only)
- Footer (border-top hairline): vendor name + payer chip + amount on the left, "Log" / "Finalize" (for provisional spot group) / "Done" on the right

---

## Spot Purchase flow

### Entry path

The Hub "+ New entry" button opens a **NewEntryMenu** launcher modal (560px) presenting three equal-billing choices:

1. **Request material** — standard MR/PO flow (icon: receipt, primary tone, tag "Standard flow · 5 steps")
2. **Bought at shop** — spot purchase (icon: receipt, pink tone, **highlighted with pink border and NEW pill**, tag "Spot · post-facto · < 30 sec")
3. **Record delivery** — for arriving POs (icon: download, warn tone, tag "Receives an existing PO")

Each choice card: 14×16px padding, 12px radius, white bg, 1.5px border (accent for highlighted, neutral otherwise), 36×36px tinted icon box, title 14/700 + subtitle 11.5 muted + tag pill 10/700 + arrowRt at right.

### Spot Purchase form (680px modal)

**Header:** "Bought at shop · spot purchase" + sub "Record a small-quantity walk-in purchase you've already paid for from your wallet."

**Sections in order:**

1. **Snap a bill to auto-fill** — primary-soft hint banner with sparkle icon + "Snap" button (placeholder for future OCR — not wired in prototype)

2. **Where did you buy?** — VendorAutocomplete (vendor search with auto-create-as-draft for unknown shops). Filters M_VENDORS by name contains query; if no exact match, shows yellow "Will create new shop 'X' on submit" hint at bottom.

3. **Section + Buying for** (2-col grid)
   - Section: optional text input "Masonry, Slab…"
   - Buying for: ProtoRadioCards — Own (home icon) / Group (link icon)

4. **Provisional split** (conditional, when kind=group) — bg-tinted panel listing each cluster member site with a % input (right-aligned 64px, mono 12 700). Live total at bottom in success (=100), warn (≠100). Subtitle: "Total 100% / Will finalize later / Must total 100% (or 0% to defer)."

5. **Items · what did you buy?** — repeater (default 1 row, "+ Add another item" button at bottom). Each SpotItemRow:
   - Material search input with autocomplete (filters M_MATERIALS by name contains query); free-text triggers a yellow "Add 'X' as new material (draft)" option in the dropdown
   - 3-col grid (1fr/1fr/100px): Quantity (mono, suffix unit) · Paid rate (mono, ₹ prefix, "per {unit}" suffix) · Line total (right-aligned 18px 800 mono)
   - **Rate divergence hint** below Paid rate: if `lastRate` known and differs from `paidRate`, shows "last paid ₹X · ↑/↓ ₹Y" in warn (overpaying) or success (underpaying)
   - X button on right if more than 1 row (removes row)

6. **Receipts** (2-col grid, both optional, tap-to-toggle attached state)
   - Bill image — `TAP · PASTE · CAMERA` hint
   - Payment screenshot — "UPI / cash receipt" note
   - Attached state: success bg, check icon, "Attached" label
   - Unattached: dashed border, upload icon, label

7. **Totals + Payment** — dark panel (#0f172a):
   - Top: "TOTAL TO RECORD" uppercase 11/600 opacity 0.65, then ₹X mono 24 800
   - Top right: Cash / UPI radio buttons (active = white bg, dark text; inactive = transparent bg, faint border)
   - Wallet balance row: "Ajith's wallet now ₹4,820" mono 700, opacity-7 white-on-dark
   - Projected balance row: "After this spend ₹X (overdraft)" — bg flips to red rgba(239,68,68,.18) and value goes red (#fca5a5) when negative

**Footer (modal default):**
- Cancel + "Record · ₹{total}" primary button (disabled when invalid: no vendor or items or group split ≠ 100/0 or any item missing material/qty/rate)

**Submit dispatches** `RECORD_SPOT_PURCHASE` with payload `{ vendor, vendorName, vendorIsDraft, section, kind, paymentMode, bill, screenshot, items: [{material, name, qty, unit, paidRate, lastRate, lineTotal}], allocation: { kind: 'provisional', split: [...], dueBy: today + 7d } }`. The reducer creates a new thread `SP-XXXXXXXX` with `purchaseType: 'spot'`, `stage: 'in-use'`, `spotStage: 'provisional'` (if group) or `'bought'` (if own), and a synthetic inventory batch with the same id.

### Allocations queue (on Hub)

Yellow-bordered panel between KPI strip and filter chips. Header bell icon + "N batch(es) need(s) allocation" + sub-copy. Each row: batch id (mono subtle), material name + qty + spec, vendor name + ₹amount + current provisional split chips, age/consumed badge (warn-tinted if ≥ 7d old OR remaining = 0), warn-colored "Finalize" button.

### SpotAllocationModal

520px. Header: thread id + vendor + ₹amount. Yellow info panel describing provisional → final transition. Final % split inputs (same UI as the form's provisional split, but with ₹value per site computed live from `pct * amount / 100`). Total must equal 100% to enable Finalize button. Primary-soft footer hint: "Inter-site debt updates instantly. Each site's material-expense ledger picks up its share."

Submit dispatches `FINALIZE_SPOT_ALLOCATION` with `{ id, split }`. Reducer flips `spotStage` to `'finalized'`, writes `spot.allocation.kind = 'final'`, and computes `interSiteUsage = split.map(s => ({ site, used: received * pct/100, value: amount * pct/100 }))` so the inter-site netting math picks it up.

---

## Action modals (standard flow)

All share the **ProtoModal** chrome: full-screen scrim (rgba(15,23,42,.45) + 2px blur), centered card max-width by modal, 14px radius, header (16/22px padding, border-bottom) with title + sub + ×, scrollable body (18/22px padding), footer (14/22px padding, bg-tinted, justify-end) with danger left + secondary + primary right.

Form primitives (all defined in `proto-modals.jsx`):
- `ProtoField` — label (11/700 uppercase, letter-spacing 0.2) + Optional pill + sub copy + children
- `ProtoInput` — `<input>` wrapped in a flex container with optional leading + trailing suffix. mono prop swaps font family. 9/12px padding, 8px radius, 13px text
- `ProtoSelect` — native `<select>` with custom chevron bg image
- `ProtoRadioCards` — segmented choice rendered as cards: title + sub + optional icon. Active = primary border + primarySoft bg
- `ProtoToast` — fixed bottom 24px centered, slides in from below over 200ms, auto-dismisses after 2.6s

### Modals by trigger

| Trigger | Modal | Reducer action |
|---|---|---|
| `+ New entry` → "Request material" | `CreateRequestModal` | `CREATE_REQUEST` |
| Hub row, stage=requested → "Approve" | `ApproveModal` (Approve + Reject in danger slot) | `APPROVE_REQUEST` / `REJECT_REQUEST` |
| Hub row, stage=approved → "Create PO" | `CreatePOModal` (Own/Group, Advance, Vendor, Unit price, Expected, Payer) | `CREATE_PO` |
| Hub row, stage=ordered → "Record delivery" | `RecordDeliveryModal` (Qty, Quality, Notes) | `RECORD_DELIVERY` |
| Hub row, delivered + pending → "Settle vendor" | `SettleVendorModal` (Office / Wallet / Site funds) | `SETTLE_VENDOR` |
| Hub row, in-use → "Log usage" | `LogUsageModal` (stepper + group site picker + live debt preview) | `LOG_USAGE` |
| `+ New entry` → "Bought at shop" | `SpotPurchaseModal` | `RECORD_SPOT_PURCHASE` |
| Hub/Inventory spot row, provisional → "Finalize" | `SpotAllocationModal` | `FINALIZE_SPOT_ALLOCATION` |
| Inter-Site → "Net settle ₹X" | inline action | `NET_SETTLE_INTERSITE` |

---

## State management

Single React useReducer in `proto-app.jsx`. State shape:

```ts
{
  threads: Thread[],          // see Thread schema below
  view: 'hub' | 'intersite' | 'inventory',
  expandedId: string | null,
  modal: { kind: string, threadId?: string } | null,
  toast: { message: string, tone: 'success'|'danger'|'info' } | null,
  currentRole: 'admin' | 'engineer',  // not currently wired to UI gating
}
```

### Thread schema

```ts
type Thread = {
  // Identity
  id: string,                      // 'MR-YYMMDD-XXXX' or 'SP-XXXXXXXX'
  purchaseType?: 'spot',           // undefined = standard MR/PO
  site: SiteId,
  section: string,
  floor?: string,
  priority: 'normal'|'high',
  requestedBy: EngineerId,
  requestedAt: ISODateString,
  needBy?: ISODateString,
  note?: string,

  // Lifecycle
  stage: 'requested'|'approved'|'ordered'|'in-transit'|'delivered'|'settled'|'in-use'|'exhausted'|'rejected',
  kind: 'own'|'group',
  advance: boolean,

  // Material
  material: MaterialId,
  qty: number,
  unit: string,

  // After approval
  approvedBy?: string,
  approvedAt?: ISODateString,

  // After PO creation (standard flow only)
  po?: {
    id: string,
    vendor: VendorId,
    amount: number,
    qty: number,
    expected: ISODateString,
    status: 'ordered'|'partial'|'delivered',
    payer: SiteId,
    advance?: { totalPaid, batches: [{date, qty}], nextBatch },
  },

  // After delivery
  delivery?: {
    date: ISODateString,
    recordedBy: EngineerId,
    quality: 'good'|'fair'|'poor',
    notes?: string,
    receivedQty?: number,
  },

  // After settlement
  settlement?: {
    status: 'pending'|'settled',
    amount: number,
    paidBy: null | 'office' | 'wallet' | SiteId,
    settledAt?: ISODateString,
  },

  // Inventory after delivery
  inventory?: {
    batch: string,
    received: number,
    used: number,
    remaining: number,
  },

  // Group threads: per-site usage breakdown — drives inter-site debt math
  interSiteUsage?: [{ site: SiteId, used: number, value: number }],

  // Spot-purchase-only fields
  boughtAt?: ISODateString,
  spotStage?: 'bought'|'provisional'|'finalized',
  spot?: {
    vendor: string,           // slug
    vendorName: string,       // human-readable
    vendorIsDraft?: boolean,
    items: [{ material, name, qty, unit, paidRate, lastRate?, lineTotal }],
    paidBy: EngineerId,
    walletId: string,
    paymentMode: 'cash'|'upi',
    amount: number,
    bill: { attached: boolean, kind?: 'image' },
    screenshot: { attached: boolean, kind?: 'image' },
    allocation?: {            // group only
      kind: 'provisional'|'final',
      split: [{ site: SiteId, pct: number }],
      dueBy: ISODateString,
      finalizedAt?: ISODateString,
    },
    rateDiverged?: boolean,
  },
}
```

### Reducer actions (all in `proto-state.js`)

- `CREATE_REQUEST { payload }` — adds thread at stage=requested
- `APPROVE_REQUEST { id }` — stage → approved
- `REJECT_REQUEST { id, reason }` — stage → rejected
- `CREATE_PO { id, payload: { vendor, kind, advance, amount, expected, payer } }` — stage → ordered; for advance: settlement auto-set to settled
- `RECORD_DELIVERY { id, payload: { qty, quality, notes } }` — stage → delivered (or in-use if advance auto-settled); creates inventory batch; preserves settled-by-advance settlement; otherwise initializes pending settlement
- `SETTLE_VENDOR { id, by: 'office'|'wallet'|'site' }` — stage → in-use (for own); writes settlement.status = settled
- `LOG_USAGE { id, payload: { qty, bySite } }` — increments inventory.used, decrements remaining; for group: appends/updates interSiteUsage entry for bySite, computed at unit price (amount/received); flips stage to 'exhausted' when remaining ≤ 0
- `NET_SETTLE_INTERSITE { fromSite, toSite, amount }` — currently just toast (could be wired to clear interSiteUsage values in production)
- `RECORD_SPOT_PURCHASE { payload }` — creates SP-XXX thread, purchaseType=spot, stage=in-use, spotStage=provisional|bought
- `FINALIZE_SPOT_ALLOCATION { id, split }` — spotStage → finalized; writes interSiteUsage from split percentages
- `SET_VIEW { view }`, `SET_EXPANDED { id }`, `OPEN_MODAL { modal }`, `CLOSE_MODAL`, `CLEAR_TOAST`, `RESET`

---

## Next-action resolver (`M.nextAction(t)`)

The single function that decides what action a thread is waiting on. Drives the row's right-side button + the Inbox-style counts.

```js
nextAction(t) {
  // Spot purchases bypass MR/PO/Delivery/Settlement
  if (t.purchaseType === 'spot') {
    if (t.kind === 'group' && t.spotStage === 'provisional')
      return { who:'engineer', label:'Finalize split' };
    return null;
  }
  if (t.stage === 'requested')     return { who:'admin',    label:'Approve' };
  if (t.stage === 'approved')      return { who:'admin',    label:'Create PO' };
  if (t.stage === 'ordered')       return { who:'engineer', label:'Record delivery' };
  if (t.stage === 'delivered' && (!t.settlement || t.settlement.status === 'pending'))
                                    return { who:'office',  label:'Settle vendor' };
  if (t.stage === 'in-use')        return { who:'engineer', label:'Log usage' };
  return null;
}
```

---

## Design tokens

All in `utils.jsx` as the `T` object (export to your design tokens):

```js
T = {
  font: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',

  bg:        '#f5f7fa',          // page background (slate-50ish)
  card:      '#ffffff',          // surface
  text:      '#0f172a',          // slate-900
  muted:     '#64748b',          // slate-500
  subtle:    '#94a3b8',          // slate-400
  border:    '#e2e8f0',          // slate-200
  hairline:  '#f1f5f9',          // slate-100
  chip:      '#f1f5f9',

  primary:      '#2563eb',       // blue-600
  primarySoft:  '#eff6ff',       // blue-50
  primaryHover: '#1d4ed8',       // blue-700

  success:     '#10b981',        // emerald-500
  successSoft: '#ecfdf5',        // emerald-50

  warn:        '#f59e0b',        // amber-500
  warnSoft:    '#fffbeb',        // amber-50

  danger:      '#ef4444',        // red-500
  dangerSoft:  '#fef2f2',        // red-50

  pink:        '#ec4899',        // pink-500 — group cluster accent
  pinkSoft:    '#fdf2f8',        // pink-50
}
```

### Spacing

Predominantly 4-step (4 · 8 · 10 · 12 · 14 · 16 · 18 · 22 · 28). Cards 12px radius, modals 14px, buttons 8px (Btn primary 8, big actions 10–12). Hairlines 1px solid `border` / `hairline`.

### Typography scale

| Use | Size · Weight · Letter-spacing |
|---|---|
| h1 page title | 22px / 700 / -0.4 |
| Section heading | 14px / 700 |
| KPI value | 22–28px / 800 / mono / -0.6 |
| Body | 12–13px / 500–600 |
| Label uppercase | 11px / 700 / +0.2 |
| Subtle uppercase | 10–10.5px / 800 / +0.3–0.4 |
| Micro / sublabel | 10–11px / 600 / muted |

### Color usage per type

| Type | Accent | Soft bg |
|---|---|---|
| Own site (per-site) | primary blue | primarySoft |
| Group / cluster | pink | pinkSoft |
| Advance order | warn amber | warnSoft |
| Spot purchase | warn amber | warnSoft |
| High priority | danger red | dangerSoft |
| Settled | success | successSoft |

### Animations

```css
@keyframes matPulse {      /* center dot in current pipeline stage */
  0%,100% { transform: scale(1); opacity: 1; }
  50%     { transform: scale(0.6); opacity: 0.6; }
}
/* modals */
@keyframes protoSheetIn {
  from { opacity: 0; transform: translateY(8px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
/* toasts */
@keyframes protoToastIn {
  from { opacity: 0; transform: translateX(-50%) translateY(10px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}
```

### Icons

Single `<Icon name=… size=… color=… stroke=…/>` component in `utils.jsx`, 16×16 viewBox, stroke-based, no fill. Names used: `search, filter, sort, chevDn/Rt/Lt, plus, more, download, upload, check, x, info, arrowUp/Dn/Lt/Rt, calendar, expand, grid, list, eye, flag, sparkle, bell, user, link, trend, receipt, home, pencil`. Replace with your icon library equivalents.

---

## Responsive behavior

Single breakpoint at **820px**.

- **≥ 820** — desktop chrome: 232px sidebar, 56px top bar with site/phase pills + breadcrumb + date controls, multi-column grids
- **< 820** — mobile chrome: stacked header (site name + bell), tab strip at bottom (Hub · Inventory · Inter-site), thread rows stack vertically with horizontal pipeline flat-bar instead of full pipeline, KPI grid switches to 2×2

The hub Cards/Table toggle is desktop-only (mobile always uses Cards).

---

## What's intentionally NOT designed (open questions from spec)

1. **Bill OCR / AI ingestion** — prototype shows a "Snap a bill to auto-fill" CTA at the top of the Spot form but the actual capture pipeline isn't designed. If you wire this up, the form should still allow manual entry as fallback (per spec decision: ship manual happy path first).
2. **Office Drafts review queue** — the spot form creates draft vendors and materials (`is_draft=true`); the company-side review surface is not designed here. Add an obvious "Drafts (N)" filter chip on `/company/materials` and `/company/vendors`.
3. **Allocation queue at scale** — beyond 2 sites the 7-day nudge chip pattern doesn't scale. If a single supervisor owns 5+ sites, a dedicated allocations page (`/site/spot-purchase?tab=allocations`) with a calendar/due-date view is the right next step.
4. **Rate update prompt dialog** — per spec, after spot submit if any paid rate diverged from catalog rate, a separate prompt asks if the new rate should become the standard. This dialog is not in the prototype — wire it post-submit, listing only the diverged lines with a per-line "Update standard rate to ₹X?" checkbox.
5. **Receipt persistence in retrofitted dialogs** — per `2026-05-23-spot-purchase-verification-gaps.md`, `SettleViaWalletDialog`, `MaterialSettlementDialog`, and `MiscExpenseDialog` need their receipt URLs actually persisted. The prototype models the UI but the persistence wire-up is back-end work.

---

## Implementation order suggestion

1. **Material Hub thread row + filter chips + KPI strip** — biggest visual lift, replaces the existing 5 separate pages
2. **`M.nextAction()` resolver + action buttons + 6 standard modals** — wire to existing reducers / Supabase RPCs
3. **Pipeline visualization** — per-row mini timeline (replaces the global "Step N of 5" stage indicator)
4. **Inter-Site netting math panel** — straightforward refactor of the existing settlement page
5. **Table view** — additive, switchable from Cards
6. **Inventory page rebuild** — Cards view first, Table view second
7. **Spot Purchase flow** — NewEntryMenu + form + reducer/RPC + Allocations queue + SpotAllocationModal
8. **Mobile responsive** — single breakpoint, mostly layout reflow; the actions and flows are the same

---

## Assets

No image assets in the prototype — material visuals use category-themed CSS gradients + patterns + a faint centered initial as a stand-in for product photos. When real photos become available, replace `MaterialAvatar`'s gradient-rendered div with an `<img>` tag using the photo URL from your `materials` table.

No custom illustrations. Icons are inline SVG paths (16×16 viewBox) in `utils.jsx`'s `<Icon/>` component — swap for your icon library equivalents (Lucide / Phosphor / Heroicons all have direct matches for every name used).

Fonts: **Inter** (400/500/600/700/800) and **JetBrains Mono** (400/500/600) — both via Google Fonts in the prototype HTML.
