/**
 * Rules for how tightly a vendor quote must be scoped.
 *
 * The catalog used to accept "Vijaya Plywoods, Rs.75/sqft" against the parent
 * Plywood material with no brand and no thickness — a number that cannot be
 * compared to anything (185 of 242 live quotes have no brand). But sand really
 * is just sand, so a blanket requirement would be noise. Each material declares
 * what its price depends on (materials.price_varies_by_brand / _by_variant) and
 * this module turns that declaration into what the form must ask for, and what
 * it must say when it asks for nothing.
 */

export interface ScopingMaterialLike {
  id: string;
  /** Null on a parent material; set on a variant. */
  parent_id?: string | null;
  price_varies_by_brand?: boolean | null;
  price_varies_by_variant?: boolean | null;
}

export interface QuoteScopingContext {
  /** The quote must name a brand before it can be saved. */
  requiresBrand: boolean;
  /** The quote must be bound to a variant before it can be saved. */
  requiresVariant: boolean;
  /** There is at least one brand to pick. */
  hasBrands: boolean;
  /** There is at least one variant to pick. */
  hasVariants: boolean;
  /**
   * The material declares its price depends on neither. The form should SAY so
   * rather than just showing no fields — silence is what let unscoped quotes
   * through in the first place.
   */
  isUnscopedByDesign: boolean;
}

export interface ResolveQuoteScopingParams {
  /** The material the quote is recorded against — a parent OR a variant. */
  quotedMaterial: ScopingMaterialLike;
  /**
   * The parent material, when `quotedMaterial` is a variant. The declaration
   * lives on the parent only; variants never carry their own flags.
   */
  parentMaterial?: ScopingMaterialLike | null;
  brandCount: number;
  variantCount: number;
}

export function resolveQuoteScoping({
  quotedMaterial,
  parentMaterial,
  brandCount,
  variantCount,
}: ResolveQuoteScopingParams): QuoteScopingContext {
  const isQuotingVariant = Boolean(quotedMaterial.parent_id);

  // A variant row's own flags are meaningless — read the parent's. Falling back
  // to quotedMaterial covers the common case where it IS the parent.
  const declaration =
    (isQuotingVariant ? parentMaterial : quotedMaterial) ?? quotedMaterial;

  const declaresBrand = declaration.price_varies_by_brand === true;
  const declaresVariant = declaration.price_varies_by_variant === true;

  return {
    requiresBrand: declaresBrand,
    // Quoting a variant directly already binds it (vendor_inventory.material_id
    // points at the variant row), so there is nothing left to ask for.
    requiresVariant: declaresVariant && !isQuotingVariant,
    hasBrands: brandCount > 0,
    hasVariants: variantCount > 0,
    isUnscopedByDesign: !declaresBrand && !declaresVariant,
  };
}

/**
 * @returns an error message, or null when the quote is scoped acceptably.
 */
export function validateQuoteScoping(
  ctx: QuoteScopingContext,
  selection: { brandId?: string | null; variantId?: string | null }
): string | null {
  if (ctx.requiresBrand && !selection.brandId) {
    // Declared brand-priced but nothing to pick: the honest answer is to point
    // at the missing brand, not to wave the quote through.
    return ctx.hasBrands
      ? "Pick the brand this price is for — this material's price varies by brand."
      : "This material's price varies by brand, but it has no brands yet. Add a brand before quoting.";
  }

  if (ctx.requiresVariant && !selection.variantId) {
    return ctx.hasVariants
      ? "Pick the variant this price is for — this material's price varies by size/variant."
      : "This material's price varies by variant, but it has no variants yet. Add a variant before quoting.";
  }

  return null;
}
