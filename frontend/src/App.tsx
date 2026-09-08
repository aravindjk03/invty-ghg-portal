import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { GHGProvider, useGHG } from './context/GHGContext';
import { TopBar } from './components/layout/TopBar';
import { ErrorBoundary } from './components/ErrorBoundary';

// Each workspace is a self-contained screen and most sessions only visit a
// couple of them, so they are split out of the initial bundle.
const ScopeHubPage = lazy(() => import('./pages/ScopeHubPage').then((m) => ({ default: m.ScopeHubPage })));
const Scope1Page = lazy(() => import('./pages/Scope1Page').then((m) => ({ default: m.Scope1Page })));
const Scope2Page = lazy(() => import('./pages/Scope2Page').then((m) => ({ default: m.Scope2Page })));
const Scope3Page = lazy(() => import('./pages/Scope3Page').then((m) => ({ default: m.Scope3Page })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const ReportPreviewPage = lazy(() => import('./pages/ReportPreviewPage').then((m) => ({ default: m.ReportPreviewPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const ShowcasePage = lazy(() => import('./pages/ShowcasePage').then((m) => ({ default: m.ShowcasePage })));
const CBAMPage = lazy(() => import('./pages/CBAMPage').then((m) => ({ default: m.CBAMPage })));
const BRSRPage = lazy(() => import('./pages/BRSRPage').then((m) => ({ default: m.BRSRPage })));
const CEMSMonitorPage = lazy(() => import('./pages/CEMSMonitorPage').then((m) => ({ default: m.CEMSMonitorPage })));
const SupplierPortalPage = lazy(() => import('./pages/SupplierPortalPage').then((m) => ({ default: m.SupplierPortalPage })));
const AuditTrailPage = lazy(() => import('./pages/AuditTrailPage').then((m) => ({ default: m.AuditTrailPage })));
import { Toast } from './components/ui/Toast';
import { motion, AnimatePresence } from 'framer-motion';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DEFAULT_PAGE, PageKey, resolvePage } from './config/routes';

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

function PageFallback() {
  return (
    <div className="max-w-[1440px] mx-auto w-full px-6 py-16" role="status" aria-live="polite">
      <div className="h-1 w-full max-w-xs mx-auto rounded-pill bg-surface-sunken overflow-hidden">
        <div className="h-full w-1/3 bg-blue-600 animate-pulse rounded-pill" />
      </div>
      <p className="text-center text-xs text-brand-muted mt-3">Loading workspace…</p>
    </div>
  );
}

/**
 * Read the deep-link params once, synchronously, before the first paint.
 * Setting the page from an effect instead would hand AnimatePresence a key
 * change on mount, which deadlocks `mode="wait"` and strands the user on the
 * default page even though the route state has already moved on.
 */
function readInitialPage(): PageKey {
  if (typeof window === 'undefined') return DEFAULT_PAGE;
  return resolvePage(new URLSearchParams(window.location.search).get('page'));
}

function MainApp() {
  const { setCompanyName, addToast } = useGHG();
  const [currentPage, setCurrentPage] = useState<PageKey>(readInitialPage);

  const navigate = useCallback((page: string) => {
    setCurrentPage(resolvePage(page));
  }, []);

  const goHome = useCallback(() => setCurrentPage(DEFAULT_PAGE), []);

  // Ingest the remaining portfolio redirect params on mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    const company = params.get('company');

    if (company) {
      setCompanyName(company);
    }
    if (ref === 'portfolio') {
      addToast('info', 'Welcome from Portfolio. Guest session activated.');
    }
  }, [setCompanyName, addToast]);

  // Each workspace is a full page swap, so carry-over scroll leaves the user
  // stranded mid-document on arrival.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [currentPage]);

  const renderPage = () => {
    switch (currentPage) {
      case 'scope-1':
        return <Scope1Page onNavigate={navigate} />;
      case 'scope-2':
        return <Scope2Page onNavigate={navigate} />;
      case 'scope-3':
        return <Scope3Page onNavigate={navigate} />;
      case 'dashboard':
        return <DashboardPage onNavigate={navigate} />;
      case 'report':
        return <ReportPreviewPage onNavigate={navigate} />;
      case 'cbam':
        return <CBAMPage onNavigate={navigate} />;
      case 'brsr':
        return <BRSRPage onNavigate={navigate} />;
      case 'cems':
        return <CEMSMonitorPage onNavigate={navigate} />;
      case 'suppliers':
        return <SupplierPortalPage onNavigate={navigate} />;
      case 'audit-trail':
        return <AuditTrailPage onNavigate={navigate} />;
      case 'settings':
        return <SettingsPage onNavigate={navigate} />;
      case 'showcase':
        return <ShowcasePage />;
      case 'scope-hub':
      default:
        return <ScopeHubPage onNavigate={navigate} />;
    }
  };

  return (
    <div className="min-h-screen bg-canvas text-brand-body flex flex-col antialiased">
      {/* Persistent Top Navigation Bar */}
      <TopBar currentPage={currentPage} onNavigate={navigate} />

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
            <ErrorBoundary resetKey={currentPage} onReset={goHome}>
              <Suspense fallback={<PageFallback />}>{renderPage()}</Suspense>
            </ErrorBoundary>
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
