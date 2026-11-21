/**
 * Embedded emissions of goods made at one installation (the operator's side).
 *
 * The method is Commission Guidance No. 3, section 4.2.2 (Annex III to the
 * Methodology Act), applied per production process:
 *
 *   AttrEm_dir   = DirEm* + Em_H,imp − Em_H,exp + WG_corr,imp − WG_corr,exp − Em_el,prod   (set to 0 if negative)
 *   AttrEm_indir = Em_el,cons
 *   EE_dir       = AttrEm_dir   + Σ M_i · SEE_i,dir
 *   EE_indir     = AttrEm_indir + Σ M_i · SEE_i,indir
 *   SEE          = EE / AL      (per functional unit; × functional units per tonne for each product)
 *
 * and the specific embedded free allocation, Guidance No. 4 equations 2–6:
 *
 *   SFA  = CBAM_y · CSCF_y · BM_A
 *   SEFA = SFA + Σ m_i · SEFA_i        (EU-origin precursors: 0; default-value precursors: CBAM_y · CSCF_y · BM_B)
 */
import Decimal from 'decimal.js';
import { dec as D, has } from './num';
import {
  CbamData, cbamFactorFor, cscfFor, formatCn, indirectCounts, lookupBenchmark, lookupDefault, sectorOf,
} from './data';
import type { DefaultUsed, EmissionLine, ExporterInput, Note, Process, Product, Sector } from './model';

/** Correction for waste gas efficiency against natural gas, Guidance No. 3 equation 54. */
export const CORR_ETA_WASTE_GAS = '0.667';


export interface LineResult { id: string; label: string; tco2e: string; source: string }

export interface PrecursorResult {
  id: string;
  cn: string;
  name: string;
  tonnes: string;
  origin: string;
  seeDirect: string | null;
  seeIndirect: string | null;
  embeddedDirect: string;
  embeddedIndirect: string;
  sefa: string | null;
  basis: 'actual' | 'default' | 'eu';
  defaultUsed?: DefaultUsed;
  problem?: string;
}

export interface ProductResult {
  id: string;
  cn: string;
  name: string;
  sector: Sector | null;
  tonnes: string;
  functionalUnitsPerTonne: string;
  /** Per tonne of product. */
  seeDirect: string;
  seeIndirect: string;
  /** Indirect included only where it counts for the sector (cement, fertilisers). */
  seeCounted: string;
  indirectCounted: boolean;
  embeddedCounted: string;
  /** Share of the embedded emissions that rest on default values. */
  defaultShare: string;
  sefa: string | null;
  sefaWorking: string;
  benchmark?: { value: string; indicator: string; matchedCn: string };
  problem?: string;
}

export interface ProcessResult {
  id: string;
  name: string;
  lines: LineResult[];
  dirEm: string;
  heatImport: string;
  heatExport: string;
  wasteGasImport: string;
  wasteGasExport: string;
  electricityProduced: string;
  attrDirectRaw: string;
  attrDirect: string;
  attrIndirect: string;
  precursors: PrecursorResult[];
  embeddedDirect: string;
  embeddedIndirect: string;
  activityLevel: string;
  seeDirectPerFU: string;
  seeIndirectPerFU: string;
  products: ProductResult[];
  notes: Note[];
}

export interface ExporterResult {
  processes: ProcessResult[];
  defaultsUsed: DefaultUsed[];
  cbamFactor: string | null;
  cscf: { value: string; preliminary: boolean } | null;
  notes: Note[];
}

export function lineTco2e(line: EmissionLine): Decimal {
  if (line.kind === 'measured') return D(line.tco2e);
  const ox = has(line.oxidationFactor) ? D(line.oxidationFactor) : new Decimal(1);
  return D(line.activity).times(D(line.emissionFactor)).times(ox);
}

