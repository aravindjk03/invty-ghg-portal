/**
 * The operations console's API client (backend /api/v1/ops).
 *
 * The console is for the internal developer and cyber team. Every request
 * carries the staff member's own session, and the server decides what that
 * role may see or do; this file never assumes a permission.
 */
import { env } from '../config/env';
import { adminSession } from './adminSession';

export type StaffRole = 'ADMIN' | 'SECURITY' | 'OPERATOR';
export const STAFF_ROLES: StaffRole[] = ['ADMIN', 'SECURITY', 'OPERATOR'];
export const ALL_ROLES = ['ADMIN', 'SECURITY', 'OPERATOR', 'ESG_MANAGER', 'ESG_ANALYST', 'AUDITOR'] as const;

export const isStaff = (role: string | undefined): boolean =>
  !!role && (STAFF_ROLES as string[]).includes(role);

export class OpsError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = adminSession.token();
  if (!token) throw new OpsError('Please sign in.', 401);
  let res: Response;
  try {
    res = await fetch(`${env.API_BASE_URL}/ops${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new OpsError('The server could not be reached.', 0);
  }
  const data = await res.json().catch(() => null);
  if (res.status === 401) adminSession.clear();
  if (!res.ok || !data?.success) {
    throw new OpsError(data?.error?.message || `Request failed (${res.status}).`, res.status);
  }
  return data as T;
}

export interface Capabilities {
  viewSecurity: boolean; actOnUsers: boolean; changeRoles: boolean; deleteUsers: boolean;
}

export interface Overview {
  users: { total: number; suspended: number; new7d: number; new30d: number; activeToday: number; active7d: number; staff: number };
  signIns24h: { ok: number; failed: number; locked: number };
  refused24h: number;
  activeSessions: number;
  openAlerts: number;
  usage30d: Record<string, number>;
  server: { uptimeSeconds: number; node: string; environment: string; retentionDays: number };
}

export interface OpsUser {
  id: string; email: string; phone?: string | null; name: string; companyName: string;
  role: string; status: 'active' | 'suspended'; authProvider?: string; createdAt: string;
  lastLoginAt?: string | null; activeSessions?: number; usage30d?: number; suspendedReason?: string | null;
}

export interface SecurityEvent {
  id: number; at: string; type: string; severity: 'info' | 'warning' | 'high';
  userId?: string | null; userEmail?: string | null; actorId?: string | null; subject?: string | null;
  ip?: string | null; userAgent?: string | null; detail?: Record<string, unknown> | null;
}

export interface Alert {
  id: number; at: string; kind: string; subject: string; status: 'open' | 'resolved';
  detail?: Record<string, unknown> | null; resolved_at?: string | null; resolved_by?: string | null;
}

export interface AdminAction {
  seq: number; at: string; actor_email: string; action: string; target_id?: string | null;
  detail?: Record<string, unknown> | null;
}

export interface UsageData {
  from: string; to: string;
  series: Array<{ day: string; metric: string; total: number }>;
  signIns: Array<{ day: string; ok: number; failed: number }>;
  topUsers: Array<{ id: string; email: string; name: string; companyName: string; total: number }>;
  adoption: Array<{ metric: string; users: number }>;
}

const qs = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') search.set(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : '';
};

export const opsService = {
  whoami: () => request<{ role: StaffRole; can: Capabilities }>('GET', '/whoami'),
  overview: () => request<{ data: Overview }>('GET', '/overview').then((r) => r.data),
  usage: (from?: string, to?: string) =>
    request<{ data: UsageData }>('GET', `/usage${qs({ from, to })}`).then((r) => r.data),
  users: (params: { q?: string; role?: string; status?: string; page?: number }) =>
    request<{ data: { total: number; page: number; pageSize: number; users: OpsUser[] } }>(
      'GET', `/users${qs(params)}`).then((r) => r.data),
  user: (id: string) =>
    request<{ data: { user: OpsUser; sessions: Array<{ ref: string; createdAt: string; expiresAt: string }>;
      usage: Array<{ day: string; metric: string; count: number }>; events: SecurityEvent[] } }>(
      'GET', `/users/${encodeURIComponent(id)}`).then((r) => r.data),
  suspend: (id: string, reason: string) => request('POST', `/users/${encodeURIComponent(id)}/suspend`, { reason }),
  reactivate: (id: string) => request('POST', `/users/${encodeURIComponent(id)}/reactivate`, {}),
  signOut: (id: string) => request('POST', `/users/${encodeURIComponent(id)}/signout`, {}),
  forceReset: (id: string) => request<{ temporaryPassword: string | null; message: string }>(
    'POST', `/users/${encodeURIComponent(id)}/force-reset`, {}),
  setRole: (id: string, role: string) => request('PATCH', `/users/${encodeURIComponent(id)}/role`, { role }),
  remove: (id: string, confirmEmail: string) =>
    request('DELETE', `/users/${encodeURIComponent(id)}`, { confirmEmail }),
  events: (params: { type?: string; severity?: string; user?: string; page?: number }) =>
    request<{ data: { total: number; page: number; pageSize: number; events: SecurityEvent[] } }>(
      'GET', `/security${qs(params)}`).then((r) => r.data),
  alerts: (status: 'open' | 'resolved' | 'all' = 'open') =>
    request<{ data: Alert[] }>('GET', `/alerts${qs({ status })}`).then((r) => r.data),
  resolveAlert: (id: number) => request('POST', `/alerts/${id}/resolve`, {}),
  adminActions: () =>
    request<{ data: { chainValid: boolean; firstBrokenSeq: number | null; total: number; actions: AdminAction[] } }>(
      'GET', '/admin-actions').then((r) => r.data),

  /** Downloads the filtered security log as CSV. */
  async downloadSecurityCsv(params: { type?: string; severity?: string; user?: string }): Promise<void> {
    const token = adminSession.token();
    const res = await fetch(`${env.API_BASE_URL}/ops/security.csv${qs(params)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new OpsError('The export was refused.', res.status);
    const url = URL.createObjectURL(await res.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = `iinvty-security-log-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  },
};
