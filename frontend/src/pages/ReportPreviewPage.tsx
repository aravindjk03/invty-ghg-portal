import React, { useState, useMemo } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { ScopeBadge } from '../components/ui/ScopeBadge';
import { useGHG } from '../context/GHGContext';
import { ghgService, DEFAULT_FACTORS } from '../services/ghgService';
import { formatIndianNumber } from '../engine/unitConverter';
import { Printer, Download, ShieldCheck, RefreshCw, FileSpreadsheet, CheckSquare, Square } from 'lucide-react';
import { LeadGateModal } from '../components/ui/LeadGateModal';

export interface ReportPreviewPageProps {
  onNavigate: (page: string) => void;
}

// Inline Base64 SVG Logo for Watermark
const INVTY_LOGO_SVG_BASE64 =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMDAgNjAiPjx0ZXh0IHg9IjEwIiB5PSI0NSIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjQyIiBmb250LXdlaWdodD0iYm9sZCIgZmlsbD0iIzEyM0M4MiI+SU5WVFl8R0hHPC90ZXh0Pjwvc3ZnPg==';

export const ReportPreviewPage: React.FC<ReportPreviewPageProps> = () => {
  const {
    summary,
    companyName,
    reportingPeriod,
    boundaryApproach,
    steelMethod,
    scope1Entries,
    scope2Entries,
    scope3Entries,
    addToast,
  } = useGHG();

  const [reportType, setReportType] = useState<'Screening' | 'Verified'>('Verified');
  const [framework, setFramework] = useState<'GHG Protocol' | 'BRSR Core' | 'ISO 14064-1'>('GHG Protocol');
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.06);
  const [isGenerating, setIsGenerating] = useState(false);
  const [leadGateOpen, setLeadGateOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<'print' | 'xlsx' | null>(null);

  const [sections, setSections] = useState({
    execSummary: true,
    scope1: true,
    scope2: true,
    scope3: true,
    methodology: true,
    calcLogAnnexe: true,
  });

  const toggleSection = (key: keyof typeof sections) => {
    setSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const allEntries = useMemo(() => {
    return [...scope1Entries, ...scope2Entries, ...scope3Entries];
  }, [scope1Entries, scope2Entries, scope3Entries]);

  const executePrint = async () => {
    setIsGenerating(true);
    try {
      await ghgService.generatePdf(
        'report-document-container',
        `${companyName.replace(/\s+/g, '_')}_GHG_Report_${reportingPeriod.replace(/\s+/g, '_')}.pdf`
      );
      addToast('success', 'PDF generated and downloaded successfully');
    } catch (e) {
      window.print();
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePrint = () => {
    if (!localStorage.getItem('INVTY_LEAD_PROFILE')) {
      setPendingAction('print');
      setLeadGateOpen(true);
      return;
    }
    executePrint();
  };

  const executeDownloadXlsx = () => {
    ghgService.exportXlsx(
      allEntries,
      summary,
      `${companyName.replace(/\s+/g, '_')}_GHG_Audit_Trail.xlsx`
    );
    addToast('success', 'Exported Raw Audit Trail (XLSX)');
  };

  const handleDownloadXlsx = () => {
    if (!localStorage.getItem('INVTY_LEAD_PROFILE')) {
      setPendingAction('xlsx');
      setLeadGateOpen(true);
      return;
    }
    executeDownloadXlsx();
  };

  const reportId = 'INVTY-2026-849201';
  const currentDate = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="max-w-[1440px] mx-auto px-6 py-8 pb-32">
      {/* Responsive Split View: Left Document Preview (8 cols), Right Config (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column (8 cols): Paginated A4 Document Sheets */}
        <div id="report-document-container" className="lg:col-span-8 flex flex-col items-center gap-8 print:w-full print:p-0">
          {/* Top Title */}
          <div className="w-full flex items-center justify-between print:hidden">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-brand-muted">
                PAGINATED A4 REPORT PREVIEW
              </span>
              <h2 className="text-2xl font-bold text-brand-heading mt-0.5">
                Verified Greenhouse Gas Inventory
              </h2>
            </div>
            <span className="text-xs font-mono text-brand-muted">
              {framework} & ISO 14064-1 Compliant
            </span>
          </div>

          {/* PAGE 1: COVER & EXECUTIVE SUMMARY */}
          {sections.execSummary && (
            <div
              className="w-full max-w-[800px] min-h-[1100px] bg-white border border-border shadow-nm-raised-lg rounded-xl p-8 md:p-12 relative overflow-hidden flex flex-col justify-between print:shadow-none print:border-none print:rounded-none print:m-0 print:p-10 page-break-after"
              style={{
                backgroundImage: `url("${INVTY_LOGO_SVG_BASE64}")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'center 45%',
                backgroundSize: '65%',
              }}
            >
              {/* Watermark Diagonal Banner for Screening */}
              {reportType === 'Screening' && (
                <div
                  className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0 rotate-[-30deg]"
                  style={{ opacity: watermarkOpacity + 0.04 }}
                >
                  <span className="text-5xl md:text-6xl font-extrabold uppercase tracking-widest text-[#A66300] border-4 border-[#A66300] px-10 py-3 text-center">
                    SCREENING ESTIMATE
                  </span>
                </div>
              )}

              {/* Repeating Header */}
              <div className="relative z-10 flex items-center justify-between pb-4 border-b border-border text-xs text-brand-muted">
                <span className="font-mono font-bold text-brand-heading tracking-wider">INVTY · GHG PORTAL</span>
                <span>{companyName} · {reportingPeriod}</span>
                <span className="font-mono">ID: {reportId}</span>
              </div>

              {/* Cover Content */}
              <div className="relative z-10 my-8 space-y-5">
                <div className="inline-block px-3 py-1 bg-blue-50 border border-blue-200 rounded text-xs font-bold text-brand-primary">
                  {framework}
                </div>

                <h1 className="text-3xl md:text-4xl font-extrabold text-brand-heading tracking-tight leading-tight">
                  Annual Greenhouse Gas Inventory & Assurance Statement
                </h1>

                <p className="text-sm text-brand-muted leading-relaxed max-w-xl">
                  Prepared in accordance with the World Resources Institute (WRI) / WBCSD GHG Protocol Corporate Accounting Standard, ISO 14064-1:2018 specifications, and SEBI Business Responsibility and Sustainability Reporting (BRSR Core).
                </p>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border/80 text-xs">
                  <div>
                    <span className="text-brand-muted block">Reporting Organisation:</span>
                    <strong className="text-brand-heading text-sm">{companyName}</strong>
                  </div>
                  <div>
                    <span className="text-brand-muted block">Reporting Period:</span>
                    <strong className="text-brand-heading text-sm">{reportingPeriod}</strong>
                  </div>
                  <div>
                    <span className="text-brand-muted block">Consolidation Boundary:</span>
                    <strong className="text-brand-heading text-sm">{boundaryApproach}</strong>
                  </div>
                  <div>
                    <span className="text-brand-muted block">Assurance Level:</span>
                    <strong className="text-emerald-700 text-sm flex items-center gap-1">
                      <ShieldCheck size={14} /> Tier-2 Verified (Grade {summary.dataQualityGrade})
                    </strong>
                  </div>
                </div>

                {/* Executive Summary Numbers Table */}
                <div className="mt-8 pt-6 border-t border-border">
                  <h3 className="text-sm font-bold text-brand-heading uppercase tracking-wider mb-4">
                    Table 1: Consolidated Operational Emissions by Scope
                  </h3>

                  <div className="rounded-lg border border-border overflow-hidden">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-surface border-b border-border font-semibold text-brand-heading">
                        <tr>
                          <th className="p-3">Greenhouse Gas Scope</th>
                          <th className="p-3">Accounting Methodology</th>
                          <th className="p-3 text-right">Emissions (tCO₂e)</th>
                          <th className="p-3 text-right">Share (%)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        <tr>
                          <td className="p-3 font-semibold text-scope-1">Scope 1: Direct</td>
                          <td className="p-3 text-brand-muted">Fuel combustion, fleet, process & fugitives</td>
                          <td className="p-3 text-right font-mono font-bold">{formatIndianNumber(summary.scope1)}</td>
                          <td className="p-3 text-right font-mono text-brand-muted">
                            {summary.totalEmissions > 0 ? ((summary.scope1 / summary.totalEmissions) * 100).toFixed(1) : 0}%
                          </td>
                        </tr>
                        <tr>
                          <td className="p-3 font-semibold text-scope-2">Scope 2: Purchased Electricity (Location)</td>
                          <td className="p-3 text-brand-muted">Grid average (CEA Baseline Database v19)</td>
                          <td className="p-3 text-right font-mono font-bold">{formatIndianNumber(summary.scope2Location)}</td>
                          <td className="p-3 text-right font-mono text-brand-muted">
                            {summary.totalEmissions > 0 ? ((summary.scope2Location / summary.totalEmissions) * 100).toFixed(1) : 0}%
                          </td>
                        </tr>
                        <tr>
                          <td className="p-3 font-semibold text-scope-3">Scope 3: Value Chain</td>
                          <td className="p-3 text-brand-muted">Purchased scrap, freight, T&D losses, business travel</td>
                          <td className="p-3 text-right font-mono font-bold">{formatIndianNumber(summary.scope3)}</td>
                          <td className="p-3 text-right font-mono text-brand-muted">
                            {summary.totalEmissions > 0 ? ((summary.scope3 / summary.totalEmissions) * 100).toFixed(1) : 0}%
                          </td>
                        </tr>
                        <tr className="bg-blue-50/50 font-bold border-t-2 border-border">
                          <td className="p-3 text-brand-heading" colSpan={2}>
                            Gross Headline Emissions (Location-Based Basis)
                          </td>
                          <td className="p-3 text-right font-mono text-base text-brand-heading">
                            {formatIndianNumber(summary.totalEmissions)}
                          </td>
                          <td className="p-3 text-right font-mono text-brand-heading">100.0%</td>
                        </tr>
                        <tr className="bg-slate-50 text-brand-muted text-[11px]">
                          <td className="p-2.5 italic" colSpan={2}>
                            Memo Item: Scope 2 Market-Based Dual Reporting
                          </td>
                          <td className="p-2.5 text-right font-mono font-bold text-emerald-700">
                            {formatIndianNumber(summary.scope2Market)}
                          </td>
                          <td className="p-2.5 text-right font-mono italic">Dual View</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="relative z-10 pt-4 border-t border-border flex items-center justify-between text-[11px] text-brand-muted font-mono">
                <span>INVTY · {companyName} GHG Inventory</span>
                <span>Generated on {currentDate}</span>
                <span>Page 1 of 3</span>
              </div>
            </div>
          )}

          {/* PAGE 2: SCOPE 1 & 2 ACTIVITY DATA */}
          {(sections.scope1 || sections.scope2) && (
            <div
              className="w-full max-w-[800px] min-h-[1100px] bg-white border border-border shadow-nm-raised-lg rounded-xl p-8 md:p-12 relative overflow-hidden flex flex-col justify-between print:shadow-none print:border-none print:rounded-none print:m-0 print:p-10 page-break-after"
              style={{
                backgroundImage: `url("${INVTY_LOGO_SVG_BASE64}")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'center 45%',
                backgroundSize: '65%',
              }}
            >
              {/* Repeating Header */}
              <div className="relative z-10 flex items-center justify-between pb-4 border-b border-border text-xs text-brand-muted">
                <span className="font-mono font-bold text-brand-heading tracking-wider">INVTY · GHG PORTAL</span>
                <span>Scope 1 & 2 Disclosures</span>
                <span className="font-mono">ID: {reportId}</span>
              </div>

              {/* Page 2 Content */}
              <div className="relative z-10 my-6 space-y-6">
                {sections.scope1 && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <ScopeBadge scope="scope-1" />
                        <h3 className="text-base font-bold text-brand-heading">
                          Scope 1 Direct Emissions Activity Register
                        </h3>
                      </div>
                      <span className="text-xs font-mono font-bold text-brand-heading">
                        Subtotal: {formatIndianNumber(summary.scope1)} tCO₂e
                      </span>
                    </div>

                    <table className="w-full text-xs text-left border border-border rounded-lg overflow-hidden">
                      <thead className="bg-surface border-b border-border font-semibold text-brand-heading">
                        <tr>
                          <th className="p-2">Location / Source</th>
                          <th className="p-2">Fuel / Activity</th>
                          <th className="p-2 text-right">Quantity</th>
                          <th className="p-2 text-right">Factor</th>
                          <th className="p-2 text-right">tCO₂e</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {scope1Entries.map((row) => (
                          <tr key={row.id} className="hover:bg-slate-50">
                            <td className="p-2">{row.facility}</td>
                            <td className="p-2">{row.fuelOrSource}</td>
                            <td className="p-2 text-right font-mono">
                              {formatIndianNumber(row.amount, 0)} {row.unit}
                            </td>
                            <td className="p-2 text-right font-mono text-[11px] text-brand-muted">
                              {row.emissionFactor.factorValue}
                            </td>
                            <td className="p-2 text-right font-mono font-bold text-brand-heading">
                              {formatIndianNumber(row.calculatedTco2e)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {sections.scope2 && (
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ScopeBadge scope="scope-2" />
                        <h3 className="text-base font-bold text-brand-heading">
                          Scope 2 Dual-Reporting: Location vs Market Method
                        </h3>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 rounded-lg bg-surface border border-border space-y-1">
                        <span className="font-bold text-brand-heading block">Location-based Method</span>
                        <p className="text-brand-muted text-[11px]">
                          Indian Central Electricity Authority (CEA) Baseline Database v19 (0.716 kgCO₂e/kWh).
                        </p>
                        <div className="text-xl font-mono font-bold text-brand-heading pt-2">
                          {formatIndianNumber(summary.scope2Location)} tCO₂e
                        </div>
                      </div>
                      <div className="p-4 rounded-lg bg-surface border border-border space-y-1">
                        <span className="font-bold text-brand-heading block">Market-based Method</span>
                        <p className="text-brand-muted text-[11px]">
                          Adjusted for Solar Open Access PPA contracts with verified surrender of EACs.
                        </p>
                        <div className="text-xl font-mono font-bold text-emerald-700 pt-2">
                          {formatIndianNumber(summary.scope2Market)} tCO₂e
                        </div>
                      </div>
                    </div>

                    {/* Out of Scope Biogenic Memo Box */}
                    <div className="p-3.5 rounded-lg bg-surface-sunken border border-border text-[11px] text-brand-muted leading-relaxed">
                      <strong>Out-of-Scope Memo Item:</strong> {formatIndianNumber(summary.biogenicMemo)} tCO₂e of biogenic and Montreal Protocol substances were tracked and verified outside the official Scope 1-3 boundary as per ISO 14064-1 specifications.
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="relative z-10 pt-4 border-t border-border flex items-center justify-between text-[11px] text-brand-muted font-mono">
                <span>INVTY · {companyName} GHG Inventory</span>
                <span>Generated on {currentDate}</span>
                <span>Page 2 of 3</span>
              </div>
            </div>
          )}

          {/* PAGE 3: METHODOLOGY & FACTOR REGISTER */}
          {sections.methodology && (
            <div
              className="w-full max-w-[800px] min-h-[1100px] bg-white border border-border shadow-nm-raised-lg rounded-xl p-8 md:p-12 relative overflow-hidden flex flex-col justify-between print:shadow-none print:border-none print:rounded-none print:m-0 print:p-10 page-break-after"
              style={{
                backgroundImage: `url("${INVTY_LOGO_SVG_BASE64}")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'center 45%',
                backgroundSize: '65%',
              }}
            >
              {/* Repeating Header */}
              <div className="relative z-10 flex items-center justify-between pb-4 border-b border-border text-xs text-brand-muted">
                <span className="font-mono font-bold text-brand-heading tracking-wider">INVTY · GHG PORTAL</span>
                <span>Methodology & Factor Registry</span>
                <span className="font-mono">ID: {reportId}</span>
              </div>

              {/* Page 3 Content */}
              <div className="relative z-10 my-6 space-y-5">
                <div>
                  <h3 className="text-base font-bold text-brand-heading mb-1">
                    Accounting Methodology & Emission Factors
                  </h3>
                  <p className="text-xs text-brand-muted leading-relaxed">
                    Calculations follow the standard formula: <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">Emissions (tCO₂e) = Activity Quantity × Emission Factor (kgCO₂e/unit) ÷ 1,000</code>. Global Warming Potentials (GWPs) are sourced from the IPCC Sixth Assessment Report (AR6 - 100 year).
                  </p>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-brand-heading uppercase tracking-wider mb-2">
                    Key Emission Factors Applied
                  </h4>
                  <table className="w-full text-xs text-left border border-border rounded-lg overflow-hidden">
                    <thead className="bg-surface border-b border-border font-semibold text-brand-heading">
                      <tr>
                        <th className="p-2">Activity Fuel / Source</th>
                        <th className="p-2">Factor Value</th>
                        <th className="p-2">Primary Reference Source</th>
                        <th className="p-2">Quality Tier</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {DEFAULT_FACTORS.slice(0, 7).map((f) => (
                        <tr key={f.id}>
                          <td className="p-2 font-medium">{f.fuelOrActivity}</td>
                          <td className="p-2 font-mono">
                            {f.factorValue} kgCO₂e/{f.unit}
                          </td>
                          <td className="p-2 text-brand-muted">{f.source}</td>
                          <td className="p-2">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                              {f.qualityTier}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="p-4 rounded-lg bg-surface border border-border text-xs space-y-2">
                  <h4 className="font-bold text-brand-heading">Assurance Sign-Off</h4>
                  <p className="text-brand-muted leading-relaxed text-[11px]">
                    We confirm that the information reported in this Greenhouse Gas Inventory for {companyName} covering {reportingPeriod} is true and complete to the best of our knowledge under {boundaryApproach}.
                  </p>
                  <div className="grid grid-cols-2 gap-6 pt-4 text-[11px]">
                    <div className="border-t border-border pt-2">
                      <span className="text-brand-muted block">Authorized Signatory:</span>
                      <strong className="text-brand-heading">{companyName} Sustainability Committee</strong>
                    </div>
                    <div className="border-t border-border pt-2">
                      <span className="text-brand-muted block">Date of Attestation:</span>
                      <strong className="text-brand-heading">{currentDate}</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="relative z-10 pt-4 border-t border-border flex items-center justify-between text-[11px] text-brand-muted font-mono">
                <span>INVTY · {companyName} GHG Inventory</span>
                <span>Generated on {currentDate}</span>
                <span>Page 3 of 3</span>
              </div>
            </div>
          )}

          {/* PAGE 4: OPTIONAL CALCULATION ANNEXE */}
          {sections.calcLogAnnexe && (
            <div
              className="w-full max-w-[800px] min-h-[1100px] bg-white border border-border shadow-nm-raised-lg rounded-xl p-8 md:p-12 relative overflow-hidden flex flex-col justify-between print:shadow-none print:border-none print:rounded-none print:m-0 print:p-10"
            >
              <div className="relative z-10 flex items-center justify-between pb-4 border-b border-border text-xs text-brand-muted">
                <span className="font-mono font-bold text-brand-heading tracking-wider">INVTY · ANNEXE</span>
                <span>Complete Activity Audit Trail</span>
                <span className="font-mono">Total {allEntries.length} lines</span>
              </div>

              <div className="relative z-10 my-6 space-y-4">
                <h3 className="text-base font-bold text-brand-heading">
                  Annexe A: Granular Activity Data Log
                </h3>
                <table className="w-full text-[11px] text-left border border-border rounded-lg overflow-hidden">
                  <thead className="bg-surface border-b border-border font-semibold text-brand-heading">
                    <tr>
                      <th className="p-2">ID</th>
                      <th className="p-2">Scope</th>
                      <th className="p-2">Facility</th>
                      <th className="p-2">Source</th>
                      <th className="p-2 text-right">Quantity</th>
                      <th className="p-2 text-right">Emissions (tCO₂e)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {allEntries.map((e) => (
                      <tr key={e.id}>
                        <td className="p-2 font-mono text-[10px] text-brand-muted">{e.id}</td>
                        <td className="p-2 font-semibold uppercase">{e.scope}</td>
                        <td className="p-2">{e.facility}</td>
                        <td className="p-2">{e.fuelOrSource}</td>
                        <td className="p-2 text-right font-mono">
                          {formatIndianNumber(e.amount, 0)} {e.unit}
                        </td>
                        <td className="p-2 text-right font-mono font-bold">
                          {formatIndianNumber(e.calculatedTco2e)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="relative z-10 pt-4 border-t border-border flex items-center justify-between text-[11px] text-brand-muted font-mono">
                <span>INVTY · {companyName} GHG Inventory</span>
                <span>Annexe</span>
                <span>Verified Audit Trail</span>
              </div>
            </div>
          )}
        </div>

        {/* Right Column (4 cols): Report Controls & Generation Panel */}
        <div className="lg:col-span-4 space-y-6 print:hidden">
          <Card className="p-6 space-y-6 bg-surface-raised border border-border shadow-nm-raised">
            <div>
              <h3 className="text-base font-bold text-brand-heading">Export Configuration</h3>
              <p className="text-xs text-brand-muted mt-0.5">
                Customize report scope, framework disclosure badges, and watermark opacity.
              </p>
            </div>

            {/* Framework Selector */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-brand-body block">
                Reporting Standard / Framework
              </label>
              <SegmentedControl
                size="sm"
                value={framework}
                onChange={(val) => setFramework(val as any)}
                options={[
                  { value: 'GHG Protocol', label: 'GHG Protocol' },
                  { value: 'BRSR Core', label: 'BRSR Core' },
                  { value: 'ISO 14064-1', label: 'ISO 14064' },
                ]}
              />
            </div>

            {/* Report Type */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-brand-body block">
                Report Maturity Stage
              </label>
              <SegmentedControl
                size="sm"
                value={reportType}
                onChange={(val) => setReportType(val as any)}
                options={[
                  { value: 'Screening', label: 'Screening (Watermarked)' },
                  { value: 'Full', label: 'Final Assurance Statement' },
                ]}
              />
            </div>

            {/* Sections Checklist */}
            <div className="space-y-2.5 pt-2 border-t border-border">
              <span className="text-xs font-semibold text-brand-body block">
                Include Sections
              </span>
              <div className="space-y-2 text-xs">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={sections.execSummary}
                    onChange={(e) => setSections({ ...sections, execSummary: e.target.checked })}
                    className="rounded border-border accent-brand-primary"
                  />
                  <span>Executive Summary & Total Scope Table</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={sections.scope1}
                    onChange={(e) => setSections({ ...sections, scope1: e.target.checked })}
                    className="rounded border-border accent-brand-primary"
                  />
                  <span>Scope 1 Direct Combustion Activity Breakdown</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={sections.scope2}
                    onChange={(e) => setSections({ ...sections, scope2: e.target.checked })}
                    className="rounded border-border accent-brand-primary"
                  />
                  <span>Scope 2 Dual-Reporting (Location vs Market)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={sections.methodology}
                    onChange={(e) => setSections({ ...sections, methodology: e.target.checked })}
                    className="rounded border-border accent-brand-primary"
                  />
                  <span>Emission Factors Register & Sign-off</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={sections.calcLogAnnexe}
                    onChange={(e) => setSections({ ...sections, calcLogAnnexe: e.target.checked })}
                    className="rounded border-border accent-brand-primary"
                  />
                  <span>Calculation-Log Raw Data Annexe</span>
                </label>
              </div>
            </div>

            {/* Watermark Opacity Slider */}
            <div className="space-y-2 pt-2 border-t border-border">
              <div className="flex justify-between text-xs font-semibold text-brand-body">
                <span>Watermark Opacity</span>
                <span className="font-mono text-brand-link font-bold">
                  {(watermarkOpacity * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min={0.03}
                max={0.15}
                step={0.01}
                value={watermarkOpacity}
                onChange={(e) => setWatermarkOpacity(parseFloat(e.target.value))}
                aria-label="Watermark Opacity"
                className="w-full accent-blue-600 h-2 bg-surface-sunken rounded-md shadow-nm-pressed border border-border cursor-pointer"
              />
            </div>

            {/* Print & Download Action */}
            <div className="pt-4 border-t border-border flex flex-col gap-3">
              <Button
                variant="primary"
                fullWidth
                size="lg"
                onClick={handlePrint}
                disabled={isGenerating}
                leftIcon={isGenerating ? <RefreshCw className="animate-spin" size={18} /> : <Printer size={18} />}
              >
                {isGenerating ? 'Rendering High-Res PDF...' : 'Print / Download Verified PDF'}
              </Button>

              <Button
                variant="secondary"
                fullWidth
                size="sm"
                onClick={handleDownloadXlsx}
                leftIcon={<Download size={15} />}
              >
                Download Audit Log (XLSX)
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* Customer Lead Gate Modal */}
      <LeadGateModal
        isOpen={leadGateOpen}
        onClose={() => setLeadGateOpen(false)}
        onSuccess={() => {
          setLeadGateOpen(false);
          if (pendingAction === 'print') {
            executePrint();
          } else if (pendingAction === 'xlsx') {
            executeDownloadXlsx();
          }
          setPendingAction(null);
        }}
        title="Enterprise Verification — Official Report Download"
        description="Verify your organization details to download high-resolution verified PDF audit reports and raw inventory calculation registers."
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
