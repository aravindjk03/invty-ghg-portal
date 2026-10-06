/**
 * Which sources each workspace row may offer.
 *
 * An activity filed under the wrong scope or category is the first thing an
 * assurance provider looks for, and a source no row can select is a source an
 * inventory silently leaves out. Both are checked against the whole catalogue.
 */
import { describe, expect, it } from 'vitest';
import { CATALOGUE_SOURCES } from './catalogueData';
import { CATEGORY_TO_CATALOGUE, sourcesFor } from './factorCatalogue';

// The category keys each workspace page actually renders.
const PAGE_CATEGORIES: Record<string, string[]> = {
  'scope-1': ['stationary_combustion', 'mobile_combustion', 'process_emissions',
    'fugitive_emissions', 'agricultural_emissions'],
  'scope-2': ['purchased_electricity', 'purchased_steam_heat_cooling', 'market_instruments'],
  'scope-3': Object.keys(CATEGORY_TO_CATALOGUE).filter((key) => key.startsWith('cat')),
};
const SCOPE_CODE: Record<string, string> = { 'scope-1': '1', 'scope-2': '2', 'scope-3': '3' };

// Reported beside the inventory, never inside a scope total, so no row offers them.
const isMemo = (scope: string, category: string) => scope === 'memo' || /memo/i.test(category);

describe('the source picker on each row', () => {
  it('offers only sources from its own scope and category', () => {
    for (const [page, keys] of Object.entries(PAGE_CATEGORIES)) {
      for (const key of keys) {
        const offered = sourcesFor(page, key);
        expect(offered.length, `${page}/${key} offers nothing`).toBeGreaterThan(0);
        for (const source of offered) {
          expect(source.scope, `${source.activity_key} on ${page}/${key}`).toBe(SCOPE_CODE[page]);
          expect(CATEGORY_TO_CATALOGUE[key]).toContain(source.category_name);
        }
      }
    }
  });

  it('lets every Scope 3 category be recorded', () => {
    expect(PAGE_CATEGORIES['scope-3']).toHaveLength(15);
  });

  it('can select every source that belongs in a scope total, in exactly one place', () => {
    const placesFor = new Map<string, string[]>();
    for (const [page, keys] of Object.entries(PAGE_CATEGORIES)) {
      for (const key of keys) {
        // Market instruments are the market-based view of purchased electricity,
        // so the same grid sources appearing under both is intended.
        if (key === 'market_instruments') continue;
        for (const source of sourcesFor(page, key)) {
          placesFor.set(source.activity_key, [...(placesFor.get(source.activity_key) ?? []), `${page}/${key}`]);
        }
      }
    }
    for (const source of CATALOGUE_SOURCES) {
      const places = placesFor.get(source.activity_key) ?? [];
      if (isMemo(source.scope, source.category_name) || source.default_unit === 'auto') {
        expect(places, `${source.activity_key} should not be a row`).toEqual([]);
      } else {
        expect(places, `${source.activity_key} (${source.category_name})`).toHaveLength(1);
      }
    }
  });

  it('never offers a Category 3 line the engine derives itself', () => {
    const offered = sourcesFor('scope-3', 'cat3_fuel_energy').map((source) => source.activity_key);
    expect(offered).not.toContain('cat3.wtt_fuels');
    expect(offered).not.toContain('cat3.td_losses');
  });
});
