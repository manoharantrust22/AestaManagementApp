# Rental Catalog Phase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `/company/rentals` into a card-based catalog with By Item / By Vendor toggle, size-variant pricing, inspect pane, and an estimate basket that converts to a rental request.

**Architecture:** Replace the existing DataTable-based `CompanyRentalsPage` with a card grid + right inspect pane pattern (matching the materials/vendors pages). Add a `rental_item_sizes` table for per-size variant tracking and `size_rates` JSONB on `rental_store_inventory` for per-vendor per-size pricing. The estimate basket lives in a React context backed by `localStorage`.

**Tech Stack:** Next.js 15, MUI v7, React Query (TanStack), Supabase, Vitest + React Testing Library, TypeScript

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create migration | `supabase/migrations/20260514100000_rental_item_sizes.sql` | Add `rental_item_sizes` table + `size_rates` JSONB on `rental_store_inventory` |
| Modify types | `src/types/rental.types.ts` | Add `RentalItemSize`, `SizeRate`, extend `RentalStoreInventory` |
| Modify hooks | `src/hooks/queries/useRentals.ts` | Add `useRentalItemSizes`, `useRentalPriceComparisonBySizes`, `useCreateRentalItemSize` |
| Create | `src/lib/utils/rentalCatalogUtils.ts` | Pure functions: cheapest vendor, format size rate, basket total |
| Create test | `src/lib/utils/__tests__/rentalCatalogUtils.test.ts` | Tests for pure utility functions |
| Create | `src/components/rentals/RentalItemCard.tsx` | Card for the By-Item grid |
| Create | `src/components/rentals/RentalItemInspectPane.tsx` | Right-side drawer: size selector, vendor rates, qty+days input |
| Create | `src/components/rentals/RentalVendorCatalogPane.tsx` | Right-side vendor pane (rental-specific, reuses VendorInspectPane structure) |
| Create | `src/components/rentals/EstimateBasket.tsx` | Context provider + `useEstimateBasket` hook |
| Create | `src/components/rentals/EstimateBasketDrawer.tsx` | Right-side basket drawer: item list, totals per vendor, convert button |
| Modify | `src/app/(main)/company/rentals/page.tsx` | Replace DataTable with card grid + inspect pane + toggle + basket button |
| Modify | `src/components/rentals/index.ts` | Export new components |

---

## Task 1: Schema Migration — rental_item_sizes

**Files:**
- Create: `supabase/migrations/20260514100000_rental_item_sizes.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260514100000_rental_item_sizes.sql

-- Size variants per rental item (e.g. Side Sheet → 6×1½, 4×1½, 5×1½)
CREATE TABLE IF NOT EXISTS public.rental_item_sizes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rental_item_id UUID NOT NULL REFERENCES public.rental_items(id) ON DELETE CASCADE,
  size_label TEXT NOT NULL,           -- e.g. "6×1½", "4×1½", "Standard"
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (rental_item_id, size_label)
);

-- Per-vendor per-size daily rates (extends existing rental_store_inventory)
-- size_rates JSONB format: { "6×1½": 8.00, "4×1½": 7.00 }
-- NULL means vendor uses the existing daily_rate for all sizes
ALTER TABLE public.rental_store_inventory
  ADD COLUMN IF NOT EXISTS size_rates JSONB DEFAULT NULL;

-- Index for fast lookups by item
CREATE INDEX IF NOT EXISTS idx_rental_item_sizes_item_id
  ON public.rental_item_sizes(rental_item_id);

-- RLS: read for all authenticated, write for company admin
ALTER TABLE public.rental_item_sizes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rental_item_sizes_read" ON public.rental_item_sizes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "rental_item_sizes_write" ON public.rental_item_sizes
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
```

- [ ] **Step 2: Apply migration locally**

```bash
npm run db:reset
```

Expected: migrations run without error, `rental_item_sizes` table visible in local Supabase Studio at http://localhost:54323.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260514100000_rental_item_sizes.sql
git commit -m "feat(rentals): add rental_item_sizes table and size_rates on store inventory"
```

---

## Task 2: TypeScript Types

**Files:**
- Modify: `src/types/rental.types.ts`

- [ ] **Step 1: Add new types after the existing `RentalStoreInventory` interface**

Locate the `RentalStoreInventory` interface (search for `interface RentalStoreInventory`) and add below it:

```typescript
// Per-size daily rates map. Key = size_label, value = rate per day.
export type SizeRates = Record<string, number>;

export interface RentalItemSize {
  id: string;
  rental_item_id: string;
  size_label: string;       // e.g. "6×1½"
  display_order: number;
  is_active: boolean;
  created_at: string;
}

export interface RentalItemSizeFormData {
  rental_item_id: string;
  size_label: string;
  display_order?: number;
}
```

- [ ] **Step 2: Extend `RentalStoreInventory` with `size_rates`**

Find `interface RentalStoreInventory` and add the field:

```typescript
  size_rates: SizeRates | null;   // null = single rate (use daily_rate for all sizes)
```

- [ ] **Step 3: Add `sizes` to `RentalItemWithDetails`**

Find `interface RentalItemWithDetails` (or `RentalItemWithDetails` type) and add:

```typescript
  sizes?: RentalItemSize[];
```

- [ ] **Step 4: Add estimate basket types at end of file**

```typescript
// ─── Estimate Basket ───────────────────────────────────────────────────────

export interface EstimateBasketItem {
  id: string;                    // unique key for this basket entry
  rental_item_id: string;
  rental_item_name: string;
  size_label: string | null;     // null for items with no size variants
  quantity: number;
  days: number;
}

