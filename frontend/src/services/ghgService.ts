import { request } from './api';
import { EmissionFactor, WhatIfScenario, ScenarioResult, ActivityEntry, ScopeSummary } from '../types/ghg';
import { DEFAULT_FACTORS, getFactorsForCategory } from '../engine/factorCatalogue';
import { calculateRowEmissions } from '../engine/calculator';
import Papa from 'papaparse';
import Decimal from 'decimal.js';
import { convertUnit } from '../engine/unitConverter';

// The catalogue moved to engine/factorCatalogue (it is shared with the
// calculator); re-exported here so existing call sites keep working.
export { DEFAULT_FACTORS };
// xlsx, jspdf and html2canvas are ~1.4 MB combined and are only needed once a
// user actually exports, so they are pulled in on demand rather than shipped in
// the initial bundle.

export const ghgService = {
  /**
   * The factor register, from the API when reachable.
   *
   * The bundled catalogue is the offline snapshot, not a second register: both
   * are generated from the same source and share activity keys, so a row saved
   * offline still resolves against the served catalogue.
   */
  async getFactors(filters?: { scope?: string; ghgCategory?: string }): Promise<EmissionFactor[]> {
    const params = new URLSearchParams();
    if (filters?.scope) params.set('scope', filters.scope);
    if (filters?.ghgCategory) params.set('ghgCategory', filters.ghgCategory);
    const query = params.toString();

    try {
      const factors = await request<EmissionFactor[]>(`/factors${query ? `?${query}` : ''}`);
      // A malformed or empty payload must not blank out every source picker.
      if (!Array.isArray(factors) || factors.length === 0 || !factors[0]?.ghgCategory) {
        return DEFAULT_FACTORS;
      }
      return factors;
    } catch {
      return DEFAULT_FACTORS;
    }
  },

  calculateRowLocally(amount: number | string, factorValue: number, fuelOrSource: string, unit: string) {
    const res = calculateRowEmissions(amount, factorValue, fuelOrSource, unit);
    return {
      calculatedTco2e: res.calculatedTco2e,
      warning: res.warning,
    };
  },

  async simulateScenario(
    baselineScope1: number,
    baselineScope2: number,
    baselineScope3: number,
    scenario: WhatIfScenario
  ): Promise<ScenarioResult> {
    try {
      return await request<ScenarioResult>('/emissions/scenario', {
        method: 'POST',
        body: JSON.stringify({
          baselineScope1,
          baselineScope2,
          baselineScope3,
          ...scenario,
        }),
      });
    } catch {
      // Local fallback simulation with exact decimal proportions
      const dieselScope1 = baselineScope1 * 0.65;
      const otherScope1 = baselineScope1 - dieselScope1;
      let reducedDiesel = dieselScope1 * (1 - scenario.dieselReductionPercent / 100);
      if (scenario.switchFleetToElectric) {
        reducedDiesel = Math.max(0, reducedDiesel - baselineScope1 * 0.18);
      }
      const scope1New = Number((otherScope1 + reducedDiesel).toFixed(1));
      const scope2New = Number((baselineScope2 * (1 - scenario.renewableElectricityPercent / 100)).toFixed(1));
      const scope3New = Number(
        (baselineScope3 - baselineScope2 * (scenario.renewableElectricityPercent / 100) * 0.1).toFixed(1)
      );
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
  },

  /**
   * Export activity data to CSV and trigger browser download
   */
  exportCsv(entries: ActivityEntry[], filename = 'Acme_Steel_FY2025_26_GHG_Inventory.csv'): void {
    const rows = entries.map((e) => ({
      Facility: e.facility,
      Scope: e.scope,
      Category: e.category,
      Source: e.fuelOrSource,
      Amount: e.amount,
      Unit: e.unit,
      'Emission Factor (kgCO2e/unit)': e.emissionFactor.factorValue,
      'Factor Source': e.emissionFactor.source,
      'Quality Tier': e.emissionFactor.qualityTier,
      'Emissions (tCO2e)': e.calculatedTco2e,
      'Last Updated': e.updatedAt,
    }));

    const csvContent = Papa.unparse(rows);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  /**
   * Export activity entries and summary to XLSX with multiple worksheets
   */
  async exportXlsx(
    entries: ActivityEntry[],
    summary: ScopeSummary,
    filename = 'Acme_Steel_FY2025_26_GHG_Audit_Trail.xlsx'
  ): Promise<void> {
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();

    // Sheet 1: Summary KPI
    const summaryData = [
      { Metric: 'Reporting Organisation', Value: 'Acme Steel Pvt Ltd' },
      { Metric: 'Reporting Period', Value: 'FY 2025–26' },
      { Metric: 'Boundary Approach', Value: 'Operational Control' },
      { Metric: 'Scope 1 (tCO2e)', Value: summary.scope1 },
      { Metric: 'Scope 2 Location-Based (tCO2e)', Value: summary.scope2Location },
      { Metric: 'Scope 2 Market-Based (tCO2e)', Value: summary.scope2Market },
      { Metric: 'Scope 3 Value Chain (tCO2e)', Value: summary.scope3 },
      { Metric: 'Biogenic Memo Item (tCO2e)', Value: summary.biogenicMemo },
      { Metric: 'Gross Headline Emissions (tCO2e)', Value: summary.totalEmissions },
      { Metric: 'Data Quality Grade', Value: summary.dataQualityGrade },
      { Metric: 'Generated At', Value: new Date().toISOString() },
    ];
    const summarySheet = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Executive Summary');

    // Sheet 2: All Inventory Rows
    const rowsData = entries.map((e) => ({
      ID: e.id,
      Facility: e.facility,
      Scope: e.scope,
      Category: e.category,
      Source: e.fuelOrSource,
      Quantity: e.amount,
      Unit: e.unit,
      'Factor Value (kgCO2e)': e.emissionFactor.factorValue,
      'Factor Source': e.emissionFactor.source,
      'Quality Tier': e.emissionFactor.qualityTier,
      'Emissions (tCO2e)': e.calculatedTco2e,
      Warnings: e.warning || 'None',
      'Evidence File': e.evidenceFile || 'N/A',
      'Last Modified': e.updatedAt,
    }));
    const rowsSheet = XLSX.utils.json_to_sheet(rowsData);
    XLSX.utils.book_append_sheet(workbook, rowsSheet, 'Activity Registry');

    // Sheet 3: Emission Factors Reference
    const factorSheet = XLSX.utils.json_to_sheet(
      DEFAULT_FACTORS.slice(0, 50).map((f) => ({
        ID: f.id,
        Activity: f.fuelOrActivity,
        Scope: f.scope,
        'Factor Value': f.factorValue,
        Unit: f.unit,
        Source: f.source,
        Tier: f.qualityTier,
      }))
    );
    XLSX.utils.book_append_sheet(workbook, factorSheet, 'Factor Register');

    // Save and trigger download
    XLSX.writeFile(workbook, filename);
  },

  /**
   * Export JSON data
   */
  exportJson(data: any, filename = 'Acme_Steel_GHG_Data.json'): void {
    const str = JSON.stringify(data, null, 2);
    const blob = new Blob([str], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  /**
   * Bug Guard #11: Pixel-accurate PDF generator with html2canvas and jsPDF
   */
  async generatePdf(elementId: string, filename = 'INVTY_GHG_Verification_Report.pdf'): Promise<void> {
    const el = document.getElementById(elementId);
    if (!el) {
      window.print();
      return;
    }

    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);

      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#FFFFFF',
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const imgWidth = 210; // A4 width mm
      const pageHeight = 297; // A4 height mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(filename);
    } catch (err) {
      console.error('PDF rendering failed, falling back to window.print()', err);
      window.print();
    }
  },

  /**
   * Bug Guard #12: CSV parsing with papaparse, BOM stripping, validation
   */
  parseCsvFile(
    file: File,
    target?: { scope?: ActivityEntry['scope']; category?: string }
  ): Promise<{ entries: Partial<ActivityEntry>[]; errors: string[] }> {
    return new Promise((resolve) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
        transformHeader: (h) => h.replace(/^﻿/, '').trim().toLowerCase(),
        complete: (results) => {
          const entries: Partial<ActivityEntry>[] = [];
          const errors: string[] = [];

          // Match only within the category being imported into, so a CSV
          // dropped on Mobile combustion cannot resolve to a Scope 3 factor.
          const searchable = getFactorsForCategory(target?.category, target?.scope);

          results.data.forEach((row: any, idx: number) => {
            const line = idx + 1;
            const facility = row.facility || row.plant || 'Main Plant';
            const source = String(row.source || row.fuel || row.activity || '').trim();
            const amountStr = row.amount || row.quantity || row.value || '';
            const declaredUnit = String(row.unit || '').trim();

            const numAmount = parseFloat(String(amountStr).replace(/,/g, ''));
            if (isNaN(numAmount)) {
              errors.push(`Row ${line}: invalid or missing quantity "${amountStr}"`);
              return;
            }

            if (!source) {
              // Previously an empty source matched everything via includes(''),
              // silently importing against whichever factor sorted first.
              errors.push(`Row ${line}: missing emission source — skipped`);
              return;
            }

            const needle = source.toLowerCase();
            const factor = searchable.find(
              (f) =>
                f.fuelOrActivity.toLowerCase().includes(needle) ||
                f.id.toLowerCase().includes(needle)
            );

            if (!factor) {
              errors.push(`Row ${line}: no emission factor matches "${source}" in this category`);
              return;
            }

            // The factor is expressed per its own unit. Importing a quantity in
            // a different unit and applying the factor anyway silently scaled
            // rows by up to 1000x (kg entered against a per-tonne factor).
            const allowed = (factor.allowedUnits || factor.unit)
              .split('|')
              .map((u) => u.trim().toLowerCase())
              .filter(Boolean);

            if (declaredUnit && !allowed.includes(declaredUnit.toLowerCase())) {
              errors.push(
                `Row ${line}: unit "${declaredUnit}" is not valid for ${factor.fuelOrActivity} ` +
                  `(expected one of ${allowed.join(', ')}) — skipped`
              );
              return;
            }

            // The factor is priced per its own unit, so an allowed-but-different
            // unit must be CONVERTED, never relabelled — relabelling 500 kg as
            // 500 t is exactly the 1000x error this guard exists to stop.
            let quantity = numAmount;
            const unit = factor.unit;

            if (declaredUnit && declaredUnit.toLowerCase() !== factor.unit.toLowerCase()) {
              try {
                quantity = convertUnit(
                  new Decimal(numAmount),
                  declaredUnit,
                  factor.unit,
                  factor.fuelOrActivity
                ).toNumber();
              } catch (err: any) {
                errors.push(
                  `Row ${line}: cannot convert ${numAmount} ${declaredUnit} to ${factor.unit} ` +
                    `for ${factor.fuelOrActivity} — ${err?.message || 'unsupported conversion'}`
                );
                return;
              }
            }

            const calc = calculateRowEmissions(quantity, factor.factorValue, factor.fuelOrActivity, unit);

            entries.push({
              id: `csv-row-${Date.now()}-${idx}`,
              facility,
              scope: target?.scope,
              category: target?.category,
              fuelOrSource: factor.fuelOrActivity,
              amount: quantity,
              unit,
              emissionFactor: factor,
              calculatedTco2e: calc.calculatedTco2e,
              warning: calc.warning,
              updatedAt: new Date().toISOString(),
            });
          });

          resolve({ entries, errors });
        },
        error: (err) => {
          resolve({ entries: [], errors: [err.message] });
        },
      });
    });
  },
};
