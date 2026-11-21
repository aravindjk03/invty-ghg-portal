import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import raw from './data/cbamData.json';
import type { CbamData } from './data';
import { lookupBenchmark, lookupDefault, OTHER_COUNTRIES } from './data';
import { calculateExporter } from './calculate';
import { calculateImporter } from './importer';
import type { ExporterInput, ImporterInput, Process } from './model';

const data = raw as unknown as CbamData;
const r = (v: string | null | undefined, dp: number) => new Decimal(v ?? 'NaN').toFixed(dp);

const installation = { name: 'Plant', operator: 'Op', country: 'India', unlocode: 'INXXX', address: '', year: 2026 };
const proc = (p: Partial<Process> & Pick<Process, 'id' | 'products'>): Process => ({
  name: p.id, direct: [], precursors: [], ...p,
});

describe('Commission worked example: cement bubble with clinker functional units (Guidance No. 3, 4.3.3)', () => {
  const input: ExporterInput = {
    installation,
    processes: [proc({
      id: 'cement',
      direct: [{ id: 'l1', label: 'Total direct emissions', kind: 'measured', tco2e: '125000', source: 'Guidance No. 3 example' }],
      products: [
        { id: 'grey', cn: '25232900', name: 'Grey Portland cement', tonnes: '50000', functionalUnitsPerTonne: '0.95' },
        { id: 'white', cn: '25232100', name: 'White cement', tonnes: '40000', functionalUnitsPerTonne: '0.98' },
        { id: 'mixed', cn: '25239000', name: 'Mixed special cement', tonnes: '60000', functionalUnitsPerTonne: '0.97', route: '(B)' },
      ],
    })],
  };
  const res = calculateExporter(data, input);
  const p = res.processes[0];

  it('divides by 144 900 t clinker and gives 0.863 t CO2/t clinker', () => {
    expect(p.activityLevel).toBe('144900');
    expect(r(p.seeDirectPerFU, 3)).toBe('0.863');
  });
  it('gives each cement the published SEE and AttrEm', () => {
    const by = Object.fromEntries(p.products.map((x) => [x.id, x]));
    expect(r(by.grey.seeDirect, 3)).toBe('0.820');
    expect(r(by.white.seeDirect, 3)).toBe('0.845');
    expect(r(by.mixed.seeDirect, 3)).toBe('0.837');
    expect(r(by.grey.embeddedCounted, 1)).toBe('40976.5');
    expect(r(by.white.embeddedCounted, 1)).toBe('33816.4');
    expect(r(by.mixed.embeddedCounted, 1)).toBe('50207.0');
  });
});

describe('default values (Implementing Regulation 2025/2621 as corrected)', () => {
  it('India rebar 2026: Annex I value plus the 10 % mark-up, direct only', () => {
    const hit = lookupDefault(data, '7214 20 00', 'India', 2026);
    expect(hit.ok).toBe(true);
    if (!hit.ok) return;
    expect(hit.used.total).toBe('4.270');
    expect(hit.counted).toBe('4.697');
    expect(hit.indirect).toBe('0');
    expect(hit.used.table).toBe('Annex I – India');
    expect(hit.routes).toEqual(['(C)']);
  });
  it('mark-up rises to 20 % in 2027 and 30 % from 2028', () => {
    const at = (y: number) => { const h = lookupDefault(data, '72142000', 'India', y); return h.ok ? h.counted : null; };
    expect(at(2027)).toBe('5.124');
    expect(at(2028)).toBe('5.551');
    expect(at(2031)).toBe('5.551');
  });
  it('fertilisers get the 1 % mark-up and count indirect emissions', () => {
    const hit = lookupDefault(data, '28141000', 'India', 2028);
    expect(hit.ok && hit.counted).toBe('3.3128');
    expect(hit.ok && hit.indirect).toBe('0.2222');
  });
  it('a "-" for the country falls back to Other countries and territories', () => {
    const hit = lookupDefault(data, '2507008080', 'Albania', 2026);
    expect(hit.ok).toBe(true);
    if (!hit.ok) return;
    expect(hit.used.table).toBe(`Annex I – ${OTHER_COUNTRIES}`);
    expect(hit.used.total).toBe('0.280');
    expect(hit.used.note).toMatch(/No value for Albania/);
  });
  it('a precursor of unknown origin uses Annex IV', () => {
    const hit = lookupDefault(data, '7201', null, 2026, true);
    expect(hit.ok && hit.used.table).toMatch(/Annex IV/);
    expect(hit.ok && hit.counted).toBe('8.712');
  });
  it('electricity has no loaded default and says so', () => {
    const hit = lookupDefault(data, '27160000', 'India', 2026);
    expect(hit.ok).toBe(false);
  });
});

