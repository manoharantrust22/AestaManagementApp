# Material Cost Calculator — Design Spec

**Date:** 2026-05-17
**Status:** Approved (pending spec review)

---

## Context

Engineers and office staff frequently need to estimate material cost **before** committing to a material request. The current flow forces them into `/site/material-requests` even for ballpark numbers — slow, and pollutes the request list with throwaway drafts.

The pain is sharpest for **wood/timber** used in doors and windows:
- Pricing model is unusual: vendors quote **per cubic foot ("Gana adi" / cft) by quality tier** (1st / 2nd / 3rd quality), not by size variant.
- No brands in the conventional sense — quality tier plays the role brand plays for cement/steel.
- Sizes are custom (every plank is cut to order), so users need to enter raw dimensions rather than pick from a catalog list.
- Today the wood category uses the generic `default` variant template, so the catalog has no first-class support for any of this.

The broader pain is that **no cost-estimation tool exists** anywhere in the app. A weight calculator exists for TMT bars inside the PO dialog, but it's not user-facing and doesn't cover wood, tiles, or anything else.

### Goal

Ship a **universal Material Cost Calculator** that:
1. Lets users estimate material cost without creating a material request.
2. Handles per-category calculation rules (wood → cft, steel → kg, tiles → sqft, etc.) via a schema-driven approach.
3. Surfaces vendor price comparison so users see "Rahman Timbers ₹2,500/cft" vs "Kiran Timbers ₹2,700/cft" side-by-side.
4. Supports a manual AI assist path: app generates a prompt, user pastes it into their own ChatGPT/Gemini session with an image, pastes the JSON response back. No backend AI integration.
5. Lets users collect estimates in a basket and one-click convert the basket into a real material request when ready to buy.

### Non-goals

- Server-side AI / image OCR / model hosting.
- Long-term persistence of estimates (basket is client-side only for v1).
- Replacing material requests for procurement — estimates are advisory, requests are the source of truth.

---

## Architecture Overview

Four pieces:

1. **`/company/calculator`** — new standalone page under Company nav. Houses the calculation workspace, the estimate basket drawer, and the AI paste-through flow.
2. **Estimate panel on `/company/materials/[id]`** — reuses the calculator widget inline within each material's detail page (e.g., teak wood → "Estimate" tab next to "Brands & Pricing", "Variants", etc.).
3. **`EstimateBasketContext`** — client-side React context, mirroring the rentals [EstimateBasket pattern](../../../src/components/rentals/) — holds items in memory, clears on refresh. No DB tables in v1.
4. **`CategoryCalculatorTemplate`** — new schema alongside the existing [category-variant-templates.ts](../../../src/lib/category-variant-templates.ts) — drives the calculator UI per category.

### Reuses

- `MaterialBrand` table — stores quality tiers for wood (1st / 2nd / 3rd Quality) as brand rows with no schema changes.
- `VendorInventory` / `PriceHistory` — already store vendor prices keyed by material × brand × variant. For wood, the price-per-cft is stored on the (vendor × material × brand) tuple with no size-variant participation in pricing.
- [MaterialRequestDialog.tsx](../../../src/components/materials/MaterialRequestDialog.tsx) — receives basket items pre-filled when converting estimate → request.
- [weightCalculation.ts](../../../src/lib/weightCalculation.ts) — extended/reused for the steel calculator schema.

---

## Wood/Timber Category Model

### 1. New variant template

Added to [src/lib/category-variant-templates.ts](../../../src/lib/category-variant-templates.ts):

```typescript
wood_timber: {
  fields: [
    { key: "length_value",    name: "Length",    type: "number" },
    { key: "length_unit",     name: "Unit",      type: "select", options: ["ft", "in"], defaultValue: "ft" },
    { key: "width_value",     name: "Width",     type: "number" },
    { key: "width_unit",      name: "Unit",      type: "select", options: ["in", "ft"], defaultValue: "in" },
    { key: "thickness_value", name: "Thickness", type: "number" },
    { key: "thickness_unit",  name: "Unit",      type: "select", options: ["in", "ft"], defaultValue: "in" }
  ],
  defaultUnit: "cft",
  autoGenerateConfig: null
}
```

