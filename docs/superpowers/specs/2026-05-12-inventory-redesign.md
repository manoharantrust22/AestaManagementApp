# Inventory Page Redesign

**Date:** 2026-05-12  
**Status:** Approved for implementation

---

## Context

The current inventory page (`/site/inventory`) is a dense data table that requires scanning the entire page to understand what materials are on site. Engineers on a construction site need to:

1. **See at a glance** which materials are available and how much
2. **Record usage quickly** on mobile — often for bulk materials like sand, bricks, cement recorded over a date range, not day-by-day
3. **Navigate by trade category** — Civil, Electrical, Painting, Tiles, etc. are now being purchased and need clear differentiation

The table view is preserved as an optional toggle; the primary view becomes a card grid with progress bars.

---

## Design Decisions

| Question | Decision |
|---|---|
| Card style | Progress bar cards — color-coded red/orange/green for stock health |
| Category nav | Filter chips at top; when "All" selected, cards grouped under colored section headers |
| Record Usage UX | Quick bottom sheet — big qty input with +/− steppers, optional work note |
| Date selection | Preset buttons: Today / Yesterday / This week / Last week / This month / Custom |

---

## Page Layout

### Top Bar
- Page title: "Inventory"
- Subtitle: site name + active time range
- Actions: **▶ Record Usage** (primary, opens bulk entry) | **+ Manual Adjustment** (secondary) | Search box | ☰ Table view toggle

### Summary Tiles (4-up grid)
| Tile | Value | Color |
|---|---|---|
| Total Items | count | neutral |
| Stock Value | ₹ formatted | blue |
| Low Stock | count | red |
| Used Today | count | green |

- Low stock alert banner below tiles: "⚠️ N items below reorder level: [names]… View All"

### View Mode Tabs
- **Cards | Table | Usage History** — left-aligned
- **All Stock | Own (N) | Group (N) | Done (N)** — right-aligned  
  These replace the current sub-tab row

### Category Chips
Horizontal scrollable chips row:
`All (N)` · `🏗️ Civil (N)` · `⚡ Electrical (N)` · `🎨 Painting (N)` · `🔲 Tiles (N)` · `🔧 Hardware (N)` · `🚿 Plumbing (N)`

Only chips with stock > 0 are shown. "All" is always shown.

### Grouped Card Grid

When **All** chip is active: materials are grouped under colored section headers:
- 🏗️ Civil → `#e3f2fd` blue
- ⚡ Electrical → `#f3e5f5` purple  
- 🎨 Painting → `#fff3e0` orange
- 🔲 Tiles → `#e8f5e9` green
- 🔧 Hardware → `#fafafa` grey

Each section header shows: icon + name + item count + low-stock count badge (red, shown only if > 0).

When a category chip is active: no section headers, just the filtered cards.

Materials with `category_id = null` fall under a "General" section at the bottom.

---

## Material Card

```
┌─────────────────────────────┐
│ [icon 36px]  Name           │
│              MAT-CODE · unit │
│ [Shared] [Low]              │
│                             │
│ 3.5 Bag            of 30   │
│ ████░░░░░░░░░░░░░░░░ 12%   │  ← red
│ Used: 26.5          ₹290/bag│
│                             │
│  ▶ Record Usage             │
└─────────────────────────────┘
```

**Progress bar colors:**
- < 20% remaining → red gradient (`#ef5350 → #f44336`)
- 20–50% remaining → orange gradient (`#ff9800 → #ffc107`)
- > 50% remaining → green gradient (`#43a047 → #66bb6a`)

**Available qty color** matches bar color (red/orange/green).

**Badges:**
- `Shared` (blue) — has_shared_batches
- `Own` (green) — has_own_batches only
- `Mixed` (amber) — both own + shared batches
- `Low` (red) — below reorder level

**Grid:** `repeat(auto-fill, minmax(155px, 1fr))` — 2 cols mobile, 3–4 cols tablet/desktop.

**Icon fallback:** `EntityImageAvatar` with `InventoryIcon` (already exists in `MaterialGridCard.tsx`) — reuse exact same component.

---

## Record Usage — Quick Bottom Sheet

Triggered by: "▶ Record Usage" on a card OR the global "▶ Record Usage" header button (opens `BulkUsageEntryDialog` for multi-material).

### Single-material bottom sheet fields

