/** Report parts 31-32 and 35-41: reduction measures, targets, annexures, definitions and standards. */
import React from 'react';
import { GhgInventoryReport } from '../model/types';
import { GapNote, num, Prose, ReportPage, SectionTitle, Table } from './primitives';

export const ActionPage: React.FC<{ report: GhgInventoryReport }> = ({ report }) => {
  const { mitigation, targets } = report;
  return (
    <ReportPage part="Parts 31-32" title="Reduction measures and targets">
      <SectionTitle number="31" note="Measurement without an action register stops short of management.">
        GHG reduction measures
      </SectionTitle>
      <Table
        headers={['Source', 'Current tCO2e', 'Reduction action', 'Estimated saving', 'Responsibility', 'Target year']}
        align={['left', 'right', 'left', 'right', 'left', 'left']}
        rows={mitigation.map((row) => [
          row.source, num(row.currentTco2e), row.action,
          row.estimatedReductionTco2e !== undefined ? num(row.estimatedReductionTco2e) : '—',
          row.responsibility, row.targetYear,
        ])}
        emptyMessage="No reduction measures recorded. List the action, the source it addresses, the expected saving, the owner and the target year."
      />
      <Prose>
        Inventory emissions, emissions avoided and purchased carbon credits are reported separately.
        Offsets are never subtracted from Scope 1 or Scope 2: the gross inventory stays visible, and any
        retired credits are disclosed below the totals.
      </Prose>

      <SectionTitle number="32">GHG targets</SectionTitle>
      <Table
        headers={['Target', 'Base year', 'Target year', 'Scopes', 'Baseline', 'Target level', 'Current', 'Gap', 'Required annual reduction']}
        align={['left', 'left', 'left', 'left', 'right', 'right', 'right', 'right', 'right']}
        rows={targets.targets.map((target) => [
          target.description,
          target.baseYear,
          target.targetYear,
          target.scopesCovered,
          target.baselineTco2e !== undefined ? num(target.baselineTco2e) : '—',
          target.targetTco2e !== undefined ? num(target.targetTco2e) : '—',
          num(target.currentTco2e),
          target.gapTco2e !== undefined ? num(target.gapTco2e) : '—',
          target.requiredAnnualReductionTco2e !== undefined ? num(target.requiredAnnualReductionTco2e) : '—',
        ])}
        emptyMessage="No targets recorded. A target needs a base year, a target year, the scopes covered, the baseline and a stated methodology — not a percentage on its own."
      />
      {targets.targets.some((target) => target.methodology.startsWith('No target methodology')) && (
        <GapNote>
          One or more targets have no methodology recorded. State the basis — for example an SBTi absolute
          contraction rate — so the ambition can be assessed.
        </GapNote>
      )}
    </ReportPage>
  );
};

export const AnnexuresPage: React.FC<{ report: GhgInventoryReport }> = ({ report }) => (
  <ReportPage part="Parts 35-41" title="Annexures, definitions and standards" last>
    <SectionTitle number="35" note="Each annexure points at the part of this report that holds the content, so no figure exists in two places.">
      Annexure index
    </SectionTitle>
    <Table
      headers={['Annexure', 'Content', 'Where it is', 'Populated']}
      rows={report.annexures.map((annexure) => [
        `Annexure ${annexure.letter}`, annexure.title, annexure.contentRef,
        annexure.populated
          ? 'Yes'
          : <span className="text-[#8A5A00] italic">Not yet</span>,
      ])}
    />

    <SectionTitle number="36" note="The report is produced from the controlled calculation system; the exported workbook mirrors these sheets.">
      Calculation workbook
    </SectionTitle>
    <Prose>
      The PDF is not the engine. Activity data, factors, GWP values, quality ratings, QA/QC results and
      the summary are held in the portal and exported as a workbook whose sheets follow the parts of this
      report. The exported workbook is Annexure F.
    </Prose>

    <SectionTitle number="40">Standards referenced</SectionTitle>
    <Table
      headers={['Standard', 'Applies to']}
      rows={report.standards.map((standard) => [standard.name, standard.appliesTo])}
    />

    <SectionTitle number="41" note="An inventory answers how much. An inventory report answers where it came from and how it was calculated. A verification package lets an independent party confirm both.">
      Status of this document
    </SectionTitle>
    <Prose>
      This document is a <strong>{report.readiness.level.toLowerCase()}</strong> as assessed in Part 30.
      It is not an independently verified GHG statement, and does not claim conformity with ISO 14064-3
      until a verifier has issued an opinion.
    </Prose>

    <SectionTitle number="O">Definitions and abbreviations</SectionTitle>
    <Table
      headers={['Term', 'Meaning']}
      rows={report.definitions.map((definition) => [
        <strong key={definition.term}>{definition.term}</strong>, definition.meaning,
      ])}
    />
  </ReportPage>
);
