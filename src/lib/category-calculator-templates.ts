// src/lib/category-calculator-templates.ts
import {
  calculateCubicFeet,
  calculateLinearCost,
  type LengthUnit,
} from './calculatorMath';
import { TMT_WEIGHTS_PER_METER } from './weightCalculation';

export type UnitOption = 'ft' | 'in' | 'mm' | 'm' | 'pcs' | 'sqft' | 'sqm' | '%';

export type CalculatorInputField = {
  key: string;
  label: string;
  unitOptions: UnitOption[];
  defaultUnit: UnitOption;
  defaultValue?: number;
  min?: number;
  step?: number;
};

export type VendorQuote = {
  vendorId: string;
  vendorName: string;
  unitPrice: number;
  updatedAt: string | null;
  priceIncludesGst: boolean;
};

export type CalculatorTemplate = {
  /** Category code this template handles, e.g. 'WOD' */
  categoryCode: string;
  inputs: CalculatorInputField[];
  /** Unit shown after the computed result, e.g. 'cft' */
  outputUnit: string;
  /** Human-readable label for the computed result, e.g. 'Gana adi (cft)' */
  outputLabel: string;
  /** Whether vendor quotes are keyed by brand ('brand') or no dimension ('none') */
  pricingDimension: 'brand' | 'none';
  /** Label for the pricing dimension selector, e.g. 'Quality' or 'Brand' */
  pricingDimensionLabel: string;
  computeOutput: (
    values: Record<string, number>,
    units: Record<string, UnitOption>,
  ) => number;
  computeCost: (output: number, unitPrice: number) => number;
  /** Prompt template shown in the AI-assist dialog */
  aiPrompt: string;
};

// ─── WOD: Wood & Timber ──────────────────────────────────────────────────────

const WOOD_AI_PROMPT = `I am uploading an image of a window or door drawing/photo.
Extract every piece of wood needed and return ONLY valid JSON (no markdown, no prose):
[
  {
    "name": "string (e.g. Door frame horizontal)",
    "length_ft": number,
    "width_in": number,
    "thickness_in": number,
    "qty": number,
    "quality_tier": "1st Quality" | "2nd Quality" | "3rd Quality" | null
  }
]
Use feet for length and inches for width/thickness. Estimate if exact values are unclear.`;

// ─── STL/TMT: Steel bars ─────────────────────────────────────────────────────

const STEEL_AI_PROMPT = `I am uploading a structural drawing or bar-bending schedule.
Extract every TMT bar requirement and return ONLY valid JSON (no markdown, no prose):
[
  {
    "diameter_mm": 8 | 10 | 12 | 16 | 20 | 25 | 32,
    "length_m": number,
    "qty": number,
    "brand": "string | null"
  }
]`;

// ─── TIL: Tiles ───────────────────────────────────────────────────────────────

const TILES_AI_PROMPT = `I am uploading a floor/wall plan or a photo.
Extract tiling requirements and return ONLY valid JSON (no markdown, no prose):
[
  {
    "area_sqft": number,
    "tile_size_sqft": number,
    "wastage_pct": number,
    "brand": "string | null"
  }
]`;

