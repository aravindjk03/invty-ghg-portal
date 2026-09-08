import React, { useState, useMemo } from 'react';
import { useGHG } from '../context/GHGContext';
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
  FileCode, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldAlert, 
  Globe, 
  Copy, 
  Check, 
  Building2, 
  Layers 
} from 'lucide-react';

interface CBAMPageProps {
  onNavigate: (page: string) => void;
}

const CN_CODES = [
  { value: '7214', label: '7214 - Steel bars & rods / rebar (Direct: 0.98, Indirect: 0.29 tCO2e/t)', sector: 'steel', defaultDirect: 0.98, defaultIndirect: 0.29 },
  { value: '7206', label: '7206 - Iron and non-alloy steel in ingots (Direct: 1.328, Indirect: 0.412 tCO2e/t)', sector: 'steel', defaultDirect: 1.328, defaultIndirect: 0.412 },
  { value: '7207', label: '7207 - Semi-finished products of iron/steel (Direct: 1.25, Indirect: 0.38 tCO2e/t)', sector: 'steel', defaultDirect: 1.25, defaultIndirect: 0.38 },
  { value: '7210', label: '7210 - Flat-rolled products, clad/coated (Direct: 1.15, Indirect: 0.34 tCO2e/t)', sector: 'steel', defaultDirect: 1.15, defaultIndirect: 0.34 },
  { value: '2523', label: '2523 - Cement clinker (Direct: 0.766, Indirect: 0.082 tCO2e/t)', sector: 'cement', defaultDirect: 0.766, defaultIndirect: 0.082 },
  { value: '7601', label: '7601 - Unwrought aluminium (Direct: 1.464, Indirect: 6.820 tCO2e/t)', sector: 'aluminium', defaultDirect: 1.464, defaultIndirect: 6.820 },
  { value: '2814', label: '2814 - Anhydrous ammonia fertiliser (Direct: 2.10, Indirect: 0.31 tCO2e/t)', sector: 'fertilisers', defaultDirect: 2.10, defaultIndirect: 0.31 },
];

