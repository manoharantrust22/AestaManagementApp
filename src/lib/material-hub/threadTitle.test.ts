import { describe, it, expect } from "vitest";
import { threadVariantCategory, threadDisplayName } from "./threadTitle";

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
