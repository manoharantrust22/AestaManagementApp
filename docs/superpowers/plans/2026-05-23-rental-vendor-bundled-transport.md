# Rental Vendor-Bundled Transport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the rental vendor also handles transport, treat that transport amount as part of the vendor's settlement — not a separate party. The "Settle" chip on the transport row stops appearing for vendor-handled (or NULL-handler) rentals, and the MultiParty dialog rolls the amount into the vendor row.

**Architecture:** The schema already encodes the answer (`rental_orders.outward_by` / `return_by` of type `"vendor" | "company" | "laborer" | null`). Three UI files currently ignore those fields; this plan teaches them to honor `vendor`/`null` as "bundled with vendor". A one-time SQL migration backfills legacy NULLs to `'vendor'` for data hygiene. NULL is treated identically to `'vendor'` in code so the order of migration vs. code deploy doesn't matter.

**Tech Stack:** Next.js 15 · MUI v7 · React Query · Supabase Postgres · Vitest + React Testing Library

**Spec:** [docs/superpowers/specs/2026-05-23-rental-vendor-bundled-transport-design.md](../specs/2026-05-23-rental-vendor-bundled-transport-design.md)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/20260523140000_rental_orders_default_handler_to_vendor.sql` | CREATE | Backfill `outward_by` / `return_by` from NULL → `'vendor'` where a transport cost exists |
| `src/components/rentals/__tests__/RentalCostBreakdown.test.tsx` | CREATE | Unit-test the chip-visibility matrix (4 handler values × 2 cost states) |
| `src/components/rentals/RentalCostBreakdown.tsx` | MODIFY | Accept `outwardBy` / `returnBy` props; suppress Settle chip when handler is vendor/null |
| `src/app/(main)/site/rentals/[id]/page.tsx` | MODIFY | Tighten `inboundNeeded` / `outboundNeeded` predicates; pass handler props to `<RentalCostBreakdown>` |
| `src/components/rentals/MultiPartySettlementDialog.tsx` | MODIFY | Fold vendor-bundled transport into `vendorBalance`; drop transport party rows when handler is vendor/null |

---

## Task 1: Write the backfill migration

**Files:**
- Create: `supabase/migrations/20260523140000_rental_orders_default_handler_to_vendor.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260523140000_rental_orders_default_handler_to_vendor.sql` with this content:

```sql
-- 2026-05-23: For legacy rental orders that carry a transport cost but no
-- explicit handler, record the implicit truth — the rental vendor handled it.
-- Idempotent: only writes where handler is NULL AND a cost exists.

UPDATE rental_orders
SET outward_by = 'vendor'
WHERE transport_cost_outward > 0
  AND outward_by IS NULL;

UPDATE rental_orders
SET return_by = 'vendor'
WHERE transport_cost_return > 0
  AND return_by IS NULL;
```

- [ ] **Step 2: Do NOT apply the migration yet**

The migration is committed in this task but applied to prod only during the user's "move to prod" flow (per CLAUDE.md). The code changes in Tasks 3–5 treat NULL identically to `'vendor'`, so all behavior verification in Task 6 works correctly even without the migration applied. The migration is pure data hygiene — running it sooner is safe but not required.

If you want to spot-check the SQL locally first, you can run it via Supabase MCP `execute_sql` against prod (read-after-write idempotent check):

```sql
SELECT
  COUNT(*) FILTER (WHERE transport_cost_outward > 0 AND outward_by IS NULL) AS outward_null_with_cost,
  COUNT(*) FILTER (WHERE transport_cost_return  > 0 AND return_by  IS NULL) AS return_null_with_cost
FROM rental_orders;
```

That tells you how many rows the backfill *would* touch when it eventually runs.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260523140000_rental_orders_default_handler_to_vendor.sql
git commit -m "feat(rentals): backfill outward_by/return_by to 'vendor' for legacy NULLs"
```

---

## Task 2: Write failing tests for RentalCostBreakdown chip visibility

