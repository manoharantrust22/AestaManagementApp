# Rental Lifecycle Phases 2–4 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full rental lifecycle on `/site/rentals` — supervisor creates rental request (from estimate basket or standalone), engineer converts to PO with advance payment, supervisor verifies delivery, active orders show a live daily cost meter with extend-date, partial returns are recorded with auto cost calculation, and final settlement is split across up to 3 parties (vendor / transport / loading-unloading).

**Architecture:** Extends the existing `/site/rentals` page and `rental_orders` schema. Two schema changes are needed: `parent_order_id` on `rental_orders` (re-orders) and `party_type` + relaxed UNIQUE on `rental_settlements` (3-party settlement). The existing `RentalOrderDialog`, `RentalReturnDialog`, and `RentalSettlementDialog` components are refactored — not replaced wholesale — to minimize regression risk. New components are added alongside existing ones.

**Prerequisite:** Phase 1 plan (`2026-05-12-rental-catalog-phase1.md`) must be complete. The `EstimateBasketProvider` context and `EstimateBasketItem` types are used here.

**Tech Stack:** Next.js 15, MUI v7, React Query (TanStack), Supabase, Vitest + React Testing Library, TypeScript

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create migration | `supabase/migrations/20260514110000_rental_lifecycle_enhancements.sql` | `parent_order_id` on orders; `party_type` on settlements; relax UNIQUE |
| Modify types | `src/types/rental.types.ts` | Add `RentalSettlementPartyType`, `RentalRequestStatus`, extend `RentalOrder`, `RentalSettlement` |
| Modify hooks | `src/hooks/queries/useRentals.ts` | Add request hooks, delivery hooks, cost calculation hooks, 3-party settlement mutation |
| Create | `src/lib/utils/rentalCostUtils.ts` | Pure functions: spentToDate, expectedRemaining (tested) |
| Create test | `src/lib/utils/__tests__/rentalCostUtils.test.ts` | Tests for cost calculation |
| Create | `src/components/rentals/RentalRequestForm.tsx` | Supervisor creates rental request (from basket or blank) |
| Create | `src/components/rentals/ActiveOrderCostMeter.tsx` | Progress bar showing spent / remaining / daily burn |
| Create | `src/components/rentals/DateExtensionDialog.tsx` | Extend expected return date with mandatory reason |
| Create | `src/components/rentals/DeliveryVerificationForm.tsx` | Confirm quantities received + actual transport cost + photo |
| Create | `src/components/rentals/MultiPartySettlementDialog.tsx` | 3-party settlement replacing RentalSettlementDialog |
| Modify | `src/components/rentals/RentalOrderCard.tsx` | Embed ActiveOrderCostMeter; add Return / Extend / Re-order buttons |
| Modify | `src/app/(main)/site/rentals/page.tsx` | Add request creation entry point; pending-request list; status filters |
| Modify | `src/components/rentals/index.ts` | Export new components |

---

## Task 1: Schema Migration — Lifecycle Enhancements

**Files:**
- Create: `supabase/migrations/20260514110000_rental_lifecycle_enhancements.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260514110000_rental_lifecycle_enhancements.sql

-- ── rental_orders: support re-order linking ──────────────────────────────────
ALTER TABLE public.rental_orders
  ADD COLUMN IF NOT EXISTS parent_order_id UUID
    REFERENCES public.rental_orders(id) ON DELETE SET NULL;

-- ── rental_orders: add request status for the request→PO workflow ────────────
-- Existing status enum: draft|confirmed|active|partially_returned|completed|cancelled
-- Add pending and approved for the request phase
ALTER TYPE rental_order_status ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE rental_order_status ADD VALUE IF NOT EXISTS 'approved';

-- ── rental_settlements: support 3-party settlement ───────────────────────────
-- Add party_type column
DO $$ BEGIN
  CREATE TYPE rental_settlement_party_type AS ENUM ('vendor', 'transport', 'loading_unloading');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.rental_settlements
  ADD COLUMN IF NOT EXISTS party_type rental_settlement_party_type NOT NULL DEFAULT 'vendor';

ALTER TABLE public.rental_settlements
  ADD COLUMN IF NOT EXISTS party_name TEXT;  -- transport person name, laborer name, etc.

-- Drop old unique constraint on rental_order_id alone
ALTER TABLE public.rental_settlements
  DROP CONSTRAINT IF EXISTS rental_settlements_rental_order_id_key;

-- Add new unique on (rental_order_id, party_type)
ALTER TABLE public.rental_settlements
  ADD CONSTRAINT rental_settlements_order_party_unique
  UNIQUE (rental_order_id, party_type);
```

- [ ] **Step 2: Apply migration locally**

```bash
npm run db:reset
```

Expected: migrations run without error. Verify in Supabase Studio: `rental_orders` has `parent_order_id`, `rental_settlements` has `party_type` column.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260514110000_rental_lifecycle_enhancements.sql
git commit -m "feat(rentals): add parent_order_id + 3-party settlement schema"
```

---

## Task 2: TypeScript Types Update

**Files:**
- Modify: `src/types/rental.types.ts`

- [ ] **Step 1: Add `RentalSettlementPartyType` and extend `RentalSettlement`**

```typescript
// Add near existing rental enums:
export type RentalSettlementPartyType = "vendor" | "transport" | "loading_unloading";

export const RENTAL_SETTLEMENT_PARTY_LABELS: Record<RentalSettlementPartyType, string> = {
  vendor: "Equipment Vendor",
  transport: "Transport",
  loading_unloading: "Loading / Unloading",
};
```

In `RentalSettlement` interface add:
```typescript
  party_type: RentalSettlementPartyType;
  party_name: string | null;
```

In `RentalSettlementFormData` add:
```typescript
  party_type: RentalSettlementPartyType;
  party_name?: string;
