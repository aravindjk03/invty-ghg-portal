/**
 * The operations console's store: security events, usage counts, alerts and
 * the tamper-evident log of console actions.
 *
 * Built for the internal developer and cyber-security team, never shown to
 * customers. Three rules hold everywhere in this file:
 *
 *   - IP addresses are stored masked (IPv4 last octet, IPv6 last 80 bits), so
 *     a pattern can be investigated without keeping a full address.
 *   - Usage is counted, never recorded: how many calculations an account ran
 *     today, not what it calculated.
 *   - Nothing is kept longer than 90 days.
 */
import crypto from 'crypto';
import { Request } from 'express';
import { dbService } from '../db/database';
import { env } from '../config/env';

export const STAFF_ROLES = ['ADMIN', 'SECURITY', 'OPERATOR'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export const ALL_ROLES = ['ADMIN', 'SECURITY', 'OPERATOR', 'ESG_MANAGER', 'ESG_ANALYST', 'AUDITOR'] as const;

export const RETENTION_DAYS = 90;

export type Severity = 'info' | 'warning' | 'high';

export type UsageMetric =
  | 'sign_in' | 'calculation' | 'method_calculation' | 'report_export'
  | 'ai_estimate' | 'rows_saved' | 'audit_entry';

const db = () => dbService.connection;
const now = () => new Date().toISOString();

// ── IP masking ───────────────────────────────────────────────────────────────

/** 203.0.113.42 -> 203.0.113.x ; 2001:db8:1:2:3:4:5:6 -> 2001:db8:1::/48 */
export function maskIp(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let ip = String(raw).trim();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.x`;
  if (ip.includes(':')) {
    const parts = ip.split('::')[0].split(':').filter(Boolean);
    return `${parts.slice(0, 3).join(':') || '0'}::/48`;
  }
  return null;
}

function requestContext(req?: Request): { ip: string | null; ua: string | null } {
  if (!req) return { ip: null, ua: null };
  const ua = String(req.headers['user-agent'] ?? '').slice(0, 200) || null;
  return { ip: maskIp(req.ip || req.socket?.remoteAddress), ua };
}

// ── Security events ──────────────────────────────────────────────────────────

export interface SecurityEventInput {
  type: string;
  severity?: Severity;
  userId?: string | null;
  actorId?: string | null;
  /** What the event is about when there is no account: an email tried, an origin. */
  subject?: string | null;
  req?: Request;
  detail?: Record<string, unknown>;
}

const DEFAULT_SEVERITY: Record<string, Severity> = {
  'auth.login_ok': 'info',
  'auth.login_failed': 'warning',
  'auth.locked': 'high',
  'auth.logout': 'info',
  'auth.signup': 'info',
  'auth.otp_failed': 'warning',
  'auth.google_failed': 'warning',
  'auth.suspended_login': 'high',
  'account.password_changed': 'info',
  'account.profile_changed': 'info',
  'account.signed_out_everywhere': 'info',
  'account.deleted': 'warning',
  'access.invalid_token': 'warning',
  'access.forbidden': 'warning',
  'access.suspended': 'high',
  'access.rate_limited': 'warning',
  'access.cors_refused': 'warning',
};

/*
 * Failed sign-in alerts count attempts on a LOCKED account too: the account
 * locks after five wrong passwords, and someone who keeps trying after that is
 * exactly who the alert is for.
 */

/*
 * Refused requests are recorded at most once per kind, network and subject
 * every few seconds. Without this a script hammering the server would write
 * one row per refused request - and refused cross-origin requests are checked
 * before the rate limiter - so the log itself became a way to fill the disk.
 * The skipped count is carried on the next row that is written.
 */
const THROTTLE_MS = 5_000;
const THROTTLE_MAX_KEYS = 5_000;
const lastWritten = new Map<string, { at: number; skipped: number }>();

function throttled(type: string, ip: string | null, subject: string | null): number | null {
  if (!type.startsWith('access.')) return 0;
  const key = `${type}|${ip ?? ''}|${subject ?? ''}`;
  const nowMs = Date.now();
  const seen = lastWritten.get(key);
  if (seen && nowMs - seen.at < THROTTLE_MS) {
    seen.skipped += 1;
    // A burst too fast for the throttle still has to raise its alert.
    if (ip && seen.skipped === ALERT_RULES.refusedRequests.count) {
      raiseAlert('refused_requests_burst', ip, { refused: seen.skipped + 1, seconds: THROTTLE_MS / 1000, type })
        .catch(() => undefined); // the log must never break a request
    }
    return null; // skip this one
  }
  if (lastWritten.size >= THROTTLE_MAX_KEYS) lastWritten.clear();
  lastWritten.set(key, { at: nowMs, skipped: 0 });
  return seen?.skipped ?? 0;
}

/** Test hook: forget the throttle state. */
export function resetEventThrottle(): void {
  lastWritten.clear();
}

/**
 * Records one event and runs the alert rules on it. Never rejects: a failure
 * to log must not turn a successful sign-in into an error page. Request
 * handlers await it so the event is stored before they answer; middleware
 * that cannot wait lets it run in the background.
 */
export async function recordEvent(input: SecurityEventInput): Promise<void> {
  try {
    const { ip, ua } = requestContext(input.req);
    const severity = input.severity ?? DEFAULT_SEVERITY[input.type] ?? 'info';
    const subject = input.subject ? String(input.subject).toLowerCase().slice(0, 200) : null;
    const skipped = throttled(input.type, ip, subject);
    if (skipped === null) return;
    const detail = skipped > 0 ? { ...(input.detail ?? {}), similarSkipped: skipped } : input.detail;
    await db().run(`INSERT INTO security_events
      (at, type, severity, user_id, actor_id, subject, ip_masked, user_agent, detail)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, now(), input.type, severity, input.userId ?? null, input.actorId ?? null, subject, ip, ua,
      detail ? JSON.stringify(detail).slice(0, 2000) : null);
    await evaluateAlerts(input.type, input.userId ?? null, subject, ip);
  } catch (err) {
    console.warn('[ops] could not record security event:', (err as Error).message);
  }
}

