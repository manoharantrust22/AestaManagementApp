# Spaces — full-screen zoomable plan viewer + surfaced tile/skirting counts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `/site/spaces` floor-plan popup full-screen and zoomable, and surface per-space tile purchase counts (floor + skirting, with skirting cut from the floor tile *or* a separate contrast tile).

**Architecture:** Two independent features. Feature 1 reworks `FloorPlanViewer` into a full-screen, plan-first dialog reusing the repo's `react-zoom-pan-pinch` stack (extracted into a shared `ZoomableImage`) for images and a native `<iframe>` for PDFs. Feature 2 extends the pure `tiles.ts` math (skirting piece count + contrast-tile resolution) and surfaces the counts on the space row, in the tile panel, in a purchase summary, and via a quick "apply tile to all" bulk write. No database migration — `tile_layout` is already JSONB.

**Tech Stack:** Next.js 15, MUI v7, React Query, `react-zoom-pan-pinch@^3.7.0` (already a dependency), Vitest + React Testing Library, Supabase JS.

## Global Constraints

- No Supabase migration; `tile_layout` (JSONB) gains one optional field `skirting_tile_option_id`.
- `created_by` FK → `public.users(id)` via `userProfile.id`, never auth uid (existing hooks already do this; bulk hook writes no `created_by`).
- Dimensions are stored in **inches**; display via `formatFeetInches`.
- Bulk writes must be scoped to `site_id` (`.eq("site_id", siteId)`).
- `npm run test` and `npm run build` stay green after every task.
- MUI Autocomplete-in-dialog and HTML-nesting rules from CLAUDE.md apply (no `<Box>` bare inside `ListItemText` primary/secondary without typography props).
- Don't run `rm -rf .next`; stop dev servers before `npm run build`.

---

### Task 1: Extend `TileLayout` + tile math for skirting pieces & contrast tile

**Files:**
- Modify: `src/types/spaces.types.ts` (`TileLayout` interface, ~line 97-105)
- Modify: `src/lib/spaces/tiles.ts` (`TileLayoutResult` interface + `computeTileLayout`)
- Test: `src/lib/spaces/tiles.test.ts` (add cases; existing cases must stay green)

**Interfaces:**
- Consumes: `computeQuantities`, `resolveDims` from `./measurements`; `Space`, `SpaceTileOption`, `TileExclusion`, `MeasureMode` from `@/types/spaces.types`.
- Produces:
  - `TileLayout.skirting_tile_option_id?: string | null`
  - `computeTileLayout(space: Space, tile: SpaceTileOption, mode?: MeasureMode, skirtingTile?: SpaceTileOption | null): TileLayoutResult | null`
  - `TileLayoutResult` gains: `skirtingPieces: number`, `skirtingTileOptionId: string | null`, `skirtingIsSeparate: boolean`, `skirtingTotalTiles: number`, `skirtingBoxes: number | null`, `skirtingPrice: number | null` (keeps existing `skirtingTiles`, `skirtingRft`, `totalTiles`, `boxes`, `price`, etc.).

- [ ] **Step 1: Add the type field.** In `src/types/spaces.types.ts`, extend `TileLayout`:

```ts
/** Per-space tile layout settings (persisted as jsonb). */
export interface TileLayout {
  exclusions?: TileExclusion[];
  /** Extra tiles for breakage/cuts, percent. Default 5. */
  wastage_pct?: number;
  /** Skirting strips are cut from the same floor tile. */
  skirting_from_same_tile?: boolean;
  /** Skirting strip height, inches. Default 4. */
  skirting_strip_in?: number;
  /** A separate (contrast) tile for skirting; overrides skirting_from_same_tile. */
  skirting_tile_option_id?: string | null;
}
```

- [ ] **Step 2: Write the failing tests.** Append to `src/lib/spaces/tiles.test.ts` inside the `describe("computeTileLayout", …)` block:

```ts
  it("counts skirting pieces cut from the same tile", () => {
    const r = computeTileLayout(
      makeSpace({
        tile_layout: { wastage_pct: 0, skirting_from_same_tile: true },
      }),
      makeTile()
    )!;
    // 33 rft perimeter → ceil(396in / 24in) = 17 strips of 2'.
    expect(r.skirtingPieces).toBe(17);
    expect(r.skirtingTiles).toBe(3); // ceil(17 / 6 strips-per-tile)
    expect(r.skirtingTileOptionId).toBe("t1");
    expect(r.skirtingIsSeparate).toBe(false);
    expect(r.totalTiles).toBe(28); // 25 + 3 folded in
  });

  it("multiplies skirting pieces across mirrored floors", () => {
    const r = computeTileLayout(
      makeSpace({
        mirrored_section_ids: ["ff"],
        tile_layout: { wastage_pct: 0, skirting_from_same_tile: true },
      }),
      makeTile()
    )!;
    expect(r.skirtingPieces).toBe(34); // 17 × 2 floors
    expect(r.skirtingTiles).toBe(6); // ceil(34 / 6)
    expect(r.totalTiles).toBe(56); // (25×2) + 6
  });

  it("uses a separate contrast skirting tile, counted against its own option", () => {
    const dark = makeTile({
      id: "t2",
      label: "Dark 2×2",
      tiles_per_box: 10,
      price_per_box: 500,
    });
    const r = computeTileLayout(
      makeSpace({ tile_layout: { wastage_pct: 0, skirting_tile_option_id: "t2" } }),
      makeTile(),
      "best",
      dark
    )!;
    expect(r.skirtingIsSeparate).toBe(true);
    expect(r.skirtingTileOptionId).toBe("t2");
    expect(r.skirtingTiles).toBe(3);
    expect(r.totalTiles).toBe(25); // floor only — skirting NOT folded in
    expect(r.skirtingTotalTiles).toBe(3);
    expect(r.skirtingBoxes).toBe(1); // ceil(3/10)
    expect(r.skirtingPrice).toBe(500);
  });

  it("treats a dedicated 4-inch skirting strip tile as one tile per piece", () => {
    const strip = makeTile({
      id: "t3",
      tile_width_in: 24,
      tile_height_in: 4,
      tiles_per_box: 20,
      price_per_box: 200,
    });
    const r = computeTileLayout(
      makeSpace({ tile_layout: { wastage_pct: 0, skirting_tile_option_id: "t3" } }),
      makeTile(),
      "best",
      strip
    )!;
    expect(r.skirtingPieces).toBe(17);
    expect(r.skirtingTiles).toBe(17); // ceil(17 / 1 strip-per-tile)
    expect(r.skirtingBoxes).toBe(1); // ceil(17/20)
  });

  it("falls back to running-feet-only when the separate skirting tile isn't provided", () => {
    const r = computeTileLayout(
      makeSpace({ tile_layout: { wastage_pct: 0, skirting_tile_option_id: "t2" } }),
      makeTile()
    )!;
    expect(r.skirtingPieces).toBe(0);
    expect(r.skirtingTiles).toBe(0);
    expect(r.skirtingTileOptionId).toBeNull();
  });
```

- [ ] **Step 3: Run the tests to verify they fail.**

Run: `npm run test -- src/lib/spaces/tiles.test.ts`
Expected: FAIL — the new `skirtingPieces` / `skirtingIsSeparate` / `skirtingTotalTiles` fields are `undefined`.

- [ ] **Step 4: Implement the math.** Replace the `TileLayoutResult` interface and the body of `computeTileLayout` in `src/lib/spaces/tiles.ts` (keep `DEFAULT_WASTAGE_PCT`, `DEFAULT_SKIRTING_STRIP_IN`, `TileCell`, `TileCellKind`, `cellInsideExclusion` as-is):

