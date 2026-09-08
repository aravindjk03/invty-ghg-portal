import { request } from './api';
import { EmissionFactor, WhatIfScenario, ScenarioResult, ActivityEntry, ScopeSummary } from '../types/ghg';
import { CATALOGUE_SOURCES } from '../data/catalogueData';
import { calculateRowEmissions } from '../engine/calculator';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// Map catalogue entries to EmissionFactor objects
export const DEFAULT_FACTORS: EmissionFactor[] = CATALOGUE_SOURCES.map((source) => ({
  id: source.activity_key,
  fuelOrActivity: source.display_name,
  scope: (source.scope === '1' ? 'scope-1' : source.scope === '2' ? 'scope-2' : source.scope === '3' ? 'scope-3' : 'biogenic') as any,
  category: source.category_name,
  factorValue: source.factorValue,
  unit: source.default_unit,
  source: source.factor_source,
  publicationYear: source.publicationYear,
  qualityTier: source.qualityTier,
  notes: source.notes,
}));

export const ghgService = {
  async getFactors(): Promise<EmissionFactor[]> {
    try {
      return await request<EmissionFactor[]>('/factors');
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
  exportXlsx(
    entries: ActivityEntry[],
    summary: ScopeSummary,
    filename = 'Acme_Steel_FY2025_26_GHG_Audit_Trail.xlsx'
  ): void {
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
  parseCsvFile(file: File): Promise<{ entries: Partial<ActivityEntry>[]; errors: string[] }> {
    return new Promise((resolve) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
        transformHeader: (h) => h.replace(/^\uFEFF/, '').trim().toLowerCase(),
        complete: (results) => {
          const entries: Partial<ActivityEntry>[] = [];
          const errors: string[] = [];

          results.data.forEach((row: any, idx: number) => {
            const facility = row.facility || row.plant || 'Main Plant';
            const source = row.source || row.fuel || row.activity || '';
            const amountStr = row.amount || row.quantity || row.value || '';
            const unit = row.unit || 'L';

            const numAmount = parseFloat(String(amountStr).replace(/,/g, ''));
            if (isNaN(numAmount)) {
              errors.push(`Row ${idx + 1}: Invalid or missing quantity "${amountStr}"`);
              return;
            }

            // Find matching factor
            const factor = DEFAULT_FACTORS.find(
              (f) =>
                f.fuelOrActivity.toLowerCase().includes(source.toLowerCase()) ||
                f.id.toLowerCase().includes(source.toLowerCase())
            ) || DEFAULT_FACTORS[0];

            entries.push({
              id: `csv-row-${Date.now()}-${idx}`,
              facility,
              fuelOrSource: factor.fuelOrActivity,
              amount: numAmount,
              unit,
              emissionFactor: factor,
              calculatedTco2e: Number(((numAmount * factor.factorValue) / 1000).toFixed(2)),
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
