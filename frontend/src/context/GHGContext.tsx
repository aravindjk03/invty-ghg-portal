import React, { createContext, useContext, useState, useMemo, useEffect, useCallback } from 'react';
import {
  ActivityEntry,
  EmissionFactor,
  ScopeSummary,
  WhatIfScenario,
  ScenarioResult,
  ToastMessage,
} from '../types/ghg';
import { DEFAULT_FACTORS, ghgService } from '../services/ghgService';
import { summarizeInventory, calculateRowEmissions } from '../engine/calculator';
import { ConsolidationBoundary, IntegratedSteelMethod } from '../engine/scopeRouter';
import { getDefaultFactorForCategory } from '../engine/factorCatalogue';

interface GHGContextType {
  /** Live emission-factor register (API when reachable, bundled snapshot otherwise). */
  factors: EmissionFactor[];
  factorsSource: 'api' | 'bundled';
  companyName: string;
  reportingPeriod: string;
  boundaryApproach: ConsolidationBoundary;
  steelMethod: IntegratedSteelMethod;
  setCompanyName: (name: string) => void;
  setReportingPeriod: (period: string) => void;
  setBoundaryApproach: (boundary: ConsolidationBoundary) => void;
  setSteelMethod: (method: IntegratedSteelMethod) => void;
  scope1Entries: ActivityEntry[];
  scope2Entries: ActivityEntry[];
  scope3Entries: ActivityEntry[];
  summary: ScopeSummary;
  scenario: WhatIfScenario;
  scenarioResult: ScenarioResult;
  toasts: ToastMessage[];
  addToast: (type: ToastMessage['type'], message: string) => void;
  dismissToast: (id: string) => void;
  updateRow: (scope: 'scope-1' | 'scope-2' | 'scope-3', id: string, updates: Partial<ActivityEntry>) => void;
  addRow: (scope: 'scope-1' | 'scope-2' | 'scope-3', category: string) => void;
  deleteRow: (scope: 'scope-1' | 'scope-2' | 'scope-3', id: string) => void;
  duplicateRow: (scope: 'scope-1' | 'scope-2' | 'scope-3', id: string) => void;
  addBatchEntries: (scope: 'scope-1' | 'scope-2' | 'scope-3', entries: Partial<ActivityEntry>[]) => void;
  updateScenario: (scenario: Partial<WhatIfScenario>) => void;
  recalculateAll: () => void;
  resetToDefaults: () => void;
  saveToStorage: () => void;
}

const STORAGE_KEY = 'INVTY_GHG_INVENTORY_DATA_V2';