```ts
export interface TileLayoutResult {
  cols: number;
  rows: number;
  cells: TileCell[];
  fullTiles: number;
  cutTiles: number;
  excludedTiles: number;
  /** full + cut − excluded (one room, one floor). */
  tilesNeeded: number;
  /** Number of skirting strips needed (across mirrored floors). */
  skirtingPieces: number;
  /** Whole tiles consumed by skirting (from the resolved skirting tile). */
  skirtingTiles: number;
  skirtingRft: number;
  /** Which option the skirting tiles belong to (floor tile or contrast tile). */
  skirtingTileOptionId: string | null;
  /** True when skirting uses a different tile than the floor. */
  skirtingIsSeparate: boolean;
  /** Separate skirting purchase after wastage (0 when same-tile / none). */
  skirtingTotalTiles: number;
  skirtingBoxes: number | null;
  skirtingPrice: number | null;
  wastagePct: number;
  /** 1 + mirrored floors — the room repeats on each. */
  floorAppearances: number;
  /** Floor-tile purchase: ceil((floor tiles × appearances + same-tile skirting) × (1 + wastage)). */
  totalTiles: number;
  boxes: number | null;
  price: number | null;
}

/**
 * Compute the tile grid and purchase quantities for a space with a chosen
 * floor tile. `skirtingTile` is the resolved contrast tile when
 * `tile_layout.skirting_tile_option_id` is set (caller looks it up); pass null
 * otherwise. Returns null when the space has no usable dimensions.
 */
export function computeTileLayout(
  space: Space,
  tile: SpaceTileOption,
  mode: MeasureMode = "best",
  skirtingTile: SpaceTileOption | null = null
): TileLayoutResult | null {
  const { lengthIn: xIn, widthIn: yIn } = resolveDims(space, mode);
  if (
    xIn === null ||
    yIn === null ||
    tile.tile_width_in <= 0 ||
    tile.tile_height_in <= 0
  ) {
    return null;
  }

  const layout = space.tile_layout ?? {};
  const exclusions = layout.exclusions ?? [];
  const tw = tile.tile_width_in;
  const th = tile.tile_height_in;

  const cols = Math.ceil(xIn / tw);
  const rows = Math.ceil(yIn / th);

  const cells: TileCell[] = [];
  let fullTiles = 0;
  let cutTiles = 0;
  let excludedTiles = 0;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * tw;
      const y = row * th;
      const w = Math.min(tw, xIn - x);
      const h = Math.min(th, yIn - y);
      const excluded = exclusions.some((ex) =>
        cellInsideExclusion(x, y, w, h, ex)
      );
      const kind: TileCellKind = excluded
        ? "excluded"
        : w < tw || h < th
          ? "cut"
          : "full";
      if (kind === "excluded") excludedTiles++;
      else if (kind === "cut") cutTiles++;
      else fullTiles++;
      cells.push({ col, row, x_in: x, y_in: y, w_in: w, h_in: h, kind });
    }
  }

  const tilesNeeded = fullTiles + cutTiles;
  const floorAppearances = 1 + new Set(space.mirrored_section_ids ?? []).size;
  const wastagePct = layout.wastage_pct ?? DEFAULT_WASTAGE_PCT;
  const skirtingRftValue = computeQuantities(space, mode).skirtingRft;

  // Resolve which tile the skirting is cut from: a separate contrast tile
  // (when its id is set AND the caller supplied it) wins; else the floor tile
  // when "cut from same tile" is on; else no tile (running feet only).
  const separate =
    layout.skirting_tile_option_id &&
    skirtingTile &&
    skirtingTile.id === layout.skirting_tile_option_id
      ? skirtingTile
      : null;
  const skirtingSource = separate ?? (layout.skirting_from_same_tile ? tile : null);
  const skirtingIsSeparate = separate !== null && separate.id !== tile.id;

  const stripIn = layout.skirting_strip_in ?? DEFAULT_SKIRTING_STRIP_IN;
  let skirtingPieces = 0;
  let skirtingTiles = 0;
  let skirtingTileOptionId: string | null = null;
  if (skirtingSource && skirtingRftValue > 0) {
    // Strips run along the tile's longer side, stacked across the shorter.
    const longSide = Math.max(skirtingSource.tile_width_in, skirtingSource.tile_height_in);
    const shortSide = Math.min(skirtingSource.tile_width_in, skirtingSource.tile_height_in);
    const stripsPerTile = Math.floor(shortSide / stripIn);
    if (longSide > 0 && stripsPerTile > 0) {
      skirtingPieces = Math.ceil((skirtingRftValue * 12) / longSide) * floorAppearances;
      skirtingTiles = Math.ceil(skirtingPieces / stripsPerTile);
      skirtingTileOptionId = skirtingSource.id;
    }
  }

  const sameTileSkirting = skirtingTileOptionId !== null && !skirtingIsSeparate ? skirtingTiles : 0;
  const totalTiles = Math.ceil(
    (tilesNeeded * floorAppearances + sameTileSkirting) * (1 + wastagePct / 100)
  );
  const boxes =
    tile.tiles_per_box && tile.tiles_per_box > 0
      ? Math.ceil(totalTiles / tile.tiles_per_box)
      : null;
  const price =
    boxes !== null && tile.price_per_box ? boxes * tile.price_per_box : null;

  // A separate contrast skirting tile is its own purchase line.
  const skirtingTotalTiles = skirtingIsSeparate
    ? Math.ceil(skirtingTiles * (1 + wastagePct / 100))
    : 0;
  const skirtingBoxes =
    skirtingIsSeparate && separate?.tiles_per_box && separate.tiles_per_box > 0
      ? Math.ceil(skirtingTotalTiles / separate.tiles_per_box)
      : null;
  const skirtingPrice =
    skirtingBoxes !== null && separate?.price_per_box
      ? skirtingBoxes * separate.price_per_box
      : null;

  return {
    cols,
    rows,
    cells,
    fullTiles,
    cutTiles,
    excludedTiles,
    tilesNeeded,
    skirtingPieces,
    skirtingTiles,
    skirtingRft: skirtingRftValue,
    skirtingTileOptionId,
    skirtingIsSeparate,
    skirtingTotalTiles,
    skirtingBoxes,
    skirtingPrice,
    wastagePct,
    floorAppearances,
    totalTiles,
    boxes,
    price,
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass.**

Run: `npm run test -- src/lib/spaces/tiles.test.ts`
Expected: PASS — all new cases plus the 8 pre-existing `computeTileLayout` cases (5×5 grid, exact-fit, exclusion, same-tile skirting=3/total=28, wastage 27, mirrored 53, verified dims, boxes-unknown) green.

- [ ] **Step 6: Commit.**

```bash
git add src/types/spaces.types.ts src/lib/spaces/tiles.ts src/lib/spaces/tiles.test.ts
git commit -m "feat(spaces): skirting piece count + contrast skirting tile in tile math"
```

---

### Task 2: `rollupTileTotals` — split floor vs skirting attribution

**Files:**
- Modify: `src/lib/spaces/tiles.ts` (`rollupTileTotals`)
- Test: `src/lib/spaces/tiles.test.ts` (add one case; existing two stay green)

**Interfaces:**
- Consumes: `computeTileLayout` (Task 1), `TileOptionTotal`, `Space`, `SpaceTileOption`, `MeasureMode`.
- Produces: `rollupTileTotals(spaces, tileOptions, mode?)` unchanged signature; now attributes a room's floor tiles to its floor option and its **separate** skirting tiles to the skirting option.

- [ ] **Step 1: Write the failing test.** Append to the `describe("rollupTileTotals", …)` block in `src/lib/spaces/tiles.test.ts`:

```ts
  it("attributes floor tiles and separate skirting tiles to their own options", () => {
    const floor = makeTile(); // t1
    const dark = makeTile({ id: "t2", label: "Dark", tiles_per_box: 10, price_per_box: 500 });
    const a = makeSpace({
      id: "a",
      tile_layout: { wastage_pct: 0, skirting_tile_option_id: "t2" },
    });
    const totals = rollupTileTotals([a], [floor, dark]);
    const t1 = totals.find((t) => t.tileOptionId === "t1")!;
    const t2 = totals.find((t) => t.tileOptionId === "t2")!;
    expect(t1.totalTiles).toBe(25); // floor only
    expect(t1.spaceCount).toBe(1);
    expect(t2.totalTiles).toBe(3); // skirting for the room
    expect(t2.boxes).toBe(1); // ceil(3/10)
  });
