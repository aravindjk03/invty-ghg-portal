import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { AlertTriangle, Leaf, Lock, Mail, ShieldCheck, User } from 'lucide-react';

type Mode = 'signin' | 'register';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void;
          renderButton: (el: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

/** Loads Google Identity Services once, and only when a client id is configured. */
function useGoogleIdentity(clientId: string | null, onCredential: (credential: string) => void) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const handlerRef = useRef(onCredential);
  handlerRef.current = onCredential;

  useEffect(() => {
    if (!clientId || !buttonRef.current) return;

    const render = () => {
      if (!window.google || !buttonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response: { credential?: string }) => {
          if (response.credential) handlerRef.current(response.credential);
        },
      });
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: 'outline',
        size: 'large',
        width: 320,
        text: 'continue_with',
challenge: undefined,
      });
    };

    if (window.google) {
      render();
      return;
    }

    const existing = document.getElementById('google-identity-services');
    if (existing) {
      existing.addEventListener('load', render);
      return () => existing.removeEventListener('load', render);
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.id = 'google-identity-services';
    script.async = true;
    script.defer = true;
    script.onload = render;
    document.head.appendChild(script);
  }, [clientId]);

  return buttonRef;
}

export const LoginPage: React.FC = () => {
  const { config, signIn, register, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const minLength = config?.minPasswordLength ?? 12;

  const handleGoogleCredential = async (credential: string) => {
    setError(null);
    setBusy(true);
    try {
      await signInWithGoogle(credential);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const googleButtonRef = useGoogleIdentity(
    config?.googleEnabled ? config.googleClientId : null,
    handleGoogleCredential
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'register' && name.trim().length < 2) {
      setError('Enter your full name.');
      return;
    }
    if (mode === 'register' && password.length < minLength) {
      setError(`Password must be at least ${minLength} characters.`);
      return;
    }

    setBusy(true);
    try {
      if (mode === 'signin') await signIn(email, password);
      else await register(name, email, password);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-[420px]">
        {/* Brand */}
        <div className="flex items-center justify-center gap-2.5 mb-7">
          <div className="w-10 h-10 rounded-md bg-blue-600 flex items-center justify-center text-white shadow-nm-raised-sm">
            <span className="font-mono font-bold text-lg tracking-tighter">IV</span>
          </div>
          <div className="flex flex-col text-left">
            <span className="font-mono font-bold text-base tracking-wider text-brand-heading leading-tight">
              INVTY
            </span>
            <span className="text-[10px] uppercase tracking-widest text-brand-muted font-semibold">
              GHG Portal
            </span>
          </div>
        </div>

        <div className="bg-surface-raised border border-border rounded-lg shadow-nm-raised p-7">
          <h1 className="text-xl font-bold text-brand-heading text-center">
            {mode === 'signin' ? 'Sign in to your inventory' : 'Create your account'}
          </h1>
          <p className="text-xs text-brand-muted text-center mt-1.5 mb-6 leading-relaxed">
            {mode === 'signin'
              ? 'Your greenhouse gas inventory, emission factors and audit trail.'
              : 'Set up an organisation and start a GHG Protocol inventory.'}
          </p>

          {config?.googleEnabled && (
            <>
              <div className="flex justify-center" ref={googleButtonRef} />
              <div className="flex items-center gap-3 my-5">
                <span className="h-px flex-1 bg-border" />
                <span className="text-[11px] uppercase tracking-wider text-brand-muted font-semibold">
                  or
                </span>
                <span className="h-px flex-1 bg-border" />
              </div>
            </>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-semibold text-brand-body mb-1">Full name</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Priya Raman"
                  autoComplete="name"
                  leftIcon={<User size={15} />}
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-brand-body mb-1">Work email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                required
                leftIcon={<Mail size={15} />}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-brand-body mb-1">Password</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'register' ? `At least ${minLength} characters` : '••••••••'}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                required
                leftIcon={<Lock size={15} />}
              />
              {mode === 'register' && (
                <p className="text-[11px] text-brand-muted mt-1">
                  Use a long passphrase. Minimum {minLength} characters.
                </p>
              )}
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 p-2.5 rounded bg-red-50 border border-red-200 text-red-800 text-xs"
              >
                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" variant="primary" size="md" className="w-full" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </Button>
          </form>

          <div className="mt-5 pt-4 border-t border-border text-center">
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'signin' ? 'register' : 'signin');
                setError(null);
              }}
              className="text-xs font-semibold text-brand-link hover:text-brand-heading transition-colors"
            >
              {mode === 'signin'
                ? 'No account yet? Create one'
                : 'Already have an account? Sign in'}
            </button>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-center gap-4 text-[11px] text-brand-muted">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck size={13} className="text-status-success" />
            Passwords hashed with scrypt
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Leaf size={13} className="text-status-success" />
            GHG Protocol aligned
          </span>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
