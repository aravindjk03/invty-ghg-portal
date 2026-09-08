import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { env } from '../config/env';

export interface UserProfile {
  companyName: string;
  sector: string;
  role: string;
  reportingPeriod: string;
  country?: string;
  employeeBand?: string;
  completedAt: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  provider: 'password' | 'google';
  avatarUrl?: string;
  emailVerified: boolean;
  createdAt: string;
  profile?: UserProfile;
  profileComplete: boolean;
}

export interface AuthConfig {
  googleEnabled: boolean;
  googleClientId: string | null;
  minPasswordLength: number;
}

interface AuthContextType {
  user: AuthUser | null;
  config: AuthConfig | null;
  /** True until the stored session has been checked, so we don't flash the login screen. */
  initialising: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  signInWithGoogle: (credential: string) => Promise<void>;
  saveProfile: (profile: Omit<UserProfile, 'completedAt'>) => Promise<void>;
  signOut: () => void;
  /** Authenticated fetch against the API; throws with the server's message. */
  authedRequest: <T>(path: string, options?: RequestInit) => Promise<T>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * The access token lives in localStorage rather than a cookie because the API
 * is a separate origin and takes a Bearer header. That makes it readable by any
 * script on this origin, so the app must stay free of injected third-party
 * script — the tradeoff is noted here deliberately rather than left implicit.
 */
const TOKEN_KEY = 'INVTY_ACCESS_TOKEN';

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable; session lasts for this tab only */
  }
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [initialising, setInitialising] = useState(true);

  const call = useCallback(async <T,>(path: string, options: RequestInit = {}): Promise<T> => {
    const token = readToken();
    const res = await fetch(`${env.API_BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });

    let body: ApiEnvelope<T>;
    try {
      body = await res.json();
    } catch {
      throw new Error(`The server returned an unreadable response (HTTP ${res.status}).`);
    }

    if (!res.ok || !body.success) {
      const err = new Error(body.error?.message || `Request failed (HTTP ${res.status}).`);
      (err as Error & { code?: string }).code = body.error?.code;
      throw err;
    }

    return body.data as T;
  }, []);

  // Which sign-in methods the server offers.
  useEffect(() => {
    let cancelled = false;
    call<AuthConfig>('/auth/config')
      .then((cfg) => {
        if (!cancelled) setConfig(cfg);
      })
      .catch(() => {
        if (!cancelled) setConfig({ googleEnabled: false, googleClientId: null, minPasswordLength: 12 });
      });
    return () => {
      cancelled = true;
    };
  }, [call]);

  // Restore an existing session before the first paint of the app shell.
  useEffect(() => {
    let cancelled = false;

    if (!readToken()) {
      setInitialising(false);
      return;
    }

    call<{ user: AuthUser }>('/auth/me')
      .then(({ user: restored }) => {
        if (!cancelled) setUser(restored);
      })
      .catch(() => {
        // Expired or revoked; drop it rather than retrying on every request.
        writeToken(null);
      })
      .finally(() => {
        if (!cancelled) setInitialising(false);
      });

    return () => {
      cancelled = true;
    };
  }, [call]);

  // A 401 from anywhere in the app means the session is gone; clear it once,
  // centrally, instead of letting each caller decide.
  useEffect(() => {
    const onExpired = () => {
      writeToken(null);
      setUser(null);
    };
    window.addEventListener('invty:session-expired', onExpired);
    return () => window.removeEventListener('invty:session-expired', onExpired);
  }, []);

  const adopt = useCallback((payload: { token: string; user: AuthUser }) => {
    writeToken(payload.token);
    setUser(payload.user);
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      adopt(
        await call<{ token: string; user: AuthUser }>('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        })
      );
    },
    [call, adopt]
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      adopt(
        await call<{ token: string; user: AuthUser }>('/auth/register', {
          method: 'POST',
          body: JSON.stringify({ name, email, password }),
        })
      );
    },
    [call, adopt]
  );

  const signInWithGoogle = useCallback(
    async (credential: string) => {
      adopt(
        await call<{ token: string; user: AuthUser }>('/auth/google', {
          method: 'POST',
          body: JSON.stringify({ credential }),
        })
      );
    },
    [call, adopt]
  );

  const saveProfile = useCallback(
    async (profile: Omit<UserProfile, 'completedAt'>) => {
      const { user: updated } = await call<{ user: AuthUser }>('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify(profile),
      });
      setUser(updated);
    },
    [call]
  );

  const signOut = useCallback(() => {
    // Tell the server first, but never block sign-out on it.
    call('/auth/logout', { method: 'POST' }).catch(() => undefined);
    writeToken(null);
    setUser(null);
  }, [call]);

  const value = useMemo(
    () => ({
      user,
      config,
      initialising,
      signIn,
      register,
      signInWithGoogle,
      saveProfile,
      signOut,
      authedRequest: call,
    }),
    [user, config, initialising, signIn, register, signInWithGoogle, saveProfile, signOut, call]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