```

- [ ] **Step 2: Run to verify it fails.**

Run: `npm run test -- src/lib/spaces/tiles.test.ts`
Expected: FAIL — current rollup ignores skirting; only one total (t1) is returned.

- [ ] **Step 3: Implement.** Replace `rollupTileTotals` in `src/lib/spaces/tiles.ts` (keep the `TileOptionTotal` interface):

```ts
/** Purchase totals per tile option across all spaces that use it. */
export function rollupTileTotals(
  spaces: Space[],
  tileOptions: SpaceTileOption[],
  mode: MeasureMode = "best"
): TileOptionTotal[] {
  const byId = new Map(tileOptions.map((t) => [t.id, t]));
  const totals = new Map<string, TileOptionTotal>();

  const bump = (optionId: string, tiles: number) => {
    if (tiles <= 0) return;
    const acc = totals.get(optionId) ?? {
      tileOptionId: optionId,
      totalTiles: 0,
      boxes: null,
      price: null,
      spaceCount: 0,
    };
    acc.totalTiles += tiles;
    totals.set(optionId, acc);
  };

  for (const space of spaces) {
    if (!space.tile_option_id) continue;
    const tile = byId.get(space.tile_option_id);
    if (!tile) continue;
    const layout = space.tile_layout ?? {};
    const skirtingTile = layout.skirting_tile_option_id
      ? byId.get(layout.skirting_tile_option_id) ?? null
      : null;
    const result = computeTileLayout(space, tile, mode, skirtingTile);
    if (!result) continue;
    bump(tile.id, result.totalTiles);
    totals.get(tile.id)!.spaceCount += 1;
    if (result.skirtingIsSeparate && result.skirtingTileOptionId) {
      bump(result.skirtingTileOptionId, result.skirtingTotalTiles);
    }
  }

  // Boxes/price from the aggregated tile count — buying happens per option.
  for (const acc of totals.values()) {
    const tile = byId.get(acc.tileOptionId)!;
    acc.boxes =
      tile.tiles_per_box && tile.tiles_per_box > 0
        ? Math.ceil(acc.totalTiles / tile.tiles_per_box)
        : null;
    acc.price =
      acc.boxes !== null && tile.price_per_box
        ? acc.boxes * tile.price_per_box
        : null;
  }
  return [...totals.values()];
}
```

- [ ] **Step 4: Run to verify it passes.**

Run: `npm run test -- src/lib/spaces/tiles.test.ts`
Expected: PASS — new case plus the two existing rollup cases (aggregates to 50/13/2; skips no-tile/unknown).

- [ ] **Step 5: Commit.**

```bash
git add src/lib/spaces/tiles.ts src/lib/spaces/tiles.test.ts
git commit -m "feat(spaces): rollupTileTotals splits floor vs contrast-skirting purchases"
```

---

### Task 3: Extract `ZoomableImage` from `ImageZoomDialog`

**Files:**
- Create: `src/components/common/ZoomableImage.tsx`
- Modify: `src/components/common/ImageZoomDialog.tsx` (consume the new component)
- Test: `src/components/common/ImageZoomDialog.test.tsx` (must stay green unchanged)

**Interfaces:**
- Produces: `ZoomableImage({ src, alt?, showButtons?, showHint? }: { src: string; alt?: string; showButtons?: boolean; showHint?: boolean })` — a self-contained zoom/pan image (loading spinner, error fallback with "Open in new tab", `TransformWrapper` wheel/pinch/drag/double-tap-reset, optional on-screen zoom buttons and mobile hint). Consumed by `ImageZoomDialog` (Task 3) and `FloorPlanViewer` (Task 4).

- [ ] **Step 1: Create `ZoomableImage`.** Write `src/components/common/ZoomableImage.tsx`:

```tsx
"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Fade,
  IconButton,
  Typography,
  alpha,
  useTheme,
} from "@mui/material";
import {
  FitScreen as FitScreenIcon,
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
} from "@mui/icons-material";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";

export interface ZoomableImageProps {
  src: string;
  alt?: string;
  /** On-screen +/−/reset buttons (desktop). Default true. */
  showButtons?: boolean;
  /** "Pinch to zoom" caption (mobile). Default false. */
  showHint?: boolean;
}

/**
 * Self-contained zoom/pan image: drag-to-pan, wheel zoom (desktop), pinch
 * (mobile), double-click/tap reset. Extracted from ImageZoomDialog so the
 * floor-plan viewer reuses the exact same behaviour.
 */
export default function ZoomableImage({
  src,
  alt = "Image",
  showButtons = true,
  showHint = false,
}: ZoomableImageProps) {
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
  }, [src]);

  const handleOpenInNewTab = useCallback(() => {
    if (src) window.open(src, "_blank");
  }, [src]);

  if (error) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, p: 4 }}>
        <Typography color="error">Failed to load image</Typography>
        <Button variant="outlined" onClick={handleOpenInNewTab}>
          Open in new tab
        </Button>
      </Box>
    );
  }

  return (
    <>
      {loading && (
        <Box sx={{ position: "absolute", zIndex: 5 }}>
          <CircularProgress size={40} />
        </Box>
      )}
      <TransformWrapper
        initialScale={1}
        minScale={0.5}
        maxScale={6}
        centerOnInit
        wheel={{ step: 0.15 }}
        pinch={{ step: 5 }}
        doubleClick={{ mode: "reset" }}
      >
        {({ zoomIn, zoomOut, resetTransform }) => (
          <>
            {showButtons && (
              <Box
                sx={{
                  position: "absolute",
                  bottom: 16,
                  left: "50%",
                  transform: "translateX(-50%)",
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  bgcolor: alpha(theme.palette.common.black, 0.7),
                  borderRadius: 2,
                  px: 2,
                  py: 1,
                  zIndex: 10,
                }}
              >
                <IconButton onClick={() => zoomOut()} size="small" sx={{ color: "white" }} aria-label="Zoom out">
                  <ZoomOutIcon />
                </IconButton>
                <IconButton onClick={() => resetTransform()} size="small" sx={{ color: "white" }} aria-label="Reset zoom">
                  <FitScreenIcon />
                </IconButton>
                <IconButton onClick={() => zoomIn()} size="small" sx={{ color: "white" }} aria-label="Zoom in">
                  <ZoomInIcon />
                </IconButton>
              </Box>
            )}

            {showHint && !loading && (
              <Typography
                variant="caption"
                sx={{
                  position: "absolute",
                  bottom: 8,
                  left: "50%",
                  transform: "translateX(-50%)",
                  bgcolor: alpha(theme.palette.common.black, 0.6),
                  color: "white",
                  px: 2,
                  py: 0.5,
                  borderRadius: 1,
                  zIndex: 10,
                }}
              >
                Pinch to zoom • double-tap to reset
              </Typography>
            )}

            <TransformComponent
              wrapperStyle={{ width: "100%", height: "100%" }}
              contentStyle={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Fade in={!loading} timeout={300}>
                <Box
                  component="img"
                  src={src}
                  alt={alt}
                  onLoad={() => setLoading(false)}
                  onError={() => {
                    setLoading(false);
                    setError(true);
                  }}
                  sx={{
                    maxWidth: "100%",
                    maxHeight: "100%",
                    objectFit: "contain",
                    borderRadius: 1,
                    boxShadow: theme.shadows[8],
                  }}
                />
              </Fade>
            </TransformComponent>
          </>
        )}
      </TransformWrapper>
    </>
  );
}
```

- [ ] **Step 2: Consume it in `ImageZoomDialog`.** In `src/components/common/ImageZoomDialog.tsx`, remove the internal `loading`/`error` state, the `handleOpenInNewTab`, and the whole `TransformWrapper`…`error ? … : (…)` block, replacing the `DialogContent` body with `ZoomableImage`. Keep the Dialog shell, `useMediaQuery`, the Escape-key handler, and the close button. The `DialogContent` becomes:

```tsx
      <DialogContent
        sx={{
          p: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
          bgcolor: theme.palette.mode === "dark" ? "grey.900" : "grey.200",
        }}
      >
        <ZoomableImage src={src} alt={label} showButtons={!isMobile} showHint={isMobile} />
      </DialogContent>
