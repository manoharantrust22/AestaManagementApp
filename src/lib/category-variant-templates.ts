/**
 * Category Variant Templates
 * Defines which variant fields are relevant for each material category
 */

import type {
  CategoryVariantTemplate,
  CategoryForTemplate,
} from '@/types/category-variant-fields.types';
import { TMT_WEIGHTS, TMT_STANDARD_LENGTH, TMT_RODS_PER_BUNDLE } from './weightCalculation';

/**
 * Predefined variant templates for common material categories
 */
export const CATEGORY_VARIANT_TEMPLATES: Record<string, CategoryVariantTemplate> = {
  // ============================================
  // TMT Bars / Steel
  // ============================================
  tmt: {
    fields: [
      {
        key: 'size',
        name: 'Size',
        type: 'text',
        unit: 'mm',
        required: false,
        placeholder: '8, 10, 12...',
        columnWidth: 80,
      },
      {
        key: 'weight_per_unit',
        name: 'Weight/Unit',
        type: 'number',
        unit: 'kg',
        required: false,
        step: 0.001,
        min: 0,
        placeholder: '0.395',
        columnWidth: 110,
        writeLegacyColumn: true,
      },
      {
        key: 'length_per_piece',
        name: 'Length/Pc',
        type: 'number',
        unit: 'ft',
        required: false,
        step: 0.1,
        min: 0,
        defaultValue: TMT_STANDARD_LENGTH,
        placeholder: '40',
        columnWidth: 100,
        writeLegacyColumn: true,
      },
      {
        key: 'rods_per_bundle',
        name: 'Rods/Bundle',
        type: 'integer',
        required: false,
        step: 1,
        min: 1,
        placeholder: '10',
        columnWidth: 100,
        writeLegacyColumn: true,
      },
    ],
    defaultUnit: 'piece',
    autoGenerateConfig: {
      enabled: true,
      buttonLabel: 'Auto-generate TMT sizes (8mm - 32mm)',
      presets: Object.entries(TMT_WEIGHTS).map(([size, weight]) => ({
        name: size,
        values: {
          size: size.replace('mm', ''),
          weight_per_unit: weight,
          length_per_piece: TMT_STANDARD_LENGTH,
          rods_per_bundle: TMT_RODS_PER_BUNDLE[size] ?? null,
        },
      })),
    },
  },

  // ============================================
  // Sand & Aggregates (Combined category)
  // ============================================
  sand_aggregates: {
    fields: [
      {
        key: 'material_type',
        name: 'Type',
        type: 'select',
        required: false,
        options: [
          // Aggregates / Gravel - sorted by size
          { value: '6mm', label: '6mm (Stone Chips)' },
          { value: '12mm', label: '12mm (1/2")' },
          { value: '20mm', label: '20mm (3/4" Jalli)' },
          { value: 'muakkal', label: 'Muakkal (0.9")' },
          { value: '25mm', label: '25mm (1")' },
          { value: '40mm', label: '40mm (1.5" Jalli)' },
          { value: '50mm', label: '50mm (2")' },
          { value: 'dust', label: 'Stone Dust / Crusher Dust' },
          // Sand types
          { value: 'msand', label: 'M-Sand' },
          { value: 'psand', label: 'P-Sand (Plastering)' },
          { value: 'river_sand', label: 'River Sand' },
          { value: 'filling_sand', label: 'Filling Sand' },
          { value: 'red_sand', label: 'Red Sand' },
        ],
        columnWidth: 200,
      },
      {
        key: 'grade',
        name: 'Grade',
        type: 'text',
        required: false,
        placeholder: 'Zone I, II, III / M20...',
        columnWidth: 120,
      },
    ],
    defaultUnit: 'cft',
  },

  // ============================================
  // Gravel / Aggregates (Standalone)
  // ============================================
  aggregates: {
    fields: [
      {
        key: 'size',
        name: 'Size',
        type: 'select',
        required: false,
        options: [
          { value: '6mm', label: '6mm (Stone Chips)' },
          { value: '12mm', label: '12mm (1/2")' },
          { value: '20mm', label: '20mm (3/4" Jalli)' },
          { value: 'muakkal', label: 'Muakkal (0.9")' },
          { value: '25mm', label: '25mm (1")' },
          { value: '40mm', label: '40mm (1.5" Jalli)' },
          { value: '50mm', label: '50mm (2")' },
          { value: 'dust', label: 'Stone Dust / Crusher Dust' },
        ],
        columnWidth: 180,
      },
      {
        key: 'grade',
        name: 'Grade',
        type: 'text',
        required: false,
        placeholder: 'M20, M25...',
        helperText: 'Concrete grade suitability',
        columnWidth: 100,
      },
    ],
    defaultUnit: 'cft',
  },

  // ============================================
  // Bricks / Blocks
  // ============================================
  bricks: {
    fields: [
      {
        key: 'dimensions',
        name: 'Dimensions',
        type: 'text',
        required: false,
        placeholder: '9x4x3, 6x4x2...',
        helperText: 'LxWxH in inches',
        columnWidth: 120,
      },
      {
        key: 'brick_type',
        name: 'Type',
        type: 'select',
        required: false,
        options: [
          { value: 'red_clay', label: 'Red Clay' },
          { value: 'fly_ash', label: 'Fly Ash' },
          { value: 'concrete', label: 'Concrete Block' },
          { value: 'aac', label: 'AAC Block' },
          { value: 'clc', label: 'CLC Block' },
          { value: 'solid', label: 'Solid Block' },
          { value: 'hollow', label: 'Hollow Block' },
        ],
        columnWidth: 130,
      },
      {
        key: 'strength',
        name: 'Strength',
        type: 'text',
        required: false,
        placeholder: '3.5 N/mm²',
        columnWidth: 100,
      },
    ],
    defaultUnit: 'nos',
  },

  // ============================================
  // Cement
  // ============================================
  cement: {
    fields: [
      {
        key: 'bag_weight',
        name: 'Bag Weight',
        type: 'select',
        required: false,
        options: [
          { value: '50kg', label: '50 kg Bag' },
          { value: '25kg', label: '25 kg Bag' },
          { value: '1kg', label: '1 kg Pack' },
        ],
        defaultValue: '50kg',
        columnWidth: 110,
      },
      {
        key: 'cement_grade',
        name: 'Grade',
        type: 'select',
        required: false,
        options: [
          { value: 'ppc', label: 'PPC' },
          { value: 'opc33', label: 'OPC 33' },
          { value: 'opc43', label: 'OPC 43' },
          { value: 'opc53', label: 'OPC 53' },
          { value: 'psc', label: 'PSC' },
          { value: 'white', label: 'White Cement' },
        ],
        columnWidth: 100,
      },
    ],
    defaultUnit: 'bag',
  },

  // ============================================
  // PVC/CPVC Pipes
  // ============================================
  pipes: {
    fields: [
      {
        key: 'diameter',
        name: 'Diameter',
        type: 'text',
        required: false,
        placeholder: '1/2", 3/4", 1"...',
        columnWidth: 100,
      },
      {
        // Keyed to the legacy column (not 'length') so PO/Request length math
        // sees pipe variants at all.
        key: 'length_per_piece',
        name: 'Length',
        type: 'number',
        unit: 'm',
        required: false,
        step: 0.5,
        defaultValue: 6,
        min: 0,
        columnWidth: 90,
        writeLegacyColumn: true,
      },
      {
        key: 'pipe_type',
        name: 'Type',
        type: 'select',
        required: false,
        options: [
          { value: 'pvc', label: 'PVC' },
          { value: 'cpvc', label: 'CPVC' },
          { value: 'upvc', label: 'uPVC' },
          { value: 'hdpe', label: 'HDPE' },
          { value: 'gi', label: 'GI Pipe' },
          { value: 'pprc', label: 'PPR-C' },
        ],
        columnWidth: 90,
      },
      {
        key: 'pressure_rating',
        name: 'Pressure',
        type: 'text',
        required: false,
        placeholder: '6 kg/cm²',
        columnWidth: 90,
      },
    ],
    defaultUnit: 'piece',
  },

  // ============================================
  // Electrical Wire / Cable
  // ============================================
  wire: {
    fields: [
      {
        key: 'gauge',
        name: 'Gauge',
        type: 'select',
        required: false,
        options: [
          { value: '0.75', label: '0.75 sq.mm' },
          { value: '1', label: '1 sq.mm' },
          { value: '1.5', label: '1.5 sq.mm' },
          { value: '2.5', label: '2.5 sq.mm' },
          { value: '4', label: '4 sq.mm' },
          { value: '6', label: '6 sq.mm' },
          { value: '10', label: '10 sq.mm' },
          { value: '16', label: '16 sq.mm' },
        ],
        columnWidth: 110,
      },
      {
        key: 'core_type',
        name: 'Core',
        type: 'select',
        required: false,
        options: [
          { value: 'single', label: 'Single Core' },
          { value: 'multi', label: 'Multi Core' },
          { value: 'flexible', label: 'Flexible' },
          { value: '2core', label: '2 Core' },
          { value: '3core', label: '3 Core' },
        ],
        columnWidth: 100,
      },
      {
        // Keyed to the legacy column (not 'coil_length') so PO/Request length
        // math sees cable variants at all.
        key: 'length_per_piece',
        name: 'Coil Length',
        type: 'number',
        unit: 'm',
        required: false,
        defaultValue: 90,
        min: 0,
        columnWidth: 100,
        writeLegacyColumn: true,
      },
    ],
    defaultUnit: 'rmt',
  },

  // ============================================
  // Sand
  // ============================================
  sand: {
    fields: [
      {
        key: 'sand_type',
        name: 'Type',
        type: 'select',
        required: false,
        options: [
          { value: 'msand', label: 'M-Sand' },
          { value: 'river', label: 'River Sand' },
          { value: 'plastering', label: 'Plastering Sand' },
          { value: 'filling', label: 'Filling Sand' },
          { value: 'red', label: 'Red Sand' },
        ],
        columnWidth: 140,
      },
      {
        key: 'grade',
        name: 'Grade',
        type: 'text',
        required: false,
        placeholder: 'Zone I, II, III',
        columnWidth: 100,
      },
    ],
    defaultUnit: 'cft',
  },

  // ============================================
  // Tiles / Flooring
  // ============================================
  tiles: {
    fields: [
      {
        key: 'tile_size',
        name: 'Size',
        type: 'text',
        required: false,
        placeholder: '2x2 ft, 60x60 cm',
        columnWidth: 120,
      },
      {
        key: 'thickness',
        name: 'Thickness',
        type: 'text',
        required: false,
        placeholder: '8mm, 10mm',
        columnWidth: 90,
      },
      {
        key: 'tile_type',
        name: 'Type',
        type: 'select',
        required: false,
        options: [
          { value: 'ceramic', label: 'Ceramic' },
          { value: 'vitrified', label: 'Vitrified' },
          { value: 'porcelain', label: 'Porcelain' },
          { value: 'mosaic', label: 'Mosaic' },
          { value: 'granite', label: 'Granite' },
          { value: 'marble', label: 'Marble' },
        ],
        columnWidth: 100,
      },
      {
        key: 'finish',
        name: 'Finish',
        type: 'select',
        required: false,
        options: [
          { value: 'glossy', label: 'Glossy' },
          { value: 'matte', label: 'Matte' },
          { value: 'satin', label: 'Satin' },
          { value: 'rustic', label: 'Rustic' },
          { value: 'polished', label: 'Polished' },
        ],
        columnWidth: 90,
      },
      {
        key: 'pieces_per_box',
        name: 'Pieces/Box',
        type: 'integer',
        required: false,
        min: 1,
        step: 1,
        placeholder: '4',
        columnWidth: 100,
      },
    ],
    defaultUnit: 'sqft',
  },

  // ============================================
  // Paint
  // ============================================
  paint: {
    fields: [
      {
        key: 'volume',
        name: 'Volume',
        type: 'select',
        required: false,
        options: [
          { value: '1L', label: '1 Liter' },
          { value: '4L', label: '4 Liters' },
          { value: '10L', label: '10 Liters' },
          { value: '20L', label: '20 Liters' },
        ],
        columnWidth: 100,
      },
      {
        key: 'paint_type',
        name: 'Type',
        type: 'select',
        required: false,
        options: [
          { value: 'emulsion', label: 'Emulsion' },
          { value: 'distemper', label: 'Distemper' },
          { value: 'enamel', label: 'Enamel' },
          { value: 'primer', label: 'Primer' },
          { value: 'putty', label: 'Putty' },
          { value: 'texture', label: 'Texture' },
        ],
        columnWidth: 100,
      },
      {
        key: 'finish',
        name: 'Finish',
        type: 'select',
        required: false,
        options: [
          { value: 'matte', label: 'Matte' },
          { value: 'silk', label: 'Silk/Satin' },
          { value: 'gloss', label: 'Gloss' },
          { value: 'eggshell', label: 'Eggshell' },
        ],
        columnWidth: 90,
      },
      {
        // Every live Paint variant carries this ('Retail' / 'Project') — it is
        // the only spec key anyone has populated organically besides jalli size.
        // Neither legacy template declared it, so editing a Paint variant used
        // to drop it on save.
        key: 'tier',
        name: 'Tier',
        type: 'select',
        required: false,
        options: [
          { value: 'Retail', label: 'Retail' },
          { value: 'Project', label: 'Project' },
        ],
        columnWidth: 100,
      },
    ],
    defaultUnit: 'liter',
  },

  // ============================================
  // Waterproofing
  // ============================================
  waterproofing: {
    fields: [
      {
        key: 'product_type',
        name: 'Type',
        type: 'select',
        required: false,
        options: [
          { value: 'liquid', label: 'Liquid Membrane' },
          { value: 'sheet', label: 'Sheet/Roll' },
          { value: 'powder', label: 'Powder Additive' },
          { value: 'tape', label: 'Sealing Tape' },
        ],
        columnWidth: 130,
      },
      {
        key: 'coverage',
        name: 'Coverage',
        type: 'text',
        required: false,
        placeholder: 'sqft/L, sqm/kg',
        columnWidth: 100,
      },
    ],
    defaultUnit: 'liter',
  },

  // ============================================
  // Fittings (Plumbing/Electrical)
  // ============================================
  fittings: {
    fields: [
      {
        key: 'fitting_size',
        name: 'Size',
        type: 'text',
        required: false,
        placeholder: '1/2", 3/4", 1"...',
        columnWidth: 100,
      },
      {
        key: 'fitting_type',
        name: 'Type',
        type: 'text',
        required: false,
        placeholder: 'Elbow, Tee, Union...',
        columnWidth: 120,
      },
    ],
    defaultUnit: 'nos',
  },

  // ============================================
  // Glass & Aluminum (GLS) — cut to size
  // ============================================
  glass: {
    fields: [
      { key: 'width_ft', name: 'Width', type: 'number', unit: 'ft', required: false, min: 0, step: 0.25, columnWidth: 90 },
      { key: 'height_ft', name: 'Height', type: 'number', unit: 'ft', required: false, min: 0, step: 0.25, columnWidth: 90 },
      {
        key: 'thickness_mm',
        name: 'Thickness',
        type: 'number',
        unit: 'mm',
        required: false,
        min: 0,
        step: 0.5,
        placeholder: '5',
        columnWidth: 100,
      },
    ],
    defaultUnit: 'sqft',
  },

  // ============================================
  // Pumps & Motors (PMP)
  // ============================================
  pumps: {
    fields: [
      { key: 'hp', name: 'Power', type: 'number', unit: 'HP', required: false, min: 0, step: 0.25, placeholder: '1', columnWidth: 90 },
      { key: 'stages', name: 'Stages', type: 'integer', required: false, min: 1, step: 1, placeholder: '30', columnWidth: 90 },
    ],
    defaultUnit: 'nos',
  },

  // ============================================
  // Default (Generic)
  //
  // An EMPTY field list is deliberate, not a stub: categories with nothing
  // structured worth capturing (hardware, tools, fasteners, misc) render no
  // Specifications section at all. This replaced a generic "Specification" text
  // box — a catch-all nobody filled, which is a large part of why only 11 of ~60
  // variants carry any specs today.
  // ============================================
  default: {
    fields: [],
  },

  // ============================================
  // Wood & Timber (WOD)
  // ============================================
  wood_timber: {
    fields: [
      {
        key: 'length_value',
        name: 'Length',
        type: 'number' as const,
        required: false,
        placeholder: '7',
        helperText: 'e.g. 7 for 7 feet',
        columnWidth: 90,
      },
      {
        key: 'length_unit',
        name: 'L-Unit',
        type: 'select' as const,
        required: false,
        options: [
          { value: 'ft', label: 'ft' },
          { value: 'in', label: 'in' },
          { value: 'mm', label: 'mm' },
          { value: 'cm', label: 'cm' },
        ],
        defaultValue: 'ft',
        columnWidth: 70,
      },
      {
        key: 'width_value',
        name: 'Width',
        type: 'number' as const,
        required: false,
        placeholder: '3',
        columnWidth: 80,
      },
      {
        key: 'width_unit',
        name: 'W-Unit',
        type: 'select' as const,
        required: false,
        options: [
          { value: 'in', label: 'in' },
          { value: 'ft', label: 'ft' },
          { value: 'mm', label: 'mm' },
          { value: 'cm', label: 'cm' },
        ],
        defaultValue: 'in',
        columnWidth: 70,
      },
      {
        key: 'thickness_value',
        name: 'Thickness',
        type: 'number' as const,
        required: false,
        placeholder: '1.5',
        columnWidth: 90,
      },
      {
        key: 'thickness_unit',
        name: 'T-Unit',
        type: 'select' as const,
        required: false,
        options: [
          { value: 'in', label: 'in' },
          { value: 'mm', label: 'mm' },
          { value: 'cm', label: 'cm' },
          { value: 'ft', label: 'ft' },
        ],
        // Inches: this template now serves linear timber only (teak reapers are
        // quoted 4" x 2"). Sheet goods moved to `plywood_boards`, which is
        // mm-first — that is where the millimetre default belongs.
        defaultValue: 'in',
        columnWidth: 70,
      },
    ],
    defaultUnit: 'cft',
  },

  // ============================================
  // Plywood & Boards (WOD-PLY) — sheet goods
  //
  // Split out of wood_timber because Wood & Timber holds two incompatible
  // shapes: linear stock priced by cross-section x length (teak), and sheets
  // priced by sheet size x thickness (plywood). One category template served
  // the former and mislabelled the latter's thickness as "Cross-section (mm)".
  // ============================================
  plywood_boards: {
    fields: [
      {
        key: 'sheet_size',
        name: 'Sheet size',
        type: 'select',
        required: true,
        options: [
          { value: '8x4', label: '8 x 4 ft' },
          { value: '7x4', label: '7 x 4 ft' },
          { value: '6x4', label: '6 x 4 ft' },
          { value: '8x3', label: '8 x 3 ft' },
          { value: '6x3', label: '6 x 3 ft' },
        ],
        defaultValue: '8x4',
        columnWidth: 110,
      },
      {
        // Deliberately a number, not a select: DynamicVariantField's select
        // branch stores the raw string, which would put "18" in the JSONB while
        // every other numeric spec holds a number.
        key: 'thickness_mm',
        name: 'Thickness',
        type: 'number',
        unit: 'mm',
        required: true,
        min: 3,
        step: 1,
        placeholder: '18',
        helperText: '6 / 9 / 12 / 18 / 19 / 25',
        columnWidth: 110,
      },
      {
        // MR vs BWP is the biggest price driver after thickness (BWP runs ~2x
        // MR at the same size), so a quote without it is underspecified.
        key: 'grade',
        name: 'Grade',
        type: 'select',
        required: false,
        options: [
          { value: 'MR', label: 'MR (interior)' },
          { value: 'BWR', label: 'BWR (semi-wet)' },
          { value: 'BWP', label: 'BWP / Marine' },
        ],
        columnWidth: 120,
      },
    ],
    defaultUnit: 'sqft',
    nameTemplate: '{sheet_size} · {thickness_mm}mm',
  },
};