Applied to category code `WOD` (Wood Doors). Future wood subcategories can opt in by code.

### 2. Quality tiers via `MaterialBrand`

For each wood material, seed three rows in `material_brands`:
- `1st Quality`
- `2nd Quality`
- `3rd Quality`

Render label is category-driven (see #4). Quality rows are functionally identical to brand rows — same FK targets in `VendorInventory` and `PriceHistory`.

### 3. Vendor pricing per cft

`VendorInventory` row for wood is interpreted as **price per cft for that quality tier from that vendor**. No size-variant participation in pricing. The existing pricing UI works as-is.

### 4. Category-level label config

Add `material_categories.calculator_label` column (text, nullable). Wood categories set it to `"Quality"`; default unset means UI shows `"Brand"`. Single migration.

### 5. Existing teak wood data preservation

The six existing variants (TEA-0001-V01..V06) remain — they're useful for material requests where the engineer specifies "12 pieces of 3"×1.5"×7ft". They're outside the pricing matrix.

---

## Universal Calculator Schema

New file: `src/lib/category-calculator-templates.ts`

```typescript
export type CalculatorTemplate = {
  inputs: CalculatorInputField[];
  formula: (inputs: Record<string, number>) => number;  // returns value in outputUnit
  outputUnit: MaterialUnit;
  pricingDimension: "brand" | "quality" | "none";
  priceFormula: (qty: number, unitPrice: number) => number;  // typically qty * unitPrice
  aiPrompt: string;
  aiJsonSchema: ZodSchema;  // for validating pasted AI JSON
};

export const CATEGORY_CALCULATOR_TEMPLATES: Record<string, CalculatorTemplate> = {
  wood_timber: {
    inputs: [
      { key: "length",    label: "Length",    unitOptions: ["ft", "in"], defaultUnit: "ft" },
      { key: "width",     label: "Width",     unitOptions: ["in", "ft"], defaultUnit: "in" },
      { key: "thickness", label: "Thickness", unitOptions: ["in", "ft"], defaultUnit: "in" },
      { key: "qty",       label: "Pieces",    unitOptions: ["pcs"],      defaultUnit: "pcs" }
    ],
    formula: ({ length, width, thickness, qty }) => length * width * thickness * qty,  // all converted to ft first
    outputUnit: "cft",
    pricingDimension: "quality",
    priceFormula: (cft, pricePerCft) => cft * pricePerCft,
    aiPrompt: "...wood prompt...",
    aiJsonSchema: WoodItemsSchema
  },
  steel_tmt: {
    inputs: [
      { key: "diameter_mm", label: "Diameter", unitOptions: ["mm"] },
      { key: "length",      label: "Length",   unitOptions: ["m", "ft"], defaultUnit: "m" },
      { key: "qty",         label: "Rods",     unitOptions: ["pcs"] }
    ],
    formula: ({ diameter_mm, length, qty }) => weightFromTmtTable(diameter_mm) * length * qty,
    outputUnit: "kg",
    pricingDimension: "brand",
    priceFormula: (kg, pricePerKg) => kg * pricePerKg,
    aiPrompt: "...steel prompt...",
    aiJsonSchema: SteelItemsSchema
  },
  tiles: {
    inputs: [
      { key: "area_sqft",          label: "Area",            unitOptions: ["sqft", "sqm"] },
      { key: "tile_coverage_sqft", label: "Tile coverage",   unitOptions: ["sqft"] },
      { key: "wastage_pct",        label: "Wastage %",       unitOptions: ["%"], defaultValue: 10 }
    ],
    formula: ({ area_sqft, tile_coverage_sqft, wastage_pct }) =>
      Math.ceil((area_sqft / tile_coverage_sqft) * (1 + wastage_pct / 100)),
    outputUnit: "piece",
    pricingDimension: "brand",
    priceFormula: (pieces, pricePerPiece) => pieces * pricePerPiece,
    aiPrompt: "...tiles prompt...",
    aiJsonSchema: TilesItemsSchema
  },
  default: {
    inputs: [
      { key: "qty", label: "Quantity", unitOptions: ["pcs", "kg", "liter", "bag", "set"] }
    ],
    formula: ({ qty }) => qty,
    outputUnit: "piece",
    pricingDimension: "brand",
    priceFormula: (qty, unitPrice) => qty * unitPrice,
    aiPrompt: "...generic prompt...",
    aiJsonSchema: GenericItemsSchema
  }
};
```

The calculator component reads the template by category code and renders inputs dynamically — same pattern as `DynamicVariantField`.

---

## AI Prompt Flow (manual paste-through)

No backend AI. Two-tab dialog:

### Tab 1 — "Copy prompt"

Category-aware text in a copy-friendly textarea. Example for wood:

> I am uploading an image of a window/door drawing. Extract every piece of wood needed and return ONLY valid JSON in this exact schema:
> ```json
> [{ "name": "string", "length_ft": number, "width_in": number, "thickness_in": number, "qty": number, "quality_tier": "1st Quality" | "2nd Quality" | "3rd Quality" | null }]
> ```
> Use feet for length and inches for width/thickness. Do not include any prose or markdown fences — just raw JSON.

### Tab 2 — "Paste response"

Multi-line text input. User pastes the AI's JSON output. Two actions:
- **Test parse** — validates against the category's `aiJsonSchema`, shows errors inline if invalid.
- **Add to basket** — on successful parse, adds each item to the basket pre-filled with dimensions, qty, and quality.

Per-category prompts and JSON schemas live alongside the calculator template, so they evolve together.

---

## Estimate Basket & Convert to Request

### Basket structure (client-side)

```typescript
type EstimateBasketItem = {
  id: string;  // local UUID
  materialId: string | null;  // null if custom-only (not in catalog)
  materialName: string;
  inputs: Record<string, number>;  // user-entered dimensions/qty
  computedQuantity: number;  // e.g., 4.375 cft
  outputUnit: MaterialUnit;
  pricingDimensionValue: string | null;  // e.g., "2nd Quality" or "Dalmia DSP"
  vendorQuotes: { vendorId: string; vendorName: string; unitPrice: number; subtotal: number }[];
  selectedVendorId: string | null;  // user picks one for the basket total
};
```

Lives in `EstimateBasketContext`. Cleared on refresh (YAGNI for v1 persistence).

### Basket drawer

Right-side panel, same pattern as [rentals EstimateBasket](../../../src/components/rentals/):
- List of line items (edit / remove)
- **Grand total broken down by vendor** — "if you bought everything from Rahman Timbers: ₹X" / "if split across selected vendors: ₹Y"
- Footer actions: **Clear basket** / **Convert to Material Request →**

### Convert flow

1. Click "Convert to Material Request" → site-picker dialog (calculator lives under `/company`, no site context).
2. After site selection, [MaterialRequestDialog.tsx](../../../src/components/materials/MaterialRequestDialog.tsx) opens with items pre-filled:
   - **Material** → matched by id
   - **Variant** → matched to nearest catalog variant by dimensions; if no match, attach the raw dimensions as a note on the request item (do NOT auto-create catalog variants in v1 — keeps the catalog clean).
   - **Quantity** → in pieces (or appropriate unit)
   - **Notes** → auto: `"From calculator estimate — Quality: 2nd · est. ₹X via Rahman Timbers"`
3. User reviews, adjusts, saves as draft or submits — normal MR lifecycle.

---

## Critical Files

**To create:**
- `src/app/(main)/company/calculator/page.tsx` — calculator page
- `src/components/calculator/CalculatorWorkspace.tsx` — main UI
- `src/components/calculator/CalculatorInputs.tsx` — schema-driven input renderer
- `src/components/calculator/VendorQuoteList.tsx` — vendor comparison row
- `src/components/calculator/EstimateBasketDrawer.tsx` — basket panel
- `src/components/calculator/AiAssistDialog.tsx` — prompt/paste dialog
- `src/contexts/EstimateBasketContext.tsx` — basket state
- `src/lib/category-calculator-templates.ts` — calculator schema definitions
- `src/lib/calculatorMath.ts` — unit conversion + formula helpers
- `src/lib/aiPromptSchemas.ts` — Zod schemas for AI JSON validation

**To modify:**
- `src/lib/category-variant-templates.ts` — add `wood_timber` template
- `src/lib/constants/materialCategories.ts` — wire WOD code to `wood_timber` template
- `src/app/(main)/company/materials/[id]/page.tsx` — add "Estimate" tab using the calculator widget
- `src/types/material.types.ts` — add `MaterialCategory.calculator_label`, calculator schema types

**Supabase migrations (2):**
- `add_calculator_label_to_categories.sql` — adds `material_categories.calculator_label TEXT NULL`
- `seed_wood_quality_tiers.sql` — inserts three `MaterialBrand` rows per existing wood material (`WOD` category) for 1st / 2nd / 3rd quality

---

## Verification

End-to-end manual test (after auto-login at `http://localhost:3000/dev-login`):

1. **Wood calculator basics**
   - Navigate to `/company/calculator`
   - Pick "Teak Wood" → enter L=7ft W=3in T=1.5in Qty=12 → expect cft = 4.375
   - Pick "2nd Quality" → vendor list shows Rahman Timbers ₹2,500/cft → total ₹10,938
   - Add to basket → drawer shows item with subtotal

2. **Material detail tab (option B placement)**
   - Navigate to `/company/materials/<teak-wood-id>`
   - Confirm "Estimate" tab is present, opens the calculator widget pre-scoped to teak wood

3. **AI prompt flow**
   - Click "Get AI estimate" → copy prompt → paste a valid JSON response → expect items added to basket
   - Paste invalid JSON → expect inline validation error pointing at the bad field

4. **Universal calculator — steel**
   - Pick a TMT bar material → schema renders diameter/length/rods inputs → weight calc matches existing TMT table → vendor list shows brand-keyed prices

5. **Convert to Material Request**
   - With items in basket, click "Convert to Material Request" → pick a site → MR dialog opens with all items pre-filled → notes contain estimate origin → save as draft → confirm draft appears at `/site/material-requests`

6. **Console/visual checks (per CLAUDE.md)**
   - Take screenshot at each step
   - Console logs clean (no React warnings, no hydration errors)
   - HTML nesting rules followed inside the basket drawer

### Migration verification

Before merging:
- `mcp__supabase__list_migrations` confirms both new migrations applied locally
- Spot check: `material_brands` has 3 quality rows per WOD material; `material_categories.calculator_label` is `'Quality'` for WOD

---

## Open questions tracked for v2

- **Basket persistence** — should baskets save to a `material_estimates` table so engineers can return to them across sessions? Add when teams ask.
- **Auto-create variants from custom dimensions** — currently v1 attaches custom dimensions as notes. If teams routinely add the same custom size, surface a "Formalize as catalog variant" action.
- **Per-site calculator** — currently lives under `/company`. May want a `/site/<id>/calculator` mirror that pre-fills vendor preferences from that site's history.
- **More category schemas** — beyond wood/steel/tiles, add paint coverage (sqft/litre), cement (bags from cubic meter via standard mix ratio), aggregates (cubic meter from truck loads). Each is a new entry in `CATEGORY_CALCULATOR_TEMPLATES`.