describe('benchmarks (Implementing Regulation 2025/2620)', () => {
  it('reproduces Guidance No. 4 Table 2-3 for crude steel', () => {
    expect(lookupBenchmark(data, '72071111', 'A', '(C)', 2026)).toMatchObject({ ok: true, value: '0.188' });
    expect(lookupBenchmark(data, '72071111', 'B', '(C)', 2026)).toMatchObject({ ok: true, value: '1.364' });
    expect(lookupBenchmark(data, '72071111', 'B', '(E)', 2026)).toMatchObject({ ok: true, value: '0.066' });
  });
  it('asks for the route instead of guessing', () => {
    const bm = lookupBenchmark(data, '72071111', 'B', undefined, 2026);
    expect(bm.ok).toBe(false);
    expect(!bm.ok && bm.options).toEqual(['(C)', '(D)', '(E)']);
  });
  it('picks the year-dependent value for ferro-manganese', () => {
    expect(lookupBenchmark(data, '72021120', 'A', undefined, 2026)).toMatchObject({ ok: true, value: '1.361' });
    expect(lookupBenchmark(data, '72021120', 'A', undefined, 2028)).toMatchObject({ ok: true, value: '1.277' });
  });
});

describe('exporter: precursors and free allocation', () => {
  const steel: ExporterInput = {
    installation,
    processes: [
      proc({
        id: 'rolling',
        direct: [{ id: 'f', label: 'Natural gas', kind: 'calc', activity: '1000', emissionFactor: '0.0561', oxidationFactor: '1', source: 'test factor' }],
        electricityMWh: '2000', electricityEF: '0.7', electricitySource: 'test grid factor',
        products: [{ id: 'bar', cn: '72142000', name: 'Rebar', tonnes: '10000', functionalUnitsPerTonne: '1' }],
        precursors: [{ id: 'billet', cn: '72071114', name: 'Billet', tonnes: '10500', origin: 'default', country: 'India', route: '(C)' }],
      }),
    ],
  };
  const res = calculateExporter(data, steel);
  const p = res.processes[0];
  const bar = p.products[0];

  it('adds the precursor default (with mark-up) to the attributed emissions', () => {
    // Billet, India: 4.270 × 1.10 = 4.697 t/t; 10 500 t → 49 318.5 t
    expect(p.precursors[0].seeDirect).toBe('4.697');
    expect(p.precursors[0].embeddedDirect).toBe('49318.5');
    expect(p.attrDirect).toBe('56.1');
    expect(r(bar.seeDirect, 6)).toBe(r(String((56.1 + 49318.5) / 10000), 6));
  });
  it('does not count indirect emissions for steel, but reports them', () => {
    expect(p.attrIndirect).toBe('1400');
    expect(bar.indirectCounted).toBe(false);
    expect(bar.seeCounted).toBe(bar.seeDirect);
  });
  it('records that almost all of it rests on default values', () => {
    expect(Number(bar.defaultShare)).toBeGreaterThan(0.99);
    expect(res.defaultsUsed).toHaveLength(1);
  });
  it('free allocation: own process (Column A) plus the precursor (Column B)', () => {
    // SFA = 0.975 × 1.0 × 0.038; precursor SEFA = 0.975 × 1.0 × 1.364 (billet, route C) × 10 500 / 10 000
    const expected = new Decimal('0.975').times('0.038').plus(new Decimal('0.975').times('1.364').times('10500').dividedBy('10000'));
    expect(bar.sefa).toBe(expected.toString());
  });
  it('flags the preliminary cross-sectoral correction factor', () => {
    expect(res.notes.some((n) => /preliminary/.test(n.text))).toBe(true);
  });
  it('uses an own process as precursor and refuses loops', () => {
    const twoStep: ExporterInput = {
      installation,
      processes: [
        proc({ id: 'roll', products: [{ id: 'bar', cn: '72142000', name: 'Bar', tonnes: '100', functionalUnitsPerTonne: '1' }],
          precursors: [{ id: 'p', cn: '72071114', name: 'Billet', tonnes: '105', origin: 'own_process', ownProcessId: 'melt', route: '(C)' }] }),
        proc({ id: 'melt', direct: [{ id: 'm', label: 'EAF', kind: 'measured', tco2e: '50', source: 'meter' }],
          products: [{ id: 'billet', cn: '72071114', name: 'Billet', tonnes: '105', functionalUnitsPerTonne: '1', route: '(E)' }] }),
      ],
    };
    const out = calculateExporter(data, twoStep);
    const roll = out.processes.find((x) => x.id === 'roll')!;
    expect(roll.embeddedDirect).toBe('50');
    expect(r(roll.products[0].seeDirect, 3)).toBe('0.500');
    const loop = { ...twoStep, processes: twoStep.processes.map((p) => p.id === 'melt'
      ? { ...p, precursors: [{ id: 'x', cn: '72142000', name: 'Bar', tonnes: '1', origin: 'own_process' as const, ownProcessId: 'roll' }] } : p) };
    expect(calculateExporter(data, loop).notes.some((n) => n.level === 'error')).toBe(true);
  });
});