// Baseline Scope 1 Entries
const INITIAL_SCOPE1_ENTRIES: ActivityEntry[] = [
  {
    id: 's1-row-1',
    facility: 'Plant 1 - Rolling Mill',
    scope: 'scope-1',
    category: 'stationary_combustion',
    fuelOrSource: 'Diesel / HSD — stationary (DG set, boiler)',
    amount: 45000,
    unit: 'L',
    emissionFactor: DEFAULT_FACTORS.find((f) => f.id === 'fuel.diesel.stationary') || DEFAULT_FACTORS[0],
    calculatedTco2e: 120.89,
    warning: 'This is 8× typical diesel use for a plant this size — please check the unit.',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 's1-row-2',
    facility: 'Plant 1 - Re-heating Furnace',
    scope: 'scope-1',
    category: 'stationary_combustion',
    fuelOrSource: 'Natural gas',
    amount: 18500,
    unit: 'm3',
    emissionFactor: DEFAULT_FACTORS.find((f) => f.id === 'fuel.natural_gas') || DEFAULT_FACTORS[1],
    calculatedTco2e: 37.52,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 's1-row-3',
    facility: 'Billet Cutting Station',
    scope: 'scope-1',
    category: 'stationary_combustion',
    fuelOrSource: 'LPG — stationary',
    amount: 2400,
    unit: 'kg',
    emissionFactor: DEFAULT_FACTORS.find((f) => f.id === 'fuel.lpg.stationary') || DEFAULT_FACTORS[2],
    calculatedTco2e: 7.06,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 's1-row-4',
    facility: 'Logistics Fleet',
    scope: 'scope-1',
    category: 'mobile_combustion',
    fuelOrSource: 'Diesel — owned/leased vehicles',
    amount: 9200,
    unit: 'L',
    emissionFactor: DEFAULT_FACTORS.find((f) => f.id === 'mobile.diesel') || DEFAULT_FACTORS[0],
    calculatedTco2e: 24.72,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 's1-row-5',
    facility: 'Scrap Yard',
    scope: 'scope-1',
    category: 'mobile_combustion',
    fuelOrSource: 'Forklift / material handling — diesel',
    amount: 3100,
    unit: 'L',
    emissionFactor: DEFAULT_FACTORS.find((f) => f.id === 'mobile.forklift_diesel') || DEFAULT_FACTORS[0],
    calculatedTco2e: 8.33,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 's1-row-6',
    facility: 'EAF Meltshop',
    scope: 'scope-1',
    category: 'process_emissions',
    fuelOrSource: 'Limestone / dolomite used as flux',
    amount: 320,
    unit: 't',
    emissionFactor: DEFAULT_FACTORS.find((f) => f.id === 'process.limestone_flux') || DEFAULT_FACTORS[5],
    calculatedTco2e: 140.8,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 's1-row-7',
    facility: 'Central Control Instrumentation',
    scope: 'scope-1',
    category: 'fugitive_emissions',
    fuelOrSource: 'R-134a (HFC-134a)',
    amount: 25,
    unit: 'kg',
    emissionFactor: DEFAULT_FACTORS.find((f) => f.id === 'fugitive.refrigerant.r134a') || DEFAULT_FACTORS[7],
    calculatedTco2e: 35.75,
    updatedAt: new Date().toISOString(),
  },
];

// Baseline Scope 2 Entries (Purchased Electricity & Steam)
const INITIAL_SCOPE2_ENTRIES: ActivityEntry[] = [
  {
    id: 's2-row-1',
    facility: 'Main Plant — Jamshedpur',
    scope: 'scope-2',
    category: 'purchased_electricity',
    fuelOrSource: 'Grid electricity — location-based',
    amount: 576000,
    unit: 'kWh',
    emissionFactor: DEFAULT_FACTORS.find((f) => f.id === 'elec.grid.location') || DEFAULT_FACTORS[10],
    calculatedTco2e: 412.42,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 's2-row-2',
    facility: 'Main Plant — Captive Substation',
    scope: 'scope-2',
    category: 'market_instruments',
    fuelOrSource: 'Electricity — green tariff',
    amount: 220000,
    unit: 'kWh',
    emissionFactor: DEFAULT_FACTORS.find((f) => f.id === 'elec.green_tariff') || DEFAULT_FACTORS[10],
    calculatedTco2e: 0.0,
    notes: 'Green Tariff power purchase with RECs retained',
    updatedAt: new Date().toISOString(),
  },
];

// Baseline Scope 3 Entries (Purchased Goods, Business Travel, Logistics)
const INITIAL_SCOPE3_ENTRIES: ActivityEntry[] = [
  {
    id: 's3-row-1',
    facility: 'Supply Chain — Inbound Sourcing',
    scope: 'scope-3',
    category: 'cat1_purchased_goods',
    fuelOrSource: 'Steel (crude, rebar, HR/CR coil)',
    amount: 450,
    unit: 't',
    emissionFactor: DEFAULT_FACTORS.find((f) => f.id === 'cat1.material.steel') || DEFAULT_FACTORS[12],
    calculatedTco2e: 810.0,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 's3-row-2',
    facility: 'Inbound Raw Material Logistics',
    scope: 'scope-3',
    category: 'cat4_upstream_transport',
    fuelOrSource: 'Road freight — HGV by size/load',
    amount: 1250000,
    unit: 't.km',
    emissionFactor: DEFAULT_FACTORS.find((f) => f.id === 'cat4.road_hgv') || DEFAULT_FACTORS[14],
    calculatedTco2e: 143.75,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 's3-row-3',
    facility: 'Corporate Headquarters',
    scope: 'scope-3',
    category: 'cat6_business_travel',
    fuelOrSource: 'Air — domestic, economy',
    amount: 142000,
    unit: 'km',
    emissionFactor: DEFAULT_FACTORS.find((f) => f.id === 'cat6.air_domestic_economy') || DEFAULT_FACTORS[16],
    calculatedTco2e: 20.59,
    updatedAt: new Date().toISOString(),
  },
];

