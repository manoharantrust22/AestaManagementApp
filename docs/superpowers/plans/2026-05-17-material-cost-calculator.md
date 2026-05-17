# Material Cost Calculator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a universal material cost calculator at `/company/calculator` (plus an embedded estimate panel inside each material's detail page) that lets users compute Gana adi (cft) / weight / area, compare vendor prices by quality or brand, and one-click convert their estimate basket into a Material Request.

**Architecture:** Schema-driven `CALCULATOR_TEMPLATES` keyed by category code (WOD, STL, TIL, default) drive the calculator UI — each template declares input fields, a formula, and output unit. Quality tiers for wood are stored as `material_brands` rows (reusing the existing DB pattern). An `EstimateBasketContext` holds items client-side; the basket drawer converts them into a pre-filled `MaterialRequestDialog`.

**Tech Stack:** Next.js 15, MUI v7, TanStack Query, Supabase, Vitest, Zod 4

---

## File Map

**New files:**
- `supabase/migrations/20260517100000_add_calculator_label_to_categories.sql`
- `supabase/migrations/20260517110000_seed_wood_quality_tiers.sql`
- `src/lib/calculatorMath.ts` + `src/lib/calculatorMath.test.ts`
- `src/lib/category-calculator-templates.ts`
- `src/lib/aiPromptSchemas.ts`
- `src/contexts/EstimateBasketContext.tsx`
- `src/hooks/queries/useCalculatorQuotes.ts`
- `src/components/calculator/CalculatorInputs.tsx`
- `src/components/calculator/VendorQuoteList.tsx`
- `src/components/calculator/AiAssistDialog.tsx`
- `src/components/calculator/EstimateBasketDrawer.tsx`
- `src/components/calculator/CalculatorWorkspace.tsx`
- `src/app/(main)/company/calculator/page.tsx`

**Modified files:**
- `src/lib/category-variant-templates.ts` — add `wood_timber` template
- `src/app/(main)/company/materials/[id]/page.tsx` — add "Estimate" tab
- `src/components/materials/MaterialRequestDialog.tsx` — add `initialItems` prop
- `src/components/layout/MainLayout.tsx` — add Calculator nav item + wrap children in `EstimateBasketProvider`

---

## Task 1: Migration — `calculator_label` column on `material_categories`

**Files:**
- Create: `supabase/migrations/20260517100000_add_calculator_label_to_categories.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260517100000_add_calculator_label_to_categories.sql
ALTER TABLE material_categories
  ADD COLUMN IF NOT EXISTS calculator_label TEXT;

-- Wood & Timber category shows "Quality" instead of "Brand"
UPDATE material_categories
SET calculator_label = 'Quality'
WHERE code = 'WOD';
```

- [ ] **Step 2: Apply locally and verify**

```bash
npx supabase db reset
# Confirm the column exists:
npx supabase db shell --local -c "\d material_categories" | grep calculator_label
```
Expected: a row showing `calculator_label | text`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260517100000_add_calculator_label_to_categories.sql
git commit -m "feat(calculator): add calculator_label column to material_categories"
```

---

## Task 2: Migration — Seed quality tier brands for WOD materials

**Files:**
- Create: `supabase/migrations/20260517110000_seed_wood_quality_tiers.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260517110000_seed_wood_quality_tiers.sql
-- Insert 1st / 2nd / 3rd Quality brand rows for every parent WOD material
-- that doesn't already have them, so vendor prices can be stored per quality tier.
INSERT INTO material_brands (material_id, brand_name, is_active, is_preferred, created_at, updated_at)
SELECT
  m.id,
  qt.quality_name,
  true,
  qt.quality_name = '1st Quality',
  now(),
  now()
FROM materials m
JOIN material_categories mc ON mc.id = m.category_id
CROSS JOIN (VALUES ('1st Quality'), ('2nd Quality'), ('3rd Quality')) AS qt(quality_name)
WHERE mc.code = 'WOD'
  AND m.parent_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM material_brands mb
    WHERE mb.material_id = m.id
      AND mb.brand_name = qt.quality_name
  );
```

- [ ] **Step 2: Apply locally and verify**

```bash
npx supabase db reset
npx supabase db shell --local -c \
  "SELECT m.name, mb.brand_name FROM material_brands mb
   JOIN materials m ON m.id = mb.material_id
   JOIN material_categories mc ON mc.id = m.category_id
   WHERE mc.code = 'WOD' ORDER BY m.name, mb.brand_name;"
```
Expected: rows showing `Teak wood | 1st Quality`, `Teak wood | 2nd Quality`, `Teak wood | 3rd Quality` (and similar for any other WOD parent materials).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260517110000_seed_wood_quality_tiers.sql
git commit -m "feat(calculator): seed 1st/2nd/3rd quality tier brands for WOD materials"
```

---

## Task 3: `calculatorMath.ts` — unit conversion helpers + tests

**Files:**
- Create: `src/lib/calculatorMath.ts`
- Create: `src/lib/calculatorMath.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/calculatorMath.test.ts
import { describe, it, expect } from 'vitest';
import {
  toFeet,
  calculateCubicFeet,
  formatCft,
  calculateLinearCost,
  formatINR,
} from './calculatorMath';

describe('toFeet', () => {
  it('returns value unchanged when unit is ft', () => {
    expect(toFeet(7, 'ft')).toBe(7);
  });
  it('converts inches to feet', () => {
    expect(toFeet(12, 'in')).toBe(1);
    expect(toFeet(6, 'in')).toBeCloseTo(0.5);
  });
});

describe('calculateCubicFeet', () => {
  it('1ft cube × 1 piece = 1 cft', () => {
    expect(calculateCubicFeet(1, 'ft', 1, 'ft', 1, 'ft', 1)).toBe(1);
  });
  it('1ft × 12in × 12in × 1 piece = 1 cft', () => {
    expect(calculateCubicFeet(1, 'ft', 12, 'in', 12, 'in', 1)).toBe(1);
  });
  it('7ft × 3in × 1.5in × 12 pieces = 2.625 cft', () => {
    expect(calculateCubicFeet(7, 'ft', 3, 'in', 1.5, 'in', 12)).toBeCloseTo(2.625, 5);
  });
  it('returns 0 when qty is 0', () => {
    expect(calculateCubicFeet(7, 'ft', 3, 'in', 1.5, 'in', 0)).toBe(0);
  });
});

describe('calculateLinearCost', () => {
  it('multiplies output qty by unit price', () => {
    expect(calculateLinearCost(2.625, 2500)).toBeCloseTo(6562.5);
  });
  it('returns 0 for 0 qty', () => {
    expect(calculateLinearCost(0, 2500)).toBe(0);
  });
});

describe('formatCft', () => {
  it('formats to 3 decimal places with cft suffix', () => {
    expect(formatCft(2.625)).toBe('2.625 cft');
    expect(formatCft(1)).toBe('1.000 cft');
  });
});

describe('formatINR', () => {
  it('formats as Indian Rupees with no decimal', () => {
    expect(formatINR(6562.5)).toContain('₹');
    expect(formatINR(6562.5)).toContain('6,563');
  });
});
```

- [ ] **Step 2: Run tests — verify they FAIL**

```bash
npx vitest run src/lib/calculatorMath.test.ts
```
Expected: all tests fail with "Cannot find module './calculatorMath'".

- [ ] **Step 3: Implement `calculatorMath.ts`**

