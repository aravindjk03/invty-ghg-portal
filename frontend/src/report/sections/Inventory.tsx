/** Report parts 10-15: the inventory itself — Scope 1 by sub-category, Scope 2 dual reporting, Scope 3 across all fifteen categories. */
import React from 'react';
import { ActivityEntry } from '../../types/ghg';
import { CategoryBlock, GhgInventoryReport, Scope3Inclusion } from '../model/types';
import { GapNote, KeyValues, num, pct, Prose, ReportPage, SectionTitle, Table } from './primitives';

const EntryTable: React.FC<{ entries: ActivityEntry[] }> = ({ entries }) => (
  <Table
    headers={['Facility', 'Source', 'Activity data', 'Unit', 'Factor', 'Factor source', 'tCO2e', 'Evidence']}
    align={['left', 'left', 'right', 'left', 'right', 'left', 'right', 'left']}
    rows={entries.map((entry) => [
      entry.facility || '—',
      entry.fuelOrSource,
      num(entry.amount, 3),
      entry.unit,
      num(entry.customFactorOverride ?? entry.emissionFactor?.factorValue ?? 0, 4),
      entry.emissionFactor
        ? `${entry.emissionFactor.source} ${entry.emissionFactor.publicationYear || ''}`.trim()
        : 'Not recorded',
      num(entry.calculatedTco2e, 3),
      entry.evidenceFile || <span className="text-[#8A5A00] italic">None attached</span>,
    ])}
    emptyMessage="No records in this category."
  />
);

const Block: React.FC<{ number: string; block: CategoryBlock; note?: string }> = ({ number, block, note }) => (
  <>
    <SectionTitle number={number} note={note}>
      {block.label} — {num(block.tco2e)} tCO2e ({pct(block.shareOfScope)} of Scope 1)
    </SectionTitle>
    {block.gapNote ? <GapNote>{block.gapNote}</GapNote> : <EntryTable entries={block.entries} />}
  </>
);

export const ScopeOnePage: React.FC<{ report: GhgInventoryReport }> = ({ report }) => {
  const s1 = report.scope1;
  return (
    <ReportPage part="Parts 10-13" title={`Scope 1 — direct emissions (${num(s1.total)} tCO2e)`}>
      <Prose>
        Direct emissions from sources owned or controlled by the organisation, split into the four
        sub-categories an assurance provider expects to see assessed separately.
      </Prose>

      <Block number="10" block={s1.stationary}
        note="Boilers, furnaces, thermal oil heaters, ovens and standby generators." />
      <Block number="11" block={s1.mobile}
        note="Owned or controlled vehicles, forklifts and material-handling equipment. Reconcile fuel against purchase records, issue registers and vehicle logs." />
      <Block number="12" block={s1.process}
        note="Emissions from chemical or physical reactions rather than fuel combustion — calcination, reduction, and carbon-containing raw materials." />
      <Block number="13" block={s1.fugitive}
        note="Refrigerant losses from HVAC, chillers and cold storage; SF6 from electrical equipment; fire suppression gases." />

      {s1.fugitiveMethodNote && <GapNote>{s1.fugitiveMethodNote}</GapNote>}

      <SectionTitle number="13.1" note="Refrigerant purchased is not automatically refrigerant emitted. Each item states the method used: screening from purchases, mass balance, or a published leak rate.">
        Refrigerant equipment register
      </SectionTitle>
      <Table
        headers={['Equipment', 'Refrigerant', 'GWP', 'Initial charge kg', 'Recharge kg', 'Recovered kg', 'Loss kg', 'tCO2e', 'Method']}
        align={['left', 'left', 'right', 'right', 'right', 'right', 'right', 'right', 'left']}
        rows={s1.refrigerants.map((row) => [
          row.equipment, row.refrigerant,
          row.gwp !== undefined ? num(row.gwp, 0) : '—',
          row.initialChargeKg !== undefined ? num(row.initialChargeKg, 2) : '—',
          row.rechargeKg !== undefined ? num(row.rechargeKg, 2) : '—',
          row.recoveredKg !== undefined ? num(row.recoveredKg, 2) : '—',
          row.lossKg !== undefined ? num(row.lossKg, 2) : '—',
          row.tco2e !== undefined ? num(row.tco2e, 3) : '—',
          row.method,
        ])}
        emptyMessage="No refrigerant equipment recorded. List each chiller, HVAC unit, cold store, fire suppression system and SF6-containing switchgear with its charge, recharge, recovery and calculation method."
      />

      <SectionTitle
        number="13.2"
        note="These Scope 1 sources are published as equations with parameters, not as a factor per unit of activity, so each states the chapter and the equations it was calculated from. Their total is included in the Scope 1 figure above."
      >
        IPCC method sources — {num(s1.methodsTotal)} tCO2e
      </SectionTitle>
      <Table
        headers={['Source', 'Facility', 'Method', 'Gas masses (kg)', 'tCO2e', 'Basis', 'IPCC reference']}
        align={['left', 'left', 'left', 'left', 'right', 'left', 'left']}
        rows={s1.methods.map((row) => [
          row.label,
          row.facility || '—',
          row.method,
          row.refusedReason
            ? 'Not calculated'
            : row.gasMasses.map((gas) => `${gas.gas} ${num(gas.kg, 3)}`).join(', ') || '—',
          row.refusedReason ? '—' : num(row.tco2e, 3),
          row.gwpSet || '—',
          row.source,
        ])}
        emptyMessage="No IPCC method sources recorded. Livestock, managed soils, lime and urea, manure, wastewater treatment and solid waste disposal are Scope 1 sources that cannot be read off a factor table; confirm the site has none rather than assuming it."
      />

      {s1.methods.filter((row) => row.refusedReason).map((row) => (
        <GapNote key={`refused-${row.label}`}>
          {row.label} ({row.method}) could not be calculated and is excluded from every total:{' '}
          {row.refusedReason}
        </GapNote>
      ))}

      {s1.methods.flatMap((row) => row.notes.map((note) => (
        <Prose key={`${row.label}-${note}`}>
          <strong>{row.label}:</strong> {note}
        </Prose>
      )))}

      {s1.other.map((block) => (
        <Block key={block.key} number="13.x" block={block} />
      ))}
    </ReportPage>
  );
};