1. **Qty input** — large numeric input (font-size 24px), unit label, +/− stepper buttons
2. **Date preset buttons** (2-row grid of 6):
   - Today / Yesterday / This week / Last week / This month / Custom…
   - Default: **Today**
   - "Custom…" opens a from/to date picker (reuse MUI DatePicker)
   - Selected preset shows resolved date string below buttons (e.g. "May 6 – 12")
3. **Work note** — single textarea, placeholder: "Foundation slab, Block A… (optional)"
4. **Actions** — Cancel (grey) | ✓ Save Usage (blue, 2× width)

### Behaviour
- Date range handling:
  - The current `material_usage` table has a single `usage_date` column. Date range support requires adding `usage_date_end` (nullable) to the table via migration.
  - `useCreateMaterialUsageFIFO` needs a new optional `usage_date_end` param.
  - Single-day presets: `usage_date_end` is null (or equals `usage_date`)
  - "This week" preset: `usage_date` = Sunday of current week, `usage_date_end` = today
- On save: optimistic update to card's progress bar + used qty
- "More details" link at bottom (optional) → opens existing full `UsageEntryDrawer` for work_area, notes, etc.

---

## Data Mapping

All data comes from the existing `useSiteStock` hook which returns `ConsolidatedStockItem[]`.

| Card field | Source field |
|---|---|
| Name | `material_name` |
| Code + unit | `material_code` + `unit` |
| Available qty | `total_available_qty` |
| Total purchased | `total_purchased` |
| Progress % | `total_available_qty / total_purchased` |
| Used | `total_purchased - total_available_qty` |
| Avg price | `weighted_avg_cost` |
| Shared/Own/Mixed | `has_shared_batches`, `has_own_batches` |
| Low stock | from `useLowStockAlerts` (already on page) |
| Category section | `category_id` → `category_name` |
| Icon/image | `material.image_url` via `EntityImageAvatar` |

**Category grouping:** use the existing `CATEGORY_TAB_MAPPING` from the company materials page — same codes map to Civil, Electrical, etc.

---

## Components

### New components
| Component | Path | Description |
|---|---|---|
| `InventoryCardGrid` | `src/components/inventory/InventoryCardGrid.tsx` | Renders category chips + grouped sections + card grid |
| `MaterialStockCard` | `src/components/inventory/MaterialStockCard.tsx` | Single progress-bar card |
| `QuickUsageSheet` | `src/components/inventory/QuickUsageSheet.tsx` | Bottom sheet with qty + date presets |

### Reused (no changes)
- `EntityImageAvatar` — material icon/image
- `UsageEntryDrawer` — full drawer, opened from "More details" link in sheet
- `BulkUsageEntryDialog` — global "Record Usage" header button
- `StockAdjustmentDialog` — Manual Adjustment button
- `useSiteStock` — data hook
- `useLowStockAlerts` — low stock data
- `useCreateMaterialUsageFIFO` — usage mutation

### Modified
- `src/app/(main)/site/inventory/page.tsx` — wire new card view as default; table view behind toggle

---

## Table View (preserved)

The existing `DataGridPro` table is kept intact, shown when the user clicks the ☰ / "Table" toggle. No changes to table columns or behaviour.

---

## Mobile Behaviour

- Summary tiles: 2-column grid on < 600px
- Category chips: horizontal scroll, no wrap
- Card grid: 2 columns on mobile
- Bottom sheet: full-width, slides up from bottom (`position: fixed`, `bottom: 0`)
- Search box: hidden on mobile (icon only, expands on tap)

---

## Verification

1. Start dev server: `npm run dev`
2. Login via `/dev-login`, navigate to `/site/inventory`
3. Verify:
   - Cards render with correct progress bar colors (check PPC Cement = red, TMT Rods = green)
   - Category chips filter correctly; section headers appear/disappear
   - Tapping "Record Usage" on a card opens bottom sheet pre-filled with material name + unit
   - Date presets resolve correctly (This week = Mon–today)
   - Saving usage updates the card's available qty optimistically
   - "Table" toggle shows existing table, "Cards" returns to grid
   - Own/Shared/Mixed badges match current table's Type column values
4. Mobile: resize browser to 375px width, verify 2-column grid and bottom sheet UX
5. Check console for hydration errors (no `<p>` wrapping block elements)