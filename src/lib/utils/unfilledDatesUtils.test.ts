import { describe, it, expect } from 'vitest';
import {
  getUnfilledDates,
  groupUnfilledDates,
  formatUnfilledDateRange,
  formatUnfilledDayRange,
  type UnfilledGroup,
} from './unfilledDatesUtils';

describe('Unfilled Dates Utils', () => {
  describe('getUnfilledDates', () => {
    it('returns empty array for invalid date range', () => {
      expect(getUnfilledDates('', '2024-01-10', new Set(), new Set())).toEqual([]);
      expect(getUnfilledDates('2024-01-01', '', new Set(), new Set())).toEqual([]);
    });

    it('returns empty array when start is after end', () => {
      const result = getUnfilledDates('2024-01-10', '2024-01-01', new Set(), new Set());
      expect(result).toEqual([]);
    });

    it('returns all dates when no attendance or holidays', () => {
      const result = getUnfilledDates(
        '2024-01-01',
        '2024-01-05',
        new Set(),
        new Set()
      );

      expect(result).toEqual([
        '2024-01-01',
        '2024-01-02',
        '2024-01-03',
        '2024-01-04',
        '2024-01-05',
      ]);
    });

    it('excludes dates with attendance', () => {
      const attendanceDates = new Set(['2024-01-02', '2024-01-04']);
      const result = getUnfilledDates(
        '2024-01-01',
        '2024-01-05',
        attendanceDates,
        new Set()
      );

      expect(result).toEqual(['2024-01-01', '2024-01-03', '2024-01-05']);
    });

    it('excludes dates with holidays', () => {
      const holidayDates = new Set(['2024-01-01', '2024-01-03']);
      const result = getUnfilledDates(
        '2024-01-01',
        '2024-01-05',
        new Set(),
        holidayDates
      );

      expect(result).toEqual(['2024-01-02', '2024-01-04', '2024-01-05']);
    });

    it('excludes dates with both attendance and holidays', () => {
      const attendanceDates = new Set(['2024-01-02']);
      const holidayDates = new Set(['2024-01-04']);
      const result = getUnfilledDates(
        '2024-01-01',
        '2024-01-05',
        attendanceDates,
        holidayDates
      );

      expect(result).toEqual(['2024-01-01', '2024-01-03', '2024-01-05']);
    });

    it('excludes dates with contract/task-work presence', () => {
      const contractDates = new Set(['2024-01-02', '2024-01-04']);
      const result = getUnfilledDates(
        '2024-01-01',
        '2024-01-05',
        new Set(),
        new Set(),
        contractDates
      );

      // Contract-work days are surfaced as their own rows, not "unfilled".
      expect(result).toEqual(['2024-01-01', '2024-01-03', '2024-01-05']);
    });

    it('treats attendance, holidays and contract days all as filled', () => {
      const attendanceDates = new Set(['2024-01-01']);
      const holidayDates = new Set(['2024-01-03']);
      const contractDates = new Set(['2024-01-05']);
      const result = getUnfilledDates(
        '2024-01-01',
        '2024-01-05',
        attendanceDates,
        holidayDates,
        contractDates
      );

      expect(result).toEqual(['2024-01-02', '2024-01-04']);
    });

    it('is backwards compatible when contractDates is omitted', () => {
      const result = getUnfilledDates(
        '2024-01-01',
        '2024-01-03',
        new Set(['2024-01-02']),
        new Set()
      );
      expect(result).toEqual(['2024-01-01', '2024-01-03']);
    });

    it('limits range to 365 days max', () => {
      const result = getUnfilledDates(
        '2024-01-01',
        '2025-12-31', // > 365 days
        new Set(),
        new Set()
      );

      // Should be limited to ~365 days
      expect(result.length).toBeLessThanOrEqual(366);
    });
  });

  describe('groupUnfilledDates', () => {
    it('returns empty array for empty input', () => {
      expect(groupUnfilledDates([])).toEqual([]);
    });

    it('creates single group for single date', () => {
      const result = groupUnfilledDates(['2024-01-15']);

      expect(result).toHaveLength(1);
      expect(result[0].startDate).toBe('2024-01-15');
      expect(result[0].endDate).toBe('2024-01-15');
      expect(result[0].dayCount).toBe(1);
    });

    it('groups consecutive dates together', () => {
      const result = groupUnfilledDates([
        '2024-01-15',
        '2024-01-16',
        '2024-01-17',
      ]);

      expect(result).toHaveLength(1);
      expect(result[0].startDate).toBe('2024-01-15');
      expect(result[0].endDate).toBe('2024-01-17');
      expect(result[0].dayCount).toBe(3);
      expect(result[0].dates).toEqual(['2024-01-15', '2024-01-16', '2024-01-17']);
    });

    it('creates separate groups for non-consecutive dates', () => {
      const result = groupUnfilledDates([
        '2024-01-15',
        '2024-01-16',
        '2024-01-18', // Gap
        '2024-01-19',
      ]);

      expect(result).toHaveLength(2);
      // Note: sorted descending (most recent first)
      expect(result[0].startDate).toBe('2024-01-18');
      expect(result[0].dayCount).toBe(2);
      expect(result[1].startDate).toBe('2024-01-15');
      expect(result[1].dayCount).toBe(2);
    });

    it('handles unsorted input dates', () => {
      const result = groupUnfilledDates([
        '2024-01-17',
        '2024-01-15',
        '2024-01-16',
      ]);

      expect(result).toHaveLength(1);
      expect(result[0].startDate).toBe('2024-01-15');
      expect(result[0].endDate).toBe('2024-01-17');
    });

    it('generates correct IDs', () => {
      const result = groupUnfilledDates(['2024-01-15', '2024-01-16']);

      expect(result[0].id).toBe('unfilled-2024-01-15');
    });
  });

  describe('formatUnfilledDateRange', () => {
    it('formats single day with day name', () => {
      const group: UnfilledGroup = {
        id: 'test',
        startDate: '2024-01-15',
        endDate: '2024-01-15',
        dates: ['2024-01-15'],
        dayCount: 1,
      };

      const result = formatUnfilledDateRange(group);

      expect(result).toMatch(/Mon.*15.*Jan.*2024/);
    });

    it('formats date range within same year', () => {
      const group: UnfilledGroup = {
        id: 'test',
        startDate: '2024-01-15',
        endDate: '2024-01-20',
        dates: [],
        dayCount: 6,
      };

      const result = formatUnfilledDateRange(group);

      expect(result).toMatch(/15.*Jan.*-.*20.*Jan.*2024/);
    });

    it('formats date range across years', () => {
      const group: UnfilledGroup = {
        id: 'test',
        startDate: '2023-12-28',
        endDate: '2024-01-03',
        dates: [],
        dayCount: 7,
      };

      const result = formatUnfilledDateRange(group);

      expect(result).toMatch(/28.*Dec.*2023.*-.*03.*Jan.*2024/);
    });
  });

  describe('formatUnfilledDayRange', () => {
    it('returns empty string for single day', () => {
      const group: UnfilledGroup = {
        id: 'test',
        startDate: '2024-01-15',
        endDate: '2024-01-15',
        dates: ['2024-01-15'],
        dayCount: 1,
      };

      expect(formatUnfilledDayRange(group)).toBe('');
    });

    it('formats day range for multiple days', () => {
      const group: UnfilledGroup = {
        id: 'test',
        startDate: '2024-01-15', // Monday
        endDate: '2024-01-19',   // Friday
        dates: [],
        dayCount: 5,
      };

      const result = formatUnfilledDayRange(group);

      expect(result).toMatch(/Mon.*-.*Fri/);
    });
  });
});
