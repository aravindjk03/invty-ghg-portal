import React, { createContext, useContext, useState, useMemo, useEffect, useCallback } from 'react';
import { ActivityEntry, ScopeSummary, WhatIfScenario, ScenarioResult, ToastMessage } from '../types/ghg';
import { DEFAULT_FACTORS, ghgService } from '../services/ghgService';
import { calculateDataQualityGrade } from '../engine/calculator';
import { factorsFor, isVerified } from '../data/factorCatalogue';
import { mappingFor } from '../services/catalogueMap';
import { useCatalogueMap } from '../services/useCatalogueMap';
import { useEngineInventory } from '../report/useEngineInventory';
import { useMethodResults } from '../report/useMethodResults';
import { MethodEntry, MethodKey, MethodResult, emptyInput } from '../types/methods';
import { GwpSetName } from '../types/inventory';
import { ConsolidationBoundary, IntegratedSteelMethod } from '../engine/scopeRouter';
import { User, authService } from '../services/authService';

interface GHGContextType {
  companyName: string;
  reportingPeriod: string;
  boundaryApproach: ConsolidationBoundary;
  steelMethod: IntegratedSteelMethod;
  setCompanyName: (name: string) => void;
  setReportingPeriod: (period: string) => void;
  setBoundaryApproach: (boundary: ConsolidationBoundary) => void;
  setSteelMethod: (method: IntegratedSteelMethod) => void;
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  authLoading: boolean;
  logout: () => Promise<void>;
  scope1Entries: ActivityEntry[];
  scope2Entries: ActivityEntry[];
  scope3Entries: ActivityEntry[];
  /** The IPCC sources that are equations rather than a factor per unit. */
  methodEntries: MethodEntry[];
  /** What the engine made of each one, keyed by entry id. */
  methodResults: Map<string, MethodResult>;
  methodErrors: Map<string, string>;
  methodsLoading: boolean;
  addMethodEntry: (method: MethodKey, label?: string) => string;
  updateMethodEntry: (id: string, updates: Partial<MethodEntry>) => void;
  deleteMethodEntry: (id: string) => void;
  summary: ScopeSummary;
  /** Which IPCC basis every figure is calculated under. */
  gwpSet: GwpSetName;
  setGwpSet: (set: GwpSetName) => void;
  /** How the current figures were produced, and what could not be produced. */
  engineStatus: {
    state: 'calculated' | 'calculating' | 'unavailable' | 'nothing_mapped';
    message?: string;
    runId?: string;
    engineVersion?: string;
    unmappedCount: number;
    excludedCount: number;
  };
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
    engineActivityKey: 'desnz.2025.1_101_1011_8',
    engineRegion: 'UK',
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
    engineActivityKey: 'desnz.2025.1_100_1004_1',
    engineRegion: 'UK',
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
    engineActivityKey: 'desnz.2025.1_100_1003_15',
    engineRegion: 'UK',
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
    engineActivityKey: 'desnz.2025.1_101_1011_8',
    engineRegion: 'UK',
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
    engineActivityKey: 'desnz.2025.1_101_1011_8',
    engineRegion: 'UK',
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
    engineActivityKey: 'cea.grid.weighted_average_incl_res.incl_imports.2025_26',
    engineRegion: 'IN',
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
    engineActivityKey: 'cea.grid.weighted_average_incl_res.incl_imports.2025_26',
    engineRegion: 'IN',
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
    engineActivityKey: 'desnz.2025.27_304_3110_14',
    engineRegion: 'UK',
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
  // authLoading is true only during the initial async session verification
  const hasStoredToken = Boolean(authService.getToken());
  const [authLoading, setAuthLoading] = useState<boolean>(hasStoredToken);
  const [currentUser, setCurrentUser] = useState<User | null>(() => authService.getStoredUser());
  const [companyName, setCompanyName] = useState<string>(() => {
    const stored = authService.getStoredUser();
    return stored?.companyName || 'Acme Steel Pvt Ltd';
  });
  const [reportingPeriod, setReportingPeriod] = useState<string>('FY 2025–26');
  const [boundaryApproach, setBoundaryApproach] = useState<ConsolidationBoundary>('Operational control');
  const [steelMethod, setSteelMethod] = useState<IntegratedSteelMethod>('fuel_based');

