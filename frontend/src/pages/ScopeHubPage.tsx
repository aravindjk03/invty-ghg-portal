import React from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Tooltip } from '../components/ui/Tooltip';
import { SummaryRail } from '../components/layout/SummaryRail';
import { useGHG } from '../context/GHGContext';
import { formatIndianNumber } from '../engine/unitConverter';
import { ArrowRight, Building2, CheckCircle2 } from 'lucide-react';

export interface ScopeHubPageProps {
  onNavigate: (page: string) => void;
}

const SCOPE_3_CATEGORIES = [
  { num: 1, name: 'Purchased goods & services', status: 'active' },
  { num: 2, name: 'Capital goods', status: 'screened' },
  { num: 3, name: 'Fuel- and energy-related activities (FERA)', status: 'active' },
  { num: 4, name: 'Upstream transportation & logistics', status: 'active' },
  { num: 5, name: 'Waste generated in operations', status: 'screened' },
  { num: 6, name: 'Business travel', status: 'active' },
  { num: 7, name: 'Employee commuting', status: 'screened' },
  { num: 8, name: 'Upstream leased assets', status: 'screened' },
  { num: 9, name: 'Downstream transportation', status: 'screened' },
  { num: 10, name: 'Processing of sold products', status: 'screened' },
  { num: 11, name: 'Use of sold products', status: 'screened' },
  { num: 12, name: 'End-of-life treatment of sold products', status: 'screened' },
  { num: 13, name: 'Downstream leased assets', status: 'screened' },
  { num: 14, name: 'Franchises', status: 'screened' },
  { num: 15, name: 'Investments & portfolio assets', status: 'screened' },
];

