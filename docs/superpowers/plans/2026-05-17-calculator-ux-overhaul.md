# Calculator UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix vendor data quality (duplicates, zero prices, wrong quality-tier filtering) and add AGG/CEM category templates with correct units, then redesign the calculator page into a permanent split-pane layout with an inline basket panel that shows item dimensions and unit totals.

**Architecture:** Five focused tasks in dependency order: fix the vendor query first (no UI impact, safe to ship alone), add missing category templates, create the new `EstimateBasketPanel` component, update `CalculatorWorkspace` to optionally hide its built-in basket drawer, then rearrange `CalculatorPageContent` into the 2-column grid layout.

**Tech Stack:** Next.js 15, MUI v7 (Grid with `size={}`), TanStack Query, TypeScript, Supabase PostgREST

---

## File Map

| Action | File | What changes |
|--------|------|--------------|
| Modify | `src/hooks/queries/useCalculatorQuotes.ts` | Remove brand_id filter, add price > 0, deduplicate per vendor |
| Modify | `src/lib/category-calculator-templates.ts` | Add 'cft' to UnitOption, add AGG + CEM templates |
| Create | `src/components/calculator/EstimateBasketPanel.tsx` | Inline basket panel with dimension rows + totals |
| Modify | `src/components/calculator/CalculatorWorkspace.tsx` | Add `hideBasketControls` prop |
| Modify | `src/components/calculator/CalculatorPageContent.tsx` | Split-pane 2-column layout using EstimateBasketPanel |

---

## Task 1: Fix Vendor Query

**Problem:** Three bugs in `useCalculatorVendorQuotes`:
1. When a quality chip is selected, it filtered `vendor_inventory.brand_id` to match the quality tier's brand ID — but vendor prices are stored per-material (not per quality tier), so all vendors disappeared.
2. Multiple rows per vendor accumulate over time → same vendor appears 3–4 times.
3. `current_price = 0` entries pass the `!== null` JS filter → phantom ₹0 cards appear.

**Fix:** Remove brand_id filter, move price filtering to DB level (`.gt`), deduplicate by vendor_id client-side.

**Files:**
- Modify: `src/hooks/queries/useCalculatorQuotes.ts`

- [ ] **Step 1: Replace the file with the fixed version**

```typescript
"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { wrapQueryFn } from "@/lib/utils/timeout";
import type { VendorQuote } from "@/lib/category-calculator-templates";

/**
 * Fetches vendor prices for a given material, deduplicated to one row per vendor
 * (lowest price wins). Vendor prices are per-material — quality/brand selection
 * does NOT filter vendors because vendor_inventory has no brand_id associations
 * for most materials.
 *
 * @param materialId - Pass null to disable the query.
 * @param _brandId   - Retained in signature for call-site compatibility; unused.
 */
export function useCalculatorVendorQuotes(
  materialId: string | null,
  _brandId?: string | null,
): { quotes: VendorQuote[]; isLoading: boolean; error: Error | null } {
  const supabase = createClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["calculatorQuotes", materialId],
    enabled: materialId !== null,
    queryFn: wrapQueryFn(
      async () => {
        const { data: rows, error: queryError } = await supabase
          .from("vendor_inventory")
          .select(
            `
            vendor_id,
            current_price,
            price_includes_gst,
            last_price_update,
            updated_at,
            vendors(name)
          `,
          )
          .eq("material_id", materialId as string)
          .eq("is_available", true)
          .gt("current_price", 0)
          .order("current_price", { ascending: true });

        if (queryError) throw new Error(queryError.message);

        // Deduplicate by vendor_id — keep the row with the lowest price.
        // vendor_inventory accumulates multiple price-history rows per vendor.
        const bestByVendor = new Map<string, (typeof rows)[number]>();
        for (const row of rows ?? []) {
          const existing = bestByVendor.get(row.vendor_id);
          if (
            !existing ||
            (row.current_price as number) < (existing.current_price as number)
          ) {
            bestByVendor.set(row.vendor_id, row);
          }
        }

        return Array.from(bestByVendor.values())
          .sort(
            (a, b) =>
              (a.current_price as number) - (b.current_price as number),
          )
          .map((row): VendorQuote => {
            const vendorData = row.vendors as { name: string } | null;
            return {
              vendorId: row.vendor_id,
              vendorName: vendorData?.name ?? "Unknown Vendor",
              unitPrice: row.current_price as number,
              updatedAt: row.last_price_update ?? row.updated_at ?? null,
              priceIncludesGst: row.price_includes_gst ?? false,
            };
          });
      },
      { operationName: "useCalculatorVendorQuotes" },
    ),
    staleTime: 5 * 60 * 1000,
  });

  return {
    quotes: data ?? [],
    isLoading,
    error: error as Error | null,
  };
}
```