**Files:**
- Create: `src/components/rentals/__tests__/RentalCostBreakdown.test.tsx`

- [ ] **Step 1: Write the test file**

Create `src/components/rentals/__tests__/RentalCostBreakdown.test.tsx`:

```tsx
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import RentalCostBreakdown from "../RentalCostBreakdown";
import type { RentalCostCalculation } from "@/types/rental.types";

const baseCalc: RentalCostCalculation = {
  startDate: "2025-11-16",
  currentDate: "2025-11-16",
  expectedReturnDate: "2025-11-16",
  actualReturnDate: "2025-11-16",
  daysElapsed: 1,
  itemsCost: [],
  subtotal: 5040,
  discountAmount: 0,
  transportCostOutward: 250,
  transportCostReturn: 0,
  totalTransportCost: 250,
  damagesCost: 0,
  grossTotal: 5290,
  advancesPaid: 0,
  balanceDue: 5290,
  isOverdue: false,
  daysOverdue: 0,
  isCompleted: true,
} as RentalCostCalculation;

describe("RentalCostBreakdown — transport handler bundling", () => {
  it("hides Settle chip on outward row when outwardBy is 'vendor'", () => {
    render(
      <RentalCostBreakdown
        calculation={baseCalc}
        outwardBy="vendor"
        returnBy={null}
        onSettleInbound={vi.fn()}
      />,
    );
    expect(screen.queryByText("Settle")).not.toBeInTheDocument();
  });

  it("hides Settle chip on outward row when outwardBy is null (treated as vendor)", () => {
    render(
      <RentalCostBreakdown
        calculation={baseCalc}
        outwardBy={null}
        returnBy={null}
        onSettleInbound={vi.fn()}
      />,
    );
    expect(screen.queryByText("Settle")).not.toBeInTheDocument();
  });

  it("shows Settle chip on outward row when outwardBy is 'company'", () => {
    render(
      <RentalCostBreakdown
        calculation={baseCalc}
        outwardBy="company"
        returnBy={null}
        onSettleInbound={vi.fn()}
      />,
    );
    expect(screen.getByText("Settle")).toBeInTheDocument();
  });

  it("shows Settle chip on outward row when outwardBy is 'laborer'", () => {
    render(
      <RentalCostBreakdown
        calculation={baseCalc}
        outwardBy="laborer"
        returnBy={null}
        onSettleInbound={vi.fn()}
      />,
    );
    expect(screen.getByText("Settle")).toBeInTheDocument();
  });

  it("hides Settle chip on return row when returnBy is 'vendor'", () => {
    const calcWithReturn: RentalCostCalculation = {
      ...baseCalc,
      transportCostOutward: 0,
      transportCostReturn: 250,
    } as RentalCostCalculation;
    render(
      <RentalCostBreakdown
        calculation={calcWithReturn}
        outwardBy={null}
        returnBy="vendor"
        onSettleOutbound={vi.fn()}
      />,
    );
    expect(screen.queryByText("Settle")).not.toBeInTheDocument();
  });

  it("shows Settle chip on return row when returnBy is 'company'", () => {
    const calcWithReturn: RentalCostCalculation = {
      ...baseCalc,
      transportCostOutward: 0,
      transportCostReturn: 250,
    } as RentalCostCalculation;
    render(
      <RentalCostBreakdown
        calculation={calcWithReturn}
        outwardBy={null}
        returnBy="company"
        onSettleOutbound={vi.fn()}
      />,
    );
    expect(screen.getByText("Settle")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test -- src/components/rentals/__tests__/RentalCostBreakdown.test.tsx
```

Expected: All 6 tests FAIL. The first two ("hides Settle chip when outwardBy is 'vendor' / null") fail because the chip is currently rendered unconditionally when `transport_cost_outward > 0`. Type errors are also expected because `outwardBy` and `returnBy` are not yet declared on the component's props.

If the type error blocks the test runner before assertion, that still counts as "test failed for the right reason" — proceed to Task 3.