```typescript
// src/lib/calculatorMath.ts
export type LengthUnit = 'ft' | 'in';

/** Convert a value to feet. */
export function toFeet(value: number, unit: LengthUnit): number {
  return unit === 'in' ? value / 12 : value;
}

/**
 * Calculate cubic feet (Gana adi) from timber dimensions.
 * Length can be ft or in; width and thickness are typically in inches but accept ft too.
 */
export function calculateCubicFeet(
  length: number, lengthUnit: LengthUnit,
  width: number, widthUnit: LengthUnit,
  thickness: number, thicknessUnit: LengthUnit,
  qty: number,
): number {
  return toFeet(length, lengthUnit)
    * toFeet(width, widthUnit)
    * toFeet(thickness, thicknessUnit)
    * qty;
}

/** Format a cft value with 3 decimal places. */
export function formatCft(cft: number): string {
  return `${cft.toFixed(3)} cft`;
}

/** qty × unit price = total cost */
export function calculateLinearCost(qty: number, unitPrice: number): number {
  return qty * unitPrice;
}

/** Format a number as Indian Rupees (no decimals). */
export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}
```

- [ ] **Step 4: Run tests — verify all PASS**

```bash
npx vitest run src/lib/calculatorMath.test.ts
```
Expected: 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/calculatorMath.ts src/lib/calculatorMath.test.ts
git commit -m "feat(calculator): add calculatorMath helpers (cft, cost, formatting)"
```

---

## Task 4: `category-calculator-templates.ts` — per-category calculator schemas

**Files:**
- Create: `src/lib/category-calculator-templates.ts`

- [ ] **Step 1: Write the file**

```typescript
// src/lib/category-calculator-templates.ts
import {
  calculateCubicFeet,
  calculateLinearCost,
  type LengthUnit,
} from './calculatorMath';
import { TMT_WEIGHTS_PER_METER } from './weightCalculation';

export type UnitOption = 'ft' | 'in' | 'mm' | 'm' | 'pcs' | 'sqft' | 'sqm' | '%';

export type CalculatorInputField = {
  key: string;
  label: string;
  unitOptions: UnitOption[];
  defaultUnit: UnitOption;
  defaultValue?: number;
  min?: number;
  step?: number;
};

export type VendorQuote = {
  vendorId: string;
  vendorName: string;
  unitPrice: number;
  updatedAt: string | null;
  priceIncludesGst: boolean;
};

export type CalculatorTemplate = {
  /** Category code this template handles, e.g. 'WOD' */
  categoryCode: string;
  inputs: CalculatorInputField[];
  /** Unit shown after the computed result, e.g. 'cft' */
  outputUnit: string;
  /** Human-readable label for the computed result, e.g. 'Gana adi (cft)' */
  outputLabel: string;
  /** Whether vendor quotes are keyed by brand ('brand') or no dimension ('none') */
  pricingDimension: 'brand' | 'none';
  /** Label for the pricing dimension selector, e.g. 'Quality' or 'Brand' */
  pricingDimensionLabel: string;
  computeOutput: (
    values: Record<string, number>,
    units: Record<string, UnitOption>,
  ) => number;
  computeCost: (output: number, unitPrice: number) => number;
  /** Prompt template shown in the AI-assist dialog */
  aiPrompt: string;
};

// ─── WOD: Wood & Timber ──────────────────────────────────────────────────────

const WOOD_AI_PROMPT = `I am uploading an image of a window or door drawing/photo.
Extract every piece of wood needed and return ONLY valid JSON (no markdown, no prose):
[
  {
    "name": "string (e.g. Door frame horizontal)",
    "length_ft": number,
    "width_in": number,
    "thickness_in": number,
    "qty": number,
    "quality_tier": "1st Quality" | "2nd Quality" | "3rd Quality" | null
  }
]
Use feet for length and inches for width/thickness. Estimate if exact values are unclear.`;

// ─── STL/TMT: Steel bars ─────────────────────────────────────────────────────

const STEEL_AI_PROMPT = `I am uploading a structural drawing or bar-bending schedule.
Extract every TMT bar requirement and return ONLY valid JSON (no markdown, no prose):
[
  {
    "diameter_mm": 8 | 10 | 12 | 16 | 20 | 25 | 32,
    "length_m": number,
    "qty": number,
    "brand": "string | null"
  }
]`;

// ─── TIL: Tiles ───────────────────────────────────────────────────────────────

const TILES_AI_PROMPT = `I am uploading a floor/wall plan or a photo.
Extract tiling requirements and return ONLY valid JSON (no markdown, no prose):
[
  {
    "area_sqft": number,
    "tile_size_sqft": number,
    "wastage_pct": number,
    "brand": "string | null"
  }
]`;

export const CALCULATOR_TEMPLATES: Record<string, CalculatorTemplate> = {
  // Matches material_categories.code = 'WOD'
  WOD: {
    categoryCode: 'WOD',
    inputs: [
      { key: 'length',    label: 'Length',    unitOptions: ['ft', 'in'], defaultUnit: 'ft' },
      { key: 'width',     label: 'Width',     unitOptions: ['in', 'ft'], defaultUnit: 'in' },
      { key: 'thickness', label: 'Thickness', unitOptions: ['in', 'ft'], defaultUnit: 'in' },
      { key: 'qty',       label: 'Pieces',    unitOptions: ['pcs'],      defaultUnit: 'pcs', defaultValue: 1, min: 1, step: 1 },
    ],
    outputUnit: 'cft',
    outputLabel: 'Gana adi (cft)',
    pricingDimension: 'brand',
    pricingDimensionLabel: 'Quality',
    computeOutput: (values, units) => calculateCubicFeet(
      values.length    ?? 0, (units.length    ?? 'ft') as LengthUnit,
      values.width     ?? 0, (units.width     ?? 'in') as LengthUnit,
      values.thickness ?? 0, (units.thickness ?? 'in') as LengthUnit,
      values.qty       ?? 0,
    ),
    computeCost: calculateLinearCost,
    aiPrompt: WOOD_AI_PROMPT,
  },

  // Matches material_categories.code = 'STL'
  STL: {
    categoryCode: 'STL',
    inputs: [
      {
        key: 'diameter_mm',
        label: 'Diameter',
        unitOptions: ['mm'],
        defaultUnit: 'mm',
        defaultValue: 12,
        min: 8,
        step: 2,
      },
      {
        key: 'length',
        label: 'Length per rod',
        unitOptions: ['m', 'ft'],
        defaultUnit: 'm',
        defaultValue: 12,
        min: 0.1,
        step: 0.5,
      },
      {
        key: 'qty',
        label: 'Rods',
        unitOptions: ['pcs'],
        defaultUnit: 'pcs',
        defaultValue: 1,
        min: 1,
        step: 1,
      },
    ],
    outputUnit: 'kg',
    outputLabel: 'Total weight (kg)',
    pricingDimension: 'brand',
    pricingDimensionLabel: 'Brand',
    computeOutput: (values) => {
      const dia = `${values.diameter_mm ?? 12}mm`;
      const weightPerMeter = TMT_WEIGHTS_PER_METER[dia] ?? 0;
      const lengthM = values.length ?? 0;
      const qty = values.qty ?? 0;
      return weightPerMeter * lengthM * qty;
    },
    computeCost: calculateLinearCost,
    aiPrompt: STEEL_AI_PROMPT,
  },

  // Matches material_categories.code = 'TIL'
  TIL: {
    categoryCode: 'TIL',
    inputs: [
      { key: 'area',           label: 'Area to tile',   unitOptions: ['sqft', 'sqm'], defaultUnit: 'sqft' },
      { key: 'tile_sqft',      label: 'Tile coverage',  unitOptions: ['sqft'],        defaultUnit: 'sqft', defaultValue: 1 },
      { key: 'wastage_pct',    label: 'Wastage %',      unitOptions: ['%'],           defaultUnit: '%',   defaultValue: 10, min: 0, step: 1 },
    ],
    outputUnit: 'pcs',
    outputLabel: 'Tiles needed',
    pricingDimension: 'brand',
    pricingDimensionLabel: 'Brand',
    computeOutput: (values, units) => {
      const areaSqft = units.area === 'sqm'
        ? (values.area ?? 0) * 10.764
        : (values.area ?? 0);
      const coverage = values.tile_sqft ?? 1;
      const wastage = values.wastage_pct ?? 10;
      if (coverage <= 0) return 0;
      return Math.ceil((areaSqft / coverage) * (1 + wastage / 100));
    },
    computeCost: calculateLinearCost,
    aiPrompt: TILES_AI_PROMPT,
  },
};

