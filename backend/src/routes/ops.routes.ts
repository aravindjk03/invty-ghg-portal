/**
 * The operations console API, for the internal developer and cyber team.
 *
 * Mounted behind requireAuth. Each route then names the staff roles that may
 * use it, on the server: the console page being hidden in the app is a
 * convenience, never the protection.
 *
 *   OPERATOR  developers: overview, users (read), usage and traffic
 *   SECURITY  cyber team: overview, users, security log, alerts, sessions,
 *             suspend / reactivate / sign out / force reset
 *   ADMIN     everything, plus changing roles and deleting accounts
 */
import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { dbService } from '../db/database';
import { requireRole } from '../middleware/requireAuth';
import {
  ALL_ROLES, countAdmins, csvCell, endSessions, forcePasswordReset, listAdminActions, listAlerts,
  overview, recordAdminAction, resolveAlert, searchEvents, searchUsers, setRole, setStatus,
  usageSeries, userDetail,
} from '../services/ops.service';

const router = Router();

const ANY_STAFF = requireRole('ADMIN', 'SECURITY', 'OPERATOR');
const SECURITY = requireRole('ADMIN', 'SECURITY');
const ADMIN = requireRole('ADMIN');

const fail = (res: Response, status: number, code: string, message: string) =>
  res.status(status).json({ success: false, error: { code, message } });

const actor = (req: Request) => ({ id: req.user!.id, email: req.user!.email });

const day = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
const isDay = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const str = (value: unknown, max = 200) => (typeof value === 'string' ? value.slice(0, max) : undefined);
const int = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
};

/** Who is asking, and what the console should show them. */
router.get('/whoami', ANY_STAFF, (req, res) => {
  const role = req.user!.role;
  res.json({
    success: true,
    role,
    can: {
      viewSecurity: role === 'ADMIN' || role === 'SECURITY',
      actOnUsers: role === 'ADMIN' || role === 'SECURITY',
      changeRoles: role === 'ADMIN',
      deleteUsers: role === 'ADMIN',
    },
  });
});

router.get('/overview', ANY_STAFF, (_req, res) => {
  res.json({ success: true, data: overview() });
});

router.get('/usage', ANY_STAFF, (req, res) => {
  const from = isDay(req.query.from) ? req.query.from : day(29);
  const to = isDay(req.query.to) ? req.query.to : day(0);
  res.json({ success: true, data: usageSeries(from, to) });
});

router.get('/users', ANY_STAFF, (req, res) => {
  const role = str(req.query.role, 32);
  const status = str(req.query.status, 16);
  res.json({
    success: true,
    data: searchUsers({
      q: str(req.query.q, 120),
      role: role && (ALL_ROLES as readonly string[]).includes(role) ? role : undefined,
      status: status === 'active' || status === 'suspended' ? status : undefined,
      page: int(req.query.page),
      pageSize: int(req.query.pageSize),
    }),
  });
});

router.get('/users/:id', ANY_STAFF, (req, res) => {
  const detail = userDetail(req.params.id);
  if (!detail) return fail(res, 404, 'NOT_FOUND', 'No such account.');
  // Developers see the account and its usage; the security trail is the cyber team's.
  const role = req.user!.role;
  if (role === 'OPERATOR') detail.events = [];
  return res.json({ success: true, data: detail });
});

const reasonSchema = z.object({ reason: z.string().trim().min(3, 'Give a reason.').max(300) });

function target(req: Request, res: Response) {
  const user = dbService.findUserById(req.params.id);
  if (!user) {
    fail(res, 404, 'NOT_FOUND', 'No such account.');
    return null;
  }
  // The cyber team acts on customer and staff accounts, but only an ADMIN may
  // act on an ADMIN: otherwise one SECURITY account could lock out the owners.
  if (user.role === 'ADMIN' && req.user!.role !== 'ADMIN') {
    fail(res, 403, 'ADMIN_ONLY', 'Only an administrator can change an administrator account.');
    return null;
  }
  return user;
}

router.post('/users/:id/suspend', SECURITY, (req, res) => {
  const parsed = reasonSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Give a reason.');
  const user = target(req, res);
  if (!user) return undefined;
  if (user.id === req.user!.id) return fail(res, 409, 'SELF', 'You cannot suspend your own account.');
  if (user.role === 'ADMIN' && countAdmins(user.id) === 0) {
    return fail(res, 409, 'LAST_ADMIN', 'This is the only active administrator.');
  }
  setStatus(user.id, 'suspended', parsed.data.reason);
  recordAdminAction(actor(req), 'user_suspended', user.id, { email: user.email, reason: parsed.data.reason }, req);
  return res.json({ success: true });
});

router.post('/users/:id/reactivate', SECURITY, (req, res) => {
  const user = target(req, res);
  if (!user) return undefined;
  setStatus(user.id, 'active', null);
  recordAdminAction(actor(req), 'user_reactivated', user.id, { email: user.email }, req);
  return res.json({ success: true });
});

router.post('/users/:id/signout', SECURITY, (req, res) => {
  const user = target(req, res);
  if (!user) return undefined;
  const ended = endSessions(user.id);
  recordAdminAction(actor(req), 'user_signed_out', user.id, { email: user.email, sessionsEnded: ended }, req);
  return res.json({ success: true, sessionsEnded: ended });
});

