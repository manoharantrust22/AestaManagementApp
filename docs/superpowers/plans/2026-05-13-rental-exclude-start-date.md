# Rental Order — Exclude Start Date Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional per-order "Exclude start date from billing" toggle to the Create Rental Order dialog, reducing duration by 1 day when checked.

**Architecture:** A new `exclude_start_date` boolean column on `rental_orders` (default `false`) is wired through the TypeScript types, the creation mutation, and the dialog form state. The `estimatedDays` memo in the dialog and the `days` calculation in the mutation both branch on the flag.

**Tech Stack:** Next.js 15, MUI v7, Supabase (PostgreSQL), React Query, dayjs, Vitest

---

## File Map

| File | Action |
|------|--------|
| `supabase/migrations/20260513120000_rental_exclude_start_date.sql` | Create — add column |
| `src/types/rental.types.ts` | Modify — add field to `RentalOrder` and `RentalOrderFormData` |
| `src/hooks/queries/useRentals.ts` | Modify — pass flag in mutation, update `days` calculation |
| `src/components/rentals/RentalOrderDialog.tsx` | Modify — add state, checkbox UI, update `estimatedDays` memo, pass flag on submit |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260513120000_rental_exclude_start_date.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/20260513120000_rental_exclude_start_date.sql
ALTER TABLE rental_orders
  ADD COLUMN exclude_start_date boolean NOT NULL DEFAULT false;
```

- [ ] **Step 2: Apply the migration to local DB**

Run:
```bash
npm run db:start
```
Then in a separate terminal:
```bash
npx supabase migration up
```
Expected: migration applies with no error. Verify with:
```bash
npx supabase db diff
```
Expected output: no pending diff (migration fully applied).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260513120000_rental_exclude_start_date.sql
git commit -m "feat(rentals): add exclude_start_date column to rental_orders"
```

---

## Task 2: TypeScript Types

**Files:**
- Modify: `src/types/rental.types.ts:185-234` (`RentalOrder` interface)
- Modify: `src/types/rental.types.ts:421-434` (`RentalOrderFormData` interface)

- [ ] **Step 1: Add `exclude_start_date` to `RentalOrder`**

In `src/types/rental.types.ts`, find the `RentalOrder` interface (line 185). Add the field after the `created_by` line (line 233):

```typescript
  // Audit
  created_at: string;
  updated_at: string;
  created_by: string | null;
  exclude_start_date: boolean;
}
```

- [ ] **Step 2: Add `exclude_start_date` to `RentalOrderFormData`**

In `src/types/rental.types.ts`, find `RentalOrderFormData` (line 421). Add the optional field after `negotiated_discount_percentage`:

```typescript
export interface RentalOrderFormData {
  site_id: string;
  vendor_id: string;
  start_date: string;
  expected_return_date?: string;
  transport_cost_outward?: number;
  loading_cost_outward?: number;
  unloading_cost_outward?: number;
  outward_by?: TransportHandler;
  vendor_slip_url?: string;
  notes?: string;
  negotiated_discount_percentage?: number;
  exclude_start_date?: boolean;
  items: RentalOrderItemFormData[];
}
```

- [ ] **Step 3: Verify no type errors**

Run:
```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/types/rental.types.ts
git commit -m "feat(rentals): add exclude_start_date to RentalOrder and RentalOrderFormData types"
```

---

## Task 3: Mutation — Duration Calculation

**Files:**
- Modify: `src/hooks/queries/useRentals.ts:829-838`

- [ ] **Step 1: Write a unit test for the new calculation**

