import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './ui/Button';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Remounts the boundary when this changes, so a fresh page gets a clean slate. */
  resetKey?: string;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Without this, a throw inside any page unmounts the whole tree and leaves a
 * blank white screen with no way back. Keeps the failure scoped to the page.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[INVTY GHG Portal] Page render failed:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="max-w-[1440px] mx-auto w-full px-6 py-16">
        <div className="max-w-xl mx-auto bg-surface-raised border border-border rounded-lg shadow-nm-raised-sm p-6 text-center">
          <div className="w-11 h-11 rounded-md bg-red-50 text-status-danger flex items-center justify-center mx-auto mb-3">
            <AlertTriangle size={22} />
          </div>
          <h2 className="text-lg font-bold text-brand-heading mb-1.5">This workspace failed to load</h2>
          <p className="text-xs text-brand-muted leading-relaxed mb-4">
            Your inventory data is unaffected and remains saved locally. You can return to the hub and
            try again.
          </p>
          <pre className="text-[11px] font-mono text-left bg-surface-sunken border border-border rounded p-2.5 mb-4 overflow-x-auto text-brand-muted">
            {error.message}
          </pre>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              this.setState({ error: null });
              this.props.onReset?.();
            }}
          >
            Back to Scope Hub
          </Button>
        </div>
      </div>
    );
  }
}
