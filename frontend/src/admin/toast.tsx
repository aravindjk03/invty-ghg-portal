import React, { createContext, useCallback, useContext, useState } from 'react';

type Kind = 'success' | 'error' | 'info';
interface Toast { id: number; kind: Kind; text: string }

const ToastContext = createContext<(kind: Kind, text: string) => void>(() => undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const add = useCallback((kind: Kind, text: string) => {
    const id = Date.now() + Math.random();
    setToasts((all) => [...all, { id, kind, text }]);
    setTimeout(() => setToasts((all) => all.filter((t) => t.id !== id)), 4500);
  }, []);
  return (
    <ToastContext.Provider value={add}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`rounded-lg border px-4 py-2.5 text-[13px] shadow-md bg-white ${
            t.kind === 'error' ? 'border-red-200 text-red-800' : t.kind === 'success' ? 'border-emerald-200 text-emerald-800' : 'border-border text-brand-body'}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => useContext(ToastContext);
