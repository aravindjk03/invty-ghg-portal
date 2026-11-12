/**
 * Every source in the library says what stands behind it.
 *
 * Built against the engine's real map (data/catalogue_engine_map.csv), so a
 * source that loses its mapping and has no stated reason fails here rather
 * than reappearing on screen as a blank "no published value".
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATALOGUE_SOURCES } from './catalogueData';
import { EXPLAINED_KEYS, NOT_CALCULATED_REASON, factorStatus } from './factorStatus';
import { CatalogueMap, CatalogueMapping } from '../services/catalogueMap';
import { methodFor } from './methodSources';

function engineMap(): CatalogueMap {
  const text = readFileSync(resolve(__dirname, '../../../data/catalogue_engine_map.csv'), 'utf8');
  const [header, ...lines] = text.trim().split('\n');
  const keyIndex = header.split(',').indexOf('catalogue_key');
  const map: CatalogueMap = new Map();
  lines.forEach((line) => {
    const key = line.split(',')[keyIndex];
    const mapping = { catalogue_key: key, unit: 'x', source: 'published', values: [] } as unknown as CatalogueMapping;
    map.set(key, [...(map.get(key) ?? []), mapping]);
  });
  return map;
}

describe('factor status', () => {
  const map = engineMap();

  it('gives every source a value, a method or a stated reason', () => {
    const silent = CATALOGUE_SOURCES
      .filter((source) => !map.has(source.activity_key) && !methodFor(source.activity_key)
        && !EXPLAINED_KEYS.has(source.activity_key))
      .map((source) => source.activity_key);
    expect(silent).toEqual([]);
  });

  it('never explains away a source that the engine can calculate', () => {
    const contradicted = CATALOGUE_SOURCES
      .filter((source) => map.has(source.activity_key) && NOT_CALCULATED_REASON[source.activity_key])
      .map((source) => source.activity_key);
    expect(contradicted).toEqual([]);
  });

  it('reports a published value as published', () => {
    const diesel = CATALOGUE_SOURCES.find((source) => source.activity_key === 'fuel.diesel.stationary')!;
    expect(factorStatus(map, diesel).kind).toBe('published');
  });

  it('sends a process source to its IPCC method', () => {
    const clinker = CATALOGUE_SOURCES.find((source) => source.activity_key === 'process.cement_clinker')!;
    expect(factorStatus(map, clinker).kind).toBe('method');
    const rice = CATALOGUE_SOURCES.find((source) => source.activity_key === 'agri.rice_cultivation')!;
    expect(factorStatus(map, rice).kind).toBe('method');
  });
});