---

## Task 3: Update RentalCostBreakdown to honor the handler

**Files:**
- Modify: `src/components/rentals/RentalCostBreakdown.tsx:24-32` (props interface)
- Modify: `src/components/rentals/RentalCostBreakdown.tsx:246-300` (transport row render blocks)
- Test: `src/components/rentals/__tests__/RentalCostBreakdown.test.tsx` (from Task 2)

- [ ] **Step 1: Add the new props to the interface**

In `src/components/rentals/RentalCostBreakdown.tsx`, update the imports and the `RentalCostBreakdownProps` interface.

Add `TransportHandler` to the type import:

```tsx
import type {
  RentalCostCalculation,
  RentalSettlement,
  TransportHandler,
} from "@/types/rental.types";
```

Update the props interface (replace lines 24-32):

```tsx
interface RentalCostBreakdownProps {
  calculation: RentalCostCalculation;
  showItemDetails?: boolean;
  compact?: boolean;
  settlement?: RentalSettlement | null;
  settledPartyTypes?: Set<string>;
  /** Who handles outward transport. NULL is treated as 'vendor' (bundled into vendor settlement). */
  outwardBy?: TransportHandler | null;
  /** Who handles return transport. NULL is treated as 'vendor' (bundled into vendor settlement). */
  returnBy?: TransportHandler | null;
  onSettleInbound?: () => void;
  onSettleOutbound?: () => void;
}
```

- [ ] **Step 2: Destructure the new props in the function signature**

Replace the function declaration (lines 34-42):

```tsx
export default function RentalCostBreakdown({
  calculation,
  showItemDetails = true,
  compact = false,
  settlement = null,
  settledPartyTypes,
  outwardBy = null,
  returnBy = null,
  onSettleInbound,
  onSettleOutbound,
}: RentalCostBreakdownProps) {
```

- [ ] **Step 3: Suppress the outward Settle chip when handler is vendor/null**

Replace the outward transport block (lines 246-272):

```tsx
{transportCostOutward > 0 && (() => {
  const isVendorHandled = outwardBy == null || outwardBy === "vendor";
  const isSettled =
    settledPartyTypes?.has("transport_inbound") ||
    settledPartyTypes?.has("transport");
  return (
    <Box display="flex" justifyContent="space-between" alignItems="center">
      <Typography variant="body2" color="text.secondary">
        Transport (Outward)
      </Typography>
      <Box display="flex" alignItems="center" gap={0.75}>
        <Typography variant="body2">₹{transportCostOutward.toLocaleString()}</Typography>
        {isVendorHandled ? null : isSettled ? (
          <CheckIcon sx={{ fontSize: 16 }} color="success" />
        ) : onSettleInbound ? (
          <Tooltip title="Settle inbound transport">
            <Chip
              label="Settle"
              size="small"
              color="info"
              variant="outlined"
              onClick={onSettleInbound}
              sx={{ height: 20, fontSize: "0.65rem", cursor: "pointer" }}
            />
          </Tooltip>
        ) : null}
      </Box>
    </Box>
  );
})()}
```

- [ ] **Step 4: Suppress the return Settle chip when handler is vendor/null**

Replace the return transport block (lines 274-300):

```tsx
{transportCostReturn > 0 && (() => {
  const isVendorHandled = returnBy == null || returnBy === "vendor";
  const isSettled =
    settledPartyTypes?.has("transport_outbound") ||
    settledPartyTypes?.has("transport");
  return (
    <Box display="flex" justifyContent="space-between" alignItems="center">
      <Typography variant="body2" color="text.secondary">
        Transport (Return)
      </Typography>
      <Box display="flex" alignItems="center" gap={0.75}>
        <Typography variant="body2">₹{transportCostReturn.toLocaleString()}</Typography>
        {isVendorHandled ? null : isSettled ? (
          <CheckIcon sx={{ fontSize: 16 }} color="success" />
        ) : onSettleOutbound ? (
          <Tooltip title="Settle return transport">
            <Chip
              label="Settle"
              size="small"
              color="info"
              variant="outlined"
              onClick={onSettleOutbound}
              sx={{ height: 20, fontSize: "0.65rem", cursor: "pointer" }}
            />
          </Tooltip>
        ) : null}
      </Box>
    </Box>
  );
})()}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm run test -- src/components/rentals/__tests__/RentalCostBreakdown.test.tsx
```

