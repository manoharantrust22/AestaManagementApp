/**
 * Tile layout & purchase math for the Spaces register. A tile grid is laid
 * from the room's top-left corner over the best-known dimensions; edge
 * tiles are "cut" but still purchased whole; a cell is excluded only when
 * it sits FULLY inside a no-tile zone (partially covered cells are still
 * bought — matches how tilers buy). Skirting strips can be cut from the
 * same tile. Pure module: no I/O, no React.
 */

import type {
  MeasureMode,
  Space,
  SpaceTileOption,
  TileExclusion,
} from "@/types/spaces.types";
import { computeQuantities, resolveDims } from "./measurements";

export const DEFAULT_WASTAGE_PCT = 5;
export const DEFAULT_SKIRTING_STRIP_IN = 4;

export type TileCellKind = "full" | "cut" | "excluded";

export interface TileCell {
  col: number;
  row: number;
  /** Top-left of the cell in room coordinates, inches. */
  x_in: number;
  y_in: number;
  /** Covered region (clipped at the room edge) — for rendering. */
  w_in: number;
  h_in: number;
  kind: TileCellKind;
}

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

const cellInsideExclusion = (
  x: number,
  y: number,
  w: number,
  h: number,
  ex: TileExclusion
): boolean =>
  x >= ex.x_in &&
  y >= ex.y_in &&
  x + w <= ex.x_in + ex.w_in &&
  y + h <= ex.y_in + ex.h_in;

/**
 * Compute the tile grid and purchase quantities for a space with a chosen
 * tile. Returns null when the space has no usable dimensions.
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

  const sameTileSkirting =
    skirtingTileOptionId !== null && !skirtingIsSeparate ? skirtingTiles : 0;
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

export interface TileOptionTotal {
  tileOptionId: string;
  totalTiles: number;
  boxes: number | null;
  price: number | null;
  spaceCount: number;
}

/** Purchase totals per tile option across all spaces that use it. */
export function rollupTileTotals(
  spaces: Space[],
  tileOptions: SpaceTileOption[],
  mode: MeasureMode = "best"
): TileOptionTotal[] {
  const byId = new Map(tileOptions.map((t) => [t.id, t]));
  const totals = new Map<string, TileOptionTotal>();

  for (const space of spaces) {
    if (!space.tile_option_id) continue;
    const tile = byId.get(space.tile_option_id);
    if (!tile) continue;
    const result = computeTileLayout(space, tile, mode);
    if (!result) continue;
    const acc = totals.get(tile.id) ?? {
      tileOptionId: tile.id,
      totalTiles: 0,
      boxes: null,
      price: null,
      spaceCount: 0,
    };
    acc.totalTiles += result.totalTiles;
    acc.spaceCount += 1;
    totals.set(tile.id, acc);
  }

  // Boxes/price from the aggregated tile count — buying happens per option,
  // not per room.
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
