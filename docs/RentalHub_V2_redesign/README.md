# Handoff: Rental Hub Redesign (v2) — Aesta

## Overview

Redesign of the **Rentals** module in the Aesta construction management app — collapsing the existing 8-status taxonomy, scattered settlement surfaces, and 3 competing CTAs into one unified **Rental Hub** with the same design language as the Materials Hub redesign.

Each rental order is a single **row** on the Hub showing its lifecycle inline (5-stage pipeline), with a context-aware next-action button. Active orders display a **live cost meter** that ticks daily. Overdue orders flip red across pipeline + badges. Multi-party settlement (vendor + transport in + transport out + loading/unloading) is handled in one cohesive modal.

Includes a unified **"+ New rental"** form that folds "Historical Record" into the standard flow via a toggle — replacing the 3 separate CTAs in production. Historical mode supports backfilling rentals that already happened on site, with status set to "Still on site", "All returned", or "Fully settled".

## Ship plan — v1 + v2 in parallel

**Goal:** Ship v2 as an opt-in surface, run it alongside v1 until verified end-to-end, then remove v1.

**Suggested approach:**
1. Mount v2 at a sibling route — e.g. `/site/rentals/v2` (or a feature-flag-gated `/site/rentals` with a "Try the new Hub" link on v1).
2. Both surfaces hit the **same underlying tables / RPCs**. No schema change required for v2.
3. Add a banner on the v1 page: *"We're testing a redesigned Rental Hub — try v2 →"* with a link to the v2 route.
4. Once v2 is verified working through 1–2 real-site cycles (approve → confirm → active → return → settle), delete v1 components and reroute `/site/rentals` to the v2 entry.

**Component naming convention:** Prefix v2 components with `RentalsV2*` or place them in a `rentals/v2/` folder. This keeps the diff easy to review and the deletion clean.

## About the Design Files

The files in this bundle are **design references** built in HTML/React (JSX via Babel-standalone) — interactive prototypes showing the intended look and behavior. **Not production code to copy directly.**

The task is to recreate these designs in the existing Aesta codebase (React + TypeScript + Supabase) using the project's established patterns: existing component primitives, design tokens, RLS-aware data hooks, and the schema already in `supabase/migrations/`. The prototype's state shape is illustrative — production data model is authoritative.

The prototype runs entirely client-side with in-memory state. Production should hit your existing tables (`rental_orders`, `rental_order_items`, `rental_returns`, `rental_settlements`, `rental_advances`, etc.) and reuse RPCs you already have.

## Fidelity

**High-fidelity.** Layouts, type, color, spacing, density, and interaction states are intentional. Recreate pixel-faithfully using the codebase's existing UI primitives — don't copy inline styles from the prototype, but match what they render visually.

## Files

The prototype HTML entry point is **`Rentals Prototype.html`**. It loads:

| File | Purpose |
|---|---|
| `rentals-data.js` | Seed data — sites, vendors, items catalog, helpers (R object), 5-stage pipeline mapping |
| `rentals-state.js` | useReducer + initial state + counts/totals helpers |
| `utils.jsx` | Tokens (T), formatters (inr/inrK/fmtDate), Icon, primitives (Btn/Badge/Card) — **shared with the Materials prototype** |
| `proto-modals.jsx` | ProtoModal / ProtoField / ProtoInput / ProtoSelect / ProtoRadioCards / ProtoToast / Row — **shared with the Materials prototype** |
| `rentals-modals.jsx` | Rental-specific modals: CreateRental (with Historical mode), Approve, VerifyDelivery, RecordReturn, AddAdvance, SettleRental, ExtendDate |
| `rentals-screens.jsx` | RentalHub, RentalRow, RentalPipeline, RentalKpis, RentalActionQueue, RentalTable, FilterChip |
| `rentals-app.jsx` | Root component, sidebar, top bar, modal router, responsive shell |

The Materials prototype (in this same project) reuses `utils.jsx` and `proto-modals.jsx`. **Keep the same primitives in production** — that's how the two surfaces stay visually consistent.

