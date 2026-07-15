import { describe, it, expect } from "vitest";
import {
  CATEGORY_VARIANT_TEMPLATES,
  CATEGORY_CODE_MAP,
  CATEGORY_NAME_MAP,
  getCategoryTemplate,
  getCategoryTemplateKey,
  renderNameTemplate,
} from "./category-variant-templates";
import type { CategoryForTemplate } from "@/types/category-variant-fields.types";

const cat = (
  name: string,
  code?: string | null,
  parent_id?: string | null
): CategoryForTemplate => ({ id: `id-${name}`, name, code: code ?? null, parent_id: parent_id ?? null });

const WOD = cat("Wood & Timber", "WOD");
const ELC = cat("Electrical", "ELC");
const HRD = cat("Hardware", "HRD");

describe("getCategoryTemplateKey — the Plywood split", () => {
  it("resolves WOD-PLY to plywood_boards, NOT wood_timber", () => {
    // The wood_timber pattern matches /plywood/, so an exact code hit is the
    // only thing standing between Plywood and the timber template.
    expect(getCategoryTemplateKey(cat("Plywood & Boards", "WOD-PLY", WOD.id), WOD)).toBe(
      "plywood_boards"
    );
  });

  it("still resolves WOD-PLY to plywood_boards when the code is missing", () => {
    // 15 live subcategories were created with code = NULL. If Plywood & Boards
    // is ever one of them, the name map — not the patterns — has to catch it.
    expect(getCategoryTemplateKey(cat("Plywood & Boards", null, WOD.id), WOD)).toBe(
      "plywood_boards"
    );
  });

  it("leaves plain Wood & Timber on wood_timber (teak is linear stock)", () => {
    expect(getCategoryTemplateKey(WOD)).toBe("wood_timber");
  });

  it("gives plywood sheet-size + thickness, and teak cross-section + length", () => {
    const ply = getCategoryTemplate(cat("Plywood & Boards", "WOD-PLY", WOD.id), WOD);
    expect(ply.fields.map((f) => f.key)).toEqual(["sheet_size", "thickness_mm", "grade"]);

    const teak = getCategoryTemplate(WOD);
    expect(teak.fields.map((f) => f.key)).toContain("thickness_value");
    expect(teak.fields.map((f) => f.key)).not.toContain("sheet_size");
  });
});

describe("getCategoryTemplateKey — code-less subcategories", () => {
  // Every Electrical and Hardware child in prod has code = NULL.
  it("resolves cable subcategories by name", () => {
    expect(getCategoryTemplateKey(cat("Wiring & Cables", null, ELC.id), ELC)).toBe("wire");
    expect(getCategoryTemplateKey(cat("Electrical Cables", null, ELC.id), ELC)).toBe("wire");
  });

  it("distinguishes a no-spec electrical subcategory from a cable one", () => {
    expect(getCategoryTemplate(cat("Switchgear", null, ELC.id), ELC).fields).toHaveLength(0);
    expect(
      getCategoryTemplate(cat("Distribution Boxes", null, ELC.id), ELC).fields
    ).toHaveLength(0);
  });

  it("gives Hardware children no spec section", () => {
    for (const name of ["Tools", "Fasteners", "Clamps"]) {
      expect(getCategoryTemplate(cat(name, null, HRD.id), HRD).fields).toHaveLength(0);
    }
  });

  it("falls back to the parent's template for an unknown code-less child", () => {
    expect(getCategoryTemplateKey(cat("Some New Cable Type", null, ELC.id), ELC)).toBe("wire");
  });
});

describe("getCategoryTemplateKey — categories that used to fall through", () => {
  it.each([
    ["Electrical", "ELC", "wire"],
    ["Pumps & Motors", "PMP", "pumps"],
    ["Waterproofing", "WPF", "waterproofing"],
    ["Glass & Aluminum", "GLS", "glass"],
    ["Tiles & Flooring", "TIL", "tiles"],
    ["Paint & Finishes", "PNT", "paint"],
    ["Steel & Metals", "STL", "tmt"],
    ["Sand & Aggregates", "AGG", "sand_aggregates"],
  ])("%s (%s) resolves to %s", (name, code, expected) => {
    expect(getCategoryTemplateKey(cat(name, code))).toBe(expected);
  });

  it("matches Waterproofing by name too (the \\b bug never could)", () => {
    expect(getCategoryTemplateKey(cat("Waterproofing"))).toBe("waterproofing");
  });

  it("returns no spec section for an unknown category", () => {
    expect(getCategoryTemplate(cat("Something Novel", "ZZZ")).fields).toHaveLength(0);
    expect(getCategoryTemplate(null).fields).toHaveLength(0);
  });
});

