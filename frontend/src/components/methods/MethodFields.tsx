/**
 * The small pieces every method form is built from.
 *
 * Kept together so all six forms look and behave the same way, and so the
 * choices they offer come from the engine's own option lists rather than being
 * typed out again here.
 */
import React, { useId } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { NumberInput } from '../ui/NumberInput';
import { Select } from '../ui/Select';
import { Toggle } from '../ui/Toggle';
import { MethodInfo, MethodOption } from '../../types/methods';

/** The option list a form needs, or an empty list while the catalogue loads. */
export const optionsFor = (info: MethodInfo | undefined, name: string): MethodOption[] => {
  const value = info?.options?.[name];
  return Array.isArray(value) ? value : [];
};

/** The engine's own explanatory strings, keyed by choice. */
export const notesFor = (info: MethodInfo | undefined, name: string): Record<string, string> => {
  const value = info?.options?.[name];
  return value && !Array.isArray(value) ? value : {};
};

export const Field: React.FC<{
  label: string;
  hint?: string;
  children: React.ReactNode;
}> = ({ label, hint, children }) => (
  <div className="flex flex-col gap-1">
    {children}
    {hint && <p className="text-[11px] leading-snug text-brand-muted">{hint}</p>}
    <span className="sr-only">{label}</span>
  </div>
);

export const Num: React.FC<{
  label: string;
  value: number | null | undefined;
  onChange: (value: number) => void;
  unit?: string;
  hint?: string;
  step?: string;
}> = ({ label, value, onChange, unit, hint, step }) => {
  // A page can hold many entries, and several rows within one. Without a unique
  // id per field, two inputs share one and clicking a label focuses the wrong
  // one - or worse, toggles a different entry's switch.
  const id = useId();
  return (
    <Field label={label} hint={hint}>
      <NumberInput
        id={id}
        label={label}
        value={value === null || value === undefined ? '' : value}
        onChange={onChange}
        unit={unit}
        step={step}
        min={0}
      />
    </Field>
  );
};

export const Choice: React.FC<{
  label: string;
  value: string;
  options: MethodOption[];
  onChange: (value: string) => void;
  hint?: string;
}> = ({ label, value, options, onChange, hint }) => {
  const id = useId();
  return (
    <Field label={label} hint={hint}>
      <Select
        id={id}
        label={label}
        value={value}
        options={options.map((option) => ({ value: option.value, label: option.label }))}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
};

export const Section: React.FC<{
  title: string;
  description?: string;
  children: React.ReactNode;
}> = ({ title, description, children }) => (
  <div className="flex flex-col gap-3">
    <div>
      <h4 className="text-[13px] font-bold text-brand-heading">{title}</h4>
      {description && (
        <p className="text-[12px] leading-snug text-brand-muted mt-0.5">{description}</p>
      )}
    </div>
    {children}
  </div>
);

export const Grid: React.FC<{ children: React.ReactNode; cols?: 2 | 3 }> = ({ children, cols = 3 }) => (
  <div className={`grid grid-cols-1 sm:grid-cols-2 ${cols === 3 ? 'lg:grid-cols-3' : ''} gap-4`}>
    {children}
  </div>
);

/** A repeating row of sub-entries — a herd group, a treatment route, a waste stream. */
export function RepeatingRows<T>({
  rows, onChange, blank, addLabel, emptyMessage, render,
}: {
  rows: T[];
  onChange: (rows: T[]) => void;
  blank: () => T;
  addLabel: string;
  emptyMessage: string;
  render: (row: T, update: (patch: Partial<T>) => void, index: number) => React.ReactNode;
}) {
  const update = (index: number, patch: Partial<T>) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  return (
    <div className="flex flex-col gap-3">
      {rows.length === 0 && (
        <p className="text-[12px] text-brand-muted italic py-2">{emptyMessage}</p>
      )}
      {rows.map((row, index) => (
        // eslint-disable-next-line react/no-array-index-key
        <div key={index} className="relative rounded-lg border border-border bg-surface-raised p-4 pr-12">
          {render(row, (patch) => update(index, patch), index)}
          <button
            type="button"
            aria-label="Remove this row"
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
            className="absolute top-3 right-3 p-1.5 rounded-md text-brand-muted hover:text-status-danger hover:bg-red-50 transition-colors"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...rows, blank()])}
        className="self-start inline-flex items-center gap-1.5 text-[12px] font-semibold text-brand-primary hover:text-blue-700 transition-colors"
      >
        <Plus size={14} />
        {addLabel}
      </button>
    </div>
  );
}

/**
 * A toggle with an id of its own.
 *
 * The plain Toggle derives its id from its label, which collides the moment two
 * entries on a page carry the same one — and a colliding id makes a click land
 * on the first switch in the document rather than the one under the cursor.
 */
export const Switch: React.FC<{
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
}> = ({ label, checked, onChange, hint }) => {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <Toggle id={id} label={label} checked={checked} onChange={onChange} />
      {hint && <p className="text-[11px] leading-snug text-brand-muted">{hint}</p>}
    </div>
  );
};