```

Add `import ZoomableImage from "./ZoomableImage";` and delete the now-unused imports (`TransformWrapper`, `TransformComponent`, `ZoomInIcon`, `ZoomOutIcon`, `FitScreenIcon`, `CircularProgress`, `Fade`, `Button`, `alpha`) and the `loading`/`error`/`handleOpenInNewTab` code. Keep `useState` only if still used elsewhere (it isn't after this — remove it); keep `useEffect` for the Escape handler. Leave `if (!src) return null;` in place.

- [ ] **Step 3: Run the existing dialog test.**

Run: `npm run test -- src/components/common/ImageZoomDialog.test.tsx`
Expected: PASS — the test mocks `react-zoom-pan-pinch`, renders with `isMobile=false` (jsdom `useMediaQuery` → false) so `showButtons` is true; it still finds the img by alt, the src, the zoom-in/zoom-out buttons, and the close button.

- [ ] **Step 4: Typecheck the touched files.**

Run: `npx tsc --noEmit`
Expected: no new errors in `ImageZoomDialog.tsx` / `ZoomableImage.tsx` (unused-import errors here mean Step 2 left a dangling import — remove it).

- [ ] **Step 5: Commit.**

```bash
git add src/components/common/ZoomableImage.tsx src/components/common/ImageZoomDialog.tsx
git commit -m "refactor(common): extract ZoomableImage from ImageZoomDialog"
```

---

### Task 4: Full-screen, plan-first `FloorPlanViewer`

**Files:**
- Modify: `src/components/spaces/FloorPlanViewer.tsx` (rework)

**Interfaces:**
- Consumes: `ZoomableImage` (Task 3); `isPdfRef` from `@/lib/spaces/floors`; `ReceiptCapture`; `ScopePhotoRef`.
- Produces: same props as today (`open, onClose, floorName, siteId, sectionId, plan, canEdit, onSetPlan, builtAreaSqft?, onSetBuiltArea?`). No caller change.

- [ ] **Step 1: Rework the component.** Replace `src/components/spaces/FloorPlanViewer.tsx` with a full-screen dialog: a slim top toolbar (floor name, Edit toggle for `canEdit`, close), the plan filling the body (`ZoomableImage` for images, native `<iframe>` for PDFs), and the Replace/built-up controls in a `Collapse` that the Edit toggle reveals:

```tsx
"use client";

