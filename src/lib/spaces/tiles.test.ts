import { describe, expect, it } from "vitest";

import type { Space, SpaceTileOption } from "@/types/spaces.types";
import { computeTileLayout, rollupTileTotals } from "./tiles";

const ft = (feet: number, inches = 0) => feet * 12 + inches;

function makeSpace(partial: Partial<Space> = {}): Space {
  return {
    id: "s1",
    site_id: "site1",
    section_id: "gf",
    mirrored_section_ids: [],
    name: "Kitchen",
    space_type: "kitchen",
    drawing_length_in: ft(9),
    drawing_width_in: ft(9),
    drawing_height_in: ft(10),
    verified_length_in: null,
    verified_width_in: null,
    verified_height_in: null,
    verified_by: null,
    verified_at: null,
    openings: [
      { id: "d1", kind: "door", width_in: ft(3), height_in: ft(7), count: 1 },
    ],
    wall_tile_enabled: false,
    tiling_height_in: null,
    granite_lines: [],
    overrides: {},
    photos: [],
    tile_option_id: "t1",
    tile_layout: {},
    notes: null,
    sort_order: 0,
    created_by: null,
    created_at: "2026-07-06T00:00:00Z",
    updated_at: "2026-07-06T00:00:00Z",
    ...partial,
  };
}

function makeTile(partial: Partial<SpaceTileOption> = {}): SpaceTileOption {
  return {
    id: "t1",
    site_id: "site1",
    label: "2×2 Ivory",
    tile_width_in: 24,
    tile_height_in: 24,
    tiles_per_box: 4,
    price_per_box: 1000,
    photo: null,
    notes: null,
    created_by: null,
    created_at: "2026-07-06T00:00:00Z",
    updated_at: "2026-07-06T00:00:00Z",
    ...partial,
  };
}

describe("computeTileLayout", () => {
  it("lays a 5×5 grid on a 9'×9' kitchen with 2'×2' tiles", () => {
    const r = computeTileLayout(
      makeSpace({ tile_layout: { wastage_pct: 0 } }),
      makeTile()
    )!;
    expect(r.cols).toBe(5);
    expect(r.rows).toBe(5);
    expect(r.cells).toHaveLength(25);
    expect(r.fullTiles).toBe(16); // 4×4 whole tiles
    expect(r.cutTiles).toBe(9); // last row + last column
    expect(r.tilesNeeded).toBe(25);
    expect(r.totalTiles).toBe(25);
    expect(r.boxes).toBe(7); // ceil(25/4)
    expect(r.price).toBe(7000);
  });

  it("exact-fit room has no cut tiles", () => {
    const r = computeTileLayout(
      makeSpace({
        drawing_length_in: ft(10),
        drawing_width_in: ft(10),
        tile_layout: { wastage_pct: 0 },
      }),
      makeTile()
    )!;
    expect(r.fullTiles).toBe(25);
    expect(r.cutTiles).toBe(0);
  });

  it("excludes only cells fully inside a no-tile zone", () => {
    const r = computeTileLayout(
      makeSpace({
        tile_layout: {
          wastage_pct: 0,
          exclusions: [
            { id: "e1", x_in: 0, y_in: 0, w_in: ft(4), h_in: ft(4) },
          ],
        },
      }),
      makeTile()
    )!;
    expect(r.excludedTiles).toBe(4); // the 2×2 cells inside 4'×4'
    expect(r.tilesNeeded).toBe(21);
    // A partially-covered zone excludes nothing extra:
    const partial = computeTileLayout(
      makeSpace({
        tile_layout: {
          wastage_pct: 0,
          exclusions: [
            { id: "e1", x_in: 6, y_in: 6, w_in: ft(3), h_in: ft(3) },
          ],
        },
      }),
      makeTile()
    )!;
    expect(partial.excludedTiles).toBe(0);
  });

  it("cuts skirting strips from the same tile", () => {
    // Kitchen skirting = 36' − 3' door = 33 rft. A 2'×2' tile yields
    // floor(24/4)=6 strips × 2' = 12 rft per tile → ceil(33/12) = 3 tiles.
    const r = computeTileLayout(
      makeSpace({
        tile_layout: { wastage_pct: 0, skirting_from_same_tile: true },
      }),
      makeTile()
    )!;
    expect(r.skirtingRft).toBe(33);
    expect(r.skirtingTiles).toBe(3);
    expect(r.totalTiles).toBe(28); // 25 + 3
  });

  it("applies wastage and defaults to 5%", () => {
    const r = computeTileLayout(makeSpace(), makeTile())!;
    expect(r.wastagePct).toBe(5);
    expect(r.totalTiles).toBe(27); // ceil(25 × 1.05) = 26.25 → 27
  });

  it("multiplies by mirrored floors before wastage", () => {
    const r = computeTileLayout(
      makeSpace({
        mirrored_section_ids: ["ff"],
        tile_layout: { wastage_pct: 5 },
      }),
      makeTile()
    )!;
    expect(r.floorAppearances).toBe(2);
    expect(r.totalTiles).toBe(53); // ceil(25 × 2 × 1.05) = 52.5 → 53
  });

  it("uses verified dims in best mode", () => {
    const r = computeTileLayout(
      makeSpace({
        verified_length_in: ft(10),
        verified_width_in: ft(9),
        tile_layout: { wastage_pct: 0 },
      }),
      makeTile()
    )!;
    expect(r.cols).toBe(5); // 10' / 2' exact
    expect(r.rows).toBe(5); // ceil(9/2)
    expect(r.cutTiles).toBe(5); // only the last row
  });

  it("returns null without dimensions; no strips when tile shorter than strip", () => {
    expect(
      computeTileLayout(
        makeSpace({ drawing_length_in: null }),
        makeTile()
      )
    ).toBeNull();
    const r = computeTileLayout(
      makeSpace({
        tile_layout: {
          wastage_pct: 0,
          skirting_from_same_tile: true,
          skirting_strip_in: 30, // taller than the tile
        },
      }),
      makeTile()
    )!;
    expect(r.skirtingTiles).toBe(0);
  });

  it("handles boxes unknown", () => {
    const r = computeTileLayout(
      makeSpace({ tile_layout: { wastage_pct: 0 } }),
      makeTile({ tiles_per_box: null, price_per_box: null })
    )!;
    expect(r.boxes).toBeNull();
    expect(r.price).toBeNull();
  });

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
});

describe("rollupTileTotals", () => {
  it("aggregates per tile option and boxes from the total", () => {
    const tile = makeTile();
    const a = makeSpace({ id: "a", tile_layout: { wastage_pct: 0 } }); // 25
    const b = makeSpace({
      id: "b",
      name: "Bed",
      drawing_length_in: ft(10),
      drawing_width_in: ft(10),
      tile_layout: { wastage_pct: 0 },
    }); // 25
    const totals = rollupTileTotals([a, b], [tile]);
    expect(totals).toHaveLength(1);
    expect(totals[0].totalTiles).toBe(50);
    expect(totals[0].boxes).toBe(13); // ceil(50/4)
    expect(totals[0].spaceCount).toBe(2);
  });

  it("skips spaces without a tile or with an unknown tile", () => {
    const totals = rollupTileTotals(
      [makeSpace({ tile_option_id: null }), makeSpace({ tile_option_id: "gone" })],
      [makeTile()]
    );
    expect(totals).toHaveLength(0);
  });
});
