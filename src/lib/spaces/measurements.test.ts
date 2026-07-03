import { describe, expect, it } from "vitest";

import type { Space, SpaceOpening } from "@/types/spaces.types";
import {
  computeQuantities,
  dimensionVariance,
  floorTileSqft,
  formatFeetInches,
  formatTotalsForWhatsApp,
  graniteSqft,
  parseFeetInches,
  rollupTotals,
  skirtingRft,
  spaceStatus,
  VARIANCE_TOLERANCE_IN,
  wallTileSqft,
} from "./measurements";

const ft = (feet: number, inches = 0) => feet * 12 + inches;

function makeSpace(partial: Partial<Space> = {}): Space {
  return {
    id: "s1",
    site_id: "site1",
    section_id: null,
    name: "Test Room",
    space_type: "bedroom",
    drawing_length_in: null,
    drawing_width_in: null,
    drawing_height_in: null,
    verified_length_in: null,
    verified_width_in: null,
    verified_height_in: null,
    verified_by: null,
    verified_at: null,
    openings: [],
    wall_tile_enabled: false,
    tiling_height_in: null,
    granite_lines: [],
    overrides: {},
    photos: [],
    notes: null,
    sort_order: 0,
    created_by: null,
    created_at: "2026-07-03T00:00:00Z",
    updated_at: "2026-07-03T00:00:00Z",
    ...partial,
  };
}

const door = (widthFt: number, heightFt = 7, count = 1): SpaceOpening => ({
  id: `d${widthFt}`,
  kind: "door",
  width_in: ft(widthFt),
  height_in: ft(heightFt),
  count,
});

const window_ = (wFt: number, hFt: number, count = 1): SpaceOpening => ({
  id: `w${wFt}`,
  kind: "window",
  width_in: ft(wFt),
  height_in: ft(hFt),
  count,
});

describe("parseFeetInches", () => {
  it("parses feet + inches with quotes", () => {
    expect(parseFeetInches(`14' 6"`)).toBe(174);
    expect(parseFeetInches("14'6")).toBe(174);
    expect(parseFeetInches("14' 6")).toBe(174);
  });

  it("parses two bare numbers as feet + inches", () => {
    expect(parseFeetInches("14 6")).toBe(174);
  });

  it("parses a single number as decimal feet", () => {
    expect(parseFeetInches("14.5")).toBe(174);
    expect(parseFeetInches("14")).toBe(168);
  });

  it("parses inches-only", () => {
    expect(parseFeetInches(`6"`)).toBe(6);
  });

  it("parses bare feet with apostrophe", () => {
    expect(parseFeetInches("14'")).toBe(168);
  });

  it("handles curly quotes from mobile keyboards", () => {
    expect(parseFeetInches("14’ 6”")).toBe(174);
  });

  it("rejects garbage and >=12 inch components", () => {
    expect(parseFeetInches("")).toBeNull();
    expect(parseFeetInches("abc")).toBeNull();
    expect(parseFeetInches("14' 13\"")).toBeNull();
    expect(parseFeetInches("14 13")).toBeNull();
    expect(parseFeetInches("-5")).toBeNull();
  });
});

describe("formatFeetInches", () => {
  it("round-trips parse -> format", () => {
    expect(formatFeetInches(parseFeetInches(`14' 6"`)!)).toBe(`14' 6"`);
    expect(formatFeetInches(parseFeetInches("10")!)).toBe("10'");
  });

  it("rounds to nearest inch and handles nullish", () => {
    expect(formatFeetInches(174.4)).toBe(`14' 6"`);
    expect(formatFeetInches(null)).toBe("—");
    expect(formatFeetInches(undefined)).toBe("—");
  });
});

describe("floorTileSqft", () => {
  it("computes 12' x 10' = 120 sqft", () => {
    expect(floorTileSqft(ft(12), ft(10))).toBe(120);
  });
});

describe("skirtingRft", () => {
  it("deducts door widths from perimeter: 12x10 with 3' door = 41 rft", () => {
    expect(skirtingRft(ft(12), ft(10), [door(3)])).toBe(41);
  });

  it("deducts multiple doors including count", () => {
    // perimeter 44' − 3' − 2×2.5' = 36'
    const doors = [door(3), { ...door(2.5), count: 2 }];
    expect(skirtingRft(ft(12), ft(10), doors)).toBe(36);
  });

  it("windows do not deduct by default; explicit flag wins", () => {
    expect(skirtingRft(ft(12), ft(10), [window_(4, 4)])).toBe(44);
    const opening: SpaceOpening = { ...window_(4, 4), deduct_skirting: true };
    expect(skirtingRft(ft(12), ft(10), [opening])).toBe(40);
    const noDeductDoor: SpaceOpening = { ...door(3), deduct_skirting: false };
    expect(skirtingRft(ft(12), ft(10), [noDeductDoor])).toBe(44);
  });

  it("clamps to zero", () => {
    expect(skirtingRft(ft(2), ft(2), [door(10)])).toBe(0);
  });
});

describe("wallTileSqft", () => {
  it("perimeter x tiling height minus openings: 12x10 @7' with 3x7 door + 4x4 window = 271", () => {
    expect(
      wallTileSqft(ft(12), ft(10), ft(7), [door(3), window_(4, 4)])
    ).toBe(271);
  });

  it("clamps to zero when openings exceed band", () => {
    expect(wallTileSqft(ft(2), ft(2), 12, [door(10, 10)])).toBe(0);
  });
});

