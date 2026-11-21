/**
 * The database layer works the same on SQLite and Postgres:
 *   npm test                                  (SQLite)
 *   DATABASE_URL=postgres://… npm test        (Postgres)
 * and an account survives a server restart, which is the whole point of
 * running on Postgres on a free host.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { toPositional } = require('../dist/db/driver.js');
const { splitStatements } = require('../dist/db/postgres-http.js');
const { POSTGRES_SCHEMA } = require('../dist/db/schema.js');

test('the Postgres schema splits into single statements for the HTTPS driver', () => {
  const parts = splitStatements(POSTGRES_SCHEMA);
  assert.ok(parts.length >= 20, `only ${parts.length} statements`);
  for (const p of parts) {
    assert.match(p, /^CREATE (TABLE|INDEX|UNIQUE INDEX) IF NOT EXISTS/);
    assert.ok(!p.includes(';') && !/^\s*--/m.test(p));
  }
});

test('? placeholders become $n, but not inside quoted strings', () => {
  assert.equal(toPositional('SELECT * FROM t WHERE a = ? AND b = ?'), 'SELECT * FROM t WHERE a = $1 AND b = $2');
  assert.equal(toPositional("SELECT '?' AS q, x FROM t WHERE y = ?"), "SELECT '?' AS q, x FROM t WHERE y = $1");
  assert.equal(toPositional("WHERE a LIKE ? ESCAPE '\\' AND b = ?"), "WHERE a LIKE $1 ESCAPE '\\' AND b = $2");
});

const dir = mkdtempSync(path.join(tmpdir(), 'iinvty-restart-'));
const schema = `t_restart_${process.pid}_${Date.now()}`;
const PORT = 6100 + Math.floor(Math.random() * 300);
const BASE = `http://127.0.0.1:${PORT}/api`;
let server;

async function start() {
  server = spawn(process.execPath, ['dist/index.js'], {
    env: { ...process.env, NODE_ENV: 'test', PORT: String(PORT), IINVTY_DB_FILE: path.join(dir, 'r.db'),
      IINVTY_DB_SCHEMA: schema, RATE_LIMIT_MAX_REQUESTS: '100000' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(`${BASE}/health`)).ok) return; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start');
}
async function stop() {
  await new Promise((r) => { server.once('exit', r); server.kill('SIGTERM'); });
}
const post = (url, body, token) => fetch(`${BASE}/v1${url}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
}).then(async (r) => ({ status: r.status, body: await r.json() }));

after(() => { try { server?.kill(); } catch { /* gone */ } rmSync(dir, { recursive: true, force: true }); });

test('an account and its log survive a restart', async () => {
  await start();
  const health = await (await fetch(`${BASE}/health`)).json();
  assert.equal(health.database.reachable, true);
  assert.equal(health.database.kind, process.env.DATABASE_URL ? 'postgres' : 'sqlite');
  const email = 'Restart.Person@Example.com';
  const signup = await post('/auth/signup', { email, password: 'correct horse battery staple', name: 'Re Start', companyName: 'Co' });
  assert.equal(signup.status, 201, JSON.stringify(signup.body));
  await stop();

  await start();
  // Different case from sign-up: emails match case-insensitively on both databases.
  const login = await post('/auth/login', { email: 'restart.person@example.com', password: 'correct horse battery staple' });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  assert.equal(login.body.user.email, 'restart.person@example.com');
  await stop();
});
