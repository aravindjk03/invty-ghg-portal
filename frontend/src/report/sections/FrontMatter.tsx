/** Report parts 1-4: cover page, document control, executive summary and dashboard. */
import React from 'react';
import { GhgInventoryReport } from '../model/types';
import { GapNote, KeyValues, num, pct, Prose, ReportPage, SectionTitle, Table } from './primitives';

export const CoverPage: React.FC<{ report: GhgInventoryReport }> = ({ report }) => {
  const { cover } = report;
  return (
    <ReportPage>
      <div className="flex flex-col h-full min-h-[980px] justify-between">
        <div>
          <img src={`${import.meta.env.BASE_URL}invty-logo.png`} alt="IINVTY" className="w-10 h-10 object-contain" />
          <p className="mt-2 font-mono text-xs font-bold tracking-[0.2em] text-brand-heading">IINVTY · GHG PORTAL</p>
        </div>

        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-brand-muted">
            Greenhouse gas emissions inventory report
          </p>
          <h1 className="text-4xl font-extrabold text-brand-heading tracking-tight leading-tight mt-3">
            {cover.companyName}
          </h1>
          <p className="text-lg text-brand-body mt-2">{cover.facility}</p>
          <div className="mt-6 border-t border-border pt-4 text-[13px] text-brand-body space-y-1">
            <p><span className="text-brand-muted">Reporting period: </span>{cover.reportingPeriodLabel}
              {cover.periodStart !== 'Not recorded' && ` (${cover.periodStart} to ${cover.periodEnd})`}</p>
            <p><span className="text-brand-muted">Prepared in accordance with: </span>{cover.frameworks.join(', ')}</p>
            <p><span className="text-brand-muted">Date of issue: </span>{cover.issueDate}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 text-[11px]">
          {(['preparedBy', 'reviewedBy', 'approvedBy'] as const).map((role) => (
            <div key={role} className="border-t-2 border-brand-heading pt-2">
              <p className="uppercase tracking-wider text-brand-muted font-semibold">
                {{ preparedBy: 'Prepared by', reviewedBy: 'Reviewed by', approvedBy: 'Approved by' }[role]}
              </p>
              <p className="text-brand-body mt-1">{report.documentControl[role]}</p>
              <p className="text-brand-muted mt-6">Signature / date</p>
            </div>
          ))}
        </div>
      </div>
    </ReportPage>
  );
};

export const DocumentControlPage: React.FC<{ report: GhgInventoryReport }> = ({ report }) => {
  const dc = report.documentControl;
  return (
    <ReportPage part="Part 3" title="Document control">
      <KeyValues
        rows={[
          ['Document title', dc.documentTitle],
          ['Document number', dc.documentNumber],
          ['Version', dc.version],
          ['Reporting year', dc.reportingYear],
          ['Effective date', dc.effectiveDate],
          ['Prepared by', dc.preparedBy],
          ['Reviewed by', dc.reviewedBy],
          ['Approved by', dc.approvedBy],
          ['Confidentiality', dc.confidentiality],
        ]}
      />

      <SectionTitle number="3.1" note="Every issued version stays on record, so a verifier can see what changed and when.">
        Revision history
      </SectionTitle>
      <Table
        headers={['Revision', 'Date', 'Description of change', 'Author']}
        rows={dc.revisionHistory.map((revision) => [revision.revision, revision.date, revision.description, revision.author])}
        emptyMessage="No revision history recorded. Add revision 00 for the first issue of this report."
      />

      <SectionTitle number="3.2">Standards applied</SectionTitle>
      <Table
        headers={['Standard', 'Applies to']}
        rows={report.standards.map((standard) => [standard.name, standard.appliesTo])}
      />
    </ReportPage>
  );
};