/** Order processes so that a process comes after any own process it takes a precursor from. */
function orderProcesses(processes: Process[]): { order: Process[]; cycle?: string } {
  const byId = new Map(processes.map((p) => [p.id, p]));
  const done = new Set<string>();
  const visiting = new Set<string>();
  const order: Process[] = [];
  let cycle: string | undefined;
  const visit = (p: Process) => {
    if (done.has(p.id) || cycle) return;
    if (visiting.has(p.id)) { cycle = p.name; return; }
    visiting.add(p.id);
    for (const pr of p.precursors) {
      if (pr.origin === 'own_process' && pr.ownProcessId && byId.has(pr.ownProcessId)) visit(byId.get(pr.ownProcessId)!);
    }
    visiting.delete(p.id);
    done.add(p.id);
    order.push(p);
  };
  processes.forEach(visit);
  return { order, cycle };
}

export function calculateExporter(data: CbamData, input: ExporterInput): ExporterResult {
  const year = input.installation.year;
  const notes: Note[] = [];
  const defaultsUsed: DefaultUsed[] = [];
  const cbamFactor = cbamFactorFor(data, year);
  const cscf = cscfFor(data, year, input.cscfOverride);
  if (cscf?.preliminary) {
    notes.push({ level: 'warning', text: `Cross-sectoral correction factor ${cscf.value} is preliminary. ${data.parameters.cscf.note}` });
  }
  const { order, cycle } = orderProcesses(input.processes);
  if (cycle) {
    notes.push({ level: 'error', text: `Process "${cycle}" takes a precursor from itself through other processes. Remove the loop.` });
    return { processes: [], defaultsUsed, cbamFactor, cscf, notes };
  }

  const done = new Map<string, ProcessResult>();
  const results: ProcessResult[] = [];

  for (const p of order) {
    const pNotes: Note[] = [];
    const lines = p.direct.map((l) => ({ id: l.id, label: l.label, tco2e: lineTco2e(l).toString(), source: l.source }));
    for (const l of p.direct) {
      if (!l.source.trim()) pNotes.push({ level: 'warning', text: `"${l.label || 'Unnamed line'}" has no source for its factor or measurement.` });
    }
    const dirEm = lines.reduce((s, l) => s.plus(l.tco2e), new Decimal(0));
    const heatImport = D(p.heatImportTJ).times(D(p.heatImportEF));
    const heatExport = D(p.heatExportTJ).times(D(p.heatExportEF));
    const wgImport = D(p.wasteGasImportTJ).times(D(p.naturalGasEF));
    const wgExport = D(p.wasteGasExportTJ).times(D(p.naturalGasEF)).times(CORR_ETA_WASTE_GAS);
    if ((has(p.wasteGasImportTJ) || has(p.wasteGasExportTJ)) && !has(p.naturalGasEF)) {
      pNotes.push({ level: 'warning', text: 'Waste gases are entered but the natural gas emission factor is missing.' });
    }
    const elProd = D(p.electricityProducedTco2e);
    const attrRaw = dirEm.plus(heatImport).minus(heatExport).plus(wgImport).minus(wgExport).minus(elProd);
    const attrDirect = Decimal.max(attrRaw, 0);
    if (attrRaw.isNeg()) pNotes.push({ level: 'info', text: 'Attributed direct emissions came out negative and are set to zero, as the method requires.' });
    const attrIndirect = D(p.electricityMWh).times(D(p.electricityEF));
    if (has(p.electricityMWh) && !has(p.electricitySource)) {
      pNotes.push({ level: 'warning', text: 'Electricity consumed has no source for its emission factor.' });
    }

    // Functional units: activity level of the process.
    const al = p.products.reduce((s, pr) => s.plus(D(pr.tonnes).times(has(pr.functionalUnitsPerTonne) ? D(pr.functionalUnitsPerTonne) : 1)), new Decimal(0));

    const precursors: PrecursorResult[] = [];
    let eeDirect = attrDirect;
    let eeIndirect = attrIndirect;
    let defaultEmbedded = new Decimal(0);
    let precursorSefaTotal = new Decimal(0);
    let sefaComplete = true;

    for (const pc of p.precursors) {
      const mass = D(pc.tonnes);
      const base = { id: pc.id, cn: pc.cn, name: pc.name, tonnes: mass.toString(), origin: pc.origin };
      let seeDir: Decimal | null = null;
      let seeInd: Decimal | null = null;
      let sefa: Decimal | null = null;
      let basis: PrecursorResult['basis'] = 'actual';
      let defaultUsed: DefaultUsed | undefined;
      let problem: string | undefined;

      if (pc.origin === 'own_process') {
        const src = pc.ownProcessId ? done.get(pc.ownProcessId) : undefined;
        const prod = src?.products.find((x) => x.id === pc.ownProductId) ?? src?.products[0];
        if (!src || !prod) problem = 'Choose the process and product that make this precursor.';
        else {
          seeDir = new Decimal(prod.seeDirect);
          seeInd = new Decimal(prod.seeIndirect);
          sefa = prod.sefa != null ? new Decimal(prod.sefa) : null;
        }
      } else if (pc.origin === 'supplier_actual') {
        if (!has(pc.supplierSeeDirect)) problem = "Enter the supplier's verified specific embedded emissions.";
        seeDir = D(pc.supplierSeeDirect);
        seeInd = D(pc.supplierSeeIndirect);
        sefa = has(pc.supplierSefa) ? D(pc.supplierSefa) : null;
      } else if (pc.origin === 'eu') {
        // Precursors from the EU carry their cost in the EU ETS; their free allocation counts as zero.
        basis = 'eu';
        seeDir = new Decimal(0);
        seeInd = new Decimal(0);
        sefa = new Decimal(0);
      } else {
        basis = 'default';
        const hit = lookupDefault(data, pc.cn, pc.country ?? null, year, true);
        if (!hit.ok) problem = hit.reason;
        else {
          seeDir = new Decimal(hit.direct);
          seeInd = new Decimal(hit.indirect);
          defaultUsed = hit.used;
          defaultsUsed.push(hit.used);
          const route = pc.route || (hit.routes.length === 1 ? hit.routes[0] : undefined);
          const bm = lookupBenchmark(data, pc.cn, 'B', route, year);
          if (bm.ok && cbamFactor && cscf) sefa = new Decimal(cbamFactor).times(cscf.value).times(bm.value);
        }
      }

      if (pc.origin === 'eu') {
        pNotes.push({ level: 'info', text: `${pc.name || formatCn(pc.cn)} is from the EU: no embedded emissions are added and its free allocation is zero.` });
      }
      const embDir = seeDir ? mass.times(seeDir) : new Decimal(0);
      const embInd = seeInd ? mass.times(seeInd) : new Decimal(0);
      eeDirect = eeDirect.plus(embDir);
      eeIndirect = eeIndirect.plus(embInd);
      if (basis === 'default') defaultEmbedded = defaultEmbedded.plus(embDir).plus(embInd);
      if (sefa == null) sefaComplete = false;
      else precursorSefaTotal = precursorSefaTotal.plus(mass.times(sefa));
      if (problem) pNotes.push({ level: 'error', text: `Precursor ${pc.name || formatCn(pc.cn)}: ${problem}` });

      precursors.push({
        ...base,
        seeDirect: seeDir?.toString() ?? null,
        seeIndirect: seeInd?.toString() ?? null,
        embeddedDirect: embDir.toString(),
        embeddedIndirect: embInd.toString(),
        sefa: sefa?.toString() ?? null,
        basis,
        defaultUsed,
        problem,
      });
    }

    const seeDirFU = al.isZero() ? new Decimal(0) : eeDirect.dividedBy(al);
    const seeIndFU = al.isZero() ? new Decimal(0) : eeIndirect.dividedBy(al);
    if (al.isZero()) pNotes.push({ level: 'error', text: 'Enter the quantity produced of at least one product.' });
    const precursorSefaPerFU = al.isZero() ? new Decimal(0) : precursorSefaTotal.dividedBy(al);

    const products: ProductResult[] = p.products.map((pr: Product) => {
      const fu = has(pr.functionalUnitsPerTonne) ? D(pr.functionalUnitsPerTonne) : new Decimal(1);
      const sector = sectorOf(data, pr.cn);
      const counts = indirectCounts(data, sector);
      const sd = seeDirFU.times(fu);
      const si = seeIndFU.times(fu);
      const counted = counts ? sd.plus(si) : sd;
      const tonnes = D(pr.tonnes);
      const embeddedTotal = eeDirect.plus(counts ? eeIndirect : 0);
      const share = embeddedTotal.isZero() ? new Decimal(0) : Decimal.min(1, defaultEmbedded.dividedBy(embeddedTotal));

      let sefa: Decimal | null = null;
      let sefaWorking = '';
      let benchmark: ProductResult['benchmark'];
      let problem: string | undefined;
      if (sector === 'electricity') {
        sefa = new Decimal(0);
        sefaWorking = data.parameters.freeAllocation.electricity;
      } else if (!sector) {
        problem = `CN ${formatCn(pr.cn)} is not a CBAM good.`;
      } else if (!cbamFactor || !cscf) {
        problem = `No CBAM factor is published for ${year}.`;
      } else {
        const bm = lookupBenchmark(data, pr.cn, 'A', pr.route, year);
        if (!bm.ok) problem = bm.reason;
        else {
          benchmark = { value: bm.value, indicator: bm.indicator, matchedCn: bm.matchedCn };
          if (new Decimal(bm.value).isZero() && p.precursors.length === 0) {
            pNotes.push({ level: 'info', text: `${pr.name || formatCn(pr.cn)}: its process benchmark (Column A) is 0, so its free allocation comes only from precursors such as clinker. Enter the precursor as its own process to include it.` });
          }
          const sfa = new Decimal(cbamFactor).times(cscf.value).times(bm.value);
          if (!sefaComplete) problem = 'Free allocation of one or more precursors is missing.';
          else {
            sefa = sfa.plus(precursorSefaPerFU.times(fu));
            sefaWorking = `${cbamFactor} × ${cscf.value} × ${bm.value}${bm.indicator ? ` ${bm.indicator}` : ''}`
              + (precursorSefaTotal.isZero() ? '' : ` + precursors ${precursorSefaPerFU.times(fu).toSignificantDigits(6).toString()}`);
          }
        }
      }
      if (problem) pNotes.push({ level: 'warning', text: `${pr.name || formatCn(pr.cn)}: free allocation not calculated. ${problem}` });

      return {
        id: pr.id, cn: pr.cn, name: pr.name, sector, tonnes: tonnes.toString(), functionalUnitsPerTonne: fu.toString(),
        seeDirect: sd.toString(), seeIndirect: si.toString(), seeCounted: counted.toString(), indirectCounted: counts,
        embeddedCounted: counted.times(tonnes).toString(), defaultShare: share.toString(),
        sefa: sefa?.toString() ?? null, sefaWorking, benchmark, problem,
      };
    });

    const result: ProcessResult = {
      id: p.id, name: p.name, lines,
      dirEm: dirEm.toString(), heatImport: heatImport.toString(), heatExport: heatExport.toString(),
      wasteGasImport: wgImport.toString(), wasteGasExport: wgExport.toString(), electricityProduced: elProd.toString(),
      attrDirectRaw: attrRaw.toString(), attrDirect: attrDirect.toString(), attrIndirect: attrIndirect.toString(),
      precursors, embeddedDirect: eeDirect.toString(), embeddedIndirect: eeIndirect.toString(),
      activityLevel: al.toString(), seeDirectPerFU: seeDirFU.toString(), seeIndirectPerFU: seeIndFU.toString(),
      products, notes: pNotes,
    };
    done.set(p.id, result);
    results.push(result);
  }

  // Report processes in the order the user entered them.
  const position = new Map(input.processes.map((p, i) => [p.id, i]));
  results.sort((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0));
  return { processes: results, defaultsUsed, cbamFactor, cscf, notes };
}