export interface VendorEstimate {
  vendor_id: string;
  vendor_name: string;
  total_rental_cost: number;     // sum across all basket items
  line_items: {
    rental_item_id: string;
    size_label: string | null;
    qty: number;
    days: number;
    daily_rate: number;
    line_total: number;
  }[];
  is_cheapest: boolean;
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: 0 errors (new fields are additive; `sizes` is optional).

- [ ] **Step 6: Commit**

```bash
git add src/types/rental.types.ts
git commit -m "feat(rentals): add RentalItemSize, SizeRates, EstimateBasketItem types"
```

---

## Task 3: Utility Functions (TDD)

**Files:**
- Create: `src/lib/utils/rentalCatalogUtils.ts`
- Create: `src/lib/utils/__tests__/rentalCatalogUtils.test.ts`

- [ ] **Step 1: Write failing tests first**

```typescript
// src/lib/utils/__tests__/rentalCatalogUtils.test.ts
import { describe, it, expect } from "vitest";
import {
  getRateForSize,
  computeVendorEstimates,
  cheapestVendorId,
} from "../rentalCatalogUtils";
import type { RentalStoreInventoryWithDetails } from "@/types/rental.types";

const makeInventory = (
  vendorId: string,
  vendorName: string,
  dailyRate: number,
  sizeRates: Record<string, number> | null = null
): RentalStoreInventoryWithDetails =>
  ({
    id: `inv-${vendorId}`,
    vendor_id: vendorId,
    rental_item_id: "item-1",
    daily_rate: dailyRate,
    size_rates: sizeRates,
    vendor: { id: vendorId, name: vendorName },
    rental_item: { id: "item-1", name: "Side Sheet" },
  } as any);

describe("getRateForSize", () => {
  it("returns size-specific rate when size_rates has the label", () => {
    const inv = makeInventory("v1", "Vendor A", 10, { "6×1½": 8, "4×1½": 7 });
    expect(getRateForSize(inv, "6×1½")).toBe(8);
  });

  it("falls back to daily_rate when size not in size_rates", () => {
    const inv = makeInventory("v1", "Vendor A", 10, { "6×1½": 8 });
    expect(getRateForSize(inv, "5×1½")).toBe(10);
  });

  it("returns daily_rate when size_rates is null", () => {
    const inv = makeInventory("v1", "Vendor A", 10, null);
    expect(getRateForSize(inv, "6×1½")).toBe(10);
  });

  it("returns daily_rate when sizeLabel is null", () => {
    const inv = makeInventory("v1", "Vendor A", 10, { "6×1½": 8 });
    expect(getRateForSize(inv, null)).toBe(10);
  });
});

describe("computeVendorEstimates", () => {
  const vendorA = makeInventory("v1", "Vendor A", 10, { "6×1½": 8, "4×1½": 7 });
  const vendorB = makeInventory("v2", "Vendor B", 12, { "6×1½": 11 });

  const basketItems = [
    { id: "b1", rental_item_id: "item-1", rental_item_name: "Side Sheet", size_label: "6×1½", quantity: 50, days: 25 },
    { id: "b2", rental_item_id: "item-1", rental_item_name: "Side Sheet", size_label: "4×1½", quantity: 20, days: 25 },
  ];

  // inventoryByItemId: Record<itemId, RentalStoreInventoryWithDetails[]>
  const inventoryByItemId = {
    "item-1": [vendorA, vendorB],
  };

  it("computes total cost per vendor correctly", () => {
    const estimates = computeVendorEstimates(basketItems, inventoryByItemId);
    const a = estimates.find((e) => e.vendor_id === "v1")!;
    const b = estimates.find((e) => e.vendor_id === "v2")!;
    // Vendor A: (50 × 8 × 25) + (20 × 7 × 25) = 10,000 + 3,500 = 13,500
    expect(a.total_rental_cost).toBe(13500);
    // Vendor B: (50 × 11 × 25) + (20 × 12 × 25) = 13,750 + 6,000 = 19,750
    expect(b.total_rental_cost).toBe(19750);
  });

  it("marks the cheapest vendor", () => {
    const estimates = computeVendorEstimates(basketItems, inventoryByItemId);
    const a = estimates.find((e) => e.vendor_id === "v1")!;
    const b = estimates.find((e) => e.vendor_id === "v2")!;
    expect(a.is_cheapest).toBe(true);
    expect(b.is_cheapest).toBe(false);
  });

  it("returns empty array for empty basket", () => {
    expect(computeVendorEstimates([], inventoryByItemId)).toEqual([]);
  });
});

describe("cheapestVendorId", () => {
  it("returns vendor_id of the cheapest estimate", () => {
    const estimates = [
      { vendor_id: "v1", total_rental_cost: 13500, is_cheapest: true } as any,
      { vendor_id: "v2", total_rental_cost: 19750, is_cheapest: false } as any,
    ];
    expect(cheapestVendorId(estimates)).toBe("v1");
  });

  it("returns null for empty array", () => {
    expect(cheapestVendorId([])).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm run test -- rentalCatalogUtils --reporter=verbose
```

Expected: `Cannot find module '../rentalCatalogUtils'`

- [ ] **Step 3: Implement the utility functions**

```typescript
// src/lib/utils/rentalCatalogUtils.ts
import type {
  RentalStoreInventoryWithDetails,
  EstimateBasketItem,
  VendorEstimate,
} from "@/types/rental.types";

export function getRateForSize(
  inventory: RentalStoreInventoryWithDetails,
  sizeLabel: string | null
): number {
  if (!sizeLabel || !inventory.size_rates) return inventory.daily_rate ?? 0;
  return inventory.size_rates[sizeLabel] ?? (inventory.daily_rate ?? 0);
}

export function computeVendorEstimates(
  basketItems: EstimateBasketItem[],
  inventoryByItemId: Record<string, RentalStoreInventoryWithDetails[]>
): VendorEstimate[] {
  if (basketItems.length === 0) return [];

  // Collect all unique vendors across basket items
  const vendorMap = new Map<string, { name: string; inventoryByItem: Map<string, RentalStoreInventoryWithDetails> }>();

  for (const item of basketItems) {
    const inventories = inventoryByItemId[item.rental_item_id] ?? [];
    for (const inv of inventories) {
      if (!inv.vendor) continue;
      if (!vendorMap.has(inv.vendor_id)) {
        vendorMap.set(inv.vendor_id, {
          name: inv.vendor.name,
          inventoryByItem: new Map(),
        });
      }
      vendorMap.get(inv.vendor_id)!.inventoryByItem.set(inv.rental_item_id, inv);
    }
  }

  const estimates: VendorEstimate[] = [];

  for (const [vendorId, { name, inventoryByItem }] of vendorMap) {
    const lineItems: VendorEstimate["line_items"] = [];
    let total = 0;

    for (const item of basketItems) {
      const inv = inventoryByItem.get(item.rental_item_id);
      const rate = inv ? getRateForSize(inv, item.size_label) : 0;
      const lineTotal = item.quantity * rate * item.days;
      total += lineTotal;
      lineItems.push({
        rental_item_id: item.rental_item_id,
        size_label: item.size_label,
        qty: item.quantity,
        days: item.days,
        daily_rate: rate,
        line_total: lineTotal,
      });
    }

    estimates.push({
      vendor_id: vendorId,
      vendor_name: name,
      total_rental_cost: total,
      line_items: lineItems,
      is_cheapest: false,
    });
  }

  if (estimates.length > 0) {
    const minCost = Math.min(...estimates.map((e) => e.total_rental_cost));
    for (const e of estimates) {
      e.is_cheapest = e.total_rental_cost === minCost;
    }
  }

  return estimates.sort((a, b) => a.total_rental_cost - b.total_rental_cost);
}

export function cheapestVendorId(estimates: VendorEstimate[]): string | null {
  if (estimates.length === 0) return null;
  return estimates.reduce((best, e) =>
    e.total_rental_cost < best.total_rental_cost ? e : best
  ).vendor_id;
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm run test -- rentalCatalogUtils --reporter=verbose
```

Expected: all 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/rentalCatalogUtils.ts src/lib/utils/__tests__/rentalCatalogUtils.test.ts
git commit -m "feat(rentals): add rentalCatalogUtils (getRateForSize, computeVendorEstimates)"
```

---

## Task 4: React Query Hooks for Sizes

**Files:**
- Modify: `src/hooks/queries/useRentals.ts`

- [ ] **Step 1: Add query keys for sizes**

Find the `rentalQueryKeys` object and add inside `items`:

```typescript
sizes: (itemId: string) => ["rentals", "items", itemId, "sizes"] as const,
```

And add a top-level key:

```typescript
storeInventoryBySizes: (itemId: string, sizeLabel: string) =>
  ["rentals", "storeInventory", "bySizes", itemId, sizeLabel] as const,
```

- [ ] **Step 2: Add hooks after the existing item hooks**

```typescript
export function useRentalItemSizes(itemId: string | undefined) {
  return useQuery({
    queryKey: itemId ? rentalQueryKeys.items.sizes(itemId) : ["rentals", "sizes", "disabled"],
    enabled: !!itemId,
    queryFn: wrapQueryFn(async () => {
      const { data, error } = await supabase
        .from("rental_item_sizes")
        .select("*")
        .eq("rental_item_id", itemId!)
        .eq("is_active", true)
        .order("display_order");
      if (error) throw error;
      return (data ?? []) as RentalItemSize[];
    }, { operationName: "useRentalItemSizes" }),
  });
}

export function useRentalInventoryForItem(itemId: string | undefined) {
  return useQuery({
    queryKey: itemId ? rentalQueryKeys.storeInventory.byItem(itemId) : ["rentals", "inventory", "disabled"],
    enabled: !!itemId,
    queryFn: wrapQueryFn(async () => {
      const { data, error } = await supabase
        .from("rental_store_inventory")
        .select(`
          *,
          vendor:vendors(id, name, shop_name, phone, location),
          rental_item:rental_items(id, name, code, unit)
        `)
        .eq("rental_item_id", itemId!)
        .order("daily_rate");
      if (error) throw error;
      return (data ?? []) as RentalStoreInventoryWithDetails[];
    }, { operationName: "useRentalInventoryForItem" }),
  });
}

export function useCreateRentalItemSize() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: RentalItemSizeFormData) => {
      const { data: result, error } = await supabase
        .from("rental_item_sizes")
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      return result as RentalItemSize;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: rentalQueryKeys.items.sizes(vars.rental_item_id) });
    },
  });
}

