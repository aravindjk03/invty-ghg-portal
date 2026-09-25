/** Report parts 5-9: objective, period, principles, organizational and operational boundary. */
import React from 'react';
import { FacilityRecord, GhgInventoryReport } from '../model/types';
import { GapNote, KeyValues, num, Prose, ReportPage, SectionTitle, Table } from './primitives';

export const ObjectivePage: React.FC<{ report: GhgInventoryReport }> = ({ report }) => {
  const { objective } = report;
  return (
    <ReportPage part="Parts 5-7" title="Objective, reporting period and principles">
      <SectionTitle number="5">Objective and purpose</SectionTitle>
      <Prose>{objective.objective}</Prose>
      <ul className="list-disc pl-5 text-[13px] text-brand-body space-y-1 mb-4">
        {objective.purposes.map((purpose) => <li key={purpose}>{purpose}</li>)}
      </ul>

      <SectionTitle number="6">Reporting period and base year</SectionTitle>
      <KeyValues
        rows={[
          ['Reporting period', `${objective.periodStart} to ${objective.periodEnd}`],
          ['Base year', objective.baseYear],
          ['Base year rationale', objective.baseYearRationale],
        ]}
      />

      <SectionTitle number="7" note="These principles govern how the inventory was compiled and are the basis on which it can be assured.">
        Reporting principles
      </SectionTitle>
      <Table
        headers={['Principle', 'How it is applied']}
        rows={objective.principles.map((principle) => [
          <strong key={principle.name}>{principle.name}</strong>, principle.statement,
        ])}
      />
    </ReportPage>
  );
};

/** The boundary drawn as a tree, so the reader sees what sits under what. */
const FacilityTree: React.FC<{ facilities: FacilityRecord[] }> = ({ facilities }) => {
  const roots = facilities.filter((facility) => !facility.parent);
  const childrenOf = (name: string) => facilities.filter((facility) => facility.parent === name);
  const orphans = facilities.filter(
    (facility) => facility.parent && !facilities.some((other) => other.name === facility.parent));

  const render = (facility: FacilityRecord, depth: number): React.ReactNode => (
    <React.Fragment key={facility.name}>
      <div className="font-mono text-[11.5px] text-brand-body whitespace-pre">
        {depth === 0 ? '' : `${'    '.repeat(depth - 1)}└── `}
        {facility.name}
        {!facility.included && <span className="text-[#8A5A00] italic"> (excluded)</span>}
      </div>
      {childrenOf(facility.name).map((child) => render(child, depth + 1))}
    </React.Fragment>
  );

  return (
    <div className="border border-border rounded-md bg-surface-raised p-3 mb-4">
      {[...roots, ...orphans].map((facility) => render(facility, 0))}
    </div>
  );
};

export const BoundaryPage: React.FC<{ report: GhgInventoryReport }> = ({ report }) => {
  const { organizationalBoundary: org, operationalBoundary: ops } = report;
  return (
    <ReportPage part="Parts 8-9" title="Organizational and operational boundary">
      <SectionTitle number="8" note="Which entities and facilities the inventory covers, and on what consolidation basis.">
        Organizational boundary
      </SectionTitle>
      <KeyValues
        rows={[
          ['Consolidation approach', org.consolidationApproach],
          ['Rationale', org.approachRationale],
        ]}
      />

      {org.facilities.length > 0 && <FacilityTree facilities={org.facilities} />}

      <Table
        headers={['Facility', 'Type', 'Location', 'Included', 'Note']}
        rows={org.facilities.map((facility) => [
          facility.name, facility.type, facility.location,
          facility.included ? 'Yes' : 'No', facility.note,
        ])}
        emptyMessage="No facility list recorded. A verifier cannot confirm completeness without knowing which sites, offices, warehouses, vehicles, subsidiaries and joint ventures are inside the boundary."
      />

      {org.unlistedFacilities.length > 0 && (
        <GapNote>
          Activity data was recorded for {org.unlistedFacilities.length} location(s) that do not appear in
          the facility list: {org.unlistedFacilities.join(', ')}. Either add them to the boundary or explain
          why their data is included.
        </GapNote>
      )}

      <SectionTitle number="9" note="Every source that produces emissions inside the boundary, grouped as it is reported.">
        Operational boundary — emission source register
      </SectionTitle>
      <Table
        headers={['ID', 'Source', 'Scope', 'Category', 'Facility', 'Records', 'tCO2e']}
        align={['left', 'left', 'left', 'left', 'left', 'right', 'right']}
        rows={ops.sources.map((source) => [
          source.sourceId, source.source, source.scopeLabel, source.categoryLabel,
          source.facility, source.entryCount, num(source.tco2e),
        ])}
        emptyMessage="No emission sources recorded yet."
      />
    </ReportPage>
  );
};