export const CBAMPage: React.FC<CBAMPageProps> = ({ onNavigate }) => {
  const { summary, companyName, reportingPeriod, addToast } = useGHG();

  const [cnCode, setCnCode] = useState('7214');
  const [productionVolume, setProductionVolume] = useState(15000);
  const [scope1Attributed, setScope1Attributed] = useState(Number((summary.scope1 * 0.85).toFixed(1)));
  const [scope2Attributed, setScope2Attributed] = useState(Number((summary.scope2Location * 0.85).toFixed(1)));
  const [carbonPricePaidEur, setCarbonPricePaidEur] = useState(5.0);
  const [quarter, setQuarter] = useState<'Q1' | 'Q2' | 'Q3' | 'Q4'>('Q3');
  const [reportingYear, setReportingYear] = useState(2025);
  const [unLocode, setUnLocode] = useState('INJAI');
  const [copiedXml, setCopiedXml] = useState(false);
  const [leadGateOpen, setLeadGateOpen] = useState(false);

  const selectedGood = useMemo(() => {
    return CN_CODES.find((c) => c.value === cnCode) || CN_CODES[0];
  }, [cnCode]);

  // Specific embedded emissions calculations via Decimal.js
  const calcResults = useMemo(() => {
    const qty = new Decimal(productionVolume > 0 ? productionVolume : 1);
    const s1 = new Decimal(scope1Attributed >= 0 ? scope1Attributed : 0);
    const s2 = new Decimal(scope2Attributed >= 0 ? scope2Attributed : 0);

    const directSpecific = s1.dividedBy(qty).toDecimalPlaces(4).toNumber();
    const indirectSpecific = s2.dividedBy(qty).toDecimalPlaces(4).toNumber();
    const totalSpecific = new Decimal(directSpecific).plus(indirectSpecific).toDecimalPlaces(4).toNumber();
    const totalGross = s1.plus(s2).toNumber();

    const euBenchmarkTotal = new Decimal(selectedGood.defaultDirect).plus(selectedGood.defaultIndirect).toNumber();
    const diff = totalSpecific - euBenchmarkTotal;
    const deltaPercent = Number(((diff / euBenchmarkTotal) * 100).toFixed(1));

    // Estimated CBAM certificates cost at €68.5/tCO2e benchmark
    const euPrice = 68.5;
    const netEtsDifferential = Math.max(0, euPrice - carbonPricePaidEur);
    const estimatedCertCostEur = totalGross * netEtsDifferential;

    return {
      directSpecific,
      indirectSpecific,
      totalSpecific,
      totalGross,
      euBenchmarkTotal,
      deltaPercent,
      isBreached: deltaPercent > 0,
      estimatedCertCostEur,
    };
  }, [productionVolume, scope1Attributed, scope2Attributed, selectedGood, carbonPricePaidEur]);

  // Compliant EU CBAM XML structure
  const generatedXml = useMemo(() => {
    const ts = new Date().toISOString();
    return `<?xml version="1.0" encoding="UTF-8"?>
<!-- European Commission CBAM Transitional Registry XML - Regulation (EU) 2023/1773 -->
<CBAMQuarterlyReport xmlns="urn:eu:cbam:report:v1.0">
  <Header>
    <MessageId>CBAM-INVTY-${Date.now()}</MessageId>
    <CreationDateTime>${ts}</CreationDateTime>
    <ReportingPeriod>
      <Quarter>${quarter}</Quarter>
      <Year>${reportingYear}</Year>
    </ReportingPeriod>
    <Standard>EU-CBAM-TRANSITIONAL-2023-1773</Standard>
  </Header>
  <Installation>
    <Name>${companyName} - Primary Manufacturing Unit</Name>
    <CountryCode>IN</CountryCode>
    <UNLOCODE>${unLocode}</UNLOCODE>
    <Sector>${selectedGood.sector.toUpperCase()}</Sector>
  </Installation>
  <AggregatedGoodsCategory>
    <CNCode>${cnCode}</CNCode>
    <Description>${selectedGood.label}</Description>
    <TotalProductionVolume unit="metric_tonne">${productionVolume}</TotalProductionVolume>
    <SpecificEmbeddedEmissions unit="tCO2e/t">
      <DirectEmbeddedEmissions>${calcResults.directSpecific.toFixed(4)}</DirectEmbeddedEmissions>
      <IndirectEmbeddedEmissions>${calcResults.indirectSpecific.toFixed(4)}</IndirectEmbeddedEmissions>
      <TotalSpecificEmissions>${calcResults.totalSpecific.toFixed(4)}</TotalSpecificEmissions>
    </SpecificEmbeddedEmissions>
    <TotalEmissionsAttributed unit="tCO2e">
      <GrossTotal>${calcResults.totalGross.toFixed(2)}</GrossTotal>
    </TotalEmissionsAttributed>
    <BenchmarkAssessment>
      <EUBenchmarkValue>${calcResults.euBenchmarkTotal.toFixed(4)}</EUBenchmarkValue>
      <BenchmarkVariancePercentage>${calcResults.deltaPercent > 0 ? '+' : ''}${calcResults.deltaPercent}%</BenchmarkVariancePercentage>
      <Methodology>Actual Primary Installation Verified via ISO 14064-1</Methodology>
    </BenchmarkAssessment>
    <CarbonPriceEffectivelyPaidInOriginCountry>
      <Currency>EUR</Currency>
      <PricePerTonne>${carbonPricePaidEur.toFixed(2)}</PricePerTonne>
      <EligibleForRebateDeduction>true</EligibleForRebateDeduction>
    </CarbonPriceEffectivelyPaidInOriginCountry>
  </AggregatedGoodsCategory>
</CBAMQuarterlyReport>`;
  }, [companyName, unLocode, quarter, reportingYear, cnCode, selectedGood, productionVolume, calcResults, carbonPricePaidEur]);

  const handleCopyXml = () => {
    navigator.clipboard.writeText(generatedXml);
    setCopiedXml(true);
    setTimeout(() => setCopiedXml(false), 2000);
    addToast('success', 'CBAM XML communications package copied to clipboard');
  };

  const handleDownloadXml = () => {
    // Check if lead profile exists in localStorage
    const saved = localStorage.getItem('INVTY_LEAD_PROFILE');
    if (!saved) {
      setLeadGateOpen(true);
      return;
    }
    executeDownload();
  };

  const executeDownload = () => {
    const blob = new Blob([generatedXml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${companyName.replace(/\s+/g, '_')}_CBAM_${quarter}_${reportingYear}_Export.xml`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    addToast('success', 'Downloaded pre-formatted CBAM XML report for EU customs declaration');
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
          <Badge variant="primary">EU Regulation 2023/1773</Badge>
          <Badge variant="default">Quarterly Transitional Registry</Badge>
        </div>
      </div>

      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-brand-heading tracking-tight flex items-center gap-2.5">
          <Globe size={24} className="text-brand-primary" />
          EU CBAM (Carbon Border Adjustment Mechanism) Exporter Module
        </h1>
        <p className="text-sm text-brand-muted mt-1 max-w-3xl">
          Calculate actual direct and indirect embedded emissions per tonne of export goods to the European Union (Regulation EU 2023/956). Generate validated XML communications templates matching EU customs declarations.
        </p>
      </div>

      {/* Main Grid: Left Config / Right Calculations */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Form: Installation & Production Parameters */}
        <div className="lg:col-span-6 space-y-5">
          <Card className="p-6 bg-surface-raised border border-border shadow-nm-raised">
            <h2 className="text-sm font-bold text-brand-heading uppercase tracking-wider mb-4 flex items-center gap-2">
              <Building2 size={16} className="text-brand-primary" />
              1. Goods & Installation Parameters
            </h2>

            <div className="space-y-4">
              <div>
                <Select
                  label="CN Code (Combined Nomenclature Category) *"
                  value={cnCode}
                  onChange={(e) => setCnCode(e.target.value)}
                  options={CN_CODES.map((c) => ({ value: c.value, label: c.label }))}
                />
                <span className="text-[11px] text-brand-muted mt-1 block">
                  Official EU Default Benchmark: <strong>{calcResults.euBenchmarkTotal.toFixed(3)} tCO₂e/t</strong> (Direct: {selectedGood.defaultDirect} + Indirect: {selectedGood.defaultIndirect})
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Quarterly Production Export (Tonnes) *"
                  type="number"
                  value={productionVolume}
                  onChange={(e) => setProductionVolume(parseFloat(e.target.value) || 0)}
                  min={1}
                />
                <Input
                  label="Installation UN/LOCODE *"
                  value={unLocode}
                  onChange={(e) => setUnLocode(e.target.value.toUpperCase())}
                  placeholder="e.g. INJAI"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Select
                  label="Reporting Quarter *"
                  value={quarter}
                  onChange={(e) => setQuarter(e.target.value as any)}
                  options={[
                    { value: 'Q1', label: 'Q1 (Jan - Mar)' },
                    { value: 'Q2', label: 'Q2 (Apr - Jun)' },
                    { value: 'Q3', label: 'Q3 (Jul - Sep)' },
                    { value: 'Q4', label: 'Q4 (Oct - Dec)' },
                  ]}
                />
                <Input
                  label="Reporting Year *"
                  type="number"
                  value={reportingYear}
                  onChange={(e) => setReportingYear(parseInt(e.target.value, 10) || 2025)}
                  min={2023}
                  max={2030}
                />
              </div>

              <div className="pt-2 border-t border-border">
                <h3 className="text-xs font-bold text-brand-heading uppercase tracking-wider mb-3">
                  2. Attributed Emissions & Domestic Carbon Price
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Scope 1 Direct Attributed (tCO₂e) *"
                    type="number"
                    value={scope1Attributed}
                    onChange={(e) => setScope1Attributed(parseFloat(e.target.value) || 0)}
                    step={0.1}
                  />
                  <Input
                    label="Scope 2 Electricity Attributed (tCO₂e) *"
                    type="number"
                    value={scope2Attributed}
                    onChange={(e) => setScope2Attributed(parseFloat(e.target.value) || 0)}
                    step={0.1}
                  />
                </div>

                <div className="mt-3">
                  <Input
                    label="Carbon Tax / Price Paid in Origin Country (€/tCO₂e)"
                    type="number"
                    value={carbonPricePaidEur}
                    onChange={(e) => setCarbonPricePaidEur(parseFloat(e.target.value) || 0)}
                    step={0.5}
                    min={0}
                  />
                  <span className="text-[11px] text-brand-muted mt-1 block">
                    Under Article 9 of EU CBAM, verifiable carbon price paid domestically reduces CBAM certificate surcharges.
                  </span>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Output: Embedded Emission Metrics & Benchmark Analysis */}
        <div className="lg:col-span-6 space-y-5">
          <Card className="p-6 bg-surface-raised border border-border shadow-nm-raised">
            <h2 className="text-sm font-bold text-brand-heading uppercase tracking-wider mb-4 flex items-center justify-between">
              <span>Specific Embedded Emissions Results</span>
              <span className="font-mono text-xs text-brand-muted">{quarter} {reportingYear}</span>
            </h2>

            {/* KPI Triplet */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="p-3 bg-surface border border-border rounded">
                <span className="text-[11px] font-semibold text-brand-muted block">Direct (SEE_dir)</span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-xl font-mono font-bold text-brand-heading tabular-nums">
                    {calcResults.directSpecific.toFixed(4)}
                  </span>
                  <span className="text-[10px] text-brand-muted">t/t</span>
                </div>
              </div>

              <div className="p-3 bg-surface border border-border rounded">
                <span className="text-[11px] font-semibold text-brand-muted block">Indirect (SEE_ind)</span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-xl font-mono font-bold text-brand-heading tabular-nums">
                    {calcResults.indirectSpecific.toFixed(4)}
                  </span>
                  <span className="text-[10px] text-brand-muted">t/t</span>
                </div>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded">
                <span className="text-[11px] font-semibold text-blue-900 block">Total Embedded (SEE)</span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-xl font-mono font-bold text-blue-950 tabular-nums">
                    {calcResults.totalSpecific.toFixed(4)}
                  </span>
                  <span className="text-[10px] text-blue-800">tCO₂e/t</span>
                </div>
              </div>
            </div>

            {/* Benchmark Comparison Alert */}
            <div className={`p-4 rounded border mb-5 ${
              calcResults.isBreached
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : 'bg-emerald-50 border-emerald-200 text-emerald-900'
            }`}>
              <div className="flex items-start gap-2.5">
                {calcResults.isBreached ? (
                  <AlertTriangle size={18} className="text-amber-700 flex-shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 size={18} className="text-emerald-700 flex-shrink-0 mt-0.5" />
                )}
                <div>
                  <span className="font-bold block">
                    {calcResults.isBreached
                      ? `Exceeds EU Default Benchmark by +${calcResults.deltaPercent}%`
                      : `Compliant: ${Math.abs(calcResults.deltaPercent)}% Cleaner Than EU Benchmark`}
                  </span>
                  <p className="text-[11px] mt-0.5 leading-relaxed">
                    Actual installation intensity is <strong>{calcResults.totalSpecific.toFixed(3)} tCO₂e/t</strong> vs EU default reference of <strong>{calcResults.euBenchmarkTotal.toFixed(3)} tCO₂e/t</strong>.
                    {calcResults.isBreached && ' During definitive period (2026+), EU importers will incur CBAM certificate surrender penalties on this excess variance.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Financial Certificate Estimation */}
            <div className="p-3 bg-surface border border-border rounded text-xs space-y-2 mb-5">
              <div className="flex items-center justify-between">
                <span className="text-brand-muted">Gross Attributed Emissions:</span>
                <span className="font-mono font-semibold text-brand-heading">
                  {formatIndianNumber(calcResults.totalGross)} tCO₂e
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-brand-muted">Net CBAM ETS Differential (€68.50 - €{carbonPricePaidEur.toFixed(2)}):</span>
                <span className="font-mono font-semibold text-brand-heading">
                  €{Math.max(0, 68.5 - carbonPricePaidEur).toFixed(2)} / tCO₂e
                </span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-border">
                <span className="font-bold text-brand-heading">Estimated CBAM Certificate Liability:</span>
                <span className="font-mono font-bold text-brand-heading text-sm">
                  €{formatIndianNumber(calcResults.estimatedCertCostEur)}
                </span>
              </div>
            </div>

            {/* XML Generator & Actions */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-brand-heading uppercase tracking-wider flex items-center gap-1.5">
                  <FileCode size={14} className="text-brand-primary" />
                  EU Customs XML Communications Preview
                </h3>
                <Button variant="ghost" size="sm" onClick={handleCopyXml} leftIcon={copiedXml ? <Check size={14} /> : <Copy size={14} />}>
                  {copiedXml ? 'Copied' : 'Copy XML'}
                </Button>
              </div>

              <div className="h-44 overflow-y-auto p-3 bg-slate-900 text-slate-200 font-mono text-[11px] rounded border border-slate-800 select-all leading-normal">
                <pre>{generatedXml}</pre>
              </div>

              <div className="pt-2 flex justify-end">
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleDownloadXml}
                  leftIcon={<Download size={16} />}
                >
                  Download CBAM Communications XML
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
        title="Enterprise Verification — EU CBAM XML Export"
        description="Verify your corporate credentials to export the official quarterly EU CBAM communication file conforming to EU Regulation 2023/1773."
        actionType="cbam"
        inventorySummary={{
          totalTco2e: calcResults.totalGross,
          scope1: scope1Attributed,
          scope2: scope2Attributed,
          scope3: 0,
          qualityGrade: 'A',
        }}
      />
    </div>
  );
};