```

- [ ] **Step 2: Extend `RentalOrder` with new fields**

In `RentalOrder` interface add:
```typescript
  parent_order_id: string | null;
```

In `RentalOrderStatus` union extend (if it's a string union, not a DB enum):
```typescript
export type RentalOrderStatus =
  | "draft"
  | "pending"
  | "approved"
  | "confirmed"
  | "active"
  | "partially_returned"
  | "completed"
  | "cancelled";
```

- [ ] **Step 3: Add `RentalOrderWithDetails` settlement array type change**

In `RentalOrderWithDetails`, the `settlement` field should now be an array:
```typescript
  settlements?: RentalSettlement[];   // rename from settlement (single) to settlements (array)
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Fix any errors caused by the `settlements` rename (check `RentalOrderCard.tsx`, `RentalSettlementDialog.tsx`, site/rentals page for references to `.settlement`).

- [ ] **Step 5: Commit**

```bash
git add src/types/rental.types.ts
git commit -m "feat(rentals): add RentalSettlementPartyType, parent_order_id, pending/approved status"
```

---

## Task 3: Cost Utility Functions (TDD)

**Files:**
- Create: `src/lib/utils/rentalCostUtils.ts`
- Create: `src/lib/utils/__tests__/rentalCostUtils.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/utils/__tests__/rentalCostUtils.test.ts
import { describe, it, expect } from "vitest";
import { calculateSpentToDate, calculateExpectedRemaining, calculateDailyBurnRate } from "../rentalCostUtils";

// Helpers
const dateStr = (daysAgo: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split("T")[0];
};
const futureDateStr = (daysFromNow: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split("T")[0];
};

const makeItem = (qty: number, rate: number, qtyReturned = 0) => ({
  id: "item-1",
  quantity: qty,
  daily_rate_actual: rate,
  quantity_returned: qtyReturned,
  quantity_outstanding: qty - qtyReturned,
});

describe("calculateSpentToDate", () => {
  it("computes cost for fully outstanding items", () => {
    const items = [makeItem(50, 8, 0), makeItem(30, 5, 0)];
    const startDate = dateStr(18);
    // 50 × 8 × 18 = 7,200  |  30 × 5 × 18 = 2,700  → 9,900
    const result = calculateSpentToDate(items as any, [], startDate);
    expect(result).toBe(9900);
  });

  it("includes returned item cost up to return date", () => {
    const startDate = dateStr(18);
    const returnDate = dateStr(10); // returned 10 days ago = day 8
    const items = [makeItem(50, 8, 20)];
    const returns = [
      { rental_order_item_id: "item-1", quantity_returned: 20, return_date: returnDate, condition: "good" as const, id: "r1", rental_order_id: "o1", created_at: "", created_by: "" },
    ];
    // Outstanding 30 × 8 × 18 = 4,320
    // Returned 20 × 8 × (18-10) = 20 × 8 × 8 = 1,280
    // Total = 5,600
    const result = calculateSpentToDate(items as any, returns as any, startDate);
    expect(result).toBe(5600);
  });

  it("returns 0 for empty items", () => {
    expect(calculateSpentToDate([], [], dateStr(5))).toBe(0);
  });
});

describe("calculateExpectedRemaining", () => {
  it("computes remaining cost for outstanding items", () => {
    const items = [makeItem(50, 8, 0), makeItem(30, 5, 0)];
    const startDate = dateStr(18);
    const expectedReturn = futureDateStr(7);
    // 50 × 8 × 7 = 2,800  |  30 × 5 × 7 = 1,050  → 3,850
    const result = calculateExpectedRemaining(items as any, startDate, expectedReturn);
    expect(result).toBe(3850);
  });

  it("returns 0 when expected return date is in the past (overdue)", () => {
    const items = [makeItem(50, 8, 0)];
    const result = calculateExpectedRemaining(items as any, dateStr(30), dateStr(5));
    expect(result).toBe(0);
  });
});

describe("calculateDailyBurnRate", () => {
  it("returns spent / days elapsed", () => {
    expect(calculateDailyBurnRate(9900, 18)).toBe(550);
  });
  it("returns 0 when daysElapsed is 0", () => {
    expect(calculateDailyBurnRate(9900, 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm run test -- rentalCostUtils --reporter=verbose
```

Expected: `Cannot find module '../rentalCostUtils'`

- [ ] **Step 3: Implement utilities**

```typescript
// src/lib/utils/rentalCostUtils.ts
import type { RentalOrderItemWithDetails, RentalReturn } from "@/types/rental.types";

function daysBetween(from: string, to: Date = new Date()): number {
  const fromDate = new Date(from);
  fromDate.setHours(0, 0, 0, 0);
  const toDate = new Date(to);
  toDate.setHours(0, 0, 0, 0);
  return Math.floor((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
}

export function calculateSpentToDate(
  items: RentalOrderItemWithDetails[],
  returns: RentalReturn[],
  startDate: string,
  today: Date = new Date()
): number {
  const daysElapsed = Math.max(0, daysBetween(startDate, today));

  return items.reduce((total, item) => {
    const itemReturns = returns.filter((r) => r.rental_order_item_id === item.id);

    const returnedCost = itemReturns.reduce((sum, r) => {
      const daysUsed = Math.max(0, daysBetween(startDate, new Date(r.return_date)));
      return sum + r.quantity_returned * item.daily_rate_actual * daysUsed;
    }, 0);

    const outstandingCost = item.quantity_outstanding * item.daily_rate_actual * daysElapsed;
    return total + returnedCost + outstandingCost;
  }, 0);
}

export function calculateExpectedRemaining(
  items: RentalOrderItemWithDetails[],
  startDate: string,
  expectedReturnDate: string,
  today: Date = new Date()
): number {
  const daysRemaining = Math.max(0, daysBetween(today.toISOString().split("T")[0], new Date(expectedReturnDate)));

  return items.reduce((total, item) => {
    return total + item.quantity_outstanding * item.daily_rate_actual * daysRemaining;
  }, 0);
}

export function calculateDailyBurnRate(spentToDate: number, daysElapsed: number): number {
  if (daysElapsed === 0) return 0;
  return Math.round(spentToDate / daysElapsed);
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm run test -- rentalCostUtils --reporter=verbose
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/rentalCostUtils.ts src/lib/utils/__tests__/rentalCostUtils.test.ts
git commit -m "feat(rentals): add rentalCostUtils with spentToDate and expectedRemaining calculations"
```

