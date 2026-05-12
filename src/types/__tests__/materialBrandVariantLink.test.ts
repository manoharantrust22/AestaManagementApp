import { describe, it, expectTypeOf } from "vitest";
import type {
  MaterialBrandVariantLink,
  BrandWithVariantLinks,
} from "../material.types";

describe("MaterialBrandVariantLink types", () => {
  it("MaterialBrandVariantLink has required fields", () => {
    const link: MaterialBrandVariantLink = {
      id: "x",
      brand_id: "b",
      variant_id: "v",
      is_active: true,
      image_url: null,
      created_at: "",
    };
    expectTypeOf(link.is_active).toBeBoolean();
    expectTypeOf(link.image_url).toEqualTypeOf<string | null>();
  });

  it("BrandWithVariantLinks has nested links array", () => {
    const bwv: BrandWithVariantLinks = {
      id: "b",
      brand_name: "Ultratech",
      is_preferred: true,
      quality_rating: 5,
      notes: null,
      image_url: null,
      material_brand_variant_links: [],
    };
    expectTypeOf(bwv.material_brand_variant_links).toBeArray();
  });
});
