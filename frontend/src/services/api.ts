import { env } from '../config/env';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: string;
}

/**
 * Kept in sync with AuthContext, which owns the value. Read at call time rather
 * than captured, so a token issued after this module loaded is still used.
 */
const TOKEN_KEY = 'INVTY_ACCESS_TOKEN';

function accessToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Raised when the session is gone, so callers can send the user back to sign-in. */
export class SessionExpiredError extends Error {
  constructor(message = 'Your session has expired. Please sign in again.') {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

export async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${env.API_BASE_URL}${endpoint}`;
  const token = accessToken();

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  try {
    const res = await fetch(url, { ...options, headers });

    if (res.status === 401) {
      // Surface this distinctly: an expired session is not the same as an
      // unreachable API, and must not be silently swallowed by a local fallback.
      window.dispatchEvent(new CustomEvent('invty:session-expired'));
      throw new SessionExpiredError();
    }

    const json: ApiResponse<T> = await res.json();

    if (!res.ok || !json.success) {
      throw new Error(json.error?.message || `HTTP ${res.status}: Failed request`);
    }

    return json.data as T;
  } catch (err: any) {
    console.warn(`[API WARNING] Endpoint ${endpoint} failed or unreachable:`, err.message);
    throw err;
  }
}
