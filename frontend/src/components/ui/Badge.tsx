import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export type BadgeVariant =
  | 'default'
  | 'primary'
  | 'verified'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'scope1'
  | 'scope2'
  | 'scope3'
  | 'biogenic';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  dot = false,
  className,
  ...props
}) => {
  const variantStyles: Record<BadgeVariant, string> = {
    default: 'bg-blue-100 text-brand-link border-blue-200',
    primary: 'bg-blue-600/15 text-brand-primary border-blue-600/30',
    verified: 'bg-emerald-500/15 text-emerald-800 border-emerald-500/30',
    success: 'bg-[#0F7B4F]/15 text-status-success border-[#0F7B4F]/30',
    warning: 'bg-[#A66300]/15 text-status-warning border-[#A66300]/30',
    danger: 'bg-[#B42318]/15 text-status-danger border-[#B42318]/30',
    info: 'bg-blue-100 text-blue-600 border-blue-200',
    scope1: 'bg-[#D9480F]/15 text-scope-1 border-[#D9480F]/30',
    scope2: 'bg-[#1D5BD6]/15 text-scope-2 border-[#1D5BD6]/30',
    scope3: 'bg-[#6741D9]/15 text-scope-3 border-[#6741D9]/30',
    biogenic: 'bg-[#64748B]/15 text-scope-biogenic border-[#64748B]/30',
  };

  const dotColor: Record<BadgeVariant, string> = {
    default: 'bg-brand-link',
    primary: 'bg-brand-primary',
    verified: 'bg-emerald-600',
    success: 'bg-status-success',
    warning: 'bg-status-warning',
    danger: 'bg-status-danger',
    info: 'bg-blue-600',
    scope1: 'bg-scope-1',
    scope2: 'bg-scope-2',
    scope3: 'bg-scope-3',
    biogenic: 'bg-scope-biogenic',
  };

  return (
    <span
      className={twMerge(
        clsx(
          'inline-flex items-center gap-1.5 h-6 px-2 rounded border text-xs font-semibold select-none leading-none tracking-tight',
          variantStyles[variant] || variantStyles.default,
          className
        )
      )}
      {...props}
    >
      {dot && <span className={clsx('w-1.5 h-1.5 rounded-full', dotColor[variant] || dotColor.default)} />}
      <span>{children}</span>
    </span>
  );
};
