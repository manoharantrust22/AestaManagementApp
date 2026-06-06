import { describe, it, expect } from "vitest";
import {
  collectMaterialOptions,
  matchesMaterial,
  matchesDateRange,
} from "./threadFilters";

describe("collectMaterialOptions", () => {
  it("dedupes primary + variant materials and sorts by name", () => {
    const opts = collectMaterialOptions([
      { material_id: "m-cement", material_name: "Cement" },
      {
        material_id: "m-tmt16",
        material_name: "TMT Rods 16mm",
        variants: [
          { material_id: "m-tmt16", material_name: "TMT Rods 16mm" },
          { material_id: "m-tmt20", material_name: "TMT Rods 20mm" },
        ],
      },
      { material_id: "m-cement", material_name: "Cement" },
    ]);
    expect(opts).toEqual([
      { material_id: "m-cement", material_name: "Cement" },
      { material_id: "m-tmt16", material_name: "TMT Rods 16mm" },
      { material_id: "m-tmt20", material_name: "TMT Rods 20mm" },
    ]);
  });

  it("returns an empty array for no threads", () => {
    expect(collectMaterialOptions([])).toEqual([]);
  });
});

describe("matchesMaterial", () => {
  const thread = {
    material_id: "m-tmt16",
    material_name: "TMT Rods 16mm",
    variants: [
      { material_id: "m-tmt16", material_name: "TMT Rods 16mm" },
      { material_id: "m-tmt20", material_name: "TMT Rods 20mm" },
    ],
  };

  it("passes everything when no material is selected", () => {
    expect(matchesMaterial(thread, null)).toBe(true);
  });

  it("matches on the primary material_id", () => {
    expect(matchesMaterial(thread, "m-tmt16")).toBe(true);
  });

  it("matches when the material appears as a variant", () => {
    expect(matchesMaterial(thread, "m-tmt20")).toBe(true);
  });

  it("rejects a material that is neither primary nor a variant", () => {
    expect(matchesMaterial(thread, "m-cement")).toBe(false);
  });
});

describe("matchesDateRange", () => {
  const thread = { requested_at: "2025-12-08" };

  it("passes everything when either bound is null", () => {
    expect(matchesDateRange(thread, null, null)).toBe(true);
    expect(matchesDateRange(thread, new Date("2025-12-01"), null)).toBe(true);
    expect(matchesDateRange(thread, null, new Date("2025-12-31"))).toBe(true);
  });

  it("matches a request date inside the range (inclusive boundaries)", () => {
    expect(
      matchesDateRange(thread, new Date("2025-12-01"), new Date("2025-12-31"))
    ).toBe(true);
    expect(
      matchesDateRange(thread, new Date("2025-12-08"), new Date("2025-12-08"))
    ).toBe(true);
  });

  it("rejects a request date outside the range", () => {
    expect(
      matchesDateRange(thread, new Date("2026-01-01"), new Date("2026-01-31"))
    ).toBe(false);
  });

  it("rejects a thread with no request date when a range is set", () => {
    expect(
      matchesDateRange({ requested_at: "" }, new Date("2025-12-01"), new Date("2025-12-31"))
    ).toBe(false);
  });
});
