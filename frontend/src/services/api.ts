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

export async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${env.API_BASE_URL}${endpoint}`;
  
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  try {
    const res = await fetch(url, { ...options, headers });
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
