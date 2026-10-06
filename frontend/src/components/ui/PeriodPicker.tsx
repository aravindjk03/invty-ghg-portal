/**
 * The one place the reporting period is set.
 *
 * It governs every scope, the year the engine resolves factors for, and the
 * months a row may be dated in. A row's own month is an optional split WITHIN
 * this period, never a second period — which is what it looked like when the
 * only period control was free text buried in Settings and every row carried
 * a date field of its own.
 */
import React from 'react';
import { CalendarRange } from 'lucide-react';
import { ReportingPeriod, periodLabel, periodSpan } from '../../report/reportingPeriod';

const LENGTHS: Array<{ months: number; label: string }> = [
  { months: 12, label: 'Full year' },
  { months: 6, label: 'Half year' },
  { months: 3, label: 'Quarter' },
  { months: 1, label: 'One month' },
];

export const PeriodPicker: React.FC<{
  period: ReportingPeriod;
  onChange: (period: ReportingPeriod) => void;
  /** `bar` for the strip on a scope page, `panel` for a settings card. */
  variant?: 'bar' | 'panel';
}> = ({ period, onChange, variant = 'bar' }) => {
  const compact = variant === 'bar';

  return (
    <div className={compact
      ? 'flex flex-wrap items-center gap-2'
      : 'flex flex-col gap-2'}>
      <div className="flex items-center gap-1.5">
        <CalendarRange size={compact ? 12 : 14} className="text-brand-muted" />
        <span className="text-brand-muted text-[11px]">Reporting period</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="month"
          value={period.start}
          onChange={(event) => event.target.value
            && onChange({ ...period, start: event.target.value })}
          aria-label="First month of the reporting period"
          className="h-7 rounded border border-border bg-surface px-2 text-[11px] text-brand-body"
        />
        <select
          value={period.months}
          onChange={(event) => onChange({ ...period, months: Number(event.target.value) })}
          aria-label="Length of the reporting period"
          className="h-7 rounded border border-border bg-surface px-2 text-[11px] text-brand-body"
        >
          {LENGTHS.map((option) => (
            <option key={option.months} value={option.months}>{option.label}</option>
          ))}
        </select>
        <span className="text-[11px] font-semibold text-brand-body">
          {periodLabel(period)}
        </span>
        <span className="text-[11px] text-brand-muted">{periodSpan(period)}</span>
      </div>

      {!compact && (
        <span className="text-[11px] text-brand-muted leading-relaxed">
          Applies to every scope, and decides which year&rsquo;s published factors the
          engine uses. A row may carry its own month for the monthly analysis; it does
          not need one, and it cannot fall outside this period.
        </span>
      )}
    </div>
  );
};
