import React from 'react';
import { Button } from './Button';
import { PlusCircle, UploadCloud } from 'lucide-react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAdd?: () => void;
  onAddFirst?: () => void;
  onUploadCsv?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAdd,
  onAddFirst,
  onUploadCsv,
}) => {
  const handleAdd = onAdd || onAddFirst;
  const label = actionLabel || 'Add first entry';

  return (
    <div className="flex flex-col items-center justify-center p-8 text-center rounded-lg border border-dashed border-border bg-surface/50">
      <div className="w-14 h-14 rounded-full bg-surface-sunken border border-border shadow-nm-pressed flex items-center justify-center text-brand-link mb-3">
        {icon || <PlusCircle size={24} />}
      </div>
      <h4 className="text-base font-semibold text-brand-heading">{title}</h4>
      <p className="text-xs text-brand-muted max-w-sm mt-1 mb-5">{description}</p>
      <div className="flex items-center gap-3">
        {handleAdd && (
          <Button variant="primary" size="sm" onClick={handleAdd} leftIcon={<PlusCircle size={15} />}>
            {label}
          </Button>
        )}
        {onUploadCsv && (
          <Button variant="secondary" size="sm" onClick={onUploadCsv} leftIcon={<UploadCloud size={15} />}>
            Upload CSV
          </Button>
        )}
      </div>
    </div>
  );
};
