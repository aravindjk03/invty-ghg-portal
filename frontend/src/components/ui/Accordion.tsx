import React, { useState } from 'react';
import { Card } from './Card';
import { ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface AccordionProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  subtitle?: string;
  badge?: React.ReactNode;
  subtotal?: number;
  unit?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export const Accordion: React.FC<AccordionProps> = ({
  icon,
  title,
  description,
  subtitle,
  badge,
  subtotal,
  unit = 'tCO₂e',
  defaultOpen = false,
  children,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const displayDesc = subtitle || description;

  return (
    <Card noPadding className="overflow-hidden transition-all duration-250 mb-4">
      {/* Accordion Header */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="w-full p-5 flex items-center justify-between text-left hover:bg-surface/50 transition-colors select-none focus-visible:outline-2 focus-visible:outline-blue-600"
      >
        <div className="flex items-center gap-4">
          {icon && (
            <div className="w-11 h-11 rounded-full bg-surface-sunken border border-border shadow-nm-pressed flex items-center justify-center flex-shrink-0 text-brand-body">
              {icon}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-brand-heading">{title}</h3>
              {badge}
            </div>
            {displayDesc && <p className="text-xs text-brand-muted mt-0.5">{displayDesc}</p>}
          </div>
        </div>

        <div className="flex items-center gap-5">
          {subtotal !== undefined && (
            <div className="text-right">
              <span className="text-[17px] font-mono font-bold text-brand-heading tabular-nums">
                {subtotal.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              </span>
              <span className="text-xs font-medium text-brand-muted ml-1.5">{unit}</span>
            </div>
          )}

          <div
            className={`w-8 h-8 rounded-md flex items-center justify-center text-brand-muted transition-transform duration-250 ${
              isOpen ? 'rotate-180 text-brand-body' : ''
            }`}
          >
            <ChevronDown size={20} />
          </div>
        </div>
      </button>

      {/* Accordion Expanded Content */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
            className="overflow-hidden border-t border-border"
          >
            <div className="p-6 bg-surface/30">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
};
