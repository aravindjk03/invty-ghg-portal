import { ActivityEntry, ScenarioResult, WhatIfScenario } from '../types/ghg';

/**
 * What-if modelling, worked out from the inventory that is actually there.
 *
 * This used to assume that 65% of any company's Scope 1 was diesel, that
 * electrifying the fleet removed a further 18% of Scope 1, and that avoided
 * grid electricity dropped Scope 3 by a tenth of itself. None of those numbers
 * came from the inventory, so the panel showed a reduction a company could not
 * have achieved, from fuel it may not even burn.
 *
 * Every lever now moves only the rows it applies to:
 *
 *  - a diesel reduction moves the rows whose fuel is diesel, and nothing else;
 *  - electrifying the fleet removes what is left of the mobile diesel rows,
 *    because those are the vehicles;
 *  - renewable electricity reduces Scope 2 in proportion, which is what buying
 *    less grid power does.
 *
 * Scope 3 is left alone. Less grid electricity does reduce its upstream
 * fuel-and-energy emissions, but by an amount that depends on the well-to-tank
 * factor for that grid; where no published figure exists the honest answer is
 * to model no change rather than a made-up one. `scope3Modelled: false` says so,
 * and the panel prints it.
 */

export interface ScenarioCoverage {
  /** tCO2e of Scope 1 the diesel lever can act on. */
  dieselTco2e: number;
  /** tCO2e of Scope 1 from diesel-burning vehicles and handling equipment. */
  mobileDieselTco2e: number;
  /** True when the inventory has no diesel at all, so the lever does nothing. */
  noDieselInInventory: boolean;
  /** Scope 3 is never modelled by these levers. */
  scope3Modelled: false;
}

export type ScenarioOutcome = ScenarioResult & { coverage: ScenarioCoverage };

const round1 = (n: number): number => Number(n.toFixed(1));

/** A row's fuel is diesel, judged by the factor it is calculated against. */
export function isDieselRow(entry: ActivityEntry): boolean {
  const key = (entry.engineActivityKey || entry.emissionFactor?.id || '').toLowerCase();
  if (key) return key.includes('diesel');
  // No factor key: fall back to the source name the user picked.
  return /diesel|hsd/i.test(entry.fuelOrSource || '');
}

/** A row is a vehicle or mobile plant rather than a fixed installation. */
export function isMobileRow(entry: ActivityEntry): boolean {
  if (entry.category === 'mobile_combustion') return true;
  const key = (entry.engineActivityKey || entry.emissionFactor?.id || '').toLowerCase();
  return key.startsWith('mobile.');
}

export function simulateScenario(
  scope1Entries: ActivityEntry[],
  scope1Total: number,
  scope2Total: number,
  scope3Total: number,
  scenario: WhatIfScenario
): ScenarioOutcome {
  let dieselTco2e = 0;
  let mobileDieselTco2e = 0;

  for (const entry of scope1Entries) {
    const tco2e = entry.calculatedTco2e;
    if (!Number.isFinite(tco2e) || tco2e <= 0) continue;
    if (!isDieselRow(entry)) continue;
    dieselTco2e += tco2e;
    if (isMobileRow(entry)) mobileDieselTco2e += tco2e;
  }

  // A row's share of the total can only be modelled down to zero, and the
  // totals the engine reports are the ones on screen, so the diesel figure is
  // capped at the Scope 1 total rather than allowed to exceed it.
  dieselTco2e = Math.min(dieselTco2e, Math.max(scope1Total, 0));
  mobileDieselTco2e = Math.min(mobileDieselTco2e, dieselTco2e);

  const dieselCut = dieselTco2e * (Math.max(0, Math.min(100, scenario.dieselReductionPercent)) / 100);

  // Electrifying the fleet removes whatever mobile diesel the reduction above
  // has not already taken out, never more.
  const mobileRemaining = Math.max(0, mobileDieselTco2e - dieselCut * (dieselTco2e > 0 ? mobileDieselTco2e / dieselTco2e : 0));
  const fleetCut = scenario.switchFleetToElectric ? mobileRemaining : 0;

  const scope1New = round1(Math.max(0, scope1Total - dieselCut - fleetCut));
  const scope2New = round1(
    Math.max(0, scope2Total * (1 - Math.max(0, Math.min(100, scenario.renewableElectricityPercent)) / 100))
  );
  const scope3New = round1(Math.max(0, scope3Total));

  const baselineTotal = round1(scope1Total + scope2Total + scope3Total);
  const newTotal = round1(scope1New + scope2New + scope3New);
  const deltaTco2e = round1(baselineTotal - newTotal);
  const deltaPercentage = baselineTotal > 0 ? round1((deltaTco2e / baselineTotal) * 100) : 0;

  return {
    baselineTotal,
    newTotal,
    deltaTco2e,
    deltaPercentage,
    scope1New,
    scope2New,
    scope3New,
    coverage: {
      dieselTco2e: round1(dieselTco2e),
      mobileDieselTco2e: round1(mobileDieselTco2e),
      noDieselInInventory: dieselTco2e === 0,
      scope3Modelled: false,
    },
  };
}