## Information architecture

### Where it lives

```
Site
 ├── Dashboard
 ├── Workforce
 ├── Materials              (already v2 redesigned)
 │    ├── Hub
 │    ├── Inter-site
 │    └── Inventory
 ├── Rentals                ← sibling to Materials, NOT nested under it
 │    ├── Hub               (active + pending + completed all in one)
 │    ├── On site           (what's physically here — rental equivalent of Inventory)
 │    └── History           (settled + cancelled)
 └── …
```

Recommendation: Keep Materials and Rentals as **top-level siblings**. Don't merge them into one page or one umbrella section. They share the design language and primitives, but the user mental model is different (consumable stock vs accruing-cost rentals).

### Why not nested

Rentals and Materials share lifecycle skeleton (request → approval → vendor → delivery → use → settle) but differ in fundamental ways: cost model (fixed vs daily-accruing), time pressure (need-by vs overdue-daily-cost), inventory shape (stock-count vs state-machine-per-unit), settlement (single vendor vs multi-party). Forcing them into one surface would make both worse.

---

## Screen 1 — Rental Hub

### Purpose

Replaces the scattered surfaces in v1 (separate request page, separate active orders page, separate settlement page, separate history). One row per order, full lifecycle inline.

### Layout (1440w default)

```
┌─Sidebar(232)─┬─TopBar(56)──────────────────────────────────────────┐
│ Aesta        │  Srinivasan House & Shop                            │
│ Site|Company │  Rentals / Hub                          [date]      │
│ ─────────    ├─────────────────────────────────────────────────────┤
│ Dashboard    │  Rental Hub  · 7 orders         [Cards|Table] [+]   │
│ Materials    │  Equipment, scaffolding, centring — request → settle│
│ ▼ Rentals    │                                                      │
│   • Hub      │  ┌─KPI─┬─KPI─┬─KPI─┬─KPI─┐                           │
│   • On site  │  │needs│active│balnc│accrd│   (4 tiles)              │
│   • History  │  │ 5   │ 4    │1.8L │54k  │                          │
│ Contracts    │  └─────┴─────┴─────┴─────┘                           │
│ Settings     │                                                      │
│              │  [⚠ N orders overdue]   (red action panel)           │
│              │  [⚠ M returns to settle](yellow action panel)        │
│              │                                                      │
│              │  [Active 5] [Needs action 5] [Overdue 1] …           │
│              │                                                      │
│              │  ┌──────────────────────────────────────────────┐   │
│              │  │ RO-XXX · OVERDUE 3d · GROUP                   │   │
│              │  │ Sri Scaffolding Works                         │   │
│              │  │ 60 10ft scaffold · 30 8ft scaffold            │   │
│              │  │ External plaster · 20d elapsed                │   │
│              │  │ [Request·Confirm·Active·Return·Settle]        │   │
│              │  │ ₹78,200 LIVE · +₹2,880/day · adv ₹15,000      │   │
│              │  │                              [Record return →]│   │
│              │  └───────────────────────────────────────────────┘   │
└──────────────┴─────────────────────────────────────────────────────┘
```

### KPI strip (top, 4 cards)

Each: 3px-wide accent left band, 22×22 soft-tinted icon box, 11px label, 22px/800 mono value, 11px muted sub.

