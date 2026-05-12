# Material Request Journey View — Design Spec

**Date:** 2026-05-12
**Status:** Approved, ready for implementation

---

## Context

Currently, tracking a single material request from creation to final expense requires navigating across at least 5 separate pages: Material Requests, Purchase Orders, Delivery Verification, Inter-Site Settlement, and Material Expenses. For group POs shared across multiple sites, the journey is even more fragmented — the user must cross-reference settlements, batch usage records, and per-site expenses manually. This creates significant cognitive load for both site engineers doing day-to-day follow-up and company owners doing financial audits.

**Goal:** Provide a single "journey view" that shows the complete lifecycle of any material request — from approval through PO, delivery, vendor payment, inter-site settlement, and final expense booking — in one place, with contextual deep-link buttons to take action on any step without losing context.

---

## Scope

### In scope
- Journey view for any single material request (own-site or group stock)
- Two containers: right-side drawer (fast access) and dedicated full page (deep audit)
- 6-phase timeline for group POs: Request → PO → Delivery → Vendor Payment → Inter-Site Settlement → Expense
- 5-phase timeline for own-site POs: same but with the Inter-Site Settlement phase omitted from the bar and cards
- Group PO site-split section showing all sites, allocations, and settlement status
- Blocker banners explaining why a phase is gated
- Read-only view with deep-link action buttons per phase
- Accessible from the Material Requests list page (`/site/material-requests`)

### Out of scope
- Inline editing of any data (all edits happen on target pages via deep links)
- Journey view for purchase orders directly (entry point is always the request)
- Bulk journey view for multiple requests
- Notification/alert system based on journey state (separate feature)

---

## Architecture

### Entry Points

**1. Drawer (primary — fast access)**
- Triggered by clicking any row in the material requests list
- Uses the existing `InspectPane` pattern already established in the app
- Keeps the list visible on the left; journey slides in from the right
- Has an "⤢ Full Page" button in the top-right corner

**2. Full Page (deep audit)**
- Route: `/site/material-requests/[requestId]`
- Navigated to via the "⤢ Full Page" button in the drawer, or direct URL
- Renders the same `MaterialRequestJourney` component with more horizontal space
- Shareable URL — company owner can paste a link to a specific request journey

Both containers share a single `MaterialRequestJourney` component. The drawer wraps it in the inspect pane shell; the full page wraps it in the standard page layout.

### New Component Tree

```
MaterialRequestJourneyDrawer          ← thin wrapper, uses InspectPane
MaterialRequestJourneyPage            ← /site/material-requests/[requestId]
  └─ MaterialRequestJourney           ← core component (shared)
       ├─ JourneyHeader               ← request ID, status badge, Full Page button
       ├─ JourneyStatusStrip          ← vendor, brand, total, vendor paid status
       ├─ JourneyPhaseBar             ← 5-step (own-site) or 6-step (group stock) progress indicator
       ├─ JourneyPhaseCard            ← reusable per-phase card (x6 instances)
       ├─ JourneyBlockerBanner        ← explains why a phase is blocked
       ├─ JourneyGroupSiteSplit       ← site allocation table (group POs only)
       └─ JourneyExpenseSection       ← final expense per site
```

### New Data Hook

**`useRequestJourney(requestId: string)`** — single hook that fetches all journey data in parallel:

| Data | Source |
|------|--------|
| Material request + items | `material_requests` + `material_request_items` |
| Purchase order + items | via `material_requests.converted_to_po_id` → `purchase_orders` |
| Delivery (GRN) | `deliveries` WHERE `po_id` |
| Material purchase expense | `material_purchase_expenses` WHERE `purchase_order_id` |
| Batch usage records | `batch_usage_records` WHERE `batch_ref_code` |
| Inter-site settlement | `inter_site_material_settlements` WHERE settlement_items reference the batch |
| Settlement payments | `inter_site_settlement_payments` WHERE `settlement_id` |

The hook returns a `RequestJourney` object containing all phases with their status. It handles the case where phases don't exist yet (PO not created, delivery not recorded, etc.) by returning `null` for those phases.

