import React from 'react';
import { clsx } from 'clsx';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

export interface ToastProps {
  id: string;
  type?: 'success' | 'warning' | 'danger' | 'info';
  title: string;
  message?: string;
  onClose: (id: string) => void;
}

export const Toast: React.FC<ToastProps> = ({
  id,
  type = 'info',
  title,
  message,
  onClose,
}) => {
  const icon = {
    success: <CheckCircle2 size={18} className="text-status-success flex-shrink-0" />,
    warning: <AlertTriangle size={18} className="text-status-warning flex-shrink-0" />,
    danger: <AlertCircle size={18} className="text-status-danger flex-shrink-0" />,
    info: <Info size={18} className="text-blue-600 flex-shrink-0" />,
  }[type];

  return (
    <div
      role="alert"
      className={clsx(
        'w-80 p-4 rounded-lg bg-surface-raised border border-border shadow-nm-raised flex items-start gap-3',
        'animate-in fade-in slide-in-from-top-2 duration-250'
      )}
    >
      {icon}
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-semibold text-brand-heading leading-tight">{title}</h4>
        {message && <p className="text-xs text-brand-muted mt-1 leading-normal">{message}</p>}
      </div>
      <button
        type="button"
        onClick={() => onClose(id)}
        aria-label="Dismiss toast"
        className="text-brand-decorative hover:text-brand-body flex-shrink-0"
      >
        <X size={16} />
      </button>
    </div>
  );
};