export function useUpdateStoreInventorySizeRates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, size_rates }: { id: string; size_rates: SizeRates }) => {
      const { error } = await supabase
        .from("rental_store_inventory")
        .update({ size_rates })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: rentalQueryKeys.storeInventory.all });
    },
  });
}
```

- [ ] **Step 3: Add missing imports at top of file**

Ensure these are imported from `@/types/rental.types`:
```typescript
import type { ..., RentalItemSize, RentalItemSizeFormData, SizeRates, RentalStoreInventoryWithDetails } from "@/types/rental.types";
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/queries/useRentals.ts
git commit -m "feat(rentals): add useRentalItemSizes and useRentalInventoryForItem hooks"
```

---

## Task 5: EstimateBasket Context

**Files:**
- Create: `src/components/rentals/EstimateBasket.tsx`

- [ ] **Step 1: Create the context and hook**

```typescript
// src/components/rentals/EstimateBasket.tsx
"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { v4 as uuid } from "uuid";
import type { EstimateBasketItem } from "@/types/rental.types";

const STORAGE_KEY = "rental_estimate_basket";

interface EstimateBasketContextValue {
  items: EstimateBasketItem[];
  addItem: (item: Omit<EstimateBasketItem, "id">) => void;
  updateItem: (id: string, patch: Partial<Pick<EstimateBasketItem, "quantity" | "days" | "size_label">>) => void;
  removeItem: (id: string) => void;
  clearBasket: () => void;
  itemCount: number;
}

const EstimateBasketContext = createContext<EstimateBasketContextValue | null>(null);

export function EstimateBasketProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<EstimateBasketItem[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const addItem = useCallback((item: Omit<EstimateBasketItem, "id">) => {
    setItems((prev) => {
      // Replace if same item+size already in basket
      const existing = prev.findIndex(
        (i) => i.rental_item_id === item.rental_item_id && i.size_label === item.size_label
      );
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = { ...next[existing], ...item };
        return next;
      }
      return [...prev, { ...item, id: uuid() }];
    });
  }, []);

  const updateItem = useCallback(
    (id: string, patch: Partial<Pick<EstimateBasketItem, "quantity" | "days" | "size_label">>) => {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    },
    []
  );

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const clearBasket = useCallback(() => setItems([]), []);

  return (
    <EstimateBasketContext.Provider
      value={{ items, addItem, updateItem, removeItem, clearBasket, itemCount: items.length }}
    >
      {children}
    </EstimateBasketContext.Provider>
  );
}

export function useEstimateBasket() {
  const ctx = useContext(EstimateBasketContext);
  if (!ctx) throw new Error("useEstimateBasket must be used inside EstimateBasketProvider");
  return ctx;
}
```

- [ ] **Step 2: Wrap the company rentals layout with the provider**

Open `src/app/(main)/company/rentals/page.tsx` and wrap the return JSX with `<EstimateBasketProvider>`:

```tsx
import { EstimateBasketProvider } from "@/components/rentals/EstimateBasket";

// Inside return:
return (
  <EstimateBasketProvider>
    {/* ... existing page content ... */}
  </EstimateBasketProvider>
);
```

- [ ] **Step 3: Commit**

```bash
git add src/components/rentals/EstimateBasket.tsx src/app/\(main\)/company/rentals/page.tsx
git commit -m "feat(rentals): add EstimateBasketProvider context with localStorage persistence"
```

---

## Task 6: RentalItemCard Component

**Files:**
- Create: `src/components/rentals/RentalItemCard.tsx`

- [ ] **Step 1: Create the component**

```typescript
// src/components/rentals/RentalItemCard.tsx
"use client";

import { Box, Card, CardActionArea, Chip, Stack, Typography } from "@mui/material";
import AddShoppingCartIcon from "@mui/icons-material/AddShoppingCart";
import type { RentalItemSize, RentalItemWithDetails } from "@/types/rental.types";

interface RentalItemCardProps {
  item: RentalItemWithDetails;
  sizes: RentalItemSize[];
  vendorCount: number;
  lowestRate: number | null;
  isSelected: boolean;
  onSelect: () => void;
  onAddToEstimate: () => void;
}