---

## Phase Cards — Detail

### Phase 1: Request
**Status logic:** `draft` → `pending` → `approved` / `rejected`

| Field | Value |
|-------|-------|
| Request number | `request_number` |
| Priority | `priority` (High = red, Normal, Low, Urgent) |
| Qty requested | `requested_qty` on items |
| Qty approved | `approved_qty` on items |
| Approved by | `approved_by` → user name |
| Approved at | `approved_at` |
| Est. cost | sum of `estimated_cost` on items |

**Action buttons:** → Open Request

---

### Phase 2: Purchase Order
**Status logic:** follows PO status (`draft` → `ordered` → `delivered`)

| Field | Value |
|-------|-------|
| PO number | `po_number` |
| Vendor | vendor name |
| Brand | brand name on PO items |
| Qty ordered | sum of `quantity` on PO items |
| Unit price | `unit_price` on PO item |
| Total amount | `total_amount` |
| PO type badge | "GROUP STOCK" or "OWN SITE" |
| Expected delivery | `expected_delivery_date` |

**Action buttons:** → Open PO, → View Vendor

---

### Phase 3: Delivery
**Status logic:** delivery exists + `verification_status` = `pending` / `verified` / `disputed`

| Field | Value |
|-------|-------|
| GRN number | `grn_number` |
| Delivery date | `delivery_date` |
| Received by | `recorded_by` → user name |
| Ordered qty | `ordered_qty` on delivery items |
| Received qty | `received_qty` on delivery items |
| Verification status | `verification_status` |
| Discrepancies | rendered if `discrepancies` JSON is non-empty |

**Action buttons (context-sensitive):**
- If `verification_status = pending` → **→ Verify Delivery** (primary)
- Always: → Open GRN, → View Challan (if `challan_url` exists)

---

### Phase 4: Vendor Payment
**Status logic:** derived from `material_purchase_expenses.is_paid` + `amount_paid` vs `total_amount`

| Field | Value |
|-------|-------|
| Total due | `total_amount` on expense |
| Amount paid | `amount_paid` |
| Pending amount | `total_amount - amount_paid` |
| Payment terms | `payment_timing` on PO |
| Paying site | `paying_site_id` → site name (group POs only) |
| Bill verified | `bill_verified` boolean |
| Payment mode | `payment_mode` |

**Blocker logic:** If `is_paid = false`, render `JourneyBlockerBanner` on the settlement phase: "Inter-Site Settlement is blocked — vendor has not been paid yet."

**Action buttons:** → Record Payment (links to expense page), → Open Purchase Expense

---

### Phase 5: Inter-Site Settlement
**Visibility:** Only rendered for group stock POs (`purchase_type = 'group_stock'`)
**Status logic:** derived from `inter_site_material_settlements.status`

| Field | Value |
|-------|-------|
| Settlement code | `settlement_code` |
| Period | `period_start` → `period_end` |
| Total amount | `total_amount` |
| Paid amount | `paid_amount` |
| Pending amount | `pending_amount` |
| Status | draft / pending / approved / settled |

**Action buttons:** → Open Settlement

For own-site POs this phase is skipped entirely (no group split needed).

---

### Phase 6: Material Expense
**Status logic:** expense exists and `is_paid = true` and delivery verified

Rendered as per-site expense cards. For own-site: single card. For group POs: one card per site (creditor + all debtor sites).

| Per-site card | Value |
|--------------|-------|
| Site name | from batch_usage_records |
| Qty used | `quantity` |
| Unit cost | `unit_cost` |
| Total expense | `total_cost` |
| Status | pending / booked |

**Action buttons:** → Open Material Expenses (per site)

---

## Group Site Split Section

Rendered only when `purchase_type = 'group_stock'`. Appears between the Phase Cards and the Expense Section.

**Data source:** `batch_usage_records` grouped by `usage_site_id`, joined with site names.

**Columns per site row:**
- Role badge: PAID (creditor site, green) or OWES (debtor site, red)
- Site name + short description ("X bags used · Paid vendor")
- Allocated amount (quantity × unit_cost)
- Settlement status inline (e.g., "⚠ Vendor unpaid", "SET-2026-W05 · Settled ✓")