/**
 * Category code -> template key. Checked FIRST, before any pattern matching.
 *
 * These are the real `material_categories.code` values. An earlier version of
 * this map was written against invented codes (TMT, STEEL, TILE, PAINT, ELEC…)
 * of which only CEM and WOD ever matched a real row — everything else silently
 * fell through to the name patterns below. Adding a key here that no category
 * actually has is worse than no key at all: it reads as intentional.
 *
 * WOD-PLY must be here specifically. The `wood_timber` pattern below matches
 * /plywood/, so without an exact code hit, Plywood & Boards would resolve back
 * to the timber template — the exact bug this split exists to fix.
 */
export const CATEGORY_CODE_MAP: Record<string, string> = {
  CEM: 'cement',
  'CEM-PPC': 'cement',
  'CEM-OPC53': 'cement',
  STL: 'tmt',
  'STL-TMT': 'tmt',
  'STL-WIRE': 'wire',
  AGG: 'sand_aggregates',
  'AGG-MSAND': 'sand',
  'AGG-PSAND': 'sand',
  'AGG-BM20': 'aggregates',
  BRK: 'bricks',
  'BRK-RED': 'bricks',
  'BRK-CMT': 'bricks',
  'BRK-AAC': 'bricks',
  PLB: 'pipes',
  ELC: 'wire',
  WOD: 'wood_timber',
  'WOD-PLY': 'plywood_boards',
  TIL: 'tiles',
  PNT: 'paint',
  GLS: 'glass',
  WPF: 'waterproofing',
  PMP: 'pumps',
  'PMP-SUB': 'pumps',
  // Deliberately unmapped -> `default` (no spec section): HRD, MSC, CTR,
  // PMP-PNL. See INTENTIONALLY_UNMAPPED_CODES in the test file.
};

