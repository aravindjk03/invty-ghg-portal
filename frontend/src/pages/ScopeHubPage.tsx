import React from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Tooltip } from '../components/ui/Tooltip';
import { SummaryRail } from '../components/layout/SummaryRail';
import { useGHG } from '../context/GHGContext';
import { formatIndianNumber } from '../engine/unitConverter';
import { ALL_15_CATEGORIES } from './Scope3Page';
import { ArrowRight, Building2, CheckCircle2, Package } from 'lucide-react';

export interface ScopeHubPageProps {
  onNavigate: (page: string) => void;
}


export const ScopeHubPage: React.FC<ScopeHubPageProps> = ({ onNavigate }) => {
  const { scope1Entries, scope2Entries, scope3Entries, summary, companyName, reportingPeriod, boundaryApproach } = useGHG();

  // There were two progress bars here, driven by row count with a 15% and a 25%
  // floor — so an untouched inventory reported Scope 1 "15% complete" and
  // Scope 2 "25% complete". Nothing knows how many rows a given company's
  // inventory ought to have, so no honest percentage exists. The row count,
  // which is true, is shown instead.

  return (
    <div className="max-w-[1440px] mx-auto px-6 py-8">
      {/* Executive Header Banner */}
      <div className="mb-8 border-b border-border pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5 text-xs text-brand-muted font-medium">
            <span>IINVTY</span>
            <span>/</span>
            <span>Your inventory</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-brand-heading tracking-tight">
            Your emissions inventory
          </h1>
          <p className="text-xs md:text-sm text-brand-muted mt-1 max-w-3xl leading-relaxed">
            A consolidated organisational inventory built to the GHG Protocol Corporate Standard, ISO 14064-1:2018 and SEBI BRSR Core. Every row you enter carries the factor that calculated it through to the report and the calculation record.
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
          {/* Product Carbon Footprint - any product, creation and use */}
          <Card
            interactive
            onClick={() => onNavigate('product-carbon')}
            className="p-6"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
              <div className="flex-1">
                <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-brand-link block">
                  Product lifecycle · ISO 14067
                </span>
                <h2 className="mt-1.5 text-xl font-bold text-brand-heading flex items-center gap-2">
                  <Package className="w-5 h-5 text-brand-link" />
                  Product Carbon Footprint
                </h2>
                <p className="text-sm text-brand-muted mt-1.5 max-w-2xl leading-relaxed">
                  Name any product or material. AI breaks down how it is made and used, and the calculation engine
                  works out the carbon from creating it and from using it.
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-brand-body">
                  <span className="rounded-md border border-border bg-surface px-2 py-1">Creation emissions</span>
                  <span className="rounded-md border border-border bg-surface px-2 py-1">Use-phase emissions</span>
                  <span className="rounded-md border border-border bg-surface px-2 py-1">AI analysis &amp; reduction ideas</span>
                </div>
              </div>
              <Button
                variant="primary"
                size="sm"
                className="self-start md:self-center"
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigate('product-carbon');
                }}
                rightIcon={<ArrowRight size={14} />}
              >
                Estimate a product
              </Button>
            </div>
          </Card>

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
                  <span className="text-[11px] font-mono text-brand-muted">Scope 1</span>
                </div>

                <h2 className="text-lg font-bold text-brand-heading">
                  Scope 1 — what you burn
                </h2>
                <p className="text-xs text-brand-muted mt-1 leading-normal min-h-[36px]">
                  Fuel you burn on site and in your own vehicles, plus process and refrigerant emissions.
                </p>

                {/* Metric Summary Strip */}
                <div className="mt-5 pt-3 border-t border-border flex items-center justify-between">
                  <div className="text-xs">
                    <span className="text-brand-muted block text-[11px]">Rows entered</span>
                    <span className="font-semibold text-brand-heading font-mono">{scope1Entries.length} {scope1Entries.length === 1 ? 'row' : 'rows'}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-brand-muted block text-[11px]">Subtotal (tCO₂e)</span>
                    <span className="text-xl font-mono font-bold text-brand-heading tabular-nums">
                      {formatIndianNumber(summary.scope1)}
                    </span>
                  </div>
                </div>


              </div>

              <div className="mt-6 pt-4 border-t border-border flex flex-col gap-2">
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
                {/* Livestock, fertiliser, effluent and landfill are Scope 1 too,
                    but none of them is a factor per unit, so they live elsewhere. */}
                <Button
                  variant="secondary"
                  fullWidth
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onNavigate('methods');
                  }}
                  rightIcon={<ArrowRight size={14} />}
                >
                  Livestock, land, effluent &amp; waste (IPCC methods)
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
                    Grid and contract figures
                  </span>
                </div>

                <h2 className="text-lg font-bold text-brand-heading">
                  Scope 2 — electricity you buy
                </h2>
                <p className="text-xs text-brand-muted mt-1 leading-normal min-h-[36px]">
                  Purchased grid electricity (CEA India baseline), open-access renewable contracts, green tariffs, and on-site electric fleet charging.
                </p>

                {/* Metric Summary Strip */}
                <div className="mt-5 pt-3 border-t border-border grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-brand-muted block text-[11px]">At your grid's average</span>
                    <span className="text-lg font-mono font-bold text-brand-heading tabular-nums">
                      {formatIndianNumber(summary.scope2Location)} t
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-brand-muted block text-[11px]">At what your contracts buy</span>
                    <span className="text-lg font-mono font-bold text-emerald-700 tabular-nums">
                      {formatIndianNumber(summary.scope2Market)} t
                    </span>
                  </div>
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
                    <span className="text-xs font-semibold text-brand-muted">All 15 categories available</span>
                  </div>
                  <h2 className="text-xl font-bold text-brand-heading">
                    Scope 3 — your supply chain
                  </h2>
                  <p className="text-xs text-brand-muted mt-1 max-w-2xl leading-normal">
                    Everything outside your own operations: what you buy, how it is shipped, and staff travel.
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
                    The 15 Scope 3 categories
                  </span>
                  <span className="text-xs text-brand-muted font-mono">
                    {summary.coverage.scope3CategoriesIncluded} of 15 categories carry data · Category 3 is worked out for you
                  </span>
                </div>

                <div className="grid grid-cols-5 sm:grid-cols-8 lg:grid-cols-[repeat(15,minmax(0,1fr))] gap-1.5">
                  {/* Which categories actually carry data, read from the
                      inventory. These were literals — Cats 1, 3, 4 and 6 showed
                      as "active" on a workspace with nothing in it. */}
                  {ALL_15_CATEGORIES.map((cat) => {
                    const count = scope3Entries.filter((e) => e.category === cat.id).length;
                    const isActive = count > 0 || Boolean(cat.auto);
                    return (
                      <Tooltip
                        key={cat.num}
                        content={`Category ${cat.num}: ${cat.name} — ${
                          cat.auto
                            ? 'worked out from your Scope 1 and 2 rows'
                            : count > 0
                              ? `${count} row${count === 1 ? '' : 's'}`
                              : 'nothing entered yet'
                        }`}
                      >
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
                          <span className="text-[8px] tracking-tight opacity-80 mt-0.5">
                            {cat.auto ? 'auto' : count > 0 ? count : '—'}
                          </span>
                        </button>
                      </Tooltip>
                    );
                  })}
                </div>
              </div>

              {/* Actions */}
              <div className="mt-6 pt-4 border-t border-border flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center flex-wrap gap-3">
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