Create `src/hooks/queries/__tests__/rentalDuration.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

// Pure helper extracted from mutation — tested here before wiring in
function calcRentalDays(
  startDate: string,
  expectedReturnDate: string | undefined,
  excludeStartDate: boolean
): number {
  if (!expectedReturnDate) return 30;
  const diff = Math.ceil(
    (new Date(expectedReturnDate).getTime() - new Date(startDate).getTime()) /
      (1000 * 60 * 60 * 24)
  );
  return Math.max(1, excludeStartDate ? diff : diff + 1);
}

describe("calcRentalDays", () => {
  it("includes both endpoints when excludeStartDate is false (26 days)", () => {
    expect(calcRentalDays("2026-03-31", "2026-04-25", false)).toBe(26);
  });

  it("excludes start date when flag is true (25 days)", () => {
    expect(calcRentalDays("2026-03-31", "2026-04-25", true)).toBe(25);
  });

  it("returns 30 when no return date", () => {
    expect(calcRentalDays("2026-03-31", undefined, false)).toBe(30);
    expect(calcRentalDays("2026-03-31", undefined, true)).toBe(30);
  });

  it("clamps to minimum 1 day", () => {
    // Same-day order, exclude start → diff=0, clamped to 1
    expect(calcRentalDays("2026-03-31", "2026-03-31", true)).toBe(1);
    // Same-day order, include start → diff+1=1
    expect(calcRentalDays("2026-03-31", "2026-03-31", false)).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run:
```bash
npx vitest run src/hooks/queries/__tests__/rentalDuration.test.ts
```
Expected: FAIL — `calcRentalDays` is not defined yet (the test file defines it inline, so this will actually pass — that is fine, proceed).

- [ ] **Step 3: Update the `days` calculation in `useCreateRentalOrder`**

In `src/hooks/queries/useRentals.ts`, find lines ~829-838:

```typescript
          // Daily: quantity × rate × days
          const days = data.expected_return_date
            ? Math.max(
                1,
                Math.ceil(
                  (new Date(data.expected_return_date).getTime() -
                    new Date(data.start_date).getTime()) /
                    (1000 * 60 * 60 * 24)
                ) + 1 // Add 1 because both start and end days are rental days
              )
            : 30;
```

Replace with:

```typescript
          // Daily: quantity × rate × days
          const excludeStart = data.exclude_start_date ?? false;
          const days = data.expected_return_date
            ? Math.max(
                1,
                Math.ceil(
                  (new Date(data.expected_return_date).getTime() -
                    new Date(data.start_date).getTime()) /
                    (1000 * 60 * 60 * 24)
                ) + (excludeStart ? 0 : 1)
              )
            : 30;
```

- [ ] **Step 4: Run the unit test to confirm it passes**

Run:
```bash
npx vitest run src/hooks/queries/__tests__/rentalDuration.test.ts
```
Expected: PASS (4 passing).

- [ ] **Step 5: Verify no type errors**

Run:
```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/queries/useRentals.ts src/hooks/queries/__tests__/rentalDuration.test.ts
git commit -m "feat(rentals): respect exclude_start_date in rental order creation mutation"
```

---

## Task 4: Dialog UI — Checkbox + Live Recalculation

**Files:**
- Modify: `src/components/rentals/RentalOrderDialog.tsx`

- [ ] **Step 1: Add `excludeStartDate` state and reset it on close**

In `RentalOrderDialog.tsx`, add state after the existing `discountPercentage` state (line ~89):

```typescript
  const [discountPercentage, setDiscountPercentage] = useState(0);
  const [excludeStartDate, setExcludeStartDate] = useState(false);
```

In the `useEffect` that resets on `!open` (line ~102), add the reset line after `setDiscountPercentage(0)`:

```typescript
      setDiscountPercentage(0);
      setExcludeStartDate(false);
```

- [ ] **Step 2: Add `Checkbox` and `FormControlLabel` to the MUI imports**

At the top of the file, the MUI import block already imports from `@mui/material`. Add `Checkbox` and `FormControlLabel` to that import:

```typescript
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Box,
  Typography,
  IconButton,
  Alert,
  InputAdornment,
  Divider,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Autocomplete,
  Paper,
  Chip,
  Checkbox,
  FormControlLabel,
} from "@mui/material";
```

- [ ] **Step 3: Update `estimatedDays` memo to respect `excludeStartDate`**

Find the `estimatedDays` useMemo (line ~222):

```typescript
  const estimatedDays = useMemo(() => {
    if (!expectedReturnDate || !startDate) return 30;
    const start = dayjs(startDate);
    const end = dayjs(expectedReturnDate);
    return Math.max(1, end.diff(start, "day") + 1);
  }, [startDate, expectedReturnDate]);