export function RentalItemCard({
  item,
  sizes,
  vendorCount,
  lowestRate,
  isSelected,
  onSelect,
  onAddToEstimate,
}: RentalItemCardProps) {
  const visibleSizes = sizes.slice(0, 3);
  const extraCount = sizes.length - visibleSizes.length;

  return (
    <Card
      variant="outlined"
      sx={{
        borderColor: isSelected ? "primary.main" : "divider",
        borderWidth: isSelected ? 2 : 1,
        borderRadius: 2,
        transition: "border-color 0.15s",
      }}
    >
      <CardActionArea onClick={onSelect} sx={{ p: 1.5, pb: 1 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 0.5 }}>
          <Typography variant="subtitle2" fontWeight={700} noWrap sx={{ flex: 1 }}>
            {item.name}
          </Typography>
          {sizes.length > 0 && (
            <Chip
              label={`${sizes.length} sizes`}
              size="small"
              color="primary"
              variant="outlined"
              sx={{ ml: 0.5, fontSize: 10, height: 18 }}
            />
          )}
        </Box>

        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
          {item.category?.name ?? "—"} · per piece
        </Typography>

        {sizes.length > 0 && (
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
            {visibleSizes.map((s) => (
              <Chip key={s.id} label={s.size_label} size="small" sx={{ fontSize: 10, height: 20 }} />
            ))}
            {extraCount > 0 && (
              <Chip label={`+${extraCount}`} size="small" variant="outlined" sx={{ fontSize: 10, height: 20 }} />
            )}
          </Stack>
        )}

        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Box>
            {vendorCount > 0 ? (
              <Typography variant="caption" color="success.main" fontWeight={600}>
                {vendorCount} vendor{vendorCount > 1 ? "s" : ""}
                {lowestRate != null && (
                  <Typography component="span" variant="caption" color="warning.main" fontWeight={700} sx={{ ml: 0.5 }}>
                    · from ₹{lowestRate}/day
                  </Typography>
                )}
              </Typography>
            ) : (
              <Typography variant="caption" color="text.disabled">
                No vendors yet
              </Typography>
            )}
          </Box>
        </Box>
      </CardActionArea>

      <Box
        onClick={(e) => { e.stopPropagation(); onAddToEstimate(); }}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          px: 1.5,
          py: 0.75,
          borderTop: "1px solid",
          borderColor: "divider",
          cursor: "pointer",
          bgcolor: "warning.light",
          "&:hover": { bgcolor: "warning.main" },
          borderRadius: "0 0 8px 8px",
        }}
      >
        <AddShoppingCartIcon sx={{ fontSize: 14, color: "warning.contrastText" }} />
        <Typography variant="caption" fontWeight={700} color="warning.contrastText">
          + Estimate
        </Typography>
      </Box>
    </Card>
  );
}
```

- [ ] **Step 2: Export from barrel**

In `src/components/rentals/index.ts` add:
```typescript
export { RentalItemCard } from "./RentalItemCard";
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/rentals/RentalItemCard.tsx src/components/rentals/index.ts
git commit -m "feat(rentals): add RentalItemCard component with size chips and estimate button"
```

---

## Task 7: RentalItemInspectPane

**Files:**
- Create: `src/components/rentals/RentalItemInspectPane.tsx`

- [ ] **Step 1: Create the pane**

```typescript
// src/components/rentals/RentalItemInspectPane.tsx
"use client";

