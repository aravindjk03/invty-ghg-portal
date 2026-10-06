/**
 * Shared building blocks for the report: an A4-proportioned page, section
 * headings numbered as in the report, tables, and the notices used wherever
 * the organisation has not recorded something.
 */
import React from 'react';

export const ReportPage: React.FC<{
  children: React.ReactNode;
  part?: string;
  title?: string;
  last?: boolean;
}> = ({ children, part, title, last }) => (
  <section
    className={
      'w-full max-w-[820px] min-h-[1100px] bg-white border border-border rounded-xl ' +
      'shadow-nm-raised-lg p-8 md:p-12 relative overflow-hidden ' +
      'print:shadow-none print:border-none print:rounded-none print:m-0 print:p-10 ' +
      (last ? '' : 'page-break-after')
    }
  >
    {(part || title) && (
      <header className="mb-6 border-b border-border pb-3">
        {part && (
          <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-brand-muted">{part}</p>
        )}
        {title && <h2 className="text-xl font-bold text-brand-heading mt-1">{title}</h2>}
      </header>
    )}
    {children}
  </section>
);

export const SectionTitle: React.FC<{ number: string; children: React.ReactNode; note?: string }> = ({
  number, children, note,
}) => (
  <div className="mt-6 first:mt-0 mb-3">
    <h3 className="text-sm font-bold text-brand-heading uppercase tracking-wider">
      <span className="font-mono text-brand-muted mr-2">{number}</span>
      {children}
    </h3>
    {note && <p className="text-xs text-brand-muted mt-1 leading-relaxed">{note}</p>}
  </div>
);

export const Prose: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[13px] leading-relaxed text-brand-body mb-3 max-w-[78ch]">{children}</p>
);

export const Table: React.FC<{
  headers: string[];
  rows: React.ReactNode[][];
  align?: ('left' | 'right')[];
  emptyMessage?: string;
}> = ({ headers, rows, align = [], emptyMessage }) => {
  if (rows.length === 0 && emptyMessage) return <GapNote>{emptyMessage}</GapNote>;
  return (
    <table className="w-full text-[11.5px] border-collapse mb-4">
      <thead>
        <tr className="bg-surface-raised">
          {headers.map((header, index) => (
            <th
              key={header}
              className={
                'border border-border px-2 py-1.5 font-semibold text-brand-heading ' +
                (align[index] === 'right' ? 'text-right' : 'text-left')
              }
            >
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex} className="align-top">
            {row.map((cell, cellIndex) => (
              <td
                key={cellIndex}
                className={
                  'border border-border px-2 py-1.5 text-brand-body ' +
                  (align[cellIndex] === 'right' ? 'text-right tabular-nums font-mono' : '')
                }
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export const KeyValues: React.FC<{ rows: [string, React.ReactNode][] }> = ({ rows }) => (
  <table className="w-full text-[12px] border-collapse mb-4">
    <tbody>
      {rows.map(([label, value]) => (
        <tr key={label}>
          <th className="border border-border bg-surface-raised px-2 py-1.5 text-left font-semibold text-brand-heading w-[38%]">
            {label}
          </th>
          <td className="border border-border px-2 py-1.5 text-brand-body">{value}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

/** Used wherever data is absent: never a dash on its own, always the reason. */
export const GapNote: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[11.5px] leading-relaxed text-[#8A5A00] bg-[#FFF8E6] border border-[#F0D9A0] rounded-md px-3 py-2 mb-3">
    {children}
  </p>
);

export const NotRecorded: React.FC<{ what?: string }> = ({ what }) => (
  <span className="text-[#8A5A00] italic">Not recorded{what ? ` — ${what}` : ''}</span>
);

export const num = (value: number, digits = 2): string =>
  value.toLocaleString('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: 0 });

export const pct = (value: number): string => `${value.toFixed(1)}%`;

export const Outcome: React.FC<{ outcome: 'pass' | 'attention' | 'fail' | 'not_possible' }> = ({ outcome }) => {
  const style = {
    pass: 'bg-[#E8F5EE] text-[#1F5C3D] border-[#B8DCC8]',
    attention: 'bg-[#FFF8E6] text-[#8A5A00] border-[#F0D9A0]',
    fail: 'bg-[#FDECEA] text-[#B42318] border-[#F3C4C0]',
    not_possible: 'bg-surface-raised text-brand-muted border-border',
  }[outcome];
  const label = { pass: 'Pass', attention: 'Attention', fail: 'Not met', not_possible: 'Cannot check' }[outcome];
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold ${style}`}>
      {label}
    </span>
  );
};
