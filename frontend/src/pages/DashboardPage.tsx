import React, { useState, useMemo } from 'react';
import { Card } from '../components/ui/Card';
import { KPITile } from '../components/ui/KPITile';
import { Button } from '../components/ui/Button';
import { ScopeBadge } from '../components/ui/ScopeBadge';
import { Badge } from '../components/ui/Badge';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { StackedScopeBar } from '../components/charts/StackedScopeBar';
import { DonutChart } from '../components/charts/DonutChart';
import { SankeyDiagram } from '../components/charts/SankeyDiagram';
import { useGHG } from '../context/GHGContext';
import { ghgService } from '../services/ghgService';
import { formatIndianNumber } from '../engine/unitConverter';
import { calculateIntensity } from '../engine/calculator';
import { Sliders, TrendingDown, Download, CheckCircle, ArrowRight } from 'lucide-react';

export interface DashboardPageProps {
  onNavigate: (page: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate }) => {
  const {
    companyName,
    reportingPeriod,
    scope1Entries,
    scope2Entries,
    scope3Entries,
    summary,
    scenario,
    scenarioResult,
    updateScenario,
    addToast,
  } = useGHG();

  const [downloadFormat, setDownloadFormat] = useState('PDF');

  const allEntries = useMemo(() => {
    return [...scope1Entries, ...scope2Entries, ...scope3Entries];
  }, [scope1Entries, scope2Entries, scope3Entries]);

  // Dynamically compute Top Sources sorted by emission magnitude
  const topSources = useMemo(() => {
    return [...allEntries]
      .sort((a, b) => (b.calculatedTco2e || 0) - (a.calculatedTco2e || 0))
      .slice(0, 10)
      .map((entry, idx) => ({
        rank: idx + 1,
        source: entry.fuelOrSource,
        scope: entry.scope as 'scope-1' | 'scope-2' | 'scope-3',
        category: entry.category.replace(/_/g, ' '),
        value: entry.calculatedTco2e || 0,
        qualityTier: entry.emissionFactor?.qualityTier || 'Secondary',
      }));
  }, [allEntries]);

  // Dynamically compute Donut breakdown
  const topDonutData = useMemo(() => {
    return [
      { name: 'Scope 1 Direct', value: summary.scope1, color: 'var(--scope-1)' },
      { name: 'Scope 2 Electricity', value: summary.scope2Location, color: 'var(--scope-2)' },
      { name: 'Scope 3 Supply Chain', value: summary.scope3, color: 'var(--scope-3)' },
      { name: 'Biogenic Memo', value: summary.biogenicMemo, color: '#10B981' },
    ].filter((d) => d.value > 0);
  }, [summary]);

  // Bug Guard #8: Intensity guard calculation (denominator = 480 Cr annual turnover)
  const intensityData = useMemo(() => {
    return calculateIntensity(summary.totalEmissions, 480);
  }, [summary.totalEmissions]);

  const handleExport = () => {
    if (downloadFormat === 'PDF') {
      onNavigate('report');
      return;
    }

    if (downloadFormat === 'XLSX') {
      ghgService.exportXlsx(allEntries, summary, `${companyName.replace(/\s+/g, '_')}_GHG_Inventory.xlsx`);
      addToast('success', 'Downloaded full Excel inventory audit trail (XLSX)');
      return;
    }

    if (downloadFormat === 'CSV') {
      ghgService.exportCsv(allEntries, `${companyName.replace(/\s+/g, '_')}_GHG_Activity_Data.csv`);
      addToast('success', 'Downloaded activity lines as CSV');
      return;
    }

    if (downloadFormat === 'JSON') {
      ghgService.exportJson(
        {
          companyName,
          reportingPeriod,
          summary,
          entries: allEntries,
          exportedAt: new Date().toISOString(),
        },
        `${companyName.replace(/\s+/g, '_')}_GHG_Data.json`
      );
      addToast('success', 'Downloaded JSON inventory export');
    }
  };

  const qualityMeters = [
    {
      dimension: 'Technological Representativeness',
      score: 4,
      action: 'Replace industry average EAF emission factor with on-site continuous emission monitoring (CEMS).',
    },
    {
      dimension: 'Temporal Representativeness',
      score: 4,
      action: 'Factors from DESNZ and CEA are within current compliance window.',
    },
    {
      dimension: 'Geographical Representativeness',
      score: summary.dataQualityGrade === 'A' || summary.dataQualityGrade === 'B' ? 4 : 3,
      action: 'Replace international proxy scrap factors with domestic Indian secondary steelmaker LCA data.',
    },
    {
      dimension: 'Completeness',
      score: summary.coverage.scopesCompleted === 3 ? 4 : 3,
      action: 'Scope 1, 2, and active Scope 3 categories accounted.',
    },
    {
      dimension: 'Reliability',
      score: 4,
      action: 'Calibrate weighbridge fuel meters and gas intake chromatographs every six months.',
    },
  ];

  return (
    <div className="max-w-[1440px] mx-auto px-6 py-8 pb-32 space-y-8 select-none">
      {/* ROW 1: 4 KPI Tiles (Uniformly Aligned) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
        <KPITile
          label="Total Emissions"
          value={summary.totalEmissions}
          unit="tCO₂e"
          tooltipText="Consolidated operational emissions across Scopes 1, 2, and active Scope 3 categories."
          delta={{ value: '-4.2%', isDecrease: true }}
        />
        <KPITile
          label="Emissions Intensity"
          value={intensityData.value || 0}
          unit="tCO₂e / ₹ Cr"
          tooltipText="Gross operational carbon emissions divided by total corporate annual turnover (₹480 Cr)."
          delta={{ value: '-6.8%', isDecrease: true }}
        />
        <KPITile
          label="Data Quality Grade"
          value={`Grade ${summary.dataQualityGrade}`}
          gradeCircle={{ grade: summary.dataQualityGrade, color: `var(--grade-${summary.dataQualityGrade.toLowerCase()})` }}
          subtext={`Grade ${summary.dataQualityGrade} · GHG Protocol DQI`}
          tooltipText="GHG Protocol Data Quality Indicator score based on primary, secondary and proxy factor distributions."
        />
        <KPITile
          label="Coverage Scope"
          value={`${summary.coverage.scopesCompleted} of 3 Scopes`}
          unit={`· ${summary.coverage.scope3CategoriesIncluded} of 15 Cat`}
          subtext="BRSR Core & Scope 3 Compliant"
          tooltipText="Completed operational scopes plus screened Scope 3 value chain categories."
        />
      </div>

      {/* ROW 2: Two Cards (8 Cols / 4 Cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Left: Stacked Scope Split & Legend */}
        <Card className="lg:col-span-8 flex flex-col justify-between p-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-lg font-bold text-brand-heading">Emissions Split by Scope</h3>
                <p className="text-xs text-brand-muted mt-0.5">
                  Gross operational boundary distribution (Operational Control)
                </p>
              </div>
              <Badge variant="verified">Dual Reporting Ready</Badge>
            </div>

            <div className="my-6">
              <StackedScopeBar
                scope1={summary.scope1}
                scope2={summary.scope2Location}
                scope3={summary.scope3}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-border">
            <div className="p-3 bg-surface rounded-lg border border-border">
              <span className="text-xs font-bold text-scope-1 block">Scope 1 Direct</span>
              <span className="text-lg font-mono font-bold text-brand-heading">
                {formatIndianNumber(summary.scope1)} t
              </span>
              <span className="text-[11px] text-brand-muted block">
                {summary.totalEmissions > 0 ? ((summary.scope1 / summary.totalEmissions) * 100).toFixed(1) : 0}% of total
              </span>
            </div>
            <div className="p-3 bg-surface rounded-lg border border-border">
              <span className="text-xs font-bold text-scope-2 block">Scope 2 Location</span>
              <span className="text-lg font-mono font-bold text-brand-heading">
                {formatIndianNumber(summary.scope2Location)} t
              </span>
              <span className="text-[11px] text-brand-muted block">
                {summary.totalEmissions > 0 ? ((summary.scope2Location / summary.totalEmissions) * 100).toFixed(1) : 0}% of total
              </span>
            </div>
            <div className="p-3 bg-surface rounded-lg border border-border">
              <span className="text-xs font-bold text-scope-3 block">Scope 3 Value Chain</span>
              <span className="text-lg font-mono font-bold text-brand-heading">
                {formatIndianNumber(summary.scope3)} t
              </span>
              <span className="text-[11px] text-brand-muted block">
                {summary.totalEmissions > 0 ? ((summary.scope3 / summary.totalEmissions) * 100).toFixed(1) : 0}% of total
              </span>
            </div>
          </div>
        </Card>

        {/* Right: Scope Distribution Donut */}
        <Card className="lg:col-span-4 flex flex-col justify-between p-6">
          <div>
            <h3 className="text-lg font-bold text-brand-heading mb-1">Source Concentration</h3>
            <p className="text-xs text-brand-muted mb-4">
              Relative emission mass by greenhouse scope
            </p>
            <DonutChart
              data={topDonutData}
              centerLabel="Total"
              centerValue={`${summary.totalEmissions.toFixed(0)} t`}
            />
          </div>

          <div className="text-xs text-brand-muted pt-3 border-t border-border flex justify-between items-center">
            <span>Biogenic memo emissions:</span>
            <strong className="text-emerald-700 font-mono">{formatIndianNumber(summary.biogenicMemo)} tCO₂e</strong>
          </div>
        </Card>
      </div>

      {/* ROW 3: Sankey Flow Diagram */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-brand-heading">Emissions Flow Diagram (Sankey)</h3>
            <p className="text-xs text-brand-muted mt-0.5">
              Material flow tracing energy inputs and process reactions through to Scopes 1, 2 and 3
            </p>
          </div>
        </div>
        <SankeyDiagram />
      </Card>

      {/* ROW 4: Top Emission Contributors Table */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-brand-heading">Top Carbon Contributors</h3>
            <p className="text-xs text-brand-muted mt-0.5">
              Ranked descending by absolute greenhouse gas intensity across all logged activities
            </p>
          </div>
          <span className="text-xs text-brand-muted font-mono">
            {allEntries.length} total entries analyzed
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-border text-[11px] font-bold uppercase tracking-wider text-brand-muted">
                <th className="py-2.5 px-3">#</th>
                <th className="py-2.5 px-3">Emission Activity / Source</th>
                <th className="py-2.5 px-3">Scope</th>
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3">Quality Tier</th>
                <th className="py-2.5 px-3 text-right">Emissions (tCO₂e)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {topSources.map((row) => (
                <tr key={row.rank} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-2.5 px-3 font-mono font-semibold text-brand-muted">{row.rank}</td>
                  <td className="py-2.5 px-3 font-semibold text-brand-heading">{row.source}</td>
                  <td className="py-2.5 px-3">
                    <ScopeBadge scope={row.scope} size="sm" />
                  </td>
                  <td className="py-2.5 px-3 text-brand-body">{row.category}</td>
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                      {row.qualityTier}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-brand-heading">
                    {formatIndianNumber(row.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ROW 5: Decarbonisation Scenario Modelling */}
      <Card className="p-6 bg-surface-raised border border-border">
        <div className="flex items-center justify-between pb-3 border-b border-border mb-4">
          <div className="flex items-center gap-2">
            <Sliders size={18} className="text-brand-primary" />
            <h3 className="text-base font-bold text-brand-heading">
              Decarbonisation Scenario Modelling & Sensitivity Analysis
            </h3>
          </div>
          <span className="text-xs font-mono text-brand-muted">FY 2030 Reduction Roadmap</span>
        </div>
        <p className="text-xs text-brand-muted mb-5 max-w-2xl">
          Simulate capital decarbonisation levers. Instantaneously evaluates emissions reduction across Scope 1, Scope 2, and upstream Category 3 transmission loss baselines.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div>
            <div className="flex justify-between text-xs mb-1.5 font-semibold text-brand-body">
              <span>Renewable Electricity PPA</span>
              <span className="font-mono text-brand-primary">{scenario.renewableElectricityPercent}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={scenario.renewableElectricityPercent}
              onChange={(e) => updateScenario({ renewableElectricityPercent: Number(e.target.value) })}
              className="w-full accent-brand-primary cursor-pointer"
            />
            <span className="text-[11px] text-brand-muted block mt-1">
              Replaces CEA grid power with zero-emission solar open access
            </span>
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1.5 font-semibold text-brand-body">
              <span>Stationary Diesel Reduction</span>
              <span className="font-mono text-orange-600">{scenario.dieselReductionPercent}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="50"
              value={scenario.dieselReductionPercent}
              onChange={(e) => updateScenario({ dieselReductionPercent: Number(e.target.value) })}
              className="w-full accent-orange-600 cursor-pointer"
            />
            <span className="text-[11px] text-brand-muted block mt-1">
              Energy efficiency in re-heating furnaces and DG sets
            </span>
          </div>

          <div className="flex flex-col justify-between">
            <div>
              <span className="text-xs font-semibold text-brand-body block mb-1">
                Electrify Heavy Transport Fleet
              </span>
              <span className="text-[11px] text-brand-muted block">
                Replace diesel yard loaders and slag trucks with electric plant haulers
              </span>
            </div>
            <div className="mt-2">
              <Button
                variant={scenario.switchFleetToElectric ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => updateScenario({ switchFleetToElectric: !scenario.switchFleetToElectric })}
              >
                {scenario.switchFleetToElectric ? 'Fleet Electrified (Active)' : 'Enable Fleet Electrification'}
              </Button>
            </div>
          </div>
        </div>

        {/* Simulation Output Delta */}
        <div className="p-4 rounded-xl bg-surface border border-border flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center">
              <TrendingDown size={20} />
            </div>
            <div>
              <span className="text-xs text-brand-muted block">Projected Total Emissions:</span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-mono font-bold text-brand-heading">
                  {formatIndianNumber(scenarioResult.newTotal)} tCO₂e
                </span>
                <span className="text-xs font-bold text-emerald-600 font-mono">
                  (-{formatIndianNumber(scenarioResult.deltaTco2e)} tCO₂e / -{scenarioResult.deltaPercentage}%)
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            <div>
              <span className="text-brand-muted block">Scope 1 New:</span>
              <strong className="text-brand-heading">{formatIndianNumber(scenarioResult.scope1New)} t</strong>
            </div>
            <div>
              <span className="text-brand-muted block">Scope 2 New:</span>
              <strong className="text-emerald-700">{formatIndianNumber(scenarioResult.scope2New)} t</strong>
            </div>
            <div>
              <span className="text-brand-muted block">Scope 3 New:</span>
              <strong className="text-purple-700">{formatIndianNumber(scenarioResult.scope3New)} t</strong>
            </div>
          </div>
        </div>
      </Card>

      {/* Sticky Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 h-16 bg-surface-raised/95 backdrop-blur-md border-t border-border shadow-nm-raised-sm z-30 flex items-center">
        <div className="max-w-[1440px] mx-auto w-full px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <SegmentedControl
              size="sm"
              value={downloadFormat}
              onChange={setDownloadFormat}
              options={[
                { value: 'PDF', label: 'PDF Report' },
                { value: 'XLSX', label: 'Excel (XLSX)' },
                { value: 'CSV', label: 'CSV' },
                { value: 'JSON', label: 'JSON' },
              ]}
            />
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onNavigate('scope-hub')}
            >
              Back to Hub
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={handleExport}
              leftIcon={<Download size={16} />}
            >
              {downloadFormat === 'PDF' ? 'Preview & Download PDF Report' : `Export Inventory (${downloadFormat})`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
