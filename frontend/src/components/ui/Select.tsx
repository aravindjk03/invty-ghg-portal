import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ChevronDown, AlertCircle } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: SelectOption[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ id, label, error, options, className, disabled, ...props }, ref) => {
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={selectId}
            className="text-[13px] font-medium text-brand-body select-none"
          >
            {label}
          </label>
        )}

        <div className="relative flex items-center w-full">
          <select
            id={selectId}
            ref={ref}
            disabled={disabled}
            aria-invalid={!!error}
            className={twMerge(
              clsx(
                'w-full h-11 bg-surface-raised border rounded-md px-4 pr-10 text-[15px] text-brand-body appearance-none cursor-pointer',
                'shadow-nm-inset-input transition-colors duration-150',
                'focus-visible:border-blue-600 focus-visible:outline-2 focus-visible:outline-blue-600 focus-visible:outline-offset-2',
                error ? 'border-status-danger' : 'border-border',
                disabled && 'bg-surface text-brand-decorative cursor-not-allowed shadow-none',
                className
              )
            )}
            {...props}
          >
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <ChevronDown
            size={18}
            className="absolute right-3.5 text-brand-muted pointer-events-none"
          />
        </div>

        {error && (
          <div className="flex items-center gap-1.5 text-xs text-status-danger mt-0.5">
            <AlertCircle size={14} className="flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';