describe("graniteSqft", () => {
  it("sums line items: 12' x 2' = 24 sqft", () => {
    expect(
      graniteSqft([
        { id: "g1", label: "Kitchen top", length_in: ft(12), width_in: ft(2), count: 1 },
      ])
    ).toBe(24);
  });

  it("multiplies by count (staircase steps)", () => {
    expect(
      graniteSqft([
        { id: "g1", label: "Step", length_in: ft(4), width_in: 11, count: 10 },
      ])
    ).toBe(round(4 * (11 / 12) * 10));
  });
});

const round = (n: number) => Math.round(n * 100) / 100;

describe("computeQuantities", () => {
  const base = makeSpace({
    drawing_length_in: ft(12),
    drawing_width_in: ft(10),
    drawing_height_in: ft(10),
    openings: [door(3), window_(4, 4)],
  });

  it("drawing mode computes floor + skirting; wall tile off by default", () => {
    const q = computeQuantities(base, "drawing");
    expect(q.floorTileSqft).toBe(120);
    expect(q.skirtingRft).toBe(41);
    expect(q.wallTileSqft).toBe(0);
    expect(q.graniteSqft).toBe(0);
  });

  it("wall tile uses tiling height when enabled", () => {
    const s = makeSpace({
      ...base,
      wall_tile_enabled: true,
      tiling_height_in: ft(7),
    });
    expect(computeQuantities(s, "drawing").wallTileSqft).toBe(271);
  });

  it("best mode prefers verified values per-dimension", () => {
    const s = makeSpace({
      ...base,
      verified_length_in: ft(12, 6), // width unverified, falls back
    });
    const q = computeQuantities(s, "best");
    expect(q.floorTileSqft).toBe(125); // 12.5 × 10
    expect(computeQuantities(s, "drawing").floorTileSqft).toBe(120);
  });

  it("overrides win in both modes", () => {
    const s = makeSpace({
      ...base,
      verified_length_in: ft(12, 6),
      overrides: { floor_tile_sqft: 111, skirting_rft: 33 },
    });
    expect(computeQuantities(s, "drawing").floorTileSqft).toBe(111);
    expect(computeQuantities(s, "best").floorTileSqft).toBe(111);
    expect(computeQuantities(s, "best").skirtingRft).toBe(33);
  });

  it("returns zeros without dimensions but still counts granite", () => {
    const s = makeSpace({
      granite_lines: [
        { id: "g", label: "Top", length_in: ft(6), width_in: ft(2), count: 1 },
      ],
    });
    const q = computeQuantities(s, "drawing");
    expect(q.floorTileSqft).toBe(0);
    expect(q.graniteSqft).toBe(12);
  });
});

describe("spaceStatus / dimensionVariance", () => {
  const drawn = {
    drawing_length_in: ft(12),
    drawing_width_in: ft(10),
    drawing_height_in: ft(10),
  };

  it("unverified when field values missing", () => {
    expect(spaceStatus(makeSpace(drawn))).toBe("unverified");
  });

  it("verified when L & W within tolerance (height not required without wall tile)", () => {
    const s = makeSpace({
      ...drawn,
      verified_length_in: ft(12) + VARIANCE_TOLERANCE_IN, // exactly 1" — still ok
      verified_width_in: ft(10),
    });
    expect(spaceStatus(s)).toBe("verified");
  });

  it("variance when any dimension differs beyond tolerance", () => {
    const s = makeSpace({
      ...drawn,
      verified_length_in: ft(12) + 2,
      verified_width_in: ft(10),
    });
    expect(spaceStatus(s)).toBe("variance");
    expect(dimensionVariance(s).length).toBe(2);
  });

  it("wall-tile spaces also require height verification", () => {
    const s = makeSpace({
      ...drawn,
      wall_tile_enabled: true,
      tiling_height_in: ft(7),
      verified_length_in: ft(12),
      verified_width_in: ft(10),
    });
    expect(spaceStatus(s)).toBe("unverified");
    expect(
      spaceStatus(makeSpace({ ...s, verified_height_in: ft(10) }))
    ).toBe("verified");
  });
});

describe("rollupTotals", () => {
  const roomA = makeSpace({
    id: "a",
    section_id: "gf",
    drawing_length_in: ft(12),
    drawing_width_in: ft(10),
    openings: [door(3)],
  });
  const roomB = makeSpace({
    id: "b",
    section_id: "ff",
    drawing_length_in: ft(10),
    drawing_width_in: ft(10),
    granite_lines: [
      { id: "g", label: "Top", length_in: ft(12), width_in: ft(2), count: 1 },
    ],
  });

  it("accumulates grand + per-section totals", () => {
    const t = rollupTotals([roomA, roomB], "drawing");
    expect(t.grand.floorTileSqft).toBe(220);
    expect(t.grand.graniteSqft).toBe(24);
    expect(t.bySection.get("gf")!.floorTileSqft).toBe(120);
    expect(t.bySection.get("ff")!.floorTileSqft).toBe(100);
  });

  it("formats a shareable text block", () => {
    const t = rollupTotals([roomA, roomB], "drawing");
    const text = formatTotalsForWhatsApp(
      t,
      "Srinivasan",
      "drawing",
      new Map([
        ["gf", "Ground Floor"],
        ["ff", "First Floor"],
      ])
    );
    expect(text).toContain("Srinivasan");
    expect(text).toContain("Floor tile: 220 sq.ft");
    expect(text).toContain("Ground Floor");
  });
});
