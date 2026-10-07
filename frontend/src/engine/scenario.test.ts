import { describe, it, expect } from 'vitest';
import { simulateScenario, isDieselRow, isMobileRow } from './scenario';
import { ActivityEntry, WhatIfScenario } from '../types/ghg';

const row = (over: Partial<ActivityEntry>): ActivityEntry => ({
  id: 'r',
  facility: 'Plant',
  scope: 'scope-1',
  category: 'stationary_combustion',
  fuelOrSource: 'Natural gas',
  amount: 1,
  unit: 'm3',
  emissionFactor: { id: 'fuel.natural_gas' } as ActivityEntry['emissionFactor'],
  calculatedTco2e: 100,
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

const noChange: WhatIfScenario = {
  renewableElectricityPercent: 0,
  dieselReductionPercent: 0,
  switchFleetToElectric: false,
};

describe('row classification', () => {
  it('reads the fuel off the factor the row is calculated against', () => {
    expect(isDieselRow(row({ engineActivityKey: 'fuel.diesel.stationary' }))).toBe(true);
    expect(isDieselRow(row({ engineActivityKey: 'fuel.natural_gas' }))).toBe(false);
  });

  it('falls back to the source name when no factor is attached', () => {
    expect(isDieselRow(row({
      emissionFactor: undefined as unknown as ActivityEntry['emissionFactor'],
      fuelOrSource: 'Diesel / HSD — stationary',
    }))).toBe(true);
  });

  it('separates vehicles from fixed installations', () => {
    expect(isMobileRow(row({ category: 'mobile_combustion' }))).toBe(true);
    expect(isMobileRow(row({ engineActivityKey: 'mobile.diesel' }))).toBe(true);
    expect(isMobileRow(row({ engineActivityKey: 'fuel.diesel.stationary' }))).toBe(false);
  });
});

describe('what-if modelling', () => {
  it('leaves every total alone when no lever is pulled', () => {
    const out = simulateScenario([row({})], 100, 400, 900, noChange);
    expect(out.scope1New).toBe(100);
    expect(out.scope2New).toBe(400);
    expect(out.scope3New).toBe(900);
    expect(out.deltaTco2e).toBe(0);
  });

  it('cuts only the diesel rows, not a share of all Scope 1', () => {
    // 100 t of diesel, 300 t of gas. A 50% diesel cut is 50 t, not 50% of 400.
    const rows = [
      row({ id: 'd', engineActivityKey: 'fuel.diesel.stationary', calculatedTco2e: 100 }),
      row({ id: 'g', engineActivityKey: 'fuel.natural_gas', calculatedTco2e: 300 }),
    ];
    const out = simulateScenario(rows, 400, 0, 0, { ...noChange, dieselReductionPercent: 50 });
    expect(out.scope1New).toBe(350);
    expect(out.coverage.dieselTco2e).toBe(100);
  });

  it('changes nothing on the diesel lever when the inventory burns no diesel', () => {
    const rows = [row({ engineActivityKey: 'fuel.natural_gas', calculatedTco2e: 400 })];
    const out = simulateScenario(rows, 400, 0, 0, { ...noChange, dieselReductionPercent: 50 });
    expect(out.scope1New).toBe(400);
    expect(out.coverage.noDieselInInventory).toBe(true);
  });

  it('electrifying the fleet removes the mobile diesel rows only', () => {
    const rows = [
      row({ id: 'm', category: 'mobile_combustion', engineActivityKey: 'mobile.diesel', calculatedTco2e: 60 }),
      row({ id: 's', engineActivityKey: 'fuel.diesel.stationary', calculatedTco2e: 40 }),
    ];
    const out = simulateScenario(rows, 100, 0, 0, { ...noChange, switchFleetToElectric: true });
    expect(out.scope1New).toBe(40);
    expect(out.coverage.mobileDieselTco2e).toBe(60);
  });

  it('does not double-count the fleet when a diesel cut already covered it', () => {
    const rows = [
      row({ id: 'm', category: 'mobile_combustion', engineActivityKey: 'mobile.diesel', calculatedTco2e: 100 }),
    ];
    // A 100% diesel cut already takes the fleet to zero; electrifying it cannot
    // take Scope 1 below zero.
    const out = simulateScenario(rows, 100, 0, 0, {
      ...noChange,
      dieselReductionPercent: 100,
      switchFleetToElectric: true,
    });
    expect(out.scope1New).toBe(0);
  });

  it('reduces Scope 2 in proportion to the renewable share', () => {
    const out = simulateScenario([], 0, 1000, 0, { ...noChange, renewableElectricityPercent: 40 });
    expect(out.scope2New).toBe(600);
  });

  it('never models a Scope 3 change it cannot source', () => {
    const out = simulateScenario([], 0, 1000, 500, { ...noChange, renewableElectricityPercent: 100 });
    expect(out.scope3New).toBe(500);
    expect(out.coverage.scope3Modelled).toBe(false);
  });

  it('reports a percentage against the real baseline', () => {
    const rows = [row({ engineActivityKey: 'mobile.diesel', category: 'mobile_combustion', calculatedTco2e: 100 })];
    const out = simulateScenario(rows, 100, 100, 0, {
      ...noChange,
      switchFleetToElectric: true,
      renewableElectricityPercent: 50,
    });
    // 100 of diesel gone, 50 of electricity gone, out of 200.
    expect(out.newTotal).toBe(50);
    expect(out.deltaTco2e).toBe(150);
    expect(out.deltaPercentage).toBe(75);
  });

  it('holds at zero rather than going negative', () => {
    const out = simulateScenario([], 0, 0, 0, {
      renewableElectricityPercent: 100,
      dieselReductionPercent: 50,
      switchFleetToElectric: true,
    });
    expect(out.newTotal).toBe(0);
    expect(out.deltaPercentage).toBe(0);
  });
});
