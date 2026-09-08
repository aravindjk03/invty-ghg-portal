import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  elevation?: 'raised' | 'raised-sm' | 'raised-lg';
  noPadding?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  interactive = false,
  elevation = 'raised',
  noPadding = false,
  className,
  ...props
}) => {
  const elevationClass = {
    raised: 'shadow-nm-raised',
    'raised-sm': 'shadow-nm-raised-sm',
    'raised-lg': 'shadow-nm-raised-lg',
  }[elevation];

  return (
    <div
      className={twMerge(
        clsx(
          'bg-surface-raised rounded-lg border border-border transition-all duration-250 ease-out',
          elevationClass,
          !noPadding && 'p-6',
          interactive && 'cursor-pointer hover:shadow-nm-raised-lg active:shadow-nm-pressed',
          className
        )
      )}
      {...props}
    >
      {children}
    </div>
  );
};