/** Fallback template for categories without a specific schema. */
export const DEFAULT_CALCULATOR_TEMPLATE: CalculatorTemplate = {
  categoryCode: 'default',
  inputs: [
    { key: 'qty', label: 'Quantity', unitOptions: ['pcs'], defaultUnit: 'pcs', defaultValue: 1, min: 1, step: 1 },
  ],
  outputUnit: 'pcs',
  outputLabel: 'Quantity',
  pricingDimension: 'brand',
  pricingDimensionLabel: 'Brand',
  computeOutput: (values) => values.qty ?? 0,
  computeCost: calculateLinearCost,
  aiPrompt: `Extract material requirements and return ONLY valid JSON (no markdown, no prose):
[{ "name": "string", "qty": number, "unit": "string", "brand": "string | null" }]`,
};

export function getCalculatorTemplate(categoryCode: string | undefined): CalculatorTemplate {
  if (!categoryCode) return DEFAULT_CALCULATOR_TEMPLATE;
  return CALCULATOR_TEMPLATES[categoryCode] ?? DEFAULT_CALCULATOR_TEMPLATE;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors from `src/lib/category-calculator-templates.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/category-calculator-templates.ts
git commit -m "feat(calculator): add category calculator templates (WOD, STL, TIL, default)"
```

---

## Task 5: Add `wood_timber` variant template to `category-variant-templates.ts`

**Files:**
- Modify: `src/lib/category-variant-templates.ts`

- [ ] **Step 1: Add the `wood_timber` template entry**

Open `src/lib/category-variant-templates.ts`. After the last template entry (before the closing `};` of `CATEGORY_VARIANT_TEMPLATES`), add:

```typescript
  // ============================================
  // Wood & Timber (WOD)
  // ============================================
  wood_timber: {
    fields: [
      {
        key: 'length_value',
        name: 'Length',
        type: 'number' as const,
        required: false,
        placeholder: '7',
        helperText: 'e.g. 7 for 7 feet',
        columnWidth: 90,
      },
      {
        key: 'length_unit',
        name: 'L-Unit',
        type: 'select' as const,
        required: false,
        options: [
          { value: 'ft', label: 'ft' },
          { value: 'in', label: 'in' },
        ],
        defaultValue: 'ft',
        columnWidth: 70,
      },
      {
        key: 'width_value',
        name: 'Width',
        type: 'number' as const,
        required: false,
        placeholder: '3',
        columnWidth: 80,
      },
      {
        key: 'width_unit',
        name: 'W-Unit',
        type: 'select' as const,
        required: false,
        options: [
          { value: 'in', label: 'in' },
          { value: 'ft', label: 'ft' },
        ],
        defaultValue: 'in',
        columnWidth: 70,
      },
      {
        key: 'thickness_value',
        name: 'Thickness',
        type: 'number' as const,
        required: false,
        placeholder: '1.5',
        columnWidth: 90,
      },
      {
        key: 'thickness_unit',
        name: 'T-Unit',
        type: 'select' as const,
        required: false,
        options: [
          { value: 'in', label: 'in' },
          { value: 'ft', label: 'ft' },
        ],
        defaultValue: 'in',
        columnWidth: 70,
      },
    ],
    defaultUnit: 'cft',
    autoGenerateConfig: null,
  },
```

Also open `src/lib/constants/materialCategories.ts` and note that `WOD` maps to the `doors_windows` tab. We need a mapping from category code to variant template key. Open `src/lib/category-variant-templates.ts` and find the `getCategoryTemplate` function (if it exists) or search for where templates are looked up by category.

Search for how templates are resolved:
```bash
grep -n "getCategoryTemplate\|getTemplate\|CATEGORY_VARIANT" src/lib/category-variant-templates.ts | tail -20
```

Add a mapping entry for `WOD` → `wood_timber` in whatever lookup mechanism exists (likely a `CATEGORY_CODE_TO_TEMPLATE` map or a `getCategoryTemplate(code)` function at the bottom of the file).

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/category-variant-templates.ts
git commit -m "feat(calculator): add wood_timber variant template for WOD category"
```

---

## Task 6: `aiPromptSchemas.ts` — Zod schemas for AI JSON validation

**Files:**
- Create: `src/lib/aiPromptSchemas.ts`

- [ ] **Step 1: Write the file**

```typescript
// src/lib/aiPromptSchemas.ts
import { z } from 'zod';

export const WoodItemSchema = z.object({
  name: z.string().min(1),
  length_ft: z.number().positive(),
  width_in: z.number().positive(),
  thickness_in: z.number().positive(),
  qty: z.number().int().positive(),
  quality_tier: z.enum(['1st Quality', '2nd Quality', '3rd Quality']).nullable().optional(),
});
export type WoodItem = z.infer<typeof WoodItemSchema>;
export const WoodItemsSchema = z.array(WoodItemSchema);

export const SteelItemSchema = z.object({
  diameter_mm: z.union([
    z.literal(8), z.literal(10), z.literal(12),
    z.literal(16), z.literal(20), z.literal(25), z.literal(32),
  ]),
  length_m: z.number().positive(),
  qty: z.number().int().positive(),
  brand: z.string().nullable().optional(),
});
export type SteelItem = z.infer<typeof SteelItemSchema>;
export const SteelItemsSchema = z.array(SteelItemSchema);

export const TilesItemSchema = z.object({
  area_sqft: z.number().positive(),
  tile_size_sqft: z.number().positive(),
  wastage_pct: z.number().min(0).max(50),
  brand: z.string().nullable().optional(),
});
export type TilesItem = z.infer<typeof TilesItemSchema>;
export const TilesItemsSchema = z.array(TilesItemSchema);

export const GenericItemSchema = z.object({
  name: z.string().min(1),
  qty: z.number().positive(),
  unit: z.string(),
  brand: z.string().nullable().optional(),
});
export type GenericItem = z.infer<typeof GenericItemSchema>;
export const GenericItemsSchema = z.array(GenericItemSchema);

/** Parse and validate AI JSON for a given category. Returns items or throws ZodError. */
export function parseAiJson(categoryCode: string, raw: string): unknown[] {
  const parsed: unknown = JSON.parse(raw); // throws SyntaxError on bad JSON
  switch (categoryCode) {
    case 'WOD': return WoodItemsSchema.parse(parsed);
    case 'STL': return SteelItemsSchema.parse(parsed);
    case 'TIL': return TilesItemsSchema.parse(parsed);
    default:    return GenericItemsSchema.parse(parsed);
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/aiPromptSchemas.ts
git commit -m "feat(calculator): add Zod schemas for AI JSON paste validation"
```

---

## Task 7: `EstimateBasketContext.tsx` — client-side basket state

**Files:**
- Create: `src/contexts/EstimateBasketContext.tsx`

- [ ] **Step 1: Write the context**

```typescript
// src/contexts/EstimateBasketContext.tsx
"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { UnitOption } from '@/lib/category-calculator-templates';

export type EstimateItem = {
  id: string;                          // local UUID (crypto.randomUUID())
  materialId: string;
  materialName: string;
  categoryCode: string;
  inputValues: Record<string, number>;
  inputUnits: Record<string, UnitOption>;
  computedOutput: number;              // e.g. 2.625 cft
  outputUnit: string;                  // e.g. 'cft'
  pricingDimensionId: string | null;   // brandId for quality/brand
  pricingDimensionName: string | null; // e.g. '2nd Quality'
  selectedVendorId: string | null;
  selectedVendorName: string | null;
  unitPrice: number | null;            // price per cft / per kg / etc.
  subtotal: number | null;             // computedOutput * unitPrice
};

type EstimateBasketContextValue = {
  items: EstimateItem[];
  addItem: (item: Omit<EstimateItem, 'id'>) => void;
  removeItem: (id: string) => void;
  clearBasket: () => void;
  totalItems: number;
};

const EstimateBasketContext = createContext<EstimateBasketContextValue | null>(null);

export function EstimateBasketProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<EstimateItem[]>([]);

  const addItem = useCallback((item: Omit<EstimateItem, 'id'>) => {
    setItems(prev => [...prev, { ...item, id: crypto.randomUUID() }]);
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  }, []);

  const clearBasket = useCallback(() => setItems([]), []);

  return (
    <EstimateBasketContext.Provider
      value={{ items, addItem, removeItem, clearBasket, totalItems: items.length }}
    >
      {children}
    </EstimateBasketContext.Provider>
  );
}

export function useEstimateBasket(): EstimateBasketContextValue {
  const ctx = useContext(EstimateBasketContext);
  if (!ctx) throw new Error('useEstimateBasket must be used inside EstimateBasketProvider');
  return ctx;
}
```

- [ ] **Step 2: Register the provider in `MainLayout.tsx`**

Open `src/components/layout/MainLayout.tsx`. Find the `return (` inside `MainLayout`. Wrap the returned JSX's inner content (the area that renders `{children}`) with `<EstimateBasketProvider>`. Add the import at the top:

```typescript
import { EstimateBasketProvider } from '@/contexts/EstimateBasketContext';
```

Locate the line that renders `{children}` inside the `<Box component="main">` element and wrap it:
```tsx
<EstimateBasketProvider>
  {children}
</EstimateBasketProvider>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/contexts/EstimateBasketContext.tsx src/components/layout/MainLayout.tsx
git commit -m "feat(calculator): add EstimateBasketContext + register provider in MainLayout"
```

---

## Task 8: `useCalculatorQuotes` query hook

**Files:**
- Create: `src/hooks/queries/useCalculatorQuotes.ts`

- [ ] **Step 1: Write the hook**

```typescript
// src/hooks/queries/useCalculatorQuotes.ts
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { VendorQuote } from '@/lib/category-calculator-templates';

/**
 * Returns all active vendor quotes for a material, grouped by brandId.
 * Result: Record<brandId, VendorQuote[]> sorted price-ascending within each group.
 */
export function useCalculatorVendorQuotes(materialId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: ['calculator-vendor-quotes', materialId],
    queryFn: async (): Promise<Record<string, VendorQuote[]>> => {
      if (!materialId) return {};

      const { data, error } = await supabase
        .from('vendor_inventory')
        .select('brand_id, current_price, price_includes_gst, updated_at, vendor:vendors(id, name)')
        .eq('material_id', materialId)
        .eq('is_available', true)
        .not('brand_id', 'is', null)
        .not('current_price', 'is', null)
        .gt('current_price', 0);

      if (error) throw error;

      const result: Record<string, VendorQuote[]> = {};

      for (const row of data ?? []) {
        if (!row.brand_id || !row.current_price) continue;
        const vendor = row.vendor as { id: string; name: string } | null;
        if (!result[row.brand_id]) result[row.brand_id] = [];
        result[row.brand_id].push({
          vendorId: vendor?.id ?? '',
          vendorName: vendor?.name ?? 'Unknown',
          unitPrice: row.current_price,
          updatedAt: (row.updated_at as string | null) ?? null,
          priceIncludesGst: row.price_includes_gst ?? false,
        });
      }

      // Sort cheapest-first within each brand group
      for (const quotes of Object.values(result)) {
        quotes.sort((a, b) => a.unitPrice - b.unitPrice);
      }

      return result;
    },
    enabled: !!materialId,
    staleTime: 5 * 60 * 1000, // 5 min — prices don't change often
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/queries/useCalculatorQuotes.ts
git commit -m "feat(calculator): add useCalculatorVendorQuotes query hook"
```

---

## Task 9: `CalculatorInputs.tsx` — schema-driven dimension inputs

**Files:**
- Create: `src/components/calculator/CalculatorInputs.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/calculator/CalculatorInputs.tsx
"use client";

import { Box, TextField, Select, MenuItem, FormControl, Typography, Stack } from '@mui/material';
import type { CalculatorTemplate, UnitOption } from '@/lib/category-calculator-templates';

interface CalculatorInputsProps {
  template: CalculatorTemplate;
  values: Record<string, number>;
  units: Record<string, UnitOption>;
  onChange: (key: string, value: number) => void;
  onUnitChange: (key: string, unit: UnitOption) => void;
}

export default function CalculatorInputs({
  template,
  values,
  units,
  onChange,
  onUnitChange,
}: CalculatorInputsProps) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
      {template.inputs.map((field) => (
        <Stack key={field.key} spacing={0.5} sx={{ minWidth: 110 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', fontSize: 10 }}>
            {field.label}
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <TextField
              type="number"
              size="small"
              value={values[field.key] ?? field.defaultValue ?? ''}
              onChange={(e) => {
                const n = parseFloat(e.target.value);
                if (!Number.isNaN(n)) onChange(field.key, n);
              }}
              inputProps={{
                min: field.min,
                step: field.step ?? 'any',
              }}
              sx={{ width: 80 }}
            />
            {field.unitOptions.length > 1 ? (
              <FormControl size="small">
                <Select
                  value={units[field.key] ?? field.defaultUnit}
                  onChange={(e) => onUnitChange(field.key, e.target.value as UnitOption)}
                  sx={{ minWidth: 52 }}
                >
                  {field.unitOptions.map((u) => (
                    <MenuItem key={u} value={u}>{u}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center', ml: 0.5 }}>
                {field.unitOptions[0]}
              </Typography>
            )}
          </Box>
        </Stack>
      ))}
    </Box>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/calculator/CalculatorInputs.tsx
git commit -m "feat(calculator): add CalculatorInputs schema-driven dimension fields"
```

---

## Task 10: `VendorQuoteList.tsx` — vendor price comparison

**Files:**
- Create: `src/components/calculator/VendorQuoteList.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/calculator/VendorQuoteList.tsx
"use client";

import { Box, Typography, Stack, Paper, Chip, Radio } from '@mui/material';
import { formatINR, calculateLinearCost } from '@/lib/calculatorMath';
import type { VendorQuote } from '@/lib/category-calculator-templates';

interface VendorQuoteListProps {
  quotes: VendorQuote[];           // all vendors for the selected quality/brand
  outputQty: number;               // computed cft / kg / pcs
  outputUnit: string;              // 'cft' | 'kg' | 'pcs'
  selectedVendorId: string | null;
  onSelectVendor: (vendorId: string, quote: VendorQuote) => void;
}

export default function VendorQuoteList({
  quotes,
  outputQty,
  outputUnit,
  selectedVendorId,
  onSelectVendor,
}: VendorQuoteListProps) {
  if (quotes.length === 0) {
    return (
      <Box sx={{ py: 2, px: 1, background: '#fff7ed', borderRadius: 1, border: '1px solid #fed7aa' }}>
        <Typography variant="body2" color="warning.dark">
          No vendor quotes found for this selection. Add prices via the material's Brands &amp; Pricing tab.
        </Typography>
      </Box>
    );
  }

  return (
    <Stack spacing={1}>
      {quotes.map((q, idx) => {
        const subtotal = outputQty > 0 ? calculateLinearCost(outputQty, q.unitPrice) : null;
        const isCheapest = idx === 0 && quotes.length > 1;
        const isSelected = selectedVendorId === q.vendorId;

        return (
          <Paper
            key={q.vendorId}
            variant="outlined"
            onClick={() => onSelectVendor(q.vendorId, q)}
            sx={{
              p: 1.5,
              cursor: 'pointer',
              borderColor: isSelected ? 'primary.main' : isCheapest ? 'success.light' : 'divider',
              bgcolor: isSelected ? 'primary.50' : isCheapest ? '#f0fdf4' : 'background.paper',
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              '&:hover': { borderColor: 'primary.light' },
            }}
          >
            <Radio checked={isSelected} size="small" sx={{ p: 0 }} />
            <Box sx={{ flex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" fontWeight={600}>{q.vendorName}</Typography>
                {isCheapest && <Chip label="Best price" size="small" color="success" sx={{ height: 18, fontSize: 10 }} />}
              </Box>
              <Typography variant="caption" color="text.secondary">
                {formatINR(q.unitPrice)}/{outputUnit}
                {q.priceIncludesGst ? ' (incl. GST)' : ''}
                {q.updatedAt ? ` · ${new Date(q.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}
              </Typography>
            </Box>
            {subtotal !== null && (
              <Typography variant="body2" fontWeight={700} color={isSelected ? 'primary.main' : 'text.primary'}>
                {formatINR(subtotal)}
              </Typography>
            )}
          </Paper>
        );
      })}
    </Stack>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/calculator/VendorQuoteList.tsx
git commit -m "feat(calculator): add VendorQuoteList vendor price comparison component"
```

---

## Task 11: `AiAssistDialog.tsx` — prompt/paste AI flow

**Files:**
- Create: `src/components/calculator/AiAssistDialog.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/calculator/AiAssistDialog.tsx
"use client";

import { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Tabs, Tab, Box, Typography, TextField,
  Alert, IconButton, Tooltip,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { getCalculatorTemplate } from '@/lib/category-calculator-templates';
import { parseAiJson } from '@/lib/aiPromptSchemas';
import type { WoodItem } from '@/lib/aiPromptSchemas';

interface AiAssistDialogProps {
  open: boolean;
  onClose: () => void;
  categoryCode: string;
  /** Called with the raw validated items array so the parent can map them to basket items. */
  onImport: (items: unknown[]) => void;
}

export default function AiAssistDialog({
  open, onClose, categoryCode, onImport,
}: AiAssistDialogProps) {
  const [tab, setTab] = useState(0);
  const [pastedJson, setPastedJson] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const template = getCalculatorTemplate(categoryCode);

  function handleCopy() {
    navigator.clipboard.writeText(template.aiPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleImport() {
    setParseError(null);
    try {
      const items = parseAiJson(categoryCode, pastedJson.trim());
      onImport(items);
      setPastedJson('');
      onClose();
    } catch (err: unknown) {
      if (err instanceof SyntaxError) {
        setParseError('Invalid JSON: ' + err.message);
      } else if (err instanceof Error) {
        setParseError(err.message);
      } else {
        setParseError('Validation failed. Check the JSON matches the expected schema.');
      }
    }
  }

  function handleClose() {
    setPastedJson('');
    setParseError(null);
    onClose();
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>AI Estimate Assistant</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Copy the prompt below, open ChatGPT or Gemini, upload your image, paste the prompt, then paste the response back in the second tab.
        </Typography>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
          <Tab label="1 · Copy prompt" />
          <Tab label="2 · Paste response" />
        </Tabs>

        {tab === 0 && (
          <Box>
            <Box sx={{ position: 'relative' }}>
              <TextField
                multiline
                fullWidth
                rows={8}
                value={template.aiPrompt}
                InputProps={{ readOnly: true, sx: { fontFamily: 'monospace', fontSize: 12 } }}
              />
              <Tooltip title={copied ? 'Copied!' : 'Copy prompt'}>
                <IconButton
                  size="small"
                  onClick={handleCopy}
                  sx={{ position: 'absolute', top: 8, right: 8, bgcolor: 'background.paper' }}
                >
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
            <Alert severity="info" sx={{ mt: 1 }}>
              After copying, open ChatGPT / Gemini, upload your image, and paste this prompt.
            </Alert>
          </Box>
        )}

        {tab === 1 && (
          <Box>
            <TextField
              multiline
              fullWidth
              rows={10}
              placeholder={'[\n  { "name": "...", "length_ft": 7, ... }\n]'}
              value={pastedJson}
              onChange={(e) => { setPastedJson(e.target.value); setParseError(null); }}
              InputProps={{ sx: { fontFamily: 'monospace', fontSize: 12 } }}
            />
            {parseError && (
              <Alert severity="error" sx={{ mt: 1 }}>
                {parseError}
              </Alert>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        {tab === 0 && (
          <Button variant="contained" onClick={() => setTab(1)}>
            Next: Paste response →
          </Button>
        )}
        {tab === 1 && (
          <Button
            variant="contained"
            disabled={!pastedJson.trim()}
            onClick={handleImport}
          >
            Add to basket
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/calculator/AiAssistDialog.tsx
git commit -m "feat(calculator): add AiAssistDialog prompt-copy + JSON-paste flow"
```

---

## Task 12: `EstimateBasketDrawer.tsx` — basket panel + totals

**Files:**
- Create: `src/components/calculator/EstimateBasketDrawer.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/calculator/EstimateBasketDrawer.tsx
"use client";

import {
  Drawer, Box, Typography, Stack, IconButton, Button,
  Divider, List, ListItem, ListItemText, ListItemSecondaryAction,
  Chip,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ShoppingCartCheckoutIcon from '@mui/icons-material/ShoppingCartCheckout';
import { useEstimateBasket } from '@/contexts/EstimateBasketContext';
import { formatINR, formatCft } from '@/lib/calculatorMath';

interface EstimateBasketDrawerProps {
  open: boolean;
  onClose: () => void;
  onConvertToMR: () => void;
}

export default function EstimateBasketDrawer({
  open, onClose, onConvertToMR,
}: EstimateBasketDrawerProps) {
  const { items, removeItem, clearBasket } = useEstimateBasket();

  const grandTotal = items.reduce((sum, item) => sum + (item.subtotal ?? 0), 0);
  const hasAnySubtotal = items.some(i => i.subtotal !== null);

  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', sm: 400 } } }}>
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6" fontWeight={600}>Estimate Basket</Typography>
        <Chip label={`${items.length} item${items.length !== 1 ? 's' : ''}`} size="small" color="primary" />
      </Box>
      <Divider />

      {items.length === 0 ? (
        <Box sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">No items yet. Use the calculator to add estimates.</Typography>
        </Box>
      ) : (
        <>
          <List sx={{ flex: 1, overflow: 'auto' }}>
            {items.map((item) => (
              <ListItem key={item.id} alignItems="flex-start" divider>
                <ListItemText
                  primary={
                    <Box component="span" sx={{ fontWeight: 600 }}>
                      {item.materialName}
                    </Box>
                  }
                  secondary={
                    <Box component="div">
                      <Typography variant="caption" display="block">
                        {item.pricingDimensionName ?? 'No quality'} · {formatCft(item.computedOutput)}
                      </Typography>
                      {item.selectedVendorName && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          {item.selectedVendorName}
                          {item.unitPrice ? ` · ${formatINR(item.unitPrice)}/${item.outputUnit}` : ''}
                        </Typography>
                      )}
                    </Box>
                  }
                  primaryTypographyProps={{ component: 'div' }}
                  secondaryTypographyProps={{ component: 'div' }}
                />
                <ListItemSecondaryAction sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
                  {item.subtotal !== null && (
                    <Typography variant="body2" fontWeight={700}>{formatINR(item.subtotal)}</Typography>
                  )}
                  <IconButton size="small" edge="end" onClick={() => removeItem(item.id)}>
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>

          <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
            {hasAnySubtotal && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="subtitle2">Total estimate</Typography>
                <Typography variant="subtitle1" fontWeight={700}>{formatINR(grandTotal)}</Typography>
              </Box>
            )}
            <Stack spacing={1}>
              <Button
                variant="contained"
                startIcon={<ShoppingCartCheckoutIcon />}
                onClick={onConvertToMR}
                fullWidth
              >
                Convert to Material Request
              </Button>
              <Button variant="outlined" color="error" onClick={clearBasket} fullWidth>
                Clear basket
              </Button>
            </Stack>
          </Box>
        </>
      )}
    </Drawer>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/calculator/EstimateBasketDrawer.tsx
git commit -m "feat(calculator): add EstimateBasketDrawer with totals and convert action"
```

---

## Task 13: `CalculatorWorkspace.tsx` — main calculator assembly

**Files:**
- Create: `src/components/calculator/CalculatorWorkspace.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/calculator/CalculatorWorkspace.tsx
"use client";

import { useState, useMemo } from 'react';
import {
  Box, Typography, Paper, Autocomplete, TextField, Select,
  MenuItem, FormControl, InputLabel, Button, Chip, Divider, Stack,
  Alert,
} from '@mui/material';
import AddShoppingCartIcon from '@mui/icons-material/AddShoppingCart';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { useMaterials, useMaterialBrands } from '@/hooks/queries/useMaterials';
import { useCalculatorVendorQuotes } from '@/hooks/queries/useCalculatorQuotes';
import { getCalculatorTemplate, type UnitOption, type VendorQuote } from '@/lib/category-calculator-templates';
import { formatCft, formatINR, calculateLinearCost } from '@/lib/calculatorMath';
import { useEstimateBasket } from '@/contexts/EstimateBasketContext';
import CalculatorInputs from './CalculatorInputs';
import VendorQuoteList from './VendorQuoteList';
import AiAssistDialog from './AiAssistDialog';
import type { WoodItem } from '@/lib/aiPromptSchemas';

interface CalculatorWorkspaceProps {
  /** When provided, the material selector is hidden and this material is pre-selected. */
  initialMaterialId?: string;
}

export default function CalculatorWorkspace({ initialMaterialId }: CalculatorWorkspaceProps) {
  const { data: allMaterials = [] } = useMaterials();
  const { addItem } = useEstimateBasket();

  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(
    initialMaterialId ?? null
  );
  const [inputValues, setInputValues] = useState<Record<string, number>>({});
  const [inputUnits, setInputUnits] = useState<Record<string, UnitOption>>({});
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [selectedVendorQuote, setSelectedVendorQuote] = useState<VendorQuote | null>(null);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [addedFeedback, setAddedFeedback] = useState(false);

  const selectedMaterial = useMemo(
    () => allMaterials.find(m => m.id === selectedMaterialId) ?? null,
    [allMaterials, selectedMaterialId]
  );

  const categoryCode = selectedMaterial?.category?.code ?? '';
  const template = getCalculatorTemplate(categoryCode);

  const { data: brands = [] } = useMaterialBrands(selectedMaterialId ?? undefined);
  const { data: vendorQuotesByBrand = {} } = useCalculatorVendorQuotes(selectedMaterialId ?? undefined);

  // Initialise units from template defaults when template changes
  const defaultUnits = useMemo(() => {
    const u: Record<string, UnitOption> = {};
    for (const field of template.inputs) {
      u[field.key] = field.defaultUnit;
    }
    return u;
  }, [template]);

  const effectiveUnits: Record<string, UnitOption> = { ...defaultUnits, ...inputUnits };

  const computedOutput = template.computeOutput(inputValues, effectiveUnits);

  const quotesForSelectedBrand: VendorQuote[] =
    selectedBrandId ? (vendorQuotesByBrand[selectedBrandId] ?? []) : [];

  const subtotal =
    selectedVendorQuote && computedOutput > 0
      ? calculateLinearCost(computedOutput, selectedVendorQuote.unitPrice)
      : null;

  function handleMaterialChange(materialId: string | null) {
    setSelectedMaterialId(materialId);
    setInputValues({});
    setInputUnits({});
    setSelectedBrandId(null);
    setSelectedVendorId(null);
    setSelectedVendorQuote(null);
  }

  function handleAddToBasket() {
    if (!selectedMaterialId || !selectedMaterial) return;
    addItem({
      materialId: selectedMaterialId,
      materialName: selectedMaterial.name,
      categoryCode,
      inputValues,
      inputUnits: effectiveUnits,
      computedOutput,
      outputUnit: template.outputUnit,
      pricingDimensionId: selectedBrandId,
      pricingDimensionName: brands.find(b => b.id === selectedBrandId)?.brand_name ?? null,
      selectedVendorId,
      selectedVendorName: selectedVendorQuote?.vendorName ?? null,
      unitPrice: selectedVendorQuote?.unitPrice ?? null,
      subtotal,
    });
    setAddedFeedback(true);
    setTimeout(() => setAddedFeedback(false), 2000);
  }

  function handleAiImport(items: unknown[]) {
    // Map WoodItems to basket items. Each AI item becomes a separate basket entry.
    for (const raw of items) {
      const item = raw as WoodItem;
      if (!selectedMaterialId || !selectedMaterial) continue;
      const woodValues = { length: item.length_ft, width: item.width_in, thickness: item.thickness_in, qty: item.qty };
      const woodUnits: Record<string, UnitOption> = { length: 'ft', width: 'in', thickness: 'in', qty: 'pcs' };
      const output = template.computeOutput(woodValues, woodUnits);
      const qualityBrand = brands.find(b => b.brand_name === (item.quality_tier ?? null));
      addItem({
        materialId: selectedMaterialId,
        materialName: `${selectedMaterial.name} — ${item.name ?? ''}`,
        categoryCode,
        inputValues: woodValues,
        inputUnits: woodUnits,
        computedOutput: output,
        outputUnit: template.outputUnit,
        pricingDimensionId: qualityBrand?.id ?? null,
        pricingDimensionName: qualityBrand?.brand_name ?? item.quality_tier ?? null,
        selectedVendorId: null,
        selectedVendorName: null,
        unitPrice: null,
        subtotal: null,
      });
    }
  }

  return (
    <Box sx={{ maxWidth: 640 }}>
      {/* Material Selector */}
      {!initialMaterialId && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontWeight: 600, textTransform: 'uppercase', fontSize: 10 }}>
            Material
          </Typography>
          <Autocomplete
            options={allMaterials}
            getOptionLabel={(m) => `${m.name} (${m.code ?? ''})`}
            value={selectedMaterial}
            onChange={(_, m) => handleMaterialChange(m?.id ?? null)}
            renderInput={(params) => <TextField {...params} placeholder="Search materials…" size="small" />}
            slotProps={{ popper: { disablePortal: false } }}
          />
        </Box>
      )}

      {selectedMaterial && (
        <>
          {/* Dimension Inputs */}
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Typography variant="subtitle2" fontWeight={600} gutterBottom>
              Dimensions &amp; Quantity
            </Typography>
            <CalculatorInputs
              template={template}
              values={inputValues}
              units={effectiveUnits}
              onChange={(key, val) => setInputValues(prev => ({ ...prev, [key]: val }))}
              onUnitChange={(key, unit) => setInputUnits(prev => ({ ...prev, [key]: unit }))}
            />
            {computedOutput > 0 && (
              <Box sx={{ mt: 2, p: 1.5, bgcolor: 'primary.50', borderRadius: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="caption" color="primary.dark" fontWeight={600} sx={{ textTransform: 'uppercase', fontSize: 10 }}>
                  {template.outputLabel}
                </Typography>
                <Typography variant="h6" color="primary.main" fontWeight={700}>
                  {template.outputUnit === 'cft' ? formatCft(computedOutput) : `${computedOutput.toFixed(2)} ${template.outputUnit}`}
                </Typography>
              </Box>
            )}
          </Paper>

          {/* Quality / Brand Selector */}
          {brands.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, fontWeight: 600, textTransform: 'uppercase', fontSize: 10 }}>
                {template.pricingDimensionLabel}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {brands.map(b => (
                  <Chip
                    key={b.id}
                    label={b.brand_name}
                    onClick={() => {
                      setSelectedBrandId(b.id);
                      setSelectedVendorId(null);
                      setSelectedVendorQuote(null);
                    }}
                    variant={selectedBrandId === b.id ? 'filled' : 'outlined'}
                    color={selectedBrandId === b.id ? 'primary' : 'default'}
                  />
                ))}
              </Box>
            </Box>
          )}

          {/* Vendor Quotes */}
          {selectedBrandId && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, fontWeight: 600, textTransform: 'uppercase', fontSize: 10 }}>
                Vendor Quotes ({template.pricingDimensionLabel}: {brands.find(b => b.id === selectedBrandId)?.brand_name})
              </Typography>
              <VendorQuoteList
                quotes={quotesForSelectedBrand}
                outputQty={computedOutput}
                outputUnit={template.outputUnit}
                selectedVendorId={selectedVendorId}
                onSelectVendor={(vid, q) => {
                  setSelectedVendorId(vid);
                  setSelectedVendorQuote(q);
                }}
              />
            </Box>
          )}

          {/* Actions */}
          <Divider sx={{ mb: 2 }} />
          <Stack direction="row" spacing={1}>
            <Button
              variant="contained"
              startIcon={<AddShoppingCartIcon />}
              disabled={computedOutput <= 0}
              onClick={handleAddToBasket}
              color={addedFeedback ? 'success' : 'primary'}
            >
              {addedFeedback ? 'Added ✓' : '+ Add to basket'}
            </Button>
            <Button
              variant="outlined"
              startIcon={<AutoAwesomeIcon />}
              onClick={() => setAiDialogOpen(true)}
            >
              Get AI estimate
            </Button>
          </Stack>

          {subtotal !== null && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Estimated cost:{' '}
                <Typography component="span" fontWeight={700} color="text.primary">
                  {formatINR(subtotal)}
                </Typography>
              </Typography>
            </Box>
          )}
        </>
      )}

      <AiAssistDialog
        open={aiDialogOpen}
        onClose={() => setAiDialogOpen(false)}
        categoryCode={categoryCode}
        onImport={handleAiImport}
      />
    </Box>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/calculator/CalculatorWorkspace.tsx
git commit -m "feat(calculator): add CalculatorWorkspace main calculator UI"
```

---

## Task 14: `/company/calculator/page.tsx` — standalone page + nav

**Files:**
- Create: `src/app/(main)/company/calculator/page.tsx`
- Modify: `src/components/layout/MainLayout.tsx`

- [ ] **Step 1: Write the calculator page**

```tsx
// src/app/(main)/company/calculator/page.tsx
"use client";

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Box, Typography, Button, Badge } from '@mui/material';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import PageHeader from '@/components/layout/PageHeader';
import { useEstimateBasket } from '@/contexts/EstimateBasketContext';
import EstimateBasketDrawer from '@/components/calculator/EstimateBasketDrawer';
import SitePickerForMR from '@/components/calculator/SitePickerForMR';

const CalculatorWorkspace = dynamic(
  () => import('@/components/calculator/CalculatorWorkspace'),
  { ssr: false }
);
const MaterialRequestDialog = dynamic(
  () => import('@/components/materials/MaterialRequestDialog'),
  { ssr: false }
);

export default function CalculatorPage() {
  const { totalItems, items, clearBasket } = useEstimateBasket();
  const [basketOpen, setBasketOpen] = useState(false);
  const [sitePickerOpen, setSitePickerOpen] = useState(false);
  const [mrDialogState, setMrDialogState] = useState<{ open: boolean; siteId: string | null }>({
    open: false, siteId: null,
  });

  function handleConvertToMR() {
    setBasketOpen(false);
    setSitePickerOpen(true);
  }

  function handleSitePicked(siteId: string) {
    setSitePickerOpen(false);
    setMrDialogState({ open: true, siteId });
  }

  const initialItems = items.map(i => ({
    materialId: i.materialId,
    qty: i.computedOutput > 0 ? Math.ceil(i.computedOutput) : 1,
    notes: [
      i.pricingDimensionName ? `${i.pricingDimensionName}` : '',
      i.selectedVendorName ? `est. ${i.selectedVendorName}` : '',
      i.subtotal ? `≈ ₹${Math.round(i.subtotal).toLocaleString('en-IN')}` : '',
    ].filter(Boolean).join(' · '),
  }));

  return (
    <Box>
      <PageHeader
        title="Material Cost Calculator"
        actions={
          <Badge badgeContent={totalItems} color="primary">
            <Button
              variant={totalItems > 0 ? 'contained' : 'outlined'}
              startIcon={<ShoppingCartIcon />}
              onClick={() => setBasketOpen(true)}
            >
              Estimate Basket
            </Button>
          </Badge>
        }
      />

      <Box sx={{ p: { xs: 1, sm: 2 } }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Calculate material costs by entering dimensions and comparing vendor quotes. Add items to your basket, then convert to a Material Request when ready.
        </Typography>
        <CalculatorWorkspace />
      </Box>

      <EstimateBasketDrawer
        open={basketOpen}
        onClose={() => setBasketOpen(false)}
        onConvertToMR={handleConvertToMR}
      />

      <SitePickerForMR
        open={sitePickerOpen}
        onClose={() => setSitePickerOpen(false)}
        onSelect={handleSitePicked}
      />

      {mrDialogState.siteId && (
        <MaterialRequestDialog
          open={mrDialogState.open}
          onClose={() => {
            setMrDialogState({ open: false, siteId: null });
            clearBasket();
          }}
          request={null}
          siteId={mrDialogState.siteId}
          initialItems={initialItems}
        />
      )}
    </Box>
  );
}
```

- [ ] **Step 2: Create `SitePickerForMR.tsx`**

This is a simple dialog that lists all active sites and lets the user pick one.

```tsx
// src/components/calculator/SitePickerForMR.tsx
"use client";

import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, List, ListItemButton, ListItemText, CircularProgress, Box,
} from '@mui/material';
import { useSites } from '@/hooks/queries/useSites';

interface SitePickerForMRProps {
  open: boolean;
  onClose: () => void;
  onSelect: (siteId: string) => void;
}

export default function SitePickerForMR({ open, onClose, onSelect }: SitePickerForMRProps) {
  const { data: sites = [], isLoading } = useSites();

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Select Site for Material Request</DialogTitle>
      <DialogContent sx={{ p: 0 }}>
        {isLoading ? (
          <Box sx={{ p: 3, textAlign: 'center' }}><CircularProgress /></Box>
        ) : (
          <List>
            {sites.map(site => (
              <ListItemButton key={site.id} onClick={() => onSelect(site.id)}>
                <ListItemText primary={site.name} secondary={site.location ?? undefined} />
              </ListItemButton>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}
```

> Note: verify the exact hook name for sites. Check `src/hooks/queries/` for `useSites` or `useActiveSites`. Use whatever hook returns a list of `{ id, name, location? }` objects.

- [ ] **Step 3: Add Calculator to `companyNavCategories` in `MainLayout.tsx`**

Open `src/components/layout/MainLayout.tsx`, find the `"Materials & Vendors"` nav category (around line 323), and add a Calculator entry. Add the import:

```typescript
import CalculateIcon from '@mui/icons-material/Calculate';
```

Then in the `"Materials & Vendors"` items array, add after the `"Material Catalog"` entry:

```typescript
{
  text: "Cost Calculator",
  icon: <CalculateIcon />,
  path: "/company/calculator",
},
```

- [ ] **Step 4: Verify TypeScript compiles and dev server starts**

```bash
npx tsc --noEmit
npm run dev
```
Navigate to `http://localhost:3000/dev-login`, then to `/company/calculator`. Confirm:
- Page renders with "Material Cost Calculator" heading
- "Cost Calculator" appears in the nav under "Materials & Vendors"
- Basket button shows in the top-right

- [ ] **Step 5: Commit**

```bash
git add src/app/(main)/company/calculator/page.tsx \
        src/components/calculator/SitePickerForMR.tsx \
        src/components/layout/MainLayout.tsx
git commit -m "feat(calculator): add /company/calculator page + nav entry"
```

---

## Task 15: Extend `MaterialRequestDialog` to accept `initialItems`

**Files:**
- Modify: `src/components/materials/MaterialRequestDialog.tsx`

- [ ] **Step 1: Add `initialItems` to the props interface**

Open `src/components/materials/MaterialRequestDialog.tsx`. Find the `MaterialRequestDialogProps` interface (line 63):

```typescript
interface MaterialRequestDialogProps {
  open: boolean;
  onClose: () => void;
  request: MaterialRequestWithDetails | null;
  siteId: string;
}
```

Change it to:

```typescript
interface MaterialRequestDialogProps {
  open: boolean;
  onClose: () => void;
  request: MaterialRequestWithDetails | null;
  siteId: string;
  /** Pre-populate items when creating a new request from the calculator basket. */
  initialItems?: Array<{ materialId: string; qty: number; notes?: string }>;
}
```

- [ ] **Step 2: Wire `initialItems` into the form state**

In `MaterialRequestDialog`, find where `items` state is initialised (look for `useState` calls near the top of the component function body, around line 85–150). There will be a line similar to:

```typescript
const [items, setItems] = useState<RequestItemRow[]>([]);
```

Change it to:

```typescript
const [items, setItems] = useState<RequestItemRow[]>(() => {
  if (!initialItems?.length || request) return [];
  return initialItems.map((init) => ({
    material_id: init.materialId,
    requested_qty: init.qty,
    notes: init.notes ?? '',
    // remaining fields use their zero-values; the form will hydrate them
    // from the materials list once allMaterials loads
  }));
});
```

Also update the destructured prop in the function signature:

```typescript
export default function MaterialRequestDialog({
  open,
  onClose,
  request,
  siteId,
  initialItems,
}: MaterialRequestDialogProps) {
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Smoke test**

```bash
npm run dev
```
Open `http://localhost:3000/dev-login` → `/company/calculator`. Add an item to the basket. Click "Estimate Basket" → "Convert to Material Request". Pick a site. Confirm the MR dialog opens with the item pre-filled.

- [ ] **Step 5: Commit**

```bash
git add src/components/materials/MaterialRequestDialog.tsx
git commit -m "feat(calculator): extend MaterialRequestDialog with initialItems prop"
```

---

## Task 16: "Estimate" tab on material detail page

**Files:**
- Modify: `src/app/(main)/company/materials/[id]/page.tsx`

- [ ] **Step 1: Add the import**

At the top of `src/app/(main)/company/materials/[id]/page.tsx`, add:

```typescript
import dynamic from 'next/dynamic';
// (dynamic is already imported — add CalculatorWorkspace below existing dynamic imports)
const CalculatorWorkspace = dynamic(
  () => import('@/components/calculator/CalculatorWorkspace'),
  { ssr: false }
);
```

- [ ] **Step 2: Add the tab label**

In the `<Tabs>` block (around line 267), add an "Estimate" tab **before** the final "All Vendors" tab:

```tsx
<Tab
  label={
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      🧮 Estimate
    </Box>
  }
/>
```

- [ ] **Step 3: Add the tab index and panel**

In the dynamic index block (around line 324–334), add the estimate index alongside the others:

```typescript
const estimateIndex = currentIndex++;  // add this after variantsIndex
const vendorsIndex = currentIndex;     // shift vendors down by 1
```

Then add a `TabPanel` for it inside the `return (...)`:

```tsx
{/* Estimate Tab */}
<TabPanel value={tabValue} index={estimateIndex}>
  <CalculatorWorkspace initialMaterialId={materialId} />
</TabPanel>
```

Place this panel **before** the Vendors TabPanel.

- [ ] **Step 4: Verify TypeScript compiles and page renders**

```bash
npx tsc --noEmit
npm run dev
```

Open `http://localhost:3000/dev-login` → navigate to `/company/materials/<teak-wood-id>`. Confirm the "🧮 Estimate" tab is present and clicking it shows the calculator pre-scoped to Teak Wood (no material selector shown).

- [ ] **Step 5: Commit**

```bash
git add src/app/(main)/company/materials/[id]/page.tsx
git commit -m "feat(calculator): add Estimate tab to material detail page"
```

---

## Task 17: End-to-end visual verification

- [ ] **Step 1: Open the app and log in**

```bash
npm run dev
```

Navigate to `http://localhost:3000/dev-login`. Confirm auto-login redirects to dashboard.

- [ ] **Step 2: Test wood calculator (Gana adi calculation)**

Navigate to `/company/calculator`.
- Select "Teak Wood".
- Set Length=7 ft, Width=3 in, Thickness=1.5 in, Pieces=12.
- Confirm computed result shows **2.625 cft**.
- Select "2nd Quality" chip.
- Confirm vendor list shows vendors with ₹/cft price and total.
- Select a vendor.
- Click "Add to basket" — basket badge shows 1.

- [ ] **Step 3: Test basket and MR conversion**

Click "Estimate Basket" → drawer opens showing the item and total.
Click "Convert to Material Request" → site picker opens.
Select a site → MaterialRequestDialog opens with items pre-filled.
Confirm notes field contains quality + vendor + price info.
Click "Save as Draft" → confirm request appears at `/site/material-requests`.

- [ ] **Step 4: Test material detail estimate tab**

Navigate to `/company/materials` → click Teak Wood → "🧮 Estimate" tab.
Confirm calculator shows with Teak Wood pre-selected (no material dropdown visible).

- [ ] **Step 5: Test AI assist dialog**

On the calculator page, click "Get AI estimate".
Tab 1: confirm prompt is displayed with a copy button.
Tab 2: paste invalid JSON → confirm error message appears.
Paste valid JSON:
```json
[{"name":"Door frame","length_ft":7,"width_in":3,"thickness_in":1.5,"qty":2,"quality_tier":"2nd Quality"}]
```
Click "Add to basket" → confirm 1 item added to basket with correct cft = 0.4375.

- [ ] **Step 6: Check console for errors**

Read browser console. No React warnings, no hydration errors, no network errors.

- [ ] **Step 7: Final commit**

```bash
git status
# Stage any remaining uncommitted changes from this feature
git add -p  # review and stage selectively
git commit -m "feat(calculator): material cost calculator complete — wood cft, AI assist, basket→MR"
```

---

## Self-Review Notes

**Spec coverage:**

| Spec Section | Task |
|---|---|
| Wood variant template | Task 5 |
| Quality tiers as material_brands | Tasks 2, 13 (seeded + UI) |
| calculator_label column | Task 1 |
| CategoryCalculatorTemplate schema | Task 4 |
| calculatorMath.ts helpers | Task 3 |
| EstimateBasketContext | Task 7 |
| useCalculatorVendorQuotes query | Task 8 |
| CalculatorInputs component | Task 9 |
| VendorQuoteList component | Task 10 |
| AiAssistDialog (prompt + paste) | Task 11 |
| EstimateBasketDrawer | Task 12 |
| CalculatorWorkspace | Task 13 |
| /company/calculator page | Task 14 |
| Nav entry | Task 14, Step 3 |
| Material detail Estimate tab | Task 16 |
| MaterialRequestDialog initialItems | Task 15 |
| Convert basket → MR | Task 14 (page), Task 15 (dialog) |
| End-to-end verification | Task 17 |

**Type consistency check:**
- `VendorQuote` defined in `category-calculator-templates.ts` — used in `useCalculatorQuotes.ts`, `VendorQuoteList.tsx`, `CalculatorWorkspace.tsx` ✓
- `EstimateItem` defined in `EstimateBasketContext.tsx` — used in `EstimateBasketDrawer.tsx`, `CalculatorPage` ✓
- `UnitOption` defined in `category-calculator-templates.ts` — used in `CalculatorInputs.tsx`, `CalculatorWorkspace.tsx`, `EstimateBasketContext.tsx` ✓
- `CalculatorTemplate.computeOutput` signature `(values, units) => number` — consistent across WOD/STL/TIL/default ✓
- `initialItems` shape `{ materialId, qty, notes? }[]` — consistent between `CalculatorPage` construction and `MaterialRequestDialog` consumption ✓
