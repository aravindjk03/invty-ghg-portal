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
    const res = await fetch(`${env.API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error?.message || 'Login failed. Please check your credentials.');
    }

    this.setSession(data.user, data.token);
    return data;
  },

  // 2. Email + Password Registration
  async signup(payload: { name: string; email: string; password: string; companyName: string }): Promise<AuthResponse> {
    const res = await fetch(`${env.API_BASE_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
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
    const res = await fetch(`${env.API_BASE_URL}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error?.message || 'Google sign-in failed.');
    }

    this.setSession(data.user, data.token);
    return data;
  },

  // 4. Mobile Phone - Send OTP
  async sendMobileOtp(phone: string): Promise<{ success: boolean; message: string; phone: string; devOtp?: string }> {
    const res = await fetch(`${env.API_BASE_URL}/auth/mobile/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phone.trim() }),
    });

    const data = await res.json();
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
    const res = await fetch(`${env.API_BASE_URL}/auth/mobile/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: payload.phone.trim(),
        code: payload.code.trim(),
        name: payload.name?.trim(),
        companyName: payload.companyName?.trim(),
      }),
    });

    const data = await res.json();
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