import React, { useEffect, useState } from "react";
import {
  AppBar,
  Box,
  Collapse,
  Dialog,
  IconButton,
  Slide,
  Stack,
  TextField,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import type { TransitionProps } from "@mui/material/transitions";
import {
  Close as CloseIcon,
  EditOutlined as EditIcon,
  OpenInNew as OpenInNewIcon,
} from "@mui/icons-material";

import type { ScopePhotoRef } from "@/types/spaces.types";
import { isPdfRef } from "@/lib/spaces/floors";
import {
  ReceiptCapture,
  type ReceiptCaptureValue,
} from "@/components/common/ReceiptCapture";
import ZoomableImage from "@/components/common/ZoomableImage";

interface FloorPlanViewerProps {
  open: boolean;
  onClose: () => void;
  floorName: string;
  siteId: string;
  sectionId: string;
  plan: ScopePhotoRef | null;
  canEdit: boolean;
  onSetPlan: (plan: ScopePhotoRef) => void;
  /** Manually-entered built-up sqft (incl. walls) for this floor. */
  builtAreaSqft?: number | null;
  onSetBuiltArea?: (sqft: number | null) => void;
}

const SlideUp = React.forwardRef(function SlideUp(
  props: TransitionProps & { children: React.ReactElement },
  ref: React.Ref<unknown>
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

/** Full-screen, plan-first floor-plan viewer with zoom + an Edit panel. */
export default function FloorPlanViewer({
  open,
  onClose,
  floorName,
  siteId,
  sectionId,
  plan,
  canEdit,
  onSetPlan,
  builtAreaSqft = null,
  onSetBuiltArea,
}: FloorPlanViewerProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [editOpen, setEditOpen] = useState(false);
  const [areaText, setAreaText] = useState(
    builtAreaSqft !== null ? String(builtAreaSqft) : ""
  );

  useEffect(() => {
    if (open) {
      setAreaText(builtAreaSqft !== null ? String(builtAreaSqft) : "");
      setEditOpen(false);
    }
  }, [open, builtAreaSqft]);

  const commitArea = () => {
    if (!onSetBuiltArea) return;
    const n = Number(areaText);
    const next = areaText.trim() !== "" && Number.isFinite(n) && n > 0 ? n : null;
    if (next !== builtAreaSqft) onSetBuiltArea(next);
  };

  const handleChange = (v: ReceiptCaptureValue | null) => {
    if (!v) return;
    onSetPlan({ ...v, capturedAt: new Date().toISOString() });
  };

  const isPdf = plan ? isPdfRef(plan) : false;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen
      TransitionComponent={SlideUp}
      PaperProps={{
        sx: { bgcolor: theme.palette.mode === "dark" ? "grey.900" : "grey.100" },
      }}
    >
      <AppBar position="relative" color="default" elevation={0} sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Toolbar variant="dense" sx={{ gap: 1 }}>
          <Typography variant="subtitle1" fontWeight={600} noWrap sx={{ flex: 1 }}>
            {floorName} — floor plan
          </Typography>
          {isPdf && plan && (
            <IconButton
              size="small"
              aria-label="open pdf in new tab"
              component="a"
              href={plan.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <OpenInNewIcon fontSize="small" />
            </IconButton>
          )}
          {canEdit && (
            <IconButton
              size="small"
              aria-label={editOpen ? "hide edit" : "edit plan"}
              color={editOpen ? "primary" : "default"}
              onClick={() => setEditOpen((v) => !v)}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          )}
          <IconButton size="small" aria-label="close" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Box
        sx={{
          flex: 1,
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          minHeight: 0,
        }}
      >
        {plan ? (
          isPdf ? (
            <Box
              component="iframe"
              src={`${plan.url}#toolbar=1&view=FitH`}
              title={`${floorName} floor plan (PDF)`}
              sx={{ width: "100%", height: "100%", border: 0, bgcolor: "grey.50" }}
            />
          ) : (
            <ZoomableImage
              src={plan.url}
              alt={`${floorName} floor plan`}
              showButtons={!isMobile}
              showHint={isMobile}
            />
          )
        ) : (
          <Typography variant="body2" color="text.secondary">
            No floor plan attached yet.{canEdit ? " Tap the edit icon to add one." : ""}
          </Typography>
        )}
      </Box>

      {canEdit && (
        <Collapse in={editOpen}>
          <Box sx={{ p: 2, borderTop: 1, borderColor: "divider" }}>
            <Stack spacing={2}>
              <ReceiptCapture
                label={plan ? "Replace plan" : "Attach floor plan (image or PDF)"}
                value={null}
                onChange={handleChange}
                folder={`${siteId}/floor-plans/${sectionId}`}
                bucket="space-photos"
                accept="image/*,application/pdf"
              />
              {onSetBuiltArea && (
                <TextField
                  label="Built-up area (sqft)"
                  value={areaText}
                  onChange={(e) => setAreaText(e.target.value)}
                  onBlur={commitArea}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                  size="small"
                  helperText="Incl. wall thickness — the basis for civil/electrical per-sqft contracts."
                  inputProps={{ inputMode: "decimal" }}
                  sx={{ maxWidth: 320 }}
                />
              )}
            </Stack>
          </Box>
        </Collapse>
      )}
    </Dialog>
  );
}
```

- [ ] **Step 2: Typecheck.**

Run: `npx tsc --noEmit`
Expected: no new errors in `FloorPlanViewer.tsx`.

- [ ] **Step 3: Manual/Playwright smoke (deferred to the Verify task).** No unit test — this is verified end-to-end in the final Verify task (open a PDF plan → full-screen native viewer; open an image plan → wheel/pinch zoom; Edit toggle reveals Replace + built-up).

- [ ] **Step 4: Commit.**

```bash
git add src/components/spaces/FloorPlanViewer.tsx
git commit -m "feat(spaces): full-screen plan-first floor-plan viewer with zoom + Edit panel"
```

---

### Task 5: `useBulkSetSpaceTile` hook

**Files:**
- Modify: `src/hooks/queries/useSpaces.ts` (add hook after `useUpdateSpace`)

**Interfaces:**
- Consumes: `createClient`, `ensureFreshSession`, `useInvalidateSpaces`, `Space`.
- Produces: `useBulkSetSpaceTile()` → mutation with `mutateAsync({ siteId: string; ids: string[]; tileOptionId: string })`.

- [ ] **Step 1: Add the hook.** Insert into `src/hooks/queries/useSpaces.ts` immediately after `useUpdateSpace` (before `useDeleteSpace`):

```ts
/** Assign one floor tile to many spaces at once ("apply to all / unassigned"). */
export function useBulkSetSpaceTile() {
  const supabase = createClient() as SupabaseAny;
  const invalidate = useInvalidateSpaces();

  return useMutation({
    mutationFn: async ({
      siteId,
      ids,
      tileOptionId,
    }: {
      siteId: string;
      ids: string[];
      tileOptionId: string;
    }) => {
      if (ids.length === 0) return [] as Space[];
      await ensureFreshSession();
      const { data, error } = await supabase
        .from("spaces")
        .update({ tile_option_id: tileOptionId })
        .eq("site_id", siteId)
        .in("id", ids)
        .select();
      if (error) throw error;
      return (data ?? []) as Space[];
    },
    onSuccess: (_, { siteId }) => invalidate(siteId),
  });
}
```

- [ ] **Step 2: Typecheck.**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit.**

```bash
git add src/hooks/queries/useSpaces.ts
git commit -m "feat(spaces): useBulkSetSpaceTile for quick tile apply"
```

---

### Task 6: `SpaceTilePanel` — skirting source (same / separate / none) + piece count

**Files:**
- Modify: `src/components/spaces/SpaceTilePanel.tsx`

**Interfaces:**
- Consumes: `computeTileLayout` (Task 1), `SpaceTileOption`, `TileLayout`; existing props unchanged.
- Produces: resolves the contrast skirting tile from `tileOptions` and passes it to `computeTileLayout`; writes `tile_layout.skirting_tile_option_id` / `skirting_from_same_tile`; seeds same-tile skirting on floor-tile selection; renders the skirting source control + pieces/tiles line and passes `skirtingTile` to `SpaceTileLayoutView` (Task 8).

- [ ] **Step 1: Resolve the skirting tile and default-on selection.** In `SpaceTilePanel.tsx`, after `const tile = tileOptions.find(...)`, add the skirting-tile lookup and pass it into `computeTileLayout`:

```tsx
  const layout: TileLayout = space.tile_layout ?? {};
  const tile = tileOptions.find((t) => t.id === space.tile_option_id) ?? null;
  const skirtingTile = layout.skirting_tile_option_id
    ? tileOptions.find((t) => t.id === layout.skirting_tile_option_id) ?? null
    : null;
  const result = tile ? computeTileLayout(space, tile, mode, skirtingTile) : null;
  const dims = resolveDims(space, mode);
```

Change `handleTileChange` so picking a real floor tile seeds same-tile skirting (so a count shows immediately) without clobbering an existing skirting choice — a single `onUpdate` write:

```tsx
  const handleTileChange = (value: string) => {
    if (value === MANAGE) {
      onManageTileOptions();
      return;
    }
    if (value === NONE) {
      onUpdate({ tile_option_id: null });
      return;
    }
    const hasSkirtingChoice =
      layout.skirting_from_same_tile !== undefined ||
      layout.skirting_tile_option_id != null;
    onUpdate({
      tile_option_id: value,
      tile_layout: hasSkirtingChoice
        ? layout
        : { ...layout, skirting_from_same_tile: true },
    });
  };
```

- [ ] **Step 2: Replace the "Skirting cut from this tile" switch with a source selector.** Swap the `<FormControlLabel><Switch …skirting_from_same_tile… /></FormControlLabel>` block for a compact select. Compute the current mode and handler near the top of the render body:

```tsx
  const skirtingMode: "same" | "separate" | "none" = layout.skirting_tile_option_id
    ? "separate"
    : layout.skirting_from_same_tile
      ? "same"
      : "none";

  const setSkirtingMode = (m: "same" | "separate" | "none") => {
    if (m === "same") saveLayout({ ...layout, skirting_from_same_tile: true, skirting_tile_option_id: null });
    else if (m === "none") saveLayout({ ...layout, skirting_from_same_tile: false, skirting_tile_option_id: null });
    else saveLayout({ ...layout, skirting_from_same_tile: false, skirting_tile_option_id: skirtingTile?.id ?? tileOptions[0]?.id ?? null });
  };
```

Replace the `FormControlLabel`/`Switch` JSX (inside the `canEdit` controls `Stack`) with:

```tsx
                <TextField
                  select
                  label="Skirting"
                  size="small"
                  value={skirtingMode}
                  onChange={(e) => setSkirtingMode(e.target.value as "same" | "separate" | "none")}
                  sx={{ minWidth: 150 }}
                >
                  <MenuItem value="same">Cut from floor tile</MenuItem>
                  <MenuItem value="separate">Separate tile</MenuItem>
                  <MenuItem value="none">Running feet only</MenuItem>
                </TextField>
                {skirtingMode === "separate" && (
                  <TextField
                    select
                    label="Skirting tile"
                    size="small"
                    value={layout.skirting_tile_option_id ?? ""}
                    onChange={(e) =>
                      saveLayout({ ...layout, skirting_tile_option_id: e.target.value || null })
                    }
                    sx={{ minWidth: 170 }}
                  >
                    {tileOptions.map((t) => (
                      <MenuItem key={t.id} value={t.id}>
                        {t.label}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
```

- [ ] **Step 3: Show the skirting pieces/tiles in the count line.** Replace the skirting fragment inside the summary `<Typography>` (the `result.skirtingTiles > 0 && (…)` part) so it reads pieces and, for a separate tile, its own boxes/₹:

```tsx
              {result.skirtingPieces > 0 && (
                <>
                  {" · skirting "}
                  <strong>{result.skirtingPieces}</strong> pcs
                  {result.skirtingIsSeparate ? (
                    <>
                      {" → "}
                      <strong>{result.skirtingTotalTiles}</strong> tiles
                      {result.skirtingBoxes !== null && <> ≈ {result.skirtingBoxes} box</>}
                      {result.skirtingPrice !== null && <> · ₹{result.skirtingPrice.toLocaleString("en-IN")}</>}
                    </>
                  ) : (
                    <> ({result.skirtingTiles} tiles, same tile)</>
                  )}
                </>
              )}
```

(Leave the floor `full + cut − excluded = tilesNeeded` and `+ wastage → totalTiles ≈ boxes · ₹` parts as-is; the separate-skirting case no longer folds skirting into `totalTiles`, which the math already handles.)

- [ ] **Step 4: Pass the skirting tile to the layout view.** Update the `<SpaceTileLayoutView … />` usage to add `skirtingTile={skirtingTile}` and `stripIn={layout.skirting_strip_in ?? 4}` (props added in Task 8):

```tsx
            <SpaceTileLayoutView
              roomXIn={dims.lengthIn}
              roomYIn={dims.widthIn}
              tile={tile}
              layout={layout}
              result={result}
              canEdit={canEdit}
              selectedExclusionId={selectedExclusionId}
              onSelectExclusion={setSelectedExclusionId}
              onMoveExclusion={handleMoveZone}
              skirtingTile={skirtingTile}
              stripIn={layout.skirting_strip_in ?? 4}
            />
```

Remove the now-unused `FormControlLabel` and `Switch` imports if nothing else uses them (they aren't). Keep `MenuItem` (already imported).

- [ ] **Step 5: Typecheck.**

Run: `npx tsc --noEmit`
Expected: `SpaceTileLayoutView` prop errors are expected until Task 8 adds the props — if running Task 6 standalone, add the props in Task 8 before typechecking passes. Otherwise no errors.

- [ ] **Step 6: Commit.**

```bash
git add src/components/spaces/SpaceTilePanel.tsx
git commit -m "feat(spaces): skirting source selector (same/separate/none) + piece count"
```

---

### Task 7: Tile count on the space summary row

**Files:**
- Modify: `src/components/spaces/SpaceRow.tsx` (add `tileOptions` prop + Tiles cell + skirting pieces)
- Modify: `src/app/(main)/site/spaces/page.tsx` (pass `tileOptions` to `SpaceRow`)

**Interfaces:**
- Consumes: `computeTileLayout` (Task 1), `SpaceTileOption`.
- Produces: `SpaceRow` gains `tileOptions: SpaceTileOption[]`.

- [ ] **Step 1: Add the prop + compute the tile result.** In `SpaceRow.tsx`, extend imports and props, and compute the tile result:

```tsx
import type { MeasureMode, Space, SpaceTileOption } from "@/types/spaces.types";
import {
  computeQuantities,
  formatFeetInches,
  spaceStatus,
} from "@/lib/spaces/measurements";
import { computeTileLayout } from "@/lib/spaces/tiles";
import SpaceStatusChip from "./SpaceStatusChip";

interface SpaceRowProps {
  space: Space;
  mode: MeasureMode;
  tileOptions: SpaceTileOption[];
  expanded: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}
```

In the component body, after `const q = computeQuantities(space, mode);`:

```tsx
  const q = computeQuantities(space, mode);
  const status = spaceStatus(space);
  const tile = space.tile_option_id
    ? tileOptions.find((t) => t.id === space.tile_option_id) ?? null
    : null;
  const skirtingTile = space.tile_layout?.skirting_tile_option_id
    ? tileOptions.find((t) => t.id === space.tile_layout.skirting_tile_option_id) ?? null
    : null;
  const tileResult = tile ? computeTileLayout(space, tile, mode, skirtingTile) : null;
```

- [ ] **Step 2: Render the Tiles cell + skirting pieces.** In the desktop quantity `Stack`, annotate skirting and add a Tiles cell after the Skirting cell:

```tsx
          <QuantityCell label="Floor" value={q.floorTileSqft} unit="sqft" />
          <QuantityCell
            label="Skirting"
            value={q.skirtingRft}
            unit="rft"
            sub={tileResult && tileResult.skirtingPieces > 0 ? `${tileResult.skirtingPieces} pc` : undefined}
          />
          {tileResult && (
            <QuantityCell label="Tiles" value={tileResult.totalTiles} unit={tileResult.boxes !== null ? `· ${tileResult.boxes} box` : "tiles"} />
          )}
          {space.wall_tile_enabled && (
            <QuantityCell label="Wall" value={q.wallTileSqft} unit="sqft" />
          )}
          {q.graniteSqft > 0 && (
            <QuantityCell label="Granite" value={q.graniteSqft} unit="sqft" />
          )}
```

Extend `QuantityCell` to accept an optional `sub` line:

```tsx
function QuantityCell({
  label,
  value,
  unit,
  sub,
}: {
  label: string;
  value: number;
  unit: string;
  sub?: string;
}) {
  return (
    <Box sx={{ textAlign: "right", minWidth: 64 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {value}
        <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.25 }}>
          {unit}
        </Typography>
      </Typography>
      {sub && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1 }}>
          {sub}
        </Typography>
      )}
    </Box>
  );
}
```

- [ ] **Step 3: Pass `tileOptions` from the page.** In `src/app/(main)/site/spaces/page.tsx`, the `<SpaceRow …>` usage adds `tileOptions={tileOptions}` (the page already has `tileOptions` from `useTileOptions`):

```tsx
                  <SpaceRow
                    key={space.id}
                    space={space}
                    mode={mode}
                    tileOptions={tileOptions}
                    expanded={!isMobile && expandedId === space.id}
                    onToggle={() =>
                      isMobile
                        ? setSheetSpaceId(space.id)
                        : setExpandedId((id) => (id === space.id ? null : space.id))
                    }
                  >
```

- [ ] **Step 4: Typecheck.**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit.**

```bash
git add src/components/spaces/SpaceRow.tsx "src/app/(main)/site/spaces/page.tsx"
git commit -m "feat(spaces): tile count + skirting pieces on the space row"
```

---

### Task 8: Dark skirting band in the 2D layout view

**Files:**
- Modify: `src/components/spaces/SpaceTileLayoutView.tsx` (add `skirtingTile`, `stripIn` props + perimeter band)

**Interfaces:**
- Consumes: `SpaceTileOption`.
- Produces: `SpaceTileLayoutView` gains `skirtingTile?: SpaceTileOption | null` and `stripIn?: number`; renders a dark perimeter band. Purely cosmetic — must not change any count.

- [ ] **Step 1: Add props.** Extend the interface and signature:

```tsx
interface SpaceTileLayoutViewProps {
  roomXIn: number;
  roomYIn: number;
  tile: SpaceTileOption;
  layout: TileLayout;
  result: TileLayoutResult;
  canEdit: boolean;
  selectedExclusionId: string | null;
  onSelectExclusion: (id: string | null) => void;
  onMoveExclusion: (id: string, xIn: number, yIn: number) => void;
  /** Contrast skirting tile — draws a dark perimeter band when set. */
  skirtingTile?: SpaceTileOption | null;
  /** Skirting strip height, inches (band width). Default 4. */
  stripIn?: number;
}
```

Add `skirtingTile = null, stripIn = 4,` to the destructured params.

- [ ] **Step 2: Render the band.** Inside the `<Box component="svg" …>`, after the tile cells `map` and before the cut-tile markers, insert a perimeter ring drawn as four rects. When `skirtingTile?.photo` exists, fill from a second pattern; else a dark fill. Band width in room coords = `Math.min(stripIn, roomXIn / 2, roomYIn / 2)`:

```tsx
        {skirtingTile && (() => {
          const b = Math.min(stripIn, roomXIn / 2, roomYIn / 2);
          const skirtId = `skirt-img-${skirtingTile.id}`;
          const fill = skirtingTile.photo ? `url(#${skirtId})` : "#37474f";
          return (
            <g pointerEvents="none">
              {skirtingTile.photo && (
                <defs>
                  <pattern
                    id={skirtId}
                    width={skirtingTile.tile_width_in}
                    height={skirtingTile.tile_height_in}
                    patternUnits="userSpaceOnUse"
                  >
                    <image
                      href={skirtingTile.photo.url}
                      width={skirtingTile.tile_width_in}
                      height={skirtingTile.tile_height_in}
                      preserveAspectRatio="xMidYMid slice"
                    />
                  </pattern>
                </defs>
              )}
              <rect x={0} y={0} width={roomXIn} height={b} fill={fill} fillOpacity={0.85} />
              <rect x={0} y={roomYIn - b} width={roomXIn} height={b} fill={fill} fillOpacity={0.85} />
              <rect x={0} y={0} width={b} height={roomYIn} fill={fill} fillOpacity={0.85} />
              <rect x={roomXIn - b} y={0} width={b} height={roomYIn} fill={fill} fillOpacity={0.85} />
            </g>
          );
        })()}
```

- [ ] **Step 3: Note the band in the caption.** Append to the caption `<Typography>` (after the grid text), when a band shows:

```tsx
        {skirtingTile && <> · dark skirting band</>}
```

- [ ] **Step 4: Typecheck.**

Run: `npx tsc --noEmit`
Expected: no new errors (Task 6's `SpaceTileLayoutView` usage now type-matches).

- [ ] **Step 5: Commit.**

```bash
git add src/components/spaces/SpaceTileLayoutView.tsx
git commit -m "feat(spaces): dark skirting perimeter band in the 2D tile view"
```

---

### Task 9: "Tiles to buy" purchase summary + WhatsApp lines

**Files:**
- Create: `src/lib/spaces/tiles.ts` helper `formatTileTotalsForWhatsApp` (append to existing file)
- Create: `src/components/spaces/TilePurchaseSummary.tsx`
- Modify: `src/components/spaces/SpacesTotalsStrip.tsx` (accept `extraCopyLines`)
- Modify: `src/app/(main)/site/spaces/page.tsx` (compute tile totals; render summary; pass copy lines)
- Test: `src/lib/spaces/tiles.test.ts` (one case for the formatter)

**Interfaces:**
- Consumes: `rollupTileTotals` (Task 2), `TileOptionTotal`, `SpaceTileOption`.
- Produces: `formatTileTotalsForWhatsApp(totals: TileOptionTotal[], tileOptions: SpaceTileOption[]): string[]`; `TilePurchaseSummary` component; `SpacesTotalsStrip` gains `extraCopyLines?: string[]`.

- [ ] **Step 1: Write the failing formatter test.** Append to `src/lib/spaces/tiles.test.ts`:

```ts
import { computeTileLayout, formatTileTotalsForWhatsApp, rollupTileTotals } from "./tiles";

describe("formatTileTotalsForWhatsApp", () => {
  it("lists one line per tile option with boxes and price", () => {
    const tile = makeTile();
    const a = makeSpace({ tile_layout: { wastage_pct: 0 } }); // 25 tiles
    const lines = formatTileTotalsForWhatsApp(
      rollupTileTotals([a], [tile]),
      [tile]
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("2×2 Ivory");
    expect(lines[0]).toContain("25 tiles");
    expect(lines[0]).toContain("7 boxes");
  });
});
```

(Adjust the top-of-file import line to include `formatTileTotalsForWhatsApp` — replace the existing `import { computeTileLayout, rollupTileTotals } from "./tiles";`.)

- [ ] **Step 2: Run to verify it fails.**

Run: `npm run test -- src/lib/spaces/tiles.test.ts`
Expected: FAIL — `formatTileTotalsForWhatsApp` is not exported.

- [ ] **Step 3: Implement the formatter.** Append to `src/lib/spaces/tiles.ts`:

```ts
/** WhatsApp lines for the per-option tile purchase (one per option in use). */
export function formatTileTotalsForWhatsApp(
  totals: TileOptionTotal[],
  tileOptions: SpaceTileOption[]
): string[] {
  const byId = new Map(tileOptions.map((t) => [t.id, t]));
  return totals.map((t) => {
    const label = byId.get(t.tileOptionId)?.label ?? "Tile";
    const boxes = t.boxes !== null ? ` ≈ ${t.boxes} boxes` : "";
    const price = t.price !== null ? ` · ₹${t.price.toLocaleString("en-IN")}` : "";
    return `${label}: ${t.totalTiles} tiles${boxes}${price}`;
  });
}
```

- [ ] **Step 4: Run to verify it passes.**

Run: `npm run test -- src/lib/spaces/tiles.test.ts`
Expected: PASS.

- [ ] **Step 5: Create the summary component.** Write `src/components/spaces/TilePurchaseSummary.tsx`:

```tsx
"use client";

import React from "react";
import { Box, Paper, Stack, Typography } from "@mui/material";
import { GridOn as TileIcon } from "@mui/icons-material";

import type { SpaceTileOption } from "@/types/spaces.types";
import type { TileOptionTotal } from "@/lib/spaces/tiles";

interface TilePurchaseSummaryProps {
  totals: TileOptionTotal[];
  tileOptions: SpaceTileOption[];
}

/** Per-tile-option purchase totals (floor + contrast skirting split). */
export default function TilePurchaseSummary({ totals, tileOptions }: TilePurchaseSummaryProps) {
  if (totals.length === 0) return null;
  const byId = new Map(tileOptions.map((t) => [t.id, t]));

  return (
    <Paper variant="outlined" sx={{ px: { xs: 1.5, sm: 2 }, py: 1.25, mt: 1 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        <TileIcon fontSize="small" color="action" />
        <Typography variant="subtitle2">Tiles to buy</Typography>
      </Stack>
      <Stack spacing={0.5}>
        {totals.map((t) => {
          const opt = byId.get(t.tileOptionId);
          return (
            <Box
              key={t.tileOptionId}
              sx={{ display: "flex", justifyContent: "space-between", gap: 2, fontVariantNumeric: "tabular-nums" }}
            >
              <Typography variant="body2" noWrap>
                {opt?.label ?? "Tile"}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t.totalTiles} tiles
                {t.boxes !== null && ` ≈ ${t.boxes} box`}
                {t.price !== null && ` · ₹${t.price.toLocaleString("en-IN")}`}
              </Typography>
            </Box>
          );
        })}
      </Stack>
    </Paper>
  );
}
```

- [ ] **Step 6: Accept `extraCopyLines` in the totals strip.** In `src/components/spaces/SpacesTotalsStrip.tsx`, add the prop and append to the copied text:

```tsx
interface SpacesTotalsStripProps {
  totals: SpacesTotals;
  mode: MeasureMode;
  onModeChange: (mode: MeasureMode) => void;
  siteName: string;
  sectionNames: Map<string | null, string>;
  builtUpBySection?: Map<string, number>;
  /** Extra lines (tile purchases) appended to the WhatsApp copy. */
  extraCopyLines?: string[];
}
```

Destructure `extraCopyLines = []` and change `handleCopy`'s `writeText` argument to:

```tsx
      const base = formatTotalsForWhatsApp(totals, siteName, mode, sectionNames, builtUpBySection);
      await navigator.clipboard.writeText(
        extraCopyLines.length ? `${base}\n\nTiles to buy:\n${extraCopyLines.join("\n")}` : base
      );
```

- [ ] **Step 7: Wire the page.** In `src/app/(main)/site/spaces/page.tsx`, import the helper, component, and compute totals:

```tsx
import { rollupTotals } from "@/lib/spaces/measurements";
import { formatTileTotalsForWhatsApp, rollupTileTotals } from "@/lib/spaces/tiles";
import TilePurchaseSummary from "@/components/spaces/TilePurchaseSummary";
```

Add memoized tile totals after the existing `totals` memo:

```tsx
  const tileTotals = useMemo(
    () => rollupTileTotals(spaces, tileOptions, mode),
    [spaces, tileOptions, mode]
  );
  const tileCopyLines = useMemo(
    () => formatTileTotalsForWhatsApp(tileTotals, tileOptions),
    [tileTotals, tileOptions]
  );
```

Pass `extraCopyLines={tileCopyLines}` to `<SpacesTotalsStrip … />`, and render the summary right below it:

```tsx
      <SpacesTotalsStrip
        totals={totals}
        mode={mode}
        onModeChange={setMode}
        siteName={selectedSite.name}
        sectionNames={sectionNames}
        builtUpBySection={builtUpBySection}
        extraCopyLines={tileCopyLines}
      />
      <TilePurchaseSummary totals={tileTotals} tileOptions={tileOptions} />
```

- [ ] **Step 8: Typecheck + run tests.**

Run: `npx tsc --noEmit && npm run test -- src/lib/spaces/tiles.test.ts`
Expected: no new type errors; tiles tests PASS.

- [ ] **Step 9: Commit.**

```bash
git add src/lib/spaces/tiles.ts src/lib/spaces/tiles.test.ts src/components/spaces/TilePurchaseSummary.tsx src/components/spaces/SpacesTotalsStrip.tsx "src/app/(main)/site/spaces/page.tsx"
git commit -m "feat(spaces): tiles-to-buy purchase summary + WhatsApp lines"
```

---

### Task 10: Quick-apply a tile to all / unassigned spaces

**Files:**
- Modify: `src/components/spaces/TileOptionsManager.tsx` (add per-option apply actions + `spaces` prop)
- Modify: `src/app/(main)/site/spaces/page.tsx` (pass `spaces` to `TileOptionsManager`)

**Interfaces:**
- Consumes: `useBulkSetSpaceTile` (Task 5), `Space`, `SpaceTileOption`.
- Produces: `TileOptionsManager` gains `spaces: Space[]`.

- [ ] **Step 1: Add the prop + bulk hook.** In `TileOptionsManager.tsx`, extend the imports and props:

```tsx
import type { ScopePhotoRef, Space, SpaceTileOption } from "@/types/spaces.types";
import {
  useBulkSetSpaceTile,
  useCreateTileOption,
  useDeleteTileOption,
  useTileOptions,
  useUpdateTileOption,
} from "@/hooks/queries/useSpaces";
```

```tsx
interface TileOptionsManagerProps {
  open: boolean;
  onClose: () => void;
  siteId: string;
  canEdit: boolean;
  spaces: Space[];
}
```

Destructure `spaces`, and add the hook + handler in the component body:

```tsx
  const bulkSetTile = useBulkSetSpaceTile();

  const applyTile = (option: SpaceTileOption, scope: "all" | "unassigned") => {
    const target =
      scope === "unassigned"
        ? spaces.filter((s) => !s.tile_option_id)
        : spaces;
    const ids = target.map((s) => s.id);
    if (ids.length === 0) {
      window.alert(scope === "unassigned" ? "No unassigned spaces." : "No spaces yet.");
      return;
    }
    const differing =
      scope === "all"
        ? spaces.filter((s) => s.tile_option_id && s.tile_option_id !== option.id).length
        : 0;
    if (
      differing > 0 &&
      !window.confirm(
        `Set "${option.label}" as the floor tile on all ${ids.length} spaces? ${differing} already use a different tile and will be overwritten.`
      )
    ) {
      return;
    }
    bulkSetTile.mutate({ siteId, ids, tileOptionId: option.id });
  };
```

- [ ] **Step 2: Add apply buttons per option.** In the option `List`, add a second line of actions under each `ListItem` — the simplest is to render small buttons in the `ListItemText` secondary. To avoid HTML-nesting issues, give `ListItemText` `secondaryTypographyProps={{ component: "div" }}` and put the buttons in a `Box`:

```tsx
                  <ListItemText
                    primary={o.label}
                    secondaryTypographyProps={{ component: "div" }}
                    secondary={
                      <Box>
                        {`${formatFeetInches(o.tile_width_in)} × ${formatFeetInches(o.tile_height_in)}` +
                          (o.tiles_per_box ? ` · ${o.tiles_per_box}/box` : "") +
                          (o.price_per_box ? ` · ₹${o.price_per_box}/box` : "")}
                        {canEdit && (
                          <Box sx={{ mt: 0.5, display: "flex", gap: 1 }}>
                            <Button size="small" onClick={() => applyTile(o, "unassigned")}>
                              Apply to unassigned
                            </Button>
                            <Button size="small" onClick={() => applyTile(o, "all")}>
                              Apply to all
                            </Button>
                          </Box>
                        )}
                      </Box>
                    }
                  />
```

- [ ] **Step 3: Pass `spaces` from the page.** In `page.tsx`, update the `<TileOptionsManager …>` usage:

```tsx
      <TileOptionsManager
        open={tilesOpen}
        onClose={() => setTilesOpen(false)}
        siteId={siteId}
        canEdit={canEdit}
        spaces={spaces}
      />
```

- [ ] **Step 4: Typecheck.**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit.**

```bash
git add src/components/spaces/TileOptionsManager.tsx "src/app/(main)/site/spaces/page.tsx"
git commit -m "feat(spaces): quick-apply a tile to all / unassigned spaces"
```

---

### Task 11: Full verification (build, unit, Playwright)

**Files:** none (verification only)

- [ ] **Step 1: Full unit suite.**

Run: `npm run test`
Expected: PASS — all spaces lib tests (tiles incl. new cases, floors, naming, measurements, importSpaces) and `ImageZoomDialog.test.tsx` green.

- [ ] **Step 2: Production build.** Stop any dev server first (per CLAUDE.md / memory — a live `:3000` corrupts `.next`).

Run: `npm run build`
Expected: build succeeds, no type errors; `/site/spaces` route compiles.

- [ ] **Step 3: Playwright E2E** (dev:cloud → `/dev-login` → `/site/spaces`, per CLAUDE.md "After UI Changes"):
  1. Open a floor with a **PDF** plan → viewer is full-screen, plan fills the screen; the Edit icon reveals Replace + built-up; "open in new tab" works; close returns.
  2. Open a floor with an **image** plan → drag-pan, mouse-wheel zoom, double-click reset, zoom buttons all work; mobile viewport shows the pinch hint.
  3. On a space, pick a floor tile → the row shows **Tiles N · M box** and Skirting shows **`… rft` + `N pc`**; the tile panel shows the pieces line.
  4. In the tile panel, set Skirting → **Separate tile** → pick a dark tile → the 2D view shows a **dark perimeter band**; the count line shows skirting pieces → tiles ≈ boxes · ₹; the "Tiles to buy" summary lists **two** lines (floor + skirting).
  5. Open **Tiles** dialog → **Apply to unassigned** populates rows; **Apply to all** confirms before overwriting; counts update.
  6. Copy totals → clipboard text includes the "Tiles to buy:" lines.
  7. Console clean (no errors/warnings); `playwright_close`.

- [ ] **Step 4: Final commit if any fixes were needed during verification.**

```bash
git add -A
git commit -m "fix(spaces): verification fixes for plan viewer + tile counts"
```

---

## Self-Review

**Spec coverage:**
- Full-screen plan-first viewer → Task 4. Image zoom via existing stack → Tasks 3-4. PDF native full-screen → Task 4. Edit controls tucked away → Task 4. ✓
- Per-space tile count on the row → Task 7. Skirting piece count → Tasks 1, 6, 7. ✓
- Skirting from floor tile OR separate contrast tile, each counted/priced → Tasks 1-2, 6. ✓
- Dark skirting band in 2D view → Task 8. ✓
- Totals strip per-option split + WhatsApp → Tasks 2, 9. ✓
- Quick-apply to all/unassigned → Tasks 5, 10. ✓
- No migration; JSONB field only → Task 1. ✓
- Green build + tests → Task 11 (and per-task typechecks). ✓

**Placeholder scan:** No TBD/TODO; every code step shows the code. Verification E2E steps reference concrete UI states, not "test the above."

**Type consistency:** `computeTileLayout(space, tile, mode, skirtingTile)` used identically in Tasks 1, 2, 6, 7. New result fields (`skirtingPieces`, `skirtingIsSeparate`, `skirtingTotalTiles`, `skirtingBoxes`, `skirtingPrice`, `skirtingTileOptionId`) defined in Task 1 and consumed in Tasks 2, 6, 7, 9. `useBulkSetSpaceTile({siteId, ids, tileOptionId})` defined in Task 5, called in Task 10. `SpaceRow` `tileOptions` prop (Task 7) passed from page (Task 7). `SpaceTileLayoutView` `skirtingTile`/`stripIn` props defined in Task 8, passed in Task 6 (note: run Task 8 before typechecking Task 6, or accept a transient type error). `formatTileTotalsForWhatsApp` defined in Task 9, used in Task 9 page wiring. `extraCopyLines` prop on `SpacesTotalsStrip` (Task 9). `TilePurchaseSummary`/`TileOptionsManager` `spaces` prop (Tasks 9-10). Consistent.

**Ordering note:** Tasks 6 and 8 are mutually referential (Task 6 passes props Task 8 defines). Execute Task 8 immediately after Task 6 (or together) so `npx tsc --noEmit` is clean before moving on.
