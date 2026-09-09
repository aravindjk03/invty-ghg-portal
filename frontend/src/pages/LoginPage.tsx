import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { authService, User } from '../services/authService';
import { useGHG } from '../context/GHGContext';
import { Loader2, AlertCircle, Database, CheckCircle2, User as UserIcon, Building2 } from 'lucide-react';

export interface LoginPageProps {
  onNavigate: (page: string) => void;
}

export default function LoginPage({ onNavigate }: LoginPageProps) {
  const { setCompanyName, addToast } = useGHG();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Forgot password modal state
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);

  // Pre-fill remembered email if saved
  useEffect(() => {
    const savedEmail = localStorage.getItem('invty_remembered_email');
    if (savedEmail) {
      setEmail(savedEmail);
    }
  }, []);

  const handleAuthSuccess = (user: User, msg: string) => {
    if (rememberMe) {
      localStorage.setItem('invty_remembered_email', user.email);
    } else {
      localStorage.removeItem('invty_remembered_email');
    }

    if (user.companyName) {
      setCompanyName(user.companyName);
    }
    addToast('success', `${msg} Welcome, ${user.name}!`);
    onNavigate('scope-hub');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'signin') {
        const res = await authService.login(email.trim(), password);
        handleAuthSuccess(res.user, 'Signed in successfully to SQLite database.');
      } else {
        if (!name.trim()) throw new Error('Please enter your full name.');
        if (!company.trim()) throw new Error('Please enter your company or organization name.');
        const res = await authService.signup({
          name: name.trim(),
          email: email.trim(),
          password,
          companyName: company.trim(),
        });
        handleAuthSuccess(res.user, 'Account created and saved to database.');
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await authService.oauthMock('google');
      handleAuthSuccess(res.user, 'Authenticated with Google.');
    } catch (err: any) {
      setError(err.message || 'Google authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const fillDemoCredentials = (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setMode('signin');
    setError(null);
  };

  const handleForgotSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;
    setForgotSent(true);
    setTimeout(() => {
      setForgotOpen(false);
      setForgotSent(false);
      addToast('info', `Password recovery link dispatched to ${forgotEmail}`);
    }, 1400);
  };

  return (
    <div className="min-h-[calc(100vh-72px)] w-full flex items-center justify-center p-4 sm:p-6 bg-[#EDF1F7]">
      <div className="flex flex-col md:flex-row max-w-5xl w-full bg-white rounded-3xl shadow-2xl border border-gray-200/80 overflow-hidden min-h-[660px]">
        {/* Left Side Hero Banner Image */}
        <div className="w-full md:w-1/2 relative hidden md:block bg-slate-900">
          <img
            className="h-full w-full object-cover"
            src="https://cdn.21st.dev/assets/mirror/f4/f48e20bd4dcdcf2ca40eafe923e1134d17f43dce1c5bff8f1b96b7301e126ec3.png"
            alt="INVTY GHG Portal Hero"
            onError={(e) => {
              // Fallback if CDN is unreachable
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          {/* Subtle branding overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-900/20 to-transparent p-8 flex flex-col justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white font-mono font-bold text-lg shadow-lg">
                IV
              </div>
              <div className="flex flex-col">
                <span className="font-mono font-bold text-white tracking-wider text-base">INVTY</span>
                <span className="text-[10px] uppercase tracking-widest text-slate-300 font-semibold">
                  GHG Accounting Portal
                </span>
              </div>
            </div>

            <div className="text-white space-y-1.5">
              <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/20 border border-blue-400/30 text-blue-300 backdrop-blur-sm">
                Corporate GHG Protocol & BRSR Core
              </span>
              <h3 className="text-xl font-bold text-white tracking-tight">
                Enterprise Carbon Accounting Engine
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed max-w-sm">
                Precision Scope 1, Scope 2, and Scope 3 footprint quantification wired to a deterministic calculation registry.
              </p>
            </div>
          </div>
        </div>

        {/* Right Side Form */}
        <div className="w-full md:w-1/2 flex flex-col items-center justify-center p-6 sm:p-10">
          <form className="w-full max-w-sm flex flex-col items-center justify-center" onSubmit={handleSubmit}>
            <h2 className="text-3xl sm:text-4xl text-gray-900 font-medium tracking-tight">
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </h2>
            <p className="text-sm text-gray-500/90 mt-2 text-center">
              {mode === 'signin'
                ? 'Welcome back! Please sign in to continue'
                : 'Join INVTY to manage corporate emissions inventory'}
            </p>

            {/* Error Banner */}
            {error && (
              <div className="w-full mt-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2.5 text-xs text-red-700 font-medium">
                <AlertCircle size={15} className="flex-shrink-0 text-red-500" />
                <span>{error}</span>
              </div>
            )}

            {/* Google Single Sign-On Button */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full mt-6 bg-gray-500/10 hover:bg-gray-500/15 border border-gray-200/60 transition-colors flex items-center justify-center h-12 rounded-full gap-2.5"
            >
              <img
                src="https://cdn.21st.dev/assets/mirror/1c/1cfd0c4e7a6f38863315799a1bb09f981d08df39353f5f1467aec59e328e1bbd.svg"
                alt="googleLogo"
                className="w-5 h-5"
                onError={(e) => {
                  // Fallback Google G icon
                  (e.target as HTMLImageElement).src = 'https://www.google.com/favicon.ico';
                }}
              />
              <span className="text-sm font-medium text-gray-700">Continue with Google</span>
            </button>

            {/* Divider */}
            <div className="flex items-center gap-4 w-full my-5">
              <div className="w-full h-px bg-gray-300/90"></div>
              <p className="w-full text-nowrap text-xs sm:text-sm text-gray-500/90 text-center font-medium">
                {mode === 'signin' ? 'or sign in with email' : 'or register with email'}
              </p>
              <div className="w-full h-px bg-gray-300/90"></div>
            </div>

            {/* In Signup Mode: Name & Company Inputs */}
            {mode === 'signup' && (
              <div className="w-full flex flex-col gap-3 mb-3">
                <div className="flex items-center w-full bg-transparent border border-gray-300/60 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 transition-all h-12 rounded-full overflow-hidden pl-5 pr-4 gap-2.5">
                  <UserIcon size={16} className="text-gray-400 flex-shrink-0" />
                  <input
                    type="text"
                    placeholder="Full name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="bg-transparent text-gray-800 placeholder-gray-500/80 outline-none text-sm w-full h-full"
                    required
                    disabled={loading}
                  />
                </div>

                <div className="flex items-center w-full bg-transparent border border-gray-300/60 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 transition-all h-12 rounded-full overflow-hidden pl-5 pr-4 gap-2.5">
                  <Building2 size={16} className="text-gray-400 flex-shrink-0" />
                  <input
                    type="text"
                    placeholder="Company or Organization"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    className="bg-transparent text-gray-800 placeholder-gray-500/80 outline-none text-sm w-full h-full"
                    required
                    disabled={loading}
                  />
                </div>
              </div>
            )}

            {/* Email Input */}
            <div className="flex items-center w-full bg-transparent border border-gray-300/60 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 transition-all h-12 rounded-full overflow-hidden pl-6 pr-4 gap-2">
              <svg width="16" height="11" viewBox="0 0 16 11" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M0 .55.571 0H15.43l.57.55v9.9l-.571.55H.57L0 10.45zm1.143 1.138V9.9h13.714V1.69l-6.503 4.8h-.697zM13.749 1.1H2.25L8 5.356z"
                  fill="#6B7280"
                />
              </svg>
              <input
                type="email"
                placeholder="Email id"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-transparent text-gray-800 placeholder-gray-500/80 outline-none text-sm w-full h-full"
                required
                disabled={loading}
                autoComplete="email"
              />
            </div>

            {/* Password Input */}
            <div className="flex items-center mt-4 w-full bg-transparent border border-gray-300/60 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 transition-all h-12 rounded-full overflow-hidden pl-6 pr-4 gap-2">
              <svg width="13" height="17" viewBox="0 0 13 17" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
                <path
                  d="M13 8.5c0-.938-.729-1.7-1.625-1.7h-.812V4.25C10.563 1.907 8.74 0 6.5 0S2.438 1.907 2.438 4.25V6.8h-.813C.729 6.8 0 7.562 0 8.5v6.8c0 .938.729 1.7 1.625 1.7h9.75c.896 0 1.625-.762 1.625-1.7zM4.063 4.25c0-1.406 1.093-2.55 2.437-2.55s2.438 1.144 2.438 2.55V6.8H4.061z"
                  fill="#6B7280"
                />
              </svg>
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-transparent text-gray-800 placeholder-gray-500/80 outline-none text-sm w-full h-full"
                required
                disabled={loading}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              />
            </div>

            {/* Remember Me and Forgot Password */}
            {mode === 'signin' && (
              <div className="w-full flex items-center justify-between mt-5 text-gray-500/80">
                <div className="flex items-center gap-2">
                  <input
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    type="checkbox"
                    id="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <label className="text-xs sm:text-sm cursor-pointer select-none" htmlFor="checkbox">
                    Remember me
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setForgotEmail(email);
                    setForgotOpen(true);
                  }}
                  className="text-xs sm:text-sm underline hover:text-indigo-600 transition-colors"
                >
                  Forgot password?
                </button>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className={cn(
                'mt-6 w-full h-11 rounded-full text-white bg-indigo-600 hover:bg-indigo-700 transition-all font-medium flex items-center justify-center gap-2 shadow-md shadow-indigo-600/20 active:scale-[0.99]',
                loading && 'opacity-70 cursor-not-allowed'
              )}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Connecting to DB...</span>
                </>
              ) : mode === 'signin' ? (
                'Login'
              ) : (
                'Create Account'
              )}
            </button>

            {/* Toggle Signin / Signup */}
            <p className="text-gray-500/90 text-xs sm:text-sm mt-4 text-center">
              {mode === 'signin' ? (
                <>
                  Don’t have an account?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setMode('signup');
                      setError(null);
                    }}
                    className="text-indigo-600 hover:underline font-semibold"
                  >
                    Sign up
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setMode('signin');
                      setError(null);
                    }}
                    className="text-indigo-600 hover:underline font-semibold"
                  >
                    Sign in
                  </button>
                </>
              )}
            </p>

            {/* SQLite Database Quick Test Accounts */}
            <div className="w-full mt-6 p-3 bg-slate-50 border border-dashed border-slate-300 rounded-2xl">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-2">
                <Database size={13} className="text-indigo-600" />
                <span>Pre-seeded SQLite Test Logins</span>
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                <button
                  type="button"
                  onClick={() => fillDemoCredentials('admin@invty.com', 'Invty@2026')}
                  className="flex items-center justify-between text-left p-2 rounded-xl bg-white border border-slate-200 hover:border-indigo-400 text-xs transition-colors"
                >
                  <span className="font-medium text-slate-700">admin@invty.com</span>
                  <span className="font-mono text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">
                    Invty@2026
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => fillDemoCredentials('demo@company.com', 'Demo@1234')}
                  className="flex items-center justify-between text-left p-2 rounded-xl bg-white border border-slate-200 hover:border-indigo-400 text-xs transition-colors"
                >
                  <span className="font-medium text-slate-700">demo@company.com</span>
                  <span className="font-mono text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">
                    Demo@1234
                  </span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Forgot Password Dialog */}
      {forgotOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6 max-w-sm w-full animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Reset password</h3>
            <p className="text-xs text-gray-500 mb-4">
              Enter your corporate email address to receive password reset instructions.
            </p>

            {forgotSent ? (
              <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded-xl text-xs flex items-center gap-2">
                <CheckCircle2 size={16} className="text-green-600 flex-shrink-0" />
                <span>Reset email dispatched! Please check your inbox.</span>
              </div>
            ) : (
              <form onSubmit={handleForgotSubmit} className="space-y-3">
                <input
                  type="email"
                  placeholder="name@company.com"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  className="w-full h-11 px-4 border border-gray-300 rounded-full text-xs text-gray-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  required
                />
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setForgotOpen(false)}
                    className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-full"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-full"
                  >
                    Send instructions
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export { LoginPage };
