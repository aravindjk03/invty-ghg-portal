import { WhatIfScenario } from '../types/ghg.types';

export interface ScenarioResult {
  baselineTotal: number;
  newTotal: number;
  deltaTco2e: number;
  deltaPercentage: number;
  scope1New: number;
  scope2New: number;
  scope3New: number;
}

export class ScenarioService {
  public static simulateScenario(
    baselineScope1: number,
    baselineScope2: number,
    baselineScope3: number,
    scenario: WhatIfScenario
  ): ScenarioResult {
    // Diesel is approx 65% of Scope 1 stationary/mobile combustion in this facility
    const dieselComponentScope1 = baselineScope1 * 0.65;
    const nonDieselScope1 = baselineScope1 - dieselComponentScope1;

    let reducedDieselScope1 = dieselComponentScope1 * (1 - (scenario.dieselReductionPercent || 0) / 100);

    // Fleet electrification removes mobile fleet (est. 18% of Scope 1)
    if (scenario.switchFleetToElectric) {
      reducedDieselScope1 = Math.max(0, reducedDieselScope1 - (baselineScope1 * 0.18));
    }

    const scope1New = Number((nonDieselScope1 + reducedDieselScope1).toFixed(1));

    // Renewable PPA directly displaces grid electricity in Scope 2
    const reFactor = 1 - (scenario.renewableElectricityPercent || 0) / 100;
    const scope2New = Number((baselineScope2 * reFactor).toFixed(1));

    // Scope 3 remains relatively stable, slightly reduced from T&D losses
    const scope3New = Number((baselineScope3 - (baselineScope2 * (scenario.renewableElectricityPercent / 100) * 0.1)).toFixed(1));

    const baselineTotal = Number((baselineScope1 + baselineScope2 + baselineScope3).toFixed(1));
    const newTotal = Number((scope1New + scope2New + scope3New).toFixed(1));
    const deltaTco2e = Number((baselineTotal - newTotal).toFixed(1));
    const deltaPercentage = baselineTotal > 0 ? Number(((deltaTco2e / baselineTotal) * 100).toFixed(1)) : 0;

    return {
      baselineTotal,
      newTotal,
      deltaTco2e,
      deltaPercentage,
      scope1New,
      scope2New,
      scope3New,
    };
  }
}