- [ ] **Step 2: Verify build passes**

```
npm run build 2>&1 | tail -20
```

Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```
git add src/hooks/queries/useCalculatorQuotes.ts
git commit -m "fix(calculator): deduplicate vendors, remove brand_id filter, filter zero prices"
```

---

## Task 2: Add AGG and CEM Category Templates

**Problem:** `Jalli Gravel Aggreggate` (AGG category) and `PPC Cement` (CEM category) fall back to `DEFAULT_CALCULATOR_TEMPLATE` which uses "pcs" — but aggregates are bought by the cubic foot and cement by the bag.

**Fix:** Add two new entries to `CALCULATOR_TEMPLATES`, add `'cft'` to `UnitOption`.

**Files:**
- Modify: `src/lib/category-calculator-templates.ts`

- [ ] **Step 1: Open `src/lib/category-calculator-templates.ts` and apply these changes**

**1a. Extend `UnitOption` on line 9** — add `'cft'`:

```typescript
export type UnitOption = 'ft' | 'in' | 'mm' | 'm' | 'pcs' | 'sqft' | 'sqm' | '%' | 'cft';
```

**1b. Add AGG and CEM AI prompts** after the `TILES_AI_PROMPT` block (around line 90):

```typescript
// ─── AGG: Sand & Aggregates ───────────────────────────────────────────────────

const AGG_AI_PROMPT = `I am uploading a drawing or specification.
Extract aggregate/sand requirements and return ONLY valid JSON (no markdown, no prose):
[
  {
    "name": "string (e.g. M Sand, Jalli, River Sand)",
    "qty_cft": number,
    "brand": "string | null"
  }
]`;

// ─── CEM: Cement & Binding ────────────────────────────────────────────────────

const CEM_AI_PROMPT = `I am uploading a drawing or specification.
Extract cement requirements and return ONLY valid JSON (no markdown, no prose):
[
  {
    "name": "string (e.g. PPC Cement, OPC 53 Grade)",
    "bags": number,
    "brand": "string | null"
  }
]`;
```

**1c. Add AGG and CEM entries to `CALCULATOR_TEMPLATES`** after the TIL entry (before the closing `};`):

```typescript
  // Matches material_categories.code = 'AGG'
  AGG: {
    categoryCode: 'AGG',
    inputs: [
      {
        key: 'qty',
        label: 'Quantity',
        unitOptions: ['cft'],
        defaultUnit: 'cft',
        defaultValue: 1,
        min: 0.1,
        step: 0.5,
      },
    ],
    outputUnit: 'cft',
    outputLabel: 'Total quantity (cft)',
    pricingDimension: 'brand',
    pricingDimensionLabel: 'Brand',
    computeOutput: (values) => values.qty ?? 0,
    computeCost: calculateLinearCost,
    aiPrompt: AGG_AI_PROMPT,
  },

  // Matches material_categories.code = 'CEM'
  CEM: {
    categoryCode: 'CEM',
    inputs: [
      {
        key: 'qty',
        label: 'Bags',
        unitOptions: ['pcs'],
        defaultUnit: 'pcs',
        defaultValue: 1,
        min: 1,
        step: 1,
      },
    ],
    outputUnit: 'bags',
    outputLabel: 'Total bags',
    pricingDimension: 'brand',
    pricingDimensionLabel: 'Brand',
    computeOutput: (values) => values.qty ?? 0,
    computeCost: calculateLinearCost,
    aiPrompt: CEM_AI_PROMPT,
  },
```

- [ ] **Step 2: Verify build**

```
npm run build 2>&1 | tail -20
```

Expected: no TypeScript errors. The `'cft'` UnitOption is additive — existing templates still compile.

- [ ] **Step 3: Commit**

```
git add src/lib/category-calculator-templates.ts
git commit -m "feat(calculator): add AGG (cft) and CEM (bags) category templates"
```

