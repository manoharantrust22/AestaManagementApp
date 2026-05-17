import { describe, it, expect } from 'vitest';
import {
  toFeet,
  calculateCubicFeet,
  formatCft,
  calculateLinearCost,
  formatINR,
} from './calculatorMath';

describe('toFeet', () => {
  it('returns value unchanged when unit is ft', () => {
    expect(toFeet(7, 'ft')).toBe(7);
  });
  it('converts inches to feet', () => {
    expect(toFeet(12, 'in')).toBe(1);
    expect(toFeet(6, 'in')).toBeCloseTo(0.5);
  });
});

describe('calculateCubicFeet', () => {
  it('1ft cube × 1 piece = 1 cft', () => {
    expect(calculateCubicFeet(1, 'ft', 1, 'ft', 1, 'ft', 1)).toBe(1);
  });
  it('1ft × 12in × 12in × 1 piece = 1 cft', () => {
    expect(calculateCubicFeet(1, 'ft', 12, 'in', 12, 'in', 1)).toBe(1);
  });
  it('7ft × 3in × 1.5in × 12 pieces = 2.625 cft', () => {
    expect(calculateCubicFeet(7, 'ft', 3, 'in', 1.5, 'in', 12)).toBeCloseTo(2.625, 5);
  });
  it('returns 0 when qty is 0', () => {
    expect(calculateCubicFeet(7, 'ft', 3, 'in', 1.5, 'in', 0)).toBe(0);
  });
});

describe('calculateLinearCost', () => {
  it('multiplies output qty by unit price', () => {
    expect(calculateLinearCost(2.625, 2500)).toBeCloseTo(6562.5);
  });
  it('returns 0 for 0 qty', () => {
    expect(calculateLinearCost(0, 2500)).toBe(0);
  });
});

describe('formatCft', () => {
  it('formats to 3 decimal places with cft suffix', () => {
    expect(formatCft(2.625)).toBe('2.625 cft');
    expect(formatCft(1)).toBe('1.000 cft');
  });
});

describe('formatINR', () => {
  it('formats as Indian Rupees with no decimal', () => {
    expect(formatINR(6562.5)).toContain('₹');
    expect(formatINR(6562.5)).toContain('6,563');
  });
});
