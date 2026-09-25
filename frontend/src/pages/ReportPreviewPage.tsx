import React, { useMemo, useState } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { useGHG } from '../context/GHGContext';
import { ghgService } from '../services/ghgService';
import { Printer, Download, RefreshCw, Settings2, ListChecks } from 'lucide-react';
import { LeadGateModal } from '../components/ui/LeadGateModal';
import { cn } from '@/lib/utils';
import { ReportDocument, REPORT_PARTS, ReportPartKey } from '../report/ReportDocument';
import { ReportSettings } from '../report/ReportSettings';
import { buildReport } from '../report/build/buildReport';
import { exportWorkbook } from '../report/export/workbook';
import { loadReportMeta, saveReportMeta, ReportMeta } from '../report/model/reportMeta';
import { useEngineInventory } from '../report/useEngineInventory';
import { toTonnes } from '../types/inventory';

export interface ReportPreviewPageProps {
  onNavigate: (page: string) => void;
}

const FRAMEWORK_SETS: Record<string, string[]> = {
  'GHG Protocol': ['GHG Protocol Corporate Standard', 'GHG Protocol Scope 2 Guidance',
    'GHG Protocol Corporate Value Chain (Scope 3) Standard'],
  'ISO 14064-1': ['ISO 14064-1:2018', 'GHG Protocol Corporate Standard'],
  'BRSR Core': ['SEBI BRSR Core', 'GHG Protocol Corporate Standard'],
};