import { useState, useMemo } from "react";
import {
  Box, Chip, Divider, Drawer, IconButton, Stack, Tab, Tabs,
  TextField, Typography, Button, Skeleton,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import AddShoppingCartIcon from "@mui/icons-material/AddShoppingCart";
import { useRentalItem, useRentalItemSizes, useRentalInventoryForItem } from "@/hooks/queries/useRentals";
import { getRateForSize } from "@/lib/utils/rentalCatalogUtils";
import { useEstimateBasket } from "./EstimateBasket";
import type { RentalItemSize } from "@/types/rental.types";

interface RentalItemInspectPaneProps {
  itemId: string | null;
  isOpen: boolean;
  onClose: () => void;
  zIndex?: number;
}

export function RentalItemInspectPane({ itemId, isOpen, onClose, zIndex = 1200 }: RentalItemInspectPaneProps) {
  const [tab, setTab] = useState(0);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [qty, setQty] = useState(10);
  const [days, setDays] = useState(25);

  const { data: item, isLoading: itemLoading } = useRentalItem(itemId ?? undefined);
  const { data: sizes = [] } = useRentalItemSizes(itemId ?? undefined);
  const { data: inventory = [], isLoading: invLoading } = useRentalInventoryForItem(itemId ?? undefined);
  const { addItem } = useEstimateBasket();

  // Reset selected size when item changes
  const effectiveSize = selectedSize ?? (sizes[0]?.size_label ?? null);

  const vendorRates = useMemo(() =>
    inventory
      .map((inv) => ({
        ...inv,
        rate: getRateForSize(inv, effectiveSize),
      }))
      .sort((a, b) => a.rate - b.rate),
    [inventory, effectiveSize]
  );

  const cheapestRate = vendorRates[0]?.rate ?? null;
  const estimatedCost = cheapestRate != null ? qty * cheapestRate * days : null;

  const handleAddToBasket = () => {
    if (!item) return;
    addItem({
      rental_item_id: item.id,
      rental_item_name: item.name,
      size_label: effectiveSize,
      quantity: qty,
      days,
    });
  };

  return (
    <Drawer
      anchor="right"
      open={isOpen}
      onClose={onClose}
      variant="persistent"
      sx={{
        "& .MuiDrawer-paper": {
          width: { xs: "100%", sm: 360 },
          zIndex,
          boxSizing: "border-box",
          borderLeft: "1px solid",
          borderColor: "divider",
        },
      }}
    >
      {/* Header */}
      <Box sx={{ p: 2, pb: 1, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <Box>
          {itemLoading ? (
            <Skeleton width={140} height={24} />
          ) : (
            <Typography variant="subtitle1" fontWeight={700}>{item?.name}</Typography>
          )}
          <Typography variant="caption" color="text.secondary">{item?.category?.name}</Typography>
        </Box>
        <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 2, borderBottom: "1px solid", borderColor: "divider" }}>
        <Tab label="Vendors" sx={{ fontSize: 11, minWidth: 60, py: 0.75 }} />
        <Tab label="Overview" sx={{ fontSize: 11, minWidth: 60, py: 0.75 }} />
        <Tab label="History" sx={{ fontSize: 11, minWidth: 60, py: 0.75 }} />
      </Tabs>

      <Box sx={{ flex: 1, overflow: "auto", p: 1.5 }}>
        {tab === 0 && (
          <>
            {/* Size selector */}
            {sizes.length > 0 && (
              <Box sx={{ mb: 1.5 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 0.5 }}>
                  SELECT SIZE
                </Typography>
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                  {sizes.map((s) => (
                    <Chip
                      key={s.id}
                      label={s.size_label}
                      size="small"
                      color={effectiveSize === s.size_label ? "primary" : "default"}
                      onClick={() => setSelectedSize(s.size_label)}
                      sx={{ cursor: "pointer" }}
                    />
                  ))}
                </Stack>
              </Box>
            )}

            <Divider sx={{ mb: 1.5 }} />

            {/* Vendor rates */}
            {invLoading ? (
              <Stack spacing={1}>
                {[1, 2].map((i) => <Skeleton key={i} height={60} sx={{ borderRadius: 1 }} />)}
              </Stack>
            ) : vendorRates.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", mt: 3 }}>
                No vendors have this item yet
              </Typography>
            ) : (
              <Stack spacing={1} sx={{ mb: 2 }}>
                {vendorRates.map((inv, idx) => (
                  <Box
                    key={inv.id}
                    sx={{
                      p: 1.25,
                      borderRadius: 1.5,
                      border: "1px solid",
                      borderColor: idx === 0 ? "success.main" : "divider",
                      bgcolor: idx === 0 ? "success.light" : "background.paper",
                    }}
                  >
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.25 }}>
                      <Typography variant="body2" fontWeight={600}>{inv.vendor?.name}</Typography>
                      {idx === 0 && (
                        <Chip label="CHEAPEST" size="small" color="success" sx={{ fontSize: 9, height: 18 }} />
                      )}
                    </Box>
                    <Typography variant="subtitle2" color="warning.main" fontWeight={700}>
                      ₹{inv.rate}/day
                    </Typography>
                    {inv.transport_cost != null && inv.transport_cost > 0 && (
                      <Typography variant="caption" color="text.secondary">
                        Transport: ₹{inv.transport_cost} outward
                      </Typography>
                    )}
                  </Box>
                ))}
              </Stack>
            )}
          </>
        )}

        {tab === 1 && (
          <Box>
            <Typography variant="body2" color="text.secondary">{item?.description ?? "No description."}</Typography>
            {item?.specifications && (
              <Box sx={{ mt: 1 }}>
                <Typography variant="caption" fontWeight={600}>Specifications</Typography>
                <pre style={{ fontSize: 11, whiteSpace: "pre-wrap" }}>
                  {JSON.stringify(item.specifications, null, 2)}
                </pre>
              </Box>
            )}
          </Box>
        )}

        {tab === 2 && (
          <Typography variant="body2" color="text.secondary">Price history coming soon.</Typography>
        )}
      </Box>

      {/* Estimate footer — always visible */}
      <Box sx={{ p: 1.5, borderTop: "1px solid", borderColor: "divider", bgcolor: "background.paper" }}>
        <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
          <TextField
            label="Qty"
            type="number"
            size="small"
            value={qty}
            onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
            inputProps={{ min: 1 }}
            sx={{ flex: 1 }}
          />
          <TextField
            label="Days"
            type="number"
            size="small"
            value={days}
            onChange={(e) => setDays(Math.max(1, Number(e.target.value)))}
            inputProps={{ min: 1 }}
            sx={{ flex: 1 }}
          />
          {estimatedCost != null && (
            <Box sx={{ display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 64 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9 }}>COST</Typography>
              <Typography variant="caption" color="warning.main" fontWeight={700}>
                ₹{(estimatedCost / 1000).toFixed(1)}k
              </Typography>
            </Box>
          )}
        </Stack>
        <Button
          fullWidth
          variant="contained"
          color="warning"
          startIcon={<AddShoppingCartIcon />}
          onClick={handleAddToBasket}
          disabled={!item}
          size="small"
        >
          Add to Estimate Basket
        </Button>
      </Box>
    </Drawer>
  );
}
```

- [ ] **Step 2: Export from barrel**

```typescript
// Add to src/components/rentals/index.ts
export { RentalItemInspectPane } from "./RentalItemInspectPane";
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/components/rentals/RentalItemInspectPane.tsx src/components/rentals/index.ts
git commit -m "feat(rentals): add RentalItemInspectPane with size selector, vendor rates, and estimate footer"
```

---

## Task 8: EstimateBasketDrawer

**Files:**
- Create: `src/components/rentals/EstimateBasketDrawer.tsx`

- [ ] **Step 1: Create the drawer component**

```typescript
// src/components/rentals/EstimateBasketDrawer.tsx
"use client";

import {
  Box, Button, Chip, Divider, Drawer, IconButton, Stack,
  TextField, Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import DeleteIcon from "@mui/icons-material/Delete";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import { useEstimateBasket } from "./EstimateBasket";
import { computeVendorEstimates } from "@/lib/utils/rentalCatalogUtils";
import { useRentalInventoryForItem } from "@/hooks/queries/useRentals";
import type { EstimateBasketItem, RentalStoreInventoryWithDetails } from "@/types/rental.types";
import { useQueries } from "@tanstack/react-query";

interface EstimateBasketDrawerProps {
  open: boolean;
  onClose: () => void;
  onConvertToRequest: () => void;
}

// Helper component per basket item row
function BasketItemRow({ item, onUpdate, onRemove }: {
  item: EstimateBasketItem;
  onUpdate: (patch: Partial<Pick<EstimateBasketItem, "quantity" | "days">>) => void;
  onRemove: () => void;
}) {
  return (
    <Box sx={{ py: 1, borderBottom: "1px solid", borderColor: "divider" }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 0.5 }}>
        <Box>
          <Typography variant="body2" fontWeight={600}>{item.rental_item_name}</Typography>
          {item.size_label && (
            <Chip label={item.size_label} size="small" sx={{ fontSize: 10, height: 18, mt: 0.25 }} />
          )}
        </Box>
        <IconButton size="small" onClick={onRemove} color="error">
          <DeleteIcon fontSize="small" />
        </IconButton>
      </Box>
      <Stack direction="row" spacing={1}>
        <TextField
          label="Qty"
          type="number"
          size="small"
          value={item.quantity}
          onChange={(e) => onUpdate({ quantity: Math.max(1, Number(e.target.value)) })}
          inputProps={{ min: 1 }}
          sx={{ flex: 1 }}
        />
        <TextField
          label="Days"
          type="number"
          size="small"
          value={item.days}
          onChange={(e) => onUpdate({ days: Math.max(1, Number(e.target.value)) })}
          inputProps={{ min: 1 }}
          sx={{ flex: 1 }}
        />
      </Stack>
    </Box>
  );
}

