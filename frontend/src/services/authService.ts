import { env } from '../config/env';

export interface User {
  id: string;
  email: string;
  phone?: string;
  name: string;
  companyName: string;
  role: string;
  avatarUrl?: string;
  authProvider?: string;
  createdAt: string;
}

export interface AuthResponse {
  success: boolean;
  message?: string;
  user: User;
  token: string;
}

export interface DemoAccount {
  type?: 'email' | 'mobile';
  email?: string;
  phone?: string;
  password?: string;
  name: string;
  company: string;
  role: string;
}

const TOKEN_KEY = 'invty_auth_token';
const USER_KEY = 'invty_auth_user';
const OFFLINE_USERS_KEY = 'invty_offline_users';

// ── Offline / standalone fallback ────────────────────────────────────────────
// When the API is unreachable (static hosting, backend down), auth falls back to
// a browser-local account store seeded with the same demo accounts the backend seeds.

class NetworkUnavailableError extends Error {}

async function postJson(path: string, body: unknown): Promise<{ res: Response; data: any }> {
  let res: Response;
  try {
    res = await fetch(`${env.API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new NetworkUnavailableError('API unreachable');
  }
  let data: any;
  try {
    data = await res.json();
  } catch {
    // Non-JSON response (e.g. static host 404 page) means there is no API here
    throw new NetworkUnavailableError('API returned a non-JSON response');
  }
  return { res, data };
}

interface OfflineAccount {
  user: User;
  password?: string;
}

const SEED_ACCOUNTS: OfflineAccount[] = [
  {
    password: 'Invty@2026',
    user: {
      id: 'usr_offline_admin',
      email: 'admin@invty.com',
      phone: '+919876543210',
      name: 'INVTY Enterprise Admin',
      companyName: 'INVTY Sustainability Systems',
      role: 'ADMIN',
      authProvider: 'email',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  },
  {
    password: 'Demo@1234',
    user: {
      id: 'usr_offline_demo',
      email: 'demo@company.com',
      name: 'Rajesh Sharma',
      companyName: 'Tata Heavy Engineering Ltd',
      role: 'ESG_ANALYST',
      authProvider: 'email',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  },
];

const pendingOtps = new Map<string, string>();

function normalizePhone(phone: string): string {
  return phone.replace(/[\s-]/g, '');
}

function loadOfflineAccounts(): OfflineAccount[] {
  try {
    const raw = localStorage.getItem(OFFLINE_USERS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // fall through to seed
  }
  return [...SEED_ACCOUNTS];
}

function saveOfflineAccounts(accounts: OfflineAccount[]) {
  try {
    localStorage.setItem(OFFLINE_USERS_KEY, JSON.stringify(accounts));
  } catch {
    // storage unavailable: accounts live for this page load only
  }
}

function offlineToken(user: User): string {
  return `offline.${user.id}.${Date.now()}`;
}

function newOfflineUser(fields: Partial<User> & { name: string; companyName: string }, provider: string): User {
  return {
    id: `usr_offline_${Math.random().toString(36).slice(2, 10)}`,
    email: fields.email || '',
    phone: fields.phone,
    name: fields.name,
    companyName: fields.companyName,
    role: 'ESG_ANALYST',
    avatarUrl: fields.avatarUrl,
    authProvider: provider,
    createdAt: new Date().toISOString(),
  };
}

export const authService = {
  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },

  getStoredUser(): User | null {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  setSession(user: User, token: string) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },

  clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },

  // 1. Email + Password Sign In
  async login(email: string, password: string): Promise<AuthResponse> {
    let res: Response;
    let data: any;
    try {
      ({ res, data } = await postJson('/auth/login', { email: email.trim(), password }));
    } catch (err) {
      if (!(err instanceof NetworkUnavailableError)) throw err;
      const account = loadOfflineAccounts().find(
        (a) => a.user.email.toLowerCase() === email.trim().toLowerCase()
      );
      if (!account || account.password !== password) {
        throw new Error('Invalid email or password.');
      }
      const token = offlineToken(account.user);
      this.setSession(account.user, token);
      return { success: true, user: account.user, token };
    }

    if (!res.ok || !data.success) {
      throw new Error(data.error?.message || 'Login failed. Please check your credentials.');
    }

    this.setSession(data.user, data.token);
    return data;
  },

  // 2. Email + Password Registration
  async signup(payload: { name: string; email: string; password: string; companyName: string }): Promise<AuthResponse> {
    let res: Response;
    let data: any;
    try {
      ({ res, data } = await postJson('/auth/signup', payload));
    } catch (err) {
      if (!(err instanceof NetworkUnavailableError)) throw err;
      const accounts = loadOfflineAccounts();
      const email = payload.email.trim().toLowerCase();
      if (accounts.some((a) => a.user.email.toLowerCase() === email)) {
        throw new Error('An account with this email already exists.');
      }
      const user = newOfflineUser({ ...payload, email }, 'email');
      saveOfflineAccounts([...accounts, { user, password: payload.password }]);
      const token = offlineToken(user);
      this.setSession(user, token);
      return { success: true, user, token };
    }

    if (!res.ok || !data.success) {
      throw new Error(data.error?.message || 'Registration failed. Please try again.');
    }

    this.setSession(data.user, data.token);
    return data;
  },

  // 3. Official Google Sign-In
  async googleAuth(payload: {
    credential?: string;
    email?: string;
    name?: string;
    picture?: string;
    companyName?: string;
  }): Promise<AuthResponse> {
    let res: Response;
    let data: any;
    try {
      ({ res, data } = await postJson('/auth/google', payload));
    } catch (err) {
      if (!(err instanceof NetworkUnavailableError)) throw err;
      if (!payload.email) throw new Error('Google sign-in failed.');
      const accounts = loadOfflineAccounts();
      let account = accounts.find((a) => a.user.email.toLowerCase() === payload.email!.toLowerCase());
      if (!account) {
        account = {
          user: newOfflineUser(
            {
              email: payload.email,
              name: payload.name || payload.email.split('@')[0],
              companyName: payload.companyName || 'My Organization',
              avatarUrl: payload.picture,
            },
            'google'
          ),
        };
        saveOfflineAccounts([...accounts, account]);
      }
      const token = offlineToken(account.user);
      this.setSession(account.user, token);
      return { success: true, user: account.user, token };
    }

    if (!res.ok || !data.success) {
      throw new Error(data.error?.message || 'Google sign-in failed.');
    }

    this.setSession(data.user, data.token);
    return data;
  },

  // 4. Mobile Phone - Send OTP
  async sendMobileOtp(phone: string): Promise<{ success: boolean; message: string; phone: string; devOtp?: string }> {
    let res: Response;
    let data: any;
    try {
      ({ res, data } = await postJson('/auth/mobile/send-otp', { phone: phone.trim() }));
    } catch (err) {
      if (!(err instanceof NetworkUnavailableError)) throw err;
      const devOtp = Math.floor(100000 + Math.random() * 900000).toString();
      pendingOtps.set(normalizePhone(phone), devOtp);
      return {
        success: true,
        message: `One-Time Password (OTP) dispatched to ${phone.trim()}`,
        phone: phone.trim(),
        devOtp,
      };
    }

    if (!res.ok || !data.success) {
      throw new Error(data.error?.message || 'Failed to dispatch OTP code.');
    }

    return data;
  },

  // 5. Mobile Phone - Verify OTP
  async verifyMobileOtp(payload: {
    phone: string;
    code: string;
    name?: string;
    companyName?: string;
  }): Promise<AuthResponse> {
    let res: Response;
    let data: any;
    try {
      ({ res, data } = await postJson('/auth/mobile/verify-otp', {
        phone: payload.phone.trim(),
        code: payload.code.trim(),
        name: payload.name?.trim(),
        companyName: payload.companyName?.trim(),
      }));
    } catch (err) {
      if (!(err instanceof NetworkUnavailableError)) throw err;
      const phone = normalizePhone(payload.phone);
      if (pendingOtps.get(phone) !== payload.code.trim()) {
        throw new Error('Invalid or expired OTP code. Please enter the correct code or request a new one.');
      }
      pendingOtps.delete(phone);
      const accounts = loadOfflineAccounts();
      let account = accounts.find((a) => a.user.phone && normalizePhone(a.user.phone) === phone);
      if (!account) {
        account = {
          user: newOfflineUser(
            {
              phone,
              name: payload.name?.trim() || 'Mobile User',
              companyName: payload.companyName?.trim() || 'My Organization',
            },
            'mobile'
          ),
        };
        saveOfflineAccounts([...accounts, account]);
      }
      const token = offlineToken(account.user);
      this.setSession(account.user, token);
      return { success: true, user: account.user, token };
    }

    if (!res.ok || !data.success) {
      throw new Error(data.error?.message || 'OTP verification failed.');
    }

    this.setSession(data.user, data.token);
    return data;
  },

  async getDemoAccounts(): Promise<DemoAccount[]> {
    try {
      const res = await fetch(`${env.API_BASE_URL}/auth/demo-accounts`);
      const data = await res.json();
      return data.accounts || [];
    } catch {
      return [
        {
          type: 'email',
          email: 'admin@invty.com',
          password: 'Invty@2026',
          name: 'INVTY Enterprise Admin',
          company: 'INVTY Sustainability Systems',
          role: 'ADMIN',
        },
        {
          type: 'email',
          email: 'demo@company.com',
          password: 'Demo@1234',
          name: 'Rajesh Sharma',
          company: 'Tata Heavy Engineering Ltd',
          role: 'ESG_ANALYST',
        },
        {
          type: 'mobile',
          phone: '+919876543210',
          name: 'INVTY Enterprise Admin',
          company: 'INVTY Sustainability Systems',
          role: 'ADMIN',
        },
      ];
    }
  },

  async verifySession(): Promise<User | null> {
    const token = this.getToken();
    if (!token) return null;

    try {
      const res = await fetch(`${env.API_BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && data.success && data.user) {
        localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        return data.user;
      }
      this.clearSession();
      return null;
    } catch {
      // Offline fallback: use cached user if available
      return this.getStoredUser();
    }
  },

  async logout(): Promise<void> {
    const token = this.getToken();
    if (token) {
      try {
        await fetch(`${env.API_BASE_URL}/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // Continue clearing client storage
      }
    }
    this.clearSession();
  },
};
