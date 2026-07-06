# Spaces Register — full-screen zoomable plan viewer + surfaced tile/skirting counts

**Date:** 2026-07-06
**Status:** Approved design, ready for implementation plan
**Area:** `/site/spaces` (Spaces & Measurements Register)
**Migrations:** none (code-only ship)

## Overview

Two independent pieces of live-use feedback on the shipped Spaces register:

1. **Plan viewer is cramped.** Floor plans (mostly single-page PDFs) open in a small
   `md` dialog crowded with edit controls. The owner wants the plan **full-screen and
   focused**, zoomable by pinch (touch) and mouse (laptop).
2. **Tile/skirting counts are buried.** The per-space list shows skirting only as `rft`.
   The owner wants to see, **per space, how many tiles to purchase including skirting** —
   where skirting is either cut from the floor tile into 4″ strips **or** bought as a
   separate, contrasting (darker) skirting tile.

Both are largely a matter of surfacing and polishing existing building blocks; the only
genuinely new capability is contrast-skirting-tile handling and a plan-viewer rework.

## Goals

- Plan viewer opens full-screen with the plan as the focus; edit controls tuck away.
- Image plans zoom/pan (wheel, pinch, drag, double-tap reset) via the existing zoom stack.
- PDF plans display full-screen using the browser's native PDF viewer (toolbar zoom,
  Ctrl+scroll on laptop, pinch on touch) with an "Open in new tab" escape hatch.
- Each space's summary row shows a tile purchase count (tiles + boxes) including skirting.
- Skirting shows a **piece count** (e.g. 17 pcs of 2′) in addition to running feet.
- Skirting can be **cut from the floor tile** or use a **separate contrast tile**, each
  counted and priced against the correct tile option.
- Totals strip shows per-tile-option purchase lines (floor tile vs skirting tile split).
- One-tap "apply this tile to all / all unassigned spaces" so tiles aren't picked per room.
- `npm run build` and `npm run test` stay green throughout.

## Non-goals (YAGNI / deferred)

- pdf.js smooth plain-wheel zoom for PDFs (accepted the native route; keep pdf.js as a
  clean later upgrade if native zoom feels clunky in use).
- Multi-page PDF paging UI (plans are single-sheet; native viewer handles pages anyway).
- Linking tile options to the materials catalog / PO, or per-sqft labour contracts.
- Grout-gap math, 3D view, in-app LLM.

---

## Feature 1 — Full-screen, plan-first, zoomable viewer

**Component reworked:** `src/components/spaces/FloorPlanViewer.tsx`.

