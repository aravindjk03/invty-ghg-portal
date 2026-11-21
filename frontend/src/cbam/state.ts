/**
 * The CBAM calculator's saved work, kept in this browser apart from the GHG
 * inventory. Nothing here starts with emission figures: a new installation is
 * blank until the user enters it.
 */
import type {
  EmissionLine, ExporterInput, ImportLine, ImporterInput, PrecursorUse, Process, Product, Role,
} from './model';

const KEY = 'INVTY_CBAM_V1';

export interface CbamState {
  role: Role;
  exporter: ExporterInput;
  importer: ImporterInput;
}

export const newId = () => Math.random().toString(36).slice(2, 10);

export const blankProduct = (): Product => ({ id: newId(), cn: '', name: '', tonnes: '', functionalUnitsPerTonne: '1' });
export const blankLine = (): EmissionLine => ({
  id: newId(), label: '', kind: 'calc', activity: '', activityUnit: '', emissionFactor: '', oxidationFactor: '1', tco2e: '', source: '',
});
export const blankPrecursor = (): PrecursorUse => ({ id: newId(), cn: '', name: '', tonnes: '', origin: 'default', country: 'India' });
export const blankProcess = (n = 1): Process => ({
  id: newId(), name: `Production process ${n}`, products: [blankProduct()], direct: [], precursors: [],
});
export const blankImportLine = (): ImportLine => ({
  id: newId(), cn: '', name: '', country: 'India', tonnes: '', quarter: 'Q1', basis: 'default',
});

export function initialState(companyName = ''): CbamState {
  return {
    role: 'exporter',
    exporter: {
      installation: { name: companyName, operator: companyName, country: 'India', unlocode: '', address: '', year: 2026 },
      processes: [blankProcess()],
    },
    importer: { declarant: '', year: 2026, lines: [blankImportLine()], certificatePrice: {} },
  };
}

export function loadState(companyName = ''): CbamState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return initialState(companyName);
    const parsed = JSON.parse(raw) as CbamState;
    if (!parsed?.exporter?.processes || !parsed?.importer?.lines) return initialState(companyName);
    return parsed;
  } catch {
    return initialState(companyName);
  }
}

export function saveState(state: CbamState): void {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full or blocked: keep working in memory */ }
}
