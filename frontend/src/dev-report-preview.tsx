// Dev-only harness: renders the GHG inventory report with sample entries so the
// document can be checked without signing in. Not referenced by the app.
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { ActivityEntry, EmissionFactor, ScopeSummary } from './types/ghg';
import { buildReport } from './report/build/buildReport';
import { ReportDocument } from './report/ReportDocument';
import { EMPTY_REPORT_META } from './report/model/reportMeta';

const factor = (
  id: string, activity: string, value: number, unit: string, source: string, year: number,
  tier: EmissionFactor['qualityTier'],
): EmissionFactor => ({
  id, fuelOrActivity: activity, scope: 'scope-1', category: '', factorValue: value, unit,
  source, publicationYear: year, qualityTier: tier, gwpSet: 'IPCC AR6',
});

const entry = (
  id: string, scope: ActivityEntry['scope'], category: string, fuelOrSource: string,
  amount: number, unit: string, ef: EmissionFactor, tco2e: number, evidence?: string,
  periodMonth?: string,
): ActivityEntry => ({
  id, facility: 'Chennai Plant', scope, category, fuelOrSource, amount, unit,
  emissionFactor: ef, calculatedTco2e: tco2e, evidenceFile: evidence, periodMonth,
  dataOwner: 'Utilities', updatedAt: new Date().toISOString(),
});

const dieselEf = factor('EF-DSL', 'Diesel (stationary)', 2.68, 'kgCO2e/L', 'IPCC 2006 / national inventory', 2024, 'Secondary');
const gridEf = factor('EF-GRID', 'Grid electricity (India)', 0.716, 'kgCO2e/kWh', 'CEA CO2 Baseline Database', 2024, 'Secondary');
const freightEf = factor('EF-FRT', 'Road freight', 0.13, 'kgCO2e/t.km', 'India GHG Program', 2022, 'Proxy');

// Three months of electricity, to exercise the monthly analysis and its gaps.
const scope1: ActivityEntry[] = [
  entry('s1-1', 'scope-1', 'stationary_combustion', 'Diesel generator', 12540, 'L', dieselEf, 33.6, 'DG fuel register Apr–Mar', '2025-04'),
  entry('s1-2', 'scope-1', 'mobile_combustion', 'Forklift fleet', 8500, 'L', dieselEf, 22.8, undefined, '2025-05'),
];
const scope2: ActivityEntry[] = [
  entry('s2-1', 'scope-2', 'purchased_electricity', 'Grid electricity — April', 190000, 'kWh', gridEf, 136.0, 'TANGEDCO invoice Apr', '2025-04'),
  entry('s2-2', 'scope-2', 'purchased_electricity', 'Grid electricity — May', 196000, 'kWh', gridEf, 140.3, 'TANGEDCO invoice May', '2025-05'),
  entry('s2-3', 'scope-2', 'purchased_electricity', 'Grid electricity — June', 190000, 'kWh', gridEf, 136.1, 'TANGEDCO invoice Jun', '2025-06'),
];
const scope3: ActivityEntry[] = [
  entry('s3-1', 'scope-3', 'cat4_upstream_transport', 'Inbound road freight', 1_420_000, 't.km', freightEf, 184.6),
];

const summary: ScopeSummary = {
  scope1: 56.4, scope2Location: 412.4, scope2Market: 412.4, scope3: 184.6,
  biogenicMemo: 0, totalEmissions: 653.4, dataQualityGrade: 'B',
  coverage: { scopesCompleted: 3, totalScopes: 3, scope3CategoriesIncluded: 1, totalScope3Categories: 15 },
};

const report = buildReport({
  companyName: 'XYZ Automotive Components Pvt. Ltd.',
  reportingPeriod: 'FY 2025–26',
  boundaryApproach: 'Operational control',
  scope1Entries: scope1, scope2Entries: scope2, scope3Entries: scope3,
  summary,
  meta: {
    ...EMPTY_REPORT_META,
    productionUnit: 'tonnes of finished product',
    periodStart: '2025-04-01',
    periodEnd: '2026-03-31',
    facilities: [
      { name: 'Corporate headquarters', type: 'Office', location: 'Chennai', included: true, note: 'Head office' },
      { name: 'Chennai Plant', type: 'Manufacturing', location: 'Chennai', included: true, note: 'Main site', parent: 'Corporate headquarters' },
      { name: 'Warehouse', type: 'Storage', location: 'Sriperumbudur', included: true, note: 'Finished goods', parent: 'Corporate headquarters' },
    ],
    refrigerants: [
      { equipment: 'Process chiller #1', refrigerant: 'R-134a', gwp: 1430, initialChargeKg: 120,
        rechargeKg: 14, recoveredKg: 0, lossKg: 14, tco2e: 20.02, method: 'Mass balance from maintenance log' },
    ],
  },
  frameworks: ['GHG Protocol Corporate Standard', 'ISO 14064-1:2018'],
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <div className="bg-canvas min-h-screen py-8 flex flex-col items-center gap-8">
      <ReportDocument report={report} />
    </div>
  </React.StrictMode>,
);
