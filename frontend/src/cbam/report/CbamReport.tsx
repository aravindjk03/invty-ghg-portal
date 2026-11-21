/**
 * The CBAM report: a document of its own, separate from the GHG inventory
 * report. Every figure here is read from the same calculation result the
 * calculator page shows.
 */
import React from 'react';
import { GapNote, KeyValues, Prose, ReportPage, SectionTitle, Table } from '../../report/sections/primitives';
import type { CbamData } from '../data';
import { formatCn, ROUTE_LABELS } from '../data';
import type { ExporterResult } from '../calculate';
import type { ImporterResult } from '../importer';
import type { DefaultUsed, ExporterInput, ImporterInput, Note } from '../model';
import { fmt, pctOf } from '../num';
import { SECTOR_LABEL } from '../fields';

export type CbamReportProps =
  | { role: 'exporter'; data: CbamData; input: ExporterInput; result: ExporterResult; generatedAt: Date }
  | { role: 'importer'; data: CbamData; input: ImporterInput; result: ImporterResult; generatedAt: Date };

const dateText = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

export const CbamReport: React.FC<CbamReportProps> = (props) => (
  <div className="flex flex-col items-center gap-6">
    {props.role === 'exporter' ? <ExporterReport {...props} /> : <ImporterReport {...props} />}
  </div>
);

const Cover: React.FC<{ title: string; subtitle: string; rows: [string, React.ReactNode][]; kpis: Array<[string, string]>; generatedAt: Date }> = ({
  title, subtitle, rows, kpis, generatedAt,
}) => (
  <ReportPage>
    <div className="flex flex-col min-h-[980px]">
      <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-brand-muted">EU Carbon Border Adjustment Mechanism · Regulation (EU) 2023/956</p>
      <h1 className="text-[30px] sm:text-[36px] font-bold text-brand-heading leading-tight mt-4">{title}</h1>
      <p className="text-[15px] text-brand-body mt-2">{subtitle}</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-10">
        {kpis.map(([k, v]) => (
          <div key={k} className="rounded-lg border border-border p-4">
            <p className="text-[10.5px] uppercase tracking-wider text-brand-muted font-semibold">{k}</p>
            <p className="text-[22px] font-bold text-brand-heading font-mono mt-1">{v}</p>
          </div>
        ))}
      </div>
      <div className="mt-10"><KeyValues rows={rows} /></div>
      <div className="mt-auto pt-10 text-[11.5px] text-brand-muted leading-relaxed">
        Prepared with the IINVTY CBAM calculator on {dateText(generatedAt)}. Default values, benchmarks and parameters are
        taken unchanged from the European Commission's published files; the sources are listed in this report. This report
        supports, but does not replace, the verified emissions report and the CBAM declaration.
      </div>
    </div>
  </ReportPage>
);

const NotesList: React.FC<{ notes: Note[] }> = ({ notes }) =>
  notes.length === 0 ? <Prose>No data-quality issues were found.</Prose> : (
    <ul className="list-disc pl-5 text-[12.5px] text-brand-body space-y-1">
      {notes.map((n, i) => <li key={i}><span className="font-semibold uppercase text-[10.5px] mr-1">{n.level}</span>{n.text}</li>)}
    </ul>
  );

const DefaultsTable: React.FC<{ rows: DefaultUsed[] }> = ({ rows }) => (
  <Table
    headers={['CN code', 'Table', 'Default (t/t)', 'Mark-up', 'Year', 'With mark-up', 'Route']}
    align={['left', 'left', 'right', 'right', 'right', 'right', 'left']}
    emptyMessage="No default values were used: every figure rests on actual data."
    rows={rows.map((d) => [
      formatCn(d.matchedCn), d.table, d.total, `${fmt(String(Number(d.markUp) * 100), 0)}%`, String(d.year), fmt(d.totalWithMarkUp, 4),
      d.route ? `${d.route} ${ROUTE_LABELS[d.route] ?? ''}` : '—',
    ])}
  />
);

