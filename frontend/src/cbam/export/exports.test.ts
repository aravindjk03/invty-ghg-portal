import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import raw from '../data/cbamData.json';
import type { CbamData } from '../data';
import { calculateExporter } from '../calculate';
import { calculateImporter } from '../importer';
import { buildExporterWorkbook, buildImporterWorkbook } from './communicationWorkbook';
import { EXPORT_NAMESPACE, exporterXml, importerXml } from './dataExport';
import type { ExporterInput, ImporterInput } from '../model';

const data = raw as unknown as CbamData;
const exporter: ExporterInput = {
  installation: { name: 'Rolling Mill <A&B>', operator: 'Op', country: 'India', unlocode: 'INMAA', address: '', year: 2026 },
  processes: [{
    id: 'p1', name: 'Rolling', direct: [{ id: 'l', label: '=HYPERLINK("x")', kind: 'measured', tco2e: '120', source: 'meter' }],
    products: [{ id: 'g', cn: '72142000', name: 'Rebar', tonnes: '1000', functionalUnitsPerTonne: '1' }],
    precursors: [{ id: 'b', cn: '72071114', name: 'Billet', tonnes: '1050', origin: 'default', country: 'India', route: '(C)' }],
  }],
};
const importer: ImporterInput = {
  declarant: 'EU GmbH', year: 2026, certificatePrice: {},
  lines: [{ id: 'a', cn: '72142000', name: 'Rebar', country: 'India', tonnes: '100', quarter: 'Q2', basis: 'default' }],
};

describe('exports carry the calculated figures unchanged', () => {
  const er = calculateExporter(data, exporter);
  const ir = calculateImporter(data, importer);

  it('operator workbook: summary per good equals the result', () => {
    const book = buildExporterWorkbook(data, exporter, er);
    expect(book.SheetNames).toEqual(['About', 'A Installation', 'B Production processes', 'C Emission sources',
      'D Electricity & heat', 'E Precursors', 'F Summary per good', 'G Default values used', 'H Data quality']);
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets['F Summary per good']);
    expect(rows[0]['SEE counted (t/t)']).toBe(Number(er.processes[0].products[0].seeCounted));
    expect(rows[0]['SEFA (t/t)']).toBe(Number(er.processes[0].products[0].sefa));
    // A formula typed as a label stays text in the sheet.
    const src = book.Sheets['C Emission sources'];
    const cell = Object.values(src).find((c: any) => c && c.v === '=HYPERLINK("x")') as XLSX.CellObject;
    expect(cell.t).toBe('s');
    expect(cell.f).toBeUndefined();
  });

  it('declarant workbook totals equal the result', () => {
    const book = buildImporterWorkbook(data, importer, ir);
    const totals = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets['C Totals']);
    expect(totals.find((r) => r.Item === 'Certificates')!.Value).toBe(Number(ir.totalCertificates));
    expect(totals.find((r) => r.Item === 'Cost (€)')!.Value).toBe(Number(ir.totalCost));
  });

  it('XML is well-formed, escaped, in IINVTY namespace, with the same figures', () => {
    const xml = exporterXml(data, exporter, er, new Date('2026-11-21T00:00:00Z'));
    expect(wellFormed(xml)).toBe(true);
    expect(xml).toContain(`xmlns="${EXPORT_NAMESPACE}"`);
    expect(xml).toContain('<Name>Rolling Mill &lt;A&amp;B&gt;</Name>');
    expect(xml).toContain(`seeCounted="${er.processes[0].products[0].seeCounted}"`);
    const ixml = importerXml(data, importer, ir);
    expect(wellFormed(ixml)).toBe(true);
    expect(ixml).toContain(`<Certificates>${ir.totalCertificates}</Certificates>`);
    expect(ixml).toContain('priceEur="75.28"');
  });
});

/** Tags balance and no raw '<' or '&' appear in text or attribute values. */
function wellFormed(xml: string): boolean {
  const body = xml.replace(/^<\?xml[^>]*\?>\s*/, '');
  const stack: string[] = [];
  const re = /<(\/?)([A-Za-z][\w.-]*)((?:\s+[\w:.-]+="[^"<&]*(?:&(?:amp|lt|gt|quot|apos);[^"<&]*)*")*)\s*(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  let consumed = 0;
  while ((m = re.exec(body))) {
    if (m.index !== consumed) return false;
    consumed = re.lastIndex;
    if (m[5] !== undefined) {
      if (/&(?!(amp|lt|gt|quot|apos);)/.test(m[5])) return false;
      continue;
    }
    if (m[1]) { if (stack.pop() !== m[2]) return false; }
    else if (!m[4]) stack.push(m[2]);
  }
  return consumed === body.length && stack.length === 0;
}
