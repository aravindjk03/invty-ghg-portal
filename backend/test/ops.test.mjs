/**
 * The operations console, end to end: the real server on a throwaway database.
 *
 *   npm test    (builds first, then node --test)
 *
 * Seeds (development/test only): admin@invty.com (ADMIN) and demo@company.com
 * (ESG_ANALYST). Staff accounts are made by the ADMIN through the console.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const PORT = 5600 + Math.floor(Math.random() * 300);
const BASE = `http://127.0.0.1:${PORT}/api/v1`;
const dir = mkdtempSync(path.join(tmpdir(), 'iinvty-ops-'));
let server;

async function call(method, url, { token, body, ip } = {}) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(ip ? { 'X-Forwarded-For': ip } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

async function login(email, password, ip) {
  const res = await call('POST', '/auth/login', { body: { email, password }, ip });
  return res.body.token;
}

async function signup(email, ip = '198.51.100.10') {
  const res = await call('POST', '/auth/signup', {
    body: { email, password: 'correct horse battery staple', name: 'Test Person', companyName: 'Test Co' }, ip,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return { token: res.body.token, id: res.body.user.id };
}

before(async () => {
  server = spawn(process.execPath, ['dist/index.js'], {
    env: {
      ...process.env, NODE_ENV: 'test', PORT: String(PORT),
      IINVTY_DB_FILE: path.join(dir, 'ops.db'),
      RATE_LIMIT_MAX_REQUESTS: '100000',
    },
    stdio: 'ignore',
  });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/api/health`)).ok) return; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start');
});

after(() => {
  server?.kill();
  rmSync(dir, { recursive: true, force: true });
});

test('the console refuses anyone who is not staff', async () => {
  assert.equal((await call('GET', '/ops/overview')).status, 401);
  const analyst = await signup('analyst-gate@example.com');
  assert.equal((await call('GET', '/ops/overview', { token: analyst.token })).status, 403);
  const admin = await login('admin@invty.com', 'IINVTY@2026');
  const res = await call('GET', '/ops/overview', { token: admin });
  assert.equal(res.status, 200);
  assert.ok(res.body.data.users.total >= 2);
});

test('roles: OPERATOR reads, SECURITY acts on users, only ADMIN changes roles', async () => {
  const admin = await login('admin@invty.com', 'IINVTY@2026');
  const op = await signup('operator@example.com');
  const sec = await signup('security@example.com');
  const victim = await signup('victim@example.com');
  assert.equal((await call('PATCH', `/ops/users/${op.id}/role`, { token: admin, body: { role: 'OPERATOR' } })).status, 200);
  assert.equal((await call('PATCH', `/ops/users/${sec.id}/role`, { token: admin, body: { role: 'SECURITY' } })).status, 200);
  // A role change ends sessions, so both sign in again.
  const opToken = await login('operator@example.com', 'correct horse battery staple');
  const secToken = await login('security@example.com', 'correct horse battery staple');

  assert.equal((await call('GET', '/ops/users', { token: opToken })).status, 200);
  assert.equal((await call('GET', '/ops/security', { token: opToken })).status, 403);
  assert.equal((await call('POST', `/ops/users/${victim.id}/suspend`, { token: opToken, body: { reason: 'test' } })).status, 403);

  assert.equal((await call('GET', '/ops/security', { token: secToken })).status, 200);
  assert.equal((await call('PATCH', `/ops/users/${victim.id}/role`, { token: secToken, body: { role: 'ADMIN' } })).status, 403);
  assert.equal((await call('POST', `/ops/users/${victim.id}/suspend`, { token: secToken, body: { reason: 'testing suspension' } })).status, 200);
});

test('a suspended account is refused at sign-in and on every request', async () => {
  const admin = await login('admin@invty.com', 'IINVTY@2026');
  const user = await signup('suspend-me@example.com');
  assert.equal((await call('GET', '/auth/me', { token: user.token })).status, 200);
  await call('POST', `/ops/users/${user.id}/suspend`, { token: admin, body: { reason: 'compromised' } });
  assert.equal((await call('GET', '/audit/ledger', { token: user.token })).status, 401); // sessions ended
  const relogin = await call('POST', '/auth/login', { body: { email: 'suspend-me@example.com', password: 'correct horse battery staple' } });
  assert.equal(relogin.status, 403);
  assert.equal(relogin.body.error.code, 'ACCOUNT_SUSPENDED');
  await call('POST', `/ops/users/${user.id}/reactivate`, { token: admin });
  assert.ok(await login('suspend-me@example.com', 'correct horse battery staple'));
});

test('failed sign-ins are logged with a masked IP and raise one alert', async () => {
  await signup('target@example.com');
  for (let i = 0; i < 11; i++) {
    await call('POST', '/auth/login', { body: { email: 'target@example.com', password: `wrong-${i}` }, ip: '203.0.113.77' });
  }
  const admin = await login('admin@invty.com', 'IINVTY@2026');
  const events = await call('GET', '/ops/security?type=auth.login_failed&user=target@example.com', { token: admin });
  assert.ok(events.body.data.total >= 5);
  for (const e of events.body.data.events) {
    assert.equal(e.ip, '203.0.113.x');
    assert.ok(!JSON.stringify(e).includes('203.0.113.77'));
  }
  const alerts = await call('GET', '/ops/alerts', { token: admin });
  const mine = alerts.body.data.filter((a) => a.subject === 'target@example.com' || a.subject === '203.0.113.x');
  assert.ok(mine.length >= 1, JSON.stringify(alerts.body.data));
  // One open alert per subject, not one per attempt.
  assert.equal(alerts.body.data.filter((a) => a.subject === '203.0.113.x' && a.kind === 'failed_sign_ins_network').length, 1);
});

test('the last ADMIN cannot be demoted, suspended or deleted', async () => {
  const admin = await login('admin@invty.com', 'IINVTY@2026');
  const me = (await call('GET', '/auth/me', { token: admin })).body.user;
  const demote = await call('PATCH', `/ops/users/${me.id}/role`, { token: admin, body: { role: 'ESG_ANALYST' } });
  assert.equal(demote.status, 409);
  const self = await call('POST', `/ops/users/${me.id}/suspend`, { token: admin, body: { reason: 'oops' } });
  assert.equal(self.status, 409);
});

test('console actions are chained and verify', async () => {
  const admin = await login('admin@invty.com', 'IINVTY@2026');
  const res = await call('GET', '/ops/admin-actions', { token: admin });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.chainValid, true);
  assert.ok(res.body.data.total >= 3);
});

test('usage is counted per account, by allowed metric only', async () => {
  const user = await signup('usage@example.com');
  assert.equal((await call('POST', '/usage', { token: user.token, body: { metric: 'calculation', count: 3 } })).status, 204);
  assert.equal((await call('POST', '/usage', { token: user.token, body: { metric: 'secret_figures' } })).status, 400);
  assert.equal((await call('POST', '/usage', { body: { metric: 'calculation' } })).status, 401);
  const admin = await login('admin@invty.com', 'IINVTY@2026');
  const detail = await call('GET', `/ops/users/${user.id}`, { token: admin });
  const calc = detail.body.data.usage.filter((u) => u.metric === 'calculation').reduce((s, u) => s + u.count, 0);
  assert.equal(calc, 3);
  const signIns = detail.body.data.usage.filter((u) => u.metric === 'sign_in').length;
  assert.ok(signIns >= 1);
});

test('the security log exports as CSV that a spreadsheet will not execute', async () => {
  await call('POST', '/auth/login', { body: { email: '=cmd@example.com', password: 'x' } });
  const admin = await login('admin@invty.com', 'IINVTY@2026');
  const res = await fetch(`${BASE}/ops/security.csv`, { headers: { Authorization: `Bearer ${admin}` } });
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.ok(text.startsWith('id,at,type'));
  assert.ok(!/(^|,)=cmd/m.test(text), 'a formula reached the CSV unescaped');
});

test('the cyber team cannot act on an administrator', async () => {
  const admin = await login('admin@invty.com', 'IINVTY@2026');
  const me = (await call('GET', '/auth/me', { token: admin })).body.user;
  const sec = await login('security@example.com', 'correct horse battery staple');
  for (const action of ['suspend', 'signout', 'force-reset']) {
    const res = await call('POST', `/ops/users/${me.id}/${action}`, { token: sec, body: { reason: 'locking out the owner' } });
    assert.equal(res.status, 403, action);
  }
});

test('a forced reset hands over a one-time password that works, and the old one does not', async () => {
  const admin = await login('admin@invty.com', 'IINVTY@2026');
  const user = await signup('reset-me@example.com');
  const res = await call('POST', `/ops/users/${user.id}/force-reset`, { token: admin });
  assert.equal(res.status, 200);
  const temporary = res.body.temporaryPassword;
  assert.ok(typeof temporary === 'string' && temporary.length >= 20);
  assert.equal((await call('GET', '/auth/me', { token: user.token })).status, 401); // signed out
  const old = await call('POST', '/auth/login', { body: { email: 'reset-me@example.com', password: 'correct horse battery staple' } });
  assert.equal(old.status, 401);
  assert.ok(await login('reset-me@example.com', temporary));
  // The temporary password never reaches the log.
  const log = await call('GET', '/ops/security?user=reset-me@example.com', { token: admin });
  assert.ok(!JSON.stringify(log.body).includes(temporary));
  const actions = await call('GET', '/ops/admin-actions', { token: admin });
  assert.ok(!JSON.stringify(actions.body).includes(temporary));
});

test('a flood of refused requests writes a handful of rows, not one per request', async () => {
  const admin = await login('admin@invty.com', 'IINVTY@2026');
  const before = (await call('GET', '/ops/security?type=access.invalid_token', { token: admin })).body.data.total;
  await Promise.all(Array.from({ length: 60 }, () =>
    call('GET', '/ops/overview', { token: 'forged-token', ip: '192.0.2.200' })));
  const after = (await call('GET', '/ops/security?type=access.invalid_token', { token: admin })).body.data.total;
  assert.ok(after - before <= 3, `60 refused requests wrote ${after - before} rows`);
  assert.ok(after - before >= 1);
  // ...but the burst still raises its alert.
  const alerts = (await call('GET', '/ops/alerts', { token: admin })).body.data;
  assert.ok(alerts.some((a) => a.kind === 'refused_requests_burst'), JSON.stringify(alerts.map((a) => a.kind)));
});