export const ReportPreviewPage: React.FC<ReportPreviewPageProps> = () => {
  const {
    summary, companyName, reportingPeriod, boundaryApproach,
    scope1Entries, scope2Entries, scope3Entries, addToast,
  } = useGHG();

  const [framework, setFramework] = useState<'GHG Protocol' | 'BRSR Core' | 'ISO 14064-1'>('GHG Protocol');
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.04);
  const [isGenerating, setIsGenerating] = useState(false);
  const [leadGateOpen, setLeadGateOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<'print' | 'xlsx' | null>(null);
  const [panel, setPanel] = useState<'parts' | 'details'>('parts');
  const [meta, setMeta] = useState<ReportMeta>(() => loadReportMeta());
  const [include, setInclude] = useState<Partial<Record<ReportPartKey, boolean>>>({});

  const allEntries = useMemo(
    () => [...scope1Entries, ...scope2Entries, ...scope3Entries],
    [scope1Entries, scope2Entries, scope3Entries],
  );

  const report = useMemo(
    () => buildReport({
      companyName, reportingPeriod, boundaryApproach,
      scope1Entries, scope2Entries, scope3Entries, summary, meta,
      frameworks: FRAMEWORK_SETS[framework],
    }),
    [companyName, reportingPeriod, boundaryApproach, scope1Entries, scope2Entries, scope3Entries,
      summary, meta, framework],
  );

  // Every figure in the report comes from the engine. A row without a published
  // factor is not calculated here or anywhere else: it is listed instead.
  const engine = useEngineInventory(
    allEntries, meta.gwpSet, Number(reportingPeriod.match(/\d{4}/)?.[0]) || new Date().getFullYear());

  const updateMeta = (next: ReportMeta) => {
    setMeta(next);
    saveReportMeta(next);
  };

  const executePrint = async () => {
    setIsGenerating(true);
    try {
      await ghgService.generatePdf(
        'report-document-container',
        `${companyName.replace(/\s+/g, '_')}_GHG_Inventory_Report_${reportingPeriod.replace(/\s+/g, '_')}.pdf`,
      );
      addToast('success', 'Report generated and downloaded');
    } catch {
      window.print();
    } finally {
      setIsGenerating(false);
    }
  };

  const executeDownloadXlsx = () => {
    exportWorkbook(
      report,
      { scope1: scope1Entries, scope2: scope2Entries, scope3: scope3Entries },
      `${companyName.replace(/\s+/g, '_')}_GHG_Master_${reportingPeriod.replace(/\s+/g, '_')}.xlsx`);
    addToast('success', 'Calculation workbook exported — 43 sheets (Annexure F)');
  };

  const gated = (action: 'print' | 'xlsx') => {
    if (!localStorage.getItem('INVTY_LEAD_PROFILE')) {
      setPendingAction(action);
      setLeadGateOpen(true);
      return;
    }
    if (action === 'print') void executePrint();
    else executeDownloadXlsx();
  };

  const readiness = report.readiness;
  const readinessTone = readiness.level === 'Verification ready'
    ? 'text-status-success' : readiness.level === 'Inventory report' ? 'text-status-warning' : 'text-status-danger';

  return (
    <div className="max-w-[1440px] mx-auto px-6 py-8 pb-32">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* The document itself */}
        <div id="report-document-container" className="lg:col-span-8 flex flex-col items-center gap-6 print:w-full print:p-0">
          <div className="w-full flex items-center justify-between print:hidden">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-brand-muted">
                GHG inventory report · parts 1–41
              </span>
              <h2 className="text-2xl font-bold text-brand-heading mt-0.5">
                {companyName} — {reportingPeriod}
              </h2>
            </div>
            <div className="text-right">
              <span className={cn('text-sm font-semibold', readinessTone)}>{readiness.level}</span>
              <p className="text-xs font-mono text-brand-muted">{readiness.score}/100 assurance readiness</p>
            </div>
          </div>

          <ReportDocument report={report} include={include} watermarkOpacity={watermarkOpacity} />
        </div>

        {/* Configuration */}
        <div className="lg:col-span-4 space-y-6 print:hidden">
          <Card className="p-6 space-y-5 bg-surface-raised border border-border shadow-nm-raised">
            <div>
              <h3 className="text-base font-bold text-brand-heading">Report configuration</h3>
              <p className="text-xs text-brand-muted mt-0.5">
                Choose the framework, the parts to include, and record the details a verifier needs.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-brand-body block">Reporting framework</label>
              <SegmentedControl
                size="sm"
                value={framework}
                onChange={(value) => setFramework(value as typeof framework)}
                options={[
                  { value: 'GHG Protocol', label: 'GHG Protocol' },
                  { value: 'BRSR Core', label: 'BRSR Core' },
                  { value: 'ISO 14064-1', label: 'ISO 14064' },
                ]}
              />
            </div>

            <div className="flex gap-2 border-b border-border pb-3">
              <Button variant={panel === 'parts' ? 'primary' : 'secondary'} size="sm"
                onClick={() => setPanel('parts')} leftIcon={<ListChecks size={14} />}>
                Parts
              </Button>
              <Button variant={panel === 'details' ? 'primary' : 'secondary'} size="sm"
                onClick={() => setPanel('details')} leftIcon={<Settings2 size={14} />}>
                Report details
              </Button>
            </div>

            {panel === 'parts' ? (
              <div className="space-y-2 text-xs max-h-[420px] overflow-y-auto pr-1">
                {REPORT_PARTS.map((part) => (
                  <label key={part.key} className="flex items-start gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={include[part.key] !== false}
                      onChange={(event) => setInclude({ ...include, [part.key]: event.target.checked })}
                      className="mt-0.5 rounded border-border accent-brand-primary"
                    />
                    <span>
                      <span className="text-brand-body">{part.label}</span>
                      <span className="text-brand-muted font-mono ml-1">· {part.parts}</span>
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <div className="max-h-[420px] overflow-y-auto pr-1">
                <ReportSettings meta={meta} onChange={updateMeta} />
              </div>
            )}

            <div className="space-y-2 pt-2 border-t border-border">
              <div className="flex justify-between items-center text-xs font-semibold text-brand-body">
                <span>Watermark opacity</span>
                <span className="font-mono text-brand-link">{(watermarkOpacity * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range" min={0} max={0.2} step={0.01} value={watermarkOpacity}
                onChange={(event) => setWatermarkOpacity(parseFloat(event.target.value))}
                aria-label="Watermark opacity"
                className="w-full accent-blue-600 h-2 bg-surface-sunken rounded-md border border-border cursor-pointer"
              />
            </div>

            <div className="pt-4 border-t border-border flex flex-col gap-3">
              <Button
                variant="primary" fullWidth size="lg" onClick={() => gated('print')} disabled={isGenerating}
                leftIcon={isGenerating ? <RefreshCw className="animate-spin" size={18} /> : <Printer size={18} />}
              >
                {isGenerating ? 'Rendering PDF…' : 'Download report (PDF)'}
              </Button>
              <Button variant="secondary" fullWidth size="sm" onClick={() => gated('xlsx')}
                leftIcon={<Download size={15} />}>
                Download calculation workbook (XLSX)
              </Button>
            </div>
          </Card>

          <Card className="p-5 bg-surface-raised border border-border">
            <h4 className="text-sm font-bold text-brand-heading">Calculation engine</h4>
            {engine.loading && <p className="text-xs text-brand-muted mt-2">Calculating…</p>}
            {engine.error && <p className="text-xs text-status-danger mt-2">{engine.error}</p>}
            {engine.result && (
              <>
                <table className="w-full text-xs mt-2">
                  <tbody>
                    <tr><td className="text-brand-muted py-0.5">Scope 1</td>
                      <td className="text-right font-mono">{toTonnes(engine.result.totals.scope1).toFixed(3)} t</td></tr>
                    <tr><td className="text-brand-muted py-0.5">Scope 2 ({engine.result.scope2_view})</td>
                      <td className="text-right font-mono">{toTonnes(engine.result.totals.scope2_headline).toFixed(3)} t</td></tr>
                    <tr><td className="text-brand-muted py-0.5">Scope 3</td>
                      <td className="text-right font-mono">{toTonnes(engine.result.totals.scope3).toFixed(3)} t</td></tr>
                    <tr className="border-t border-border"><td className="font-semibold py-1">Total 1 + 2</td>
                      <td className="text-right font-mono font-semibold">{toTonnes(engine.result.totals.total_scope12).toFixed(3)} t</td></tr>
                  </tbody>
                </table>
                <p className="text-[11px] text-brand-muted mt-2">
                  ghg_core {engine.result.engine_version} · {engine.result.gwp_set} · run{' '}
                  <span className="font-mono">{engine.result.run_id.slice(0, 10)}</span>
                </p>
              </>
            )}
            {(engine.unmapped.length > 0 || (engine.result?.excluded.length ?? 0) > 0) && (
              <p className="text-[11px] text-[#8A5A00] bg-[#FFF8E6] border border-[#F0D9A0] rounded-md px-2 py-1.5 mt-2">
                {engine.unmapped.length > 0 && (
                  <>{engine.unmapped.length} row(s) have no published factor chosen and are excluded
                  from every total. Open the Scope registers and pick one.{' '}</>
                )}
                {(engine.result?.excluded.length ?? 0) > 0 && (
                  <>{engine.result?.excluded.length} row(s) could not be calculated; the reasons are
                  in the report.</>
                )}
              </p>
            )}
          </Card>

          <Card className="p-5 bg-surface-raised border border-border">
            <h4 className="text-sm font-bold text-brand-heading">Before assurance</h4>
            {readiness.blockers.length === 0 ? (
              <p className="text-xs text-brand-body mt-2">
                No blockers outstanding. Part 30 records the internal verification questions a reviewer
                should still ask.
              </p>
            ) : (
              <ul className="list-disc pl-4 text-xs text-brand-body mt-2 space-y-1">
                {readiness.blockers.slice(0, 6).map((blocker) => <li key={blocker}>{blocker}</li>)}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <LeadGateModal
        isOpen={leadGateOpen}
        onClose={() => setLeadGateOpen(false)}
        onSuccess={() => {
          setLeadGateOpen(false);
          if (pendingAction === 'print') void executePrint();
          else if (pendingAction === 'xlsx') executeDownloadXlsx();
          setPendingAction(null);
        }}
        title="GHG inventory report — download"
        description="Verify your organization details to download the inventory report and the calculation workbook."
        actionType="pdf"
        inventorySummary={{
          totalTco2e: summary.totalEmissions,
          scope1: summary.scope1,
          scope2: summary.scope2Location,
          scope3: summary.scope3,
          qualityGrade: summary.dataQualityGrade,
        }}
      />
    </div>
  );
};
