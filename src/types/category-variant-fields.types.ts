/**
 * Category Variant Fields Types
 * Type definitions for the dynamic variant field system
 */

export type VariantFieldType = 'number' | 'integer' | 'text' | 'select';

export interface VariantFieldOption {
  value: string;
  label: string;
}

/**
 * The only three `materials` columns a spec field may mirror. PO and Request
 * weight/length math still reads these scalars directly rather than the
 * specifications JSONB, so a field that feeds them must say so explicitly.
 * Typed as a union (rather than string) so a typo is a compile error instead of
 * a silent no-op that quietly breaks costing.
 */
export type LegacyColumnKey =
  | 'weight_per_unit'
  | 'length_per_piece'
  | 'rods_per_bundle';

export interface VariantFieldDefinition {
  /** Storage key in specifications JSONB */
  key: string;
  /** Display label for the field */
  name: string;
  /** Input type */
  type: VariantFieldType;
  /** Unit suffix (e.g., "mm", "kg", "cft") */
  unit?: string;
  /** Whether field is required */
  required: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Helper text shown below field */
  helperText?: string;
  /** For number type: minimum value */
  min?: number;
  /** For number type: maximum value */
  max?: number;
  /** For number type: step increment */
  step?: number;
  /** Options for select type */
  options?: VariantFieldOption[];
  /** Default value */
  defaultValue?: string | number | null;
  /** Column width in pixels for table display */
  columnWidth?: number;
  /**
   * Mirror this field's value into the legacy materials.{key} scalar column as
   * well as specifications JSONB. Only valid when `key` is a LegacyColumnKey.
   *
   * When set on `length_per_piece` / `weight_per_unit`, the field's `unit` is
   * ALSO written to the paired materials.length_unit / weight_unit column.
   * Without that, the unit columns keep their 'm' / 'kg' defaults while the
   * value is in whatever unit the template declares — e.g. a 40 ft TMT rod
   * would persist as length_per_piece=40, length_unit='m' (40 metres).
   */
  writeLegacyColumn?: boolean;
}

export interface AutoGeneratePreset {
  /** Variant name suffix (e.g., "8mm") */
  name: string;
  /** Field values for this preset */
  values: Record<string, unknown>;
}

export interface AutoGenerateConfig {
  /** Whether auto-generate is enabled for this category */
  enabled: boolean;
  /** Button label (e.g., "Auto-generate TMT sizes (8mm - 32mm)") */
  buttonLabel?: string;
  /** Presets to generate */
  presets: AutoGeneratePreset[];
}

export interface CategoryVariantTemplate {
  /**
   * Fields to display for variants of this category.
   *
   * An EMPTY array is meaningful: it declares "variants of this category have no
   * structured specs" (sand, cement, hardware, tools) and the form renders no
   * Specifications section at all. It is not the same as "not yet mapped".
   */
  fields: VariantFieldDefinition[];
  /** Suggested default unit for materials in this category */
  defaultUnit?: string;
  /** Auto-generate configuration for this category */
  autoGenerateConfig?: AutoGenerateConfig;
  /**
   * Derive the variant name from spec values, e.g. '{sheet_size} · {thickness_mm}mm'.
   * Users type dimensions into the NAME and leave specs empty (only 11 of ~60
   * variants catalog-wide carry any specs), so deriving the name from the specs
   * makes filling them the shortest path to the name they wanted anyway.
   * Tokens are field keys; renders to '' if any token has no value.
   */
  nameTemplate?: string;
}

/** Minimal category interface for template resolution */
export interface CategoryForTemplate {
  id: string;
  name: string;
  code?: string | null;
  parent_id?: string | null;
}
