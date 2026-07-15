import { describe, it, expect } from "vitest";
import { defaultsForCategoryCode } from "./material-price-scoping-defaults";

describe("defaultsForCategoryCode", () => {
  // Mirrors the backfill table in
  // supabase/migrations/20260716100100_materials_price_scoping.sql. If these
  // drift, new materials get seeded differently from the existing catalog.
  it.each([
    ["CEM", true, false],
    ["CEM-PPC", true, false],
    ["STL", true, true],
    ["STL-TMT", true, true],
    ["STL-WIRE", true, false],
    ["AGG", false, false],
    ["AGG-MSAND", false, false],
    ["BRK", false, false],
    ["PLB", true, true],
    ["ELC", true, true],
    ["WOD", true, false],
    ["WOD-PLY", true, true],
    ["TIL", true, true],
    ["PNT", true, false],
    ["HRD", false, false],
    ["GLS", false, true],
    ["WPF", true, false],
    ["MSC", false, false],
    ["CTR", false, false],
    ["PMP", true, true],
    ["PMP-SUB", true, true],
    ["PMP-PNL", true, false],
  ])("%s -> brand=%s variant=%s", (code, brand, variant) => {
    expect(defaultsForCategoryCode(code)).toEqual({
      price_varies_by_brand: brand,
      price_varies_by_variant: variant,
    });
  });

  it("separates the two Wood shapes — this is the bug in one assertion", () => {
    // Teak: brands encode size. Plywood: brand AND thickness both move price.
    expect(defaultsForCategoryCode("WOD").price_varies_by_variant).toBe(false);
    expect(defaultsForCategoryCode("WOD-PLY").price_varies_by_variant).toBe(true);
  });

  it("falls back to the top-level code for an unknown subcategory", () => {
    expect(defaultsForCategoryCode("PLB-CPVC")).toEqual({
      price_varies_by_brand: true,
      price_varies_by_variant: true,
    });
  });

  it("defaults to 'depends on neither' for unknown/absent codes", () => {
    // Matches the columns' own DEFAULT false — permissive, and one toggle from
    // being corrected.
    for (const code of ["ZZZ", "", null, undefined]) {
      expect(defaultsForCategoryCode(code)).toEqual({
        price_varies_by_brand: false,
        price_varies_by_variant: false,
      });
    }
  });

  it("is case-insensitive", () => {
    expect(defaultsForCategoryCode("wod-ply")).toEqual(
      defaultsForCategoryCode("WOD-PLY")
    );
  });
});