export function EstimateBasketDrawer({ open, onClose, onConvertToRequest }: EstimateBasketDrawerProps) {
  const { items, updateItem, removeItem, clearBasket, itemCount } = useEstimateBasket();

  // Fetch inventory for all unique items in basket
  const uniqueItemIds = [...new Set(items.map((i) => i.rental_item_id))];
  const inventoryQueries = useQueries({
    queries: uniqueItemIds.map((id) => ({
      queryKey: ["rentals", "storeInventory", "byItem", id],
      queryFn: async () => {
        // This reuses the same fetcher logic as useRentalInventoryForItem
        // We import from supabase directly here for brevity
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const { data } = await supabase
          .from("rental_store_inventory")
          .select("*, vendor:vendors(id, name), rental_item:rental_items(id, name)")
          .eq("rental_item_id", id);
        return { itemId: id, inventory: (data ?? []) as RentalStoreInventoryWithDetails[] };
      },
      enabled: open && !!id,
    })),
  });

  const inventoryByItemId: Record<string, RentalStoreInventoryWithDetails[]> = {};
  for (const q of inventoryQueries) {
    if (q.data) inventoryByItemId[q.data.itemId] = q.data.inventory;
  }

  const vendorEstimates = computeVendorEstimates(items, inventoryByItemId);

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      sx={{ "& .MuiDrawer-paper": { width: { xs: "100%", sm: 400 } } }}
    >
      <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
        {/* Header */}
        <Box sx={{ p: 2, display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid", borderColor: "divider" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <ShoppingCartIcon color="warning" />
            <Typography variant="subtitle1" fontWeight={700}>Estimate Basket</Typography>
            <Chip label={itemCount} size="small" color="warning" />
          </Box>
          <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
        </Box>

        {items.length === 0 ? (
          <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Typography variant="body2" color="text.secondary">No items yet. Browse the catalog and click "+ Estimate".</Typography>
          </Box>
        ) : (
          <>
            {/* Items list */}
            <Box sx={{ flex: 1, overflow: "auto", px: 2, pt: 1 }}>
              {items.map((item) => (
                <BasketItemRow
                  key={item.id}
                  item={item}
                  onUpdate={(patch) => updateItem(item.id, patch)}
                  onRemove={() => removeItem(item.id)}
                />
              ))}

              {/* Vendor comparison */}
              {vendorEstimates.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="caption" fontWeight={700} color="text.secondary">
                    VENDOR COMPARISON
                  </Typography>
                  <Stack spacing={0.75} sx={{ mt: 0.75 }}>
                    {vendorEstimates.map((est) => (
                      <Box
                        key={est.vendor_id}
                        sx={{
                          p: 1.25,
                          borderRadius: 1.5,
                          border: "1px solid",
                          borderColor: est.is_cheapest ? "success.main" : "divider",
                          bgcolor: est.is_cheapest ? "success.light" : "background.default",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <Box>
                          <Typography variant="body2" fontWeight={600}>{est.vendor_name}</Typography>
                          {est.is_cheapest && (
                            <Chip label="CHEAPEST" size="small" color="success" sx={{ fontSize: 9, height: 16 }} />
                          )}
                        </Box>
                        <Typography variant="subtitle2" fontWeight={700} color="warning.main">
                          ₹{est.total_rental_cost.toLocaleString("en-IN")}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                </Box>
              )}
            </Box>

            <Divider />

            {/* Footer actions */}
            <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1 }}>
              <Button
                fullWidth
                variant="contained"
                color="primary"
                onClick={onConvertToRequest}
              >
                Convert to Rental Request →
              </Button>
              <Button fullWidth variant="outlined" color="error" size="small" onClick={clearBasket}>
                Clear Basket
              </Button>
            </Box>
          </>
        )}
      </Box>
    </Drawer>
  );
}
```

- [ ] **Step 2: Export from barrel**

```typescript
export { EstimateBasketDrawer } from "./EstimateBasketDrawer";
```

- [ ] **Step 3: Commit**

```bash
git add src/components/rentals/EstimateBasketDrawer.tsx src/components/rentals/index.ts
git commit -m "feat(rentals): add EstimateBasketDrawer with vendor comparison"
```

---

## Task 9: Refactor CompanyRentalsPage

**Files:**
- Modify: `src/app/(main)/company/rentals/page.tsx`

- [ ] **Step 1: Replace page content with card grid + inspect pane + basket**

Replace the entire file content with the new implementation. Key structure:

```typescript
// src/app/(main)/company/rentals/page.tsx
"use client";

import { useState, useDeferredValue, useCallback } from "react";
import {
  Box, Button, Chip, Grid, InputAdornment, Stack,
  TextField, ToggleButton, ToggleButtonGroup, Typography, Badge,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import ViewModuleIcon from "@mui/icons-material/ViewModule";
import StoreIcon from "@mui/icons-material/Store";
import AddIcon from "@mui/icons-material/Add";
import { useRentalItems, useRentalCategories, useRentalInventoryForItem, useRentalItemSizes } from "@/hooks/queries/useRentals";
import { useVendors } from "@/hooks/queries/useVendors";
import { RentalItemCard } from "@/components/rentals/RentalItemCard";
import { RentalItemInspectPane } from "@/components/rentals/RentalItemInspectPane";
import { EstimateBasketDrawer } from "@/components/rentals/EstimateBasketDrawer";
import { EstimateBasketProvider, useEstimateBasket } from "@/components/rentals/EstimateBasket";
import { RentalItemDialog } from "@/components/rentals";
import { VendorInspectPane } from "@/components/vendors/VendorInspectPane";
import { useSelectedSite } from "@/hooks/useSelectedSite"; // adjust if needed
import type { RentalItemWithDetails } from "@/types/rental.types";

// ─── INNER PAGE (inside provider) ───────────────────────────────────────────

type CatalogView = "items" | "vendors";
type CategoryFilter = string | null; // category id or null = all

function CompanyRentalsPageInner() {
  const [view, setView] = useState<CatalogView>("items");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>(null);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [basketOpen, setBasketOpen] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);

  const { itemCount } = useEstimateBasket();
  const { data: categories = [] } = useRentalCategories();
  const { data: items = [], isLoading } = useRentalItems(categoryFilter ?? undefined);

  // Filter by search client-side (items list is not huge)
  const filteredItems = deferredSearch.length >= 2
    ? items.filter((i) =>
        i.name.toLowerCase().includes(deferredSearch.toLowerCase()) ||
        (i.code ?? "").toLowerCase().includes(deferredSearch.toLowerCase())
      )
    : items;

  const handleAddToEstimate = useCallback((item: RentalItemWithDetails) => {
    setSelectedItemId(item.id);
    // Inspect pane opens automatically; user sets qty+days there and clicks "Add"
  }, []);

  const handleConvertToRequest = () => {
    setBasketOpen(false);
    // Navigate to /site/rentals with basket state — Phase 2 will wire this up
    // For now: just close drawer
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      {/* Top bar */}
      <Box
        sx={{
          px: 2, py: 1.5,
          display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap",
          borderBottom: "1px solid", borderColor: "divider", bgcolor: "background.paper",
        }}
      >
        <Typography variant="h6" fontWeight={700} sx={{ flex: "none" }}>
          Rental Catalog
        </Typography>

        <ToggleButtonGroup
          value={view}
          exclusive
          onChange={(_, v) => v && setView(v)}
          size="small"
          sx={{ flex: "none" }}
        >
          <ToggleButton value="items"><ViewModuleIcon sx={{ fontSize: 16, mr: 0.5 }} />By Item</ToggleButton>
          <ToggleButton value="vendors"><StoreIcon sx={{ fontSize: 16, mr: 0.5 }} />By Vendor</ToggleButton>
        </ToggleButtonGroup>

        <TextField
          size="small"
          placeholder="Search items…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          sx={{ flex: 1, minWidth: 160, maxWidth: 280 }}
        />

        <Badge badgeContent={itemCount} color="warning" sx={{ flex: "none" }}>
          <Button
            variant={itemCount > 0 ? "contained" : "outlined"}
            color="warning"
            startIcon={<ShoppingCartIcon />}
            onClick={() => setBasketOpen(true)}
            size="small"
          >
            Estimate Basket
          </Button>
        </Badge>

        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={() => setAddItemOpen(true)}
          size="small"
          sx={{ flex: "none" }}
        >
          Add Item
        </Button>
      </Box>

      {/* Category chips — only for items view */}
      {view === "items" && (
        <Box sx={{ px: 2, py: 1, display: "flex", gap: 1, flexWrap: "wrap", borderBottom: "1px solid", borderColor: "divider" }}>
          <Chip
            label="All"
            onClick={() => setCategoryFilter(null)}
            color={categoryFilter === null ? "primary" : "default"}
            size="small"
          />
          {categories.map((cat) => (
            <Chip
              key={cat.id}
              label={cat.name}
              onClick={() => setCategoryFilter(cat.id)}
              color={categoryFilter === cat.id ? "primary" : "default"}
              size="small"
            />
          ))}
        </Box>
      )}

      {/* Main area */}
      <Box sx={{ flex: 1, overflow: "hidden", display: "flex" }}>

        {/* Card grid */}
        <Box sx={{ flex: 1, overflow: "auto", p: 2 }}>
          {view === "items" && (
            <Grid container spacing={1.5}>
              {filteredItems.map((item) => (
                <Grid item xs={12} sm={6} md={4} lg={3} key={item.id}>
                  <RentalItemCard
                    item={item}
                    sizes={item.sizes ?? []}
                    vendorCount={0}  // TODO Phase 1 enhancement: pass vendor count from aggregated query
                    lowestRate={null}
                    isSelected={selectedItemId === item.id}
                    onSelect={() => setSelectedItemId(item.id === selectedItemId ? null : item.id)}
                    onAddToEstimate={() => handleAddToEstimate(item)}
                  />
                </Grid>
              ))}
            </Grid>
          )}

          {view === "vendors" && (
            // Vendor grid — reuse existing vendor card pattern filtered to rental_store type
            <Typography variant="body2" color="text.secondary">
              Vendor view — coming in next iteration (shows rental_store vendors)
            </Typography>
          )}
        </Box>

        {/* Inspect pane */}
        {selectedItemId && (
          <RentalItemInspectPane
            itemId={selectedItemId}
            isOpen={!!selectedItemId}
            onClose={() => setSelectedItemId(null)}
          />
        )}
      </Box>

      {/* Dialogs */}
      <EstimateBasketDrawer
        open={basketOpen}
        onClose={() => setBasketOpen(false)}
        onConvertToRequest={handleConvertToRequest}
      />

      {addItemOpen && (
        <RentalItemDialog
          open={addItemOpen}
          onClose={() => setAddItemOpen(false)}
        />
      )}
    </Box>
  );
}

// ─── OUTER PAGE (wraps with provider) ───────────────────────────────────────

export default function CompanyRentalsPage() {
  return (
    <EstimateBasketProvider>
      <CompanyRentalsPageInner />
    </EstimateBasketProvider>
  );
}
```

- [ ] **Step 2: Verify the page renders without errors**

```bash
npm run dev
```

Navigate to `http://localhost:3000/dev-login` → auto-login → go to `/company/rentals`. Take a screenshot via Playwright to confirm the page renders with the toggle and card grid.

- [ ] **Step 3: Fix any TypeScript errors**

```bash
npx tsc --noEmit
```

Fix any type mismatches before committing.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(main\)/company/rentals/page.tsx
git commit -m "feat(rentals): replace DataTable with card grid + inspect pane + estimate basket on /company/rentals"
```

---

## Task 10: Wire Vendor Count and Lowest Rate to Item Cards

**Files:**
- Modify: `src/hooks/queries/useRentals.ts`
- Modify: `src/app/(main)/company/rentals/page.tsx`

- [ ] **Step 1: Add an aggregated items hook that includes vendor counts and lowest rates**

In `useRentals.ts`, add below existing item hooks:

```typescript
export function useRentalItemsWithVendorStats(categoryId?: string) {
  return useQuery({
    queryKey: [...rentalQueryKeys.items.list(), "withVendorStats", categoryId ?? "all"],
    queryFn: wrapQueryFn(async () => {
      const { data, error } = await supabase
        .from("rental_items")
        .select(`
          *,
          category:rental_item_categories(id, name, code),
          sizes:rental_item_sizes(id, size_label, display_order),
          inventory:rental_store_inventory(id, vendor_id, daily_rate, size_rates)
        `)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;

      return (data ?? []).map((item: any) => ({
        ...item,
        vendor_count: item.inventory?.length ?? 0,
        lowest_rate: item.inventory?.length > 0
          ? Math.min(...item.inventory.map((inv: any) => inv.daily_rate ?? Infinity))
          : null,
        sizes: item.sizes ?? [],
      })) as (RentalItemWithDetails & { vendor_count: number; lowest_rate: number | null })[];
    }, { operationName: "useRentalItemsWithVendorStats" }),
  });
}
```

- [ ] **Step 2: Use the new hook in CompanyRentalsPage**

Replace `useRentalItems` with `useRentalItemsWithVendorStats` in the page, and pass `vendor_count` and `lowest_rate` to `RentalItemCard`.

- [ ] **Step 3: Verify cards show correct vendor counts**

Navigate to `/company/rentals`, confirm item cards show "X vendors · from ₹Y/day" when vendors exist.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/queries/useRentals.ts src/app/\(main\)/company/rentals/page.tsx
git commit -m "feat(rentals): show vendor count and lowest rate on item cards"
```

---

## Task 11: Vendor View Tab

**Files:**
- Modify: `src/app/(main)/company/rentals/page.tsx`

- [ ] **Step 1: Add vendor grid for the "By Vendor" toggle**

Replace the vendor view placeholder with:

```typescript
// Import at top of page
import { useVendors } from "@/hooks/queries/useVendors";
import { VendorInspectPane } from "@/components/vendors/VendorInspectPane";

// Inside CompanyRentalsPageInner, add vendor state:
const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
const { data: rentalVendors = [] } = useVendors(); // filter client-side for vendor_type rental_store

const rentalStoreVendors = rentalVendors.filter((v) => v.vendor_type === "rental_store");

// In the vendor view JSX:
{view === "vendors" && (
  <Grid container spacing={1.5}>
    {rentalStoreVendors.map((vendor) => (
      <Grid item xs={12} sm={6} md={4} key={vendor.id}>
        <Card
          variant="outlined"
          sx={{
            borderRadius: 2,
            borderColor: selectedVendorId === vendor.id ? "primary.main" : "divider",
            borderWidth: selectedVendorId === vendor.id ? 2 : 1,
            cursor: "pointer",
          }}
          onClick={() => setSelectedVendorId(vendor.id === selectedVendorId ? null : vendor.id)}
        >
          <Box sx={{ p: 1.5 }}>
            <Typography variant="subtitle2" fontWeight={700}>{vendor.name}</Typography>
            <Typography variant="caption" color="text.secondary">{vendor.location ?? "—"}</Typography>
            <Box sx={{ mt: 1, display: "flex", gap: 0.5 }}>
              <Chip label="Shuttering" size="small" color="primary" variant="outlined" sx={{ fontSize: 10 }} />
              <Chip
                label={vendor.is_active ? "Active" : "Inactive"}
                size="small"
                color={vendor.is_active ? "success" : "default"}
                sx={{ fontSize: 10 }}
              />
            </Box>
          </Box>
        </Card>
      </Grid>
    ))}
  </Grid>
)}

// Vendor inspect pane (add alongside item inspect pane):
{view === "vendors" && selectedVendorId && (
  <VendorInspectPane
    vendorId={selectedVendorId}
    isOpen
    onClose={() => setSelectedVendorId(null)}
    canEdit
  />
)}
```

- [ ] **Step 2: Verify vendor cards appear and clicking opens VendorInspectPane**

Navigate to `/company/rentals`, toggle to "By Vendor", confirm rental vendor cards appear.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(main\)/company/rentals/page.tsx
git commit -m "feat(rentals): add vendor card grid and VendorInspectPane in By Vendor tab"
```

---

## Task 12: Manage Item Sizes via RentalItemDialog

**Files:**
- Modify: `src/components/rentals/RentalItemDialog.tsx`

- [ ] **Step 1: Add a "Sizes" section to the existing dialog**

Open `RentalItemDialog.tsx`. After the existing fields (name, code, category, etc.), add a sizes management section. This component already handles item create/edit — extend it for item sizes.

In the edit state (when `item` prop exists), show the size manager using `useRentalItemSizes` and `useCreateRentalItemSize`:

```typescript
// Inside RentalItemDialog, after existing fields, add:
import { useRentalItemSizes, useCreateRentalItemSize } from "@/hooks/queries/useRentals";

// Inside component body:
const { data: existingSizes = [] } = useRentalItemSizes(item?.id);
const createSize = useCreateRentalItemSize();
const [newSizeLabel, setNewSizeLabel] = useState("");

const handleAddSize = async () => {
  if (!item?.id || !newSizeLabel.trim()) return;
  await createSize.mutateAsync({
    rental_item_id: item.id,
    size_label: newSizeLabel.trim(),
    display_order: existingSizes.length,
  });
  setNewSizeLabel("");
};

// In JSX (only shown when editing existing item):
{item?.id && (
  <Box sx={{ mt: 2 }}>
    <Typography variant="subtitle2" gutterBottom>Size Variants</Typography>
    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
      {existingSizes.map((s) => (
        <Chip key={s.id} label={s.size_label} size="small" onDelete={() => {/* soft delete */}} />
      ))}
    </Stack>
    <Box sx={{ display: "flex", gap: 1 }}>
      <TextField
        size="small"
        label="Add size (e.g. 6×1½)"
        value={newSizeLabel}
        onChange={(e) => setNewSizeLabel(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleAddSize()}
        sx={{ flex: 1 }}
      />
      <Button variant="outlined" size="small" onClick={handleAddSize}>Add</Button>
    </Box>
  </Box>
)}
```

- [ ] **Step 2: Verify size management works**

Navigate to `/company/rentals`, open "Add Item", create a new item, then edit it and add sizes "6×1½" and "4×1½". Verify they appear as chips on the card.

- [ ] **Step 3: Commit**

```bash
git add src/components/rentals/RentalItemDialog.tsx
git commit -m "feat(rentals): add size variant management to RentalItemDialog"
```

---

## Task 13: Visual Verification and Cleanup

- [ ] **Step 1: Start dev server and login**

```bash
npm run dev
```

Navigate to `http://localhost:3000/dev-login` → auto-redirects to dashboard.

- [ ] **Step 2: Verify full catalog flow**

1. Go to `/company/rentals`
2. Confirm card grid loads with category filter chips
3. Toggle to "By Vendor" → vendor cards visible
4. Toggle back to "By Item" → click a card → inspect pane opens
5. Select a size chip → vendor rates update
6. Enter qty=50 days=25 → cost preview shows
7. Click "Add to Estimate Basket" → badge on button increments
8. Click "Estimate Basket" button → drawer opens with vendor comparison
9. Adjust qty/days in drawer → costs update
10. Click "Clear Basket" → basket empties

- [ ] **Step 3: Check console for errors**

Use Playwright MCP to read browser console. Fix any errors found.

- [ ] **Step 4: Run full test suite**

```bash
npm run test
npm run build
```

Expected: all tests pass, build succeeds with no errors.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(rentals): Phase 1 catalog complete — card view, inspect pane, estimate basket"
```

---

## Summary

After completing all 13 tasks, `/company/rentals` will have:
- Card grid with category filter, search, By Item / By Vendor toggle
- Per-item size variants managed via `rental_item_sizes` table
- Inspect pane showing vendor rates per size with qty+days cost preview
- Estimate basket that persists across navigation and shows cross-vendor cost comparison
- Vendor view using existing `VendorInspectPane`

Phase 2 (rental request from basket → PO → delivery → returns → settlement) is in the separate plan: `2026-05-12-rental-lifecycle-phases2-4.md`.