const GHGContext = createContext<GHGContextType | undefined>(undefined);

export const GHGProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [companyName, setCompanyName] = useState<string>('Acme Steel Pvt Ltd');
  const [reportingPeriod, setReportingPeriod] = useState<string>('FY 2025–26');
  const [boundaryApproach, setBoundaryApproach] = useState<ConsolidationBoundary>('Operational control');
  const [steelMethod, setSteelMethod] = useState<IntegratedSteelMethod>('fuel_based');

  const [scope1Entries, setScope1Entries] = useState<ActivityEntry[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_S1`);
      return saved ? JSON.parse(saved) : INITIAL_SCOPE1_ENTRIES;
    } catch {
      return INITIAL_SCOPE1_ENTRIES;
    }
  });

  const [scope2Entries, setScope2Entries] = useState<ActivityEntry[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_S2`);
      return saved ? JSON.parse(saved) : INITIAL_SCOPE2_ENTRIES;
    } catch {
      return INITIAL_SCOPE2_ENTRIES;
    }
  });

  const [scope3Entries, setScope3Entries] = useState<ActivityEntry[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_S3`);
      return saved ? JSON.parse(saved) : INITIAL_SCOPE3_ENTRIES;
    } catch {
      return INITIAL_SCOPE3_ENTRIES;
    }
  });

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Emission factors come from the API so the server stays the register of
  // record; the bundled catalogue seeds the first paint and covers offline use.
  const [factors, setFactors] = useState<EmissionFactor[]>(DEFAULT_FACTORS);
  const [factorsSource, setFactorsSource] = useState<'api' | 'bundled'>('bundled');

  useEffect(() => {
    let cancelled = false;
    ghgService
      .getFactors()
      .then((fetched) => {
        if (cancelled || fetched === DEFAULT_FACTORS) return;
        setFactors(fetched);
        setFactorsSource('api');
      })
      .catch(() => {
        /* getFactors already falls back to the bundled catalogue. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const addToast = useCallback((type: ToastMessage['type'], message: string, duration = 4000) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, type, message, duration }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Save to localStorage automatically on entry state changes
  useEffect(() => {
    try {
      localStorage.setItem(`${STORAGE_KEY}_S1`, JSON.stringify(scope1Entries));
      localStorage.setItem(`${STORAGE_KEY}_S2`, JSON.stringify(scope2Entries));
      localStorage.setItem(`${STORAGE_KEY}_S3`, JSON.stringify(scope3Entries));
    } catch (e) {
      console.warn('Failed to save GHG data to localStorage:', e);
    }
  }, [scope1Entries, scope2Entries, scope3Entries]);

  // Scenario Simulator State
  const [scenario, setScenario] = useState<WhatIfScenario>({
    renewableElectricityPercent: 25,
    dieselReductionPercent: 15,
    switchFleetToElectric: false,
  });

  // Seeded flat so the first paint shows no reduction rather than stale
  // hardcoded figures that contradict the computed inventory. The effect below
  // replaces this as soon as the real summary is available.
  const [scenarioResult, setScenarioResult] = useState<ScenarioResult>({
    baselineTotal: 0,
    newTotal: 0,
    deltaTco2e: 0,
    deltaPercentage: 0,
    scope1New: 0,
    scope2New: 0,
    scope3New: 0,
  });

  // Bug Guard #6: Compute summary via useMemo from active entries (never store derived total in useState)
  const summary = useMemo<ScopeSummary>(() => {
    return summarizeInventory(scope1Entries, scope2Entries, scope3Entries, 'location');
  }, [scope1Entries, scope2Entries, scope3Entries]);

  // Live Scenario updates
  useEffect(() => {
    let cancelled = false;
    ghgService
      .simulateScenario(summary.scope1, summary.scope2Location, summary.scope3, scenario)
      .then((res) => {
        if (!cancelled) setScenarioResult(res);
      })
      .catch((err) => {
        console.warn('[GHG] Scenario simulation failed:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [scenario, summary.scope1, summary.scope2Location, summary.scope3]);

  // Mutation handlers with Bug Guard #14 (immutable reference returns)
  const updateRow = useCallback(
    (scope: 'scope-1' | 'scope-2' | 'scope-3', id: string, updates: Partial<ActivityEntry>) => {
      const updater = (prev: ActivityEntry[]) =>
        prev.map((row) => {
          if (row.id !== id) return row;
          const merged = { ...row, ...updates, updatedAt: new Date().toISOString() };
          const calc = calculateRowEmissions(
            merged.amount,
            merged.emissionFactor.factorValue,
            merged.fuelOrSource,
            merged.unit
          );
          merged.calculatedTco2e = calc.calculatedTco2e;
          merged.warning = calc.warning;
          return merged;
        });

      if (scope === 'scope-1') setScope1Entries(updater);
      else if (scope === 'scope-2') setScope2Entries(updater);
      else setScope3Entries(updater);
    },
    []
  );

  const addRow = useCallback(
    (scope: 'scope-1' | 'scope-2' | 'scope-3', category: string) => {
      // Resolve through the shared catalogue so a new row always opens on a
      // factor that actually belongs to the category it was added under.
      const factor = getDefaultFactorForCategory(category, scope);

      const defaultAmount = factor.unit.toLowerCase() === 'kwh' ? 10000 : 100;
      const calc = calculateRowEmissions(defaultAmount, factor.factorValue, factor.fuelOrActivity, factor.unit);

      const newRow: ActivityEntry = {
        id: `${scope}-row-${Date.now()}`,
        facility: 'Main Plant Facility',
        scope,
        category,
        fuelOrSource: factor.fuelOrActivity,
        amount: defaultAmount,
        unit: factor.unit,
        emissionFactor: factor,
        calculatedTco2e: calc.calculatedTco2e,
        warning: calc.warning,
        updatedAt: new Date().toISOString(),
      };

      if (scope === 'scope-1') setScope1Entries((prev) => [...prev, newRow]);
      else if (scope === 'scope-2') setScope2Entries((prev) => [...prev, newRow]);
      else setScope3Entries((prev) => [...prev, newRow]);

      addToast('info', `Added new row in ${category.replace(/_/g, ' ')}`);
    },
    [addToast]
  );

  const deleteRow = useCallback(
    (scope: 'scope-1' | 'scope-2' | 'scope-3', id: string) => {
      if (scope === 'scope-1') setScope1Entries((prev) => prev.filter((r) => r.id !== id));
      else if (scope === 'scope-2') setScope2Entries((prev) => prev.filter((r) => r.id !== id));
      else setScope3Entries((prev) => prev.filter((r) => r.id !== id));
      addToast('warning', 'Row deleted');
    },
    [addToast]
  );

  const duplicateRow = useCallback(
    (scope: 'scope-1' | 'scope-2' | 'scope-3', id: string) => {
      const findAndDup = (prev: ActivityEntry[]) => {
        const item = prev.find((r) => r.id === id);
        if (!item) return prev;
        const duplicated: ActivityEntry = {
          ...item,
          id: `${scope}-dup-${Date.now()}`,
          facility: `${item.facility} (Copy)`,
          updatedAt: new Date().toISOString(),
        };
        return [...prev, duplicated];
      };

      if (scope === 'scope-1') setScope1Entries(findAndDup);
      else if (scope === 'scope-2') setScope2Entries(findAndDup);
      else setScope3Entries(findAndDup);

      addToast('success', 'Entry duplicated');
    },
    [addToast]
  );

  const addBatchEntries = useCallback(
    (scope: 'scope-1' | 'scope-2' | 'scope-3', entries: Partial<ActivityEntry>[]) => {
      const mapped = entries.map((e, idx) => {
        const factor = e.emissionFactor || DEFAULT_FACTORS[0];
        const amount = e.amount || 0;
        const calc = calculateRowEmissions(amount, factor.factorValue, e.fuelOrSource || '', e.unit || '');
        return {
          id: `${scope}-import-${Date.now()}-${idx}`,
          facility: e.facility || 'Main Plant Facility',
          scope,
          category: e.category || (scope === 'scope-1' ? 'stationary_combustion' : 'purchased_electricity'),
          fuelOrSource: e.fuelOrSource || factor.fuelOrActivity,
          amount,
          unit: e.unit || factor.unit,
          emissionFactor: factor,
          calculatedTco2e: calc.calculatedTco2e,
          warning: calc.warning,
          updatedAt: new Date().toISOString(),
        } as ActivityEntry;
      });

      if (scope === 'scope-1') setScope1Entries((prev) => [...prev, ...mapped]);
      else if (scope === 'scope-2') setScope2Entries((prev) => [...prev, ...mapped]);
      else setScope3Entries((prev) => [...prev, ...mapped]);

      addToast('success', `Imported ${mapped.length} rows successfully`);
    },
    [addToast]
  );

  const updateScenario = useCallback((updates: Partial<WhatIfScenario>) => {
    setScenario((prev) => ({ ...prev, ...updates }));
  }, []);

  const recalculateAll = useCallback(() => {
    const recalc = (list: ActivityEntry[]) =>
      list.map((row) => {
        const calc = calculateRowEmissions(
          row.amount,
          row.emissionFactor.factorValue,
          row.fuelOrSource,
          row.unit
        );
        return {
          ...row,
          calculatedTco2e: calc.calculatedTco2e,
          warning: calc.warning,
          updatedAt: new Date().toISOString(),
        };
      });

    setScope1Entries(recalc);
    setScope2Entries(recalc);
    setScope3Entries(recalc);
    addToast('info', 'Recalculated all emissions with latest factors');
  }, [addToast]);

  const resetToDefaults = useCallback(() => {
    setScope1Entries(INITIAL_SCOPE1_ENTRIES);
    setScope2Entries(INITIAL_SCOPE2_ENTRIES);
    setScope3Entries(INITIAL_SCOPE3_ENTRIES);
    localStorage.removeItem(`${STORAGE_KEY}_S1`);
    localStorage.removeItem(`${STORAGE_KEY}_S2`);
    localStorage.removeItem(`${STORAGE_KEY}_S3`);
    addToast('warning', 'Reset all inventory to baseline sample values');
  }, [addToast]);

  const saveToStorage = useCallback(() => {
    try {
      localStorage.setItem(`${STORAGE_KEY}_S1`, JSON.stringify(scope1Entries));
      localStorage.setItem(`${STORAGE_KEY}_S2`, JSON.stringify(scope2Entries));
      localStorage.setItem(`${STORAGE_KEY}_S3`, JSON.stringify(scope3Entries));
      addToast('success', 'Draft inventory saved successfully to local storage');
    } catch {
      addToast('error', 'Failed to save inventory');
    }
  }, [scope1Entries, scope2Entries, scope3Entries, addToast]);

  return (
    <GHGContext.Provider
      value={{
        factors,
        factorsSource,
        companyName,
        reportingPeriod,
        boundaryApproach,
        steelMethod,
        setCompanyName,
        setReportingPeriod,
        setBoundaryApproach,
        setSteelMethod,
        scope1Entries,
        scope2Entries,
        scope3Entries,
        summary,
        scenario,
        scenarioResult,
        toasts,
        addToast,
        dismissToast,
        updateRow,
        addRow,
        deleteRow,
        duplicateRow,
        addBatchEntries,
        updateScenario,
        recalculateAll,
        resetToDefaults,
        saveToStorage,
      }}
    >
      {children}
    </GHGContext.Provider>
  );
};

export const useGHG = () => {
  const context = useContext(GHGContext);
  if (!context) {
    throw new Error('useGHG must be used within a GHGProvider');
  }
  return context;
};
