import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatCurrency,
  formatCurrencyFull,
  formatDate,
  formatDateShort,
  formatDateDDMMMYY,
  formatRelativeTime,
  formatNumber,
  formatPercent,
  formatPhone,
  cleanPhoneNumber,
  formatQuantity,
} from './formatters';

describe('Formatters', () => {
  describe('formatCurrency', () => {
    it('returns "Rs.0" for null/undefined', () => {
      expect(formatCurrency(null)).toBe('₹0');
      expect(formatCurrency(undefined)).toBe('₹0');
    });

    it('formats small amounts without abbreviation', () => {
      expect(formatCurrency(500)).toBe('₹500');
      expect(formatCurrency(5000)).toBe('₹5,000');
      expect(formatCurrency(50000)).toBe('₹50,000');
      expect(formatCurrency(99999)).toBe('₹99,999');
    });

    it('formats amounts >= 1 lakh with "L" suffix', () => {
      expect(formatCurrency(100000)).toBe('₹1.00L');
      expect(formatCurrency(150000)).toBe('₹1.50L');
      expect(formatCurrency(250000)).toBe('₹2.50L');
      expect(formatCurrency(1000000)).toBe('₹10.00L');
    });

    it('handles negative amounts', () => {
      expect(formatCurrency(-5000)).toBe('₹-5,000');
      expect(formatCurrency(-150000)).toBe('₹-1.50L');
    });
  });

  describe('formatCurrencyFull', () => {
    it('always formats full amount without abbreviation', () => {
      expect(formatCurrencyFull(100000)).toBe('₹1,00,000');
      expect(formatCurrencyFull(250000)).toBe('₹2,50,000');
      expect(formatCurrencyFull(1000000)).toBe('₹10,00,000');
    });

    it('returns "Rs.0" for null/undefined', () => {
      expect(formatCurrencyFull(null)).toBe('₹0');
      expect(formatCurrencyFull(undefined)).toBe('₹0');
    });
  });

  describe('formatDate', () => {
    it('returns "-" for null/undefined', () => {
      expect(formatDate(null)).toBe('-');
      expect(formatDate(undefined)).toBe('-');
    });

    it('formats date string correctly', () => {
      const result = formatDate('2024-12-15');
      expect(result).toMatch(/15.*Dec.*2024/);
    });

    it('formats Date object correctly', () => {
      const date = new Date(2024, 11, 15); // Dec 15, 2024
      const result = formatDate(date);
      expect(result).toMatch(/15.*Dec.*2024/);
    });
  });

  describe('formatDateShort', () => {
    it('returns "-" for null/undefined', () => {
      expect(formatDateShort(null)).toBe('-');
      expect(formatDateShort(undefined)).toBe('-');
    });

    it('formats date in DD/MM/YYYY format', () => {
      const result = formatDateShort('2024-12-15');
      expect(result).toMatch(/15\/12\/2024/);
    });
  });

  describe('formatRelativeTime', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns "-" for null/undefined', () => {
      expect(formatRelativeTime(null)).toBe('-');
      expect(formatRelativeTime(undefined)).toBe('-');
    });

    it('returns "just now" for current time', () => {
      const now = new Date('2024-01-15T12:00:00Z');
      expect(formatRelativeTime(now)).toBe('just now');
    });

    it('formats minutes ago correctly', () => {
      const fiveMinAgo = new Date('2024-01-15T11:55:00Z');
      expect(formatRelativeTime(fiveMinAgo)).toBe('5 mins ago');
    });

    it('formats single minute ago correctly', () => {
      const oneMinAgo = new Date('2024-01-15T11:59:00Z');
      expect(formatRelativeTime(oneMinAgo)).toBe('1 min ago');
    });

    it('formats hours ago correctly', () => {
      const twoHoursAgo = new Date('2024-01-15T10:00:00Z');
      expect(formatRelativeTime(twoHoursAgo)).toBe('2 hours ago');
    });

    it('formats single hour ago correctly', () => {
      const oneHourAgo = new Date('2024-01-15T11:00:00Z');
      expect(formatRelativeTime(oneHourAgo)).toBe('1 hour ago');
    });

    it('formats days ago correctly', () => {
      const threeDaysAgo = new Date('2024-01-12T12:00:00Z');
      expect(formatRelativeTime(threeDaysAgo)).toBe('3 days ago');
    });

    it('formats future time correctly', () => {
      const inTwoHours = new Date('2024-01-15T14:00:00Z');
      expect(formatRelativeTime(inTwoHours)).toBe('in 2 hours');
    });
  });

  describe('formatPhone', () => {
    it('returns "-" for null/undefined', () => {
      expect(formatPhone(null)).toBe('-');
      expect(formatPhone(undefined)).toBe('-');
    });

    it('formats 10-digit Indian number', () => {
      expect(formatPhone('9876543210')).toBe('98765 43210');
    });

    it('formats 12-digit number with country code', () => {
      expect(formatPhone('919876543210')).toBe('+91 98765 43210');
    });

    it('returns original for non-standard formats', () => {
      expect(formatPhone('12345')).toBe('12345');
    });
  });

  describe('cleanPhoneNumber', () => {
    it('returns empty string for null/undefined', () => {
      expect(cleanPhoneNumber(null)).toBe('');
      expect(cleanPhoneNumber(undefined)).toBe('');
    });

    it('adds India country code for 10-digit numbers', () => {
      expect(cleanPhoneNumber('9876543210')).toBe('919876543210');
    });

    it('preserves 12-digit numbers with country code', () => {
      expect(cleanPhoneNumber('919876543210')).toBe('919876543210');
    });

    it('strips non-digit characters', () => {
      expect(cleanPhoneNumber('+91 98765 43210')).toBe('919876543210');
    });
  });

  describe('formatNumber', () => {
    it('returns "0" for null/undefined', () => {
      expect(formatNumber(null)).toBe('0');
      expect(formatNumber(undefined)).toBe('0');
    });

    it('formats with Indian numbering system', () => {
      expect(formatNumber(1000)).toBe('1,000');
      expect(formatNumber(100000)).toBe('1,00,000');
      expect(formatNumber(10000000)).toBe('1,00,00,000');
    });
  });

  describe('formatPercent', () => {
    it('returns "0%" for null/undefined', () => {
      expect(formatPercent(null)).toBe('0%');
      expect(formatPercent(undefined)).toBe('0%');
    });

    it('formats with default 1 decimal place', () => {
      expect(formatPercent(75)).toBe('75.0%');
      expect(formatPercent(33.333)).toBe('33.3%');
    });

    it('respects custom decimal places', () => {
      expect(formatPercent(75, 0)).toBe('75%');
      expect(formatPercent(33.333, 2)).toBe('33.33%');
    });
  });

  describe('formatQuantity', () => {
    it('returns "-" for null/undefined', () => {
      expect(formatQuantity(null, 'kg')).toBe('-');
      expect(formatQuantity(undefined, 'pcs')).toBe('-');
    });

    it('formats quantity with unit', () => {
      expect(formatQuantity(100, 'kg')).toBe('100 kg');
      expect(formatQuantity(1000, 'pcs')).toBe('1,000 pcs');
    });
  });

  describe('formatDateDDMMMYY', () => {
    it('returns "-" for null/undefined/invalid', () => {
      expect(formatDateDDMMMYY(null)).toBe('-');
      expect(formatDateDDMMMYY(undefined)).toBe('-');
      expect(formatDateDDMMMYY('not-a-date')).toBe('-');
    });

    it('formats a date string as DD MMM YY', () => {
      expect(formatDateDDMMMYY('2026-05-03')).toBe('03 May 26');
      expect(formatDateDDMMMYY('2026-12-31')).toBe('31 Dec 26');
    });

    it('accepts a Date object', () => {
      expect(formatDateDDMMMYY(new Date('2026-01-09'))).toBe('09 Jan 26');
    });
  });
});
