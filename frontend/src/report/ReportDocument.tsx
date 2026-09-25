/**
 * The whole GHG inventory report, in order, as printable pages.
 *
 * Page order follows the report structure: front matter, boundaries, the
 * inventory, methodology and registers, analysis, credibility, action, and the
 * annexures.
 */
import React from 'react';
import { GhgInventoryReport } from './model/types';
import { ActionPage, AnnexuresPage } from './sections/ActionAndAnnexures';
import { IntensityAndTrendPage, SummaryTablePage } from './sections/Analysis';
import { BoundaryPage, ObjectivePage } from './sections/Boundaries';
import { BaseYearPage, QaQcPage, QualityPage } from './sections/Credibility';
import { CoverPage, DashboardPage, DocumentControlPage, ExecutiveSummaryPage } from './sections/FrontMatter';
import { ScopeOnePage, ScopeThreePage, ScopeTwoPage } from './sections/Inventory';
import { MethodologyPage, RegistersPage } from './sections/Methodology';

export interface ReportDocumentProps {
  report: GhgInventoryReport;
  /** Parts the user has switched off in the export panel. */
  include?: Partial<Record<ReportPartKey, boolean>>;
  watermarkOpacity?: number;
}

export type ReportPartKey =
  | 'cover' | 'documentControl' | 'executiveSummary' | 'dashboard' | 'objective' | 'boundary'
  | 'scope1' | 'scope2' | 'scope3' | 'methodology' | 'registers' | 'summaryTable'
  | 'intensityTrend' | 'baseYearExclusions' | 'quality' | 'qaqc' | 'action' | 'annexures';

export const REPORT_PARTS: { key: ReportPartKey; label: string; parts: string }[] = [
  { key: 'cover', label: 'Cover page', parts: '1-2' },
  { key: 'documentControl', label: 'Document control', parts: '3' },
  { key: 'executiveSummary', label: 'Executive summary', parts: '4' },
  { key: 'dashboard', label: 'GHG dashboard', parts: '34' },
  { key: 'objective', label: 'Objective, period, principles', parts: '5-7' },
  { key: 'boundary', label: 'Boundaries and source register', parts: '8-9' },
  { key: 'scope1', label: 'Scope 1 inventory', parts: '10-13' },
  { key: 'scope2', label: 'Scope 2 inventory', parts: '14' },
  { key: 'scope3', label: 'Scope 3 assessment', parts: '15' },
  { key: 'methodology', label: 'Methodology and GWP', parts: '16, 19-20' },
  { key: 'registers', label: 'Evidence and factor registers', parts: '17-18' },
  { key: 'summaryTable', label: 'Emissions summary', parts: '23' },
  { key: 'intensityTrend', label: 'Intensity and trends', parts: '22, 24, 33' },
  { key: 'baseYearExclusions', label: 'Base year and exclusions', parts: '25-26' },
  { key: 'quality', label: 'Data quality and uncertainty', parts: '27-28' },
  { key: 'qaqc', label: 'QA/QC and internal verification', parts: '29-30' },
  { key: 'action', label: 'Reduction measures and targets', parts: '31-32' },
  { key: 'annexures', label: 'Annexures and definitions', parts: '35-41' },
];

export const ReportDocument: React.FC<ReportDocumentProps> = ({ report, include, watermarkOpacity = 0.04 }) => {
  const on = (key: ReportPartKey): boolean => include?.[key] !== false;

  const pages: [ReportPartKey, React.ReactNode][] = [
    ['cover', <CoverPage report={report} />],
    ['documentControl', <DocumentControlPage report={report} />],
    ['executiveSummary', <ExecutiveSummaryPage report={report} />],
    ['dashboard', <DashboardPage report={report} />],
    ['objective', <ObjectivePage report={report} />],
    ['boundary', <BoundaryPage report={report} />],
    ['scope1', <ScopeOnePage report={report} />],
    ['scope2', <ScopeTwoPage report={report} />],
    ['scope3', <ScopeThreePage report={report} />],
    ['methodology', <MethodologyPage report={report} />],
    ['registers', <RegistersPage report={report} />],
    ['summaryTable', <SummaryTablePage report={report} />],
    ['intensityTrend', <IntensityAndTrendPage report={report} />],
    ['baseYearExclusions', <BaseYearPage report={report} />],
    ['quality', <QualityPage report={report} />],
    ['qaqc', <QaQcPage report={report} />],
    ['action', <ActionPage report={report} />],
    ['annexures', <AnnexuresPage report={report} />],
  ];

  return (
    <div className="flex flex-col items-center gap-8 print:gap-0 relative">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 flex items-center justify-center print:absolute"
        style={{ opacity: watermarkOpacity }}
      >
        <img src={`${import.meta.env.BASE_URL}invty-logo.png`} alt="" className="w-[520px] max-w-[70%]" />
      </div>
      {pages.filter(([key]) => on(key)).map(([key, page]) => (
        <React.Fragment key={key}>{page}</React.Fragment>
      ))}
    </div>
  );
};