---

## Task 3: Create EstimateBasketPanel

This is the inline panel that replaces the drawer on the calculator page. It reads from `EstimateBasketContext` (same as the drawer), so it reflects basket state immediately when items are added from the calculator on the left.

**Dimension formatting:** Each `EstimateItem` stores `inputs` (numbers) and `units` (strings). The panel uses `getCalculatorTemplate(item.categoryCode).inputs` to iterate in the correct field order and format "7 ft × 4 in × 2 in × 1 pcs".

**Totals:** Group `computedOutput` by `outputUnit` (cft, kg, bags, pcs) and show one line per unit type.

**Files:**
- Create: `src/components/calculator/EstimateBasketPanel.tsx`

- [ ] **Step 1: Create the file**

```typescript
"use client";

import {
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import DeleteRoundedIcon from "@mui/icons-material/DeleteRounded";
import ShoppingCartOutlinedIcon from "@mui/icons-material/ShoppingCartOutlined";
import {
  useEstimateBasket,
  type EstimateItem,
} from "@/contexts/EstimateBasketContext";
import { getCalculatorTemplate } from "@/lib/category-calculator-templates";
import { formatINR } from "@/lib/calculatorMath";

interface EstimateBasketPanelProps {
  onConvertToRequest: () => void;
}

/** Formats item inputs as "7 ft × 4 in × 2 in × 1 pcs". */
function formatDimensions(item: EstimateItem): string {
  const template = getCalculatorTemplate(item.categoryCode);
  return template.inputs
    .map((field) => {
      const val = item.inputs[field.key];
      const unit = item.units[field.key] ?? field.defaultUnit;
      if (!val || val === 0) return null;
      return `${val} ${unit}`;
    })
    .filter((p): p is string => p !== null)
    .join(" × ");
}

function BasketItemRow({
  item,
  onRemove,
}: {
  item: EstimateItem;
  onRemove: () => void;
}) {
  const selectedQuote = item.selectedVendorId
    ? item.vendorQuotes.find((q) => q.vendorId === item.selectedVendorId)
    : null;

  const dimensions = formatDimensions(item);

  return (
    <Box
      sx={{
        py: 1.5,
        borderBottom: "1px solid",
        borderColor: "divider",
      }}
    >
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0, pr: 1 }}>
          {/* Material name + quality chip on same row */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap", mb: 0.25 }}>
            <Typography variant="body2" fontWeight={700}>
              {item.materialName}
            </Typography>
            {item.pricingDimensionValue && (
              <Chip
                label={item.pricingDimensionValue}
                size="small"
                variant="outlined"
                sx={{ fontSize: 10, height: 18 }}
              />
            )}
          </Box>

          {/* Dimensions */}
          {dimensions && (
            <Typography variant="caption" color="text.secondary" display="block">
              {dimensions}
            </Typography>
          )}

          {/* Output (cft / kg / bags) */}
          <Typography variant="caption" color="primary.main" fontWeight={600} display="block">
            {item.computedOutput.toFixed(3)} {item.outputUnit}
          </Typography>

          {/* Vendor + subtotal */}
          {selectedQuote ? (
            <Box sx={{ mt: 0.5, display: "flex", gap: 1, alignItems: "baseline" }}>
              <Typography variant="caption" color="text.secondary">
                {selectedQuote.vendorName}
              </Typography>
              <Typography variant="caption" fontWeight={700} color="text.primary">
                {formatINR(selectedQuote.subtotal)}
              </Typography>
            </Box>
          ) : (
            <Typography
              variant="caption"
              color="text.disabled"
              display="block"
              sx={{ mt: 0.5 }}
            >
              No vendor selected
            </Typography>
          )}
        </Box>

        <IconButton size="small" onClick={onRemove} color="error" sx={{ mt: -0.5 }}>
          <DeleteRoundedIcon fontSize="small" />
        </IconButton>
      </Box>
    </Box>
  );
}

export function EstimateBasketPanel({ onConvertToRequest }: EstimateBasketPanelProps) {
  const { items, removeItem, clearBasket, totalItems } = useEstimateBasket();

  const grandTotal = items.reduce((sum, item) => {
    if (!item.selectedVendorId) return sum;
    const quote = item.vendorQuotes.find((q) => q.vendorId === item.selectedVendorId);
    return sum + (quote?.subtotal ?? 0);
  }, 0);

  const itemsWithoutVendor = items.filter(
    (item) =>
      !item.selectedVendorId ||
      !item.vendorQuotes.some((q) => q.vendorId === item.selectedVendorId),
  ).length;

  // Group computed outputs by unit (cft, kg, bags, pcs…)
  const unitTotals = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.outputUnit] = (acc[item.outputUnit] ?? 0) + item.computedOutput;
    return acc;
  }, {});

  return (
    <Paper
      variant="outlined"
      sx={{
        display: "flex",
        flexDirection: "column",
        position: { md: "sticky" },
        top: { md: 80 },
        maxHeight: { md: "calc(100vh - 100px)" },
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <ShoppingCartOutlinedIcon fontSize="small" color="primary" />
          <Typography variant="subtitle2" fontWeight={700}>
            Estimate Basket
          </Typography>
          {totalItems > 0 && (
            <Chip label={totalItems} size="small" color="primary" />
          )}
        </Box>
        {totalItems > 0 && (
          <Button
            size="small"
            color="error"
            onClick={clearBasket}
            sx={{ textTransform: "none", fontSize: "0.75rem" }}
          >
            Clear all
          </Button>
        )}
      </Box>

      {/* Item list */}
      {items.length === 0 ? (
        <Box
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            p: 3,
            textAlign: "center",
            color: "text.disabled",
            gap: 1,
          }}
        >
          <ShoppingCartOutlinedIcon sx={{ fontSize: 36, opacity: 0.3 }} />
          <Typography variant="body2">
            Add items from the calculator to build your estimate
          </Typography>
        </Box>
      ) : (
        <>
          <Box sx={{ flex: 1, overflowY: "auto", px: 2 }}>
            {items.map((item) => (
              <BasketItemRow
                key={item.id}
                item={item}
                onRemove={() => removeItem(item.id)}
              />
            ))}
          </Box>

          <Divider />

          {/* Unit totals */}
          <Box sx={{ px: 2, pt: 1.5, pb: 0.5 }}>
            <Stack spacing={0.25}>
              {Object.entries(unitTotals).map(([unit, total]) => (
                <Box
                  key={unit}
                  sx={{ display: "flex", justifyContent: "space-between" }}
                >
                  <Typography variant="caption" color="text.secondary">
                    Total ({unit}):
                  </Typography>
                  <Typography variant="caption" fontWeight={700}>
                    {total.toFixed(3)} {unit}
                  </Typography>
                </Box>
              ))}

              <Divider sx={{ my: 0.5 }} />

              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Typography variant="body2" color="text.secondary">
                  Grand total (selected vendors):
                </Typography>
                <Typography variant="subtitle2" fontWeight={700} color="primary.main">
                  {formatINR(grandTotal)}
                </Typography>
              </Box>
              {itemsWithoutVendor > 0 && (
                <Typography variant="caption" color="warning.main">
                  {itemsWithoutVendor} item{itemsWithoutVendor !== 1 ? "s" : ""} without vendor
                </Typography>
              )}
            </Stack>
          </Box>

          <Divider />

          {/* Action */}
          <Box sx={{ p: 2 }}>
            <Button
              fullWidth
              variant="contained"
              color="primary"
              onClick={onConvertToRequest}
            >
              Convert to Material Request →
            </Button>
          </Box>
        </>
      )}
    </Paper>
  );
}
```

