/**
 * Retention and tamper evidence, straight against the store.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.NODE_ENV = 'test';
process.env.IINVTY_DB_FILE = path.join(mkdtempSync(path.join(tmpdir(), 'iinvty-store-')), 'store.db');
// With DATABASE_URL set (the Postgres run), use a schema of our own.
process.env.IINVTY_DB_SCHEMA = `t_store_${process.pid}_${Date.now()}`;
const require = createRequire(import.meta.url);
const ops = require('../dist/services/ops.service.js');
const { dbService } = require('../dist/db/database.js');
await dbService.init();
const db = dbService.connection;
after(() => dbService.close());

test('IP addresses are masked before they are stored', () => {
  assert.equal(ops.maskIp('203.0.113.42'), '203.0.113.x');
  assert.equal(ops.maskIp('::ffff:198.51.100.7'), '198.51.100.x');
  assert.equal(ops.maskIp('2001:db8:85a3:8d3:1319:8a2e:370:7348'), '2001:db8:85a3::/48');
  assert.equal(ops.maskIp(undefined), null);
});

test('nothing older than 90 days survives the sweep', async () => {
  const old = new Date(Date.now() - 91 * 86_400_000).toISOString();
  const recent = new Date().toISOString();
  await db.run("INSERT INTO security_events (at, type, severity) VALUES (?, 'auth.login_ok', 'info')", old);
  await db.run("INSERT INTO security_events (at, type, severity) VALUES (?, 'auth.login_ok', 'info')", recent);
  await db.run("INSERT INTO usage_daily (user_id, day, metric, count) VALUES ('u', ?, 'calculation', 1)", old.slice(0, 10));
  const removed = await ops.sweepOld();
  assert.ok(removed.events >= 1 && removed.usage >= 1);
  const left = await db.get('SELECT MIN(at) AS oldest FROM security_events');
  assert.ok(left.oldest >= new Date(Date.now() - 90 * 86_400_000).toISOString());
});

test('editing a logged console action breaks the chain', async () => {
  const actor = { id: 'admin-1', email: 'admin@example.com' };
  await ops.recordAdminAction(actor, 'user_suspended', 'u-1', { reason: 'a' });
  await ops.recordAdminAction(actor, 'user_reactivated', 'u-1', {});
  assert.equal((await ops.listAdminActions()).chainValid, true);
  await db.run("UPDATE admin_actions SET actor_email = 'someone-else@example.com', action = 'user_reactivated' WHERE seq = (SELECT MIN(seq) FROM admin_actions)");
  // The hash covers actor id and action; rewriting the action is caught.
  const result = await ops.listAdminActions();
  assert.equal(result.chainValid, false);
  assert.ok(result.firstBrokenSeq !== null);
});

test('a CSV cell never starts a formula', () => {
  assert.equal(ops.csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(ops.csvCell('+1'), "'+1");
  assert.equal(ops.csvCell('plain'), 'plain');
});

test('two console actions at the same moment still form one unbroken chain', async () => {
  const actor = { id: 'admin-2', email: 'admin2@example.com' };
  const before = (await ops.listAdminActions()).total;
  await Promise.all(Array.from({ length: 8 }, (_, i) => ops.recordAdminAction(actor, 'user_signed_out', `u-${i}`, {})));
  const rows = await db.all('SELECT prev_hash, hash FROM admin_actions ORDER BY seq ASC');
  const tail = rows.slice(before);
  for (let i = 1; i < tail.length; i++) assert.equal(tail[i].prev_hash, tail[i - 1].hash);
});
