/**
 * What the engine is asked to calculate for each row.
 *
 * The Scope 2 rules here decide what a customer's market-based figure is, and
 * getting them wrong is not visible on the page: a green tariff reported at
 * the grid average still looks like a calculated row. EVERY NUMBER HERE IS A
 * FIXTURE.
 */
import { describe, expect, it } from 'vitest';
import { ActivityEntry, EmissionFactor } from '../types/ghg';
import { marketRecordId, recordsFor } from './useEngineInventory';
import { setUnitChoices } from '../services/catalogueMap';

const factor: EmissionFactor = {
  id: 'elec.green_tariff', fuelOrActivity: 'Green tariff', scope: 'scope-2',
  category: '', factorValue: 0, unit: 'kWh', source: 'fixture',
  publicationYear: 2025, qualityTier: 'Primary',
};

const row = (over: Partial<ActivityEntry> & { id: string }): ActivityEntry => ({
  facility: 'Plant', scope: 'scope-2', category: 'market_instruments',
  fuelOrSource: 'Green tariff', amount: 220000, unit: 'kWh',
  emissionFactor: factor, calculatedTco2e: 0,
  engineActivityKey: 'cea.grid.fixture', engineRegion: 'IN',
  updatedAt: '2026-01-01T00:00:00.000Z', ...over,
});

const viewsOf = (entry: ActivityEntry) => {
  const { records } = recordsFor([entry]);
  return Object.fromEntries(records.map((r) => [r.scope2_view ?? 'none', r]));
};

describe('Scope 2 is reported twice', () => {
  it('sends the same kilowatt hours to both columns', () => {
    const { location, market } = viewsOf(row({ id: 'r1' }));
    expect(location.value).toBe('220000');
    expect(market.value).toBe('220000');
    expect(market.record_id).toBe(marketRecordId('r1'));
  });

  it('puts a green tariff into the LOCATION column at the grid factor', () => {
    // The contract does not change the electrons. Leaving these kilowatt hours
    // out of the location-based total understates it by the whole contract.
    const { location } = viewsOf(row({
      id: 'r1', customFactorOverride: 0.012, customFactorSource: 'PPA clause 4',
    }));
    expect(location.activity_key).toBe('cea.grid.fixture');
    expect(location.supplied_factor).toBeUndefined();
  });

  it('puts the contracted rate into the MARKET column, with its citation', () => {
    const { market } = viewsOf(row({
      id: 'r1', customFactorOverride: 0.012, customFactorSource: 'PPA clause 4',
    }));
    expect(market.supplied_factor).toBe('0.012');
    expect(market.supplied_factor_source).toBe('PPA clause 4');
  });

  it('falls back to the published factor when no rate is contracted', () => {
    // India publishes no residual mix, so the Guidance's fallback is the grid
    // average. The row says so rather than showing an empty market figure.
    const { market } = viewsOf(row({ id: 'r1' }));
    expect(market.activity_key).toBe('cea.grid.fixture');
    expect(market.supplied_factor).toBeUndefined();
  });

  it('never gives a Scope 1 row a second line', () => {
    const { records } = recordsFor([row({
      id: 'r1', scope: 'scope-1', category: 'stationary_combustion',
    })]);
    expect(records).toHaveLength(1);
    expect(records[0].scope2_view).toBeUndefined();
  });
});

describe('a factor the company supplied', () => {
  it('is ignored without a citation, and the row is listed as needing one', () => {
    // The engine refuses an unsourced factor. Sending it anyway would fail the
    // whole inventory over one row saved before the page asked for a source.
    const { records, unmapped } = recordsFor([row({
      id: 'r1', engineActivityKey: undefined, customFactorOverride: 0.012,
    })]);
    expect(records).toHaveLength(0);
    expect(unmapped.map((e) => e.id)).toEqual(['r1']);
  });

  it('answers both columns when nothing published covers the source', () => {
    const { location, market } = viewsOf(row({
      id: 'r1', engineActivityKey: undefined,
      customFactorOverride: 0.012, customFactorSource: 'PPA clause 4',
    }));
    expect(location.supplied_factor).toBe('0.012');
    expect(market.supplied_factor).toBe('0.012');
  });
});

describe('rupee spend against a factor published per US dollar', () => {
  const service: EmissionFactor = {
    id: 'cat1.material.it_services', fuelOrActivity: 'IT / cloud services', scope: 'scope-3',
    category: '', factorValue: 0, unit: 'INR', source: 'fixture',
    publicationYear: 2022, qualityTier: 'Secondary',
  };
  const spend = row({
    id: 's1', scope: 'scope-3', category: 'cat1_purchased_goods', fuelOrSource: 'IT services',
    amount: 825000, unit: 'INR', emissionFactor: service,
    engineActivityKey: 'epa.useeio.fixture', engineRegion: 'US',
  });
  setUnitChoices([{ catalogue_key: 'cat1.material.it_services', unit: 'INR',
    activity_key: 'epa.useeio.fixture', region: 'US', needs_fx: true }]);

  it('is converted at the stated rate, and the row says so', () => {
    const [record] = recordsFor([spend], { rate: 82.5, source: 'RBI reference rate 2022' }).records;
    expect(record.unit).toBe('USD');
    expect(Number(record.value)).toBeCloseTo(10000, 6);
    expect(record.note).toContain('82.5');
    expect(record.note).toContain('RBI reference rate 2022');
  });

  it('is sent as recorded, for the engine to refuse, without a rate and its source', () => {
    expect(recordsFor([spend], { rate: 82.5, source: '' }).records[0].unit).toBe('INR');
    expect(recordsFor([spend]).records[0].unit).toBe('INR');
  });
});