/**
 * Lower-cased category NAME -> template key. Checked after the code map and
 * before the name patterns.
 *
 * This step is load-bearing, not a convenience: 15 live subcategories have
 * code = NULL (10 under Electrical, 5 under Hardware — 'Wiring & Cables',
 * 'Switchgear', 'Tools', 'Fasteners'…). A code-only resolver cannot see them at
 * all, and the patterns are too blunt to tell 'Switchgear' (no specs) from
 * 'Electrical Cables' (gauge + coil length). Do not collapse this into the code
 * map.
 */
export const CATEGORY_NAME_MAP: Record<string, string> = {
  // Sheet goods. Also mapped by code (WOD-PLY), but a code-less row would
  // otherwise walk up to WOD and land back on the timber template.
  'plywood & boards': 'plywood_boards',
  plywood: 'plywood_boards',

  // Electrical subcategories (all code-less)
  'wiring & cables': 'wire',
  'electrical wires': 'wire',
  'electrical cables': 'wire',
  'tv & data cables': 'wire',
  'conduits & fittings': 'pipes',
  'conduit fittings': 'fittings',
  'distribution boxes': 'default',
  'junction boxes': 'default',
  'electrical accessories': 'default',
  'insulation tapes': 'default',
  switchgear: 'default',

  // Hardware subcategories (all code-less) — nothing structured worth capturing
  tools: 'default',
  fasteners: 'default',
  clamps: 'default',
  'pipes & fittings': 'fittings',

  // Pump subcategories
  'submersible pumps': 'pumps',
  'pump panels & accessories': 'default',
};

