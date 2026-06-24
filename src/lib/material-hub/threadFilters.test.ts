import { describe, it, expect } from "vitest";
import {
  collectMaterialOptions,
  groupMaterialOptions,
  matchesMaterial,
  matchesDateRange,
  matchesSearch,
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

describe("groupMaterialOptions", () => {
  const options = collectMaterialOptions([tmtThread, cementThread], parentMap);

  it("returns all three sections in canonical order for an empty query", () => {
    const sections = groupMaterialOptions(options, "");
    expect(sections.map((s) => s.group)).toEqual([
      "Material",
      "Size / Variant",
      "Brand",
    ]);
    // Material section carries both the parent and the standalone.
    expect(sections[0].items.map((o) => o.id).sort()).toEqual([
      "m-cement",
      "m-tmt-parent",
    ]);
  });

  it("treats a whitespace-only query as empty", () => {
    expect(groupMaterialOptions(options, "   ")).toEqual(
      groupMaterialOptions(options, "")
    );
  });

  it("filters by label across groups (case-insensitive, partial)", () => {
    const sections = groupMaterialOptions(options, "tmt");
    // Matches the "TMT Rods" parent + its two sizes, but no brand labels.
    expect(sections.map((s) => s.group)).toEqual(["Material", "Size / Variant"]);
    expect(sections.find((s) => s.group === "Material")?.items.map((o) => o.id)).toEqual([
      "m-tmt-parent",
    ]);
    expect(
      sections.find((s) => s.group === "Size / Variant")?.items.map((o) => o.id).sort()
    ).toEqual(["m-tmt16", "m-tmt20"]);
  });

  it("matches a brand label and drops empty sections", () => {
    const sections = groupMaterialOptions(options, "amman");
    expect(sections.map((s) => s.group)).toEqual(["Brand"]);
    expect(sections[0].items.map((o) => o.id)).toEqual(["b-amman"]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(groupMaterialOptions(options, "zzz-no-match")).toEqual([]);
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

describe("matchesSearch", () => {
  // A thread carrying every searchable id + name field.
  const searchThread = {
    material_name: "TMT Rods 16mm",
    request_number: "MR-MQJH9YKR-462E1FE6",
    po: { po_number: "PO-1M4TF65-KL2X", vendor_name: "Chennai Building Materials" },
    settlement: {
      expense_ref: "MAT-260214-6805",
      expense_id: "a1b2c3d4-0000-4444-8888-deadbeef0001",
    },
    variants: [{ material_name: "TMT Rods 20mm" }],
  };

  it("passes everything for an empty / whitespace term", () => {
    expect(matchesSearch(searchThread, "")).toBe(true);
    expect(matchesSearch(searchThread, "   ")).toBe(true);
  });

  it("matches the PO number (case-insensitive, partial)", () => {
    expect(matchesSearch(searchThread, "PO-1M4TF65-KL2X")).toBe(true);
    expect(matchesSearch(searchThread, "po-1m4tf65")).toBe(true);
    expect(matchesSearch(searchThread, "KL2X")).toBe(true);
  });

  it("matches the settlement / expense ref", () => {
    expect(matchesSearch(searchThread, "MAT-260214-6805")).toBe(true);
    expect(matchesSearch(searchThread, "260214")).toBe(true);
  });

  it("matches the expense UUID", () => {
    expect(matchesSearch(searchThread, "deadbeef0001")).toBe(true);
  });

  it("matches the MR number", () => {
    expect(matchesSearch(searchThread, "MR-MQJH9YKR-462E1FE6")).toBe(true);
    expect(matchesSearch(searchThread, "mqjh9ykr")).toBe(true);
  });

  it("matches the vendor name", () => {
    expect(matchesSearch(searchThread, "chennai building")).toBe(true);
  });

  it("matches the primary material name", () => {
    expect(matchesSearch(searchThread, "tmt rods 16")).toBe(true);
  });

  it("matches a variant material name", () => {
    expect(matchesSearch(searchThread, "20mm")).toBe(true);
  });

  it("returns false for a non-matching term", () => {
    expect(matchesSearch(searchThread, "cement")).toBe(false);
    expect(matchesSearch(searchThread, "PO-NOPE")).toBe(false);
  });

  it("tolerates threads missing po / settlement / variants", () => {
    const bare = { material_name: "Cement", request_number: undefined };
    expect(matchesSearch(bare, "cement")).toBe(true);
    expect(matchesSearch(bare, "PO-123")).toBe(false);
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
