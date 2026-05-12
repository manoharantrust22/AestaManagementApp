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
      material_id: "m",
      brand_name: "Ultratech",
      variant_name: null,
      is_preferred: true,
      quality_rating: 5,
      notes: null,
      image_url: null,
      is_active: true,
      created_at: "",
      material_brand_variant_links: [],
    };
    expectTypeOf(bwv.material_brand_variant_links).toBeArray();
  });
});
