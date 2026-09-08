export type ConsolidationBoundary = 'Operational control' | 'Financial control' | 'Equity share';

export type IntegratedSteelMethod = 'carbon_balance' | 'fuel_based';

export interface ScopeRoutingContext {
  boundary: ConsolidationBoundary;
  isInsideBoundary: boolean; // Does reporting entity own/control the asset?
  isCaptiveSpvGroup?: boolean; // Indian group-captive SPV (<=26% equity, separate entity)
  steelMethod?: IntegratedSteelMethod;
}

export interface ScopeRoutingDecision {
  targetScope: 'scope-1' | 'scope-2' | 'scope-3' | 'biogenic' | 'memo';
  categoryCode: string; // e.g. "1.1", "2.1", "3.4", "memo"
  categoryName: string;
  isMemo: boolean;
  warnings: string[];
  blockExecution?: boolean;
}

/**
 * Enforces the 7 scope routing traps specified in the INVTY GHG Master Architecture.
 */
export function routeActivityScope(
  activityKey: string,
  context: ScopeRoutingContext
): ScopeRoutingDecision {
  const warnings: string[] = [];

  // Trap 1: "Captive" generation vs Boundary
  // If Indian group-captive SPV or generator is outside operational boundary,
  // it is Scope 2 (purchased electricity), NOT Scope 1 fuel.
  if (context.isCaptiveSpvGroup && activityKey.startsWith('fuel.')) {
    warnings.push(
      'Group-Captive SPV generation asset is outside operational control boundary: Routed to Scope 2 purchased electricity.'
    );
    return {
      targetScope: 'scope-2',
      categoryCode: '2.1',
      categoryName: 'Purchased electricity (Group Captive)',
      isMemo: false,
      warnings,
    };
  }

  // Trap 2: Owned EVs charged at facility -> Scope 2, NOT Scope 1
  if (activityKey === 'elec.ev_charging_onsite' || activityKey === 'mobile.ev_fleet') {
    return {
      targetScope: 'scope-2',
      categoryCode: '2.1',
      categoryName: 'Purchased electricity (Facility EV Charging)',
      isMemo: false,
      warnings: ['Owned EVs have no tailpipe emissions. Their energy consumption is routed to Scope 2.'],
    };
  }

  // Trap 3: Biogenic CO2
  if (
    activityKey === 'memo.biogenic_co2' ||
    activityKey === 'memo.biogenic_co2_scope3' ||
    activityKey.includes('biomass') ||
    activityKey.includes('biogas') ||
    activityKey.includes('biodiesel') ||
    activityKey.includes('ethanol')
  ) {
    if (activityKey.startsWith('memo.biogenic')) {
      return {
        targetScope: 'biogenic',
        categoryCode: 'memo',
        categoryName: 'Biogenic CO₂ memo item',
        isMemo: true,
        warnings: ['Biogenic CO₂ is reported outside of Scope 1, 2, and 3 as an out-of-scope memo item.'],
      };
    }
  }

  // Trap 4: Montreal Protocol gases
  if (activityKey.startsWith('memo.montreal') || activityKey.includes('r22') || activityKey.includes('cfc')) {
    return {
      targetScope: 'memo',
      categoryCode: 'memo',
      categoryName: 'Montreal Protocol ozone-depleting substance',
      isMemo: true,
      warnings: ['Montreal Protocol substances (HCFC-22/CFCs) are reported separately outside Scopes 1-3.'],
    };
  }

  // Trap 6: Integrated Steel Mutually Exclusive Methods
  if (context.steelMethod === 'carbon_balance') {
    const fuelBasedKeys = [
      'fuel.coke.metallurgical',
      'fuel.blast_furnace_gas',
      'fuel.coke_oven_gas',
      'fuel.converter_gas',
    ];
    if (fuelBasedKeys.includes(activityKey)) {
      warnings.push(
        'MUTUAL EXCLUSION VIOLATION: Facility is configured for Carbon Mass Balance (process.iron_steel_bf). Separate coke and recovered process gases must not be entered to prevent double counting.'
      );
      return {
        targetScope: 'scope-1',
        categoryCode: '1.1',
        categoryName: 'Blocked - Double Counting Risk',
        isMemo: false,
        warnings,
        blockExecution: true,
      };
    }
  } else if (context.steelMethod === 'fuel_based') {
    if (activityKey === 'process.iron_steel_bf') {
      warnings.push(
        'MUTUAL EXCLUSION VIOLATION: Facility is configured for Fuel-Based accounting. Carbon mass balance row disabled.'
      );
      return {
        targetScope: 'scope-1',
        categoryCode: '1.3',
        categoryName: 'Blocked - Double Counting Risk',
        isMemo: false,
        warnings,
        blockExecution: true,
      };
    }
  }

  // Trap 7: Leased assets boundary check
  if (activityKey === 'cat8.leased_upstream') {
    if (context.boundary === 'Operational control' && context.isInsideBoundary) {
      warnings.push(
        'DOUBLE COUNT RISK: Leased assets under operational control are already in Scope 1 or 2. Category 8 is only for assets outside consolidation boundary.'
      );
    }
  }

  // Default routing based on activity key prefix
  if (activityKey.startsWith('fuel.') || activityKey.startsWith('flare.') || activityKey.startsWith('combustion.')) {
    return { targetScope: 'scope-1', categoryCode: '1.1', categoryName: 'Stationary combustion', isMemo: false, warnings };
  }
  if (activityKey.startsWith('mobile.')) {
    return { targetScope: 'scope-1', categoryCode: '1.2', categoryName: 'Mobile combustion', isMemo: false, warnings };
  }
  if (activityKey.startsWith('process.')) {
    return { targetScope: 'scope-1', categoryCode: '1.3', categoryName: 'Process emissions', isMemo: false, warnings };
  }
  if (activityKey.startsWith('fugitive.') || activityKey.startsWith('vent.')) {
    return { targetScope: 'scope-1', categoryCode: '1.4', categoryName: 'Fugitive emissions', isMemo: false, warnings };
  }
  if (activityKey.startsWith('agri.') || activityKey.startsWith('land.')) {
    return { targetScope: 'scope-1', categoryCode: '1.5', categoryName: 'Agriculture & Land Use', isMemo: false, warnings };
  }
  if (activityKey.startsWith('elec.') || activityKey.startsWith('steam.') || activityKey.startsWith('heat.') || activityKey.startsWith('cooling.')) {
    return { targetScope: 'scope-2', categoryCode: '2.1', categoryName: 'Purchased energy', isMemo: false, warnings };
  }
  if (activityKey.startsWith('cat')) {
    return { targetScope: 'scope-3', categoryCode: '3', categoryName: 'Scope 3 Value Chain', isMemo: false, warnings };
  }
  if (activityKey.startsWith('memo.')) {
    return { targetScope: 'memo', categoryCode: 'memo', categoryName: 'Memo Item', isMemo: true, warnings };
  }

  return { targetScope: 'scope-1', categoryCode: '1.1', categoryName: 'Direct emissions', isMemo: false, warnings };
}
