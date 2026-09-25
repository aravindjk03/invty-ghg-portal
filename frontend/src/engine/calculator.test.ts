/**
 * Tests for the inventory arithmetic.
 *
 * Every case here is a mistake a real inventory makes: a quantity recorded in a
 * unit the factor is not published for, a factor that has not been ingested, a
 * renamed row, or Scope 2 counted twice. EVERY NUMBER IN THIS FILE IS A FIXTURE.
 */
import { describe, expect, it } from 'vitest';
import { ActivityEntry, EmissionFactor } from '../types/ghg';
import { calculateDataQualityGrade, calculateRowEmissions, summarizeInventory } from './calculator';

const factor = (
  id: string, unit: string, value: number, tier: EmissionFactor['qualityTier'] = 'Secondary',
): EmissionFactor => ({
  id, fuelOrActivity: id, scope: 'scope-1', category: '', factorValue: value, unit,
  source: 'fixture', publicationYear: 2024, qualityTier: tier,
});

const entry = (over: Partial<ActivityEntry> & { id: string }): ActivityEntry => ({
  facility: 'Plant', scope: 'scope-1', category: 'stationary_combustion',
  fuelOrSource: 'Fixture source', amount: 0, unit: 'L',
  emissionFactor: factor('fixture', 'L', 1), calculatedTco2e: 0,
  updatedAt: '2026-01-01T00:00:00.000Z', ...over,
});

describe('calculateRowEmissions', () => {
  it('multiplies quantity by factor and returns tonnes', () => {
    // 1,000 L x 2.68 kg/L = 2,680 kg = 2.68 t
    const result = calculateRowEmissions(1000, 2.68, 'Diesel', 'L', 'L');
    expect(result.calculatedTco2e).toBe(2.68);
  });

  it('converts the quantity into the unit the factor is published per', () => {
    // A coal factor published per tonne, with the quantity recorded in kg.
    // 5,000 kg = 5 t; 5 t x 2,670 kg/t = 13,350 kg = 13.35 t.
    const result = calculateRowEmissions(5000, 2670, 'Coal — anthracite', 'kg', 't');
    expect(result.calculatedTco2e).toBe(13.35);
    expect(result.warning).toBeUndefined();
  });

  it('does not multiply mismatched units together', () => {
    // Without conversion this would report 13,350 t instead of 13.35 t.
    const wrong = 5000 * 2670 / 1000;
    const result = calculateRowEmissions(5000, 2670, 'Coal — anthracite', 'kg', 't');
    expect(result.calculatedTco2e).not.toBe(wrong);
  });

  it('scales energy units', () => {
    // 2 MWh = 2,000 kWh; x 0.716 kg/kWh = 1,432 kg = 1.432 t
    const result = calculateRowEmissions(2, 0.716, 'Grid electricity', 'MWh', 'kWh');
    expect(result.calculatedTco2e).toBeCloseTo(1.43, 2);
  });

  it('refuses mass-to-volume without a known fuel density, and says why', () => {
    const result = calculateRowEmissions(100, 3.1, 'Unknown solvent', 'kg', 'L');
    expect(result.calculatedTco2e).toBe(0);
    expect(result.warning).toMatch(/density/i);
  });

  it('converts mass to volume when the fuel density is known', () => {
    const result = calculateRowEmissions(100, 2.68, 'Diesel', 'kg', 'L');
    expect(result.calculatedTco2e).toBeGreaterThan(0);
    expect(result.warning).toBeUndefined();
  });

  it('returns zero for an empty quantity', () => {
    expect(calculateRowEmissions('', 2.68, 'Diesel', 'L', 'L').calculatedTco2e).toBe(0);
    expect(calculateRowEmissions(null, 2.68, 'Diesel', 'L', 'L').calculatedTco2e).toBe(0);
  });

  it('treats captured CO2 as a deduction', () => {
    const result = calculateRowEmissions(1000, 1, 'CO2_captured', 't', 't');
    expect(result.calculatedTco2e).toBeLessThan(0);
  });
});

describe('calculateDataQualityGrade', () => {
  it('counts a row whose factor has not been ingested', () => {
    // Both rows are Primary tier, but one has no published value: the grade must
    // not ignore it just because it computes to zero.
    const withFactor = entry({ id: 'a', emissionFactor: factor('a', 'L', 2.68, 'Primary'), calculatedTco2e: 2.68 });
    const withoutFactor = entry({ id: 'b', emissionFactor: factor('b', 't', 0, 'Primary'), calculatedTco2e: 0 });
    expect(calculateDataQualityGrade([withFactor])).toBe('A');
    expect(calculateDataQualityGrade([withFactor, withoutFactor])).not.toBe('A');
  });
});

describe('summarizeInventory', () => {
  const electricity = (id: string, key: string, tco2e: number): ActivityEntry => entry({
    id, scope: 'scope-2', category: 'purchased_electricity', fuelOrSource: 'Electricity',
    unit: 'kWh', emissionFactor: factor(key, 'kWh', 0.716), calculatedTco2e: tco2e,
  });

  it('keeps location and market totals apart and counts only one in the total', () => {
    const summary = summarizeInventory(
      [], [electricity('e1', 'elec.grid.location', 400), electricity('e2', 'elec.ppa_renewable', 50)], []);
    expect(summary.scope2Location).toBe(400);
    expect(summary.scope2Market).toBe(50);
    expect(summary.totalEmissions).toBeLessThan(400 + 50 + summary.scope3);
  });

  it('classifies by the catalogue key, not by a name the user can edit', () => {
    const renamed = { ...electricity('e3', 'elec.ppa_renewable', 50), fuelOrSource: 'Our clean power' };
    const summary = summarizeInventory([], [renamed], []);
    expect(summary.scope2Market).toBe(50);
    expect(summary.scope2Location).toBe(0);
  });

  it('does not let a row named "market" move itself out of the location total', () => {
    const misnamed = { ...electricity('e4', 'elec.grid.location', 400), fuelOrSource: 'Market feeder 3' };
    const summary = summarizeInventory([], [misnamed], []);
    expect(summary.scope2Location).toBe(400);
  });
});