Expected: All 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/rentals/RentalCostBreakdown.tsx src/components/rentals/__tests__/RentalCostBreakdown.test.tsx
git commit -m "feat(rentals): RentalCostBreakdown honors outward_by/return_by, hides Settle chip when vendor-handled"
```

---

## Task 4: Update the rental order detail page to gate by handler and pass props down

**Files:**
- Modify: `src/app/(main)/site/rentals/[id]/page.tsx:129-141` (the `inboundNeeded` / `outboundNeeded` block)
- Modify: `src/app/(main)/site/rentals/[id]/page.tsx:782-797` (the `<RentalCostBreakdown>` call site)

- [ ] **Step 1: Tighten the needed predicates**

Replace the block at lines 129-141:

```tsx
  // Determine which parties actually need separate settlement.
  // Vendor-handled transport (outward_by/return_by IN ('vendor', NULL)) is bundled
  // into the vendor settlement and does not require its own settle action.
  const outwardIsVendor = order?.outward_by == null || order?.outward_by === "vendor";
  const returnIsVendor = order?.return_by == null || order?.return_by === "vendor";
  const inboundNeeded =
    (order?.transport_cost_outward ?? 0) > 0 && !outwardIsVendor;
  const outboundNeeded =
    (order?.transport_cost_return ?? 0) > 0 && !returnIsVendor;
  const inboundSettled =
    !inboundNeeded ||
    settledPartyTypes.has("transport_inbound") ||
    settledPartyTypes.has("transport");
  const outboundSettled =
    !outboundNeeded ||
    settledPartyTypes.has("transport_outbound") ||
    settledPartyTypes.has("transport");
  const isFullySettled = vendorSettled && inboundSettled && outboundSettled;
```

- [ ] **Step 2: Pass `outwardBy` and `returnBy` to RentalCostBreakdown**

Replace the `<RentalCostBreakdown>` invocation at lines 782-797:

```tsx
            <RentalCostBreakdown
              calculation={costCalculation}
              showItemDetails
              settlement={settlement as any}
              settledPartyTypes={settledPartyTypes}
              outwardBy={order?.outward_by ?? null}
              returnBy={order?.return_by ?? null}
              onSettleInbound={
                order.status === "completed" && !inboundSettled
                  ? () => setInboundSettleOpen(true)
                  : undefined
              }
              onSettleOutbound={
                order.status === "completed" && !outboundSettled
                  ? () => setOutboundSettleOpen(true)
                  : undefined
              }
            />
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no new errors in `src/app/(main)/site/rentals/[id]/page.tsx`. Pre-existing errors elsewhere in the codebase (if any) are out of scope — only verify that the changed file has no new diagnostics.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(main)/site/rentals/[id]/page.tsx"
git commit -m "feat(rentals): page gates inbound/outbound settle by transport handler, passes handler down to breakdown"
```

---

## Task 5: Update MultiPartySettlementDialog to fold vendor-handled transport into vendor balance

**Files:**
- Modify: `src/components/rentals/MultiPartySettlementDialog.tsx:74-122` (amount computation + party defaults)
- Modify: `src/components/rentals/MultiPartySettlementDialog.tsx:185-210` (active party list + original amounts)

- [ ] **Step 1: Compute vendor-bundled transport before vendor balance**

Replace lines 83-92 (from `const inboundAmount = ...` through `const vendorBalance = ...`):

```tsx
  const inboundAmount = order.transport_cost_outward ?? 0;
  const outboundAmount = order.transport_cost_return ?? 0;
  const loadingAmount =
    (order.loading_cost_outward ?? 0) +
    (order.unloading_cost_outward ?? 0) +
    ((order as any).loading_cost_return ?? 0) +
    ((order as any).unloading_cost_return ?? 0);

  // Vendor-handled transport (handler in 'vendor' or NULL) is part of the vendor's bill,
  // not a separate party. Fold those amounts into the vendor balance and omit the
  // separate transport rows from the party list.
  const inboundIsVendor = order.outward_by == null || order.outward_by === "vendor";
  const outboundIsVendor = order.return_by == null || order.return_by === "vendor";
  const vendorBundledTransport =
    (inboundIsVendor ? inboundAmount : 0) +
    (outboundIsVendor ? outboundAmount : 0);

  const grossTotal = rentalAmount + inboundAmount + outboundAmount;
  const vendorBalance = Math.max(0, rentalAmount + vendorBundledTransport - totalAdvances);