// ── Usage counts ─────────────────────────────────────────────────────────────

export async function bumpUsage(userId: string | undefined | null, metric: UsageMetric, by = 1): Promise<void> {
  if (!userId || by <= 0) return;
  try {
    await db().run(`INSERT INTO usage_daily (user_id, day, metric, count) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, day, metric) DO UPDATE SET count = usage_daily.count + excluded.count`, userId, now().slice(0, 10), metric, by);
  } catch (err) {
    console.warn('[ops] could not count usage:', (err as Error).message);
  }
}

// ── Alerts ───────────────────────────────────────────────────────────────────

export const ALERT_RULES = {
  failedSignIns: { count: 10, minutes: 15 },
  refusedRequests: { count: 20, minutes: 5 },
} as const;

function since(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

async function raiseAlert(kind: string, subject: string, detail: Record<string, unknown>): Promise<void> {
  const open = await db().get("SELECT id FROM ops_alerts WHERE kind = ? AND subject = ? AND status = 'open'", kind, subject);
  if (open) return; // one open alert per thing, not one per event
  await db().run('INSERT INTO ops_alerts (at, kind, subject, status, detail) VALUES (?, ?, ?, ?, ?)', now(), kind, subject, 'open', JSON.stringify(detail));
}

async function evaluateAlerts(type: string, userId: string | null, subject: string | null, ip: string | null): Promise<void> {
  if (type === 'auth.login_failed' || type === 'auth.otp_failed' || type === 'auth.locked') {
    const window = since(ALERT_RULES.failedSignIns.minutes);
    if (subject) {
      const row = await db().get(`SELECT COUNT(*) AS n FROM security_events
        WHERE type IN ('auth.login_failed','auth.otp_failed','auth.locked') AND subject = ? AND at >= ?`, subject, window) as { n: number };
      if (row.n >= ALERT_RULES.failedSignIns.count) {
        await raiseAlert('failed_sign_ins_account', subject, { failures: row.n, minutes: ALERT_RULES.failedSignIns.minutes });
      }
    }
    if (ip) {
      const row = await db().get(`SELECT COUNT(*) AS n FROM security_events
        WHERE type IN ('auth.login_failed','auth.otp_failed','auth.locked') AND ip_masked = ? AND at >= ?`, ip, window) as { n: number };
      if (row.n >= ALERT_RULES.failedSignIns.count) {
        await raiseAlert('failed_sign_ins_network', ip, { failures: row.n, minutes: ALERT_RULES.failedSignIns.minutes });
      }
    }
  }

  if (type.startsWith('access.') && ip) {
    const row = await db().get(`SELECT COUNT(*) AS n FROM security_events
      WHERE type LIKE 'access.%' AND ip_masked = ? AND at >= ?`, ip, since(ALERT_RULES.refusedRequests.minutes)) as { n: number };
    if (row.n >= ALERT_RULES.refusedRequests.count) {
      await raiseAlert('refused_requests_burst', ip, { refused: row.n, minutes: ALERT_RULES.refusedRequests.minutes });
    }
  }

  if (type === 'auth.login_ok' && userId && ip) {
    const user = await dbService.findUserById(userId);
    if (user && (STAFF_ROLES as readonly string[]).includes(user.role)) {
      const seen = await db().get(`SELECT COUNT(*) AS n FROM security_events
        WHERE type = 'auth.login_ok' AND user_id = ? AND ip_masked = ?`, userId, ip) as { n: number };
      // This event is already stored, so 1 means this network is new for the account.
      const earlier = await db().get(`SELECT COUNT(*) AS n FROM security_events
        WHERE type = 'auth.login_ok' AND user_id = ?`, userId) as { n: number };
      if (seen.n === 1 && earlier.n > 1) {
        await raiseAlert('staff_sign_in_new_network', `${user.email} @ ${ip}`, { role: user.role, network: ip });
      }
    }
  }
}

export async function listAlerts(status: 'open' | 'resolved' | 'all' = 'open', limit = 200) {
  const rows = status === 'all'
    ? await db().all('SELECT * FROM ops_alerts ORDER BY id DESC LIMIT ?', limit)
    : await db().all('SELECT * FROM ops_alerts WHERE status = ? ORDER BY id DESC LIMIT ?', status, limit);
  return (rows as any[]).map((row) => ({ ...row, detail: row.detail ? JSON.parse(row.detail) : null }));
}

export async function resolveAlert(id: number, by: string): Promise<boolean> {
  const result = await db().run("UPDATE ops_alerts SET status = 'resolved', resolved_at = ?, resolved_by = ? WHERE id = ? AND status = 'open'", now(), by, id);
  return Number(result.changes ?? 0) > 0;
}

// ── Tamper-evident console actions ───────────────────────────────────────────

const actionKey = crypto.createHmac('sha256', env.API_SECRET_KEY).update('ops-admin-actions-v1').digest();

function actionHash(prev: string, at: string, actorId: string, action: string,
  target: string | null, detail: string | null): string {
  return crypto.createHmac('sha256', actionKey)
    .update([prev, at, actorId, action, target ?? '', detail ?? ''].join('␟'))
    .digest('hex');
}

const GENESIS = '0'.repeat(64);

export async function recordAdminAction(actor: { id: string; email: string }, action: string,
  targetId: string | null, detail?: Record<string, unknown>, req?: Request): Promise<void> {
  const detailText = detail ? JSON.stringify(detail).slice(0, 2000) : null;
  // Read the last hash and append in one locked step, so two actions at the
  // same moment cannot both chain onto the same row.
  await db().serial('admin_actions', async (tx) => {
    const last = await tx.get<{ hash: string }>('SELECT hash FROM admin_actions ORDER BY seq DESC LIMIT 1');
    const prev = last?.hash ?? GENESIS;
    const at = now();
    await tx.run(`INSERT INTO admin_actions (at, actor_id, actor_email, action, target_id, detail, prev_hash, hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, at, actor.id, actor.email, action, targetId, detailText, prev,
      actionHash(prev, at, actor.id, action, targetId, detailText));
  });
  await recordEvent({ type: `admin.${action}`, severity: action === 'role_changed' ? 'high' : 'info',
    userId: targetId, actorId: actor.id, req, detail });
  if (action === 'role_changed' && detail && (STAFF_ROLES as readonly string[]).includes(String(detail.to))) {
    const target = targetId ? await dbService.findUserById(targetId) : null;
    await raiseAlert('staff_role_granted', `${target?.email ?? targetId} -> ${detail.to}`,
      { by: actor.email, from: detail.from, to: detail.to });
  }
}

export async function listAdminActions(limit = 200) {
  const rows = await db().all('SELECT * FROM admin_actions ORDER BY seq ASC') as any[];
  let prev = GENESIS;
  let valid = true;
  let firstBroken: number | null = null;
  for (const row of rows) {
    const expected = actionHash(prev, row.at, row.actor_id, row.action, row.target_id, row.detail);
    if (row.prev_hash !== prev || row.hash !== expected) {
      valid = false;
      firstBroken ??= row.seq;
    }
    prev = row.hash;
  }
  return {
    chainValid: valid,
    firstBrokenSeq: firstBroken,
    total: rows.length,
    actions: rows.slice(-limit).reverse()
      .map((row) => ({ ...row, detail: row.detail ? JSON.parse(row.detail) : null })),
  };
}

// ── Retention ────────────────────────────────────────────────────────────────

/**
 * Deletes everything older than the retention period. The console-action
 * chain is trimmed from the start only, so what remains still verifies from
 * its first kept row (whose prev_hash becomes the new anchor).
 */
export async function sweepOld(days = RETENTION_DAYS): Promise<{ events: number; usage: number; alerts: number }> {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const events = await db().run('DELETE FROM security_events WHERE at < ?', cutoff);
  const usage = await db().run('DELETE FROM usage_daily WHERE day < ?', cutoff.slice(0, 10));
  const alerts = await db().run("DELETE FROM ops_alerts WHERE at < ? AND status = 'resolved'", cutoff);
  return {
    events: Number(events.changes ?? 0),
    usage: Number(usage.changes ?? 0),
    alerts: Number(alerts.changes ?? 0),
  };
}

let sweeper: NodeJS.Timeout | null = null;
export function startRetentionSweep(): void {
  if (sweeper) return;
  sweepOld().catch(() => undefined); // first boot on an old schema
  sweeper = setInterval(() => { sweepOld().catch(() => undefined); }, 6 * 3_600_000);
  sweeper.unref();
}

// ── Console queries ──────────────────────────────────────────────────────────

const day = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);

export async function overview() {
  const one = async (sql: string, ...args: unknown[]) => Number(((await db().get(sql, ...args)) as any)?.n ?? 0);
  const last24h = since(24 * 60);
  const usageTotals = await db().all(`SELECT metric, SUM(count) AS total FROM usage_daily WHERE day >= ? GROUP BY metric`, day(30)) as Array<{ metric: string; total: number }>;
  return {
    users: {
      total: await one('SELECT COUNT(*) AS n FROM users'),
      suspended: await one("SELECT COUNT(*) AS n FROM users WHERE status = 'suspended'"),
      new7d: await one('SELECT COUNT(*) AS n FROM users WHERE created_at >= ?', since(7 * 24 * 60)),
      new30d: await one('SELECT COUNT(*) AS n FROM users WHERE created_at >= ?', since(30 * 24 * 60)),
      activeToday: await one('SELECT COUNT(DISTINCT user_id) AS n FROM usage_daily WHERE day = ?', day(0)),
      active7d: await one('SELECT COUNT(DISTINCT user_id) AS n FROM usage_daily WHERE day >= ?', day(6)),
      staff: await one("SELECT COUNT(*) AS n FROM users WHERE role IN ('ADMIN','SECURITY','OPERATOR')"),
    },
    signIns24h: {
      ok: await one("SELECT COUNT(*) AS n FROM security_events WHERE type = 'auth.login_ok' AND at >= ?", last24h),
      failed: await one("SELECT COUNT(*) AS n FROM security_events WHERE type IN ('auth.login_failed','auth.otp_failed') AND at >= ?", last24h),
      locked: await one("SELECT COUNT(*) AS n FROM security_events WHERE type = 'auth.locked' AND at >= ?", last24h),
    },
    refused24h: await one("SELECT COUNT(*) AS n FROM security_events WHERE type LIKE 'access.%' AND at >= ?", last24h),
    activeSessions: await one('SELECT COUNT(*) AS n FROM sessions WHERE expires_at > ?', now()),
    openAlerts: await one("SELECT COUNT(*) AS n FROM ops_alerts WHERE status = 'open'"),
    usage30d: Object.fromEntries(usageTotals.map((row) => [row.metric, Number(row.total)])),
    server: {
      uptimeSeconds: Math.round(process.uptime()),
      node: process.version,
      environment: env.NODE_ENV,
      retentionDays: RETENTION_DAYS,
    },
  };
}

export async function usageSeries(fromDay: string, toDay: string) {
  const series = await db().all(`SELECT day, metric, SUM(count) AS total FROM usage_daily
    WHERE day BETWEEN ? AND ? GROUP BY day, metric ORDER BY day`, fromDay, toDay) as any[];
  const signIns = await db().all(`SELECT substr(at, 1, 10) AS day,
      SUM(CASE WHEN type = 'auth.login_ok' THEN 1 ELSE 0 END) AS ok,
      SUM(CASE WHEN type IN ('auth.login_failed','auth.otp_failed') THEN 1 ELSE 0 END) AS failed
    FROM security_events WHERE substr(at, 1, 10) BETWEEN ? AND ? GROUP BY substr(at, 1, 10) ORDER BY day`, fromDay, toDay) as any[];
  const topUsers = await db().all(`SELECT u.id, u.email, u.name, u.company_name AS "companyName", SUM(d.count) AS total
    FROM usage_daily d JOIN users u ON u.id = d.user_id WHERE d.day BETWEEN ? AND ?
    GROUP BY u.id ORDER BY total DESC LIMIT 15`, fromDay, toDay) as any[];
  const adoption = await db().all(`SELECT metric, COUNT(DISTINCT user_id) AS users FROM usage_daily
    WHERE day BETWEEN ? AND ? GROUP BY metric`, fromDay, toDay) as any[];
  return { from: fromDay, to: toDay, series, signIns, topUsers, adoption };
}

export interface UserQuery { q?: string; role?: string; status?: string; page?: number; pageSize?: number }

export async function searchUsers(query: UserQuery) {
  const where: string[] = [];
  const args: unknown[] = [];
  if (query.q) {
    const op = db().like; // case-insensitive on both databases
    where.push(`(email ${op} ? ESCAPE '\\' OR name ${op} ? ESCAPE '\\' OR company_name ${op} ? ESCAPE '\\' OR phone ${op} ? ESCAPE '\\')`);
    const like = `%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    args.push(like, like, like, like);
  }
  if (query.role) { where.push('role = ?'); args.push(query.role); }
  if (query.status) { where.push('status = ?'); args.push(query.status); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const pageSize = Math.min(Math.max(query.pageSize ?? 50, 1), 200);
  const page = Math.max(query.page ?? 1, 1);
  const total = Number((await db().get(`SELECT COUNT(*) AS n FROM users ${clause}`, ...args) as any).n);
  const rows = await db().all(`SELECT id, email, phone, name, company_name AS "companyName", role, status,
      auth_provider AS "authProvider", created_at AS "createdAt", last_login_at AS "lastLoginAt",
      (SELECT COUNT(*) FROM sessions s WHERE s.user_id = users.id AND s.expires_at > ?) AS "activeSessions",
      (SELECT COALESCE(SUM(count), 0) FROM usage_daily d WHERE d.user_id = users.id AND d.day >= ?) AS usage30d
    FROM users ${clause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    now(), day(30), ...args, pageSize, (page - 1) * pageSize);
  return { total, page, pageSize, users: rows };
}

export async function userDetail(userId: string) {
  const user = await db().get(`SELECT id, email, phone, name, company_name AS "companyName", role, status,
      suspended_reason AS "suspendedReason", auth_provider AS "authProvider", created_at AS "createdAt",
      updated_at AS "updatedAt", last_login_at AS "lastLoginAt" FROM users WHERE id = ?`, userId);
  if (!user) return null;
  const sessions = await db().all(`SELECT substr(token, 1, 8) AS ref, created_at AS "createdAt", expires_at AS "expiresAt"
    FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY created_at DESC`, userId, now());
  const usage = await db().all(`SELECT day, metric, count FROM usage_daily WHERE user_id = ? AND day >= ? ORDER BY day`, userId, day(30));
  const events = await db().all(`SELECT id, at, type, severity, ip_masked AS ip, user_agent AS "userAgent", detail
    FROM security_events WHERE user_id = ? ORDER BY id DESC LIMIT 50`, userId) as any[];
  return {
    user, sessions, usage,
    events: events.map((row) => ({ ...row, detail: row.detail ? JSON.parse(row.detail) : null })),
  };
}

export interface EventQuery {
  type?: string; severity?: string; user?: string; from?: string; to?: string;
  page?: number; pageSize?: number;
}

export async function searchEvents(query: EventQuery) {
  const where: string[] = [];
  const args: unknown[] = [];
  if (query.type) {
    if (query.type.endsWith('.*')) { where.push('e.type LIKE ?'); args.push(`${query.type.slice(0, -1)}%`); }
    else { where.push('e.type = ?'); args.push(query.type); }
  }
  if (query.severity) { where.push('e.severity = ?'); args.push(query.severity); }
  if (query.user) {
    where.push('(e.user_id = ? OR e.subject = ? OR u.email = ?)');
    args.push(query.user, query.user.toLowerCase(), query.user);
  }
  if (query.from) { where.push('e.at >= ?'); args.push(query.from); }
  if (query.to) { where.push('e.at <= ?'); args.push(query.to); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const pageSize = Math.min(Math.max(query.pageSize ?? 100, 1), 1000);
  const page = Math.max(query.page ?? 1, 1);
  const from = 'FROM security_events e LEFT JOIN users u ON u.id = e.user_id';
  const total = Number((await db().get(`SELECT COUNT(*) AS n ${from} ${clause}`, ...args) as any).n);
  const rows = await db().all(`SELECT e.id, e.at, e.type, e.severity, e.user_id AS "userId", u.email AS "userEmail",
      e.actor_id AS "actorId", e.subject, e.ip_masked AS ip, e.user_agent AS "userAgent", e.detail
    ${from} ${clause} ORDER BY e.id DESC LIMIT ? OFFSET ?`, ...args, pageSize, (page - 1) * pageSize) as any[];
  return {
    total, page, pageSize,
    events: rows.map((row) => ({ ...row, detail: row.detail ? JSON.parse(row.detail) : null })),
  };
}

/** A CSV cell a spreadsheet will not execute (=, +, -, @ and control prefixes). */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// ── Account actions ──────────────────────────────────────────────────────────

export async function countAdmins(excludingId?: string): Promise<number> {
  const row = excludingId
    ? await db().get("SELECT COUNT(*) AS n FROM users WHERE role = 'ADMIN' AND status = 'active' AND id != ?", excludingId)
    : await db().get("SELECT COUNT(*) AS n FROM users WHERE role = 'ADMIN' AND status = 'active'");
  return Number((row as any).n);
}

export async function setStatus(userId: string, status: 'active' | 'suspended', reason: string | null): Promise<void> {
  await db().run('UPDATE users SET status = ?, suspended_reason = ?, updated_at = ? WHERE id = ?', status, status === 'suspended' ? reason : null, now(), userId);
  if (status === 'suspended') await endSessions(userId);
}

export async function setRole(userId: string, role: string): Promise<void> {
  await db().run('UPDATE users SET role = ?, updated_at = ? WHERE id = ?', role, now(), userId);
}

export async function endSessions(userId: string): Promise<number> {
  const result = await db().run('DELETE FROM sessions WHERE user_id = ?', userId);
  return Number(result.changes ?? 0);
}

/**
 * Forces a password reset. The current password stops working at once and
 * every session ends. Until a reset-by-email flow exists, a one-time temporary
 * password is returned to the staff member who asked, to hand over through a
 * trusted channel; the account holder changes it from Settings after signing in.
 * It is never logged and never stored in clear.
 */
export async function forcePasswordReset(userId: string): Promise<string> {
  // 20 characters from an unambiguous alphabet: about 113 bits.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(20);
  const temporary = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  const { hash, salt } = dbService.hashPassword(temporary);
  await db().run('UPDATE users SET password_hash = ?, salt = ?, updated_at = ? WHERE id = ?', hash, salt, now(), userId);
  await endSessions(userId);
  await dbService.clearLoginFailures((await dbService.findUserById(userId))?.email ?? '');
  return temporary;
}
