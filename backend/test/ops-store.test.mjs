/**
 * Retention and tamper evidence, straight against the store.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.NODE_ENV = 'test';
process.env.IINVTY_DB_FILE = path.join(mkdtempSync(path.join(tmpdir(), 'iinvty-store-')), 'store.db');
const require = createRequire(import.meta.url);
const ops = require('../dist/services/ops.service.js');
const { dbService } = require('../dist/db/database.js');
const db = dbService.connection;

test('IP addresses are masked before they are stored', () => {
  assert.equal(ops.maskIp('203.0.113.42'), '203.0.113.x');
  assert.equal(ops.maskIp('::ffff:198.51.100.7'), '198.51.100.x');
  assert.equal(ops.maskIp('2001:db8:85a3:8d3:1319:8a2e:370:7348'), '2001:db8:85a3::/48');
  assert.equal(ops.maskIp(undefined), null);
});

test('nothing older than 90 days survives the sweep', () => {
  const old = new Date(Date.now() - 91 * 86_400_000).toISOString();
  const recent = new Date().toISOString();
  db.prepare("INSERT INTO security_events (at, type, severity) VALUES (?, 'auth.login_ok', 'info')").run(old);
  db.prepare("INSERT INTO security_events (at, type, severity) VALUES (?, 'auth.login_ok', 'info')").run(recent);
  db.prepare("INSERT INTO usage_daily (user_id, day, metric, count) VALUES ('u', ?, 'calculation', 1)").run(old.slice(0, 10));
  const removed = ops.sweepOld();
  assert.ok(removed.events >= 1 && removed.usage >= 1);
  const left = db.prepare('SELECT MIN(at) AS oldest FROM security_events').get();
  assert.ok(left.oldest >= new Date(Date.now() - 90 * 86_400_000).toISOString());
});

test('editing a logged console action breaks the chain', () => {
  const actor = { id: 'admin-1', email: 'admin@example.com' };
  ops.recordAdminAction(actor, 'user_suspended', 'u-1', { reason: 'a' });
  ops.recordAdminAction(actor, 'user_reactivated', 'u-1', {});
  assert.equal(ops.listAdminActions().chainValid, true);
  db.prepare("UPDATE admin_actions SET actor_email = 'someone-else@example.com', action = 'user_reactivated' WHERE seq = (SELECT MIN(seq) FROM admin_actions)").run();
  // The hash covers actor id and action; rewriting the action is caught.
  const after = ops.listAdminActions();
  assert.equal(after.chainValid, false);
  assert.ok(after.firstBrokenSeq !== null);
});

test('a CSV cell never starts a formula', () => {
  assert.equal(ops.csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(ops.csvCell('+1'), "'+1");
  assert.equal(ops.csvCell('plain'), 'plain');
});
