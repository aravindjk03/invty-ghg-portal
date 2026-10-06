/**
 * The period the whole inventory covers.
 *
 * One period, set once, governing every scope. It used to be free text in
 * Settings ("FY 2025–26") with the reporting year scraped out of it by
 * regular expression, while each activity row carried its own optional month —
 * which made it look as though a period had to be set row by row, and left the
 * engine's factor vintage depending on whether someone had typed four digits.
 *
 * It is a start month and a length instead. The label, the year the engine
 * resolves factors for, and the months a row may be dated in all come from
 * those two numbers, so they cannot disagree.
 */

export interface ReportingPeriod {
  /** First month of the period, as YYYY-MM. */
  start: string;
  /** How many months it runs. 12 for a full year. */
  months: number;
}

export const DEFAULT_PERIOD: ReportingPeriod = { start: '2025-04', months: 12 };

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const parse = (start: string): { year: number; month: number } => {
  const [year, month] = start.split('-').map(Number);
  return Number.isFinite(year) && Number.isFinite(month) && month >= 1 && month <= 12
    ? { year, month }
    : { year: 2025, month: 4 };
};

const addMonths = (start: string, count: number): string => {
  const { year, month } = parse(start);
  const zero = (year * 12 + (month - 1)) + count;
  return `${Math.floor(zero / 12)}-${String((zero % 12) + 1).padStart(2, '0')}`;
};

/** The last month of the period, inclusive, as YYYY-MM. */
export const periodEnd = (period: ReportingPeriod): string =>
  addMonths(period.start, Math.max(1, period.months) - 1);

/**
 * The year the engine resolves factors for.
 *
 * The year the period STARTS in: a factor set is published for a calendar
 * year, and an Indian financial year running April to March sits mostly
 * inside the year it began.
 */
export const reportingYearOf = (period: ReportingPeriod): number =>
  parse(period.start).year;

/** What to call this period on a page and in a report. */
export const periodLabel = (period: ReportingPeriod): string => {
  const { year, month } = parse(period.start);
  const end = parse(periodEnd(period));
  if (period.months === 12 && month === 4) return `FY ${year}–${String(year + 1).slice(2)}`;
  if (period.months === 12 && month === 1) return `CY ${year}`;
  if (period.months === 1) return `${MONTH_NAMES[month - 1]} ${year}`;
  return `${MONTH_NAMES[month - 1]} ${year} – ${MONTH_NAMES[end.month - 1]} ${end.year}`;
};

/** The span in words, for the line under the label. */
export const periodSpan = (period: ReportingPeriod): string => {
  const { year, month } = parse(period.start);
  const end = parse(periodEnd(period));
  return `${MONTH_NAMES[month - 1].slice(0, 3)} ${year} – ${MONTH_NAMES[end.month - 1].slice(0, 3)} ${end.year}`;
};

/** Whether a row's month falls inside the period. */
export const isInPeriod = (period: ReportingPeriod, month?: string): boolean => {
  if (!month) return true;
  return month >= period.start && month <= periodEnd(period);
};

/** Every month of the period, for a picker or a monthly analysis. */
export const monthsOf = (period: ReportingPeriod): string[] =>
  Array.from({ length: Math.max(1, period.months) }, (_, index) => addMonths(period.start, index));
