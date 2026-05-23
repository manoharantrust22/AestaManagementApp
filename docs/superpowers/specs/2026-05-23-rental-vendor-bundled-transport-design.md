# Rental orders: bundle vendor-handled transport into the vendor settlement

**Status:** Draft · awaiting user review
**Date:** 2026-05-23
**Owner:** Hari (PM/eng) + Claude

## Problem

On a rental order where the rental vendor also handles transport — e.g. a JCB that drives itself from the vendor's yard to the site, or bricks the vendor's own truck delivers — the UI treats transport as a separate settlement party.

Concretely, order **RNT-260112-001** (Srinivasan site, JCB from Sarvesh Earth Movers):

| | |
|---|---|
| Items subtotal | ₹5,040 |
| Transport (outward) | ₹250 |
| **Gross total** | **₹5,290** |
| Vendor settlement RSET-260112-001 | ₹4,800 (negotiated) |
| Cost-breakdown UI status | Vendor ✓ settled · Transport ❗ "Settle" chip still visible |

The ₹250 was always implicitly part of the vendor's bill — there is no separate transporter to pay. But the UI prompts the engineer to settle transport separately, and the order never reaches "fully settled". This pattern repeats across every vendor-driven rental.

The schema already encodes the answer. Every rental order has `outward_by: "vendor" | "company" | "laborer" | null` and `return_by` likewise. The UI just doesn't honor those fields.

## Goal

When the rental vendor handles a transport leg, that leg is part of the vendor's settlement — not a separate party. The UI, the settlement dialog, and the "fully settled" status all agree on this.

## Non-goals

- **No change to the order create form** ([RentalOrderDialog.tsx](src/components/rentals/RentalOrderDialog.tsx)). Users today rarely pick a handler explicitly; we treat `null` as vendor (safe default). Adding a discoverable "separate transport vehicle?" toggle is deferred until third-party transporters are common enough to be worth surfacing.
- **No retroactive change to settlement amounts in the books.** RSET-260112-001 stays ₹4,800. Audit trail is preserved; only the *display* and *party tracking* change.
- **No item-level "self-transporting" flag.** Equipment vs material isn't the right axis — the right axis is who's holding the steering wheel, which is exactly what `outward_by`/`return_by` records.

## Design

### The rule

A vendor-handled transport leg is part of the vendor's settlement, not a separate party.

- If `outward_by IN ('vendor', NULL)` → `transport_cost_outward` belongs to the vendor's amount. The system does not track a `transport_inbound` party for this order. No separate Settle UI.
- If `outward_by IN ('company', 'laborer')` → transport is a separate party with its own settlement (existing behavior, unchanged).
- Same for `return_by` / `transport_cost_return` / `transport_outbound`.

### Code touch-points

Three files, all small changes.

#### 1. [src/components/rentals/RentalCostBreakdown.tsx](src/components/rentals/RentalCostBreakdown.tsx)

The transport rows still render (so the cost is visible in the breakdown), but the inline "Settle" chip is suppressed when handler is vendor/null.

- Accept `outwardBy` and `returnBy` as props (passed from the parent page).
- For the outward row: show the Settle chip only when `transport_cost_outward > 0` AND `outwardBy NOT IN ('vendor', null)` AND not already settled.
- Same for return row.
- Vendor-handled rows show no chip and no green check — they're purely informational (the gross + vendor settlement convey the state).

#### 2. [src/app/(main)/site/rentals/[id]/page.tsx](src/app/(main)/site/rentals/[id]/page.tsx) (lines ~121-141)

Tighten the `inboundNeeded` / `outboundNeeded` predicates:

```ts
const inboundNeeded =
  (order?.transport_cost_outward ?? 0) > 0 &&
  order?.outward_by != null &&
  order?.outward_by !== "vendor";

const outboundNeeded =
  (order?.transport_cost_return ?? 0) > 0 &&
  order?.return_by != null &&
  order?.return_by !== "vendor";
```

`isFullySettled` collapses to just `vendorSettled` for vendor-handled orders, which is correct — the vendor settlement covers everything.

Pass `outwardBy={order?.outward_by}` and `returnBy={order?.return_by}` to `<RentalCostBreakdown>`.

#### 3. [src/components/rentals/MultiPartySettlementDialog.tsx](src/components/rentals/MultiPartySettlementDialog.tsx) (lines ~83-122, ~185-210)

When handler is vendor/null, fold transport amount into the vendor amount and omit the `transport_inbound` / `transport_outbound` rows entirely.