  useEffect(() => {
    if (!authService.getToken()) {
      // No token: definitely not logged in, nothing to verify
      setAuthLoading(false);
      return;
    }
    authService.verifySession().then((user) => {
      if (user) {
        setCurrentUser(user);
        if (user.companyName) {
          setCompanyName(user.companyName);
        }
      } else {
        // Token was stale — clear user so login page is shown
        setCurrentUser(null);
      }
    }).finally(() => {
      setAuthLoading(false);
    });
  }, []);

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

  // The IPCC methods. Only the INPUTS live here: the answers are recalculated
  // by the engine on every change, including a change of GWP basis, so a figure
  // stated under AR5 can never survive into an AR6 report.
  const [methodEntries, setMethodEntries] = useState<MethodEntry[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_METHODS`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Which published factor calculates each source a user may pick. Until it
  // arrives, rows keep whatever key they were saved with, and nothing is
  // invented for the ones that have none.
  const catalogueMap = useCatalogueMap();

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((type: ToastMessage['type'], message: string, duration = 4000) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
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
      localStorage.setItem(`${STORAGE_KEY}_METHODS`, JSON.stringify(methodEntries));
    } catch (e) {
      console.warn('Failed to save GHG data to localStorage:', e);
    }
  }, [scope1Entries, scope2Entries, scope3Entries, methodEntries]);

  // Scenario Simulator State
  const [scenario, setScenario] = useState<WhatIfScenario>({
    renewableElectricityPercent: 25,
    dieselReductionPercent: 15,
    switchFleetToElectric: false,
  });

  const [scenarioResult, setScenarioResult] = useState<ScenarioResult>({
    baselineTotal: 1992.2,
    newTotal: 1850.4,
    deltaTco2e: 141.8,
    deltaPercentage: 7.1,
    scope1New: 345.1,
    scope2New: 309.3,
    scope3New: 1196.0,
  });

  // Bug Guard #6: Compute summary via useMemo from active entries (never store derived total in useState)
  // Every figure in the app comes from ghg_core. The browser holds the records
  // and displays the result; it does not compute emissions itself, so there is
  // no second method that could disagree with the report.
  const [gwpSet, setGwpSet] = useState<GwpSetName>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('INVTY_GHG_REPORT_META_V1') || '{}');
      return stored.gwpSet === 'AR6' ? 'AR6' : 'AR5';
    } catch {
      return 'AR5';
    }
  });

  /**
   * Attach the published factor a row's source maps to.
   *
   * A row stores which SOURCE it is (its catalogue key, on the emission
   * factor) and which UNIT it was entered in. Which published factor that
   * resolves to is not the user's business to look up, and until this existed
   * they had to: every row said "no published factor chosen" and the whole
   * inventory came to 0.00.
   *
   * A row the user has already pointed at a specific factor keeps it. A source
   * with no published factor gets nothing, and stays uncalculated.
   */
  const resolved = useCallback((entries: ActivityEntry[]): ActivityEntry[] => {
    if (catalogueMap.size === 0) return entries;
    return entries.map((entry) => {
      if (entry.engineActivityKey) return entry;
      const mapping = mappingFor(catalogueMap, entry.emissionFactor?.id, entry.unit);
      if (!mapping) return entry;
      return {
        ...entry,
        engineActivityKey: mapping.activity_key,
        engineRegion: mapping.region,
      };
    });
  }, [catalogueMap]);

  const scope1Resolved = useMemo(() => resolved(scope1Entries), [resolved, scope1Entries]);
  const scope2Resolved = useMemo(() => resolved(scope2Entries), [resolved, scope2Entries]);
  const scope3Resolved = useMemo(() => resolved(scope3Entries), [resolved, scope3Entries]);

  const allEntries = useMemo(
    () => [...scope1Resolved, ...scope2Resolved, ...scope3Resolved],
    [scope1Resolved, scope2Resolved, scope3Resolved],
  );

  const reportingYear = useMemo(
    () => Number(reportingPeriod.match(/\d{4}/)?.[0]) || new Date().getFullYear(),
    [reportingPeriod],
  );

  const engine = useEngineInventory(allEntries, gwpSet, reportingYear);
  const methods = useMethodResults(methodEntries, gwpSet);

  const addMethodEntry = useCallback((method: MethodKey, label?: string): string => {
    const id = `method-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setMethodEntries((prev) => [...prev, {
      id,
      method,
      label: label || '',
      facility: '',
      input: emptyInput(method, reportingYear),
      // A new entry starts out of the totals: half-filled inputs would either
      // be refused or, worse, quietly understate the source.
      included: false,
    }]);
    return id;
  }, [reportingYear]);

  const updateMethodEntry = useCallback((id: string, updates: Partial<MethodEntry>) => {
    setMethodEntries((prev) => prev.map((entry) => (
      entry.id === id ? { ...entry, ...updates } : entry)));
  }, []);

  const deleteMethodEntry = useCallback((id: string) => {
    setMethodEntries((prev) => prev.filter((entry) => entry.id !== id));
  }, []);

  /** Engine result per record, in tonnes, with the reason when there is none. */
  const engineByRecord = useMemo(() => {
    const map = new Map<string, { tco2e: number; warning?: string }>();
    engine.result?.lines.forEach((line) => {
      map.set(line.record_id, {
        tco2e: Number(line.emissions_kgco2e) / 1000,
        warning: line.status === 'calculated' ? undefined : line.message,
      });
    });
    engine.unmapped.forEach((entry) => map.set(entry.id, {
      tco2e: 0,
      warning: 'No published factor chosen, so this row is not calculated and is excluded from every total.',
    }));
    return map;
  }, [engine.result, engine.unmapped]);

  const withEngineValues = useCallback(
    (entries: ActivityEntry[]): ActivityEntry[] => entries.map((entry) => {
      const line = engineByRecord.get(entry.id);
      if (!line) return entry;
      return { ...entry, calculatedTco2e: line.tco2e, warning: line.warning };
    }),
    [engineByRecord],
  );

  const scope1Calculated = useMemo(() => withEngineValues(scope1Resolved), [withEngineValues, scope1Resolved]);
  const scope2Calculated = useMemo(() => withEngineValues(scope2Resolved), [withEngineValues, scope2Resolved]);
  const scope3Calculated = useMemo(() => withEngineValues(scope3Resolved), [withEngineValues, scope3Resolved]);

  // The totals ARE the engine's totals, in tonnes. Nothing is re-added here:
  // summing the rows again in the browser is how two figures for one inventory
  // start to drift apart.
  const summary = useMemo<ScopeSummary>(() => {
    const totals = engine.result?.totals;
    const tonnes = (kg?: string) => (kg ? Number(kg) / 1000 : 0);
    const scope3Categories = new Set(
      scope3Resolved.filter((entry) => entry.engineActivityKey).map((entry) => entry.category));

    // The methods are Scope 1 sources, so their CO2e joins Scope 1 and the
    // grand total. They are calculated by the same engine under the same GWP
    // set, just through equations instead of a factor per unit.
    const methodTonnes = methods.totalCo2eKg / 1000;

    return {
      scope1: tonnes(totals?.scope1) + methodTonnes,
      scope2Location: tonnes(totals?.scope2_location),
      scope2Market: tonnes(totals?.scope2_market),
      scope3: tonnes(totals?.scope3),
      biogenicMemo: tonnes(totals?.memo?.biogenic_co2),
      totalEmissions: tonnes(totals?.total_all) + methodTonnes,
      dataQualityGrade: calculateDataQualityGrade(
        [...scope1Calculated, ...scope2Calculated, ...scope3Calculated]),
      coverage: {
        scopesCompleted: [tonnes(totals?.scope1) + methodTonnes,
          Number(totals?.scope2_headline), Number(totals?.scope3)]
          .filter((value) => value > 0).length,
        totalScopes: 3,
        scope3CategoriesIncluded: scope3Categories.size,
        totalScope3Categories: 15,
      },
    };
  }, [engine.result, methods.totalCo2eKg, scope1Calculated, scope2Calculated,
      scope3Calculated, scope3Resolved]);

  const engineStatus = useMemo(() => {
    const unmappedCount = engine.unmapped.length;
    const excludedCount = engine.result?.excluded.length ?? 0;
    if (engine.loading) return { state: 'calculating' as const, unmappedCount, excludedCount };
    if (engine.error) {
      return { state: 'unavailable' as const, message: engine.error, unmappedCount, excludedCount };
    }
    if (!engine.result) {
      return {
        state: 'nothing_mapped' as const,
        message: 'No row names a published factor yet, so nothing can be calculated.',
        unmappedCount, excludedCount,
      };
    }
    return {
      state: 'calculated' as const,
      runId: engine.result.run_id,
      engineVersion: engine.result.engine_version,
      unmappedCount, excludedCount,
    };
  }, [engine]);

  // Live Scenario updates
  useEffect(() => {
    ghgService
      .simulateScenario(summary.scope1, summary.scope2Location, summary.scope3, scenario)
      .then((res) => {
        setScenarioResult(res);
      });
  }, [scenario, summary.scope1, summary.scope2Location, summary.scope3]);

  // Mutation handlers with Bug Guard #14 (immutable reference returns)
  const updateRow = useCallback(
    (scope: 'scope-1' | 'scope-2' | 'scope-3', id: string, updates: Partial<ActivityEntry>) => {
      const updater = (prev: ActivityEntry[]) =>
        prev.map((row) => {
          if (row.id !== id) return row;
          // No arithmetic here: the engine recalculates the row and its value
          // arrives through engineByRecord on the next render.
          return { ...row, ...updates, updatedAt: new Date().toISOString() };
        });

      if (scope === 'scope-1') setScope1Entries(updater);
      else if (scope === 'scope-2') setScope2Entries(updater);
      else setScope3Entries(updater);
    },
    []
  );

  const addRow = useCallback(
    (scope: 'scope-1' | 'scope-2' | 'scope-3', category: string) => {
      // A new row starts on a source that belongs to ITS scope and category, and
      // prefers one whose factor has actually been ingested.
      const available = factorsFor(scope, category);
      const factor = available.find((candidate) => isVerified(candidate.id))
        || available[0]
        || DEFAULT_FACTORS[0];

      const defaultAmount = factor.unit.toLowerCase() === 'kwh' ? 10000 : 100;

      const newRow: ActivityEntry = {
        id: `${scope}-row-${Date.now()}`,
        facility: 'Main Plant Facility',
        scope,
        category,
        fuelOrSource: factor.fuelOrActivity,
        amount: defaultAmount,
        unit: factor.unit,
        emissionFactor: factor,
        calculatedTco2e: 0,
        warning: 'Choose a published factor for this row so it can be calculated.',
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

        return {
          id: `${scope}-import-${Date.now()}-${idx}`,
          facility: e.facility || 'Main Plant Facility',
          scope,
          category: e.category || (scope === 'scope-1' ? 'stationary_combustion' : 'purchased_electricity'),
          fuelOrSource: e.fuelOrSource || factor.fuelOrActivity,
          amount,
          unit: e.unit || factor.unit,
          emissionFactor: factor,
          calculatedTco2e: 0,
          warning: 'Choose a published factor for this row so it can be calculated.',
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
    // The engine is the only calculator. Touching updatedAt re-sends the records.
    const touch = (list: ActivityEntry[]) =>
      list.map((row) => ({ ...row, updatedAt: new Date().toISOString() }));
    setScope1Entries(touch);
    setScope2Entries(touch);
    setScope3Entries(touch);
    addToast('info', 'Recalculating with the engine…');
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

  const logout = useCallback(async () => {
    await authService.logout();
    setCurrentUser(null);
    addToast('info', 'Logged out successfully');
  }, [addToast]);

  return (
    <GHGContext.Provider
      value={{
        companyName,
        reportingPeriod,
        boundaryApproach,
        steelMethod,
        setCompanyName,
        setReportingPeriod,
        setBoundaryApproach,
        setSteelMethod,
        currentUser,
        setCurrentUser,
        authLoading,
        logout,
        scope1Entries: scope1Calculated,
        scope2Entries: scope2Calculated,
        scope3Entries: scope3Calculated,
        methodEntries,
        methodResults: methods.byEntry,
        methodErrors: methods.errors,
        methodsLoading: methods.loading,
        addMethodEntry,
        updateMethodEntry,
        deleteMethodEntry,
        summary,
        gwpSet,
        setGwpSet,
        engineStatus,
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