- [ ] **Step 2: Verify build**

```
npm run build 2>&1 | tail -20
```

Expected: no TypeScript errors for the new file.

- [ ] **Step 3: Commit**

```
git add src/components/calculator/EstimateBasketPanel.tsx
git commit -m "feat(calculator): add inline EstimateBasketPanel with dimensions and unit totals"
```

---

## Task 4: Update CalculatorWorkspace — Add hideBasketControls Prop

The basket drawer button and `EstimateBasketDrawer` inside `CalculatorWorkspace` are needed on the material detail "Estimate" tab (no room for split pane there). On the standalone calculator page we want to hide them (the basket panel is inline).

The prop `hideBasketControls` gates both the cart button and the drawer.

**Files:**
- Modify: `src/components/calculator/CalculatorWorkspace.tsx`

- [ ] **Step 1: Add `hideBasketControls` to the props interface**

In `CalculatorWorkspace.tsx`, find the `CalculatorWorkspaceProps` interface (lines 38–44) and add the new prop:

```typescript
interface CalculatorWorkspaceProps {
  /** If provided, the material is pre-selected and the selector is hidden */
  fixedMaterialId?: string;
  fixedMaterialName?: string;
  fixedCategoryCode?: string;
  onConvertToRequest?: () => void;
  /**
   * When true, hides the top-right cart badge button and the EstimateBasketDrawer.
   * Use on pages that render EstimateBasketPanel inline alongside the workspace.
   */
  hideBasketControls?: boolean;
}
```

