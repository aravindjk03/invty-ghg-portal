import Decimal from 'decimal.js';

/** A number as typed: '1,234.5' and ' 12 ' are accepted; anything else counts as empty (0). */
export function dec(v: string | number | undefined | null): Decimal {
  const s = (v ?? '').toString().trim().replace(/[,\s]/g, '');
  if (!s) return new Decimal(0);
  try {
    const d = new Decimal(s);
    return d.isFinite() ? d : new Decimal(0);
  } catch {
    return new Decimal(0);
  }
}

export const has = (v: string | undefined | null) => !!(v ?? '').toString().trim();

/** True when the text is a usable number (or empty). */
export function isNumberText(v: string | undefined | null): boolean {
  const s = (v ?? '').toString().trim().replace(/[,\s]/g, '');
  return !s || /^-?\d*\.?\d+(e-?\d+)?$/i.test(s) || /^-?\d+\.$/.test(s);
}

/** Display: fixed decimals with thin grouping, for tables and the report. */
export function fmt(v: string | null | undefined, dp = 3): string {
  if (v == null || v === '') return '—';
  const d = dec(v);
  const [i, f] = d.toFixed(dp).split('.');
  const grouped = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return f ? `${grouped}.${f}` : grouped;
}

export const pctOf = (v: string | null | undefined) => (v == null ? '—' : `${dec(v).times(100).toFixed(1)}%`);
