/**
 * Report part 21: monthly analysis.
 *
 * An annual figure hides seasonality, production-driven variation, abnormal
 * consumption, metering problems and missing months. This splits the inventory
 * by the month recorded on each entry, lists the months with no data at all,
 * and flags months that sit far from the median.
 */
import { ActivityEntry } from '../../types/ghg';
import { MonthlyRow, MonthlySection } from '../model/types';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const label = (yyyymm: string): string => {
  const [year, month] = yyyymm.split('-');
  const index = Number(month) - 1;
  return MONTH_NAMES[index] ? `${MONTH_NAMES[index]} ${year}` : yyyymm;
};

/** Twelve months from an Indian financial year start, or from the period start. */
function expectedMonths(periodStart: string, periodEnd: string): string[] {
  if (!periodStart || !periodEnd) return [];
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];
  const months: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor <= end && months.length < 36) {
    months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

export function buildMonthly(
  entries: ActivityEntry[], periodStart: string, periodEnd: string,
): MonthlySection {
  const dated = entries.filter((entry) => Boolean(entry.periodMonth));
  if (dated.length === 0) {
    return {
      rows: [],
      available: false,
      missingMonths: [],
      observations: [
        'No activity record carries a month, so the inventory cannot be analysed over time. '
        + 'Record the month against each entry to reveal seasonality, production-driven variation, '
        + 'abnormal consumption and missing data.',
      ],
    };
  }

  const buckets = new Map<string, { scope1: number; scope2: number; scope3: number; count: number }>();
  dated.forEach((entry) => {
    const key = entry.periodMonth!;
    const bucket = buckets.get(key) ?? { scope1: 0, scope2: 0, scope3: 0, count: 0 };
    const value = Number(entry.calculatedTco2e) || 0;
    if (entry.scope === 'scope-1') bucket.scope1 += value;
    else if (entry.scope === 'scope-2') bucket.scope2 += value;
    else if (entry.scope === 'scope-3') bucket.scope3 += value;
    bucket.count += 1;
    buckets.set(key, bucket);
  });

  const expected = expectedMonths(periodStart, periodEnd);
  const keys = expected.length > 0 ? expected : [...buckets.keys()].sort();

  const rows: MonthlyRow[] = keys.map((key) => {
    const bucket = buckets.get(key);
    return {
      month: label(key),
      scope1: bucket?.scope1 ?? 0,
      scope2: bucket?.scope2 ?? 0,
      scope3: bucket?.scope3 ?? 0,
      total: (bucket?.scope1 ?? 0) + (bucket?.scope2 ?? 0) + (bucket?.scope3 ?? 0),
      recordCount: bucket?.count ?? 0,
      missing: !bucket,
    };
  });

  const missingMonths = rows.filter((row) => row.missing).map((row) => row.month);
  const observations: string[] = [];

  const undated = entries.length - dated.length;
  if (undated > 0) {
    observations.push(
      `${undated} of ${entries.length} records carry no month and are excluded from this analysis, `
      + 'but remain in the annual totals.');
  }
  if (missingMonths.length > 0) {
    observations.push(
      `No data recorded for ${missingMonths.join(', ')}. A missing month is either a genuine shutdown `
      + 'or a data gap; state which, because an assurance provider will ask.');
  }

  // Outliers: months more than 50% from the median of the months that have data.
  const present = rows.filter((row) => !row.missing).map((row) => row.total).sort((a, b) => a - b);
  if (present.length >= 3) {
    const median = present[Math.floor(present.length / 2)];
    const outliers = rows.filter((row) => !row.missing && median > 0
      && Math.abs(row.total - median) / median > 0.5);
    if (outliers.length > 0) {
      observations.push(
        `Months more than 50% from the median (${median.toFixed(1)} tCO2e): `
        + `${outliers.map((row) => `${row.month} at ${row.total.toFixed(1)}`).join(', ')}. `
        + 'Check against production volume, maintenance and metering before publishing.');
    }
  }

  return { rows, available: true, missingMonths, observations };
}
