/** Small form controls for the CBAM calculator, sized for a phone as well as a desk. */
import React from 'react';
import { isNumberText } from './num';
import { formatCn, goodInfo, SECTOR_LABEL, type CbamData } from './data';

const box = 'h-9 w-full rounded-md border border-border bg-white px-2.5 text-[13px] text-brand-heading '
  + 'focus-visible:outline-2 focus-visible:outline-blue-600 disabled:bg-surface disabled:text-brand-muted';

export const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode; className?: string }> = ({
  label, hint, children, className,
}) => (
  <label className={`flex flex-col gap-1 min-w-0 ${className ?? ''}`}>
    <span className="text-[11.5px] font-semibold text-brand-body">{label}</span>
    {children}
    {hint && <span className="text-[11px] text-brand-muted leading-snug">{hint}</span>}
  </label>
);

export const TextBox: React.FC<{
  value: string | undefined; onChange: (v: string) => void; placeholder?: string; disabled?: boolean; list?: string;
}> = ({ value, onChange, placeholder, disabled, list }) => (
  <input className={box} value={value ?? ''} placeholder={placeholder} disabled={disabled} list={list}
    onChange={(e) => onChange(e.target.value)} />
);

export const NumBox: React.FC<{
  value: string | undefined; onChange: (v: string) => void; placeholder?: string; disabled?: boolean;
}> = ({ value, onChange, placeholder, disabled }) => {
  const bad = !isNumberText(value);
  return (
    <input className={`${box} text-right font-mono ${bad ? 'border-red-400' : ''}`} inputMode="decimal"
      value={value ?? ''} placeholder={placeholder} disabled={disabled} aria-invalid={bad}
      onChange={(e) => onChange(e.target.value)} />
  );
};

export const Choice: React.FC<{
  value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }>; disabled?: boolean;
}> = ({ value, onChange, options, disabled }) => (
  <select className={box} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
    {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
);

/** CN code box with the CBAM goods list as suggestions, and what the code resolves to underneath. */
export const CnBox: React.FC<{ data: CbamData; value: string; onChange: (v: string) => void }> = ({ data, value, onChange }) => {
  const info = value.trim() ? goodInfo(data, value) : null;
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <input className={`${box} font-mono`} list="cbam-goods" value={value} placeholder="e.g. 7214 20 00"
        onChange={(e) => onChange(e.target.value)} />
      <span className={`text-[11px] leading-snug truncate ${info ? 'text-brand-muted' : value.trim() ? 'text-red-700' : 'text-brand-muted'}`}
        title={info?.description}>
        {info ? `${formatCn(info.cn)} · ${SECTOR_LABEL[info.sector]} · ${info.description}` : value.trim() ? 'Not a CBAM good' : ' '}
      </span>
    </div>
  );
};

export const GoodsDatalist: React.FC<{ data: CbamData }> = ({ data }) => (
  <datalist id="cbam-goods">
    {data.goods.map(([cn, desc]) => <option key={cn} value={formatCn(cn)}>{desc.slice(0, 90)}</option>)}
  </datalist>
);

export { SECTOR_LABEL } from './data';
