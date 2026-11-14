/**
 * ADMIN_ORIGIN and OPS_ALLOWED_IPS: the console API is invisible (a plain 404)
 * from the customer site and from networks outside the allowlist.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const PORT = 5900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}/api/v1`;
const ADMIN_SITE = 'https://ops-test.example.com';
const CUSTOMER_SITE = 'https://app.example.com';
const dir = mkdtempSync(path.join(tmpdir(), 'iinvty-gate-'));
let server;

async function call(method, url, { token, body, origin, ip = '203.0.113.7' } = {}) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': ip,
      ...(origin ? { Origin: origin } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null), headers: res.headers };
}

before(async () => {
  server = spawn(process.execPath, ['dist/index.js'], {
    env: {
      ...process.env, NODE_ENV: 'test', PORT: String(PORT),
      IINVTY_DB_FILE: path.join(dir, 'gate.db'),
      RATE_LIMIT_MAX_REQUESTS: '100000',
      CORS_ORIGIN: CUSTOMER_SITE,
      ADMIN_ORIGIN: `${ADMIN_SITE}/`,
      OPS_ALLOWED_IPS: '203.0.113.0/24, 2001:db8::1',
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

test('from the admin site, on an allowed network, the console answers', async () => {
  const login = await call('POST', '/auth/login', { origin: ADMIN_SITE, body: { email: 'admin@invty.com', password: 'IINVTY@2026' } });
  assert.equal(login.status, 200);
  assert.equal(login.headers.get('access-control-allow-origin'), ADMIN_SITE);
  const res = await call('GET', '/ops/whoami', { origin: ADMIN_SITE, token: login.body.token });
  assert.equal(res.status, 200);
  assert.equal(res.body.role, 'ADMIN');
});

test('from the customer site the console looks like an unknown route', async () => {
  const token = (await call('POST', '/auth/login', { body: { email: 'admin@invty.com', password: 'IINVTY@2026' } })).body.token;
  for (const origin of [CUSTOMER_SITE, 'https://evil.example.net']) {
    const res = await call('GET', '/ops/whoami', { origin, token });
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'ROUTE_NOT_FOUND');
  }
  // Unauthenticated probes too: 404, not 401, so the route is not revealed.
  assert.equal((await call('GET', '/ops/overview', { origin: CUSTOMER_SITE })).status, 404);
  // The customer site still works as before.
  assert.equal((await call('POST', '/auth/login', { origin: CUSTOMER_SITE, body: { email: 'admin@invty.com', password: 'IINVTY@2026' } })).status, 200);
});

test('outside the allowed networks the console looks like an unknown route', async () => {
  const token = (await call('POST', '/auth/login', { body: { email: 'admin@invty.com', password: 'IINVTY@2026' } })).body.token;
  assert.equal((await call('GET', '/ops/whoami', { origin: ADMIN_SITE, token, ip: '198.51.100.9' })).status, 404);
  assert.equal((await call('GET', '/ops/whoami', { origin: ADMIN_SITE, token, ip: '2001:db8::1' })).status, 200);
  assert.equal((await call('GET', '/ops/whoami', { origin: ADMIN_SITE, token, ip: '2001:db8::2' })).status, 404);
});

test('the refusals are in the security log', async () => {
  const token = (await call('POST', '/auth/login', { body: { email: 'admin@invty.com', password: 'IINVTY@2026' } })).body.token;
  const res = await call('GET', '/ops/security?type=access.ops_wrong_origin', { origin: ADMIN_SITE, token });
  assert.equal(res.status, 200);
  const subjects = res.body.data.events.map((e) => e.subject);
  assert.ok(subjects.includes(CUSTOMER_SITE), JSON.stringify(subjects));
  assert.ok(subjects.includes('https://evil.example.net'), JSON.stringify(subjects));
});
