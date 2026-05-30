# Material Catalog — Landed Price on Cards & Vendor Pane

**Date:** 2026-05-30
**Route:** `/company/materials`
**Status:** Design approved (pending written-spec review)

## Problem

Material catalog cards show "No price" for **every** material even when vendor
quotes exist (e.g. P Sand has two ₹5,500/CFT quotes, yet its card reads
"No price"). Two issues:

1. **Bug:** `useMaterialBestPrices()` builds its result map keyed by
   `` `${material_id}_${brand_id || 'no-brand'}` `` but every consumer looks it
   up by plain `m.id` (`bestPrices?.get(m.id)` in `page.tsx` at the grid map,
   list map, sort comparator, and price filter). The `.get()` never matches, so
   price / sort-by-price / has-price filter all silently fall back to "No price".

2. **Feature gap:** Even once prices show, two vendors quoting the same base
   rate (₹5,500) are indistinguishable, although their **transport** differs.
   The user wants the *lowest effective rate including transport* surfaced, plus
   *which vendor* is cheapest.

## Goal

- Cards show the **lowest landed cost** (not "No price") with the cheapest
  vendor in a tooltip.
- The inspect-pane Vendors tab compares vendors on the **same landed cost**, so
  the cheapest-including-transport vendor is visible.
- Cards and pane compute the figure identically (no drift).

## The shared concept: "landed cost"

A single per-unit comparison figure, computed identically in TypeScript (card
hook) and SQL (RPC):

```
gst_extra       = price_includes_gst ? 0 : current_price * COALESCE(gst_rate,0)/100
transport_extra = (price_includes_transport ? 0 : COALESCE(transport_cost,0))
                + COALESCE(loading_cost,0) + COALESCE(unloading_cost,0)
landed          = current_price + gst_extra + transport_extra
```

**GST rule (per user):** GST is usually unknown. For sand / P-Sand the vendor
quotes one all-in number and never splits GST, so the quoted price *is* the final
price — no GST math, and the word "GST" never appears. For standard materials
like cement / steel the split is sometimes known; in that case the data carries
`gst_rate > 0` with `price_includes_gst = false`, and only then do we add GST and
show the word "GST". Concretely: when `gst_rate` is null/0 (the common case), GST
impact is zero and GST is never mentioned in any label or tooltip; GST math +
the word "GST" appear **only** when `gst_rate > 0` **and**
`price_includes_gst = false`. Basis is **GST-inclusive** (cash-out cost). This is
deliberately conservative — we never invent GST the vendor didn't state.

**Other rules:**
- Null cost components coalesce to 0.
- Rows with no `current_price` are skipped (a null must never win as ₹0).
- GST is applied to the material price only — we have no per-component GST flags
  for transport/loading/unloading.

A shared helper `computeLandedCost(row)` returns `{ base, landed, gstExtra,
transportExtra }` so the UI can build a breakdown and decide which words
("transport", "GST") to show.

## Data layer

### Migration — `get_material_vendor_summary` (DROP + CREATE)

The existing function (`20260523120000_...`) already DROP+CREATEs, so changing
the `RETURNS TABLE` signature is fine. It is the **only** consumer of
`min_price` (verified by grep), so changes are safe.

Add, per vendor, derived from the **cheapest-landed inventory row** for that
vendor (use a per-row landed CTE + `DISTINCT ON (vendor_id) ORDER BY landed`):

- `min_landed_price numeric` — min landed across the vendor's rows.
- `min_landed_base numeric` — the base `current_price` of that cheapest-landed row.
- `min_landed_gst_extra numeric` — GST added on that row (0 when no GST).
- `min_landed_transport_extra numeric` — transport+loading+unloading on that row.

Keep existing `min_price` (base) untouched for backward safety.

In `variant_prices` jsonb, add `landed_price` alongside the existing `price`
(base), computed with the same per-row landed formula (min landed per variant).

### Types (`src/types/material.types.ts`)

- `MaterialVendorSummary`: add `min_landed_price`, `min_landed_base`,
  `min_landed_gst_extra`, `min_landed_transport_extra` (all `number | null`).
