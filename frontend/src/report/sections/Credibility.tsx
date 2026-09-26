/** Report parts 25-30: base year, exclusions, data quality, uncertainty, QA/QC and internal verification. */
import React from 'react';
import { GhgInventoryReport } from '../model/types';
import { GapNote, KeyValues, num, Outcome, pct, Prose, ReportPage, SectionTitle, Table } from './primitives';

export const BaseYearPage: React.FC<{ report: GhgInventoryReport }> = ({ report }) => {
  const { baseYear, exclusions } = report;
  return (
    <ReportPage part="Parts 25-26" title="Base year and exclusions">
      <SectionTitle number="25">Base year and recalculation policy</SectionTitle>
      <KeyValues
        rows={[
          ['Base year', baseYear.baseYear],
          ['Base year emissions', baseYear.baseYearEmissions !== undefined
            ? `${num(baseYear.baseYearEmissions)} tCO2e`
            : <span className="text-[#8A5A00] italic">Not recorded</span>],
          ['Significance threshold', `${baseYear.recalculationThresholdPercent}% of base year Scope 1 + 2`],
        ]}
      />
      <Prose>{baseYear.policyStatement}</Prose>
      <SectionTitle number="25.1">Recalculation triggers</SectionTitle>
      <ul className="list-disc pl-5 text-[12.5px] text-brand-body space-y-1 mb-4">
        {baseYear.triggers.map((trigger) => <li key={trigger}>{trigger}</li>)}
      </ul>

      <SectionTitle number="26" note="Every source that is out of the inventory, why it is out, and what will be done about it. A blank reason is not acceptable in assurance.">
        Exclusion register
      </SectionTitle>
      <Table
        headers={['Source', 'Reason', 'Estimated significance', 'Improvement action', 'Target']}
        rows={exclusions.map((exclusion) => [
          exclusion.source, exclusion.reason, exclusion.estimatedSignificance,
          exclusion.improvementAction, exclusion.targetCompletion,
        ])}
        emptyMessage="Nothing is excluded: every source inside the boundary is quantified."
      />
    </ReportPage>
  );
};

export const QualityPage: React.FC<{ report: GhgInventoryReport }> = ({ report }) => (
  <ReportPage part="Parts 27-28" title="Data quality and uncertainty">
    <SectionTitle number="27" note="Rated per source, from the factor tier, the completeness of the records and whether evidence is attached.">
      Data quality assessment
    </SectionTitle>
    <Table
      headers={['Source', 'Accuracy', 'Completeness', 'Reliability', 'Overall', 'Basis']}
      rows={report.dataQuality.map((row) => [
        row.source, row.accuracy, row.completeness, row.reliability,
        <strong key={row.source}>{row.overall}</strong>, row.basis,
      ])}
      emptyMessage="No activity data recorded, so quality cannot be assessed."
    />

    <SectionTitle number="28" note="Measured, calculated, estimated and proxy data carry different confidence. The share of the inventory in each band shows how much of the total rests on weaker data.">
      Uncertainty assessment
    </SectionTitle>
    <Table
      headers={['Certainty band', 'Data type', 'Sources', 'tCO2e', 'Share of total']}
      align={['left', 'left', 'left', 'right', 'right']}
      rows={report.uncertainty.map((row) => [
        row.band, row.dataType, row.sources.slice(0, 4).join(', ') + (row.sources.length > 4 ? '…' : ''),
        num(row.tco2e), pct(row.shareOfTotal),
      ])}
      emptyMessage="No activity data recorded."
    />
  </ReportPage>
);

export const QaQcPage: React.FC<{ report: GhgInventoryReport }> = ({ report }) => {
  const { qaqc, readiness } = report;
  return (
    <ReportPage part="Parts 29-30" title="QA/QC and internal verification">
      <SectionTitle number="29" note="Run automatically over the recorded inventory each time this report is produced.">
        Quality assurance and control checks
      </SectionTitle>
      <Table
        headers={['ID', 'Check', 'Result', 'Detail']}
        rows={qaqc.map((check) => [
          check.id, check.check, <Outcome key={check.id} outcome={check.outcome} />, check.detail,
        ])}
      />

      <SectionTitle number="30" note="The questions an internal reviewer should ask before the inventory is submitted for assurance.">
        Internal verification — challenge test
      </SectionTitle>
      <ul className="list-disc pl-5 text-[12.5px] text-brand-body space-y-1 mb-4">
        {['Where did this number come from, and can you show the original record?',
          'Why was this emission factor selected over the alternatives?',
          'Why is this source in Scope 1 rather than Scope 3?',
          'Why is this source excluded, and what is its estimated significance?',
          'Can this calculation be reproduced independently from the evidence?',
          'What physically caused the year-on-year change?',
          'Did the factor set or GWP basis change since last year?',
          'Was the base year recalculated, and was the policy applied consistently?'].map((question) => (
            <li key={question}>{question}</li>
          ))}
      </ul>

      <div className="border border-border rounded-lg p-4 bg-surface-raised">
        <div className="flex items-baseline gap-3 mb-2">
          <span className="text-2xl font-bold text-brand-heading font-mono">{readiness.score}/100</span>
          <span className="text-sm font-semibold text-brand-heading">{readiness.level}</span>
        </div>
        <p className="text-[11px] text-brand-muted mb-2">
          Evidence coverage 40 points · QA/QC results 30 · Scope 3 screening 20 · report metadata 10.
        </p>
        {readiness.blockers.length > 0 ? (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-muted">Blockers</p>
            <ul className="list-disc pl-5 text-[12px] text-brand-body">
              {readiness.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
            </ul>
          </>
        ) : (
          <p className="text-[12px] text-brand-body">
            No blockers outstanding. An independent verifier can be engaged under ISO 14064-3.
          </p>
        )}
      </div>

      {readiness.level !== 'Verification ready' && (
        <GapNote>
          This document is an inventory report, not a verified GHG statement. It becomes a verification
          package when every figure traces to evidence, all fifteen Scope 3 categories carry a decision,
          and the QA/QC checks pass.
        </GapNote>
      )}
    </ReportPage>
  );
};