- [ ] **Step 2: Destructure the new prop in the function signature**

Find the function signature (around line 46):

```typescript
export default function CalculatorWorkspace({
  fixedMaterialId,
  fixedMaterialName,
  fixedCategoryCode,
  onConvertToRequest,
  hideBasketControls = false,
}: CalculatorWorkspaceProps) {
```

- [ ] **Step 3: Wrap the basket button with the guard**

Find the top-row basket button block (around lines 174–188):

```typescript
      {/* Top row: basket badge button */}
      {!hideBasketControls && (
        <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
          <Button
            startIcon={
              <Badge badgeContent={totalItems} color="primary">
                <ShoppingCartRoundedIcon />
              </Badge>
            }
            onClick={() => setBasketDrawerOpen(true)}
            variant="outlined"
            size="small"
          >
            Estimate Basket
          </Button>
        </Box>
      )}
```

- [ ] **Step 4: Wrap the EstimateBasketDrawer with the guard**

Find the `<EstimateBasketDrawer .../>` block at the bottom of the return (around lines 356–364):

```typescript
      {/* Estimate basket drawer — hidden when basket is shown inline */}
      {!hideBasketControls && (
        <EstimateBasketDrawer
          open={basketDrawerOpen}
          onClose={() => setBasketDrawerOpen(false)}
          onConvertToRequest={() => {
            onConvertToRequest?.();
            setBasketDrawerOpen(false);
          }}
        />
      )}
```

- [ ] **Step 5: Verify build**

```
npm run build 2>&1 | tail -20
```

Expected: no TypeScript errors. The material detail page doesn't pass `hideBasketControls` so it keeps drawer behavior.

- [ ] **Step 6: Commit**

```
git add src/components/calculator/CalculatorWorkspace.tsx
git commit -m "feat(calculator): add hideBasketControls prop to CalculatorWorkspace"
```

---

## Task 5: Redesign CalculatorPageContent — Split-Pane Layout

Replace the centred single-column layout with a 2-column grid. Desktop: calculator left (7/12), basket panel right (5/12) as a sticky card. Mobile: stacked, basket below calculator.

The `maxWidth: 720` constraint is removed so the two columns have room to breathe. `maxWidth: 1200` keeps it readable on very wide monitors.

**Files:**
- Modify: `src/components/calculator/CalculatorPageContent.tsx`

- [ ] **Step 1: Replace the file content**

