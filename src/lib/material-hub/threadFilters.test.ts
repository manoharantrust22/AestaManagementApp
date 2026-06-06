import { describe, it, expect } from "vitest";
import {
  collectMaterialOptions,
  matchesMaterial,
  matchesDateRange,
  type MaterialOption,
  type ParentMap,
} from "./threadFilters";

// "TMT Rods" (parent) → 16mm + 20mm variants; "Cement" standalone (no parent).
const parentMap: ParentMap = new Map([
  ["m-tmt-parent", { parentId: null, parentName: null, selfName: "TMT Rods" }],
  ["m-tmt16", { parentId: "m-tmt-parent", parentName: "TMT Rods", selfName: "TMT Rods 16mm" }],
  ["m-tmt20", { parentId: "m-tmt-parent", parentName: "TMT Rods", selfName: "TMT Rods 20mm" }],
  ["m-cement", { parentId: null, parentName: null, selfName: "Cement" }],
]);

const tmtThread = {
  material_id: "m-tmt16",
  material_name: "TMT Rods 16mm",
  brand_id: "b-amman",
  brand_name: "Amman",
  variants: [
    { material_id: "m-tmt16", material_name: "TMT Rods 16mm", brand_id: "b-amman", brand_name: "Amman" },
    { material_id: "m-tmt20", material_name: "TMT Rods 20mm", brand_id: "b-karup", brand_name: "Karuppaiah" },
  ],
};
const cementThread = {
  material_id: "m-cement",
  material_name: "Cement",
  brand_id: null,
  brand_name: null,
};

describe("collectMaterialOptions", () => {
  it("rolls variants up under their parent and groups material / size / brand", () => {
    const opts = collectMaterialOptions([tmtThread, cementThread], parentMap);

    const materials = opts.filter((o) => o.group === "Material");
    const sizes = opts.filter((o) => o.group === "Size / Variant");
    const brands = opts.filter((o) => o.group === "Brand");

    // Parent "TMT Rods" once (not per size) + standalone "Cement".
    expect(materials.map((o) => o.id).sort()).toEqual(["m-cement", "m-tmt-parent"]);
    expect(materials.find((o) => o.id === "m-tmt-parent")).toMatchObject({
      kind: "material",
      label: "TMT Rods",
    });
    // Sizes are the two variants — never the standalone Cement.
    expect(sizes.map((o) => o.id).sort()).toEqual(["m-tmt16", "m-tmt20"]);
    // Brands deduped across primary + variants.
    expect(brands.map((o) => o.id).sort()).toEqual(["b-amman", "b-karup"]);
  });

  it("returns group-contiguous options (Material, then Size, then Brand)", () => {
    const groups = collectMaterialOptions([tmtThread, cementThread], parentMap).map(
      (o) => o.group
    );
    const firstSize = groups.indexOf("Size / Variant");
    const firstBrand = groups.indexOf("Brand");
    expect(groups.lastIndexOf("Material")).toBeLessThan(firstSize);
    expect(groups.lastIndexOf("Size / Variant")).toBeLessThan(firstBrand);
  });

  it("returns an empty array for no threads", () => {
    expect(collectMaterialOptions([], parentMap)).toEqual([]);
  });
});

describe("matchesMaterial", () => {
  const opt = (o: Partial<MaterialOption>): MaterialOption =>
    ({ kind: "material", id: "", label: "", group: "Material", ...o }) as MaterialOption;

  it("passes everything when no option is selected", () => {
    expect(matchesMaterial(tmtThread, null, parentMap)).toBe(true);
  });

  it("parent selection matches every thread rolling up to it", () => {
    const sel = opt({ kind: "material", id: "m-tmt-parent" });
    expect(matchesMaterial(tmtThread, sel, parentMap)).toBe(true);
    expect(matchesMaterial(cementThread, sel, parentMap)).toBe(false);
  });

  it("standalone material selection matches that material directly", () => {
    const sel = opt({ kind: "material", id: "m-cement" });
    expect(matchesMaterial(cementThread, sel, parentMap)).toBe(true);
    expect(matchesMaterial(tmtThread, sel, parentMap)).toBe(false);
  });

  it("variant selection is an exact size match", () => {
    expect(
      matchesMaterial(tmtThread, opt({ kind: "variant", id: "m-tmt20" }), parentMap)
    ).toBe(true);
    expect(
      matchesMaterial(tmtThread, opt({ kind: "variant", id: "m-tmt99" }), parentMap)
    ).toBe(false);
  });

  it("brand selection matches primary or variant brand", () => {
    expect(
      matchesMaterial(tmtThread, opt({ kind: "brand", id: "b-karup" }), parentMap)
    ).toBe(true);
    expect(
      matchesMaterial(cementThread, opt({ kind: "brand", id: "b-karup" }), parentMap)
    ).toBe(false);
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
