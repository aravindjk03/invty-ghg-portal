/**
 * Data integrity of the emission factor library.
 *
 * A factor is kgCO2e per one default unit. Most mistakes in a factor library are
 * not typos in the number but a mismatch between the number and the unit it is
 * published per — a global warming potential entered against tonnes rather than
 * kilograms understates that source a thousandfold, and nothing downstream can
 * detect it. These bounds catch that class of error.
 */
import { describe, expect, it } from 'vitest';
import { CATALOGUE_SOURCES } from './catalogueData';
import { CATEGORY_TO_CATALOGUE } from './factorCatalogue';

/** Plausible kgCO2e per unit, wide enough to admit every real factor. */
const BOUNDS: Record<string, [number, number]> = {
  kwh: [0, 2], mwh: [0, 2000], gwh: [0, 2_000_000],
  l: [0, 5], kl: [0, 5000], m3: [0, 5], scm: [0, 5],
  kg: [0, 30_000], t: [0, 30_000_000], lb: [0, 20],
  km: [0, 5], 'pax.km': [0, 2], 't.km': [0, 5],
  inr: [0, 0.01], night: [0, 200], 'head.yr': [0, 5000], ha: [0, 100_000],
};

const verified = CATALOGUE_SOURCES.filter((source) => source.verified);

describe('emission factor library', () => {
  it('has factors for every scope', () => {
    ['1', '2', '3'].forEach((scope) => {
      expect(verified.some((source) => source.scope === scope)).toBe(true);
    });
  });

  it('keeps every verified factor within a plausible range for its unit', () => {
    const offenders = verified
      .filter((source) => {
        const bounds = BOUNDS[source.default_unit.toLowerCase().trim()];
        if (!bounds) return false;
        // Capture and removal rows are deductions, so judge the magnitude.
        const magnitude = Math.abs(source.factorValue);
        return magnitude < bounds[0] || magnitude > bounds[1];
      })
      .map((source) => `${source.activity_key}: ${source.factorValue} per ${source.default_unit}`);
    expect(offenders).toEqual([]);
  });

  it('publishes a global warming potential per kilogram, never per tonne', () => {
    // A GWP is kgCO2e per kg of gas. Declared against tonnes it is 1,000x low.
    // Only rows whose ACTIVITY DATA is a mass of the gas itself: a fuel row is
    // per tonne of fuel and carries a combustion factor, not a GWP.
    const gasRows = verified.filter((source) =>
      (source.activity_key.startsWith('fugitive.') || source.activity_key.startsWith('vent.'))
      && ['CH4', 'N2O', 'SF6', 'HFC', 'PFC', 'NF3'].some((gas) => source.gases.includes(gas)));
    const perTonne = gasRows
      .filter((source) => source.default_unit.toLowerCase() === 't' && source.factorValue < 1000)
      .map((source) => source.activity_key);
    expect(perTonne).toEqual([]);
  });

  it('gives every verified factor a source and a publication year', () => {
    const missing = verified
      .filter((source) => !source.factor_source || source.factor_source === 'n/a' || !source.publicationYear)
      .map((source) => source.activity_key);
    expect(missing).toEqual([]);
  });

  it('carries no factor value for a source that has not been ingested', () => {
    const wrong = CATALOGUE_SOURCES
      .filter((source) => !source.verified && source.factorValue !== 0)
      .map((source) => source.activity_key);
    expect(wrong).toEqual([]);
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
