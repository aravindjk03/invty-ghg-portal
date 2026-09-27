/**
 * The period every scope is reported for. EVERY DATE HERE IS A FIXTURE.
 */
import { describe, expect, it } from 'vitest';
import {
  isInPeriod, monthsOf, periodEnd, periodLabel, periodSpan, reportingYearOf,
} from './reportingPeriod';

const fy = { start: '2025-04', months: 12 };

describe('an Indian financial year', () => {
  it('runs April to March', () => {
    expect(periodEnd(fy)).toBe('2026-03');
    expect(periodSpan(fy)).toBe('Apr 2025 – Mar 2026');
  });

  it('is named the way a reader would name it', () => {
    expect(periodLabel(fy)).toBe('FY 2025–26');
    expect(periodLabel({ start: '2025-01', months: 12 })).toBe('CY 2025');
    expect(periodLabel({ start: '2025-07', months: 1 })).toBe('July 2025');
    expect(periodLabel({ start: '2025-07', months: 3 })).toBe('July 2025 – September 2025');
  });

  it('resolves factors for the year it starts in', () => {
    // A factor set is published for a calendar year, and a financial year
    // running April to March sits mostly inside the year it began.
    expect(reportingYearOf(fy)).toBe(2025);
  });

  it('knows which months belong to it', () => {
    expect(isInPeriod(fy, '2025-04')).toBe(true);
    expect(isInPeriod(fy, '2026-03')).toBe(true);
    expect(isInPeriod(fy, '2026-04')).toBe(false);
    expect(isInPeriod(fy, '2025-03')).toBe(false);
    // An undated row belongs to the period as a whole, not outside it.
    expect(isInPeriod(fy, undefined)).toBe(true);
  });

  it('lists its months in order, across the year boundary', () => {
    const months = monthsOf(fy);
    expect(months).toHaveLength(12);
    expect(months[0]).toBe('2025-04');
    expect(months[8]).toBe('2025-12');
    expect(months[9]).toBe('2026-01');
    expect(months[11]).toBe('2026-03');
  });
});
