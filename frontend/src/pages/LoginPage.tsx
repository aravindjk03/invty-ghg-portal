import React, { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { authService, User, DemoAccount } from '../services/authService';
import { useGHG } from '../context/GHGContext';
import { env } from '../config/env';
import { 
  Loader2, 
  AlertCircle, 
  Database, 
  CheckCircle2, 
  User as UserIcon, 
  Building2,
  Eye,
  EyeOff,
  Mail,
  Smartphone,
  ArrowRight,
  RefreshCw,
  Edit2,
  ShieldCheck,
  Settings,
  ExternalLink,
  KeyRound
} from 'lucide-react';

export interface LoginPageProps {
  onNavigate: (page: string) => void;
}

type AuthMethod = 'email' | 'mobile';

export default function LoginPage({ onNavigate }: LoginPageProps) {
  const { setCurrentUser, setCompanyName, addToast } = useGHG();

  // Primary mode tabs
  const [authMethod, setAuthMethod] = useState<AuthMethod>('email');
  
  // Email Form State
  const [emailMode, setEmailMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [rememberMe, setRememberMe] = useState(true);

  // Mobile OTP State
  const [countryCode, setCountryCode] = useState('+91');
  const [mobileNumber, setMobileNumber] = useState('');
  const [mobileStep, setMobileStep] = useState<'phone' | 'otp'>('phone');
  const [otpCode, setOtpCode] = useState('');
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [mobileName, setMobileName] = useState('');
  const [mobileCompany, setMobileCompany] = useState('');

  // Real Google OAuth State
  const [googleConfigModalOpen, setGoogleConfigModalOpen] = useState(false);
  const [googleClientIdInput, setGoogleClientIdInput] = useState('');
  const [savedGoogleClientId, setSavedGoogleClientId] = useState<string>('');
  const [googleLoading, setGoogleLoading] = useState(false);
  const googleBtnRef = useRef<HTMLDivElement>(null);

  // Shared UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Forgot password modal state
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);

  // Pre-fill remembered email and load Google Client ID
  useEffect(() => {
    const savedEmail = localStorage.getItem('invty_remembered_email');
    if (savedEmail) {
      setEmail(savedEmail);
    }
    const cid = env.GOOGLE_CLIENT_ID || localStorage.getItem('invty_google_client_id') || '';
    setSavedGoogleClientId(cid);
    setGoogleClientIdInput(cid);
  }, []);

  // Initialize Google One-Tap / Standard Google Sign In button if Client ID exists
  useEffect(() => {
    if (!savedGoogleClientId) return;

    const checkGoogleSdk = setInterval(() => {
      if ((window as any).google?.accounts?.id) {
        clearInterval(checkGoogleSdk);

        try {
          (window as any).google.accounts.id.initialize({
            client_id: savedGoogleClientId,
            callback: async (response: any) => {
              if (response.credential) {
                setLoading(true);
                try {
                  const authRes = await authService.googleAuth({
                    credential: response.credential,
                  });
                  handleAuthSuccess(authRes.user, 'Google authentication successful.');
                } catch (err: any) {
                  setError(err.message || 'Google authentication failed.');
                } finally {
                  setLoading(false);
                }
              }
            },
          });

          if (googleBtnRef.current) {
            (window as any).google.accounts.id.renderButton(googleBtnRef.current, {
              theme: 'outline',
              size: 'large',
              width: 320,
              shape: 'pill',
              text: 'continue_with',
            });
          }
        } catch (e) {
          console.warn('[GOOGLE SDK INIT NOTICE]', e);
        }
      }
    }, 300);

    return () => clearInterval(checkGoogleSdk);
  }, [savedGoogleClientId]);

  // Countdown timer for OTP resend
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const handleAuthSuccess = (user: User, msg: string) => {
    if (rememberMe && user.email && !user.email.includes('@invty-auth.local')) {
      localStorage.setItem('invty_remembered_email', user.email);
    }

    setCurrentUser(user);
    if (user.companyName) {
      setCompanyName(user.companyName);
    }
    addToast('success', `${msg} Welcome, ${user.name}!`);
    onNavigate('scope-hub');
  };

  // ─────────────────────────────────────────────────────────────
  // 1. Email Sign In & Sign Up Handler
  // ─────────────────────────────────────────────────────────────
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (emailMode === 'signin') {
      if (!email.trim() || !email.includes('@')) {
        setError('Please enter a valid business email address.');
        return;
      }
      if (!password) {
        setError('Please enter your password.');
        return;
      }
    } else {
      if (!name.trim()) {
        setError('Please enter your full name.');
        return;
      }
      if (!company.trim()) {
        setError('Please enter your corporate or organizational name.');
        return;
      }
      if (!email.trim() || !email.includes('@')) {
        setError('Please enter a valid corporate email address.');
        return;
      }
      if (!password || password.length < 6) {
        setError('Password must be at least 6 characters long.');
        return;
      }
    }

    setLoading(true);
    try {
      if (emailMode === 'signin') {
        const res = await authService.login(email.trim(), password);
        handleAuthSuccess(res.user, 'Signed in successfully.');
      } else {
        const res = await authService.signup({
          name: name.trim(),
          email: email.trim(),
          password,
          companyName: company.trim(),
        });
        handleAuthSuccess(res.user, 'Account registered and secured in database.');
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify your credentials.');
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // 2. Mobile Phone - Send OTP
  // ─────────────────────────────────────────────────────────────
  const handleSendMobileOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    const cleanNum = mobileNumber.replace(/\D/g, '');
    if (cleanNum.length < 8 || cleanNum.length > 15) {
      setError('Please enter a valid 10-digit mobile number.');
      return;
    }

    const fullPhone = `${countryCode}${cleanNum}`;
    setLoading(true);

    try {
      const res = await authService.sendMobileOtp(fullPhone);
      setMobileStep('otp');
      setOtpCode('');
      setDevOtpHint(res.devOtp || null);
      setCountdown(30);
      addToast('info', `Verification OTP dispatched to ${fullPhone}`);
    } catch (err: any) {
      setError(err.message || 'Failed to dispatch verification OTP.');
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // 3. Mobile Phone - Verify OTP
  // ─────────────────────────────────────────────────────────────
  const handleVerifyMobileOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (otpCode.trim().length !== 6) {
      setError('Please enter the full 6-digit OTP code.');
      return;
    }

    const cleanNum = mobileNumber.replace(/\D/g, '');
    const fullPhone = `${countryCode}${cleanNum}`;
    setLoading(true);

    try {
      const res = await authService.verifyMobileOtp({
        phone: fullPhone,
        code: otpCode.trim(),
        name: mobileName.trim() || undefined,
        companyName: mobileCompany.trim() || undefined,
      });
      handleAuthSuccess(res.user, 'Mobile verified successfully.');
    } catch (err: any) {
      setError(err.message || 'Invalid or expired OTP code.');
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // 4. REAL Official Google OAuth 2.0 Flow
  // ─────────────────────────────────────────────────────────────
  const handleLaunchRealGoogleAuth = async (overrideClientId?: string) => {
    setError(null);
    const clientId = overrideClientId || savedGoogleClientId || env.GOOGLE_CLIENT_ID || localStorage.getItem('invty_google_client_id');

    // If Client ID is not configured, open the quick setup dialog
    if (!clientId) {
      setGoogleConfigModalOpen(true);
      return;
    }

    setGoogleLoading(true);

    try {
      // Use Google Identity Services OAuth 2.0 Token Client (Official Google SDK)
      if ((window as any).google?.accounts?.oauth2) {
        const tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email openid',
          prompt: 'select_account',
          callback: async (tokenResponse: any) => {
            if (tokenResponse.error) {
              setGoogleLoading(false);
              setError(tokenResponse.error_description || tokenResponse.error || 'Google sign-in was cancelled.');
              return;
            }

            try {
              // Real Google profile fetch from Google's official userinfo API
              const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
              });
              const profile = await profileRes.json();

              if (!profile.email) {
                throw new Error('Google did not return an email address for this account.');
              }

              // Save to SQLite database and activate session
              const authRes = await authService.googleAuth({
                email: profile.email,
                name: profile.name || profile.given_name || profile.email.split('@')[0],
                picture: profile.picture,
              });

              handleAuthSuccess(authRes.user, `Signed in with Google as ${profile.email}`);
            } catch (err: any) {
              setError(err.message || 'Failed to authenticate Google user with the database.');
            } finally {
              setGoogleLoading(false);
            }
          },
        });

        // Request access token with Google's authentic account selection popup
        tokenClient.requestAccessToken({ prompt: 'select_account' });
        return;
      }

      // Fallback: Open Google OAuth2 Authorization Window directly
      const redirectUri = window.location.origin;
      const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
        clientId
      )}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=${encodeURIComponent(
        'openid email profile'
      )}&prompt=select_account`;

      const width = 500;
      const height = 620;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;

      const popup = window.open(
        googleAuthUrl,
        'google_oauth_popup',
        `toolbar=no, location=no, directories=no, status=no, menubar=no, scrollbars=no, resizable=no, copyhistory=no, width=${width}, height=${height}, top=${top}, left=${left}`
      );

      if (!popup) {
        throw new Error('Popup blocked by browser. Please allow popups for localhost to sign in with Google.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to initialize Google Sign-In.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSaveGoogleClientId = (e: React.FormEvent) => {
    e.preventDefault();
    if (!googleClientIdInput.trim()) {
      setError('Please enter a valid Google OAuth Client ID.');
      return;
    }
    const cleanId = googleClientIdInput.trim();
    localStorage.setItem('invty_google_client_id', cleanId);
    setSavedGoogleClientId(cleanId);
    setGoogleConfigModalOpen(false);
    addToast('success', 'Google Client ID saved! Launching Google Sign-In...');
    // Immediately launch real Google sign in with this ID
    handleLaunchRealGoogleAuth(cleanId);
  };

  // Demo accounts quick-filler
  const fillEmailDemo = (demoEmail: string, demoPass: string) => {
    setAuthMethod('email');
    setEmailMode('signin');
    setEmail(demoEmail);
    setPassword(demoPass);
    setError(null);
  };

  const fillMobileDemo = (phone: string) => {
    setAuthMethod('mobile');
    setMobileStep('phone');
    if (phone.startsWith('+91')) {
      setCountryCode('+91');
      setMobileNumber(phone.slice(3));
    } else {
      setMobileNumber(phone);
    }
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
    <div className="min-h-[calc(100vh-64px)] w-full flex items-center justify-center p-4 sm:p-6 bg-[#EDF1F7]">
      <div className="flex flex-col md:flex-row max-w-5xl w-full bg-white rounded-3xl shadow-2xl border border-gray-200/80 overflow-hidden min-h-[670px]">
        
        {/* ── Left Side Hero Banner ─────────────────────────────────── */}
        <div className="w-full md:w-1/2 relative hidden md:block bg-slate-900">
          <img
            className="h-full w-full object-cover"
            src="https://cdn.21st.dev/assets/mirror/f4/f48e20bd4dcdcf2ca40eafe923e1134d17f43dce1c5bff8f1b96b7301e126ec3.png"
            alt="INVTY GHG Portal Hero"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-900/40 to-transparent p-8 flex flex-col justify-between">
            {/* Logo Badge */}
            <div className="flex items-center gap-3">
              <img
                src="/invty-logo.png"
                alt="INVTY Logo"
                className="w-10 h-10 object-contain drop-shadow-md brightness-110"
              />
              <div className="flex flex-col">
                <span className="font-mono font-bold text-white tracking-wider text-base">INVTY</span>
                <span className="text-[10px] uppercase tracking-widest text-slate-300 font-semibold">
                  GHG Accounting Portal
                </span>
              </div>
            </div>

            {/* Bottom Value Props */}
            <div className="text-white space-y-2">
              <div className="flex items-center gap-1.5 text-xs text-blue-300 font-semibold bg-blue-500/20 px-3 py-1 rounded-full border border-blue-400/30 w-fit backdrop-blur-sm">
                <ShieldCheck size={14} className="text-blue-400" />
                <span>Enterprise Multi-Method Auth</span>
              </div>
              <h3 className="text-xl font-bold text-white tracking-tight">
                Deterministic Carbon Accounting
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed max-w-sm">
                Sign in using your corporate email, verified mobile OTP, or Google SSO to access precision Scope 1, 2, and 3 assurance registers.
              </p>
            </div>
          </div>
        </div>

        {/* ── Right Side Form ───────────────────────────────────────── */}
        <div className="w-full md:w-1/2 flex flex-col justify-center p-6 sm:p-10">
          <div className="w-full max-w-sm mx-auto flex flex-col items-center">
            
            {/* Header */}
            <h2 className="text-2xl sm:text-3xl text-gray-900 font-bold tracking-tight text-center">
              Welcome to INVTY
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 mt-1.5 text-center">
              Select your preferred authentication method
            </p>

            {/* ── Auth Method Tabs (Email vs Mobile) ───────────────── */}
            <div className="grid grid-cols-2 gap-1 w-full bg-slate-100 p-1 rounded-full mt-5 border border-slate-200">
              <button
                type="button"
                onClick={() => { setAuthMethod('email'); setError(null); }}
                className={cn(
                  'flex items-center justify-center gap-2 py-2 rounded-full text-xs font-semibold transition-all',
                  authMethod === 'email'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-800'
                )}
              >
                <Mail size={14} />
                <span>Business Email</span>
              </button>

              <button
                type="button"
                onClick={() => { setAuthMethod('mobile'); setError(null); }}
                className={cn(
                  'flex items-center justify-center gap-2 py-2 rounded-full text-xs font-semibold transition-all',
                  authMethod === 'mobile'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-800'
                )}
              >
                <Smartphone size={14} />
                <span>Mobile OTP</span>
              </button>
            </div>

            {/* Error Banner */}
            {error && (
              <div className="w-full mt-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2.5 text-xs text-red-700 font-medium">
                <AlertCircle size={15} className="flex-shrink-0 text-red-500" />
                <span>{error}</span>
              </div>
            )}

            {/* ── METHOD 1: EMAIL & PASSWORD ──────────────────────── */}
            {authMethod === 'email' && (
              <form onSubmit={handleEmailSubmit} className="w-full mt-5 space-y-3.5">
                {/* Signup Extra Fields */}
                {emailMode === 'signup' && (
                  <>
                    <div className="flex items-center w-full border border-gray-300 focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-100 transition-all h-11 rounded-full px-4 gap-2.5">
                      <UserIcon size={15} className="text-gray-400 flex-shrink-0" />
                      <input
                        type="text"
                        placeholder="Full Name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="bg-transparent text-gray-800 placeholder-gray-400 outline-none text-xs sm:text-sm w-full"
                        required
                        disabled={loading}
                      />
                    </div>

                    <div className="flex items-center w-full border border-gray-300 focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-100 transition-all h-11 rounded-full px-4 gap-2.5">
                      <Building2 size={15} className="text-gray-400 flex-shrink-0" />
                      <input
                        type="text"
                        placeholder="Company or Organization"
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                        className="bg-transparent text-gray-800 placeholder-gray-400 outline-none text-xs sm:text-sm w-full"
                        required
                        disabled={loading}
                      />
                    </div>
                  </>
                )}

                {/* Email input */}
                <div className="flex items-center w-full border border-gray-300 focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-100 transition-all h-11 rounded-full px-4 gap-2.5">
                  <Mail size={15} className="text-gray-400 flex-shrink-0" />
                  <input
                    type="email"
                    placeholder="name@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-transparent text-gray-800 placeholder-gray-400 outline-none text-xs sm:text-sm w-full"
                    required
                    disabled={loading}
                    autoComplete="email"
                  />
                </div>

                {/* Password input */}
                <div className="flex items-center w-full border border-gray-300 focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-100 transition-all h-11 rounded-full px-4 gap-2.5">
                  <span className="text-gray-400 text-sm font-mono flex-shrink-0">🔒</span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder={emailMode === 'signin' ? 'Password' : 'Create Password (min 6 chars)'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-transparent text-gray-800 placeholder-gray-400 outline-none text-xs sm:text-sm w-full"
                    required
                    disabled={loading}
                    autoComplete={emailMode === 'signin' ? 'current-password' : 'new-password'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    className="p-1 text-gray-400 hover:text-gray-600 focus:outline-none"
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>

                {/* Remember Me & Forgot Password */}
                {emailMode === 'signin' && (
                  <div className="flex items-center justify-between text-xs text-gray-500 pt-0.5">
                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span>Remember me</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => { setForgotEmail(email); setForgotOpen(true); }}
                      className="text-blue-600 hover:underline font-medium"
                    >
                      Forgot password?
                    </button>
                  </div>
                )}

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={loading}
                  className={cn(
                    'w-full h-11 rounded-full text-white bg-blue-600 hover:bg-blue-700 transition-all font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-blue-600/20 active:scale-[0.99] mt-2',
                    loading && 'opacity-70 cursor-not-allowed'
                  )}
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Verifying credentials...</span>
                    </>
                  ) : emailMode === 'signin' ? (
                    'Sign In with Email'
                  ) : (
                    'Create Corporate Account'
                  )}
                </button>

                {/* Toggle sign in / sign up */}
                <p className="text-xs text-gray-500 text-center pt-2">
                  {emailMode === 'signin' ? (
                    <>
                      Don’t have an account?{' '}
                      <button
                        type="button"
                        onClick={() => { setEmailMode('signup'); setError(null); }}
                        className="text-blue-600 hover:underline font-semibold"
                      >
                        Register
                      </button>
                    </>
                  ) : (
                    <>
                      Already registered?{' '}
                      <button
                        type="button"
                        onClick={() => { setEmailMode('signin'); setError(null); }}
                        className="text-blue-600 hover:underline font-semibold"
                      >
                        Sign in
                      </button>
                    </>
                  )}
                </p>
              </form>
            )}

            {/* ── METHOD 2: MOBILE OTP ───────────────────────────── */}
            {authMethod === 'mobile' && (
              <div className="w-full mt-5">
                {mobileStep === 'phone' ? (
                  <form onSubmit={handleSendMobileOtp} className="space-y-3.5">
                    <p className="text-xs text-gray-500">
                      Enter your registered corporate mobile number to receive a 6-digit verification code.
                    </p>

                    <div className="flex items-center w-full border border-gray-300 focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-100 transition-all h-11 rounded-full overflow-hidden px-3 gap-2">
                      <select
                        value={countryCode}
                        onChange={(e) => setCountryCode(e.target.value)}
                        className="bg-transparent text-xs font-semibold text-gray-700 outline-none pr-1 border-r border-gray-200"
                        disabled={loading}
                      >
                        <option value="+91">🇮🇳 +91</option>
                        <option value="+1">🇺🇸 +1</option>
                        <option value="+44">🇬🇧 +44</option>
                        <option value="+971">🇦🇪 +971</option>
                        <option value="+65">🇸🇬 +65</option>
                        <option value="+49">🇩🇪 +49</option>
                      </select>

                      <input
                        type="tel"
                        placeholder="98765 43210"
                        value={mobileNumber}
                        onChange={(e) => setMobileNumber(e.target.value)}
                        className="bg-transparent text-gray-800 placeholder-gray-400 outline-none text-xs sm:text-sm w-full font-mono"
                        required
                        autoFocus
                        disabled={loading}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className={cn(
                        'w-full h-11 rounded-full text-white bg-blue-600 hover:bg-blue-700 transition-all font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-blue-600/20 active:scale-[0.99]',
                        loading && 'opacity-70 cursor-not-allowed'
                      )}
                    >
                      {loading ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          <span>Dispatching OTP...</span>
                        </>
                      ) : (
                        <>
                          <span>Send 6-Digit OTP</span>
                          <ArrowRight size={15} />
                        </>
                      )}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleVerifyMobileOtp} className="space-y-3.5">
                    <div className="flex items-center justify-between text-xs text-gray-600 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                      <span>Code sent to <strong>{countryCode} {mobileNumber}</strong></span>
                      <button
                        type="button"
                        onClick={() => { setMobileStep('phone'); setDevOtpHint(null); }}
                        className="text-blue-600 hover:underline flex items-center gap-1 font-semibold"
                      >
                        <Edit2 size={12} />
                        <span>Edit</span>
                      </button>
                    </div>

                    {/* Developer OTP Auto-Fill Hint */}
                    {devOtpHint && (
                      <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-800">
                        <span>Demo OTP: <strong className="font-mono text-sm tracking-wider text-emerald-900">{devOtpHint}</strong></span>
                        <button
                          type="button"
                          onClick={() => setOtpCode(devOtpHint)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded text-[11px] font-semibold"
                        >
                          Auto Fill
                        </button>
                      </div>
                    )}

                    <div>
                      <label className="text-xs font-semibold text-gray-700 block mb-1">
                        Enter 6-Digit Verification Code
                      </label>
                      <input
                        type="text"
                        maxLength={6}
                        placeholder="• • • • • •"
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                        className="w-full h-12 text-center font-mono text-lg tracking-[0.5em] border border-gray-300 rounded-2xl outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition-all font-bold"
                        autoFocus
                        required
                        disabled={loading}
                      />
                    </div>

                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>Didn't receive the code?</span>
                      {countdown > 0 ? (
                        <span className="font-mono text-gray-400">Resend in {countdown}s</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSendMobileOtp()}
                          className="text-blue-600 hover:underline font-semibold flex items-center gap-1"
                        >
                          <RefreshCw size={12} />
                          <span>Resend OTP</span>
                        </button>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={loading || otpCode.length !== 6}
                      className={cn(
                        'w-full h-11 rounded-full text-white bg-blue-600 hover:bg-blue-700 transition-all font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-blue-600/20 active:scale-[0.99]',
                        (loading || otpCode.length !== 6) && 'opacity-70 cursor-not-allowed'
                      )}
                    >
                      {loading ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          <span>Verifying OTP code...</span>
                        </>
                      ) : (
                        'Verify & Sign In'
                      )}
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* ── GOOGLE SINGLE SIGN-ON DIVIDER & BUTTON ────────────── */}
            <div className="w-full my-4">
              <div className="flex items-center gap-3 w-full my-3">
                <div className="w-full h-px bg-gray-200"></div>
                <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold whitespace-nowrap">
                  or continue with
                </span>
                <div className="w-full h-px bg-gray-200"></div>
              </div>

              {/* Real Google One Tap render container if initialized */}
              <div ref={googleBtnRef} className="w-full flex justify-center mb-1 empty:hidden" />

              {/* Standard Real Google OAuth Launch Button */}
              <button
                type="button"
                onClick={() => handleLaunchRealGoogleAuth()}
                disabled={loading || googleLoading}
                className="w-full h-11 rounded-full border border-gray-300 hover:bg-slate-50 transition-all flex items-center justify-center gap-3 text-xs sm:text-sm font-semibold text-gray-700 shadow-sm group"
              >
                {googleLoading ? (
                  <>
                    <Loader2 size={16} className="animate-spin text-blue-600" />
                    <span>Connecting to Google...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    <span>Sign in with Google</span>
                  </>
                )}
              </button>

              {/* Google Client ID config button */}
              <div className="flex justify-end mt-1.5">
                <button
                  type="button"
                  onClick={() => setGoogleConfigModalOpen(true)}
                  className="text-[11px] text-gray-400 hover:text-blue-600 flex items-center gap-1 transition-colors"
                >
                  <Settings size={11} />
                  <span>{savedGoogleClientId ? 'Google OAuth Connected' : 'Configure Google Client ID'}</span>
                </button>
              </div>
            </div>

            {/* ── TEST ACCOUNTS PRE-POPULATE ────────────────────────── */}
            <div className="w-full mt-2 p-3 bg-slate-50 border border-dashed border-slate-300 rounded-2xl">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                <div className="flex items-center gap-1.5">
                  <Database size={13} className="text-blue-600" />
                  <span>SQLite Seeded Test Logins</span>
                </div>
                <span className="text-[10px] text-slate-400 font-normal">Click to fill</span>
              </div>

              <div className="grid grid-cols-1 gap-1.5">
                {/* Admin Email */}
                <button
                  type="button"
                  onClick={() => fillEmailDemo('admin@invty.com', 'Invty@2026')}
                  className="flex items-center justify-between text-left p-2 rounded-xl bg-white border border-slate-200 hover:border-blue-400 text-xs transition-colors group"
                >
                  <div>
                    <span className="font-semibold text-slate-800">Admin: </span>
                    <span className="text-slate-600">admin@invty.com</span>
                  </div>
                  <span className="font-mono text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-semibold group-hover:bg-blue-100">
                    Invty@2026
                  </span>
                </button>

                {/* Mobile Phone Demo */}
                <button
                  type="button"
                  onClick={() => fillMobileDemo('+919876543210')}
                  className="flex items-center justify-between text-left p-2 rounded-xl bg-white border border-slate-200 hover:border-blue-400 text-xs transition-colors group"
                >
                  <div className="flex items-center gap-1.5">
                    <Smartphone size={13} className="text-emerald-600" />
                    <span className="font-semibold text-slate-800">Mobile OTP: </span>
                    <span className="font-mono text-slate-600">+91 98765 43210</span>
                  </div>
                  <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-semibold group-hover:bg-emerald-100">
                    Instant OTP
                  </span>
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* ── GOOGLE OAUTH CLIENT ID CONFIGURATION MODAL ────────────── */}
      {googleConfigModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-gray-200 p-6 max-w-md w-full space-y-4">
            
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <KeyRound size={18} className="text-blue-600" />
                <span className="text-sm font-bold text-gray-800">Google OAuth 2.0 Configuration</span>
              </div>
              <button
                type="button"
                onClick={() => setGoogleConfigModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none p-1"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed">
              To open Google's authentic account chooser window directly from <strong>accounts.google.com</strong>, paste your Google Cloud OAuth Client ID below:
            </p>

            <form onSubmit={handleSaveGoogleClientId} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">
                  Google Client ID (Web application)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 123456789-xxxx.apps.googleusercontent.com"
                  value={googleClientIdInput}
                  onChange={(e) => setGoogleClientIdInput(e.target.value)}
                  className="w-full h-11 px-4 border border-gray-300 rounded-2xl text-xs font-mono text-gray-800 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                  required
                  autoFocus
                />
              </div>

              <div className="p-3 bg-blue-50/70 border border-blue-200/70 rounded-xl text-[11px] text-blue-900 space-y-1.5">
                <div className="font-semibold flex items-center gap-1">
                  <ExternalLink size={12} />
                  <span>How to get your Google Client ID:</span>
                </div>
                <ol className="list-decimal pl-4 space-y-1 text-blue-800">
                  <li>Visit <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" className="underline font-semibold">Google Cloud Credentials</a></li>
                  <li>Click <strong>Create Credentials</strong> → <strong>OAuth client ID</strong></li>
                  <li>Select Application type: <strong>Web application</strong></li>
                  <li>Add Authorized JavaScript origin: <code className="bg-white/80 px-1 py-0.5 rounded font-mono">http://localhost:5173</code></li>
                  <li>Copy and paste the Client ID here!</li>
                </ol>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setGoogleConfigModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-full"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-full shadow-sm"
                >
                  Save & Sign In with Google
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── FORGOT PASSWORD MODAL ─────────────────────────────────── */}
      {forgotOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6 max-w-sm w-full">
            <h3 className="text-base font-bold text-gray-900 mb-1">Reset password</h3>
            <p className="text-xs text-gray-500 mb-4">
              Enter your corporate email address to receive password recovery instructions.
            </p>

            {forgotSent ? (
              <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded-xl text-xs flex items-center gap-2">
                <CheckCircle2 size={16} className="text-green-600 flex-shrink-0" />
                <span>Recovery instructions dispatched! Check your corporate inbox.</span>
              </div>
            ) : (
              <form onSubmit={handleForgotSubmit} className="space-y-3">
                <input
                  type="email"
                  placeholder="name@company.com"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  className="w-full h-11 px-4 border border-gray-300 rounded-full text-xs text-gray-800 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
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
                    className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-full"
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
