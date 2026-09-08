import React, { useState, useMemo, useEffect } from 'react';
import { useGHG } from '../context/GHGContext';
import { getSector } from '../config/sectors';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Badge } from '../components/ui/Badge';
import { LeadGateModal } from '../components/ui/LeadGateModal';
import { formatIndianNumber } from '../engine/unitConverter';
import Decimal from 'decimal.js';
import { 
  ArrowLeft, 
  Download, 
  FileCheck, 
  ShieldCheck, 
  Award, 
  Copy, 
  Check, 
  Building, 
  TrendingDown, 
  FileText 
} from 'lucide-react';
import {
  complianceService,
  BrsrRequest,
  ResultSource,
} from '../services/complianceService';

interface BRSRPageProps {
  onNavigate: (page: string) => void;
}

export const BRSRPage: React.FC<BRSRPageProps> = ({ onNavigate }) => {
  const { summary, companyName, reportingPeriod, addToast, sector } = useGHG();

  const [turnoverCrores, setTurnoverCrores] = useState(1450.0);
  const [physicalOutputTonnes, setPhysicalOutputTonnes] = useState(380000);
  const [outputMetric, setOutputMetric] = useState(getSector(sector).outputMetric);
  const [cinNumber, setCinNumber] = useState('L27100MH2024PLC198234');
  const [assuranceType, setAssuranceType] = useState<'Reasonable Assurance' | 'Limited Assurance' | 'Internal Audit Only'>('Reasonable Assurance');
  const [assuranceAgency, setAssuranceAgency] = useState('DNV Business Assurance India');
  const [copiedXbrl, setCopiedXbrl] = useState(false);
  const [leadGateOpen, setLeadGateOpen] = useState(false);
  const [serverXbrl, setServerXbrl] = useState<string | null>(null);
  const [resultSource, setResultSource] = useState<ResultSource>('local');

  // BRSR Core calculations
  const brsrMetrics = useMemo(() => {
    const turnover = new Decimal(turnoverCrores > 0 ? turnoverCrores : 1);
    const output = new Decimal(physicalOutputTonnes > 0 ? physicalOutputTonnes : 1);

    const s1 = new Decimal(summary.scope1 || 0);
    const s2Loc = new Decimal(summary.scope2Location || 0);
    const s2Mkt = new Decimal(summary.scope2Market || 0);
    const s3 = new Decimal(summary.scope3 || 0);

    const grossLocation = s1.plus(s2Loc).plus(s3);
    const grossMarket = s1.plus(s2Mkt).plus(s3);

    const turnoverIntensityLoc = grossLocation.dividedBy(turnover).toDecimalPlaces(3).toNumber();
    const turnoverIntensityMkt = grossMarket.dividedBy(turnover).toDecimalPlaces(3).toNumber();

    const prodIntensityLoc = grossLocation.dividedBy(output).toDecimalPlaces(4).toNumber();
    const prodIntensityMkt = grossMarket.dividedBy(output).toDecimalPlaces(4).toNumber();

    const isScope3Complete = summary.coverage.scope3CategoriesIncluded >= 3;

    return {
      grossLocation: grossLocation.toNumber(),
      grossMarket: grossMarket.toNumber(),
      turnoverIntensityLoc,
      turnoverIntensityMkt,
      prodIntensityLoc,
      prodIntensityMkt,
      isScope3Complete,
    };
  }, [turnoverCrores, physicalOutputTonnes, summary]);

  // Pre-formatted SEBI MCA XBRL template
  const generatedXbrl = useMemo(() => {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Ministry of Corporate Affairs / SEBI BRSR Core Filing Package (Principle 6) -->
<xbrli:xbrl 
  xmlns:xbrli="http://www.xbrl.org/2003/instance"
  xmlns:sebi-brsr="http://www.sebi.gov.in/brsr/core/2023-07-12"
  xmlns:iso4217="http://www.xbrl.org/2003/iso4217">

  <xbrli:context id="FY_Current">
    <xbrli:entity>
      <xbrli:identifier scheme="http://mca.gov.in/CIN">${cinNumber}</xbrli:identifier>
    </xbrli:entity>
    <xbrli:period>
      <xbrli:startDate>2024-04-01</xbrli:startDate>
      <xbrli:endDate>2025-03-31</xbrli:endDate>
    </xbrli:period>
  </xbrli:context>

  <xbrli:unit id="tCO2e">
    <xbrli:measure>sebi-brsr:metric_tonne_CO2_equivalent</xbrli:measure>
  </xbrli:unit>

  <!-- Principle 6: Essential Indicator 7 - Gross Scope 1 & 2 Emissions -->
  <sebi-brsr:Scope1Emissions contextRef="FY_Current" unitRef="tCO2e">${summary.scope1.toFixed(2)}</sebi-brsr:Scope1Emissions>
  <sebi-brsr:Scope2LocationEmissions contextRef="FY_Current" unitRef="tCO2e">${summary.scope2Location.toFixed(2)}</sebi-brsr:Scope2LocationEmissions>
  <sebi-brsr:Scope2MarketEmissions contextRef="FY_Current" unitRef="tCO2e">${summary.scope2Market.toFixed(2)}</sebi-brsr:Scope2MarketEmissions>
  
  <!-- Principle 6: Essential Indicator 8 - Scope 3 and Intensity Metrics -->
  <sebi-brsr:Scope3Emissions contextRef="FY_Current" unitRef="tCO2e">${summary.scope3.toFixed(2)}</sebi-brsr:Scope3Emissions>
  <sebi-brsr:TotalGrossLocationEmissions contextRef="FY_Current" unitRef="tCO2e">${brsrMetrics.grossLocation.toFixed(2)}</sebi-brsr:TotalGrossLocationEmissions>
  <sebi-brsr:TurnoverIntensityCroreINR contextRef="FY_Current">${brsrMetrics.turnoverIntensityLoc.toFixed(3)}</sebi-brsr:TurnoverIntensityCroreINR>
  <sebi-brsr:PhysicalProductionIntensity contextRef="FY_Current">${brsrMetrics.prodIntensityLoc.toFixed(4)}</sebi-brsr:PhysicalProductionIntensity>

  <!-- Value Chain Assurance Footnote -->
  <sebi-brsr:AssuranceScopeDescription contextRef="FY_Current">
    ${assuranceType} executed by ${assuranceAgency} covering Essential Indicators 7 and 8 pursuant to SEBI Circular SEBI/HO/CFD/CFD-SEC-2/P/CIR/2023/122.
  </sebi-brsr:AssuranceScopeDescription>
</xbrli:xbrl>`;
  }, [cinNumber, summary, brsrMetrics, assuranceType, assuranceAgency]);

  // BRSR Core is filed with SEBI, so the XBRL that leaves this screen is the
  // server's rendering of it. The local Decimal maths keeps the on-screen
  // intensities live while inputs change, and covers an unreachable API.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      const payload: BrsrRequest = {
        financialYear: reportingPeriod,
        turnoverInCroresINR: turnoverCrores > 0 ? turnoverCrores : 1,
        physicalOutputTonnes: physicalOutputTonnes > 0 ? physicalOutputTonnes : 1,
        outputMetricName: outputMetric,
        scope1TotalTco2e: Math.max(0, summary.scope1),
        scope2LocationTco2e: Math.max(0, summary.scope2Location),
        scope2MarketTco2e: Math.max(0, summary.scope2Market),
        scope3TotalTco2e: Math.max(0, summary.scope3),
        companyName,
        cinNumber,
        assuranceType,
        assuranceAgency,
      };

      complianceService
        .calculateBrsr<{ xbrlXmlPreview?: string }>(payload, () => ({}))
        .then(({ data, source }) => {
          if (cancelled) return;
          setServerXbrl(data?.xbrlXmlPreview ?? null);
          setResultSource(data?.xbrlXmlPreview ? source : 'local');
        });
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    reportingPeriod,
    turnoverCrores,
    physicalOutputTonnes,
    outputMetric,
    summary.scope1,
    summary.scope2Location,
    summary.scope2Market,
    summary.scope3,
    companyName,
    cinNumber,
    assuranceType,
    assuranceAgency,
  ]);

  const filingXbrl = serverXbrl ?? generatedXbrl;

  const handleCopyXbrl = () => {
    navigator.clipboard.writeText(filingXbrl);
    setCopiedXbrl(true);
    setTimeout(() => setCopiedXbrl(false), 2000);
    addToast('success', 'SEBI BRSR Core XBRL XML copied to clipboard');
  };

  const handleDownloadXbrl = () => {
    const saved = localStorage.getItem('INVTY_LEAD_PROFILE');
    if (!saved) {
      setLeadGateOpen(true);
      return;
    }
    executeDownload();
  };

  const executeDownload = () => {
    const blob = new Blob([filingXbrl], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${companyName.replace(/\s+/g, '_')}_SEBI_BRSR_Core_Principle6_XBRL.xml`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    addToast('success', 'Downloaded official SEBI BRSR Core XBRL report for MCA filing');
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-28">
      {/* Top Breadcrumb */}
      <div className="flex items-center justify-between mb-6">
        <button
          type="button"
          onClick={() => onNavigate('scope-hub')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-primary hover:text-brand-heading transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Scope Hub
        </button>

        <div className="flex items-center gap-2">
          <Badge variant="verified">SEBI Mandate: Top 1,000 Listed</Badge>
          <Badge variant="default">MCA XBRL Compliant</Badge>
        </div>
      </div>

      {/* Title */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-brand-heading tracking-tight flex items-center gap-2.5">
          <Award size={24} className="text-brand-primary" />
          SEBI BRSR Core Mandate Integration (XBRL Engine)
        </h1>
        <p className="text-sm text-brand-muted mt-1 max-w-3xl">
          Automate Principle 6 (Environment) GHG disclosures mandated by the Securities and Exchange Board of India. Generate audit-ready turnover intensity, physical production intensity, and MCA-compliant XBRL instances.
        </p>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Inputs */}
        <div className="lg:col-span-6 space-y-5">
          <Card className="p-6 bg-surface-raised border border-border shadow-nm-raised">
            <h2 className="text-sm font-bold text-brand-heading uppercase tracking-wider mb-4 flex items-center gap-2">
              <Building size={16} className="text-brand-primary" />
              1. Listed Entity & Financial Parameters
            </h2>

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Corporate Identification Number (CIN) *"
                  value={cinNumber}
                  onChange={(e) => setCinNumber(e.target.value.toUpperCase())}
                  placeholder="e.g. L27100MH2024PLC198234"
                />
                <Input
                  label="Annual Turnover (₹ Crores) *"
                  type="number"
                  value={turnoverCrores}
                  onChange={(e) => setTurnoverCrores(parseFloat(e.target.value) || 0)}
                  min={1}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Total Physical Production Volume (Tonnes) *"
                  type="number"
                  value={physicalOutputTonnes}
                  onChange={(e) => setPhysicalOutputTonnes(parseFloat(e.target.value) || 0)}
                  min={1}
                />
                <Input
                  label="Physical Metric Name *"
                  value={outputMetric}
                  onChange={(e) => setOutputMetric(e.target.value)}
                />
              </div>

              <div className="pt-2 border-t border-border">
                <h3 className="text-xs font-bold text-brand-heading uppercase tracking-wider mb-3">
                  2. Third-Party Assurance Declaration
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Select
                    label="Assurance Level Mandated *"
                    value={assuranceType}
                    onChange={(e) => setAssuranceType(e.target.value as any)}
                    options={[
                      { value: 'Reasonable Assurance', label: 'Reasonable Assurance (SEBI Top 150-1,000)' },
                      { value: 'Limited Assurance', label: 'Limited Assurance (Standard ISO/ISAE)' },
                      { value: 'Internal Audit Only', label: 'Internal Audit / Management Review' },
                    ]}
                  />
                  <Input
                    label="Independent Assurance Agency"
                    value={assuranceAgency}
                    onChange={(e) => setAssuranceAgency(e.target.value)}
                    placeholder="e.g. DNV, TÜV SÜD, EY, KPMG"
                  />
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Output: BRSR Principle 6 Tables */}
        <div className="lg:col-span-6 space-y-5">
          <Card className="p-6 bg-surface-raised border border-border shadow-nm-raised">
            <h2 className="text-sm font-bold text-brand-heading uppercase tracking-wider mb-4 flex items-center justify-between">
              <span>Principle 6: Essential Indicator 7 & 8 Metrics</span>
              <span className="font-mono text-xs text-brand-muted">{reportingPeriod}</span>
            </h2>

            {/* Intensities Banner */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="p-3.5 bg-blue-50 border border-blue-200 rounded">
                <span className="text-[11px] font-semibold text-blue-900 block uppercase tracking-wider">
                  Turnover Intensity
                </span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-2xl font-mono font-bold text-blue-950 tabular-nums">
                    {brsrMetrics.turnoverIntensityLoc.toFixed(3)}
                  </span>
                  <span className="text-xs text-blue-800">tCO₂e / ₹ Cr</span>
                </div>
                <span className="text-[10px] text-blue-800 mt-1 block">
                  Mandated disclosure for investor ESG benchmarks
                </span>
              </div>

              <div className="p-3.5 bg-surface border border-border rounded">
                <span className="text-[11px] font-semibold text-brand-muted block uppercase tracking-wider">
                  Production Intensity
                </span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-2xl font-mono font-bold text-brand-heading tabular-nums">
                    {brsrMetrics.prodIntensityLoc.toFixed(4)}
                  </span>
                  <span className="text-xs text-brand-muted">tCO₂e / t</span>
                </div>
                <span className="text-[10px] text-brand-muted mt-1 block">
                  Specific footprint per finished product unit
                </span>
              </div>
            </div>

            {/* SEBI Essential Indicator 7 Table */}
            <div className="border border-border rounded overflow-hidden mb-5">
              <table className="w-full text-xs text-left">
                <thead className="bg-surface-sunken border-b border-border text-brand-muted uppercase text-[10px]">
                  <tr>
                    <th className="px-3 py-2 font-semibold">SEBI Principle 6 Indicator</th>
                    <th className="px-3 py-2 font-semibold text-right">Location-Based</th>
                    <th className="px-3 py-2 font-semibold text-right">Market-Based</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-mono text-brand-heading">
                  <tr>
                    <td className="px-3 py-2 font-sans font-medium text-brand-body">Scope 1 (Direct Emissions)</td>
                    <td className="px-3 py-2 text-right">{formatIndianNumber(summary.scope1)} t</td>
                    <td className="px-3 py-2 text-right">{formatIndianNumber(summary.scope1)} t</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-sans font-medium text-brand-body">Scope 2 (Electricity & Utilities)</td>
                    <td className="px-3 py-2 text-right">{formatIndianNumber(summary.scope2Location)} t</td>
                    <td className="px-3 py-2 text-right">{formatIndianNumber(summary.scope2Market)} t</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-sans font-medium text-brand-body">Scope 3 (Value Chain Inbound/Outbound)</td>
                    <td className="px-3 py-2 text-right">{formatIndianNumber(summary.scope3)} t</td>
                    <td className="px-3 py-2 text-right">{formatIndianNumber(summary.scope3)} t</td>
                  </tr>
                  <tr className="bg-surface font-bold text-sm">
                    <td className="px-3 py-2.5 font-sans text-brand-heading">Total Gross Inventory</td>
                    <td className="px-3 py-2.5 text-right">{formatIndianNumber(brsrMetrics.grossLocation)} t</td>
                    <td className="px-3 py-2.5 text-right">{formatIndianNumber(brsrMetrics.grossMarket)} t</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* XBRL Preview & Actions */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-brand-heading uppercase tracking-wider flex items-center gap-1.5">
                  <FileText size={14} className="text-brand-primary" />
                  SEBI MCA XBRL Document Instance
                  <span className="ml-2 font-sans font-normal normal-case tracking-normal">
                    {resultSource === 'api' ? (
                      <Badge variant="verified">Server-verified</Badge>
                    ) : (
                      <Badge variant="warning">Computed offline</Badge>
                    )}
                  </span>
                </h3>
                <Button variant="ghost" size="sm" onClick={handleCopyXbrl} leftIcon={copiedXbrl ? <Check size={14} /> : <Copy size={14} />}>
                  {copiedXbrl ? 'Copied' : 'Copy XBRL'}
                </Button>
              </div>

              <div className="h-44 overflow-y-auto p-3 bg-slate-900 text-slate-200 font-mono text-[11px] rounded border border-slate-800 select-all leading-normal">
                <pre>{filingXbrl}</pre>
              </div>

              <div className="pt-2 flex justify-end">
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleDownloadXbrl}
                  leftIcon={<Download size={16} />}
                >
                  Download SEBI BRSR Core XBRL File
                </Button>
              </div>
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
          executeDownload();
        }}
        title="Enterprise Verification — SEBI BRSR Core XBRL Export"
        description="Verify your organization details to download the official SEBI BRSR Core Principle 6 XBRL package with verified intensity ratios."
        actionType="brsr"
        inventorySummary={{
          totalTco2e: brsrMetrics.grossLocation,
          scope1: summary.scope1,
          scope2: summary.scope2Location,
          scope3: summary.scope3,
          qualityGrade: summary.dataQualityGrade,
        }}
      />
    </div>
  );
};