const Sources: React.FC<{ data: CbamData; cscf: { value: string; preliminary: boolean } | null; cbamFactor: string | null; year: number }> = ({
  data, cscf, cbamFactor, year,
}) => {
  const p = data.parameters;
  const cite = (s: { doc: string; pdfPage: number; table?: string }) => `${s.doc}, PDF page ${s.pdfPage}${s.table ? `, ${s.table}` : ''}`;
  return (
    <Table
      headers={['What', 'Value used', 'Source']}
      rows={[
        ['Default values', 'Annex I by country; Annex IV for precursors of unknown origin', `${p.sources.defaultValues.act} (Commission file ${p.sources.defaultValues.fileVersion}, SHA-256 ${p.sources.defaultValues.sha256.slice(0, 12)}…)`],
        ['CBAM benchmarks', 'Column A (process), Column B (whole chain)', `${p.sources.benchmarks.act} (SHA-256 ${p.sources.benchmarks.sha256.slice(0, 12)}…)`],
        ['Default value mark-up', `10% 2026, 20% 2027, 30% from 2028; fertilisers 1%`, cite(p.markUp.source)],
        [`CBAM factor ${year}`, cbamFactor ?? '—', cite(p.cbamFactor.source)],
        [`Cross-sectoral correction factor ${year}`, cscf ? `${cscf.value}${cscf.preliminary ? ' (preliminary)' : ' (entered)'}` : '—', cite(p.cscf.source)],
        ['Indirect emissions counted', 'Cement and fertilisers only', cite(p.indirectCounted.source)],
        ['De minimis', `${p.deMinimis.tonnesPerYear} t net mass a year (not electricity or hydrogen)`, cite(p.deMinimis.source)],
        ['Certificate formula', p.obligation.formula, cite(p.obligation.source)],
        ['Free allocation adjustment', `${p.freeAllocation.processSFA}; ${p.freeAllocation.defaultSEFA}`, cite(p.freeAllocation.source)],
      ]}
    />
  );
};

