/**
 * The admin site: a separate build (vite.admin.config.ts -> dist-admin) with
 * its own address. Nothing here is part of the customer website's bundle.
 */
import React, { useCallback, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { LogOut } from 'lucide-react';
import '../index.css';
import { env } from '../config/env';
import { AdminLogin } from './AdminLogin';
import { OpsConsolePage } from './OpsConsolePage';
import { adminSession, AdminUser } from './adminSession';
import { ToastProvider } from './toast';

const AdminApp: React.FC = () => {
  const [user, setUser] = useState<AdminUser | null>(() => (adminSession.token() ? adminSession.user() : null));

  const signOut = useCallback(() => {
    const token = adminSession.token();
    if (token) {
      fetch(`${env.API_BASE_URL}/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
        .catch(() => undefined);
    }
    adminSession.clear();
    setUser(null);
  }, []);

  if (!user) return <AdminLogin onSignedIn={setUser} />;
  return (
    <div className="min-h-screen bg-canvas text-brand-body">
      <header className="flex items-center justify-between gap-3 px-4 sm:px-6 h-14 border-b border-border bg-white">
        <span className="font-mono font-bold tracking-wide text-[14px] text-brand-heading">IINVTY · OPS</span>
        <span className="flex items-center gap-3 text-[12.5px] text-brand-muted">
          <span className="hidden sm:inline">{user.email}</span>
          <button type="button" onClick={signOut} className="inline-flex items-center gap-1.5 text-brand-body hover:text-red-600">
            <LogOut size={14} /> Sign out
          </button>
        </span>
      </header>
      <OpsConsolePage onSignedOut={signOut} />
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ToastProvider>
      <AdminApp />
    </ToastProvider>
  </React.StrictMode>,
);