---

## Task 4: React Query Hooks for Lifecycle

**Files:**
- Modify: `src/hooks/queries/useRentals.ts`

- [ ] **Step 1: Add request-specific hooks after existing order hooks**

```typescript
// ── Request workflow hooks ──────────────────────────────────────────────────

export function useCreateRentalRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: RentalOrderFormData & { estimated_days: number }) => {
      const { data: result, error } = await supabase
        .from("rental_orders")
        .insert({ ...data, status: "pending" })
        .select()
        .single();
      if (error) throw error;
      return result as RentalOrder;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: rentalQueryKeys.orders.bySite(vars.site_id) });
    },
  });
}

export function useApproveRentalRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase
        .from("rental_orders")
        .update({ status: "approved" })
        .eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: rentalQueryKeys.orders.all });
    },
  });
}

// ── Delivery verification hook ──────────────────────────────────────────────

export function useConfirmRentalDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orderId,
      deliveryDate,
      actualTransportCost,
      itemsReceived,  // Array of { order_item_id, qty_received }
    }: {
      orderId: string;
      deliveryDate: string;
      actualTransportCost: number;
      itemsReceived: { order_item_id: string; qty_received: number }[];
    }) => {
      // Update order: status → active, set start_date and actual transport
      const { error: orderError } = await supabase
        .from("rental_orders")
        .update({
          status: "active",
          start_date: deliveryDate,
          transport_cost_outward: actualTransportCost,
        })
        .eq("id", orderId);
      if (orderError) throw orderError;

      // Update any items with short delivery
      for (const item of itemsReceived) {
        if (item.qty_received !== undefined) {
          await supabase
            .from("rental_order_items")
            .update({ quantity: item.qty_received })
            .eq("id", item.order_item_id);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: rentalQueryKeys.orders.all });
    },
  });
}

// ── Date extension hook ─────────────────────────────────────────────────────

export function useExtendRentalReturnDate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orderId,
      newExpectedReturnDate,
      reason,
    }: {
      orderId: string;
      newExpectedReturnDate: string;
      reason: string;
    }) => {
      const { error } = await supabase
        .from("rental_orders")
        .update({
          expected_return_date: newExpectedReturnDate,
          internal_notes: `Extended to ${newExpectedReturnDate}: ${reason}`,
        })
        .eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: rentalQueryKeys.orders.all });
    },
  });
}

// ── 3-party settlement mutation ─────────────────────────────────────────────

export function useCreateRentalSettlementParty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: RentalSettlementFormData) => {
      const { data: result, error } = await supabase
        .from("rental_settlements")
        .upsert(
          { ...data },
          { onConflict: "rental_order_id,party_type" }
        )
        .select()
        .single();
      if (error) throw error;
      return result as RentalSettlement;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: rentalQueryKeys.orders.byId(vars.rental_order_id) });
    },
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/queries/useRentals.ts
git commit -m "feat(rentals): add request, delivery, date extension, and 3-party settlement hooks"
```

---

## Task 5: ActiveOrderCostMeter Component

**Files:**
- Create: `src/components/rentals/ActiveOrderCostMeter.tsx`

- [ ] **Step 1: Create the component**