### Behaviour
- Dialog becomes full-screen on mobile and ~95vw×95vh on desktop (mirrors
  `ImageZoomDialog`'s sizing), dark background, plan centered and maximized.
- **Image plan** → renders through a new shared `ZoomableImage` presentational component
  (extracted from the inner `TransformWrapper`/`TransformComponent` block of
  `ImageZoomDialog`): drag-pan, mouse-wheel zoom, pinch zoom, double-tap/double-click
  reset, on-screen zoom buttons. `react-zoom-pan-pinch` is already a dependency.
- **PDF plan** (`isPdfRef(plan)`) → full-viewport native `<iframe src={plan.url}>` (browser
  PDF toolbar + Ctrl+scroll + pinch), plus the existing "Open PDF in new tab" link.
- **Edit controls move behind an Edit toggle.** A top toolbar (app-bar style) holds the
  floor name, a close button, and — for `canEdit` users — an **Edit** button that reveals
  the "Replace plan" (`ReceiptCapture`, bucket `space-photos`, `accept="image/*,application/pdf"`)
  and "Built-up area (sqft)" controls in a collapsible panel/sheet. Default view = just the
  plan. Non-edit users never see the toolbar's edit affordances.

### Refactor for isolation
`ImageZoomDialog` keeps its public API unchanged; its zoom body is extracted into
`src/components/common/ZoomableImage.tsx` (props: `src`, `alt?`, optional `onLoad`/`onError`,
`showButtons?`), and `ImageZoomDialog` consumes it. This gives one zoom implementation used
by both the shared image viewer and the plan viewer. Covered by the existing
`ImageZoomDialog.test.tsx` (extend if the extraction changes render structure).

### Files
- Reworked: `FloorPlanViewer.tsx`.
- New: `src/components/common/ZoomableImage.tsx`.
- Edited: `src/components/common/ImageZoomDialog.tsx` (consume `ZoomableImage`).
- Unchanged entry points: `FloorGroup.tsx`, `FloorPlansDialog.tsx` (still open the viewer).

---

## Feature 2 — Surfaced tile & skirting counts + contrast skirting tile

### Data model (no migration)
`tile_layout` is already a JSONB column. Extend the `TileLayout` type only:

```ts
export interface TileLayout {
  exclusions?: TileExclusion[];
  wastage_pct?: number;              // default 5
  skirting_from_same_tile?: boolean; // cut strips from the floor tile
  skirting_strip_in?: number;        // default 4
  /** NEW: separate contrast skirting tile (space_tile_options.id). */
  skirting_tile_option_id?: string | null;
}
```

**Skirting source resolution** (in `tiles.ts`):
1. `skirting_tile_option_id` set and found → skirting uses that (contrast) tile.
2. else `skirting_from_same_tile` → cut strips from the floor tile.
3. else → running-feet only, no tile count.

Stale `skirting_tile_option_id` (option deleted) is tolerated — falls back to same-tile if
enabled, else rft-only. No FK (matches `mirrored_section_ids` precedent).

### Math (`src/lib/spaces/tiles.ts`)
Extend `TileLayoutResult`. Orientation is chosen to minimise tiles: strips run along the
tile's **longer** side, stacked across its **shorter** side —
`stripLenIn = max(w, h)`, `shortIn = min(w, h)`.
- `skirtingPieces: number` — `ceil(perimeter_in / stripLenIn)` (each piece is one strip of
  length `stripLenIn`). Multiplied by `floorAppearances`.
- `skirtingTiles: number` — whole tiles consumed by skirting, from the **resolved skirting
  tile's** dimensions: `stripsPerTile = floor(shortIn / strip_in)`;
  `tiles = ceil(skirtingPieces / stripsPerTile)` (guard `stripsPerTile > 0`). A dedicated
  skirting-strip tile whose shorter side already equals `strip_in` yields
  `stripsPerTile = 1`, i.e. one tile per piece. Preserves today's numbers for a square tile
  (2×2, 4″ strips → 6 strips/tile).
- `skirtingTileOptionId: string | null` — which option the skirting tiles belong to
  (floor option when same-tile, contrast option when separate).
- When skirting uses a **separate** tile: its tiles are **not** folded into `totalTiles`
  (that stays the floor-tile purchase). Add `skirtingBoxes`/`skirtingPrice` for the separate
  skirting purchase. When skirting is **same-tile**, keep current behaviour (folded into
  `totalTiles`, which already multiplies by floor appearances + wastage).
- Skirting counts also multiply by `floorAppearances` (mirrored typical floors).

`rollupTileTotals` attributes floor tiles to `tile_option_id` and skirting tiles to
`skirtingTileOptionId`; a single option can accumulate floor tiles from some rooms and
skirting tiles from others. Boxes/price per option computed from the aggregated per-option
tile count.

### UI
- **`SpaceRow.tsx`** — when a floor tile is chosen, add a compact **"Tiles N · M box"**
  cell (total incl. skirting when same-tile; floor + separate skirting shown as `N + K`
  when contrast tile). Annotate the existing Skirting cell with pieces, e.g. `33 rft · 17 pc`.
  When no tile chosen, row is unchanged.
- **`SpaceTilePanel.tsx`** — add a Skirting sub-control:
  - Mode: **Same tile (cut 4″ strips)** (default when a floor tile is set) / **Separate tile**.
  - Separate → a tile-option `Select` (same option list, plus "Manage tile options…") writing
    `tile_layout.skirting_tile_option_id`.
  - Count line shows: floor tiles breakdown (existing) **+ skirting: P pieces → T tiles**
    (and `≈ B boxes · ₹` for a separate skirting tile).
- **`SpaceTileLayoutView.tsx`** — render the room **perimeter as a dark skirting band**
  (a fixed inner-offset border ring) filled with the skirting tile's photo/colour when a
  skirting tile is resolved, so the light-floor / dark-skirting split is visible. Band width
  scales to `skirting_strip_in`. Skip the band in rft-only mode.
- **Totals / purchases** — a per-tile-option purchase summary (floor + skirting split) from
  `rollupTileTotals`, surfaced near/under `SpacesTotalsStrip` (e.g. a small "Tiles to buy"
  block: `«Kajaria Ivory 2×2» — 312 tiles ≈ 79 boxes ≈ ₹…`, `«Dark skirting 2×2» — 18 tiles…`).
  WhatsApp copy text (`formatTotalsForWhatsApp`) appends these lines.
- **Quick-apply** — in `TileOptionsManager.tsx` (page "Tiles" button), add per-option
  **"Apply to all spaces"** and **"Apply to unassigned"** actions. Backed by a new
  `useBulkSetSpaceTile` mutation in `useSpaces.ts`: one `.update({ tile_option_id }).in("id", ids)`
  scoped to the site's spaces, then invalidate spaces keys. Confirmation before overwriting
  spaces that already have a different tile.

### Files
- Types: `src/types/spaces.types.ts` (`TileLayout.skirting_tile_option_id`).
- Math: `src/lib/spaces/tiles.ts` (+ `src/lib/spaces/tiles.test.ts`).
- Hooks: `src/hooks/queries/useSpaces.ts` (`useBulkSetSpaceTile`).
- UI: `SpaceRow.tsx`, `SpaceTilePanel.tsx`, `SpaceTileLayoutView.tsx`,
  `TileOptionsManager.tsx`, `SpacesTotalsStrip.tsx` (or a sibling tiles-summary block),
  `src/lib/spaces/measurements.ts` (`formatTotalsForWhatsApp` tile lines if totals live there),
  `src/app/(main)/site/spaces/page.tsx` (wire quick-apply + tile totals).

---

## Testing

- **Unit (`npm run test`):** `tiles.test.ts` — skirting piece count (33 rft, 2′ strips → 17
  pcs); same-tile skirting tiles (17 pcs, 6 strips/tile → 3 tiles) folded into total;
  separate contrast tile counted/priced against its own option and NOT folded into floor
  total; dedicated 4″ skirting-strip tile → 1 tile per piece; `rollupTileTotals` splits floor
  vs skirting attribution; mirrored floors multiply skirting too. Existing measurements/floors
  tests stay green.
- **Component:** extend `ImageZoomDialog.test.tsx` if the `ZoomableImage` extraction changes
  its render tree.
- **E2E (Playwright per CLAUDE.md — dev:cloud → /dev-login → /site/spaces):**
  1. Open a PDF plan → full-screen viewer, plan fills screen, Edit reveals Replace + built-up.
  2. Open an image plan → wheel/pinch zoom, drag pan, double-tap reset, zoom buttons.
  3. Pick a floor tile on a space → summary row shows "Tiles N · M box"; skirting shows pieces.
  4. Toggle skirting Separate → pick a dark tile → 2D view shows a dark perimeter band; count
     line shows skirting pieces/tiles/boxes against the contrast tile; totals split correctly.
  5. Tiles dialog → "Apply to all unassigned" → rows populate; confirm before overwriting.
  6. Mobile viewport pass; console clean; `playwright_close`.

## Deployment

Code-only (no migration). Standard build + push. Confirm `npm run build` green (stop dev
servers first), commit, push to `origin/main` (triggers Vercel). No Cloudflare Worker
changes.

## Risks / notes

- Native PDF viewer zoom on laptop is Ctrl+scroll / toolbar, not plain scroll — accepted;
  pdf.js upgrade path remains open.
- `ZoomableImage` extraction must preserve `ImageZoomDialog`'s current behaviour — keep its
  public API identical and re-run its test.
- Contrast-skirting split changes `rollupTileTotals` shape — keep floor-only rooms
  byte-for-byte unchanged (skirting attribution only kicks in when a skirting tile resolves).
- Quick-apply is a bulk write — scope strictly to `site_id`, confirm before overwriting a
  space that already carries a different tile.
- `SpaceTileLayoutView` perimeter band is cosmetic; it must never alter the computed counts.

## Resolved decisions

- Plan viewer: **full-screen + native PDF zoom** (not pdf.js).
- Tile count placement: **summary row + totals strip + quick-apply**.
- Skirting: support **both** same-tile strips **and** a separate contrast skirting tile;
  show a **piece count**; default to same-tile so a count appears without extra clicks.