```

- [ ] **Step 2: Skip the transport defaults when handler is vendor**

Replace lines 117-123 (the `transport*` entries inside the `makeParty` defaults object):

```tsx
    transport: makeParty(inboundAmount + outboundAmount, true),
    transport_inbound: makeParty(inboundAmount, inboundIsVendor || inboundAmount === 0),
    transport_outbound: makeParty(outboundAmount, outboundIsVendor || outboundAmount === 0),
    loading_unloading: { ...makeParty(loadingAmount, true), party_name: "Site Laborers" },
```

(The third arg to `makeParty` is the "collapsed/hidden" flag — by setting it true when the handler is vendor, the transport row is pre-collapsed AND the amount won't be added to a separate settlement.)

- [ ] **Step 3: Filter transport from active party types when handler is vendor**

Replace the `activePartyTypes` declaration at lines 185-190:

```tsx
  const activePartyTypes: RentalSettlementPartyType[] = [
    "vendor",
    ...(!inboundIsVendor ? (["transport_inbound"] as const) : []),
    ...(!outboundIsVendor ? (["transport_outbound"] as const) : []),
    "loading_unloading",
  ];
```

- [ ] **Step 4: Update originalAmounts so vendor row's "original" includes bundled transport**

Replace the `originalAmounts` map at lines 205-210:

```tsx
  const originalAmounts: Partial<Record<RentalSettlementPartyType, number>> = {
    vendor: vendorBalance,
    transport_inbound: inboundIsVendor ? 0 : inboundAmount,
    transport_outbound: outboundIsVendor ? 0 : outboundAmount,
    loading_unloading: loadingAmount,
  };
```

- [ ] **Step 5: Defensive coerce of focusedPartyType when handler is vendor**

The `focusedPartyType` prop comes from the parent page and can ask us to focus `transport_inbound` or `transport_outbound`. After Task 4 the parent never sends those values for vendor-handled orders, but a stale or programmatic call could. Coerce defensively.

Immediately after the `outboundIsVendor` line you added in Step 1, add this declaration:

```tsx
  // Defense-in-depth: if a caller focuses a transport party but the handler is vendor,
  // coerce to vendor so we never render an empty/missing party row.
  const effectiveFocusedPartyType: typeof focusedPartyType =
    focusedPartyType === "transport_inbound" && inboundIsVendor ? "vendor"
    : focusedPartyType === "transport_outbound" && outboundIsVendor ? "vendor"
    : focusedPartyType;
```

Then `Grep` for `focusedPartyType` inside `src/components/rentals/MultiPartySettlementDialog.tsx` and replace every read inside the function body (NOT the prop name in the function signature, NOT the type alias) with `effectiveFocusedPartyType`. The destructured prop in the function signature stays `focusedPartyType` — only in-function reads change.

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```

Expected: no new errors in `src/components/rentals/MultiPartySettlementDialog.tsx`.

- [ ] **Step 7: Commit**

