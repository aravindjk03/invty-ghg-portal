import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface ToggleProps {
  id?: string;
  label?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export const Toggle: React.FC<ToggleProps> = ({
  id,
  label,
  checked,
  onChange,
  disabled = false,
}) => {
  const toggleId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : 'toggle');

  return (
    <label
      htmlFor={toggleId}
      className={clsx(
        'inline-flex items-center gap-3 select-none cursor-pointer',
        disabled && 'cursor-not-allowed opacity-60'
      )}
    >
      <div className="relative inline-block w-12 h-6">
        <input
          id={toggleId}
          type="checkbox"
          checked={checked}
          onChange={(e) => !disabled && onChange(e.target.checked)}
          disabled={disabled}
          className="sr-only"
        />
        {/* Track */}
        <div
          className={twMerge(
            clsx(
              'w-12 h-6 rounded-pill bg-surface-sunken border border-border shadow-nm-pressed transition-colors duration-250',
              checked && 'bg-blue-100 border-blue-200'
            )
          )}
        />
        {/* Thumb */}
        <div
          className={twMerge(
            clsx(
              'absolute top-0.5 left-0.5 w-5 h-5 rounded-pill bg-surface-raised border border-border shadow-nm-raised-sm transition-transform duration-250 ease-out',
              checked && 'translate-x-6 border-blue-500 bg-white'
            )
          )}
        />
      </div>

      {label && <span className="text-sm font-medium text-brand-body">{label}</span>}
    </label>
  );
};
