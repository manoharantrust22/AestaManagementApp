# Brand × Variant Matrix — Design Spec

**Date:** 2026-05-12  
**Status:** Approved for implementation

---

## Context

Materials in the catalog have two orthogonal dimensions:
- **Variants** — grade/size/spec at the material level (e.g., 33 Grade, 43 Grade, 53 Grade for PPC Cement). Stored as child `materials` records linked via `parent_id`.
- **Brands** — manufacturers of that material (Ultratech, ACC, Chettinad…). Stored in `material_brands`.

Currently, brands carry an optional `variant_name` text field to encode brand-specific sub-variants (e.g., "PPC 43 Grade" for Chettinad). This creates two problems:
1. The inspect pane renders each brand row individually, causing "Chettinad" and "Chettinad PPC 43 Grade" to appear as two separate brands.
2. There is no way to express "Brand X does not produce Variant Y" or to attach a different product photo per brand×variant combination.
3. PO brand dropdowns cannot be filtered by the specific grade being ordered.

---

## Goal

Replace the `variant_name` text field model with a proper **brand×variant link table** that:
- Tracks which brands are linked to which variants of a material
- Allows per-link product images
- Filters PO brand dropdowns to only brands that produce the ordered variant

---

## Data Model

### New table: `material_brand_variant_links`

```sql
CREATE TABLE material_brand_variant_links (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id   uuid NOT NULL REFERENCES material_brands(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES materials(id)       ON DELETE CASCADE,
  is_active  boolean NOT NULL DEFAULT true,
  image_url  text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(brand_id, variant_id)
);

CREATE INDEX ON material_brand_variant_links(brand_id);
CREATE INDEX ON material_brand_variant_links(variant_id);
```

`brand_id` → row in `material_brands` scoped to the **parent** material.  
`variant_id` → child `materials` record (`parent_id IS NOT NULL`).

### Migration (one-time)

1. **Generic brand rows** (`variant_name IS NULL`): for each such row, insert one link per active child variant of that material, `is_active = true`, `image_url = NULL`.
2. **Sub-variant rows** (`variant_name IS NOT NULL`, e.g., "Chettinad / PPC 43 Grade"): match to a child variant by case-insensitive substring check (child variant name contains `variant_name` or vice versa). Run a review query before applying — if the match is unambiguous, insert a link carrying over `image_url` and delete the sub-variant row. If no confident match, preserve the row as-is and flag for manual cleanup.
3. `variant_name` column on `material_brands` is **deprecated** — kept in DB for safety, ignored in all new UI. Drop in a follow-up migration after confirming all sub-variant rows have been handled.

### Auto-link rules (app logic on mutation)

| Event | Action |
|---|---|
| Brand added to material | Insert `is_active = true` links to every active child variant |
| Variant added to material | Insert `is_active = true` links from every existing brand of that material |

---

## React Query Hooks (new, in `useMaterials.ts`)

| Hook | Purpose |
|---|---|
| `useBrandVariantLinks(materialId)` | Fetch all links for a material (joins brand + variant) |
| `useToggleBrandVariantLink(brandId, variantId, isActive)` | Toggle a link on/off |
| `useUpsertBrandVariantLinkImage(brandId, variantId, imageUrl)` | Set/clear image on a link |

Image resolution order: link `image_url` → brand `image_url` → material `image_url`.

---

## UI: Inspect Pane — Brands Tab

One card per brand (grouped by `brand_name`). Each card:

```
[img]  Chettinad  ☆  4/5
       [33]  [43]  [53]     ← filled chip = linked; outlined/gray = unlinked
```

- Variant chips are read-only in the inspect pane
- Clicking a filled chip opens the link's `image_url` in a lightbox (if set)
- No link/unlink controls here — edit dialog only

Files: `src/components/materials/MaterialInspectPane.tsx`

---

## UI: Edit Dialog — Brands Section

Replace the current sub-variant accordion with a **brand×variant chip matrix**.

```
▼  ★  Ultratech                          [trash]
      Links:  [✓ 33]  [✓ 43]  [✓ 53]    ← click to toggle is_active
      Images: each linked chip gets an upload button
              (opens FileUploader, stores to material_brand_variant_links.image_url)
```

- If the material has **no variants**, the Links/Images row is hidden (brand-only display, current behavior)
- Adding a brand auto-links all variants (user sees all chips pre-filled)
- "Add sub-variant" input is **removed** from `BrandVariantEditor`

Files: `src/components/materials/BrandVariantEditor.tsx`, `src/components/materials/MaterialDialog.tsx`

---

## PO Brand Filtering

When a PO line targets a **variant material** (has `parent_id`):

1. Resolve parent material ID
2. Query: brands WHERE a link exists for `variant_id = {this variant}` AND `is_active = true`
3. Edge case — no links for variant (pre-migration or freshly added): fall back to all brands of the parent material

When a PO line targets a **parent material** with no variants:
- No change — show all brands (current behavior)

Image shown in brand dropdown option: link `image_url` → brand `image_url` → material `image_url`.

Files: PO creation brand selector — grep for `brand` in `src/components/materials/` PO dialog components; `usePurchaseOrders.ts` is the starting point for the query hook.

---

## Scope

| Area | Change |
|---|---|
| `supabase/migrations/` | New migration: create table + indexes + seed links |
| `src/hooks/queries/useMaterials.ts` | 3 new hooks; extend `useCreateMaterialBrand` and `useAddVariantToMaterial` with auto-link logic |
| `src/components/materials/BrandVariantEditor.tsx` | Replace sub-variant section with variant chip matrix |
| `src/components/materials/MaterialInspectPane.tsx` | Brands tab: group by brand, render variant chips |
| PO brand selector | Filter by variant link when applicable |

No other domains are affected.

---

## Verification

1. **Migration**: run `npm run db:reset` and confirm no orphaned `variant_name` rows remain (except unmatched ones)
2. **Inspect pane**: open PPC Cement → Brands tab → confirm Chettinad appears once with variant chips
3. **Edit dialog**: open PPC Cement → Edit → Brands → toggle a chip off → confirm `is_active = false` in DB → confirm the chip renders gray
4. **Image**: upload an image on a brand×variant link → confirm it appears on the inspect pane chip lightbox and in the PO brand dropdown
5. **PO filtering**: create a PO for 43 Grade cement → confirm only brands linked to 43 Grade appear in the brand dropdown
6. **Auto-link on brand add**: add a new brand to a material that has variants → confirm link rows are created for each variant
7. **Auto-link on variant add**: add a new variant to a material that has brands → confirm link rows are created for each brand
