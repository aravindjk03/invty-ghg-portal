/**
 * Excel export of the CBAM calculation.
 *
 * For an operator, the sheets follow the order of the Commission's operator
 * emissions report (installation, processes, emission sources, precursors,
 * summary per good) so the figures can be carried into the official template.
 * It is not the official template file, and says so on its first sheet.
 */
import * as XLSX from 'xlsx';
import { safeFilename } from '../../lib/utils';
import type { CbamData } from '../data';
import { formatCn, SECTOR_LABEL } from '../data';
import type { ExporterResult } from '../calculate';
import type { ImporterResult } from '../importer';
import type { DefaultUsed, ExporterInput, ImporterInput } from '../model';

type Row = Record<string, string | number | null>;

const n = (v: string | null | undefined): number | null => (v == null || v === '' ? null : Number(v));

function sheet(book: XLSX.WorkBook, name: string, rows: Row[]) {
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: 'Nothing recorded' }]), name.slice(0, 31));
}

function about(data: CbamData, kind: string): Row[] {
  const p = data.parameters;
  return [
    { Item: 'Document', Value: kind },
    { Item: 'Status', Value: "Prepared with the IINVTY CBAM calculator. Laid out like the Commission's operator emissions report; this is not the official template file." },
    { Item: 'Default values', Value: `${p.sources.defaultValues.act} (file ${p.sources.defaultValues.file}, SHA-256 ${p.sources.defaultValues.sha256})` },
    { Item: 'Benchmarks', Value: `${p.sources.benchmarks.act} (file ${p.sources.benchmarks.file}, SHA-256 ${p.sources.benchmarks.sha256})` },
    { Item: 'Mark-up', Value: `10% 2026, 20% 2027, 30% from 2028; fertilisers 1% — ${p.markUp.source.doc}, PDF page ${p.markUp.source.pdfPage}` },
    { Item: 'CBAM factor', Value: `${JSON.stringify(p.cbamFactor.byYear)} — ${p.cbamFactor.source.doc}, ${p.cbamFactor.source.table}` },
    { Item: 'Cross-sectoral correction factor', Value: `${JSON.stringify(p.cscf.byYear)} (${p.cscf.status}) — ${p.cscf.note}` },
    { Item: 'Not included', Value: p.sources.defaultValues.notIncluded },
  ];
}

const defaultsRows = (rows: DefaultUsed[]): Row[] => rows.map((d) => ({
  'CN code': formatCn(d.cn), 'Matched CN in table': formatCn(d.matchedCn), Table: d.table,
  'Direct (t/t)': n(d.direct), 'Indirect (t/t)': n(d.indirect), 'Total (t/t)': n(d.total),
  'Mark-up': n(d.markUp), Year: d.year, 'Total with mark-up (t/t)': n(d.totalWithMarkUp), Route: d.route, Note: d.note ?? '',
}));

