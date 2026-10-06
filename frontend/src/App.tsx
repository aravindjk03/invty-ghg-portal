import React, { Suspense, lazy, useCallback, useState } from 'react';
import { GHGProvider, useGHG } from './context/GHGContext';
import { TopBar } from './components/layout/TopBar';
import { LoginPage } from './pages/LoginPage';
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
const ProductCarbonPage = lazy(() => import('./pages/ProductCarbonPage').then((m) => ({ default: m.ProductCarbonPage })));
const MethodsPage = lazy(() => import('./pages/MethodsPage').then((m) => ({ default: m.MethodsPage })));
const AuditTrailPage = lazy(() => import('./pages/AuditTrailPage').then((m) => ({ default: m.AuditTrailPage })));

// CBAMPage, BRSRPage, CEMSMonitorPage and SupplierPortalPage are intentionally
// not routed. See PARKED_PAGES in config/routes.ts.
import { authService } from './services/authService';
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
 * Read the deep-link page once, synchronously, before the first paint.
 * Setting the page from an effect instead would hand AnimatePresence a key
 * change on mount, which deadlocks `mode="wait"`.
 */
function readInitialPage(): PageKey {
  if (typeof window === 'undefined') return DEFAULT_PAGE;
  return resolvePage(new URLSearchParams(window.location.search).get('page'));
}

function MainApp() {
  const { currentUser, authLoading, setCompanyName, addToast } = useGHG();
  const [currentPage, setCurrentPage] = useState<PageKey>(readInitialPage);

  // Unknown keys (stale links, typos) land on the hub instead of a blank page.
  const navigate = useCallback((page: string) => {
    setCurrentPage(resolvePage(page));
  }, []);

  const goHome = useCallback(() => setCurrentPage(DEFAULT_PAGE), []);

  // Ingest portfolio redirect params on mount
  React.useEffect(() => {
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
  React.useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [currentPage]);

  // While verifying session, show a loading screen instead of flickering
  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#EDF1F7] gap-4">
        <img
          src={`${import.meta.env.BASE_URL}invty-logo.png`}
          alt="IINVTY Logo"
          className="w-14 h-14 object-contain drop-shadow-md animate-pulse"
        />
        <p className="text-sm text-gray-500 font-medium tracking-wide">Verifying session…</p>
      </div>
    );
  }

  const activePage = currentPage;

  const renderPage = () => {
    if (!currentUser) {
      return <LoginPage onNavigate={navigate} />;
    }

    switch (activePage) {
      case 'scope-1':
        return <Scope1Page onNavigate={navigate} />;
      case 'scope-2':
        return <Scope2Page onNavigate={navigate} />;
      case 'scope-3':
        return <Scope3Page onNavigate={navigate} />;
      case 'methods':
        return <MethodsPage onNavigate={navigate} />;
      case 'product-carbon':
        return <ProductCarbonPage onNavigate={navigate} />;
      case 'dashboard':
        return <DashboardPage onNavigate={navigate} />;
      case 'report':
        return <ReportPreviewPage onNavigate={navigate} />;
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
      <div className="print:hidden">
        <TopBar currentPage={currentPage} onNavigate={navigate} />
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
