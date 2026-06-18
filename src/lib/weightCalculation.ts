import type { WeightCalculation } from "@/types/material.types";

/**
 * Calculate total weight from quantity for materials with weight_per_unit
 */
export function calculateWeight(
  weightPerUnit: number | null | undefined,
  quantity: number,
  weightUnit: string = "kg"
): WeightCalculation | null {
  if (!weightPerUnit || weightPerUnit <= 0 || quantity <= 0) {
    return null;
  }

  const totalWeight = quantity * weightPerUnit;

  return {
    pieces: quantity,
    totalWeight,
    weightUnit,
    weightPerUnit,
    displayText: `${quantity} pcs = ${formatWeight(totalWeight)} ${weightUnit}`,
  };
}

/**
 * Format weight with appropriate decimal places
 */
export function formatWeight(weight: number): string {
  if (weight >= 1000) {
    return (weight / 1000).toFixed(2);
  }
  if (weight >= 100) {
    return weight.toFixed(1);
  }
  if (weight >= 1) {
    return weight.toFixed(2);
  }
  return weight.toFixed(3);
}

/**
 * Convert weight between units
 */
export function convertWeight(
  weight: number,
  fromUnit: string,
  toUnit: string
): number {
  const toKg: Record<string, number> = {
    g: 0.001,
    kg: 1,
    ton: 1000,
  };

  const weightInKg = weight * (toKg[fromUnit] || 1);
  return weightInKg / (toKg[toUnit] || 1);
}

/**
 * Format weight with automatic unit conversion for large values
 */
export function formatWeightWithUnit(
  weight: number | null | undefined,
  unit: string = "kg"
): string {
  if (weight === null || weight === undefined) return "-";

  // Convert large kg values to tons
  if (unit === "kg" && weight >= 1000) {
    return `${(weight / 1000).toFixed(2)} ton`;
  }
  // Convert large g values to kg
  if (unit === "g" && weight >= 1000) {
    return `${(weight / 1000).toFixed(2)} kg`;
  }

  return `${formatWeight(weight)} ${unit}`;
}

/**
 * Format quantity with weight equivalent
 */
export function formatQuantityWithWeight(
  quantity: number | null | undefined,
  unit: string,
  weightPerUnit: number | null | undefined,
  weightUnit: string = "kg"
): string {
  if (quantity === null || quantity === undefined) return "-";

  const baseText = `${quantity.toLocaleString("en-IN")} ${unit}`;

  if (weightPerUnit && weightPerUnit > 0) {
    const totalWeight = quantity * weightPerUnit;
    return `${baseText} (${formatWeightWithUnit(totalWeight, weightUnit)})`;
  }

  return baseText;
}

// Standard TMT bar weights per METER (industry standard specification)
// Note: 6mm removed as not available in local shops
export const TMT_WEIGHTS_PER_METER: Record<string, number> = {
  "8mm": 0.395, // kg per meter
  "10mm": 0.617,
  "12mm": 0.888,
  "16mm": 1.58,
  "20mm": 2.469,
  "25mm": 3.858,
  "32mm": 6.316,
};

// For backward compatibility
export const TMT_WEIGHTS = TMT_WEIGHTS_PER_METER;

/**
 * Calculate actual piece weight from weight per meter and length
 * @param weightPerMeter - Weight in kg per meter
 * @param lengthPerPiece - Length of piece
 * @param lengthUnit - Unit of length ('ft' or 'm')
 * @returns Actual weight of one piece in kg
 */
export function calculatePieceWeight(
  weightPerMeter: number | null | undefined,
  lengthPerPiece: number | null | undefined,
  lengthUnit: string = "ft"
): number | null {
  if (!weightPerMeter || !lengthPerPiece) return null;

  // Convert length to meters
  const lengthInMeters = lengthUnit === "ft"
    ? lengthPerPiece * 0.3048  // 1 ft = 0.3048 m
    : lengthPerPiece;

  return weightPerMeter * lengthInMeters;
}

