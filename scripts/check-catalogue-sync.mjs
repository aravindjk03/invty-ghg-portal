#!/usr/bin/env node
/**
 * The backend is the register of record for emission factors. Two derived
 * copies exist so the app works offline and so the client can bundle them:
 *
 *   1. backend/src/data/emission_source_catalogue.json  — register of record
 *   2. frontend/src/data/emission_source_catalogue.json  — offline snapshot
 *   3. frontend/src/data/catalogueData.ts                — bundled by the app
 *
 * (3) is what the UI actually imports, so a factor that reaches only (1) is
 * invisible in the app. Drift here is not cosmetic: a row saved against one
 * catalogue resolves to a different factor in another. This check fails the
 * build when any of the three disagree.
 *
 *   node scripts/check-catalogue-sync.mjs        # verify
 *   node scripts/check-catalogue-sync.mjs --fix  # regenerate from the register
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CANONICAL = join(root, 'backend', 'src', 'data', 'emission_source_catalogue.json');
const SNAPSHOT = join(root, 'frontend', 'src', 'data', 'emission_source_catalogue.json');
const GENERATED_TS = join(root, 'frontend', 'src', 'data', 'catalogueData.ts');

if (process.argv.includes('--fix')) {
  execFileSync(process.execPath, [join(root, 'scripts', 'build-catalogue.mjs')], { stdio: 'inherit' });
  process.exit(0);
}

const canonical = JSON.parse(readFileSync(CANONICAL, 'utf8'));
const snapshot = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));

/** Compare parsed content so formatting differences are not false failures. */
const fingerprint = (rows) => createHash('sha256').update(JSON.stringify(rows)).digest('hex');

// The generated module embeds the same array; pull it back out to compare.
const tsSource = readFileSync(GENERATED_TS, 'utf8');
// Anchor on the assignment, not on CATALOGUE_SOURCES itself: the `[]` in the
// `CatalogueSource[]` type annotation sits between the two.
const assignAt = tsSource.indexOf('=', tsSource.indexOf('CATALOGUE_SOURCES'));
const arrayStart = tsSource.indexOf('[', assignAt);
// The array is pretty-printed, so it closes on a line that is exactly "]".
// lastIndexOf(']') would run past it into the helper exports below.
const arrayEnd = tsSource.indexOf('\n]', arrayStart);
let generated = null;
try {
  generated = JSON.parse(tsSource.slice(arrayStart, arrayEnd + 2));
} catch {
  console.error('Could not parse CATALOGUE_SOURCES out of catalogueData.ts.');
  console.error('Run: node scripts/check-catalogue-sync.mjs --fix');
  process.exit(1);
}

const copies = [
  ['backend register of record', canonical],
  ['frontend offline snapshot', snapshot],
  ['frontend bundled catalogueData.ts', generated],
];

const reference = fingerprint(canonical);
const diverged = copies.filter(([, rows]) => fingerprint(rows) !== reference);

if (diverged.length > 0) {
  console.error('Emission factor catalogues have diverged.\n');
  for (const [name, rows] of copies) {
    const mark = fingerprint(rows) === reference ? ' ' : '!';
    console.error(`  ${mark} ${name.padEnd(38)} ${String(rows.length).padStart(4)} factors  ${fingerprint(rows).slice(0, 16)}`);
  }
  console.error('\nRun: node scripts/check-catalogue-sync.mjs --fix');
  process.exit(1);
}

console.log(
  `Emission factor catalogues in sync across all three copies (${canonical.length} factors, ${reference.slice(0, 16)}).`
);