const ExporterReport: React.FC<Extract<CbamReportProps, { role: 'exporter' }>> = ({ data, input, result, generatedAt }) => {
  const inst = input.installation;
  const products = result.processes.flatMap((p) => p.products.map((pr) => ({ ...pr, process: p.name })));
  const totalEmbedded = products.reduce((s, p) => s + Number(p.embeddedCounted), 0);
  const allNotes = [...result.notes, ...result.processes.flatMap((p) => p.notes.map((n) => ({ ...n, text: `${p.name}: ${n.text}` })))];
  return (
    <>
      <Cover
        title="CBAM Embedded Emissions Report"
        subtitle={`${inst.name || 'Installation'} · production year ${inst.year}`}
        generatedAt={generatedAt}
        kpis={[
          ['Goods reported', String(products.length)],
          ['Embedded emissions (counted)', `${fmt(String(totalEmbedded), 1)} t`],
          ['Processes', String(result.processes.length)],
        ]}
        rows={[
          ['Installation', inst.name || '—'], ['Operator', inst.operator || '—'], ['Country', inst.country],
          ['UN/LOCODE', inst.unlocode || '—'], ['Address', inst.address || '—'], ['Reporting period', `1 January – 31 December ${inst.year}`],
        ]}
      />

      <ReportPage part="Part 1" title="Embedded emissions per good">
        <SectionTitle number="1.1" note="Specific embedded emissions (SEE) in tonnes CO₂e per tonne of good. Indirect emissions are counted only for cement and fertilisers.">Summary per good</SectionTitle>
        <Table
          headers={['CN code', 'Good', 'Sector', 'Produced (t)', 'SEE direct', 'SEE indirect', 'SEE counted', 'Default share', 'SEFA']}
          align={['left', 'left', 'left', 'right', 'right', 'right', 'right', 'right', 'right']}
          rows={products.map((p) => [
            formatCn(p.cn), p.name || '—', p.sector ? SECTOR_LABEL[p.sector] : '—', fmt(p.tonnes, 1),
            fmt(p.seeDirect, 4), fmt(p.seeIndirect, 4), fmt(p.seeCounted, 4), pctOf(p.defaultShare), p.sefa ? fmt(p.sefa, 4) : 'n/c',
          ])}
        />
        <Prose>n/c: free allocation could not be calculated; the reason is listed under data quality.</Prose>
        <SectionTitle number="1.2">Specific embedded free allocation</SectionTitle>
        <Table headers={['Good', 'Benchmark (Column A)', 'Working']}
          rows={products.map((p) => [p.name || formatCn(p.cn), p.benchmark ? `${p.benchmark.value} ${p.benchmark.indicator}` : '—', p.sefaWorking || p.problem || '—'])} />
      </ReportPage>

      <ReportPage part="Part 2" title="Calculation by production process">
        {result.processes.map((p, i) => {
          const src = input.processes.find((x) => x.id === p.id);
          return (
            <div key={p.id} className="mb-8">
              <SectionTitle number={`2.${i + 1}`}>{p.name}</SectionTitle>
              <Table headers={['Source stream', 'tCO₂e', 'Source of factor or measurement']} align={['left', 'right', 'left']}
                emptyMessage="No direct emission sources entered."
                rows={p.lines.map((l) => [l.label || '—', fmt(l.tco2e, 3), l.source || 'Not given'])} />
              <KeyValues rows={[
                ['Directly attributable (DirEm*)', `${fmt(p.dirEm, 3)} t`],
                ['+ Heat imported − heat exported', `${fmt(p.heatImport, 3)} − ${fmt(p.heatExport, 3)} t`],
                ['+ Waste gas imported − exported', `${fmt(p.wasteGasImport, 3)} − ${fmt(p.wasteGasExport, 3)} t`],
                ['− Electricity produced', `${fmt(p.electricityProduced, 3)} t`],
                ['Attributed direct emissions', `${fmt(p.attrDirect, 3)} t`],
                ['Attributed indirect (electricity consumed)', `${fmt(p.attrIndirect, 3)} t (${src?.electricityMWh || 0} MWh × ${src?.electricityEF || 0}; ${src?.electricitySource || 'source not given'})`],
                ['Embedded direct incl. precursors', `${fmt(p.embeddedDirect, 3)} t`],
                ['Embedded indirect incl. precursors', `${fmt(p.embeddedIndirect, 3)} t`],
                ['Activity level (functional units)', fmt(p.activityLevel, 3)],
                ['SEE per functional unit (direct / indirect)', `${fmt(p.seeDirectPerFU, 4)} / ${fmt(p.seeIndirectPerFU, 4)}`],
              ]} />
              {p.precursors.length > 0 && (
                <>
                  <p className="text-[12px] font-semibold text-brand-heading mt-4 mb-1">Precursors</p>
                  <Table headers={['CN', 'Precursor', 'Consumed (t)', 'Data', 'SEE dir', 'SEE ind', 'Embedded (t)', 'SEFA']}
                    align={['left', 'left', 'right', 'left', 'right', 'right', 'right', 'right']}
                    rows={p.precursors.map((x) => [
                      formatCn(x.cn), x.name || '—', fmt(x.tonnes, 1),
                      x.basis === 'default' ? (x.defaultUsed?.table ?? 'Default') : x.basis === 'eu' ? 'EU origin' : x.origin === 'own_process' ? 'Own process' : 'Supplier (verified)',
                      fmt(x.seeDirect, 4), fmt(x.seeIndirect, 4),
                      fmt(String(Number(x.embeddedDirect) + Number(x.embeddedIndirect)), 2), x.sefa ? fmt(x.sefa, 4) : 'n/c',
                    ])} />
                </>
              )}
            </div>
          );
        })}
      </ReportPage>

      <ReportPage part="Part 3" title="Sources, method and data quality">
        <SectionTitle number="3.1">Default values used</SectionTitle>
        <DefaultsTable rows={result.defaultsUsed} />
        <SectionTitle number="3.2">Method</SectionTitle>
        <Prose>
          Attributed emissions follow Annex III to Implementing Regulation (EU) 2025/2547 as set out in Commission Guidance No. 3:
          AttrEm(dir) = DirEm* + Em(H,imp) − Em(H,exp) + WG(corr,imp) − WG(corr,exp) − Em(el,prod), set to zero if negative;
          AttrEm(indir) = Em(el,cons). Embedded emissions add each precursor's mass × its specific embedded emissions, and are
          divided by the activity level. Free allocation follows Guidance No. 4: SFA = CBAM factor × CSCF × benchmark (Column A),
          plus each precursor's mass per unit × its SEFA; EU-origin precursors count as zero.
        </Prose>
        <SectionTitle number="3.3">Parameters and sources</SectionTitle>
        <Sources data={data} cscf={result.cscf} cbamFactor={result.cbamFactor} year={inst.year} />
        <SectionTitle number="3.4">Data quality</SectionTitle>
        <NotesList notes={allNotes} />
        <GapNote>{data.parameters.sources.defaultValues.notIncluded}</GapNote>
      </ReportPage>

      <ReportPage part="Part 4" title="Operator's declaration" last>
        <Prose>
          I declare that the data in this report is, to the best of my knowledge, complete and correct, that it covers all
          production processes and precursors of the goods listed for the reporting period, and that the monitoring
          follows the CBAM rules. Actual data will be verified by an accredited verifier before it is used in a CBAM declaration.
        </Prose>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-10 mt-16">
          {['Name and position', 'Signature and date'].map((l) => (
            <div key={l}><div className="border-b border-brand-heading h-12" /><p className="text-[11.5px] text-brand-muted mt-1">{l}</p></div>
          ))}
        </div>
      </ReportPage>
    </>
  );
};

