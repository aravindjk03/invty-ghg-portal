/** Report parts 16-20: data collection, evidence register, factor register, GWP basis and calculation methodology. */
import React from 'react';
import { GhgInventoryReport } from '../model/types';
import { GapNote, KeyValues, num, Prose, ReportPage, SectionTitle, Table } from './primitives';

export const MethodologyPage: React.FC<{ report: GhgInventoryReport }> = ({ report }) => {
  const { methodology } = report;
  return (
    <ReportPage part="Parts 16, 19-20" title="Methodology">
      <SectionTitle number="16" note="Every figure follows this path, and each step is auditable.">
        Data collection and calculation architecture
      </SectionTitle>
      <ol className="text-[12.5px] text-brand-body mb-4 space-y-1">
        {methodology.dataFlow.map((step, index) => (
          <li key={step} className="flex gap-2">
            <span className="font-mono text-brand-muted w-6">{String(index + 1).padStart(2, '0')}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>

      <SectionTitle number="19">Global warming potential basis</SectionTitle>
      <KeyValues rows={[['GWP basis applied', methodology.gwpBasis]]} />
      {methodology.gwpBasis === 'Not recorded'
        ? <GapNote>{methodology.gwpNote}</GapNote>
        : <Prose>{methodology.gwpNote}</Prose>}

      <SectionTitle number="20">Calculation formulas</SectionTitle>
      <Table
        headers={['Applies to', 'Formula']}
        rows={methodology.formulas.map((formula) => [
          formula.label,
          <code key={formula.label} className="font-mono text-[11px]">{formula.formula}</code>,
        ])}
      />

      <SectionTitle number="18.1" note="Where two factors could apply, the higher item in this list is used, and the choice is recorded against the source.">
        Emission factor selection hierarchy
      </SectionTitle>
      <ol className="list-decimal pl-5 text-[12.5px] text-brand-body space-y-1">
        {methodology.factorHierarchy.map((level) => <li key={level}>{level}</li>)}
      </ol>
    </ReportPage>
  );
};

export const RegistersPage: React.FC<{ report: GhgInventoryReport }> = ({ report }) => (
  <ReportPage part="Parts 17-18" title="Evidence and emission factor registers">
    <SectionTitle number="17" note="Each reported figure must be reproducible from the original record. A source with no attached document is flagged here and in Part 29.">
      Evidence register
    </SectionTitle>
    <Table
      headers={['ID', 'Source', 'Data type', 'Frequency', 'Evidence held']}
      rows={report.evidenceRegister.map((row) => [
        row.id, row.source, row.dataType, row.frequency,
        row.hasEvidence ? row.evidence : <span className="text-[#8A5A00] italic">{row.evidence}</span>,
      ])}
      emptyMessage="No activity data recorded, so there is nothing to evidence yet."
    />

    <SectionTitle number="18" note="A factor without a cited source, year and geography cannot be defended in assurance.">
      Emission factor register
    </SectionTitle>
    <Table
      headers={['ID', 'Activity', 'Factor', 'Unit', 'Source', 'Year', 'Age', 'Tier', 'Used by']}
      align={['left', 'left', 'right', 'left', 'left', 'right', 'right', 'left', 'right']}
      rows={report.factorRegister.map((factor) => [
        factor.id,
        factor.activity,
        num(factor.factorValue, 4),
        factor.unit,
        factor.source,
        factor.publicationYear || '—',
        factor.ageYears < 0
          ? <span className="text-[#8A5A00] italic">unknown</span>
          : `${factor.ageYears} yr`,
        factor.qualityTier,
        factor.usedByEntries,
      ])}
      emptyMessage="No emission factors in use yet."
    />
  </ReportPage>
);