**Blocker indicator:** If vendor unpaid, each site row shows the blocker inline. No settlement link is shown until the vendor is paid.

---

## Blocker Banner

`JourneyBlockerBanner` is a red-tinted banner that appears between the last completed phase and the next blocked phase. It always explains:
1. **What is blocked** (e.g., "Inter-Site Settlement is blocked")
2. **Why** (e.g., "Vendor for PO-XXX has not been paid yet")
3. Optionally: **What to do** (e.g., "Record vendor payment to unblock")

---

## Status Derivation Logic

The journey component derives a single `currentPhase` and `overallStatus` from the combined data:

```
PENDING_APPROVAL  → request.status in (draft, pending)
ORDERED           → po exists, no delivery yet
DELIVERY_PENDING  → delivery exists, verification_status = pending
DELIVERY_VERIFIED → delivery verified, vendor not paid
VENDOR_PAID       → expense.is_paid = true, settlement pending (group only)
SETTLEMENT_DONE   → settlement.status = settled (group only)
COMPLETE          → own-site: vendor paid + delivery verified
                    group: settlement done + expenses booked
```

The `JourneyStatusStrip` shows the current phase as a colored badge (same visual language as existing PO status badges in the app).

---

## Deep Links

All action buttons are `<Link>` or `router.push()` calls — they navigate to existing pages pre-filtered to the relevant record. No new pages are needed for actions; all editing happens on existing pages.

> **Implementation note:** The exact query param names (`highlight`, `grn`, `code`, etc.) must be verified against each target page's existing URL handling during implementation. If a target page does not currently support deep-linking via query params, that page will need a small addition to read and apply the param on mount.

| Button | Destination |
|--------|-------------|
| → Open Request | `/site/material-requests?highlight=REQ-xxx` |
| → Open PO | `/site/purchase-orders?highlight=PO-xxx` |
| → Verify Delivery | `/site/delivery-verification?grn=GRN-xxx` |
| → Open GRN | `/site/delivery-verification?grn=GRN-xxx` |
| → Record Payment | `/site/material-requests/expenses?po=PO-xxx` |
| → Open Purchase Expense | `/site/material-requests/expenses?ref=MAT-xxx` |
| → Open Settlement | `/site/inter-site-settlement?code=SET-xxx` |
| → Open Material Expenses | `/site/material-expenses?site=xxx` |

---

## Responsive Behaviour

- **Drawer mode:** Single-column layout. Phase cards stacked vertically. Detail grids use 2-column on desktop, 1-column on mobile.
- **Full page mode:** Phase cards can use a 2-column grid (left: request+PO, right: delivery+payment) on wide screens. Site split table has full width. Same component, `isFullPage` prop controls layout variant.

---

## Existing Patterns to Reuse

| Pattern | Location |
|---------|----------|
| InspectPane shell (drawer) | `src/components/shared/InspectPane.tsx` |
| useInspectStack (cross-navigation) | `src/hooks/useInspectStack.ts` |
| Status badge styles | `src/components/materials/` (PO status chips) |
| Phase stepper (visual) | Existing PO workflow stepper in `src/components/materials/` |
| React Query parallel fetching | Pattern used in `usePurchaseOrders.ts`, `useInterSiteSettlements.ts` |

---

## Verification

1. Open `/site/material-requests` → click any request row → drawer slides in showing phase cards
2. Verify "⤢ Full Page" button navigates to `/site/material-requests/[requestId]`
3. For a group stock PO: confirm site split section appears with correct allocations per site
4. For an own-site PO: confirm site split section is hidden entirely
5. For a request with no PO yet: phases 2–6 show as "pending" placeholders
6. For a completed request: all 6 phases show green ✓, expense cards show final amounts
7. Blocker banner appears when vendor is unpaid and group settlement is pending
8. All deep-link buttons navigate to the correct page and pre-highlight the correct record
9. No console errors; no hydration warnings