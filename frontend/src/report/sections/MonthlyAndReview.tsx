/** Report parts 21, 38-39: monthly analysis, the reviewer's red flags, and the build hierarchy. */
import React from 'react';
import { GhgInventoryReport } from '../model/types';
import { GapNote, num, Prose, ReportPage, SectionTitle, Table } from './primitives';

export const MonthlyPage: React.FC<{ report: GhgInventoryReport }> = ({ report }) => {
  const { monthly } = report;
  return (
    <ReportPage part="Part 21" title="Monthly data analysis">
      <Prose>
        An annual total hides seasonality, production-driven variation, abnormal consumption, metering
        problems and missing months. Each record is grouped by the month it belongs to.
      </Prose>

      {monthly.available ? (
        <Table
          headers={['Month', 'Scope 1', 'Scope 2', 'Scope 3', 'Total tCO2e', 'Records']}
          align={['left', 'right', 'right', 'right', 'right', 'right']}
          rows={monthly.rows.map((row) => [
            row.missing ? <span key={row.month} className="text-[#8A5A00] italic">{row.month}</span> : row.month,
            row.missing ? '—' : num(row.scope1),
            row.missing ? '—' : num(row.scope2),
            row.missing ? '—' : num(row.scope3),
            row.missing ? <span className="text-[#8A5A00] italic">No data</span> : num(row.total),
            row.recordCount,
          ])}
        />
      ) : null}

      {monthly.observations.map((observation) => <GapNote key={observation}>{observation}</GapNote>)}

      <SectionTitle number="21.1">What monthly analysis is for</SectionTitle>
      <ul className="list-disc pl-5 text-[12.5px] text-brand-body space-y-1">
        {['Seasonality, and whether it matches production',
          'Production-driven variation against output volume',
          'Abnormal consumption that points at a leak, a fault or a meter error',
          'Data gaps: a month with no record is either a shutdown or a missing reading',
          'Maintenance-related spikes, which should reconcile with the maintenance log'].map((item) => (
            <li key={item}>{item}</li>
          ))}
      </ul>
    </ReportPage>
  );
};

export const ReviewerTestPage: React.FC<{ report: GhgInventoryReport }> = ({ report }) => {
  const flagged = report.reviewerFlags.filter((flag) => flag.present);
  return (
    <ReportPage part="Parts 38-39" title="Reviewer test and build hierarchy">
      <SectionTitle number="38" note="The statements an expert reviewer would challenge, tested against this report before anyone else does.">
        What a reviewer would question
      </SectionTitle>
      <Table
        headers={['Statement a reviewer would reject', 'Present here?', 'On what basis']}
        rows={report.reviewerFlags.map((flag) => [
          flag.statement,
          flag.present
            ? <strong key={flag.statement} className="text-[#B42318]">Yes</strong>
            : <span className="text-[#1F5C3D]">No</span>,
          flag.evidence,
        ])}
      />

      {flagged.length > 0 ? (
        <GapNote>
          {flagged.length} of {report.reviewerFlags.length} weaknesses are present in this report. Each one
          is a question an assurance provider will ask; the basis column says what to fix.
        </GapNote>
      ) : (
        <Prose>
          None of the common weaknesses are present: the boundary is shown, every factor is cited, all
          fifteen Scope 3 categories are assessed, the fugitive calculation method is stated, the Scope 2
          treatment is documented, every exclusion has a reason, the GWP basis is stated, and every figure
          traces to a record.
        </Prose>
      )}

      <SectionTitle number="39" note="The order in which a defensible inventory is built, and where this one stands at each level.">
        Build hierarchy
      </SectionTitle>
      <Table
        headers={['Level', 'Stage', 'Question it answers', 'Status in this report']}
        align={['right', 'left', 'left', 'left']}
        rows={report.buildHierarchy.map((level) => [
          level.level, <strong key={level.name}>{level.name}</strong>, level.question, level.status,
        ])}
      />
    </ReportPage>
  );
};