/**
 * Pattern matchers for category name detection
 * Order matters - more specific patterns first
 */
const CATEGORY_PATTERNS: Array<{ pattern: RegExp; templateKey: string }> = [
  // TMT / Steel
  { pattern: /\b(tmt|steel|bar|rod|rebar)\b/i, templateKey: 'tmt' },
  // Sand & Aggregates (combined) - MUST come before individual sand/aggregates patterns
  { pattern: /sand\s*[&,]\s*aggregate/i, templateKey: 'sand_aggregates' },
  { pattern: /aggregate\s*[&,]\s*sand/i, templateKey: 'sand_aggregates' },
  // Aggregates (standalone)
  { pattern: /\b(aggregate|gravel|jalli|blue\s*metal|stone\s*chip|coarse)\b/i, templateKey: 'aggregates' },
  // Bricks / Blocks
  { pattern: /\b(brick|block|aac|clc|fly\s*ash)\b/i, templateKey: 'bricks' },
  // Cement
  { pattern: /\b(cement|ppc|opc|psc)\b/i, templateKey: 'cement' },
  // Wood & Timber
  { pattern: /\b(wood|timber|lumber|plywood|particle\s*board|mdf)\b/i, templateKey: 'wood_timber' },
  // Pipes
  { pattern: /\b(pipe|pvc|cpvc|upvc|hdpe|plumbing)\b/i, templateKey: 'pipes' },
  // Wire / Cable
  { pattern: /\b(wire|cable|electrical\s*wire)\b/i, templateKey: 'wire' },
  // Sand (standalone)
  { pattern: /\b(sand|m-sand|msand|river\s*sand)\b/i, templateKey: 'sand' },
  // Tiles
  { pattern: /\b(tile|flooring|ceramic|vitrified|porcelain)\b/i, templateKey: 'tiles' },
  // Paint
  { pattern: /\b(paint|primer|distemper|enamel|putty)\b/i, templateKey: 'paint' },
  // Waterproofing — no trailing \b: it would never match "Waterproofing",
  // since \b requires a boundary between 'waterproof' and 'ing'.
  { pattern: /waterproof|\b(dr\s*fixit|fosroc|sika)\b/i, templateKey: 'waterproofing' },
  // Fittings
  { pattern: /\b(fitting|elbow|tee|union|coupling|valve)\b/i, templateKey: 'fittings' },
];

