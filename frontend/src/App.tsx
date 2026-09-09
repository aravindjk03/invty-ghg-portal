import React, { useState } from 'react';
import { GHGProvider, useGHG } from './context/GHGContext';
import { TopBar } from './components/layout/TopBar';
import { ScopeHubPage } from './pages/ScopeHubPage';
import { Scope1Page } from './pages/Scope1Page';
import { Scope2Page } from './pages/Scope2Page';
import { Scope3Page } from './pages/Scope3Page';
import { DashboardPage } from './pages/DashboardPage';
import { ReportPreviewPage } from './pages/ReportPreviewPage';
import { SettingsPage } from './pages/SettingsPage';
import { ShowcasePage } from './pages/ShowcasePage';
import { LoginPage } from './pages/LoginPage';
import { authService } from './services/authService';
import { Toast } from './components/ui/Toast';
import { motion, AnimatePresence } from 'framer-motion';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

function ToastPortal() {
  const { toasts, dismissToast } = useGHG();
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 15, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-auto"
          >
            <Toast
              id={t.id}
              type={t.type === 'error' ? 'danger' : t.type}
              title={t.type.toUpperCase()}
              message={t.message}
              onClose={dismissToast}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function MainApp() {
  const { currentUser, authLoading, setCompanyName, addToast } = useGHG();
  const [currentPage, setCurrentPage] = useState<string>('scope-hub');

  // Ingest portfolio redirect params on mount
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    const company = params.get('company');
    const token = params.get('token');
    const page = params.get('page');

    if (company) {
      setCompanyName(company);
    }
    if (page && currentUser) {
      setCurrentPage(page);
    }

    if (ref === 'portfolio') {
      addToast('info', 'Welcome from Portfolio. Guest session activated.');
    }
  }, [setCompanyName, addToast, currentUser]);

  // While verifying session, show a loading screen instead of flickering
  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#EDF1F7] gap-4">
        <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center text-white font-mono font-bold text-xl shadow-lg animate-pulse">
          IV
        </div>
        <p className="text-sm text-gray-500 font-medium tracking-wide">Verifying session…</p>
      </div>
    );
  }

  const activePage = currentUser ? (currentPage === 'login' ? 'scope-hub' : currentPage) : 'login';

  const renderPage = () => {
    if (!currentUser) {
      return <LoginPage onNavigate={setCurrentPage} />;
    }

    switch (activePage) {
      case 'scope-1':
        return <Scope1Page onNavigate={setCurrentPage} />;
      case 'scope-2':
        return <Scope2Page onNavigate={setCurrentPage} />;
      case 'scope-3':
        return <Scope3Page onNavigate={setCurrentPage} />;
      case 'dashboard':
        return <DashboardPage onNavigate={setCurrentPage} />;
      case 'report':
        return <ReportPreviewPage onNavigate={setCurrentPage} />;
      case 'settings':
        return <SettingsPage onNavigate={setCurrentPage} />;
      case 'showcase':
        return <ShowcasePage />;
      case 'scope-hub':
      default:
        return <ScopeHubPage onNavigate={setCurrentPage} />;
    }
  };

  return (
    <div className="min-h-screen bg-canvas text-brand-body flex flex-col antialiased">
      {/* Persistent Top Navigation Bar */}
      <div className="print:hidden">
        <TopBar currentPage={currentPage} onNavigate={setCurrentPage} />
      </div>

      {/* Dynamic Page Workspace with Transition */}
      <main className="flex-1 w-full">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentPage}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
            className="w-full"
          >
            {renderPage()}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Global Toast Portal */}
      <ToastPortal />
    </div>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <GHGProvider>
        <MainApp />
      </GHGProvider>
    </QueryClientProvider>
  );
}

export default App;