```typescript
// src/components/rentals/ActiveOrderCostMeter.tsx
"use client";

import { useMemo } from "react";
import { Box, Chip, LinearProgress, Stack, Typography, Button } from "@mui/material";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import {
  calculateSpentToDate,
  calculateExpectedRemaining,
  calculateDailyBurnRate,
} from "@/lib/utils/rentalCostUtils";
import type { RentalOrderWithDetails } from "@/types/rental.types";

interface ActiveOrderCostMeterProps {
  order: RentalOrderWithDetails;
  onExtendDate: () => void;
}

const formatINR = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);

export function ActiveOrderCostMeter({ order, onExtendDate }: ActiveOrderCostMeterProps) {
  const today = new Date();
  const startDate = order.start_date ?? order.order_date;

  const returns = order.returns ?? [];
  const items = order.items ?? [];

  const daysElapsed = useMemo(() => {
    if (!startDate) return 0;
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return Math.max(0, Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  }, [startDate]);

  const spent = useMemo(
    () => calculateSpentToDate(items, returns, startDate, today),
    [items, returns, startDate]
  );

  const remaining = useMemo(
    () =>
      order.expected_return_date
        ? calculateExpectedRemaining(items, startDate, order.expected_return_date, today)
        : 0,
    [items, startDate, order.expected_return_date]
  );

  const expectedTotal = spent + remaining;
  const burnRate = calculateDailyBurnRate(spent, daysElapsed);
  const progress = expectedTotal > 0 ? Math.min(100, (spent / expectedTotal) * 100) : 0;

  const expectedReturnDate = order.expected_return_date
    ? new Date(order.expected_return_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })
    : "—";

  const daysLeft = order.expected_return_date
    ? Math.max(0, Math.floor((new Date(order.expected_return_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)))
    : null;

  const isOverdue = daysLeft !== null && daysLeft === 0 && remaining === 0;

  return (
    <Box sx={{ mt: 1.5 }}>
      {/* Three number cards */}
      <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
        <Box sx={{ flex: 1, bgcolor: "success.light", borderRadius: 1.5, p: 1, textAlign: "center" }}>
          <Typography variant="caption" color="success.dark" fontWeight={700} display="block" sx={{ fontSize: 9 }}>
            SPENT TO DATE
          </Typography>
          <Typography variant="subtitle2" fontWeight={800}>₹{formatINR(spent)}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9 }}>
            {daysElapsed} days
          </Typography>
        </Box>
        <Box sx={{ flex: 1, bgcolor: "info.light", borderRadius: 1.5, p: 1, textAlign: "center" }}>
          <Typography variant="caption" color="info.dark" fontWeight={700} display="block" sx={{ fontSize: 9 }}>
            EXPECTED REMAINING
          </Typography>
          <Typography variant="subtitle2" fontWeight={800} color="warning.dark">
            ₹{formatINR(remaining)}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9 }}>
            {daysLeft !== null ? `${daysLeft} days left` : "—"}
          </Typography>
        </Box>
        <Box sx={{ flex: 1, bgcolor: "action.hover", borderRadius: 1.5, p: 1, textAlign: "center" }}>
          <Typography variant="caption" color="text.secondary" fontWeight={700} display="block" sx={{ fontSize: 9 }}>
            EXPECTED TOTAL
          </Typography>
          <Typography variant="subtitle2" fontWeight={800}>₹{formatINR(expectedTotal)}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9 }}>
            if returned {expectedReturnDate}
          </Typography>
        </Box>
      </Stack>

      {/* Progress bar */}
      <Box sx={{ mb: 0.5 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.25 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
            Day 1 · {startDate ? new Date(startDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
            Day {daysElapsed + (daysLeft ?? 0)} · {expectedReturnDate}
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={progress}
          color={isOverdue ? "error" : "success"}
          sx={{ height: 10, borderRadius: 5 }}
        />
        <Box sx={{ display: "flex", justifyContent: "space-between", mt: 0.25 }}>
          <Typography variant="caption" color="success.main" fontWeight={600} sx={{ fontSize: 10 }}>
            ₹{formatINR(spent)} spent ({Math.round(progress)}%)
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
            ₹{formatINR(remaining)} remaining
          </Typography>
        </Box>
      </Box>

      {/* Burn rate + extend button */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 1 }}>
        <Typography variant="caption" color="text.secondary">
          Daily burn: <strong>₹{formatINR(burnRate)}/day</strong>
        </Typography>
        <Button
          size="small"
          variant="outlined"
          color={isOverdue ? "error" : "warning"}
          startIcon={<CalendarMonthIcon sx={{ fontSize: 14 }} />}
          onClick={onExtendDate}
          sx={{ fontSize: 11 }}
        >
          {isOverdue ? "Overdue — Extend" : "Extend Date"}
        </Button>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 2: Export from barrel**

```typescript
export { ActiveOrderCostMeter } from "./ActiveOrderCostMeter";
```

- [ ] **Step 3: Commit**

```bash
git add src/components/rentals/ActiveOrderCostMeter.tsx src/components/rentals/index.ts
git commit -m "feat(rentals): add ActiveOrderCostMeter with progress bar and daily burn rate"
```

---

## Task 6: DateExtensionDialog

**Files:**
- Create: `src/components/rentals/DateExtensionDialog.tsx`

- [ ] **Step 1: Create the dialog**

```typescript
// src/components/rentals/DateExtensionDialog.tsx
"use client";

import { useState } from "react";
import {
  Button, Dialog, DialogActions, DialogContent, DialogTitle,
  TextField, Typography, Box, Alert,
} from "@mui/material";
import { useExtendRentalReturnDate } from "@/hooks/queries/useRentals";

interface DateExtensionDialogProps {
  open: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber: string;
  currentExpectedReturnDate: string;
}

