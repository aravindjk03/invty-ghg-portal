import React from 'react';
import { Badge, BadgeVariant } from './Badge';
import { ScopeType } from '../../types/ghg';

export interface ScopeBadgeProps {
  scope: ScopeType;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const ScopeBadge: React.FC<ScopeBadgeProps> = ({ scope, label, size = 'md', className }) => {
  const config: Record<ScopeType, { variant: BadgeVariant; defaultLabel: string }> = {
    'scope-1': { variant: 'scope1', defaultLabel: 'Scope 1' },
    'scope-2': { variant: 'scope2', defaultLabel: 'Scope 2' },
    'scope-3': { variant: 'scope3', defaultLabel: 'Scope 3' },
    biogenic: { variant: 'biogenic', defaultLabel: 'Biogenic Memo' },
    memo: { variant: 'default', defaultLabel: 'Memo Item' },
  };

  const item = config[scope] || config['scope-1'];

  const sizeClass = size === 'sm' ? 'text-[11px] h-5 px-2' : size === 'lg' ? 'text-sm h-7 px-3' : '';

  return (
    <Badge variant={item.variant} dot className={`${sizeClass} ${className || ''}`}>
      {label || item.defaultLabel}
    </Badge>
  );
};
