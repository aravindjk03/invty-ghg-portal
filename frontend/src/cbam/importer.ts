/**
 * CBAM certificates for an EU declarant, line by line.
 *
 * Commission Guidance No. 1 (combining Articles 7, 9 and 31 of the CBAM
 * Regulation):
 *
 *   Obligation_g = max[0; SEE_g − SEFA_g − SECPP_g / RP_CBAM] × M_g
 *
 * With default values, SEE is the Annex I value for the country of origin
 * (or 'Other countries and territories') plus the mark-up for the year, and
 * SEFA = CBAM_y · CSCF_y · BM_B, the production route coming from the same
 * Annex I row (Guidance No. 4, equation 6 and section 2.2.1.3).
 */
import Decimal from 'decimal.js';
import { dec as D, has } from './num';
import {
  CbamData, cbamFactorFor, cscfFor, formatCn, indirectCounts, lookupBenchmark, lookupDefault, sectorOf,
} from './data';
import type { DefaultUsed, ImportLine, ImporterInput, Note, Sector } from './model';


export interface ImportLineResult {
  id: string;
  cn: string;
  name: string;
  sector: Sector | null;
  country: string | null;
  tonnes: string;
  quarter: string;
  basis: 'default' | 'actual';
  see: string | null;
  sefa: string | null;
  sefaWorking: string;
  carbonPriceDeductionPerTonne: string;
  obligationPerTonne: string | null;
  certificates: string | null;
  price: string | null;
  cost: string | null;
  defaultUsed?: DefaultUsed;
  routeOptions?: string[];
  problem?: string;
}

export interface ImporterResult {
  lines: ImportLineResult[];
  totalTonnes: string;
  deMinimisTonnes: string;
  belowDeMinimis: boolean;
  totalEmbedded: string;
  totalCertificates: string;
  totalCost: string;
  costComplete: boolean;
  referencePrice: { value: string | null; basis: string };
  cbamFactor: string | null;
  cscf: { value: string; preliminary: boolean } | null;
  notes: Note[];
}

/** RP_CBAM: the yearly average of the certificate prices. Until all four 2026 quarters are published it is provisional. */
export function referencePriceFor(data: CbamData, input: ImporterInput): { value: string | null; basis: string } {
  if (has(input.referencePrice)) return { value: D(input.referencePrice).toString(), basis: 'Entered by you.' };
  const published = data.parameters.certificatePrice.quarterly2026.filter((q) => q.eurPerCertificate);
  if (input.year !== 2026 || published.length === 0) return { value: null, basis: 'Enter the reference price.' };
  const avg = published.reduce((s, q) => s.plus(q.eurPerCertificate!), new Decimal(0)).dividedBy(published.length);
  const provisional = published.length < 4;
  return {
    value: avg.toString(),
    basis: `Average of the published 2026 quarterly prices (${published.map((q) => q.quarter.split(' ')[0]).join(', ')})`
      + (provisional ? '; provisional until all four quarters are published.' : '.'),
  };
}

export function publishedPrice(data: CbamData, year: number, quarter: string): string | null {
  if (year !== 2026) return null;
  return data.parameters.certificatePrice.quarterly2026.find((q) => q.quarter === `${quarter} 2026`)?.eurPerCertificate ?? null;
}

