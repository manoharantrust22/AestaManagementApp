# Rental Order — Exclude Start Date Option

**Date:** 2026-05-13  
**Status:** Approved

## Problem

Duration in rental orders is calculated as `end_date - start_date + 1` days (both endpoints inclusive). For centering/shuttering materials, the industry convention is that the pickup day is not billed — only the days from the day after pickup through return. There is currently no way to reflect this in the order.

## Solution

Add a per-order boolean flag `exclude_start_date` that shifts the duration calculation from inclusive (`+1`) to exclusive (no `+1`). Example: start 31-Mar, return 25-Apr → 26 days normally, 25 days when excluded.

## Scope

- Per-order toggle (not per-item)
- Affects estimated duration display and estimated amount in the creation dialog
- Stored in the database for auditability
- Default `false` — all existing orders unchanged

---

## Database

**Migration:** Add column to `rental_orders`:

```sql
ALTER TABLE rental_orders
  ADD COLUMN exclude_start_date boolean NOT NULL DEFAULT false;
```

No backfill needed. Existing orders default to `false` (inclusive, current behavior).

---

## UI

**Location:** `src/components/rentals/RentalOrderDialog.tsx`

Add a checkbox between the date fields and the "Add Items" section:

```
[ ] Exclude start date from billing (e.g. centering materials)
```

- Controlled by `excludeStartDate` boolean in the dialog's form state
- Toggling immediately recalculates `estimatedDays` and all Est. Amount cells in the items table

---

## Duration Calculation

| Flag | Formula | Example (31-Mar → 25-Apr) |
|------|---------|--------------------------|
| `false` (default) | `end - start + 1` | 26 days |
| `true` | `end - start` | 25 days |

Both calculation sites must be updated:

1. `estimatedDays` useMemo in `RentalOrderDialog.tsx` (~line 222) — drives live display
2. `days` in `useCreateRentalOrder` mutation in `src/hooks/queries/useRentals.ts` (~line 829) — drives the value persisted on the order

---

## Data Flow

```
RentalOrderDialog (form state: excludeStartDate)
  → estimatedDays recalculates on toggle
  → items table re-renders Est. Amount
  → on submit: passed to useCreateRentalOrder({ ..., exclude_start_date })
  → written to rental_orders.exclude_start_date
```

---

## Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/<timestamp>_rental_exclude_start_date.sql` | Add column |
| `src/components/rentals/RentalOrderDialog.tsx` | Add checkbox, update estimatedDays memo |
| `src/hooks/queries/useRentals.ts` | Pass flag in mutation, update days calculation |
| `src/types/rental.types.ts` | Add `exclude_start_date` to RentalOrder type and form type |

---

## Out of Scope

- Editing `exclude_start_date` on an existing order after creation
- Per-item exclusion
- Auto-detection based on item category
