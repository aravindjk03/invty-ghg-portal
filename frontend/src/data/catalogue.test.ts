/**
 * Integrity of the source register the picker offers.
 *
 * The register lists sources; it does not hold the values they calculate with.
 * Those are the engine's published factors, checked cell by cell against their
 * tables in the Python suite (tests/test_catalogue_calculates.py,
 * tests/test_ipcc_additions.py).
 */
import { describe, expect, it } from 'vitest';
import { CATALOGUE_SOURCES } from './catalogueData';
import { CATEGORY_TO_CATALOGUE } from './factorCatalogue';

describe('emission factor library', () => {
  it('holds no calculation value of its own', () => {
    // The register is the list of sources a user may pick. The value used is
    // the published factor the engine resolves; a number typed in here once
    // sat beside the engine's and disagreed with it (diesel 2.6865 here,
    // 2.6616 kg/L in DESNZ 2025, which is what every inventory used).
    const carrying = CATALOGUE_SOURCES
      .filter((source) => source.factorValue !== 0 || source.publicationYear !== 0)
      .map((source) => source.activity_key);
    expect(carrying).toEqual([]);
  });

  it('names a published source for every row that is not a memo', () => {
    const missing = CATALOGUE_SOURCES
      .filter((source) => source.scope !== 'memo' && !source.factor_source)
      .map((source) => source.activity_key);
    expect(missing).toEqual([]);
  });

  it('maps every entry category to catalogue rows that exist', () => {
    const names = new Set(CATALOGUE_SOURCES.map((source) => source.category_name));
    const dangling = Object.entries(CATEGORY_TO_CATALOGUE)
      .flatMap(([key, categories]) => categories.filter((name) => !names.has(name)).map((name) => `${key} -> ${name}`));
    expect(dangling).toEqual([]);
  });

  it('offers at least one source for every Scope 1 and Scope 2 category', () => {
    const empty = ['stationary_combustion', 'mobile_combustion', 'process_emissions',
      'fugitive_emissions', 'purchased_electricity', 'purchased_steam_heat_cooling']
      .filter((category) => {
        const names = CATEGORY_TO_CATALOGUE[category];
        return !CATALOGUE_SOURCES.some((source) => names.includes(source.category_name));
      });
    expect(empty).toEqual([]);
  });
});
