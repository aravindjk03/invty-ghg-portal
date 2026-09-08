#!/usr/bin/env node
/**
 * The backend is the register of record for emission factors; the frontend
 * bundles a byte-identical snapshot so the app still works offline.
 *
 * Two copies can drift, and drift here is not cosmetic: a row saved against one
 * catalogue would resolve to a different factor in the other. This check fails
 * the build when they diverge.
 *
 *   node scripts/check-catalogue-sync.mjs        # verify
 *   node scripts/check-catalogue-sync.mjs --fix  # copy backend -> frontend
 */
import { createHash } from 'node:crypto';
import { readFileSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CANONICAL = join(root, 'backend', 'src', 'data', 'emission_source_catalogue.json');
const SNAPSHOT = join(root, 'frontend', 'src', 'data', 'emission_source_catalogue.json');

const sha = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

if (process.argv.includes('--fix')) {
  copyFileSync(CANONICAL, SNAPSHOT);
  console.log('Catalogue snapshot refreshed from the backend register.');
  process.exit(0);
}

const canonical = sha(CANONICAL);
const snapshot = sha(SNAPSHOT);

if (canonical !== snapshot) {
  console.error('Emission factor catalogues have diverged.\n');
  console.error(`  backend  (register of record) ${canonical.slice(0, 16)}`);
  console.error(`  frontend (offline snapshot)   ${snapshot.slice(0, 16)}\n`);
  console.error('Run: node scripts/check-catalogue-sync.mjs --fix');
  process.exit(1);
}

const count = JSON.parse(readFileSync(CANONICAL, 'utf8')).length;
console.log(`Emission factor catalogues in sync (${count} factors, ${canonical.slice(0, 16)}).`);