```ts
const inboundIsVendor = order.outward_by == null || order.outward_by === "vendor";
const outboundIsVendor = order.return_by == null || order.return_by === "vendor";

const vendorBundledTransport =
  (inboundIsVendor ? inboundAmount : 0) + (outboundIsVendor ? outboundAmount : 0);

const vendorBalance = Math.max(0, rentalAmount + vendorBundledTransport - totalAdvances);

const activePartyTypes: RentalSettlementPartyType[] = [
  "vendor",
  ...(!inboundIsVendor ? (["transport_inbound"] as const) : []),
  ...(!outboundIsVendor ? (["transport_outbound"] as const) : []),
  "loading_unloading",
];
```

The `originalAmounts` map gets the same treatment — vendor row's "original" is now `rentalAmount + vendorBundledTransport`, and the transport rows only appear if they're truly separate parties.

If `focusedPartyType === "transport_inbound"` is passed but the handler is vendor (shouldn't happen after fix #1 lands, but defensive): coerce to `"vendor"`.

### Data backfill (one-time migration)

`supabase/migrations/20260523140000_rental_orders_default_handler_to_vendor.sql`:

```sql
-- For legacy orders that carry a transport cost but no explicit handler,
-- record the implicit truth: the rental vendor handled it.
UPDATE rental_orders
SET outward_by = 'vendor'
WHERE transport_cost_outward > 0 AND outward_by IS NULL;

UPDATE rental_orders
SET return_by = 'vendor'
WHERE transport_cost_return > 0 AND return_by IS NULL;
```

This is non-destructive: it only writes 'vendor' where the field was null, and only when there's actually a transport cost. It does not touch any settlement row, ledger, or wallet allocation.

After this migration + the UI fix, RNT-260112-001's UI state becomes:

| | |
|---|---|
| Vendor Settled · RSET-260112-001 | ₹4,800 ✓ |
| Transport (Outward) | ₹250 (informational, no chip) |
| Overall status | Fully settled |

### Behavior matrix (what the UI does in each combination)

| `transport_cost_outward` | `outward_by` | Cost-breakdown row shows | Settle chip | In MultiParty dialog |
|---|---|---|---|---|
| 0 | any | (hidden) | — | (no transport row) |
| > 0 | `null` | informational | no | folded into vendor amount |
| > 0 | `'vendor'` | informational | no | folded into vendor amount |
| > 0 | `'company'` | settle-trackable | yes (until settled) | separate `transport_inbound` row |
| > 0 | `'laborer'` | settle-trackable | yes (until settled) | separate `transport_inbound` row |

Return leg mirrors the same matrix.

## Testing

Vitest coverage in `src/components/rentals/__tests__/`:

- `RentalCostBreakdown.test.tsx`: render with each handler value × (settled vs not) — assert chip visibility per the matrix.
- `MultiPartySettlementDialog.test.tsx`: assert vendor balance = items + vendor-bundled transport − advances; assert `activePartyTypes` excludes transport rows when handler is vendor/null.
- Snapshot/regression check on `[id]/page.tsx`: `isFullySettled` is true when only the vendor party is settled AND both handlers are vendor/null.

Manual verification (per CLAUDE.md "After UI Changes" rule):

1. `npm run dev:cloud` → log in via `/dev-login`.
2. Open RNT-260112-001 on Srinivasan site → verify no Settle chip on the transport row, status reads fully settled.
3. Create a new rental order, leave `outward_by` as default (vendor), with non-zero transport cost → verify the Settle button opens a dialog with a single vendor row whose amount includes transport.
4. (If possible) find or seed an order with `outward_by = 'company'` → verify the old separate-Settle behavior still works for it.
5. Console clean, no hydration warnings.

## Rollout

1. Apply the migration to prod via `mcp__supabase__apply_migration` (it's idempotent and read-only against everything except the two columns).
2. Push the code change.
3. Spot-check one or two recently-completed rental orders for visual correctness.

No feature flag needed — the change is strictly a UI/UX correction that aligns the display with the existing schema. If something goes wrong, the migration is reversible (`SET outward_by = NULL WHERE ...`) and the UI change is a single deploy revert.

## Open questions

None blocking. Future polish (out of scope):

- Add an explicit "Separate transport vehicle" toggle in `RentalOrderDialog` once third-party transporters become common enough to be worth surfacing.
- Show a small vendor-row breakdown ("Items ₹5,040 + Transport ₹250 = ₹5,290") inside the MultiParty dialog so the user understands why the vendor row jumped.
