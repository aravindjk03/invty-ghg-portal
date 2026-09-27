// Dev-only harness: renders the IPCC methods page against the live engine so
// the forms and the answers can be checked without signing in. Not referenced
// by the app. Mirrors dev-report-preview.tsx.
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { GHGProvider } from './context/GHGContext';
import { MethodsPage } from './pages/MethodsPage';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <GHGProvider>
      <div className="min-h-screen bg-canvas text-brand-body antialiased">
        <MethodsPage onNavigate={(page) => console.log('navigate:', page)} />
      </div>
    </GHGProvider>
  </React.StrictMode>,
);
