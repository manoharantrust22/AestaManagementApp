import { describe, it, expect } from "vitest";
import {
  threadVariantCategory,
  threadDisplayName,
  threadBrandLabel,
} from "./threadTitle";

describe("threadVariantCategory", () => {
  it("returns the trimmed common prefix for related variants", () => {
    expect(
      threadVariantCategory(
        [{ material_name: "TMT Rods 16mm" }, { material_name: "TMT Rods 20mm" }],
        "TMT Rods 16mm"
      )
    ).toBe("TMT Rods");
  });

  it("falls back when the common prefix is too short", () => {
    expect(
      threadVariantCategory(
        [{ material_name: "Cement" }, { material_name: "Sand" }],
        "Materials"
      )
    ).toBe("Materials");
  });

  it("returns the single name when only one variant", () => {
    expect(threadVariantCategory([{ material_name: "Cement" }], "fallback")).toBe(
      "Cement"
    );
  });

  it("returns the fallback for an empty list", () => {
    expect(threadVariantCategory([], "fallback")).toBe("fallback");
  });
});

describe("threadDisplayName", () => {
  it("uses the variant category when there are multiple variants", () => {
    expect(
      threadDisplayName({
        material_name: "TMT Rods 16mm",
        variants: [
          { material_name: "TMT Rods 16mm" },
          { material_name: "TMT Rods 20mm" },
        ],
      } as never)
    ).toBe("TMT Rods");
  });

  it("uses the material name when one or no variants", () => {
    expect(
      threadDisplayName({ material_name: "Cement", variants: undefined } as never)
    ).toBe("Cement");
    expect(
      threadDisplayName({
        material_name: "Cement",
        variants: [{ material_name: "Cement 50kg" }],
      } as never)
    ).toBe("Cement");
  });
});

describe("threadBrandLabel", () => {
  it("returns the primary brand for a single-line thread", () => {
    expect(threadBrandLabel({ brand_name: "Chettinad" })).toBe("Chettinad");
  });

  it("returns null when a single-line thread has no brand", () => {
    expect(threadBrandLabel({ brand_name: null })).toBeNull();
    expect(threadBrandLabel({ brand_name: "   " })).toBeNull();
    expect(threadBrandLabel({})).toBeNull();
  });

  it("returns the shared brand when every variant matches", () => {
    expect(
      threadBrandLabel({
        brand_name: "Amman",
        variants: [
          { brand_name: "Amman" },
          { brand_name: "Amman" },
          { brand_name: "Amman" },
        ],
      })
    ).toBe("Amman");
  });

  it("joins distinct variant brands when they differ", () => {
    expect(
      threadBrandLabel({
        brand_name: "Amman",
        variants: [{ brand_name: "Amman" }, { brand_name: "JSW" }],
      })
    ).toBe("Amman / JSW");
  });

  it("falls back to the primary brand when no variant carries one", () => {
    expect(
      threadBrandLabel({
        brand_name: "Chettinad",
        variants: [{ brand_name: null }, { brand_name: "" }],
      })
    ).toBe("Chettinad");
  });
});