describe("template integrity guards", () => {
  it("every mapped template key exists", () => {
    // A typo here resolves to undefined and crashes the form at render time.
    for (const [code, key] of Object.entries(CATEGORY_CODE_MAP)) {
      expect(CATEGORY_VARIANT_TEMPLATES[key], `CATEGORY_CODE_MAP.${code}`).toBeDefined();
    }
    for (const [name, key] of Object.entries(CATEGORY_NAME_MAP)) {
      expect(CATEGORY_VARIANT_TEMPLATES[key], `CATEGORY_NAME_MAP["${name}"]`).toBeDefined();
    }
  });

  it("every real category code is mapped or explicitly unmapped", () => {
    // Fails loudly the next time a category is added to the DB without a
    // decision being made here — which is how CTR and PMP arrived unmapped.
    const INTENTIONALLY_UNMAPPED_CODES = ["HRD", "MSC", "CTR", "PMP-PNL"];
    const ALL_CODES = [
      "CEM", "CEM-PPC", "CEM-OPC53", "STL", "STL-TMT", "STL-WIRE",
      "AGG", "AGG-MSAND", "AGG-PSAND", "AGG-BM20",
      "BRK", "BRK-RED", "BRK-CMT", "BRK-AAC",
      "PLB", "ELC", "WOD", "WOD-PLY", "TIL", "PNT",
      "HRD", "GLS", "WPF", "MSC", "CTR", "PMP", "PMP-SUB", "PMP-PNL",
    ];
    for (const code of ALL_CODES) {
      const mapped = Boolean(CATEGORY_CODE_MAP[code]);
      const excused = INTENTIONALLY_UNMAPPED_CODES.includes(code);
      expect(mapped || excused, `${code} is neither mapped nor excused`).toBe(true);
    }
  });

  it("writeLegacyColumn appears only on the three real legacy columns", () => {
    // These feed PO/Request weight+length math directly. Anything else with the
    // flag would be written to a materials column that does not exist.
    const LEGACY_KEYS = ["weight_per_unit", "length_per_piece", "rods_per_bundle"];
    for (const [key, template] of Object.entries(CATEGORY_VARIANT_TEMPLATES)) {
      for (const field of template.fields) {
        if (field.writeLegacyColumn) {
          expect(LEGACY_KEYS, `${key}.${field.key}`).toContain(field.key);
        }
      }
    }
  });

  it("keeps TMT length in feet, matching TMT_STANDARD_LENGTH", () => {
    // materials.length_unit defaults to 'm'; a template that says 40 without
    // saying 'ft' persists a 40-metre rod.
    const len = CATEGORY_VARIANT_TEMPLATES.tmt.fields.find(
      (f) => f.key === "length_per_piece"
    );
    expect(len?.unit).toBe("ft");
    expect(len?.defaultValue).toBe(40);
    expect(len?.writeLegacyColumn).toBe(true);
  });

  it("keeps the spec keys that live prod rows already use", () => {
    // Renaming these would orphan real data: jalli size, paint tier, tile size.
    expect(
      CATEGORY_VARIANT_TEMPLATES.sand_aggregates.fields.map((f) => f.key)
    ).toContain("material_type");
    expect(CATEGORY_VARIANT_TEMPLATES.paint.fields.map((f) => f.key)).toContain("tier");
    expect(CATEGORY_VARIANT_TEMPLATES.tiles.fields.map((f) => f.key)).toContain("tile_size");
  });
});

describe("renderNameTemplate", () => {
  it("renders a plywood variant name from its specs", () => {
    expect(
      renderNameTemplate("{sheet_size} · {thickness_mm}mm", {
        sheet_size: "8x4",
        thickness_mm: 18,
      })
    ).toBe("8x4 · 18mm");
  });

  it("returns '' when any token is missing, empty, or null", () => {
    const t = "{sheet_size} · {thickness_mm}mm";
    expect(renderNameTemplate(t, { sheet_size: "8x4" })).toBe("");
    expect(renderNameTemplate(t, { sheet_size: "8x4", thickness_mm: "" })).toBe("");
    expect(renderNameTemplate(t, { sheet_size: "8x4", thickness_mm: null })).toBe("");
  });

  it("returns '' when the template is undefined", () => {
    expect(renderNameTemplate(undefined, { a: 1 })).toBe("");
  });

  it("treats 0 as a real value, not a missing one", () => {
    expect(renderNameTemplate("{n}mm", { n: 0 })).toBe("0mm");
  });
});