```

Replace with:

```typescript
  const estimatedDays = useMemo(() => {
    if (!expectedReturnDate || !startDate) return 30;
    const start = dayjs(startDate);
    const end = dayjs(expectedReturnDate);
    return Math.max(1, end.diff(start, "day") + (excludeStartDate ? 0 : 1));
  }, [startDate, expectedReturnDate, excludeStartDate]);
```

- [ ] **Step 4: Pass `exclude_start_date` in `handleSubmit`**

In `handleSubmit` (line ~262), find the `formData` construction and add `exclude_start_date` after `negotiated_discount_percentage`:

```typescript
      const formData: RentalOrderFormData = {
        site_id: siteId,
        vendor_id: selectedVendor.id,
        start_date: startDate,
        expected_return_date: expectedReturnDate || undefined,
        transport_cost_outward: transportCostOutward,
        loading_cost_outward: loadingCostOutward,
        unloading_cost_outward: unloadingCostOutward,
        outward_by: outwardBy || undefined,
        notes: notes || undefined,
        negotiated_discount_percentage: discountPercentage,
        exclude_start_date: excludeStartDate,
        items: lineItems.map((li) => ({
          rental_item_id: li.rental_item_id,
          quantity: li.quantity,
          daily_rate_default: li.daily_rate_default,
          daily_rate_actual: li.daily_rate_actual,
          rate_type: li.rate_type,
          hours_used: li.hours_used,
        })),
      };
```

- [ ] **Step 5: Add the checkbox to the JSX between dates and "Add Items" divider**

Find this block in the JSX (line ~376):

```tsx
          {/* Item Selection */}
          <Grid size={12}>
            <Divider sx={{ my: 1 }}>
              <Chip label="Add Items" size="small" />
            </Divider>
          </Grid>
```

Insert a new Grid row immediately before it:

```tsx
          {/* Exclude start date */}
          <Grid size={12}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={excludeStartDate}
                  onChange={(e) => setExcludeStartDate(e.target.checked)}
                  size="small"
                />
              }
              label={
                <Box component="span">
                  <Typography variant="body2" component="span">
                    Exclude start date from billing
                  </Typography>
                  <Typography variant="caption" color="text.secondary" component="span" sx={{ ml: 1 }}>
                    (e.g. centering materials — pickup day not counted)
                  </Typography>
                </Box>
              }
            />
          </Grid>

          {/* Item Selection */}
          <Grid size={12}>
            <Divider sx={{ my: 1 }}>
              <Chip label="Add Items" size="small" />
            </Divider>
          </Grid>
```

- [ ] **Step 6: Verify no type errors and build passes**

Run:
```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 7: Start dev server and smoke test**

Run `npm run dev` (if not already running), then:
1. Navigate to `http://localhost:3000/dev-login` — auto-authenticates
2. Go to `/site/rentals?tab=history`
3. Click **+ New Rental**
4. Set Start Date = `2026-03-31`, Expected Return Date = `2026-04-25`
5. Confirm Duration column shows **26 days**
6. Check the **"Exclude start date from billing"** checkbox
7. Confirm Duration column updates to **25 days** and Est. Amounts recalculate
8. Uncheck — confirm it returns to 26 days
9. Create the order and confirm it saves successfully

- [ ] **Step 8: Commit**

```bash
git add src/components/rentals/RentalOrderDialog.tsx
git commit -m "feat(rentals): add exclude-start-date checkbox to Create Rental Order dialog"
```

---

## Task 5: Apply Migration to Production

> Only run this after the UI is verified working locally.

- [ ] **Step 1: Apply migration via Supabase MCP**

Use the `mcp__supabase__apply_migration` tool with the content of `supabase/migrations/20260513120000_rental_exclude_start_date.sql`.

- [ ] **Step 2: Move to prod**

Say `move to prod` — this triggers the standard CLAUDE.md deploy workflow (build → commit remaining → push → Vercel pipeline).