describe('importer: certificates (Guidance No. 1 formula)', () => {
  const base: ImporterInput = {
    declarant: 'EU Importer', year: 2026, certificatePrice: {},
    lines: [{ id: 'a', cn: '72142000', name: 'Rebar', country: 'India', tonnes: '100', quarter: 'Q3', basis: 'default' }],
  };
  it('default values: SEE − SEFA, times tonnes, at the published Q3 2026 price', () => {
    const res = calculateImporter(data, base);
    const l = res.lines[0];
    expect(l.see).toBe('4.697');
    expect(l.sefa).toBe(new Decimal('0.975').times('1.0').times('1.364').toString());
    const perTonne = new Decimal('4.697').minus(l.sefa!);
    expect(l.certificates).toBe(perTonne.times(100).toString());
    expect(l.price).toBe('82.32');
    expect(l.cost).toBe(perTonne.times(100).times('82.32').toString());
  });
  it('deducts carbon price paid at the reference price, never below zero', () => {
    const res = calculateImporter(data, { ...base, referencePrice: '80',
      lines: [{ ...base.lines[0], carbonPricePaidPerTonne: '40' }, { ...base.lines[0], id: 'b', carbonPricePaidPerTonne: '100000' }] });
    expect(res.lines[0].carbonPriceDeductionPerTonne).toBe('0.5');
    expect(res.lines[1].certificates).toBe('0');
  });
  it('the provisional reference price is the average of the published 2026 quarters', () => {
    const res = calculateImporter(data, base);
    expect(res.referencePrice.value).toBe(new Decimal('75.36').plus('75.28').plus('82.32').dividedBy(3).toString());
    expect(res.referencePrice.basis).toMatch(/provisional/);
  });
  it('actual data from the operator, indirect counted only for cement and fertilisers', () => {
    const res = calculateImporter(data, { ...base, lines: [
      { id: 'c', cn: '25232900', name: 'Cement', country: 'India', tonnes: '10', quarter: 'Q1', basis: 'actual', seeDirect: '0.8', seeIndirect: '0.1', sefa: '0.5' },
      { id: 's', cn: '72142000', name: 'Steel', country: 'India', tonnes: '10', quarter: 'Q1', basis: 'actual', seeDirect: '2', seeIndirect: '1', sefa: '1' },
    ] });
    expect(res.lines[0].see).toBe('0.9');
    expect(res.lines[1].see).toBe('2');
  });
  it('de minimis: 50 t a year, not for hydrogen or electricity', () => {
    expect(calculateImporter(data, { ...base, lines: [{ ...base.lines[0], tonnes: '50' }] }).belowDeMinimis).toBe(true);
    expect(calculateImporter(data, { ...base, lines: [{ ...base.lines[0], tonnes: '50.1' }] }).belowDeMinimis).toBe(false);
    expect(calculateImporter(data, { ...base, lines: [{ ...base.lines[0], cn: '28041000', tonnes: '1' }] }).belowDeMinimis).toBe(false);
  });
  it('asks for the route when the Annex I row gives two', () => {
    const res = calculateImporter(data, { ...base, lines: [{ ...base.lines[0], cn: '7205', country: 'India' }] });
    expect(res.lines[0].problem).toBeTruthy();
  });
});

describe('coverage', () => {
  it('every CBAM good either has a default for Other countries, or a stated reason', () => {
    for (const [cn] of data.goods) {
      const hit = lookupDefault(data, cn, OTHER_COUNTRIES, 2026);
      if (!hit.ok) expect(hit.reason).toMatch(/No default value|not loaded/);
    }
  });
});
