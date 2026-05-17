export type LengthUnit = 'ft' | 'in';

/** Convert a value to feet. */
export function toFeet(value: number, unit: LengthUnit): number {
  return unit === 'in' ? value / 12 : value;
}

/**
 * Calculate cubic feet (Gana adi) from timber dimensions.
 * Length can be ft or in; width and thickness are typically in inches but accept ft too.
 */
export function calculateCubicFeet(
  length: number, lengthUnit: LengthUnit,
  width: number, widthUnit: LengthUnit,
  thickness: number, thicknessUnit: LengthUnit,
  qty: number,
): number {
  return toFeet(length, lengthUnit)
    * toFeet(width, widthUnit)
    * toFeet(thickness, thicknessUnit)
    * qty;
}

/** Format a cft value with 3 decimal places. */
export function formatCft(cft: number): string {
  return `${cft.toFixed(3)} cft`;
}

/** qty × unit price = total cost */
export function calculateLinearCost(qty: number, unitPrice: number): number {
  return qty * unitPrice;
}

/** Format a number as Indian Rupees (no decimals). */
export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}