router.post('/users/:id/force-reset', SECURITY, (req, res) => {
  const user = target(req, res);
  if (!user) return undefined;
  if (user.id === req.user!.id) return fail(res, 409, 'SELF', 'Change your own password from your account settings.');
  if ((user.auth_provider ?? 'email') !== 'email') {
    // Google and mobile accounts have no password; ending their sessions is the reset.
    const ended = endSessions(user.id);
    recordAdminAction(actor(req), 'sessions_ended_no_password', user.id, { email: user.email, sessionsEnded: ended }, req);
    return res.json({ success: true, temporaryPassword: null,
      message: `This account signs in with ${user.auth_provider}; it has no password. Its sessions were ended.` });
  }
  const temporaryPassword = forcePasswordReset(user.id);
  recordAdminAction(actor(req), 'password_reset_forced', user.id, { email: user.email }, req);
  return res.json({ success: true, temporaryPassword,
    message: 'Shown once. Give it to the account holder through a trusted channel; they change it in Settings.' });
});

const roleSchema = z.object({ role: z.enum(ALL_ROLES) });

router.patch('/users/:id/role', ADMIN, (req, res) => {
  const parsed = roleSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'VALIDATION_ERROR', 'Choose a valid role.');
  const user = target(req, res);
  if (!user) return undefined;
  if (user.role === parsed.data.role) return res.json({ success: true, unchanged: true });
  if (user.role === 'ADMIN' && countAdmins(user.id) === 0) {
    return fail(res, 409, 'LAST_ADMIN', 'This is the only active administrator. Make another account ADMIN first.');
  }
  setRole(user.id, parsed.data.role);
  // A role change takes effect on the next request; staff sessions are not
  // carried over into a lesser role.
  endSessions(user.id);
  recordAdminAction(actor(req), 'role_changed', user.id,
    { email: user.email, from: user.role, to: parsed.data.role }, req);
  return res.json({ success: true });
});

const deleteSchema = z.object({ confirmEmail: z.string().min(3).max(320) });

router.delete('/users/:id', ADMIN, (req, res) => {
  const parsed = deleteSchema.safeParse(req.body);
  const user = target(req, res);
  if (!user) return undefined;
  if (!parsed.success || parsed.data.confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) {
    return fail(res, 400, 'CONFIRMATION_MISMATCH', "Type the account's email address to confirm.");
  }
  if (user.id === req.user!.id) return fail(res, 409, 'SELF', 'Delete your own account from your account settings.');
  if (user.role === 'ADMIN' && countAdmins(user.id) === 0) {
    return fail(res, 409, 'LAST_ADMIN', 'This is the only active administrator.');
  }
  dbService.deleteUser(user.id);
  recordAdminAction(actor(req), 'user_deleted', null, { email: user.email, id: user.id }, req);
  return res.json({ success: true });
});

router.get('/security', SECURITY, (req, res) => {
  res.json({
    success: true,
    data: searchEvents({
      type: str(req.query.type, 64),
      severity: ['info', 'warning', 'high'].includes(String(req.query.severity)) ? String(req.query.severity) : undefined,
      user: str(req.query.user, 320),
      from: str(req.query.from, 40),
      to: str(req.query.to, 40),
      page: int(req.query.page),
      pageSize: int(req.query.pageSize),
    }),
  });
});

router.get('/security.csv', SECURITY, (req, res) => {
  const result = searchEvents({
    type: str(req.query.type, 64), severity: str(req.query.severity, 16), user: str(req.query.user, 320),
    from: str(req.query.from, 40), to: str(req.query.to, 40), pageSize: 1000,
  });
  const header = ['id', 'at', 'type', 'severity', 'user_email', 'user_id', 'actor_id', 'subject', 'ip_masked', 'user_agent', 'detail'];
  const lines = [header.join(',')].concat(result.events.map((e: any) => [
    e.id, e.at, e.type, e.severity, e.userEmail, e.userId, e.actorId, e.subject, e.ip, e.userAgent,
    e.detail ? JSON.stringify(e.detail) : '',
  ].map(csvCell).join(',')));
  recordAdminAction(actor(req), 'security_log_exported', null, { rows: result.events.length }, req);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="iinvty-security-log-${day(0)}.csv"`);
  res.send(lines.join('\n'));
});

router.get('/alerts', SECURITY, (req, res) => {
  const status = req.query.status === 'resolved' || req.query.status === 'all' ? req.query.status : 'open';
  res.json({ success: true, data: listAlerts(status as 'open' | 'resolved' | 'all') });
});

router.post('/alerts/:id/resolve', SECURITY, (req, res) => {
  const id = int(req.params.id);
  if (!id || !resolveAlert(id, req.user!.email)) return fail(res, 404, 'NOT_FOUND', 'No such open alert.');
  recordAdminAction(actor(req), 'alert_resolved', null, { alertId: id }, req);
  return res.json({ success: true });
});

router.get('/admin-actions', SECURITY, (_req, res) => {
  res.json({ success: true, data: listAdminActions() });
});

export default router;