| KPI | Tone | Source |
|---|---|---|
| Needs action | warn (#f59e0b) | `counts.needsAction` (pending + to-return + to-settle) |
| Active orders | primary, flips danger if any overdue | `counts.active` |
| Balance due | pink (#ec4899) | `totals.balance` |
| Accrued · live | primary (#2563eb) | `totals.accrued` on active orders right now |

### Action queue panels (conditional)

Shows only when work is pending. Two stacked panels, top-of-hub:

**Red panel — N orders overdue**
- Header: red bell + "N order(s) is/are overdue" + sub "Each extra day adds to the bill. Either record return or extend the date."
- Each row: order id (mono subtle), vendor + items summary, "Xd overdue · Yd total" red pill, **Return** (danger) + **Extend** (secondary) buttons

**Yellow panel — N returns ready to settle**
- Header: yellow receipt + "N return(s) ready to settle" + sub "Equipment back. Settle the vendor (negotiate if you can) + any transport."
- Each row: order id, vendor + items summary, "Vendor: ₹X accrued · advance ₹Y" sub, **Settle** (warn) button

These panels deep-link to the right modal (RecordReturn, ExtendDate, SettleRental).

### Filter chips

Single-select chips. Default: **Active**. Order: Active · Needs action · Overdue · To settle · History · All.

- **Active** intentionally bundles pending + confirmed + active + partially_returned so the engineer sees everything they're tracking right now
- **Needs action** = `R.nextAction(o) != null`
- **Overdue** = active/partially_returned where `expectedEnd < today`
- **To settle** = status === 'completed'
- **History** = settled + cancelled
- **All** = no filter

### Thread row (Cards layout)

**Grid:** `4px · 1.6fr · 2fr · 1.4fr · 170px` (5 columns, 14px gap, 16/18px padding).

1. **4px color band** (left, full-height):
   - Settled → success (#10b981)
   - Overdue → danger (#ef4444)
   - Completed → warn (#f59e0b)
   - Group → pink (#ec4899)
   - Otherwise → primary (#2563eb)
2. **Vendor + items block:**
   - Top: `RO-XXXXXX` mono subtle + GROUP badge (pink dot) + OVERDUE 3d badge (danger) + Hourly badge (warn dot, if any line is hourly)
   - Title: vendor name (14/700, ellipsis at maxWidth)
   - Items summary: `60 Scaffolding bay 10 ft · 30 Scaffolding bay 8 ft` (11.5/muted, truncated)
   - Subline: `<section> · <Nd elapsed> · due <date>` (11/subtle)
3. **Pipeline** — see below (5 stages)
4. **Money / cost meter block** — context-aware, see below
5. **Next action button:**
   - Status → action label mapping:
     - pending → "Approve"
     - approved/draft → "Confirm PO"
     - confirmed → "Verify delivery"
     - active/partially_returned → "Record return"
     - completed → "Settle vendor"
     - settled/cancelled → success "All clear" chip
   - Color: matches the band's accent (danger if overdue, warn if completed, primary otherwise)

### Pipeline (5 stages)

`Request · Confirm · Active · Returned · Settled`

The production app uses 8 internal statuses; map them to 5 visible stages:

| Internal status | Visible stage |
|---|---|
| pending, approved, draft | **Request** |
| confirmed | **Confirm** |
| active, partially_returned | **Active** |
| completed | **Returned** |
| settled | **Settled** |
| cancelled | Not in pipeline — handled separately (filter into History; row shows muted) |

Visual treatment:
- Done past stages: solid text-900 circle with white check
- Current stage: primary-color circle with white pulsing center dot, ring shadow `0 0 0 4px primarySoft`
- Future stages: white with `border: 2px solid border-200`
- **Overdue:** the current stage circle + the just-passed line both flip to **danger red** (and the OVERDUE Nd badge appears in the tags row)
- Cancelled: all 5 dots muted gray, no current stage

Connecting line: 2px height, text-900 if reached, hairline if not. 14px min-width per gap.

Stage label below each circle: 9px uppercase, current = primary 700 weight.

### Money / cost meter block

Four states based on order status:

**Active (live cost meter):**
```
₹XX,XXX  [● LIVE]    ← pulsing warn pill
+₹Y,YYY/day · advance ₹Z,ZZZ
```
- Big value (13.5/700/mono) = `R.accruedCost(o)` = sum over lines of `dailyRate × qty × daysElapsed` (or `hourlyRate × hoursLogged` for hourly lines)
- LIVE badge has a pulsing center dot (matPulse animation, same as pipeline)
- Sub: `+₹{dailyAccrual}/day · advance ₹{totalAdvances}` (11/muted)

**Completed:**
```
₹XX,XXX
Accrued · advance ₹Y,YYY
Balance ~₹Z,ZZZ after negotiation
```

**Settled:**
```
₹XX,XXX
Settled · saved ₹620
```
- "saved" = `vendor.savings = gross - negotiated - advance` (success color)

**Pending / Confirmed (cost meter not started):**
```
—
Cost meter starts on delivery
```

### Table layout (alternative view, desktop only)

Toggle in top-right (Cards / Table segmented). Mobile always Cards.

**Columns:** Order# (sort) · Stage (sort) · Vendor (sort) · Items · Due (sort) · Accrued (sort, right) · Balance (sort, right) · action.

Stage column: compact pill (uppercase 10.5px), color-coded by stage. Overdue overrides to "Overdue Nd" in danger pill.

Default sort: `reqDate` desc.

---

## Modals · all flows

All use the shared **ProtoModal** chrome. Same as Materials prototype:
- Scrim: rgba(15,23,42,.45) + 2px blur
- Card: white, 14px radius, max-width per modal
- Header: 16/22px padding, border-bottom, title (16/700) + sub (12 muted) + × button
- Body: scrollable, 18/22px padding
- Footer: 14/22px padding, bg-tinted, justify-end. Danger button slot is left-justified (separator).

### CreateRentalModal — unified create + historical

**The biggest UX win in v2.** Replaces 3 separate CTAs in production (New Request / Historical Record / New Rental) with one form that has a toggle at the top.

#### Historical mode toggle (first decision)

```
☐ Already happened? Record as historical
   Work was done on site before opening the app. You're backfilling now.
```

Default: OFF. When ON:
- Bg flips to warnSoft, border to warn
- "BACKFILL" badge appears top-right of the row
- A new "Status when recorded" radio appears below: *Still on site* / *All returned* / *Fully settled*
- Date field labels swap: "Pickup date" → "Actual pickup", "Expected return" → "Actual return"
- Both date fields become required (vs Expected return optional in forward mode)
- Items are pre-marked `qtyReturned = qty` when status is completed/settled
- Submit auto-creates a settlement record when status is "Fully settled" (status: 'settled', mode: cash, payer: site, ref: `RSET-XXX-001`)
- Toast: "Historical rental RO-XXX recorded" instead of "requested"

#### Form fields (in order)

1. **Historical mode toggle** (above)
2. **Status when recorded** (visible only when historical)
3. **Vendor** (Select — `R_VENDORS` map to options with name + kind + rating)
4. **Section · Pickup · Return** (3-col grid, all in one row)
5. **Exclude start date from billing** (checkbox with explainer for centring-materials convention)
6. **Items repeater** (line rows with item picker, variant dropdown if item has variants, qty + rate + rate-type pill)
7. **Transport · who handles it** (RadioCards: Vendor / Company / On-site)
8. **Transport cost panel** (visible when transport is not vendor-bundled): Transport / Loading / Unloading — each as ₹ inputs in a 3-col mini-grid
9. **Discount %** + **Notes** (120px + 1fr 2-col)
10. **Totals block** (showing breakdown: `Items ₹X · transport ₹Y · −Z% discount ₹W`)

#### Submit payload (production should map to your RPC)

```ts
{
  vendor: string,
  section: string,
  expectedStart: ISODateString,
  expectedEnd?: ISODateString,
  isHistorical?: boolean,
  status?: 'pending' | 'active' | 'completed' | 'settled',
  actualStart?: ISODateString,    // historical only
  actualEnd?: ISODateString,      // historical only
  excludeStartDate?: boolean,
  transportIn: { by: 'vendor' | 'company' | 'laborer', cost: number },
  loadingCost?: number,
  unloadingCost?: number,
  discountPct?: number,
  notes?: string,
  items: [{
    item: string,                  // item id from catalog
    variant: string | null,        // variant id if applicable
    qty: number,
    rateType: 'hourly' | 'daily',
    dailyRate?: number,
    hourlyRate?: number,
    qtyReturned: number,
    sizeLabelSnapshot?: string,    // snapshot for historical accuracy
  }],
}
```

### ApproveRentalModal

`520px`. Shows the order summary in a `bg`-tinted block (vendor + phone, section, items list with rate per day/hr, window, note). Two actions: **Approve · Confirm PO** (primary) + **Reject** (danger left slot).

Submit dispatches `APPROVE_ORDER { id }` → flips status to `confirmed` and writes `approvedBy: 'admin', approvedAt: today`.

### VerifyDeliveryModal

`460px`. Warning panel at top: *"Cost meter starts ticking from today. Make sure the equipment is on site and counted before confirming."* Then items list (read-only). Single action: **Mark active · start cost meter** (primary).

Submit dispatches `VERIFY_DELIVERY { id }` → flips status to `active`, writes `actualStart: today`.

### RecordReturnModal

`580px`. Lists outstanding lines only (lines where `qty > qtyReturned`). For each outstanding line:
- Header: `<item name> · <variant label if any>` + `<Nx units> still on site` sub
- 2-col grid (140px + 1fr):
  - **Returning** qty input, clamped to `[0, max]`
  - **Condition** RadioCards: Good / Damaged / Lost

Submit dispatches `RECORD_RETURN { id, payload: { items: [...], date } }`. Reducer increments each line's `qtyReturned`, appends to `returns[]`, and:
- If all lines fully returned → status: `completed`, `actualEnd: today`, auto-creates pending vendor settlement (and pending transport-out settlement if transport.out cost > 0 and by !== vendor)
- Otherwise → status: `partially_returned`

### AddAdvanceModal

`480px`. Two-col grid: Amount (₹ mono) + Mode (cash/upi/bank). RadioCards for payer source: Office / Site / Wallet. Optional Note.

Submit dispatches `ADD_ADVANCE { id, payload: { date, amount, mode, payer, note } }`. Appends to `o.advances[]`.

### SettleRentalModal

`620px`. **The most complex modal — multi-party settlement.**

Three party sections, top to bottom:

**1. Vendor section** (always present)
- Header: "Vendor" primary pill + vendor name
- Card with:
  - 2-col grid: Accrued cost stat / Advances paid stat
  - 2-col grid: Gross bill input / Negotiated final input
  - Savings hint (success-tinted): "You bargained down ₹X from accrued" — appears only when negotiated < gross
  - 2-col grid: Payment mode select / Payer source select

**2. Transport section** (conditional, when `transportIn` or `transportOut` is still pending)
- Header: "Transport" warn pill + "Still pending — settle separately after vendor" sub
- warnSoft-tinted card with rows:
  - Each pending transport row: icon + "Transport inbound/outbound" + sub + inline **Settle ₹X** button
  - Settle button dispatches `SETTLE_TRANSPORT { id, payload: { which, amount, mode, payer } }`

Primary action: **Settle vendor · ₹{negotiated}** (only settles vendor, not transports). Transports settle independently via their inline buttons.

Submit dispatches `SETTLE_VENDOR { id, payload: { gross, advance, negotiated, mode, payer } }`. Reducer:
- Writes `o.settlements.vendor = { status: 'settled', gross, advance, negotiated, savings, mode, payer, settledAt: today, ref: 'RSET-XXX-NNN' }`
- If all transport rows also settled → flips order status to `settled`

### ExtendDateModal

`420px`. Single date input + info panel. Submit dispatches `EXTEND_DATE { id, newDate }`.

---

## State management

Single `React.useReducer` in `rentals-app.jsx`. State shape:

```ts
{
  orders: RentalOrder[],
  view: 'hub',                            // (future: 'on-site', 'history')
  expandedId: string | null,
  modal: { kind: string, orderId?: string } | null,
  toast: { message: string, tone: 'success'|'danger'|'info' } | null,
}
```

### RentalOrder schema

```ts
type RentalOrder = {
  id: string,                             // 'RO-YYMMDD-XXX'
  site: SiteId,
  section: string,
  status: 'pending'|'approved'|'draft'|'confirmed'|'active'|'partially_returned'
        | 'completed'|'settled'|'cancelled',
  kind: 'own'|'group',
  requestedBy: EngineerId,
  requestedAt: ISODateString,
  approvedBy?: string,
  approvedAt?: ISODateString,
  rejectedReason?: string,
  isHistorical?: boolean,

  vendor: VendorId,
  notes?: string,

  // Dates
  expectedStart: ISODateString,
  expectedEnd?: ISODateString,
  actualStart?: ISODateString,
  actualEnd?: ISODateString,
  excludeStartDate?: boolean,             // Indian rental convention

  // Items
  items: [{
    item: ItemId,                         // catalog id
    variant: string | null,
    qty: number,                          // requested
    qtyReturned: number,
    rateType: 'daily'|'hourly',
    dailyRate?: number,                   // for daily
    hourlyRate?: number,                  // for hourly
    hoursLogged?: number,                 // hourly only
    sizeLabelSnapshot?: string,           // snapshotted variant label
    sku?: string,                         // unit-level tracking
  }],

  // Transport
  transportIn: { by: 'vendor'|'company'|'laborer', cost: number },
  transportOut?: { by: 'vendor'|'company'|'laborer', cost: number },
  loadingCost?: number,
  unloadingCost?: number,
  discountPct?: number,

  // Mutations
  returns?: [{ date: ISODateString, items: [{ item, variant, qty, condition: 'good'|'damaged'|'lost', damageCost? }] }],
  advances?: [{ date, amount, mode, payer, note? }],

  // Settlement (multi-party)
  settlements?: {
    vendor?: {
      status: 'pending'|'settled',
      ref?: string,                       // RSET-XXX-001
      gross: number,
      advance: number,
      negotiated: number,
      savings: number,
      mode?: 'cash'|'upi'|'bank',
      payer?: 'office'|'site'|`wallet:${string}`,
      settledAt?: ISODateString,
      receipts?: { bill: boolean, payment: boolean },
    },
    transportIn?: {
      status: 'pending'|'settled',
      ref?: string,
      amount: number,
      mode?, payer?, settledAt?,
      receipts?,
    },
    transportOut?: { /* same shape as transportIn */ },
  },
}
```

### Reducer actions (all in `rentals-state.js`)

| Action | Payload | Effect |
|---|---|---|
| `CREATE_ORDER` | `{ ...orderFields, isHistorical?, status? }` | Adds at top of `orders[]`. For historical settled, auto-creates settlement records. |
| `APPROVE_ORDER` | `{ id }` | status → confirmed |
| `REJECT_ORDER` | `{ id, reason }` | status → cancelled |
| `VERIFY_DELIVERY` | `{ id }` | status → active, writes actualStart |
| `RECORD_RETURN` | `{ id, payload: { items, date } }` | Increments qtyReturned per line, appends to returns[]. If fully returned → completed. |
| `ADD_ADVANCE` | `{ id, payload }` | Appends to advances[] |
| `SETTLE_VENDOR` | `{ id, payload: { gross, advance, negotiated, mode, payer } }` | Writes vendor settlement. If all transport also settled → status: settled. |
| `SETTLE_TRANSPORT` | `{ id, payload: { which: 'in'\|'out', amount, mode, payer } }` | Writes transport settlement. Flips order to settled if everything done. |
| `EXTEND_DATE` | `{ id, newDate }` | Updates expectedEnd |
| `SET_VIEW` | `{ view }` | View switch |
| `SET_EXPANDED` | `{ id }` | Toggles row expansion |
| `OPEN_MODAL` / `CLOSE_MODAL` | `{ modal }` | Modal stack |
| `CLEAR_TOAST` | — | Hides toast |
| `RESET` | — | Re-seeds |

---

## Next-action resolver (`R.nextAction(o)`)

```js
nextAction(o) {
  if (o.status === 'pending')              return { who:'admin',    label:'Approve' };
  if (o.status === 'approved' || o.status === 'draft') return { who:'admin', label:'Confirm PO' };
  if (o.status === 'confirmed')            return { who:'engineer', label:'Verify delivery' };
  if (['active','partially_returned'].includes(o.status))
                                            return { who:'engineer', label:'Record return' };
  if (o.status === 'completed') {
    const s = o.settlements || {};
    if (!s.vendor || s.vendor.status === 'pending')           return { who:'office', label:'Settle vendor' };
    if (s.transportIn  && s.transportIn.status  === 'pending') return { who:'office', label:'Settle transport in' };
    if (s.transportOut && s.transportOut.status === 'pending') return { who:'office', label:'Settle transport out' };
  }
  return null;
}
```

This is the single function that drives the row's right-side button + the action-queue panels. Keep it pure; centralize the lifecycle logic here.

---

## Live cost meter math (`R.accruedCost(o)`)

```js
accruedCost: (o) => {
  if (!o.actualStart) return 0;
  const days = R.daysElapsed(o);
  return o.items.reduce((a, ln) => {
    if (ln.rateType === 'hourly') return a + ln.hourlyRate * (ln.hoursLogged || 0);
    const totalQty = ln.qty;
    const returnedQty = ln.qtyReturned || 0;
    // Simplified: full qty × full days. Production should taper using
    // per-return events (each return shrinks the chargeable qty from that
    // date onward).
    const effectiveQty = (o.status === 'partially_returned')
      ? ((totalQty + (totalQty - returnedQty)) / 2)  // avg approximation
      : totalQty;
    return a + (ln.dailyRate * effectiveQty * days);
  }, 0);
},

daysElapsed: (o) => {
  const start = new Date(o.actualStart).getTime();
  const end = o.actualEnd ? new Date(o.actualEnd).getTime() : Date.now();
  let days = Math.max(0, Math.floor((end - start) / (24*60*60*1000)) + 1);
  if (o.excludeStartDate && days > 0) days -= 1;
  return days;
},

isOverdue: (o) => {
  if (!['active','partially_returned'].includes(o.status)) return false;
  return new Date(o.expectedEnd).getTime() < Date.now();
},
```

**Production note:** The prototype uses today-date math. In your app, compute `daysElapsed` server-side (or via a single shared utility) so the meter is consistent across surfaces. The prototype's averaging approximation for `partially_returned` should be replaced with proper event-based tapering — sum `(qty_at_that_period × period_days)` across each return event.

---

## Design tokens

Identical to the Materials prototype. All defined in `utils.jsx` `T`:

```js
T = {
  font: '"Inter", system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',

  bg:        '#f5f7fa',           card:    '#ffffff',
  text:      '#0f172a',           muted:   '#64748b',
  subtle:    '#94a3b8',           border:  '#e2e8f0',
  hairline:  '#f1f5f9',           chip:    '#f1f5f9',

  primary:     '#2563eb',         primarySoft: '#eff6ff',
  success:     '#10b981',         successSoft: '#ecfdf5',
  warn:        '#f59e0b',         warnSoft:    '#fffbeb',
  danger:      '#ef4444',         dangerSoft:  '#fef2f2',
  pink:        '#ec4899',         pinkSoft:    '#fdf2f8',
}
```

### Color usage in rentals

| State | Accent |
|---|---|
| Pending / Confirmed / Active (normal) | primary (#2563eb) |
| Overdue | danger (#ef4444) |
| Completed (returns done, awaiting settle) | warn (#f59e0b) |
| Settled | success (#10b981) |
| Group cluster | pink (#ec4899) |
| Cancelled | muted gray |
| Hourly rate badge | warn |

### Animations

```css
@keyframes matPulse {       /* pipeline current dot + LIVE badge dot */
  0%,100% { transform: scale(1); opacity: 1; }
  50%     { transform: scale(0.6); opacity: 0.6; }
}
@keyframes protoSheetIn { /* modals */ }
@keyframes protoToastIn { /* toasts */ }
```

---

## Responsive behavior

Single breakpoint at **820px**, matches Materials.

- **≥ 820** — Desktop: 232px sidebar, 56px top bar with site pill + breadcrumb + date controls, multi-column thread row grids
- **< 820** — Mobile: stacked header (site name + bell), thread rows stack vertically with flat-bar pipeline indicator instead of full pipeline, KPI grid 2×2

Cards ↔ Table toggle is desktop-only (mobile always Cards).

---

## What's intentionally NOT in this prototype

1. **"On site" / "History" sub-pages** — sidebar shows them; only Hub is built in this prototype. On-site = filter on `['active','partially_returned']` rendered as a warehouse-style card grid (mirror the Materials Inventory page). History = filter on `['settled','cancelled']` rendered as a flat table.
2. **Damage cost capture in returns** — schema includes `damageCost` per return item but the modal doesn't yet collect it. Add a "Damage charge ₹" field next to Condition when condition is `damaged` or `lost`.
3. **Receipt thumbnails** — settlement records track `receipts: { bill, payment }` booleans; production should hook to your existing receipt-upload primitives (probably already used in the materials surface).
4. **Per-return-event cost tapering** — see "Production note" under cost-meter math.
5. **Group rentals' inter-site allocation** — if rentals can be shared across cluster sites (e.g. JCB for 2 sites), the same `interSiteUsage` shape from Materials applies. Not built here; revisit when group rentals become a real use case.
6. **Bulk approve / bulk settle** — single-action only in this version. Add later if office reports needing it.

---

## Implementation order suggestion

1. **RentalHub thread row + filter chips + KPI strip** — biggest visual lift, replaces multiple v1 pages
2. **`R.nextAction()` resolver + action buttons + ApproveRental + VerifyDelivery + RecordReturn modals**
3. **5-stage pipeline visualization** — direct port of the materials pipeline component
4. **Live cost meter logic** — `R.accruedCost`, `R.daysElapsed`, `R.isOverdue`, `R.balanceDue`
5. **CreateRentalModal with Historical mode toggle** — biggest UX win, replaces 3 separate CTAs
6. **SettleRentalModal multi-party flow** — vendor section + transport rows
7. **Action queue panels** (overdue + to-settle)
8. **Table view** — additive, switchable from Cards
9. **Mobile responsive**

The first 4 are enough to replace v1 functionally. Items 5–9 are polish/parity that you can ship incrementally.

---

## Open IA decisions (decide before shipping)

- **`/site/rentals/v2` vs feature-flag-gated `/site/rentals`?** Recommend the explicit `/v2` route during testing — easier to discover, easier to roll back, easier to A/B between users.
- **Where does "On site" live?** Sidebar shows it as a sub-page under Rentals. Could also fold it into the Hub as a "currently on site" filter chip. Recommend keeping as separate page — different mental model (browsing physical inventory vs managing orders).
- **History page or just a Hub filter?** Hub's "History" filter chip handles it functionally. A dedicated History page makes sense once volume is high enough to want per-month grouping + export. Defer until then.
- **Group rentals as first-class?** Materials has a clear group story (cluster purchasing for cost). Rentals less obvious — confirm with users whether shared JCBs/etc actually happen across sites in your customer base. If yes, port the inter-site netting math directly.

---

## Reference: shared with Materials

If you implemented the Materials v2 redesign already, you already have:
- `utils.jsx` — tokens (T), Icon, primitives — reuse directly
- `proto-modals.jsx` — ProtoModal, ProtoField, ProtoInput, etc. — reuse directly
- The 5-stage pipeline pattern — direct port with different stage labels + overdue color flip
- The KPI strip + action queue panels — direct port
- The Cards / Table toggle — direct port

Keep these as a shared `materials-shared/` or `procurement-shared/` package so the two surfaces stay in sync. When you tweak the Btn or Badge component, both surfaces inherit.
