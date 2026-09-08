import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface NumberInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label?: string;
  value: number | '';
  onChange: (val: number) => void;
  unit?: string;
}

export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  ({ id, label, value, onChange, unit, className, disabled, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
      onChange(isNaN(val) ? 0 : val);
    };

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-[13px] font-medium text-brand-body select-none"
          >
            {label}
          </label>
        )}

        <div className="relative flex items-center w-full">
          <input
            id={inputId}
            ref={ref}
            type="number"
            value={value}
            onChange={handleChange}
            disabled={disabled}
            className={twMerge(
              clsx(
                'w-full h-11 bg-surface-raised border border-border rounded-md px-4 font-mono tabular-nums text-[15px] text-brand-body',
                'shadow-nm-inset-input transition-colors duration-150',
                'focus-visible:border-blue-600 focus-visible:outline-2 focus-visible:outline-blue-600 focus-visible:outline-offset-2',
                unit && 'pr-12',
                disabled && 'bg-surface text-brand-decorative cursor-not-allowed shadow-none',
                className
              )
            )}
            {...props}
          />
          {unit && (
            <span className="absolute right-3.5 text-xs font-mono text-brand-muted pointer-events-none select-none">
              {unit}
            </span>
          )}
        </div>
      </div>
    );
  }
);

NumberInput.displayName = 'NumberInput';
