import React, { useState } from 'react';
import { useGHG } from '../context/GHGContext';
import { ConsolidationBoundary } from '../engine/scopeRouter';
import { ReportingPeriod, periodLabel } from '../report/reportingPeriod';
import { Building2, CalendarRange, Layers, ArrowRight, BookOpen } from 'lucide-react';

/**
 * First run. Three questions, asked before any figure is entered, because all
 * three change what the figures mean: which organisation is reporting, over
 * which period, and on what consolidation basis. Guessing any of them and
 * letting a reporter discover the guess later is worse than asking.
 *
 * It also replaces what used to happen instead — a new visitor landing in a
 * pre-filled steel plant that was not theirs. The example is still here, but as
 * something they choose.
 */

const BOUNDARIES: Array<{ value: ConsolidationBoundary; label: string; note: string }> = [
  {
    value: 'Operational control',
    label: 'Operational control',
    note: 'All emissions from operations you have full authority to run. The most common choice, and what BRSR expects.',
  },
  {
    value: 'Financial control',
    label: 'Financial control',
    note: 'All emissions from operations whose financial and operating policies you direct.',
  },
  {
    value: 'Equity share',
    label: 'Equity share',
    note: 'Your share of each operation’s emissions, in proportion to the equity you hold in it.',
  },
];

const MONTHS = [
  '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12',
];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const WorkspaceSetup: React.FC = () => {
  const { companyName, completeSetup } = useGHG();

  const thisYear = new Date().getFullYear();
  const [name, setName] = useState(companyName);
  const [startYear, setStartYear] = useState(String(thisYear - 1));
  const [startMonth, setStartMonth] = useState('04');
  const [months, setMonths] = useState(12);
  const [boundary, setBoundary] = useState<ConsolidationBoundary>('Operational control');
  const [withExample, setWithExample] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const period: ReportingPeriod = { start: `${startYear}-${startMonth}`, months };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter the name of the organisation that is reporting.');
      return;
    }
    completeSetup({
      companyName: name.trim(),
      period,
      boundaryApproach: boundary,
      withExample,
    });
  };

  return (
    <div className="min-h-screen w-full flex items-start justify-center p-4 sm:p-8 bg-[#EDF1F7]">
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-xl border border-gray-200/80 p-6 sm:p-8">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
          Set up your inventory
        </h1>
        <p className="text-xs sm:text-sm text-gray-600 mt-1.5 leading-relaxed">
          Three answers before the first figure. Each one changes what the numbers
          mean, so a report cannot be issued without them — and you can change any
          of them later in Settings.
        </p>

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-6">
          {/* 1. Organisation */}
          <div>
            <label className="flex items-center gap-2 text-xs font-bold text-gray-800 uppercase tracking-wider mb-2">
              <Building2 size={14} className="text-blue-600" />
              Reporting organisation
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(null); }}
              placeholder="e.g. Hindalco Industries Limited"
              className="w-full h-11 px-4 border border-gray-300 rounded-xl text-sm text-gray-800 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              autoFocus
            />
            <p className="text-[11px] text-gray-500 mt-1.5">
              The legal entity the inventory covers. It appears on every report and export.
            </p>
          </div>

          {/* 2. Reporting period */}
          <div>
            <label className="flex items-center gap-2 text-xs font-bold text-gray-800 uppercase tracking-wider mb-2">
              <CalendarRange size={14} className="text-blue-600" />
              Reporting period
            </label>
            <div className="grid grid-cols-3 gap-2">
              <select
                value={startMonth}
                onChange={(e) => setStartMonth(e.target.value)}
                className="h-11 px-3 border border-gray-300 rounded-xl text-sm text-gray-800 outline-none focus:border-blue-600"
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={m}>{MONTH_NAMES[i]}</option>
                ))}
              </select>
              <select
                value={startYear}
                onChange={(e) => setStartYear(e.target.value)}
                className="h-11 px-3 border border-gray-300 rounded-xl text-sm text-gray-800 outline-none focus:border-blue-600"
              >
                {[thisYear - 3, thisYear - 2, thisYear - 1, thisYear].map((y) => (
                  <option key={y} value={String(y)}>{y}</option>
                ))}
              </select>
              <select
                value={months}
                onChange={(e) => setMonths(Number(e.target.value))}
                className="h-11 px-3 border border-gray-300 rounded-xl text-sm text-gray-800 outline-none focus:border-blue-600"
              >
                <option value={12}>for 12 months</option>
                <option value={6}>for 6 months</option>
                <option value={3}>for 3 months</option>
              </select>
            </div>
            <p className="text-[11px] text-gray-500 mt-1.5">
              {periodLabel(period)} — this decides which factor vintage applies and
              which months a row may be dated in.
            </p>
          </div>

          {/* 3. Consolidation boundary */}
          <div>
            <label className="flex items-center gap-2 text-xs font-bold text-gray-800 uppercase tracking-wider mb-2">
              <Layers size={14} className="text-blue-600" />
              Consolidation approach
            </label>
            <div className="space-y-2">
              {BOUNDARIES.map((option) => (
                <label
                  key={option.value}
                  className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                    boundary === option.value
                      ? 'border-blue-500 bg-blue-50/60'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="boundary"
                    checked={boundary === option.value}
                    onChange={() => setBoundary(option.value)}
                    className="mt-0.5 text-blue-600 focus:ring-blue-500"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-gray-800">{option.label}</span>
                    <span className="block text-[11px] text-gray-500 leading-relaxed mt-0.5">{option.note}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Optional worked example */}
          <label className="flex items-start gap-2.5 p-3 rounded-xl border border-dashed border-gray-300 cursor-pointer hover:border-gray-400 transition-colors">
            <input
              type="checkbox"
              checked={withExample}
              onChange={(e) => setWithExample(e.target.checked)}
              className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span>
              <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
                <BookOpen size={13} className="text-gray-500" />
                Fill it with a worked example first
              </span>
              <span className="block text-[11px] text-gray-500 leading-relaxed mt-0.5">
                One integrated steel plant, with Scope 1, 2 and 3 rows already entered,
                to show how a finished inventory reads. Every row can be edited or
                deleted. Leave this unchecked to start from an empty inventory.
              </span>
            </span>
          </label>

          <button
            type="submit"
            className="w-full h-11 rounded-xl text-white bg-blue-600 hover:bg-blue-700 transition-colors font-semibold text-sm flex items-center justify-center gap-2 shadow-md shadow-blue-600/20"
          >
            <span>Open my inventory</span>
            <ArrowRight size={16} />
          </button>
        </form>
      </div>
    </div>
  );
};

export default WorkspaceSetup;