export const CALCULATOR_TEMPLATES: Record<string, CalculatorTemplate> = {
  // Matches material_categories.code = 'WOD'
  WOD: {
    categoryCode: 'WOD',
    inputs: [
      { key: 'length',    label: 'Length',    unitOptions: ['ft', 'in'], defaultUnit: 'ft' },
      { key: 'width',     label: 'Width',     unitOptions: ['in', 'ft'], defaultUnit: 'in' },
      { key: 'thickness', label: 'Thickness', unitOptions: ['in', 'ft'], defaultUnit: 'in' },
      { key: 'qty',       label: 'Pieces',    unitOptions: ['pcs'],      defaultUnit: 'pcs', defaultValue: 1, min: 1, step: 1 },
    ],
    outputUnit: 'cft',
    outputLabel: 'Gana adi (cft)',
    pricingDimension: 'brand',
    pricingDimensionLabel: 'Quality',
    computeOutput: (values, units) => calculateCubicFeet(
      values.length    ?? 0, (units.length    ?? 'ft') as LengthUnit,
      values.width     ?? 0, (units.width     ?? 'in') as LengthUnit,
      values.thickness ?? 0, (units.thickness ?? 'in') as LengthUnit,
      values.qty       ?? 0,
    ),
    computeCost: calculateLinearCost,
    aiPrompt: WOOD_AI_PROMPT,
  },

  // Matches material_categories.code = 'STL'
  STL: {
    categoryCode: 'STL',
    inputs: [
      {
        key: 'diameter_mm',
        label: 'Diameter',
        unitOptions: ['mm'],
        defaultUnit: 'mm',
        defaultValue: 12,
        min: 8,
        step: 2,
      },
      {
        key: 'length',
        label: 'Length per rod',
        unitOptions: ['m', 'ft'],
        defaultUnit: 'm',
        defaultValue: 12,
        min: 0.1,
        step: 0.5,
      },
      {
        key: 'qty',
        label: 'Rods',
        unitOptions: ['pcs'],
        defaultUnit: 'pcs',
        defaultValue: 1,
        min: 1,
        step: 1,
      },
    ],
    outputUnit: 'kg',
    outputLabel: 'Total weight (kg)',
    pricingDimension: 'brand',
    pricingDimensionLabel: 'Brand',
    computeOutput: (values, units) => {
      const dia = `${values.diameter_mm ?? 12}mm`;
      const weightPerMeter = TMT_WEIGHTS_PER_METER[dia] ?? 0;
      const rawLength = values.length ?? 0;
      const lengthM = units.length === 'ft' ? rawLength * 0.3048 : rawLength;
      const qty = values.qty ?? 0;
      return weightPerMeter * lengthM * qty;
    },
    computeCost: calculateLinearCost,
    aiPrompt: STEEL_AI_PROMPT,
  },

  // Matches material_categories.code = 'TIL'
  TIL: {
    categoryCode: 'TIL',
    inputs: [
      { key: 'area',           label: 'Area to tile',   unitOptions: ['sqft', 'sqm'], defaultUnit: 'sqft' },
      { key: 'tile_sqft',      label: 'Tile coverage',  unitOptions: ['sqft'],        defaultUnit: 'sqft', defaultValue: 1 },
      { key: 'wastage_pct',    label: 'Wastage %',      unitOptions: ['%'],           defaultUnit: '%',   defaultValue: 10, min: 0, step: 1 },
    ],
    outputUnit: 'pcs',
    outputLabel: 'Tiles needed',
    pricingDimension: 'brand',
    pricingDimensionLabel: 'Brand',
    computeOutput: (values, units) => {
      const areaSqft = units.area === 'sqm'
        ? (values.area ?? 0) * 10.764
        : (values.area ?? 0);
      const coverage = values.tile_sqft ?? 1;
      const wastage = values.wastage_pct ?? 10;
      if (coverage <= 0) return 0;
      return Math.ceil((areaSqft / coverage) * (1 + wastage / 100));
    },
    computeCost: calculateLinearCost,
    aiPrompt: TILES_AI_PROMPT,
  },
};

/** Fallback template for categories without a specific schema. */
export const DEFAULT_CALCULATOR_TEMPLATE: CalculatorTemplate = {
  categoryCode: 'default',
  inputs: [
    { key: 'qty', label: 'Quantity', unitOptions: ['pcs'], defaultUnit: 'pcs', defaultValue: 1, min: 1, step: 1 },
  ],
  outputUnit: 'pcs',
  outputLabel: 'Quantity',
  pricingDimension: 'brand',
  pricingDimensionLabel: 'Brand',
  computeOutput: (values) => values.qty ?? 0,
  computeCost: calculateLinearCost,
  aiPrompt: `Extract material requirements and return ONLY valid JSON (no markdown, no prose):
[{ "name": "string", "qty": number, "unit": "string", "brand": "string | null" }]`,
};

export function getCalculatorTemplate(categoryCode: string | undefined): CalculatorTemplate {
  if (!categoryCode) return DEFAULT_CALCULATOR_TEMPLATE;
  return CALCULATOR_TEMPLATES[categoryCode] ?? DEFAULT_CALCULATOR_TEMPLATE;
}