// Standard rods per bundle for different TMT sizes
// Note: 6mm removed as not available in local shops
export const TMT_RODS_PER_BUNDLE: Record<string, number> = {
  "8mm": 10,
  "10mm": 7,
  "12mm": 5,
  "16mm": 3,
  "20mm": 2,
  "25mm": 2,
  "32mm": 2,
};

// Standard length for TMT bars (40 feet is standard in local market)
export const TMT_STANDARD_LENGTH = 40;
export const TMT_STANDARD_LENGTH_UNIT = "ft";

/**
 * Estimate the weight of ONE piece for a weight-based material (e.g. a TMT rod).
 *
 * Prefers the last ACTUAL delivered kg/piece (learned from real deliveries — the
 * weight of a rod varies batch to batch, so a recent real measurement beats the
 * theoretical spec). Falls back to the theoretical weight-per-meter × length
 * formula when we have no delivery history yet.
 */
export function estimatePieceWeight(params: {
  lastActualPerPiece?: number | null;
  weightPerMeter?: number | null;
  lengthPerPiece?: number | null;
  lengthUnit?: string;
}): number | null {
  const {
    lastActualPerPiece,
    weightPerMeter,
    lengthPerPiece,
    lengthUnit = "ft",
  } = params;

  if (lastActualPerPiece && lastActualPerPiece > 0) {
    return lastActualPerPiece;
  }
  return calculatePieceWeight(weightPerMeter, lengthPerPiece, lengthUnit);
}

export interface GstSplit {
  /** Amount excluding GST */
  net: number;
  /** GST portion */
  gst: number;
  /** Amount including GST */
  gross: number;
}

/**
 * Split a GST-INCLUSIVE (gross) amount into its net + GST parts at the given rate.
 * This is the single source of truth for "the bill is inclusive" maths — TMT
 * yellow bills always quote a gross figure.
 */
export function extractGstFromGross(
  gross: number | null | undefined,
  rate: number | null | undefined
): GstSplit {
  const g = gross || 0;
  const r = rate || 0;
  if (r <= 0) return { net: g, gst: 0, gross: g };
  const net = g / (1 + r / 100);
  return { net, gst: g - net, gross: g };
}

/**
 * Add GST ON TOP of a net (GST-exclusive) amount at the given rate.
 * Used when the "enter without GST" mode is unlocked.
 */
export function addGstToNet(
  net: number | null | undefined,
  rate: number | null | undefined
): GstSplit {
  const n = net || 0;
  const r = rate || 0;
  const gst = r > 0 ? (n * r) / 100 : 0;
  return { net: n, gst, gross: n + gst };
}

/**
 * Net line value for a material line.
 * - per_kg   → weight × rate/kg (prefers the actual delivered weight, falls back
 *              to the calculated estimate — so it works at both PO and delivery)
 * - per_piece → qty × unit price
 */
export function computeLineAmount(item: {
  pricing_mode?: string | null;
  unit_price?: number | null;
  quantity?: number | null;
  actual_weight?: number | null;
  calculated_weight?: number | null;
}): number {
  const rate = item.unit_price || 0;
  if (item.pricing_mode === "per_kg") {
    const weight = item.actual_weight ?? item.calculated_weight ?? 0;
    return weight * rate;
  }
  return (item.quantity || 0) * rate;
}

/**
 * Weight-variance threshold (%). Beyond this, the delivered weight is "drastically"
 * off the estimate and the site engineer is warned (likely wrong order / mis-weigh).
 */
export const WEIGHT_VARIANCE_WARN_PCT = 10;

/**
 * % difference of the actual kg/piece vs the expected (estimate) kg/piece.
 * Positive = heavier than expected, negative = lighter. Null when not computable.
 */
export function weightVariancePct(
  actualPerPiece: number | null | undefined,
  expectedPerPiece: number | null | undefined
): number | null {
  if (!actualPerPiece || !expectedPerPiece || expectedPerPiece <= 0) return null;
  return ((actualPerPiece - expectedPerPiece) / expectedPerPiece) * 100;
}

/** True when the variance exceeds the warn threshold (in either direction). */
export function isLargeWeightVariance(
  variancePct: number | null | undefined
): boolean {
  return variancePct != null && Math.abs(variancePct) > WEIGHT_VARIANCE_WARN_PCT;
}
