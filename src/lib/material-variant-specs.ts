/**
 * Per-category variant spec field schema.
 *
 * Drives which spec fields are shown in the Add/Edit Variant inline card based
 * on the parent material's category. Categories not listed (or with an empty
 * array) get NO spec fields — the form skips that section entirely.
 *
 * Values live in materials.specifications JSONB. For Steel & Metals the
 * three legacy columns (weight_per_unit, length_per_piece, rods_per_bundle)
 * are still written directly to maintain backward compatibility with PO/Request
 * calculations downstream — see useAddVariantToMaterial.
 */

export interface SpecFieldDef {
  /** JSON key used when storing/reading from materials.specifications */
  key: string;
  /** TextField label */
  label: string;
  /** Suffix shown as endAdornment (e.g., "kg", "mm") */
  unit?: string;
  /** Input handling */
  type: "number" | "integer" | "text";
  /** Optional helper text under the field */
  helper?: string;
  /**
   * If true, also write to the legacy materials.{key} column (only valid for
   * weight_per_unit / length_per_piece / rods_per_bundle). Used by Steel.
   */
  writeLegacyColumn?: boolean;
}

/**
 * Spec field sets reused across multiple categories/subcategories.
 */
const STEEL_RODS: SpecFieldDef[] = [
  {
    key: "weight_per_unit",
    label: "Weight per rod",
    unit: "kg",
    type: "number",
    helper: "e.g., 0.395 for 8mm TMT",
    writeLegacyColumn: true,
  },
  {
    key: "length_per_piece",
    label: "Length per rod",
    unit: "m",
    type: "number",
    helper: "e.g., 12",
    writeLegacyColumn: true,
  },
  {
    key: "rods_per_bundle",
    label: "Rods per bundle",
    type: "integer",
    writeLegacyColumn: true,
  },
];

const PIPE_FIELDS: SpecFieldDef[] = [
  { key: "diameter_mm", label: "Diameter", unit: "mm", type: "number" },
  {
    key: "length_per_piece",
    label: "Length per pipe",
    unit: "m",
    type: "number",
    writeLegacyColumn: true,
  },
];

const CABLE_FIELDS: SpecFieldDef[] = [
  { key: "gauge_sqmm", label: "Gauge", unit: "sq.mm", type: "number" },
  {
    key: "length_per_piece",
    label: "Coil length",
    unit: "m",
    type: "number",
    writeLegacyColumn: true,
  },
];

const BRICK_FIELDS: SpecFieldDef[] = [
  { key: "size_mm", label: "Size (LxBxH mm)", type: "text" },
];

const PUMP_FIELDS: SpecFieldDef[] = [
  { key: "hp", label: "Power", unit: "HP", type: "number" },
  { key: "stages", label: "Stages", type: "integer" },
];

/**
 * Map from lower-cased category name (top-level OR subcategory) to its spec
 * field set. The resolver matches on the most specific name available, so
 * subcategories like "TMT Bars" can override their parent "Steel & Metals".
 *
 * To add a new category: append a lower-case entry here. To override a
 * subcategory: add an entry keyed by that exact subcategory name.
 */
export const VARIANT_SPECS_BY_CATEGORY: Record<string, SpecFieldDef[]> = {
  // Top-level — Steel & Metals
  "steel & metals": STEEL_RODS,
  "tmt bars": STEEL_RODS,
  "binding wire": [], // sold by weight (kg), no per-piece spec

  // Top-level — Plumbing
  plumbing: PIPE_FIELDS,

  // Top-level — Electrical (most subcats are wire/cable-shaped or none)
  electrical: CABLE_FIELDS,
  "electrical wires": CABLE_FIELDS,
  "electrical cables": CABLE_FIELDS,
  "wiring & cables": CABLE_FIELDS,
  "tv & data cables": CABLE_FIELDS,
  "conduits & fittings": PIPE_FIELDS,
  "conduit fittings": [],
  "distribution boxes": [],
  "electrical accessories": [],
  "insulation tapes": [],
  "junction boxes": [],
  switchgear: [],

  // Top-level — Glass & Aluminum / Doors & Windows
  "glass & aluminum": [
    { key: "width_ft", label: "Width", unit: "ft", type: "number" },
    { key: "height_ft", label: "Height", unit: "ft", type: "number" },
  ],

  // Top-level — Tiles & Flooring
  "tiles & flooring": [
    { key: "size_mm", label: "Size (e.g. 600x600)", type: "text" },
    { key: "pieces_per_box", label: "Pieces per box", type: "integer" },
  ],

  // Top-level — Paint & Finishes
  "paint & finishes": [
    { key: "volume_per_can_l", label: "Volume per can", unit: "L", type: "number" },
  ],

  // Top-level — Bricks & Blocks (incl. all known subcats)
  "bricks & blocks": BRICK_FIELDS,
  "red bricks": BRICK_FIELDS,
  "cement blocks": BRICK_FIELDS,
  "aac blocks": BRICK_FIELDS,

  // Top-level — Wood & Timber
  "wood & timber": [
    { key: "size_mm", label: "Cross-section (mm)", type: "text" },
    {
      key: "length_per_piece",
      label: "Length",
      unit: "ft",
      type: "number",
      writeLegacyColumn: true,
    },
  ],

  // Top-level — Pumps & Motors
  "pumps & motors": PUMP_FIELDS,
  "submersible pumps": PUMP_FIELDS,
  "pump panels & accessories": [],

  // Explicitly empty — sold by name + image + price alone
  "sand & aggregates": [],
  "m sand": [],
  "p sand": [],
  "cement & binding": [],
  "ppc cement": [],
  "opc 53 grade": [],
  hardware: [],
  clamps: [],
  fasteners: [],
  "pipes & fittings": [],
  tools: [],
  waterproofing: [],
  miscellaneous: [],
};

interface CategoryLike {
  name?: string | null;
  parent_id?: string | null;
}

interface MaterialLike {
  category?: CategoryLike | null;
  category_name?: string | null;
}

/**
 * Resolve the spec field set for a parent material.
 *
 * Strategy:
 *   1. If material.category.name maps directly, return that.
 *   2. Otherwise return [] (no spec section rendered).
 *
 * Subcategory lookup is deliberately not done here — the form caller should
 * pass the top-level category name when known. Adding subcategory resolution
 * is a future enhancement once we see real usage patterns.
 */
export function getSpecFieldsForMaterial(
  material: MaterialLike | null | undefined
): SpecFieldDef[] {
  if (!material) return [];
  const rawName =
    material.category?.name?.toLowerCase().trim() ||
    material.category_name?.toLowerCase().trim();
  if (!rawName) return [];
  return VARIANT_SPECS_BY_CATEGORY[rawName] ?? [];
}

/**
 * Resolve spec fields by an explicit category name (for cases where a parent
 * category name is known but the material object isn't structured with one).
 */
export function getSpecFieldsByCategoryName(name: string | null | undefined): SpecFieldDef[] {
  if (!name) return [];
  return VARIANT_SPECS_BY_CATEGORY[name.toLowerCase().trim()] ?? [];
}
