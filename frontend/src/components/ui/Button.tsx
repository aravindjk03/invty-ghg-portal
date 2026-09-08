import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      fullWidth = false,
      leftIcon,
      rightIcon,
      disabled,
      className,
      ...props
    },
    ref
  ) => {
    const sizeClasses = {
      sm: 'h-9 px-3 text-xs',
      md: 'h-11 px-6 text-sm',
      lg: 'h-12 px-8 text-base',
    }[size];

    const variantClasses = {
      primary: clsx(
        'bg-blue-600 text-white border border-blue-700 shadow-nm-raised-sm font-semibold',
        'hover:bg-blue-500 hover:shadow-nm-raised',
        'active:bg-blue-700 active:shadow-nm-pressed'
      ),
      secondary: clsx(
        'bg-surface-raised text-brand-link border border-border shadow-nm-raised-sm font-medium',
        'hover:bg-surface hover:shadow-nm-raised',
        'active:shadow-nm-pressed'
      ),
      ghost: clsx(
        'bg-transparent text-brand-link border border-transparent font-medium',
        'hover:bg-blue-50 hover:border-border active:bg-blue-100'
      ),
      danger: clsx(
        'bg-status-danger text-white border border-red-800 shadow-nm-raised-sm font-semibold',
        'hover:bg-red-700 hover:shadow-nm-raised',
        'active:shadow-nm-pressed'
      ),
    }[variant];

    const disabledClasses = disabled
      ? 'shadow-none !bg-surface !text-brand-decorative !border-border cursor-not-allowed opacity-100 hover:!bg-surface hover:!shadow-none active:!shadow-none'
      : '';

    return (
      <button
        ref={ref}
        disabled={disabled}
        className={twMerge(
          clsx(
            'inline-flex items-center justify-center gap-2 rounded-md transition-all duration-150 select-none whitespace-nowrap focus-visible:outline-2 focus-visible:outline-blue-600 focus-visible:outline-offset-2',
            sizeClasses,
            variantClasses,
            disabledClasses,
            fullWidth && 'w-full',
            className
          )
        )}
        {...props}
      >
        {leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
        <span>{children}</span>
        {rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';