const normalizeName = (name?: string | null): string =>
  (name ?? '').toLowerCase().trim();

/**
 * Resolve the template key for a category.
 *
 * Most specific signal wins, so a subcategory can override its parent:
 *   1. the category's own code      (WOD-PLY -> plywood_boards)
 *   2. the category's own name      (code-less subcats: 'Switchgear' -> default)
 *   3. the parent's code            (a new WOD child inherits wood_timber)
 *   4. the parent's name
 *   5. name patterns                (safety net for categories added later)
 *   6. default                      (no spec section)
 *
 * Steps 1-2 must both precede 3-5: the patterns are deliberately broad and would
 * otherwise swallow a subcategory into its parent's template.
 */
export function getCategoryTemplateKey(
  category: CategoryForTemplate | null,
  parentCategory?: CategoryForTemplate | null
): string {
  if (!category) return 'default';

  const ownCode = category.code?.toUpperCase();
  if (ownCode && CATEGORY_CODE_MAP[ownCode]) return CATEGORY_CODE_MAP[ownCode];

  const ownName = normalizeName(category.name);
  if (ownName && CATEGORY_NAME_MAP[ownName]) return CATEGORY_NAME_MAP[ownName];

  if (parentCategory) {
    const parentCode = parentCategory.code?.toUpperCase();
    if (parentCode && CATEGORY_CODE_MAP[parentCode]) {
      return CATEGORY_CODE_MAP[parentCode];
    }
    const parentName = normalizeName(parentCategory.name);
    if (parentName && CATEGORY_NAME_MAP[parentName]) {
      return CATEGORY_NAME_MAP[parentName];
    }
  }

  const fullName = parentCategory
    ? `${parentCategory.name} ${category.name}`
    : category.name;

  for (const { pattern, templateKey } of CATEGORY_PATTERNS) {
    if (pattern.test(fullName)) {
      return templateKey;
    }
  }

  return 'default';
}

