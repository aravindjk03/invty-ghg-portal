import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface SegmentOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

export interface SegmentedControlProps {
  options: SegmentOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  size?: 'sm' | 'md';
}

export const SegmentedControl: React.FC<SegmentedControlProps> = ({
  options,
  value,
  onChange,
  className,
  size = 'md',
}) => {
  return (
    <div
      role="radiogroup"
      className={twMerge(
        clsx(
          'inline-flex items-center p-1 rounded-md bg-surface-sunken border border-border shadow-nm-pressed select-none',
          size === 'sm' ? 'h-9 text-xs' : 'h-11 text-sm',
          className
        )
      )}
    >
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            role="radio"
            aria-checked={isActive}
            type="button"
            onClick={() => onChange(option.value)}
            className={twMerge(
              clsx(
                'flex items-center justify-center gap-2 px-4 h-full rounded-md font-medium transition-all duration-250 ease-out focus-visible:outline-2 focus-visible:outline-blue-600',
                isActive
                  ? 'bg-surface-raised text-brand-link border border-border shadow-nm-raised-sm font-semibold'
                  : 'text-brand-muted hover:text-brand-body'
              )
            )}
          >
            {option.icon && <span className="flex-shrink-0">{option.icon}</span>}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
};