export function calculateImporter(data: CbamData, input: ImporterInput): ImporterResult {
  const notes: Note[] = [];
  const year = input.year;
  const cbamFactor = cbamFactorFor(data, year);
  const cscf = cscfFor(data, year, input.cscfOverride);
  const rp = referencePriceFor(data, input);
  if (cscf?.preliminary) {
    notes.push({ level: 'warning', text: `Cross-sectoral correction factor ${cscf.value} is preliminary. ${data.parameters.cscf.note}` });
  }

  const lines: ImportLineResult[] = input.lines.map((l: ImportLine) => {
    const sector = sectorOf(data, l.cn);
    const tonnes = D(l.tonnes);
    const base = {
      id: l.id, cn: l.cn, name: l.name, sector, country: l.country, tonnes: tonnes.toString(), quarter: l.quarter, basis: l.basis,
    };
    const fail = (problem: string, extra: Partial<ImportLineResult> = {}): ImportLineResult => ({
      ...base, see: null, sefa: null, sefaWorking: '', carbonPriceDeductionPerTonne: '0', obligationPerTonne: null,
      certificates: null, price: null, cost: null, problem, ...extra,
    });
    if (!sector) return fail(`CN ${formatCn(l.cn)} is not a CBAM good.`);

    let see: Decimal;
    let sefa: Decimal | null = null;
    let sefaWorking = '';
    let defaultUsed: DefaultUsed | undefined;
    let routeOptions: string[] | undefined;

    if (l.basis === 'default') {
      const hit = lookupDefault(data, l.cn, l.country, year, false);
      if (!hit.ok) return fail(hit.reason);
      see = new Decimal(hit.counted);
      defaultUsed = hit.used;
      if (sector === 'electricity') { sefa = new Decimal(0); sefaWorking = data.parameters.freeAllocation.electricity; }
      else if (cbamFactor && cscf) {
        const route = l.route || (hit.routes.length === 1 ? hit.routes[0] : undefined);
        const bm = lookupBenchmark(data, l.cn, 'B', route, year);
        if (bm.ok) {
          sefa = new Decimal(cbamFactor).times(cscf.value).times(bm.value);
          sefaWorking = `${cbamFactor} × ${cscf.value} × ${bm.value}${bm.indicator ? ` ${bm.indicator}` : ''} (Column B)`;
        } else {
          routeOptions = bm.options ?? (hit.routes.length > 1 ? hit.routes : undefined);
          return fail(bm.reason, { see: see.toString(), defaultUsed, routeOptions });
        }
      }
    } else {
      if (!has(l.seeDirect)) return fail("Enter the specific embedded emissions from the operator's verified report.");
      see = D(l.seeDirect).plus(indirectCounts(data, sector) ? D(l.seeIndirect) : 0);
      if (sector === 'electricity') { sefa = new Decimal(0); sefaWorking = data.parameters.freeAllocation.electricity; }
      else if (has(l.sefa)) { sefa = D(l.sefa); sefaWorking = "From the operator's verified report."; }
      else return fail("Enter the specific embedded free allocation from the operator's report.", { see: see.toString() });
    }
    if (sefa == null) return fail(`No CBAM factor is published for ${year}.`, { see: see.toString() });

    let deduction = new Decimal(0);
    if (has(l.carbonPricePaidPerTonne)) {
      if (!rp.value) return fail('Enter the reference price to convert the carbon price paid.', { see: see.toString(), sefa: sefa.toString() });
      deduction = D(l.carbonPricePaidPerTonne).dividedBy(rp.value);
    }
    const perTonne = Decimal.max(0, see.minus(sefa).minus(deduction));
    const certificates = perTonne.times(tonnes);
    const priceRaw = input.certificatePrice[l.quarter] ?? publishedPrice(data, year, l.quarter);
    const price = has(priceRaw) ? D(priceRaw) : null;
    return {
      ...base, see: see.toString(), sefa: sefa.toString(), sefaWorking,
      carbonPriceDeductionPerTonne: deduction.toString(), obligationPerTonne: perTonne.toString(),
      certificates: certificates.toString(), price: price?.toString() ?? null,
      cost: price ? certificates.times(price).toString() : null, defaultUsed, routeOptions,
      problem: price ? undefined : `No certificate price for ${l.quarter} ${year} yet: enter it to see the cost.`,
    };
  });

  const total = (pick: (l: ImportLineResult) => string | null) =>
    lines.reduce((s, l) => (pick(l) ? s.plus(pick(l)!) : s), new Decimal(0));
  const excluded = new Set(data.parameters.deMinimis.excludedSectors);
  const deMinimisTonnes = lines.filter((l) => !l.sector || !excluded.has(l.sector)).reduce((s, l) => s.plus(l.tonnes), new Decimal(0));
  const threshold = new Decimal(data.parameters.deMinimis.tonnesPerYear);
  const hasExcluded = lines.some((l) => l.sector && excluded.has(l.sector));
  const belowDeMinimis = lines.length > 0 && !hasExcluded && deMinimisTonnes.lte(threshold);
  if (belowDeMinimis) {
    notes.push({ level: 'info', text: `These goods total ${deMinimisTonnes.toString()} t, at or below the ${threshold.toString()} t a year de minimis threshold. The threshold counts all your CBAM imports in the year (except electricity and hydrogen), not just these lines.` });
  }
  const embedded = lines.reduce((s, l) => (l.see ? s.plus(new Decimal(l.see).times(l.tonnes)) : s), new Decimal(0));

  return {
    lines,
    totalTonnes: lines.reduce((s, l) => s.plus(l.tonnes), new Decimal(0)).toString(),
    deMinimisTonnes: deMinimisTonnes.toString(),
    belowDeMinimis,
    totalEmbedded: embedded.toString(),
    totalCertificates: total((l) => l.certificates).toString(),
    totalCost: total((l) => l.cost).toString(),
    costComplete: lines.every((l) => l.cost != null),
    referencePrice: rp,
    cbamFactor,
    cscf,
    notes,
  };
}
