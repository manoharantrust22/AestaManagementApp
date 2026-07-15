import { describe, it, expect } from "vitest";
import {
  resolveQuoteScoping,
  validateQuoteScoping,
  type ScopingMaterialLike,
} from "./vendor-quote-scoping";

// Shapes taken from live prod rows.
const PLYWOOD: ScopingMaterialLike = {
  id: "ply",
  parent_id: null,
  price_varies_by_brand: true,
  price_varies_by_variant: true,
};
// Teak's size lives in its 16 brands (Palagai 4", Log ...), not in variants.
const TEAK: ScopingMaterialLike = {
  id: "teak",
  parent_id: null,
  price_varies_by_brand: true,
  price_varies_by_variant: false,
};
const M_SAND: ScopingMaterialLike = {
  id: "sand",
  parent_id: null,
  price_varies_by_brand: false,
  price_varies_by_variant: false,
};

describe("resolveQuoteScoping", () => {
  it("requires brand and variant for Plywood", () => {
    const ctx = resolveQuoteScoping({
      quotedMaterial: PLYWOOD,
      brandCount: 1,
      variantCount: 2,
    });
    expect(ctx.requiresBrand).toBe(true);
    expect(ctx.requiresVariant).toBe(true);
    expect(ctx.isUnscopedByDesign).toBe(false);
  });

  it("requires brand only for Teak", () => {
    const ctx = resolveQuoteScoping({
      quotedMaterial: TEAK,
      brandCount: 16,
      variantCount: 0,
    });
    expect(ctx.requiresBrand).toBe(true);
    expect(ctx.requiresVariant).toBe(false);
  });

  it("requires nothing for M Sand, and says so", () => {
    const ctx = resolveQuoteScoping({
      quotedMaterial: M_SAND,
      brandCount: 0,
      variantCount: 0,
    });
    expect(ctx.requiresBrand).toBe(false);
    expect(ctx.requiresVariant).toBe(false);
    expect(ctx.isUnscopedByDesign).toBe(true);
  });

  it("reads the declaration from the PARENT when quoting a variant", () => {
    // The subtle one: a variant row carries no flags of its own. Reading them
    // off the variant would silently drop the brand requirement.
    const variant: ScopingMaterialLike = { id: "ply-18mm", parent_id: "ply" };
    const ctx = resolveQuoteScoping({
      quotedMaterial: variant,
      parentMaterial: PLYWOOD,
      brandCount: 1,
      variantCount: 2,
    });
    expect(ctx.requiresBrand).toBe(true);
  });

  it("stops requiring a variant once the quote is already on one", () => {
    // material_id already points at the variant — there is nothing left to pick.
    const variant: ScopingMaterialLike = { id: "ply-18mm", parent_id: "ply" };
    const ctx = resolveQuoteScoping({
      quotedMaterial: variant,
      parentMaterial: PLYWOOD,
      brandCount: 1,
      variantCount: 2,
    });
    expect(ctx.requiresVariant).toBe(false);
  });

  it("treats a missing/undefined declaration as 'depends on neither'", () => {
    const ctx = resolveQuoteScoping({
      quotedMaterial: { id: "legacy", parent_id: null },
      brandCount: 3,
      variantCount: 3,
    });
    expect(ctx.requiresBrand).toBe(false);
    expect(ctx.isUnscopedByDesign).toBe(true);
  });
});

describe("validateQuoteScoping", () => {
  const plywoodCtx = resolveQuoteScoping({
    quotedMaterial: PLYWOOD,
    brandCount: 1,
    variantCount: 2,
  });

  it("rejects the bug from the screenshot: Rs.75/sqft with no brand or variant", () => {
    expect(validateQuoteScoping(plywoodCtx, {})).toMatch(/brand/i);
  });

  it("still rejects when only the brand is given", () => {
    expect(validateQuoteScoping(plywoodCtx, { brandId: "varnam" })).toMatch(
      /variant|size/i
    );
  });

  it("accepts a fully scoped quote", () => {
    expect(
      validateQuoteScoping(plywoodCtx, { brandId: "varnam", variantId: "18mm" })
    ).toBeNull();
  });

  it("accepts a bare quote for M Sand", () => {
    const ctx = resolveQuoteScoping({
      quotedMaterial: M_SAND,
      brandCount: 0,
      variantCount: 0,
    });
    expect(validateQuoteScoping(ctx, {})).toBeNull();
  });

  it("points at the missing brand rather than passing silently", () => {
    // Declared brand-priced but zero brands recorded. Hiding the field is how
    // 27 quotes ended up brandless despite brands existing.
    const ctx = resolveQuoteScoping({
      quotedMaterial: TEAK,
      brandCount: 0,
      variantCount: 0,
    });
    const err = validateQuoteScoping(ctx, {});
    expect(err).toMatch(/no brands yet/i);
  });

  it("points at the missing variant when none exist yet", () => {
    // Plywood's real state before this work: declared variant-priced, 0 variants.
    const ctx = resolveQuoteScoping({
      quotedMaterial: PLYWOOD,
      brandCount: 1,
      variantCount: 0,
    });
    expect(validateQuoteScoping(ctx, { brandId: "varnam" })).toMatch(
      /no variants yet/i
    );
  });
});