```typescript
"use client";

import { useState } from "react";
import { Box, Grid, Typography } from "@mui/material";
import CalculatorWorkspace from "./CalculatorWorkspace";
import { EstimateBasketPanel } from "./EstimateBasketPanel";
import SitePickerForMR from "./SitePickerForMR";
import MaterialRequestDialog, {
  MRInitialItem,
} from "@/components/materials/MaterialRequestDialog";
import { useEstimateBasket } from "@/contexts/EstimateBasketContext";

export default function CalculatorPageContent() {
  const [sitePickerOpen, setSitePickerOpen] = useState(false);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [mrDialogOpen, setMrDialogOpen] = useState(false);
  const { items, clearBasket } = useEstimateBasket();

  const basketItems: MRInitialItem[] = items
    .map((item) => ({
      materialId: item.materialId ?? "",
      qty: Math.ceil(item.computedOutput),
      notes: item.pricingDimensionValue
        ? `From calculator — ${item.outputLabel}: ${item.computedOutput.toFixed(3)} ${item.outputUnit} · ${item.pricingDimensionValue}`
        : `From calculator — ${item.outputLabel}: ${item.computedOutput.toFixed(3)} ${item.outputUnit}`,
    }))
    .filter((i) => i.materialId !== "");

  function handleConvertToRequest() {
    setSitePickerOpen(true);
  }

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto", p: { xs: 2, sm: 3 } }}>
      {/* Page header */}
      <Typography variant="h5" fontWeight={700} gutterBottom>
        Material Cost Calculator
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Estimate material costs and compare vendor prices before creating a
        request.
      </Typography>

      {/* Split-pane: calculator left, basket right */}
      <Grid container spacing={3} alignItems="flex-start">
        <Grid size={{ xs: 12, md: 7 }}>
          <CalculatorWorkspace
            hideBasketControls
            onConvertToRequest={handleConvertToRequest}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 5 }}>
          <EstimateBasketPanel onConvertToRequest={handleConvertToRequest} />
        </Grid>
      </Grid>

      {/* Site picker + MR dialog — shared by both columns */}
      <SitePickerForMR
        open={sitePickerOpen}
        onClose={() => setSitePickerOpen(false)}
        onSiteSelected={(siteId) => {
          setSelectedSiteId(siteId);
          setSitePickerOpen(false);
          setMrDialogOpen(true);
        }}
      />
      {selectedSiteId && (
        <MaterialRequestDialog
          open={mrDialogOpen}
          onClose={() => {
            setMrDialogOpen(false);
            clearBasket();
          }}
          request={null}
          siteId={selectedSiteId}
          initialItems={basketItems}
        />
      )}
    </Box>
  );
}
```

- [ ] **Step 2: Verify build**

```
npm run build 2>&1 | tail -20
```

Expected: clean build. `/company/calculator` page size may increase slightly due to EstimateBasketPanel being bundled in.

- [ ] **Step 3: Visual check — start dev server and verify layout**

```
npm run dev:cloud
```

Navigate to `http://localhost:3000/company/calculator`. Verify:
- On desktop (≥900px): calculator on left, empty basket panel on right with cart icon and helper text
- Select "Teak wood" → dimension inputs appear, **Jeyam timber mart** and **Roshan timber land** appear (no Sathish)
- Select "Jalli Gravel Aggreggate" → unit shows "cft", Sathish - Sand appears **once** (not 3 times), Pinveedu Manivel also shows once
- Select "PPC Cement" → input label shows "Bags", outputLabel shows "Total bags"
- Select "2nd Quality" chip for teak → **vendor prices stay visible** (previously they disappeared)
- Add items to basket → they appear in the right panel with dimensions (e.g. "7 ft × 4 in × 2 in × 1 pcs") and output
- "Total (cft):" appears in footer for wood items
- Mobile (resize to <900px): calculator stacks above basket panel

- [ ] **Step 4: Commit**

```
git add src/components/calculator/CalculatorPageContent.tsx
git commit -m "feat(calculator): split-pane layout with inline basket panel"
```

---

## Self-Review Checklist

- [x] **Vendor deduplication**: Task 1 groups by `vendor_id`, keeps lowest price — Sathish appears once.
- [x] **Zero-price filter**: `.gt("current_price", 0)` at DB level — no ₹0 cards.
- [x] **Brand_id filter removed**: Quality chip selection no longer hides vendor prices.
- [x] **AGG template**: `outputUnit = 'cft'`, `UnitOption` extended with `'cft'`.
- [x] **CEM template**: `outputUnit = 'bags'`, input label "Bags".
- [x] **EstimateBasketPanel**: Reads from shared context, renders inline (Paper with sticky positioning on md+).
- [x] **Dimension formatting**: `formatDimensions` uses template field order → correct join.
- [x] **Unit totals**: Grouped by `outputUnit` — shows cft total for wood, bags for cement, etc.
- [x] **hideBasketControls**: Guards both the cart badge button and `EstimateBasketDrawer` in CalculatorWorkspace.
- [x] **Material detail page unchanged**: Doesn't pass `hideBasketControls`, keeps drawer behavior.
- [x] **MUI v7 Grid**: Uses `size={{ xs: 12, md: 7 }}` syntax (not deprecated `xs`/`md` props).
- [x] **queryKey updated**: `["calculatorQuotes", materialId]` — brandId removed since it's no longer a query variable.
- [x] **Type consistency**: `EstimateBasketPanel` receives `EstimateItem[]` from `useEstimateBasket()`, `getCalculatorTemplate` receives `item.categoryCode` — all types match.
