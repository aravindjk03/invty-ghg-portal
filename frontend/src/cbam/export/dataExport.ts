/**
 * Machine-readable CBAM export: the same figures as the report and workbook,
 * in XML and JSON.
 *
 * The structure is IINVTY's own (namespace urn:iinvty:cbam:export:1), documented
 * in docs/CBAM.md. It is not the CBAM Registry's declaration schema and must
 * not be uploaded there as if it were.
 */
import type { CbamData } from '../data';
import type { ExporterResult } from '../calculate';
import type { ImporterResult } from '../importer';
import type { ExporterInput, ImporterInput } from '../model';

export const EXPORT_NAMESPACE = 'urn:iinvty:cbam:export:1';

const esc = (v: unknown) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** <name attr="…">…</name>, skipping empty values. */
function el(name: string, value: unknown, attrs: Record<string, unknown> = {}): string {
  const a = Object.entries(attrs).filter(([, v]) => v != null && v !== '').map(([k, v]) => ` ${k}="${esc(v)}"`).join('');
  if (value == null || value === '') return `<${name}${a}/>`;
  return `<${name}${a}>${esc(value)}</${name}>`;
}

function header(data: CbamData, kind: string, at: Date): string {
  const p = data.parameters;
  return [
    `<Header>`,
    el('Kind', kind),
    el('Created', at.toISOString()),
    el('Notice', 'IINVTY export format. Not the CBAM Registry declaration schema.'),
    `<Sources>`,
    el('DefaultValues', p.sources.defaultValues.act, { sha256: p.sources.defaultValues.sha256 }),
    el('Benchmarks', p.sources.benchmarks.act, { sha256: p.sources.benchmarks.sha256 }),
    el('MarkUp', p.markUp.source.doc, { pdfPage: p.markUp.source.pdfPage }),
    el('CbamFactor', p.cbamFactor.source.doc, { table: p.cbamFactor.source.table }),
    el('Cscf', p.cscf.source.doc, { status: p.cscf.status }),
    `</Sources>`,
    `</Header>`,
  ].join('');
}

export function exporterXml(data: CbamData, input: ExporterInput, result: ExporterResult, at = new Date()): string {
  const i = input.installation;
  const body = [
    `<Installation>`, el('Name', i.name), el('Operator', i.operator), el('Country', i.country), el('UnLocode', i.unlocode),
    el('Address', i.address), el('ReportingYear', i.year), `</Installation>`,
    el('CbamFactor', result.cbamFactor), el('Cscf', result.cscf?.value, { preliminary: result.cscf?.preliminary }),
    `<Processes>`,
    ...result.processes.map((p) => [
      `<Process id="${esc(p.id)}">`, el('Name', p.name),
      `<AttributedEmissions unit="tCO2e">`, el('DirEm', p.dirEm), el('HeatImported', p.heatImport), el('HeatExported', p.heatExport),
      el('WasteGasImported', p.wasteGasImport), el('WasteGasExported', p.wasteGasExport), el('ElectricityProduced', p.electricityProduced),
      el('Direct', p.attrDirect), el('Indirect', p.attrIndirect), `</AttributedEmissions>`,
      `<SourceStreams>`, ...p.lines.map((l) => el('SourceStream', l.tco2e, { label: l.label, source: l.source, unit: 'tCO2e' })), `</SourceStreams>`,
      `<Precursors>`, ...p.precursors.map((x) => el('Precursor', null, {
        cn: x.cn, name: x.name, tonnes: x.tonnes, basis: x.basis, origin: x.origin, seeDirect: x.seeDirect, seeIndirect: x.seeIndirect,
        sefa: x.sefa, defaultTable: x.defaultUsed?.table,
      })), `</Precursors>`,
      el('ActivityLevel', p.activityLevel, { unit: 'functional units' }),
      `<Goods>`, ...p.products.map((g) => el('Good', null, {
        cn: g.cn, name: g.name, sector: g.sector, tonnes: g.tonnes, functionalUnitsPerTonne: g.functionalUnitsPerTonne,
        seeDirect: g.seeDirect, seeIndirect: g.seeIndirect, indirectCounted: g.indirectCounted, seeCounted: g.seeCounted,
        embeddedCounted: g.embeddedCounted, defaultShare: g.defaultShare, sefa: g.sefa,
        benchmark: g.benchmark ? `${g.benchmark.value}${g.benchmark.indicator}` : undefined,
      })), `</Goods>`,
      `</Process>`,
    ].join('')),
    `</Processes>`,
    `<DefaultValuesUsed>`, ...result.defaultsUsed.map((d) => el('DefaultValue', null, {
      cn: d.cn, matchedCn: d.matchedCn, table: d.table, total: d.total, markUp: d.markUp, year: d.year, totalWithMarkUp: d.totalWithMarkUp, route: d.route,
    })), `</DefaultValuesUsed>`,
  ].join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<CbamEmbeddedEmissions xmlns="${EXPORT_NAMESPACE}">${header(data, 'operator', at)}${body}</CbamEmbeddedEmissions>\n`;
}

export function importerXml(data: CbamData, input: ImporterInput, result: ImporterResult, at = new Date()): string {
  const body = [
    el('Declarant', input.declarant), el('Year', input.year),
    el('ReferencePrice', result.referencePrice.value, { currency: 'EUR', basis: result.referencePrice.basis }),
    el('CbamFactor', result.cbamFactor), el('Cscf', result.cscf?.value, { preliminary: result.cscf?.preliminary }),
    `<Lines>`, ...result.lines.map((l) => el('Line', null, {
      cn: l.cn, name: l.name, origin: l.country ?? 'unknown', tonnes: l.tonnes, quarter: l.quarter, basis: l.basis,
      see: l.see, sefa: l.sefa, carbonPriceDeduction: l.carbonPriceDeductionPerTonne, certificates: l.certificates,
      priceEur: l.price, costEur: l.cost, defaultTable: l.defaultUsed?.table, problem: l.problem,
    })), `</Lines>`,
    `<Totals>`, el('NetMass', result.totalTonnes, { unit: 't' }), el('EmbeddedEmissions', result.totalEmbedded, { unit: 'tCO2e' }),
    el('Certificates', result.totalCertificates), el('CostEur', result.totalCost, { complete: result.costComplete }),
    el('BelowDeMinimis', result.belowDeMinimis, { tonnes: result.deMinimisTonnes }), `</Totals>`,
  ].join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<CbamCertificateEstimate xmlns="${EXPORT_NAMESPACE}">${header(data, 'declarant', at)}${body}</CbamCertificateEstimate>\n`;
}

export function toJson(kind: 'operator' | 'declarant', input: unknown, result: unknown, data: CbamData, at = new Date()): string {
  return JSON.stringify({
    format: EXPORT_NAMESPACE, kind, created: at.toISOString(),
    notice: 'IINVTY export format. Not the CBAM Registry declaration schema.',
    sources: data.parameters.sources, input, result,
  }, null, 2);
}

export function downloadText(text: string, filename: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