const ImporterReport: React.FC<Extract<CbamReportProps, { role: 'importer' }>> = ({ data, input, result, generatedAt }) => {
  const defaults = result.lines.flatMap((l) => (l.defaultUsed ? [l.defaultUsed] : []));
  const lineNotes: Note[] = result.lines.flatMap((l) => (l.problem ? [{ level: 'warning' as const, text: `${l.name || formatCn(l.cn)}: ${l.problem}` }] : []));
  return (
    <>
      <Cover
        title="CBAM Certificate Estimate"
        subtitle={`${input.declarant || 'Authorised CBAM declarant'} · imports in ${input.year}`}
        generatedAt={generatedAt}
        kpis={[
          ['Certificates', fmt(result.totalCertificates, 2)],
          ['Estimated cost', `€${fmt(result.totalCost, 2)}${result.costComplete ? '' : ' *'}`],
          ['Embedded emissions', `${fmt(result.totalEmbedded, 1)} t`],
        ]}
        rows={[
          ['Declarant', input.declarant || '—'], ['Year of import', String(input.year)],
          ['Goods lines', String(result.lines.length)], ['Net mass', `${fmt(result.totalTonnes, 1)} t`],
          ['Reference price (RP)', result.referencePrice.value ? `€${fmt(result.referencePrice.value, 2)} — ${result.referencePrice.basis}` : result.referencePrice.basis],
        ]}
      />
      <ReportPage part="Part 1" title="Certificates per goods line">
        <Table
          headers={['CN code', 'Goods', 'Origin', 'Mass (t)', 'Qtr', 'Data', 'SEE', 'SEFA', 'Carbon price ded.', 'Certificates', '€ / cert.', 'Cost (€)']}
          align={['left', 'left', 'left', 'right', 'left', 'left', 'right', 'right', 'right', 'right', 'right', 'right']}
          rows={result.lines.map((l) => [
            formatCn(l.cn), l.name || '—', l.country ?? 'Unknown', fmt(l.tonnes, 1), l.quarter, l.basis === 'default' ? 'Default' : 'Actual',
            fmt(l.see, 4), fmt(l.sefa, 4), fmt(l.carbonPriceDeductionPerTonne, 4), fmt(l.certificates, 2), fmt(l.price, 2), fmt(l.cost, 2),
          ])}
        />
        <Prose>
          Certificates per line = max[0; SEE − SEFA − carbon price paid ÷ RP] × mass. Total {fmt(result.totalCertificates, 2)} certificates,
          €{fmt(result.totalCost, 2)}{result.costComplete ? '' : ' (* lines without a published price are not included in the cost)'}.
        </Prose>
        <SectionTitle number="1.1">De minimis</SectionTitle>
        <Prose>
          {result.belowDeMinimis
            ? `These goods total ${fmt(result.deMinimisTonnes, 1)} t, at or below the ${data.parameters.deMinimis.tonnesPerYear} t threshold. The threshold applies to all of the declarant's CBAM imports in the year.`
            : `These goods total ${fmt(result.deMinimisTonnes, 1)} t (excluding electricity and hydrogen); the ${data.parameters.deMinimis.tonnesPerYear} t a year de minimis exemption does not apply on these figures alone.`}
        </Prose>
      </ReportPage>
      <ReportPage part="Part 2" title="Sources, method and data quality" last>
        <SectionTitle number="2.1">Default values used</SectionTitle>
        <DefaultsTable rows={defaults} />
        <SectionTitle number="2.2">Free allocation working</SectionTitle>
        <Table headers={['Goods', 'SEFA working']} rows={result.lines.map((l) => [l.name || formatCn(l.cn), l.sefaWorking || l.problem || '—'])} />
        <SectionTitle number="2.3">Parameters and sources</SectionTitle>
        <Sources data={data} cscf={result.cscf} cbamFactor={result.cbamFactor} year={input.year} />
        <SectionTitle number="2.4">Data quality</SectionTitle>
        <NotesList notes={[...result.notes, ...lineNotes]} />
        <GapNote>This is an estimate to plan certificate purchases. The CBAM declaration is made in the CBAM Registry with the verified figures.</GapNote>
      </ReportPage>
    </>
  );
};
