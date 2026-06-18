import { describe, it, expect } from 'vitest';
import {
  calculateWeight,
  formatWeight,
  convertWeight,
  formatWeightWithUnit,
  formatQuantityWithWeight,
  estimatePieceWeight,
  extractGstFromGross,
  addGstToNet,
  computeLineAmount,
  weightVariancePct,
  isLargeWeightVariance,
  WEIGHT_VARIANCE_WARN_PCT,
  TMT_WEIGHTS,
  TMT_RODS_PER_BUNDLE,
  TMT_STANDARD_LENGTH,
} from './weightCalculation';

describe('Weight Calculations', () => {
  describe('calculateWeight', () => {
    it('returns null for invalid inputs', () => {
      expect(calculateWeight(null, 10)).toBeNull();
      expect(calculateWeight(undefined, 10)).toBeNull();
      expect(calculateWeight(0, 10)).toBeNull();
      expect(calculateWeight(-1, 10)).toBeNull();
      expect(calculateWeight(0.5, 0)).toBeNull();
      expect(calculateWeight(0.5, -5)).toBeNull();
    });

    it('calculates weight correctly', () => {
      const result = calculateWeight(0.5, 100, 'kg');

      expect(result).not.toBeNull();
      expect(result!.pieces).toBe(100);
      expect(result!.totalWeight).toBe(50);
      expect(result!.weightUnit).toBe('kg');
      expect(result!.weightPerUnit).toBe(0.5);
    });

    it('generates correct display text', () => {
      const result = calculateWeight(0.617, 7, 'kg');

      expect(result).not.toBeNull();
      expect(result!.displayText).toContain('7 pcs');
      expect(result!.displayText).toContain('kg');
    });

    it('uses TMT weights correctly (10mm bar)', () => {
      const weightPerUnit = TMT_WEIGHTS['10mm'];
      const result = calculateWeight(weightPerUnit, 7, 'kg');

      expect(result).not.toBeNull();
      expect(result!.totalWeight).toBeCloseTo(7 * 0.617, 2);
    });
  });

  describe('formatWeight', () => {
    it('formats large weights (>=1000) by dividing by 1000', () => {
      expect(formatWeight(1500)).toBe('1.50');
      expect(formatWeight(2500)).toBe('2.50');
    });

    it('formats medium weights (100-999) with 1 decimal place', () => {
      expect(formatWeight(150)).toBe('150.0');
      expect(formatWeight(999)).toBe('999.0');
    });

    it('formats small weights (1-99) with 2 decimal places', () => {
      expect(formatWeight(5.678)).toBe('5.68');
      expect(formatWeight(50)).toBe('50.00');
    });

    it('formats very small weights (<1) with 3 decimal places', () => {
      expect(formatWeight(0.123)).toBe('0.123');
      expect(formatWeight(0.5)).toBe('0.500');
    });
  });

  describe('convertWeight', () => {
    it('converts grams to kilograms', () => {
      expect(convertWeight(1000, 'g', 'kg')).toBe(1);
      expect(convertWeight(500, 'g', 'kg')).toBe(0.5);
    });

    it('converts kilograms to grams', () => {
      expect(convertWeight(1, 'kg', 'g')).toBe(1000);
      expect(convertWeight(2.5, 'kg', 'g')).toBe(2500);
    });

    it('converts kilograms to tonnes', () => {
      expect(convertWeight(1000, 'kg', 'ton')).toBe(1);
      expect(convertWeight(2500, 'kg', 'ton')).toBe(2.5);
    });

    it('converts tonnes to kilograms', () => {
      expect(convertWeight(1, 'ton', 'kg')).toBe(1000);
    });

    it('handles same unit conversion', () => {
      expect(convertWeight(100, 'kg', 'kg')).toBe(100);
    });

    it('handles unknown units gracefully (defaults to 1)', () => {
      expect(convertWeight(100, 'unknown', 'kg')).toBe(100);
    });
  });

  describe('formatWeightWithUnit', () => {
    it('returns "-" for null/undefined', () => {
      expect(formatWeightWithUnit(null)).toBe('-');
      expect(formatWeightWithUnit(undefined)).toBe('-');
    });

    it('auto-converts kg to tonnes for large values', () => {
      expect(formatWeightWithUnit(1500, 'kg')).toBe('1.50 ton');
      expect(formatWeightWithUnit(2500, 'kg')).toBe('2.50 ton');
    });

    it('auto-converts grams to kg for large values', () => {
      expect(formatWeightWithUnit(1500, 'g')).toBe('1.50 kg');
    });

    it('keeps original unit for smaller values', () => {
      expect(formatWeightWithUnit(500, 'kg')).toContain('kg');
      expect(formatWeightWithUnit(500, 'g')).toContain('g');
    });
  });

  describe('formatQuantityWithWeight', () => {
    it('returns "-" for null/undefined quantity', () => {
      expect(formatQuantityWithWeight(null, 'pcs', 0.5, 'kg')).toBe('-');
      expect(formatQuantityWithWeight(undefined, 'pcs', 0.5, 'kg')).toBe('-');
    });

    it('formats quantity with unit when no weight per unit', () => {
      expect(formatQuantityWithWeight(100, 'bags', null, 'kg')).toBe('100 bags');
      expect(formatQuantityWithWeight(100, 'bags', 0, 'kg')).toBe('100 bags');
    });

    it('includes weight equivalent when weight per unit is provided', () => {
      const result = formatQuantityWithWeight(100, 'pcs', 0.5, 'kg');
      expect(result).toContain('100 pcs');
      expect(result).toContain('(');
      expect(result).toContain('kg');
    });
  });

  describe('TMT Constants', () => {
    it('has correct weights for standard TMT sizes', () => {
      expect(TMT_WEIGHTS['8mm']).toBe(0.395);
      expect(TMT_WEIGHTS['10mm']).toBe(0.617);
      expect(TMT_WEIGHTS['12mm']).toBe(0.888);
      expect(TMT_WEIGHTS['16mm']).toBe(1.58);
      expect(TMT_WEIGHTS['20mm']).toBe(2.469);
      expect(TMT_WEIGHTS['25mm']).toBe(3.858);
      expect(TMT_WEIGHTS['32mm']).toBe(6.316);
    });

    it('has correct rods per bundle counts', () => {
      expect(TMT_RODS_PER_BUNDLE['8mm']).toBe(10);
      expect(TMT_RODS_PER_BUNDLE['10mm']).toBe(7);
      expect(TMT_RODS_PER_BUNDLE['12mm']).toBe(5);
      expect(TMT_RODS_PER_BUNDLE['16mm']).toBe(3);
      expect(TMT_RODS_PER_BUNDLE['20mm']).toBe(2);
    });

    it('6mm is not included (not available locally)', () => {
      expect(TMT_WEIGHTS['6mm']).toBeUndefined();
      expect(TMT_RODS_PER_BUNDLE['6mm']).toBeUndefined();
    });

    it('has correct standard length', () => {
      expect(TMT_STANDARD_LENGTH).toBe(40);
    });
  });

  describe('estimatePieceWeight', () => {
    it('prefers the last actual delivered kg/piece when available', () => {
      const result = estimatePieceWeight({
        lastActualPerPiece: 7.6,
        weightPerMeter: 0.617,
        lengthPerPiece: 40,
        lengthUnit: 'ft',
      });
      expect(result).toBe(7.6);
    });

    it('falls back to the theoretical formula when no actual history', () => {
      // 10mm @ 40ft = 0.617 kg/m × (40 × 0.3048) m
      const result = estimatePieceWeight({
        lastActualPerPiece: null,
        weightPerMeter: 0.617,
        lengthPerPiece: 40,
        lengthUnit: 'ft',
      });
      expect(result).toBeCloseTo(0.617 * 40 * 0.3048, 3);
    });

    it('ignores a zero/negative last-actual and uses the formula', () => {
      const result = estimatePieceWeight({
        lastActualPerPiece: 0,
        weightPerMeter: 0.395,
        lengthPerPiece: 40,
        lengthUnit: 'ft',
      });
      expect(result).toBeCloseTo(0.395 * 40 * 0.3048, 3);
    });

    it('returns null when nothing is known', () => {
      expect(estimatePieceWeight({})).toBeNull();
    });
  });

  describe('GST helpers', () => {
    it('extracts GST from a gross (inclusive) amount at 18%', () => {
      const { net, gst, gross } = extractGstFromGross(10800, 18);
      expect(gross).toBe(10800);
      expect(net).toBeCloseTo(9152.54, 2);
      expect(gst).toBeCloseTo(1647.46, 2);
      // round-trips back to the gross
      expect(net + gst).toBeCloseTo(10800, 6);
    });

    it('adds GST on top of a net (exclusive) amount at 18%', () => {
      const { net, gst, gross } = addGstToNet(10000, 18);
      expect(net).toBe(10000);
      expect(gst).toBeCloseTo(1800, 6);
      expect(gross).toBeCloseTo(11800, 6);
    });

    it('treats a zero/empty rate as no GST', () => {
      expect(extractGstFromGross(500, 0)).toEqual({ net: 500, gst: 0, gross: 500 });
      expect(addGstToNet(500, null)).toEqual({ net: 500, gst: 0, gross: 500 });
    });
  });

  describe('computeLineAmount', () => {
    it('per_kg uses actual weight × rate when present', () => {
      expect(
        computeLineAmount({ pricing_mode: 'per_kg', unit_price: 74.9, actual_weight: 95.3 })
      ).toBeCloseTo(7137.97, 2);
    });

    it('per_kg falls back to the calculated estimate at PO time', () => {
      expect(
        computeLineAmount({ pricing_mode: 'per_kg', unit_price: 73.7, calculated_weight: 49.4 })
      ).toBeCloseTo(3640.78, 2);
    });

    it('per_piece uses qty × unit price', () => {
      expect(
        computeLineAmount({ pricing_mode: 'per_piece', unit_price: 350, quantity: 20 })
      ).toBe(7000);
    });
  });

  describe('weight variance (the delivery-time mismatch warning)', () => {
    it('computes the % difference of actual vs expected kg/piece', () => {
      expect(weightVariancePct(8.25, 7.5)).toBeCloseTo(10, 6);
      expect(weightVariancePct(7.5, 7.5)).toBe(0);
      expect(weightVariancePct(6.75, 7.5)).toBeCloseTo(-10, 6);
    });

    it('returns null when not computable', () => {
      expect(weightVariancePct(null, 7.5)).toBeNull();
      expect(weightVariancePct(8, 0)).toBeNull();
    });

    it('flags a drastic mismatch beyond the threshold', () => {
      expect(WEIGHT_VARIANCE_WARN_PCT).toBe(10);
      expect(isLargeWeightVariance(15)).toBe(true);
      expect(isLargeWeightVariance(-12)).toBe(true);
      expect(isLargeWeightVariance(5)).toBe(false);
      expect(isLargeWeightVariance(null)).toBe(false);
    });
  });

  describe('yellow-bill sample end-to-end (M Karuppiah & Co)', () => {
    it('reproduces the bill: lines, sum, and GST split', () => {
      const line8mm = computeLineAmount({ pricing_mode: 'per_kg', unit_price: 74.9, actual_weight: 95.3 });
      const line10mm = computeLineAmount({ pricing_mode: 'per_kg', unit_price: 73.7, actual_weight: 49.4 });
      expect(line8mm).toBeCloseTo(7137.97, 2);
      expect(line10mm).toBeCloseTo(3640.78, 2);

      const lineSum = line8mm + line10mm;
      expect(lineSum).toBeCloseTo(10778.75, 2);

      // handling/rounding on the bill → gross total 10,800
      const billTotal = 10800;
      const { net, gst } = extractGstFromGross(billTotal, 18);
      expect(net).toBeCloseTo(9152.54, 2);
      expect(gst).toBeCloseTo(1647.46, 2);
    });
  });
});