```bash
git add src/components/rentals/MultiPartySettlementDialog.tsx
git commit -m "feat(rentals): MultiParty dialog folds vendor-handled transport into vendor balance"
```

---

## Task 6: Manual Playwright verification (per CLAUDE.md)

**Files:** none (verification only)

This codebase requires browser verification after UI changes per the "After UI Changes — REQUIRED" section of CLAUDE.md.

- [ ] **Step 1: Start dev server**

```bash
npm run dev:cloud
```

Wait for "Ready" log line.

- [ ] **Step 2: Auto-login**

Using Playwright MCP, navigate to `http://localhost:3000/dev-login`. This auto-signs in as the test user (`Haribabu@nerasmclasses.onmicrosoft.com`) — no form filling needed.

- [ ] **Step 3: Verify the originally-broken order**

Navigate to `http://localhost:3000/site/rentals/4a6e75a9-bdb1-4b04-996f-a547317f61fd` (the RNT-260112-001 order on Srinivasan site).

Take a screenshot. Verify:
- The "Transport (Outward)" row shows `₹250` with **no** "Settle" chip next to it.
- The green "Settled · RSET-260112-001 · ₹4,800" box is visible at the bottom of the cost breakdown.
- The top-right "Settle" / "Add Advance" buttons in the header no longer indicate outstanding work (page status reflects fully settled).

- [ ] **Step 4: Check console**

Use Playwright MCP `browser_console_messages` to list all console output for the page. Expected: zero errors, zero React warnings, zero hydration warnings.

If any new warnings appear, fix them before proceeding (per the CLAUDE.md "Don't ignore warnings" rule).

- [ ] **Step 5: Verify a separate-transporter case still works (if data exists)**

Run via Supabase MCP `execute_sql`:

```sql
SELECT id, order_reference
FROM rental_orders
WHERE outward_by IN ('company', 'laborer')
   OR return_by IN ('company', 'laborer')
ORDER BY created_at DESC
LIMIT 5;
```

If any rows are returned, navigate to one of them and verify the "Settle" chip on the transport row IS still visible (because handler is genuinely a separate party). If no rows are returned, note this in the verification report — we have no live separate-transporter data to test against, and rely on the Vitest coverage from Task 2.

- [ ] **Step 6: Close the browser**

Use Playwright MCP `browser_close`.

- [ ] **Step 7: Run the full unit test suite as a regression check**

```bash
npm run test
```

Expected: all tests pass. If pre-existing failures exist that are unrelated to rentals, note them but do not fix them (out of scope).

- [ ] **Step 8: Run a production build**

```bash
npm run build
```

Expected: build succeeds. TypeScript errors in any modified file are blockers and must be fixed before completion.

---

## Spec coverage check

| Spec requirement | Implemented in |
|---|---|
| Cost breakdown: hide Settle chip when handler is vendor/null | Task 2 (tests) + Task 3 (impl) |
| Detail page: `inboundNeeded`/`outboundNeeded` exclude vendor-handled | Task 4 |
| Detail page: pass `outwardBy`/`returnBy` to cost breakdown | Task 4 |
| MultiParty dialog: vendor balance includes bundled transport | Task 5, Step 1 |
| MultiParty dialog: omit transport rows from active party list | Task 5, Step 3 |
| MultiParty dialog: skip transport defaults when handler is vendor | Task 5, Step 2 |
| MultiParty dialog: defensive coerce on stale `focusedPartyType` | Task 5, Step 5 |
| Backfill NULL handlers to 'vendor' where cost exists | Task 1 |
| Behavior matrix coverage (4 handlers × outward + return) | Task 2 tests |
| Manual Playwright verification on RNT-260112-001 | Task 6 |

No spec section without a task.

---

## Out of scope (per spec)

- `RentalOrderDialog.tsx` create form — no "Separate transport vehicle?" toggle added; NULL → vendor default carries.
- Existing settlement amounts — RSET-260112-001 stays ₹4,800; no money movement.
- Item-level "self-transporting" flag — not the right axis.
