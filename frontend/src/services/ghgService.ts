import { request } from './api';
import { EmissionFactor, WhatIfScenario, ScenarioResult, ActivityEntry, ScopeSummary } from '../types/ghg';
import { CATALOGUE_SOURCES } from '../data/catalogueData';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

import { safeFilename } from '../lib/utils';

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

  /**
   * Export activity data to CSV and trigger browser download
   */
  exportCsv(entries: ActivityEntry[], filename = 'GHG_Activity_Data.csv'): void {
    const rows = entries.map((e) => ({
      Facility: e.facility,
      Scope: e.scope,
      Category: e.category,
      Source: e.fuelOrSource,
      Amount: e.amount,
      Unit: e.unit,
      // What the engine used, not the value the catalogue ships for its picker.
      'Emission Factor (kgCO2e/unit)': e.engineFactorValue ?? '',
      'Factor Source': e.engineFactorSource ?? 'Not calculated',
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
  /**
   * The workbook states who is reporting, over what period and on what basis.
   * Those three came from literals here — every company's export said it was
   * Acme Steel's FY 2025-26 inventory — so they are now required arguments.
   */
  exportXlsx(
    entries: ActivityEntry[],
    summary: ScopeSummary,
    filename: string,
    meta: { companyName: string; reportingPeriod: string; boundaryApproach: string }
  ): void {
    const workbook = XLSX.utils.book_new();

    // Sheet 1: Summary KPI
    const summaryData = [
      { Metric: 'Reporting Organisation', Value: meta.companyName },
      { Metric: 'Reporting Period', Value: meta.reportingPeriod },
      { Metric: 'Boundary Approach', Value: meta.boundaryApproach },
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
      'Factor Value (kgCO2e)': e.engineFactorValue ?? '',
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
      DEFAULT_FACTORS.map((f) => ({
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
    XLSX.writeFile(workbook, safeFilename(filename));
  },

  /**
   * Export JSON data
   */
  exportJson(data: any, filename = 'GHG_Inventory.json'): void {
    const str = JSON.stringify(data, null, 2);
    const blob = new Blob([str], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = safeFilename(filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  /**
   * Bug Guard #11: Pixel-accurate PDF generator with html2canvas and jsPDF
   */
  async generatePdf(elementId: string, filename = 'IINVTY_GHG_Verification_Report.pdf'): Promise<void> {
    const el = document.getElementById(elementId);
    if (!el) {
      window.print();
      return;
    }

    // One report page (a <section>) per PDF page, so no page is cut through
    // mid-section and the on-screen header above the report stays out. A page
    // taller than A4 continues on the next sheet.
    const pages = Array.from(el.querySelectorAll<HTMLElement>('section'));
    const targets = pages.length ? pages : [el];
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    const pageW = 210;
    const pageH = 297;
    let first = true;

    for (const target of targets) {
      const canvas = await html2canvas(target, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#FFFFFF',
      });
      // Canvas pixels that fit on one A4 sheet at full page width. A page only
      // slightly taller than that is shrunk onto one sheet instead of leaving
      // a nearly empty one after it.
      const fullH = Math.floor((canvas.width * pageH) / pageW);
      const sliceH = canvas.height <= fullH * 1.15 ? canvas.height : fullH;
      for (let y = 0; y < canvas.height; y += sliceH) {
        const h = Math.min(sliceH, canvas.height - y);
        const slice = document.createElement('canvas');
        slice.width = canvas.width;
        slice.height = h;
        const ctx = slice.getContext('2d');
        if (!ctx) throw new Error('Canvas is not available');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, slice.width, h);
        ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
        if (!first) pdf.addPage();
        first = false;
        const drawH = Math.min(pageH, (h * pageW) / canvas.width);
        const drawW = (drawH * canvas.width) / h;
        pdf.addImage(slice.toDataURL('image/jpeg', 0.8), 'JPEG', (pageW - drawW) / 2, 0, drawW, drawH);
      }
    }

    pdf.save(safeFilename(filename));
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
