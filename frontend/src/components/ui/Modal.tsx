import React, { useEffect } from 'react';
import { Card } from './Card';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-[#071B3A]/30 backdrop-blur-[2px]"
          />

          {/* Dialog Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
            className="relative z-10 w-full max-w-lg"
          >
            <Card elevation="raised-lg" className="rounded-xl border-border p-6 shadow-nm-raised-lg">
              {/* Header */}
              <div className="flex items-start justify-between pb-4 border-b border-border">
                <div>
                  <h3 className="text-lg font-bold text-brand-heading">{title}</h3>
                  {description && <p className="text-xs text-brand-muted mt-1">{description}</p>}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close modal"
                  className="w-8 h-8 rounded-md flex items-center justify-center text-brand-muted hover:text-brand-heading hover:bg-blue-50 border border-transparent hover:border-border transition-colors focus-visible:outline-2 focus-visible:outline-blue-600"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Body */}
              <div className="py-4 text-sm text-brand-body leading-relaxed">{children}</div>

              {/* Footer */}
              {footer && <div className="pt-4 border-t border-border flex items-center justify-end gap-3">{footer}</div>}
            </Card>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