export const ScopeHubPage: React.FC<ScopeHubPageProps> = ({ onNavigate }) => {
  const { scope1Entries, scope2Entries, scope3Entries, summary, companyName, reportingPeriod, boundaryApproach } = useGHG();

  const s1Progress = Math.min(100, Math.max(15, scope1Entries.length * 15));
  const s2Progress = Math.min(100, Math.max(25, scope2Entries.length * 50));

  return (
    <div className="max-w-[1440px] mx-auto px-6 py-8">
      {/* Executive Header Banner */}
      <div className="mb-8 border-b border-border pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5 text-xs text-brand-muted font-medium">
            <span>Corporate ESG Reporting Suite</span>
            <span>/</span>
            <span>Accounting Workspaces</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-brand-heading tracking-tight">
            GHG Emissions Inventory Overview
          </h1>
          <p className="text-xs md:text-sm text-brand-muted mt-1 max-w-3xl leading-relaxed">
            Consolidated organizational inventory compliant with the GHG Protocol Corporate Standard, ISO 14064-1:2018, and SEBI BRSR Core. Data entries auto-synchronize with assurance statements and audit trails.
          </p>
        </div>

        <div className="flex items-center gap-2.5 text-xs text-brand-muted font-mono bg-surface p-2.5 rounded border border-border">
          <Building2 size={15} className="text-brand-primary" />
          <span>{companyName}</span>
          <span className="text-border-strong">|</span>
          <span>{reportingPeriod}</span>
        </div>
      </div>

      {/* 12-Column Corporate Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Main Content Area: Columns 1 to 8 */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          {/* Scope 1 & Scope 2 Side-by-Side Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
            {/* Scope 1 Card */}
            <Card
              interactive
              onClick={() => onNavigate('scope-1')}
              className="flex flex-col justify-between h-full p-6 border-border hover:border-border-strong transition-all"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold uppercase tracking-wide bg-orange-50 text-orange-800 border border-orange-200">
                    SCOPE 1
                  </span>
                  <span className="text-[11px] font-mono text-brand-muted">Direct Combustion</span>
                </div>

                <h2 className="text-lg font-bold text-brand-heading">
                  Direct GHG Emissions
                </h2>
                <p className="text-xs text-brand-muted mt-1 leading-normal min-h-[36px]">
                  Fuel consumption in boilers, re-heating furnaces, captive DG generation, mobile plant fleet, process calcination, and HVAC equipment.
                </p>

                {/* Metric Summary Strip */}
                <div className="mt-5 pt-3 border-t border-border flex items-center justify-between">
                  <div className="text-xs">
                    <span className="text-brand-muted block text-[11px]">Logged Activity Lines</span>
                    <span className="font-semibold text-brand-heading font-mono">{scope1Entries.length} verified records</span>
                  </div>
                  <div className="text-right">
                    <span className="text-brand-muted block text-[11px]">Subtotal (tCO₂e)</span>
                    <span className="text-xl font-mono font-bold text-brand-heading tabular-nums">
                      {formatIndianNumber(summary.scope1)}
                    </span>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full h-1 bg-surface-sunken rounded-sm overflow-hidden mt-3 border border-border">
                  <div className="h-full bg-scope-1" style={{ width: `${s1Progress}%` }} />
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-border">
                <Button
                  variant="primary"
                  fullWidth
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onNavigate('scope-1');
                  }}
                  rightIcon={<ArrowRight size={14} />}
                >
                  Open Scope 1 Register
                </Button>
              </div>
            </Card>

            {/* Scope 2 Card */}
            <Card
              interactive
              onClick={() => onNavigate('scope-2')}
              className="flex flex-col justify-between h-full p-6 border-border hover:border-border-strong transition-all"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold uppercase tracking-wide bg-blue-50 text-blue-800 border border-blue-200">
                    SCOPE 2
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                    <CheckCircle2 size={13} />
                    Dual Reporting Active
                  </span>
                </div>

                <h2 className="text-lg font-bold text-brand-heading">
                  Purchased Energy & Grid Power
                </h2>
                <p className="text-xs text-brand-muted mt-1 leading-normal min-h-[36px]">
                  Purchased grid electricity (CEA India baseline), open-access renewable contracts, green tariffs, and on-site electric fleet charging.
                </p>

                {/* Metric Summary Strip */}
                <div className="mt-5 pt-3 border-t border-border grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-brand-muted block text-[11px]">Location-Based (CEA Grid)</span>
                    <span className="text-lg font-mono font-bold text-brand-heading tabular-nums">
                      {formatIndianNumber(summary.scope2Location)} t
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-brand-muted block text-[11px]">Market-Based (PPA / EAC)</span>
                    <span className="text-lg font-mono font-bold text-emerald-700 tabular-nums">
                      {formatIndianNumber(summary.scope2Market)} t
                    </span>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full h-1 bg-surface-sunken rounded-sm overflow-hidden mt-3 border border-border">
                  <div className="h-full bg-scope-2" style={{ width: `${s2Progress}%` }} />
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-border">
                <Button
                  variant="secondary"
                  fullWidth
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onNavigate('scope-2');
                  }}
                  rightIcon={<ArrowRight size={14} />}
                >
                  Manage Scope 2 Energy
                </Button>
              </div>
            </Card>
          </div>

          {/* Scope 3 Full-Width Card */}
          <Card
            interactive
            onClick={() => onNavigate('scope-3')}
            className="p-6 border-border hover:border-border-strong transition-all"
          >
            <div>
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-border">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold uppercase tracking-wide bg-purple-50 text-purple-800 border border-purple-200">
                      SCOPE 3
                    </span>
                    <span className="text-xs font-semibold text-brand-muted">Value Chain Standard (All 15 Categories)</span>
                  </div>
                  <h2 className="text-xl font-bold text-brand-heading">
                    Indirect Value Chain Emissions
                  </h2>
                  <p className="text-xs text-brand-muted mt-1 max-w-2xl leading-normal">
                    Upstream raw material sourcing (scrap steel, ferroalloys), commercial freight transport, Category 3 transmission losses (auto-derived), and corporate travel.
                  </p>
                </div>

                <div className="text-left sm:text-right flex-shrink-0 bg-surface sm:bg-transparent p-3 sm:p-0 rounded border sm:border-0 border-border">
                  <span className="text-[11px] font-bold text-brand-muted uppercase tracking-wider block">
                    Scope 3 Total
                  </span>
                  <div className="flex items-baseline sm:justify-end gap-1 mt-0.5">
                    <span className="text-2xl font-mono font-bold text-brand-heading tabular-nums">
                      {formatIndianNumber(summary.scope3)}
                    </span>
                    <span className="text-xs font-medium text-brand-muted">tCO₂e</span>
                  </div>
                </div>
              </div>

              {/* 15 Scope 3 Category Screening Grid */}
              <div className="mt-5">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-xs font-bold text-brand-heading uppercase tracking-wider">
                    GHG Protocol 15-Category Matrix Screening Status
                  </span>
                  <span className="text-xs text-brand-muted font-mono">
                    {summary.coverage.scope3CategoriesIncluded} active categories · Cat 3 auto-derived
                  </span>
                </div>

                <div className="grid grid-cols-5 sm:grid-cols-8 lg:grid-cols-[repeat(15,minmax(0,1fr))] gap-1.5">
                  {SCOPE_3_CATEGORIES.map((cat) => {
                    const isActive = cat.status === 'active';
                    return (
                      <Tooltip key={cat.num} content={`Category ${cat.num}: ${cat.name} (${cat.status.toUpperCase()})`}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onNavigate('scope-3');
                          }}
                          className={`h-9 rounded border text-xs flex flex-col items-center justify-center transition-colors cursor-pointer ${
                            isActive
                              ? 'bg-purple-700 text-white border-purple-800 font-bold'
                              : 'bg-surface text-brand-muted border-border hover:bg-slate-200/60'
                          }`}
                        >
                          <span className="font-mono text-xs font-semibold leading-none">{cat.num}</span>
                          <span className="text-[8px] uppercase tracking-tight opacity-80 mt-0.5">
                            {isActive ? 'ACT' : 'SCR'}
                          </span>
                        </button>
                      </Tooltip>
                    );
                  })}
                </div>
              </div>

              {/* Actions */}
              <div className="mt-6 pt-4 border-t border-border flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onNavigate('scope-3');
                    }}
                    rightIcon={<ArrowRight size={14} />}
                  >
                    Open Scope 3 Register
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onNavigate('scope-3');
                    }}
                  >
                    Review Category Screening
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Rail: Columns 9 to 12 */}
        <div className="lg:col-span-4">
          <SummaryRail onGenerateReport={() => onNavigate('report')} />
        </div>
      </div>
    </div>
  );
};
