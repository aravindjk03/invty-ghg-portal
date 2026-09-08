#!/usr/bin/env node
/**
 * Generates the frontend's bundled catalogue from the backend register.
 *
 * There are three copies of the emission factor catalogue:
 *   1. backend/src/data/emission_source_catalogue.json  — register of record, served by the API
 *   2. frontend/src/data/emission_source_catalogue.json  — offline snapshot
 *   3. frontend/src/data/catalogueData.ts                — what the frontend actually bundles
 *
 * (3) is the one the app imports, and it was previously hand-maintained, so a
 * factor added to the register would not reach the UI. It is now generated, and
 * check-catalogue-sync verifies all three agree.
 *
 *   node scripts/build-catalogue.mjs
 */
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CANONICAL = join(root, 'backend', 'src', 'data', 'emission_source_catalogue.json');
const SNAPSHOT = join(root, 'frontend', 'src', 'data', 'emission_source_catalogue.json');
const GENERATED_TS = join(root, 'frontend', 'src', 'data', 'catalogueData.ts');

const catalogue = JSON.parse(readFileSync(CANONICAL, 'utf8'));

const header = `// GENERATED FILE — do not edit by hand.
// Source: backend/src/data/emission_source_catalogue.json
// Regenerate with: node scripts/build-catalogue.mjs
export interface CatalogueSource {
  activity_key: string;
  display_name: string;
  group: string;
  scope: string;
  ghg_category: string;
  category_name: string;
  default_unit: string;
  allowed_units: string;
  gases: string;
  factor_source: string;
  notes: string;
  factorValue: number;
  qualityTier: 'Primary' | 'Secondary' | 'Proxy' | 'Estimated';
  publicationYear: number;
}

export const CATALOGUE_SOURCES: CatalogueSource[] = `;

const footer = `;

/** Lookup by activity key, used by the factor resolver. */
export const CATALOGUE_BY_KEY: Record<string, CatalogueSource> = CATALOGUE_SOURCES.reduce(
  (acc, item) => {
    acc[item.activity_key] = item;
    return acc;
  },
  {} as Record<string, CatalogueSource>
);
`;

writeFileSync(GENERATED_TS, header + JSON.stringify(catalogue, null, 2) + footer, 'utf8');
copyFileSync(CANONICAL, SNAPSHOT);

console.log(`Generated catalogueData.ts and refreshed the snapshot (${catalogue.length} factors).`);