export function buildExporterWorkbook(data: CbamData, input: ExporterInput, result: ExporterResult): XLSX.WorkBook {
  const book = XLSX.utils.book_new();
  const inst = input.installation;
  sheet(book, 'About', about(data, 'CBAM embedded emissions — operator'));
  sheet(book, 'A Installation', [
    { Field: 'Installation name', Value: inst.name }, { Field: 'Operator', Value: inst.operator },
    { Field: 'Country', Value: inst.country }, { Field: 'UN/LOCODE', Value: inst.unlocode },
    { Field: 'Address', Value: inst.address }, { Field: 'Reporting period', Value: `${inst.year}-01-01 to ${inst.year}-12-31` },
  ]);
  sheet(book, 'B Production processes', result.processes.map((p) => ({
    Process: p.name, 'DirEm* (t)': n(p.dirEm), 'Heat imported (t)': n(p.heatImport), 'Heat exported (t)': n(p.heatExport),
    'Waste gas imported (t)': n(p.wasteGasImport), 'Waste gas exported (t)': n(p.wasteGasExport),
    'Electricity produced (t)': n(p.electricityProduced), 'AttrEm direct (t)': n(p.attrDirect), 'AttrEm indirect (t)': n(p.attrIndirect),
    'Embedded direct (t)': n(p.embeddedDirect), 'Embedded indirect (t)': n(p.embeddedIndirect),
    'Activity level (FU)': n(p.activityLevel), 'SEE direct per FU': n(p.seeDirectPerFU), 'SEE indirect per FU': n(p.seeIndirectPerFU),
  })));
  sheet(book, 'C Emission sources', input.processes.flatMap((p) => p.direct.map((l) => {
    const res = result.processes.find((x) => x.id === p.id)?.lines.find((x) => x.id === l.id);
    return {
      Process: p.name, 'Source stream': l.label, Method: l.kind === 'calc' ? 'Calculation' : 'Measured',
      Activity: n(l.activity ?? null), Unit: l.activityUnit ?? '', 'EF (tCO2e/unit)': n(l.emissionFactor ?? null),
      'Oxidation factor': n(l.oxidationFactor ?? null), 'Emissions (tCO2e)': n(res?.tco2e), Source: l.source,
    };
  })));
  sheet(book, 'D Electricity & heat', input.processes.map((p) => ({
    Process: p.name, 'Electricity consumed (MWh)': n(p.electricityMWh ?? null), 'EF (tCO2e/MWh)': n(p.electricityEF ?? null),
    'Electricity source': p.electricitySource ?? '', 'Heat imported (TJ)': n(p.heatImportTJ ?? null), 'Heat EF imp (tCO2/TJ)': n(p.heatImportEF ?? null),
    'Heat exported (TJ)': n(p.heatExportTJ ?? null), 'Heat EF exp (tCO2/TJ)': n(p.heatExportEF ?? null), 'Heat source': p.heatSource ?? '',
    'Waste gas imported (TJ)': n(p.wasteGasImportTJ ?? null), 'Waste gas exported (TJ)': n(p.wasteGasExportTJ ?? null),
    'Natural gas EF (tCO2/TJ)': n(p.naturalGasEF ?? null), 'Electricity produced (tCO2e)': n(p.electricityProducedTco2e ?? null),
  })));
  sheet(book, 'E Precursors', result.processes.flatMap((p) => p.precursors.map((x) => ({
    Process: p.name, 'CN code': formatCn(x.cn), Precursor: x.name, 'Consumed (t)': n(x.tonnes),
    Data: x.basis === 'default' ? 'Default value' : x.basis === 'eu' ? 'EU origin' : x.origin === 'own_process' ? 'Own process' : 'Supplier (verified)',
    'SEE direct': n(x.seeDirect), 'SEE indirect': n(x.seeIndirect), 'Embedded direct (t)': n(x.embeddedDirect),
    'Embedded indirect (t)': n(x.embeddedIndirect), SEFA: n(x.sefa), 'Default table': x.defaultUsed?.table ?? '', Problem: x.problem ?? '',
  }))));
  sheet(book, 'F Summary per good', result.processes.flatMap((p) => p.products.map((pr) => ({
    Process: p.name, 'CN code': formatCn(pr.cn), Good: pr.name, Sector: pr.sector ? SECTOR_LABEL[pr.sector] : '', 'Produced (t)': n(pr.tonnes),
    'FU per t': n(pr.functionalUnitsPerTonne), 'SEE direct (t/t)': n(pr.seeDirect), 'SEE indirect (t/t)': n(pr.seeIndirect),
    'Indirect counted': pr.indirectCounted ? 'Yes' : 'No', 'SEE counted (t/t)': n(pr.seeCounted),
    'Embedded counted (t)': n(pr.embeddedCounted), 'Default share': n(pr.defaultShare),
    'Benchmark A': pr.benchmark ? `${pr.benchmark.value} ${pr.benchmark.indicator}`.trim() : '', 'SEFA (t/t)': n(pr.sefa),
    'SEFA working': pr.sefaWorking || pr.problem || '',
  }))));
  sheet(book, 'G Default values used', defaultsRows(result.defaultsUsed));
  sheet(book, 'H Data quality', [...result.notes, ...result.processes.flatMap((p) => p.notes.map((x) => ({ ...x, text: `${p.name}: ${x.text}` })))]
    .map((x) => ({ Level: x.level, Note: x.text })));
  return book;
}

export function buildImporterWorkbook(data: CbamData, input: ImporterInput, result: ImporterResult): XLSX.WorkBook {
  const book = XLSX.utils.book_new();
  sheet(book, 'About', about(data, 'CBAM certificate estimate — declarant'));
  sheet(book, 'A Declarant', [
    { Field: 'Declarant', Value: input.declarant }, { Field: 'Year of import', Value: input.year },
    { Field: 'Reference price RP (€)', Value: result.referencePrice.value }, { Field: 'RP basis', Value: result.referencePrice.basis },
    { Field: 'CBAM factor', Value: result.cbamFactor }, { Field: 'CSCF', Value: result.cscf ? `${result.cscf.value}${result.cscf.preliminary ? ' (preliminary)' : ''}` : null },
  ]);
  sheet(book, 'B Goods lines', result.lines.map((l) => ({
    'CN code': formatCn(l.cn), Goods: l.name, Origin: l.country ?? 'Unknown', 'Net mass (t)': n(l.tonnes), Quarter: l.quarter,
    Data: l.basis, 'SEE (t/t)': n(l.see), 'SEFA (t/t)': n(l.sefa), 'SEFA working': l.sefaWorking,
    'Carbon price deduction (t/t)': n(l.carbonPriceDeductionPerTonne), 'Obligation (t/t)': n(l.obligationPerTonne),
    Certificates: n(l.certificates), '€ per certificate': n(l.price), 'Cost (€)': n(l.cost), Problem: l.problem ?? '',
  })));
  sheet(book, 'C Totals', [
    { Item: 'Net mass (t)', Value: n(result.totalTonnes) }, { Item: 'Embedded emissions (t)', Value: n(result.totalEmbedded) },
    { Item: 'Certificates', Value: n(result.totalCertificates) }, { Item: 'Cost (€)', Value: n(result.totalCost) },
    { Item: 'Cost complete', Value: result.costComplete ? 'Yes' : 'No: some lines have no price' },
    { Item: 'Mass for de minimis (t)', Value: n(result.deMinimisTonnes) }, { Item: 'Below de minimis on these lines', Value: result.belowDeMinimis ? 'Yes' : 'No' },
  ]);
  sheet(book, 'D Default values used', defaultsRows(result.lines.flatMap((l) => (l.defaultUsed ? [l.defaultUsed] : []))));
  sheet(book, 'E Data quality', result.notes.map((x) => ({ Level: x.level, Note: x.text })));
  return book;
}

export function downloadWorkbook(book: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(book, safeFilename(filename));
}