export const ExecutiveSummaryPage: React.FC<{ report: GhgInventoryReport }> = ({ report }) => {
  const { executiveSummary: summary, readiness } = report;
  return (
    <ReportPage part="Part 4" title="Executive summary">
      <Table
        headers={['Metric', 'Value', 'Unit']}
        align={['left', 'right', 'left']}
        rows={summary.metrics.map((metric) => [
          metric.label,
          metric.missingReason
            ? <span className="text-[#8A5A00] italic">{metric.missingReason}</span>
            : metric.value,
          metric.unit,
        ])}
      />

      <SectionTitle number="4.1" note="Ranked by contribution to total reported emissions.">
        Largest emission sources
      </SectionTitle>
      <Table
        headers={['#', 'Source', 'Scope', 'tCO2e', 'Share']}
        align={['left', 'left', 'left', 'right', 'right']}
        rows={summary.largestSources.map((source) => [
          source.rank, source.source, source.scopeLabel, num(source.tco2e), pct(source.shareOfTotal),
        ])}
        emptyMessage="No activity data has been recorded, so no sources can be ranked."
      />

      <SectionTitle number="4.2">What the figures show</SectionTitle>
      {summary.narrative.map((paragraph) => <Prose key={paragraph}>{paragraph}</Prose>)}

      <SectionTitle number="4.3" note="See Part 30 for the full assessment.">
        Assurance readiness
      </SectionTitle>
      <div className="border border-border rounded-lg p-4 bg-surface-raised">
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-bold text-brand-heading font-mono">{readiness.score}</span>
          <span className="text-brand-muted text-sm">/ 100</span>
          <span className="ml-auto text-sm font-semibold text-brand-heading">{readiness.level}</span>
        </div>
        {readiness.blockers.length > 0 && (
          <div className="mt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-muted mb-1">
              What a verifier would raise first
            </p>
            <ul className="list-disc pl-5 text-[12px] text-brand-body space-y-0.5">
              {readiness.blockers.slice(0, 5).map((blocker) => <li key={blocker}>{blocker}</li>)}
            </ul>
          </div>
        )}
      </div>
    </ReportPage>
  );
};

/** Part 34: the one-screen dashboard management reads first. */
export const DashboardPage: React.FC<{ report: GhgInventoryReport }> = ({ report }) => {
  const { scope1, scope2, scope3, intensity, executiveSummary } = report;
  const total12 = scope1.total + scope2.locationBased;
  const tile = (label: string, value: string, unit: string) => (
    <div key={label} className="border border-border rounded-lg p-4 text-center bg-surface">
      <p className="text-[10px] uppercase tracking-wider text-brand-muted font-semibold">{label}</p>
      <p className="text-2xl font-bold text-brand-heading font-mono mt-1">{value}</p>
      <p className="text-[10px] text-brand-muted">{unit}</p>
    </div>
  );

  return (
    <ReportPage part="Part 34" title="GHG dashboard">
      <div className="grid grid-cols-3 gap-3 mb-4">
        {tile('Scope 1', num(scope1.total), 'tCO2e')}
        {tile('Scope 2 (location)', num(scope2.locationBased), 'tCO2e')}
        {tile('Scope 3', num(scope3.total), 'tCO2e')}
      </div>
      <div className="grid grid-cols-2 gap-3 mb-6">
        {tile('Total Scope 1 + 2', num(total12), 'tCO2e')}
        {intensity.indicators[0].value !== undefined
          ? tile('GHG intensity', intensity.indicators[0].value.toFixed(3), intensity.indicators[0].unit)
          : tile('GHG intensity', '—', 'production output not recorded')}
      </div>

      <SectionTitle number="34.1">Largest sources</SectionTitle>
      <Table
        headers={['#', 'Source', 'tCO2e', 'Share of total']}
        align={['left', 'left', 'right', 'right']}
        rows={executiveSummary.largestSources.map((source) => [
          source.rank, source.source, num(source.tco2e), pct(source.shareOfTotal),
        ])}
        emptyMessage="No activity data recorded."
      />

      <SectionTitle number="34.2">Where the emissions sit</SectionTitle>
      <div className="space-y-2">
        {[['Scope 1', scope1.total], ['Scope 2 (location-based)', scope2.locationBased], ['Scope 3', scope3.total]]
          .map(([label, value]) => {
            const totalAll = scope1.total + scope2.locationBased + scope3.total;
            const width = totalAll > 0 ? ((value as number) / totalAll) * 100 : 0;
            return (
              <div key={label as string}>
                <div className="flex justify-between text-[11px] text-brand-body mb-0.5">
                  <span>{label}</span>
                  <span className="font-mono">{num(value as number)} tCO2e · {pct(width)}</span>
                </div>
                <div className="h-2 bg-surface-raised rounded">
                  <div className="h-2 bg-brand-link rounded" style={{ width: `${width}%` }} />
                </div>
              </div>
            );
          })}
      </div>
      {scope1.total + scope2.locationBased + scope3.total === 0 && (
        <GapNote>No emissions have been recorded yet, so the dashboard has nothing to show.</GapNote>
      )}
    </ReportPage>
  );
};