/**
 * Get the variant template for a category.
 *
 * @param category - The category to get template for
 * @param parentCategory - Optional parent category for hierarchical matching
 */
export function getCategoryTemplate(
  category: CategoryForTemplate | null,
  parentCategory?: CategoryForTemplate | null
): CategoryVariantTemplate {
  const key = getCategoryTemplateKey(category, parentCategory);
  return CATEGORY_VARIANT_TEMPLATES[key] ?? CATEGORY_VARIANT_TEMPLATES.default;
}

/**
 * Render a template's `nameTemplate` against spec values, e.g.
 * '{sheet_size} · {thickness_mm}mm' + {sheet_size:'8x4', thickness_mm:18}
 *   -> '8x4 · 18mm'
 *
 * Returns '' unless every token has a value — a half-derived name ('8x4 · mm')
 * is worse than leaving the field alone for the user to type.
 */
export function renderNameTemplate(
  nameTemplate: string | undefined,
  values: Record<string, unknown>
): string {
  if (!nameTemplate) return '';
  let missing = false;
  const rendered = nameTemplate.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = values[key];
    if (value === undefined || value === null || String(value).trim() === '') {
      missing = true;
      return '';
    }
    return String(value).trim();
  });
  return missing ? '' : rendered.trim();
}

/**
 * Check if a category has auto-generate capability
 */
export function categoryHasAutoGenerate(
  category: CategoryForTemplate | null,
  parentCategory?: CategoryForTemplate | null
): boolean {
  const template = getCategoryTemplate(category, parentCategory);
  return template.autoGenerateConfig?.enabled ?? false;
}

/**
 * Get all available template keys (for debugging/admin)
 */
export function getAllTemplateKeys(): string[] {
  return Object.keys(CATEGORY_VARIANT_TEMPLATES);
}