- `VariantPriceEntry`: add `landed_price: number`.
- `MaterialBestPrice` (`useMaterialOrderStats.ts`): add `landed_cost: number`,
  `gst_extra: number`, `transport_extra: number` (base stays `unit_price`).

### Shared helper

`src/lib/materials/landedCost.ts` — `computeLandedCost(row)` returning the
breakdown above. Used by `useMaterialBestPrices`. (Optionally refactor the
inline formula in `useVendorInventory.ts:56-60` to use it; not required.)

## Hook — `useMaterialBestPrices` (`src/hooks/queries/useMaterialOrderStats.ts`)

1. Extend the `vendor_inventory` select with `transport_cost`, `loading_cost`,
   `unloading_cost`, `price_includes_transport`, `gst_rate`, and
   `materials:material_id(parent_id)` (for rollup). Drop the SQL
   `.order("current_price")` — landed ordering happens client-side.
2. For each row: skip if `current_price` is null; compute landed via the helper.
3. **Double-key the map** so both display modes resolve correctly:
   - Update the min-landed entry for `material_id` (its own card).
   - If `parent_id` is present, also update the min-landed entry for `parent_id`
     (parent card rolls up its variants' quotes).
   "Update" = replace stored entry when this row's `landed` is lower.
4. Store on each entry: `landed_cost`, `unit_price` (base), `gst_extra`,
   `transport_extra`, `vendor_id`, `vendor_name`.

This collapses the broken `_${brand_id}` composite key — the root fix that makes
prices appear at all.

## UI

### `MaterialGridCard.tsx`
- Display `landed_cost` where it currently shows "No price".
- Add a `bestPriceVendor?: string` prop (+ optionally pass the breakdown).
- Wrap the price in a `Tooltip`: line 1 `Best price: <vendor>`; line 2 (only
  when `landed > base`) a breakdown listing non-zero parts, e.g.
  `₹5,500 + ₹300 transport` and, only when `gstExtra > 0`, `+ ₹X GST`.
- Card **face** stays price-only (no suffix) per the chosen layout.

### `MaterialListRow.tsx`
- Switch the displayed value to `landed_cost` (keep the existing vendor tooltip,
  same breakdown wording as the grid card).

### `page.tsx`
- Grid map: pass `bestPriceVendor={bp?.vendor_name}` and `bestPrice={bp?.landed_cost}`.
- List map: `bestPrice={bp?.landed_cost}` (vendor already passed).
- Sort comparator (price sort) and `hasPrice` filter: use `landed_cost`.

### `MaterialInspectPane.tsx` (`VendorSummaryRow`)
- Headline figure (and the variant min–max range) use the **landed** values
  (`min_landed_price`; `landed_price` from `variant_prices`).
- Per-variant chips show landed price.
- Add a tooltip on the headline price showing the breakdown of the
  cheapest-landed row: base + transport (+ GST only when `min_landed_gst_extra
  > 0`). Headline label keeps `per <unit>` (and existing `best ·` when
  `distinct_brands_count > 1`).

## Out of scope

- **Distance / site-based transport.** Real transport cost depends on the vehicle
  distance from the transporter to the site. The company catalog is not
  site-specific, so we use the per-unit `transport_cost` already stored on each
  quote as a *representative* figure. A distance-aware transport model (site
  coordinates, per-site freight) is a separate, larger feature.
- Per-component GST on transport/loading/unloading (no data for it).
- Reworking how vendor quotes are entered/edited.

## Testing & rollout (per CLAUDE.md "move to prod")

1. `npm run build` passes.
2. **Apply the migration to prod FIRST** (code reads `min_landed_price`), via
   `mcp__supabase__apply_migration`, before pushing code.
3. Playwright: log in via `/dev-login`, open `/company/materials`, confirm
   P Sand card shows a landed price (≥ ₹5,500) + vendor tooltip; open its
   inspect pane and confirm the two vendors now differ by transport; check
   console clean.
4. Commit migration + code together; push (account `findhari93-sketch`).