export function DateExtensionDialog({
  open,
  onClose,
  orderId,
  orderNumber,
  currentExpectedReturnDate,
}: DateExtensionDialogProps) {
  const [newDate, setNewDate] = useState("");
  const [reason, setReason] = useState("");
  const extendDate = useExtendRentalReturnDate();

  const currentFormatted = new Date(currentExpectedReturnDate).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });

  const isValid = newDate && reason.trim().length >= 5 && newDate > currentExpectedReturnDate;

  const handleSubmit = async () => {
    if (!isValid) return;
    await extendDate.mutateAsync({ orderId, newExpectedReturnDate: newDate, reason });
    onClose();
    setNewDate("");
    setReason("");
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Extend Return Date — {orderNumber}</DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 1.5 }}>
          <Typography variant="caption" color="text.secondary">Current expected return</Typography>
          <Typography variant="body2" fontWeight={600} color="error.main">{currentFormatted}</Typography>
        </Box>

        <TextField
          label="New expected return date"
          type="date"
          fullWidth
          size="small"
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
          inputProps={{ min: currentExpectedReturnDate }}
          InputLabelProps={{ shrink: true }}
          sx={{ mb: 2 }}
        />

        <TextField
          label="Reason for extension"
          multiline
          rows={2}
          fullWidth
          size="small"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Slab curing delayed by rain"
          helperText="Minimum 5 characters required"
        />

        {newDate && reason.trim().length >= 5 && (
          <Alert severity="info" sx={{ mt: 1.5, fontSize: 12 }}>
            Expected additional cost: calculated when extended
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} size="small">Cancel</Button>
        <Button
          variant="contained"
          color="warning"
          onClick={handleSubmit}
          disabled={!isValid || extendDate.isPending}
          size="small"
        >
          Extend Date
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

- [ ] **Step 2: Export from barrel**

```typescript
export { DateExtensionDialog } from "./DateExtensionDialog";
```

- [ ] **Step 3: Commit**

```bash
git add src/components/rentals/DateExtensionDialog.tsx src/components/rentals/index.ts
git commit -m "feat(rentals): add DateExtensionDialog with mandatory reason field"
```

---

## Task 7: DeliveryVerificationForm

**Files:**
- Create: `src/components/rentals/DeliveryVerificationForm.tsx`

- [ ] **Step 1: Create the component**

```typescript
// src/components/rentals/DeliveryVerificationForm.tsx
"use client";

import { useState } from "react";
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, Stack, TextField, Typography,
} from "@mui/material";
import { useConfirmRentalDelivery } from "@/hooks/queries/useRentals";
import type { RentalOrderWithDetails } from "@/types/rental.types";

interface DeliveryVerificationFormProps {
  open: boolean;
  onClose: () => void;
  order: RentalOrderWithDetails;
}

export function DeliveryVerificationForm({ open, onClose, order }: DeliveryVerificationFormProps) {
  const confirmDelivery = useConfirmRentalDelivery();
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().split("T")[0]);
  const [actualTransportCost, setActualTransportCost] = useState(
    order.transport_cost_outward?.toString() ?? "0"
  );
  const [itemQtys, setItemQtys] = useState<Record<string, number>>(
    Object.fromEntries((order.items ?? []).map((i) => [i.id, i.quantity]))
  );

  const handleSubmit = async () => {
    await confirmDelivery.mutateAsync({
      orderId: order.id,
      deliveryDate,
      actualTransportCost: parseFloat(actualTransportCost) || 0,
      itemsReceived: Object.entries(itemQtys).map(([order_item_id, qty_received]) => ({
        order_item_id,
        qty_received,
      })),
    });
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Verify Delivery — {order.rental_order_number}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Confirm items received and actual transport cost. Adjust quantity if fewer items arrived.
        </Typography>

        <TextField
          label="Delivery date"
          type="date"
          fullWidth
          size="small"
          value={deliveryDate}
          onChange={(e) => setDeliveryDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
          sx={{ mb: 2 }}
        />

        <Typography variant="subtitle2" sx={{ mb: 1 }}>Items Received</Typography>
        <Stack spacing={1} sx={{ mb: 2 }}>
          {(order.items ?? []).map((item) => (
            <Box
              key={item.id}
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                p: 1,
                bgcolor: "action.hover",
                borderRadius: 1,
              }}
            >
              <Box>
                <Typography variant="body2" fontWeight={600}>
                  {item.rental_item?.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Ordered: {item.quantity} pcs
                </Typography>
              </Box>
              <TextField
                type="number"
                size="small"
                label="Received"
                value={itemQtys[item.id] ?? item.quantity}
                onChange={(e) =>
                  setItemQtys((prev) => ({
                    ...prev,
                    [item.id]: Math.max(0, Math.min(item.quantity, Number(e.target.value))),
                  }))
                }
                inputProps={{ min: 0, max: item.quantity }}
                sx={{ width: 100 }}
              />
            </Box>
          ))}
        </Stack>

        <Divider sx={{ mb: 2 }} />

        <TextField
          label="Actual transport cost (outward)"
          type="number"
          fullWidth
          size="small"
          value={actualTransportCost}
          onChange={(e) => setActualTransportCost(e.target.value)}
          InputProps={{ startAdornment: <Typography sx={{ mr: 0.5 }}>₹</Typography> }}
          helperText="Update if actual cost differs from PO estimate"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} size="small">Cancel</Button>
        <Button
          variant="contained"
          color="success"
          onClick={handleSubmit}
          disabled={confirmDelivery.isPending}
          size="small"
        >
          Confirm Delivery → Mark Active
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

- [ ] **Step 2: Export from barrel**

```typescript
export { DeliveryVerificationForm } from "./DeliveryVerificationForm";
```

- [ ] **Step 3: Commit**

```bash
git add src/components/rentals/DeliveryVerificationForm.tsx src/components/rentals/index.ts
git commit -m "feat(rentals): add DeliveryVerificationForm for confirming received qty and transport cost"
```

---

## Task 8: MultiPartySettlementDialog

**Files:**
- Create: `src/components/rentals/MultiPartySettlementDialog.tsx`

- [ ] **Step 1: Create the 3-party settlement dialog**

```typescript
// src/components/rentals/MultiPartySettlementDialog.tsx
"use client";

import { useState } from "react";
import {
  Box, Button, Chip, Dialog, DialogContent, DialogTitle,
  Divider, MenuItem, Select, Stack, TextField, Typography,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import SkipNextIcon from "@mui/icons-material/SkipNext";
import { useCreateRentalSettlementParty } from "@/hooks/queries/useRentals";
import {
  RENTAL_SETTLEMENT_PARTY_LABELS,
  type RentalOrderWithDetails,
  type RentalSettlementPartyType,
} from "@/types/rental.types";
import { calculateSpentToDate } from "@/lib/utils/rentalCostUtils";

interface MultiPartySettlementDialogProps {
  open: boolean;
  onClose: () => void;
  order: RentalOrderWithDetails;
}

interface PartyState {
  skipped: boolean;
  payer_source: string;
  payment_mode: string;
  party_name: string;
  amount: number;
}

const PAYER_SOURCES = ["Company Account", "Site Cash", "Engineer Wallet"];
const PAYMENT_MODES = ["Cash", "Bank Transfer", "UPI", "Cheque"];

export function MultiPartySettlementDialog({ open, onClose, order }: MultiPartySettlementDialogProps) {
  const settleParty = useCreateRentalSettlementParty();

  const totalAdvances = (order.advances ?? []).reduce((s, a) => s + (a.amount ?? 0), 0);
  const rentalAmount = calculateSpentToDate(
    order.items ?? [],
    order.returns ?? [],
    order.start_date ?? order.order_date
  );
  const transportAmount =
    (order.transport_cost_outward ?? 0) + (order.transport_cost_return ?? 0);
  const loadingAmount =
    (order.loading_cost_outward ?? 0) + (order.unloading_cost_outward ?? 0) +
    (order.loading_cost_return ?? 0) + (order.unloading_cost_return ?? 0);

  const alreadySettled = new Set(
    (order.settlements ?? []).map((s) => s.party_type)
  );

  const [parties, setParties] = useState<Record<RentalSettlementPartyType, PartyState>>({
    vendor: {
      skipped: false,
      payer_source: "Company Account",
      payment_mode: "Bank Transfer",
      party_name: order.vendor?.name ?? "",
      amount: Math.max(0, rentalAmount - totalAdvances),
    },
    transport: {
      skipped: transportAmount === 0,
      payer_source: "Site Cash",
      payment_mode: "Cash",
      party_name: "",
      amount: transportAmount,
    },
    loading_unloading: {
      skipped: true,
      payer_source: "Engineer Wallet",
      payment_mode: "Cash",
      party_name: "Site Laborers",
      amount: loadingAmount,
    },
  });

  const updateParty = (type: RentalSettlementPartyType, patch: Partial<PartyState>) =>
    setParties((prev) => ({ ...prev, [type]: { ...prev[type], ...patch } }));

  const handleSettle = async (partyType: RentalSettlementPartyType) => {
    const p = parties[partyType];
    await settleParty.mutateAsync({
      rental_order_id: order.id,
      party_type: partyType,
      party_name: p.party_name || null,
      settlement_date: new Date().toISOString().split("T")[0],
      total_rental_amount: partyType === "vendor" ? rentalAmount : 0,
      total_transport_amount: partyType === "transport" ? transportAmount : 0,
      total_damage_amount: 0,
      negotiated_final_amount: p.amount,
      total_advance_paid: partyType === "vendor" ? totalAdvances : 0,
      balance_amount: p.amount,
      payment_mode: p.payment_mode,
      payer_source: p.payer_source,
      payer_name: p.party_name,
    } as any);
  };

  const partyTypes: RentalSettlementPartyType[] = ["vendor", "transport", "loading_unloading"];
  const partyColors: Record<RentalSettlementPartyType, "success" | "info" | "warning"> = {
    vendor: "success",
    transport: "info",
    loading_unloading: "warning",
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Settlement — {order.rental_order_number}</DialogTitle>

      {/* Grand total summary */}
      <Box sx={{ px: 2.5, pb: 1 }}>
        <Stack direction="row" spacing={1}>
          <Box sx={{ flex: 1, bgcolor: "success.light", borderRadius: 1, p: 1, textAlign: "center" }}>
            <Typography variant="caption" display="block" sx={{ fontSize: 9 }}>RENTAL</Typography>
            <Typography variant="body2" fontWeight={700}>₹{rentalAmount.toLocaleString("en-IN")}</Typography>
          </Box>
          <Box sx={{ flex: 1, bgcolor: "info.light", borderRadius: 1, p: 1, textAlign: "center" }}>
            <Typography variant="caption" display="block" sx={{ fontSize: 9 }}>TRANSPORT</Typography>
            <Typography variant="body2" fontWeight={700}>₹{transportAmount.toLocaleString("en-IN")}</Typography>
          </Box>
          <Box sx={{ flex: 1, bgcolor: "warning.light", borderRadius: 1, p: 1, textAlign: "center" }}>
            <Typography variant="caption" display="block" sx={{ fontSize: 9 }}>LOADING</Typography>
            <Typography variant="body2" fontWeight={700}>₹{loadingAmount.toLocaleString("en-IN")}</Typography>
          </Box>
        </Stack>
      </Box>

      <DialogContent sx={{ pt: 1 }}>
        {partyTypes.map((partyType) => {
          const p = parties[partyType];
          const isSettled = alreadySettled.has(partyType);
          const color = partyColors[partyType];

          return (
            <Box
              key={partyType}
              sx={{
                border: "1px solid",
                borderColor: `${color}.main`,
                borderRadius: 2,
                p: 1.5,
                mb: 1.5,
                opacity: p.skipped ? 0.5 : 1,
              }}
            >
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                <Box>
                  <Typography variant="caption" color={`${color}.dark`} fontWeight={700}>
                    {RENTAL_SETTLEMENT_PARTY_LABELS[partyType].toUpperCase()}
                  </Typography>
                  <Typography variant="subtitle2" fontWeight={700}>{p.party_name || "—"}</Typography>
                </Box>
                {isSettled ? (
                  <Chip icon={<CheckCircleIcon />} label="Settled" size="small" color="success" />
                ) : p.skipped ? (
                  <Chip icon={<SkipNextIcon />} label="Skipped" size="small" color="default" />
                ) : null}
              </Box>

              {!isSettled && !p.skipped && (
                <>
                  {partyType !== "vendor" && (
                    <TextField
                      label="Person name"
                      size="small"
                      fullWidth
                      value={p.party_name}
                      onChange={(e) => updateParty(partyType, { party_name: e.target.value })}
                      sx={{ mb: 1 }}
                    />
                  )}
                  <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                    <TextField
                      label="Amount (₹)"
                      type="number"
                      size="small"
                      value={p.amount}
                      onChange={(e) => updateParty(partyType, { amount: parseFloat(e.target.value) || 0 })}
                      sx={{ flex: 1 }}
                    />
                    <Select
                      size="small"
                      value={p.payer_source}
                      onChange={(e) => updateParty(partyType, { payer_source: e.target.value })}
                      sx={{ flex: 1 }}
                    >
                      {PAYER_SOURCES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                    </Select>
                  </Stack>
                  {partyType === "vendor" && totalAdvances > 0 && (
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>
                      Advances paid: ₹{totalAdvances.toLocaleString("en-IN")} (deducted from balance)
                    </Typography>
                  )}
                  <Stack direction="row" spacing={1}>
                    <Button
                      variant="contained"
                      color={color}
                      size="small"
                      onClick={() => handleSettle(partyType)}
                      disabled={settleParty.isPending}
                      sx={{ flex: 1 }}
                    >
                      Settle ₹{p.amount.toLocaleString("en-IN")}
                    </Button>
                    {partyType !== "vendor" && (
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => updateParty(partyType, { skipped: true })}
                        sx={{ fontSize: 10 }}
                      >
                        {partyType === "loading_unloading" ? "Skip — our laborers" : "Skip — vendor included"}
                      </Button>
                    )}
                  </Stack>
                </>
              )}
            </Box>
          );
        })}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Export from barrel**

```typescript
export { MultiPartySettlementDialog } from "./MultiPartySettlementDialog";
```

- [ ] **Step 3: Commit**

```bash
git add src/components/rentals/MultiPartySettlementDialog.tsx src/components/rentals/index.ts
git commit -m "feat(rentals): add MultiPartySettlementDialog for 3-party vendor/transport/loading settlement"
```

---

## Task 9: RentalRequestForm

**Files:**
- Create: `src/components/rentals/RentalRequestForm.tsx`

- [ ] **Step 1: Create the form dialog**

```typescript
// src/components/rentals/RentalRequestForm.tsx
"use client";

import { useState } from "react";
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, Stack, TextField, Typography,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import { useCreateRentalRequest } from "@/hooks/queries/useRentals";
import type { EstimateBasketItem } from "@/types/rental.types";

interface RequestItem {
  rental_item_id: string;
  rental_item_name: string;
  size_label: string | null;
  quantity: number;
}

interface RentalRequestFormProps {
  open: boolean;
  onClose: () => void;
  siteId: string;
  prefillItems?: EstimateBasketItem[];   // from estimate basket
  onSuccess?: () => void;
}

export function RentalRequestForm({
  open,
  onClose,
  siteId,
  prefillItems = [],
  onSuccess,
}: RentalRequestFormProps) {
  const createRequest = useCreateRentalRequest();

  const [items, setItems] = useState<RequestItem[]>(() =>
    prefillItems.map((i) => ({
      rental_item_id: i.rental_item_id,
      rental_item_name: i.rental_item_name,
      size_label: i.size_label,
      quantity: i.quantity,
    }))
  );

  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [estimatedDays, setEstimatedDays] = useState(prefillItems[0]?.days ?? 25);
  const [notes, setNotes] = useState("");

  const updateItem = (idx: number, patch: Partial<RequestItem>) =>
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)));

  const removeItem = (idx: number) =>
    setItems((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = async () => {
    await createRequest.mutateAsync({
      site_id: siteId,
      vendor_id: null as any,
      order_date: startDate,
      start_date: startDate,
      expected_return_date: null as any,
      estimated_days: estimatedDays,
      notes,
      items: items.map((item) => ({
        rental_item_id: item.rental_item_id,
        quantity: item.quantity,
        daily_rate_default: 0,
        daily_rate_actual: 0,
        rate_type: "daily" as const,
      })),
    } as any);
    onSuccess?.();
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>New Rental Request</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Submit a request for the engineer to create a Purchase Order.
        </Typography>

        <Typography variant="subtitle2" sx={{ mb: 1 }}>Items</Typography>
        <Stack spacing={1} sx={{ mb: 2 }}>
          {items.map((item, idx) => (
            <Box
              key={idx}
              sx={{
                display: "flex",
                gap: 1,
                alignItems: "center",
                p: 1,
                bgcolor: "action.hover",
                borderRadius: 1,
              }}
            >
              <Box sx={{ flex: 1 }}>
                <Typography variant="body2" fontWeight={600}>{item.rental_item_name}</Typography>
                {item.size_label && (
                  <Typography variant="caption" color="text.secondary">{item.size_label}</Typography>
                )}
              </Box>
              <TextField
                type="number"
                size="small"
                label="Qty"
                value={item.quantity}
                onChange={(e) => updateItem(idx, { quantity: Math.max(1, Number(e.target.value)) })}
                inputProps={{ min: 1 }}
                sx={{ width: 80 }}
              />
              <IconButton size="small" color="error" onClick={() => removeItem(idx)}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Box>
          ))}
        </Stack>

        <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
          <TextField
            label="Start date"
            type="date"
            size="small"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ flex: 1 }}
          />
          <TextField
            label="Estimated days"
            type="number"
            size="small"
            value={estimatedDays}
            onChange={(e) => setEstimatedDays(Math.max(1, Number(e.target.value)))}
            inputProps={{ min: 1 }}
            sx={{ flex: 1 }}
          />
        </Stack>

        <TextField
          label="Notes (optional)"
          multiline
          rows={2}
          fullWidth
          size="small"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. For 2nd floor slab centering"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} size="small">Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={items.length === 0 || createRequest.isPending}
          size="small"
        >
          Submit Request
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

- [ ] **Step 2: Export from barrel**

```typescript
export { RentalRequestForm } from "./RentalRequestForm";
```

- [ ] **Step 3: Commit**

```bash
git add src/components/rentals/RentalRequestForm.tsx src/components/rentals/index.ts
git commit -m "feat(rentals): add RentalRequestForm for supervisor to submit rental requests"
```

---

## Task 10: Update RentalOrderCard with Cost Meter

**Files:**
- Modify: `src/components/rentals/RentalOrderCard.tsx`

- [ ] **Step 1: Add cost meter and action buttons to active orders**

Open `RentalOrderCard.tsx`. Find where the card renders order details and add:

```typescript
// Add imports:
import { ActiveOrderCostMeter } from "./ActiveOrderCostMeter";
import { DateExtensionDialog } from "./DateExtensionDialog";
import { DeliveryVerificationForm } from "./DeliveryVerificationForm";
import { MultiPartySettlementDialog } from "./MultiPartySettlementDialog";

// Add state inside the card component:
const [extendOpen, setExtendOpen] = useState(false);
const [deliveryOpen, setDeliveryOpen] = useState(false);
const [settlementOpen, setSettlementOpen] = useState(false);

// After the existing order header info, add:
{order.status === "active" && order.start_date && (
  <ActiveOrderCostMeter
    order={order}
    onExtendDate={() => setExtendOpen(true)}
  />
)}

{/* Action buttons row */}
<Box sx={{ display: "flex", gap: 1, mt: 1.5, flexWrap: "wrap" }}>
  {order.status === "confirmed" && (
    <Button size="small" variant="outlined" color="success" onClick={() => setDeliveryOpen(true)}>
      Verify Delivery
    </Button>
  )}
  {order.status === "active" && (
    <Button size="small" variant="outlined" color="error" onClick={() => {/* open RentalReturnDialog */}}>
      Return Items
    </Button>
  )}
  {(order.status === "fully_returned" || order.status === "completed") && (
    <Button size="small" variant="outlined" color="primary" onClick={() => setSettlementOpen(true)}>
      Settle
    </Button>
  )}
</Box>

{/* Dialogs */}
{order.expected_return_date && (
  <DateExtensionDialog
    open={extendOpen}
    onClose={() => setExtendOpen(false)}
    orderId={order.id}
    orderNumber={order.rental_order_number}
    currentExpectedReturnDate={order.expected_return_date}
  />
)}

<DeliveryVerificationForm
  open={deliveryOpen}
  onClose={() => setDeliveryOpen(false)}
  order={order}
/>

<MultiPartySettlementDialog
  open={settlementOpen}
  onClose={() => setSettlementOpen(false)}
  order={order}
/>
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/rentals/RentalOrderCard.tsx
git commit -m "feat(rentals): embed cost meter, delivery verification, and settlement into RentalOrderCard"
```

---

## Task 11: Wire /site/rentals Page

**Files:**
- Modify: `src/app/(main)/site/rentals/page.tsx`

- [ ] **Step 1: Add "New Rental Request" entry point and pending requests section**

In the site/rentals page, add:
1. A "+ New Rental Request" button in the top bar
2. A "Pending Requests" section visible to supervisors showing requests awaiting engineer approval
3. Status filter tabs (All / Pending / Active / Returned / Settled)

```typescript
// Add to existing imports:
import { RentalRequestForm } from "@/components/rentals/RentalRequestForm";
import { useApproveRentalRequest } from "@/hooks/queries/useRentals";

// Add state:
const [requestFormOpen, setRequestFormOpen] = useState(false);

// In top bar, add button:
<Button
  variant="contained"
  startIcon={<AddIcon />}
  onClick={() => setRequestFormOpen(true)}
  size="small"
>
  New Rental Request
</Button>

// Show pending requests for engineer to approve:
{pendingOrders.length > 0 && (
  <Box sx={{ mb: 2 }}>
    <Typography variant="subtitle2" color="warning.main" gutterBottom>
      {pendingOrders.length} request{pendingOrders.length > 1 ? "s" : ""} awaiting PO
    </Typography>
    {pendingOrders.map((order) => (
      <RentalOrderCard key={order.id} order={order} />
    ))}
  </Box>
)}

// Rental request form dialog:
<RentalRequestForm
  open={requestFormOpen}
  onClose={() => setRequestFormOpen(false)}
  siteId={selectedSiteId}
  onSuccess={() => setRequestFormOpen(false)}
/>
```

- [ ] **Step 2: Verify the full flow end-to-end**

1. Go to `/site/rentals`
2. Click "+ New Rental Request"
3. Add items manually, set start date + estimated days, submit
4. Confirm the order appears with "Pending" status
5. Approve it (engineer role) → status → "Approved"
6. Create PO from approved request (using existing RentalOrderDialog or a new PO form)
7. Confirm delivery → status → "Active"
8. Verify cost meter appears on the active card
9. Click "Extend Date" → enter reason → confirm
10. Click "Return Items" → return some → cost meter recalculates
11. Return all → "Settle" button appears
12. Settle vendor (skip loading) → order completes

- [ ] **Step 3: Run full test suite and build**

```bash
npm run test
npm run build
```

Expected: all tests pass, build succeeds.

- [ ] **Step 4: Final commit**

```bash
git add src/app/\(main\)/site/rentals/page.tsx
git commit -m "feat(rentals): wire rental request creation and pending approval flow on /site/rentals"
```

---

## Task 12: Visual Verification

- [ ] **Step 1: Run dev server and login**

```bash
npm run dev
```

Navigate to `http://localhost:3000/dev-login`.

- [ ] **Step 2: Verify full lifecycle flow using Playwright**

Use Playwright MCP to:
1. Navigate to `/site/rentals`
2. Take screenshot — confirm pending requests section and "+ New Rental Request" button visible
3. Confirm active orders show cost meter with progress bar
4. Click an active order's "Extend Date" — verify dialog opens
5. Navigate to `/company/rentals` — confirm Phase 1 catalog still working (regression check)

- [ ] **Step 3: Check browser console for errors**

Read console logs via Playwright. Fix any errors found.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(rentals): Phases 2-4 complete — request workflow, delivery, cost meter, returns, 3-party settlement"
```

---

## Summary

After completing all 12 tasks, the rental lifecycle will have:
- Schema: `parent_order_id`, `party_type` on settlements with correct UNIQUE constraint
- Supervisor can create rental requests (from estimate basket or standalone)
- Engineer approves and creates PO with vendor, transport details, advance payment
- Supervisor verifies delivery (qty received, actual transport cost)
- Active orders show live cost meter: spent / remaining / progress bar / daily burn / extend date
- Partial returns recorded with auto cost calculation per returned item
- 3-party settlement: vendor (balance after advances), transport (optional), loading/unloading (skippable)