export const ScopeTwoPage: React.FC<{ report: GhgInventoryReport }> = ({ report }) => {
  const s2 = report.scope2;
  return (
    <ReportPage part="Part 14" title="Scope 2 — purchased energy">
      <Prose>
        Indirect emissions from purchased electricity, steam, heat and cooling, reported by both methods
        required by the GHG Protocol Scope 2 Guidance.
      </Prose>

      <KeyValues
        rows={[
          ['Location-based total', `${num(s2.locationBased)} tCO2e`],
          ['Market-based total', `${num(s2.marketBased)} tCO2e`],
          ['Guidance version applied', s2.guidanceVersion],
          ['Contractual instruments', s2.contractualInstruments.length > 0
            ? s2.contractualInstruments.join('; ')
            : <span className="text-[#8A5A00] italic">None recorded</span>],
        ]}
      />

      <GapNote>{s2.methodNote}</GapNote>

      <SectionTitle number="14.1">Purchased energy records</SectionTitle>
      <EntryTable entries={s2.entries} />

      <SectionTitle number="14.2">Method note</SectionTitle>
      <Prose>
        The location-based figure uses grid-average emission factors for the grid where consumption
        physically occurs. The market-based figure reflects contractual instruments, where these are
        documented and meet the Scope 2 quality criteria. Purchasing renewable electricity does not by
        itself make Scope 2 zero: the instrument, its vintage, and the residual mix treatment must all be
        evidenced.
      </Prose>
    </ReportPage>
  );
};

const INCLUSION_LABEL: Record<Scope3Inclusion, string> = {
  included: 'Included',
  excluded_not_applicable: 'Excluded — not applicable',
  excluded_no_data: 'Excluded — data unavailable',
  not_assessed: 'Not assessed',
};

export const ScopeThreePage: React.FC<{ report: GhgInventoryReport }> = ({ report }) => {
  const s3 = report.scope3;
  return (
    <ReportPage part="Part 15" title={`Scope 3 — value chain (${num(s3.total)} tCO2e)`}>
      <Prose>
        All fifteen categories are listed, whether or not data exists for them. "Not available" is not the
        same as "not applicable": a category with no data is shown as not assessed, and appears in the
        exclusion register in Part 26 until a screening decision is recorded.
      </Prose>

      <Table
        headers={['#', 'Category', 'Materiality', 'Status', 'tCO2e', 'Basis of the decision']}
        align={['left', 'left', 'left', 'left', 'right', 'left']}
        rows={s3.assessment.map((category) => [
          category.number,
          category.label,
          category.materiality === 'not_assessed' ? 'Not screened' : category.materiality,
          INCLUSION_LABEL[category.inclusion],
          category.tco2e > 0 ? num(category.tco2e) : '—',
          category.justification,
        ])}
      />

      <KeyValues
        rows={[
          ['Categories quantified', `${s3.categoriesIncluded} of 15`],
          ['Categories with a documented decision', `${s3.categoriesAssessed} of 15`],
          ['Scope 3 total reported', `${num(s3.total)} tCO2e`],
        ]}
      />
    </ReportPage>
  );
};
