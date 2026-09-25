/**
 * What is left of the browser's calculator.
 *
 * Emissions arithmetic moved to ghg_core, and its tests moved with it
 * (tests/test_engine.py, tests/test_units.py, tests/test_inventory_service.py).
 * These cover the two helpers that remain here, which describe an inventory
 * rather than compute it. EVERY NUMBER HERE IS A FIXTURE.
 */
import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { ActivityEntry, EmissionFactor } from '../types/ghg';
import { calculateDataQualityGrade, calculateIntensity } from './calculator';

const factor = (value: number, tier: EmissionFactor['qualityTier']): EmissionFactor => ({
  id: 'fixture', fuelOrActivity: 'Fixture', scope: 'scope-1', category: '',
  factorValue: value, unit: 'L', source: 'fixture', publicationYear: 2024, qualityTier: tier,
});

const entry = (over: Partial<ActivityEntry> & { id: string }): ActivityEntry => ({
  facility: 'Plant', scope: 'scope-1', category: 'stationary_combustion',
  fuelOrSource: 'Fixture source', amount: 100, unit: 'L',
  emissionFactor: factor(2.68, 'Primary'), calculatedTco2e: 0.268,
  updatedAt: '2026-01-01T00:00:00.000Z', ...over,
});

describe('calculateIntensity', () => {
  it('divides emissions by the denominator', () => {
    expect(calculateIntensity(1000, 2000).value).toBe(0.5);
  });

  it('refuses to divide by zero or by nothing', () => {
    expect(calculateIntensity(1000, 0).value).toBeNull();
    expect(calculateIntensity(1000, null).value).toBeNull();
    expect(calculateIntensity(1000, undefined).formatted).toBe('—');
  });

  it('accepts a Decimal without losing it to a float', () => {
    expect(calculateIntensity(new Decimal('1000.5'), 2).value).toBe(500.25);
  });
});

describe('calculateDataQualityGrade', () => {
  it('grades an inventory of measured data highly', () => {
    expect(calculateDataQualityGrade([entry({ id: 'a' }), entry({ id: 'b' })])).toBe('A');
  });

  it('counts a row whose factor has not been ingested', () => {
    // It contributes nothing to the total but everything to how good the
    // inventory is, so it must not be skipped.
    const measured = entry({ id: 'a' });
    const unvalued = entry({ id: 'b', emissionFactor: factor(0, 'Primary'), calculatedTco2e: 0 });
    expect(calculateDataQualityGrade([measured])).toBe('A');
    expect(calculateDataQualityGrade([measured, unvalued])).not.toBe('A');
  });

  it('returns a middling grade for an empty inventory rather than a flattering one', () => {
    expect(calculateDataQualityGrade([])).toBe('C');
  });
});
