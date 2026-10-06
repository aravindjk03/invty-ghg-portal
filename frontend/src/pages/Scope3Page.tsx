import React, { useState } from 'react';
import { useGHG } from '../context/GHGContext';
import { unitChoiceFor } from '../services/catalogueMap';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { ScopeBadge } from '../components/ui/ScopeBadge';
import { Accordion } from '../components/ui/Accordion';
import { ActivityRow } from '../components/ui/ActivityRow';
import { Tooltip } from '../components/ui/Tooltip';
import { EmptyState } from '../components/ui/EmptyState';
import { formatIndianNumber } from '../engine/unitConverter';
import Decimal from 'decimal.js';
import { 
  ArrowLeft, 
  ArrowRight, 
  Plus, 
  Filter, 
  Calculator, Check } from 'lucide-react';
import { EngineStatusBar } from '../components/ui/EngineStatusBar';

interface Scope3PageProps {
  onNavigate: (page: string) => void;
}

export interface Scope3CategoryDefinition {
  num: number;
  id: string;
  name: string;
  subtitle: string;
  defaultIncluded: boolean;
  auto?: boolean;
}

export const ALL_15_CATEGORIES: Scope3CategoryDefinition[] = [
  { num: 1, id: 'cat1_purchased_goods', name: 'Purchased Goods & Services', subtitle: 'Raw material feedstocks (scrap steel, fluxes, chemicals, ferroalloys) and spend-based services', defaultIncluded: true },
  { num: 2, id: 'cat2_capital_goods', name: 'Capital Goods', subtitle: 'Heavy industrial machinery, buildings, manufacturing plant equipment, blast furnaces, and rolling mills', defaultIncluded: false },
  { num: 3, id: 'cat3_fuel_energy', name: 'Fuel- & Energy-Related Activities (FERA)', subtitle: 'Well-to-tank (WTT) fuel extraction and transmission & distribution (T&D) losses on purchased electricity', defaultIncluded: true, auto: true },
  { num: 4, id: 'cat4_upstream_transport', name: 'Upstream Transportation & Distribution', subtitle: 'Third-party freight (Road HGV, Indian Railways rakes, container ships) for inbound materials', defaultIncluded: true },
  { num: 5, id: 'cat5_waste_operations', name: 'Waste Generated in Operations', subtitle: 'Slag landfill, hazardous chemical disposal, wastewater treatment, and scrap metal recycling', defaultIncluded: false },
  { num: 6, id: 'cat6_business_travel', name: 'Business Travel', subtitle: 'Commercial flights, corporate Indian Railways journeys, rental taxis, and hotel lodging', defaultIncluded: true },
  { num: 7, id: 'cat7_employee_commuting', name: 'Employee Commuting', subtitle: 'Daily worker commuting via plant staff buses, two-wheelers, local trains, and passenger cars', defaultIncluded: false },
  { num: 8, id: 'cat8_upstream_leased', name: 'Upstream Leased Assets', subtitle: 'Leased warehouse spaces, external storage yards, and leased data server racks', defaultIncluded: false },
  { num: 9, id: 'cat9_downstream_transport', name: 'Downstream Transportation & Distribution', subtitle: 'Logistics and freight distribution of sold products to end customers, distributors, and dealers', defaultIncluded: false },
  { num: 10, id: 'cat10_processing_sold', name: 'Processing of Sold Products', subtitle: 'Downstream intermediate steel fabrication, forging, stamping, and manufacturing by external customers', defaultIncluded: false },
  { num: 11, id: 'cat11_use_sold_products', name: 'Use of Sold Products', subtitle: 'Direct and indirect GHG emissions arising from the operating lifetime of sold appliances and machinery', defaultIncluded: false },
  { num: 12, id: 'cat12_end_of_life', name: 'End-of-Life Treatment of Sold Products', subtitle: 'Disposal, shredding, and recycling of products at the end of their operational lifecycle', defaultIncluded: false },
  { num: 13, id: 'cat13_downstream_leased', name: 'Downstream Leased Assets', subtitle: 'Facilities, plant units, or property owned by your organization and leased out to third parties', defaultIncluded: false },
  { num: 14, id: 'cat14_franchises', name: 'Franchises', subtitle: 'Emissions from commercial franchise operations operating under corporate brand licenses', defaultIncluded: false },
  { num: 15, id: 'cat15_investments', name: 'Investments', subtitle: 'Financed and portfolio emissions from debt, equity, joint ventures, and project financing investments', defaultIncluded: false },
];

export const Scope3Page: React.FC<Scope3PageProps> = ({ onNavigate }) => {
  const {
    scope1Entries,
    scope3Entries,
    summary,
    updateRow,
    addRow,
    deleteRow,
    duplicateRow,
    saveToStorage,
    period,
    category3,
    tdLoss,
    setTdLoss,
    electricityWtt,
    setElectricityWtt,
    fx,
    setFx,
  } = useGHG();

  // Rupee spend on a source whose published factor is per US dollar. These
  // calculate once the inventory states a rate and where it came from.
  const rupeeRows = scope3Entries.filter((entry) =>
    (entry.unit || '').toUpperCase() === 'INR' && unitChoiceFor(entry.emissionFactor?.id, 'INR')?.needs_fx);
  const fxReady = Boolean(fx.rate && fx.rate > 0 && fx.source.trim());

  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string | null>(null);

  // Category 3 is whatever has been recorded against it. It is not derived from
  // a percentage of Scopes 1 and 2: that had no published basis.
  const cat3Recorded = scope3Entries
    .filter((entry) => entry.category === 'cat3_fuel_energy')
    .reduce((total, entry) => total + (entry.calculatedTco2e || 0), 0);

  // Helper to get entries for a specific category ID
  const getCategoryEntries = (catId: string) => {
    return scope3Entries.filter((e) => e.category === catId);
  };

  const categoriesToRender = selectedCategoryFilter
    ? ALL_15_CATEGORIES.filter((c) => c.id === selectedCategoryFilter)
    : ALL_15_CATEGORIES;

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-28">
      <EngineStatusBar />
      {/* Top Breadcrumb & Badge */}
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
          <ScopeBadge scope="scope-3" size="md" />
          <Badge variant="default">All 15 Categories Fully Accessible</Badge>
        </div>
      </div>

      {/* Page Title */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-brand-heading tracking-tight">
          Scope 3 — Value Chain Upstream & Downstream Workspace
        </h1>
        <p className="text-sm text-brand-muted mt-1 max-w-3xl">
          Account for all indirect upstream and downstream supply-chain emissions across all 15 GHG Protocol categories. Click any category box in the matrix to filter view, review category scope boundaries, and log verified activity entries.
        </p>
      </div>

      {/* 15 CATEGORY RELEVANCE MATRIX STRIP */}
      <Card className="p-5 mb-8 bg-surface-raised border border-border shadow-nm-raised">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm font-bold text-brand-heading flex items-center gap-2">
              <Filter size={15} className="text-brand-primary" />
              GHG Protocol 15-Category Screening Grid
            </h3>
            <p className="text-[11px] text-brand-muted mt-0.5">
              Click any of the 15 category squares below to filter view and add activities.
            </p>
          </div>

          {selectedCategoryFilter && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedCategoryFilter(null)}
              className="text-xs"
            >
              Clear Filter (Show All 15)
            </Button>
          )}
        </div>

        <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-15 gap-2">
          {ALL_15_CATEGORIES.map((cat) => {
            const entries = getCategoryEntries(cat.id);
            const hasEntries = entries.length > 0;
            const isAuto = cat.auto;
            const isSelected = selectedCategoryFilter === cat.id;

            let borderClass = 'border-border text-brand-muted bg-surface';
            if (isAuto) {
              borderClass = 'border-purple-300 bg-purple-50 text-purple-700 font-bold';
            } else if (hasEntries) {
              borderClass = 'border-emerald-400 bg-emerald-50 text-emerald-800 font-bold';
            }

            if (isSelected) {
              borderClass = 'ring-2 ring-brand-primary bg-blue-50 text-brand-heading font-bold';
            }

            return (
              <Tooltip
                key={cat.num}
                content={`Cat ${cat.num}: ${cat.name} ${isAuto ? '(Auto-Derived FERA)' : hasEntries ? `(${entries.length} Entries Active)` : '(Click to Screen & Add)'}`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedCategoryFilter(isSelected ? null : cat.id)}
                  className={`h-10 rounded-md flex flex-col items-center justify-center border text-xs cursor-pointer transition-all hover:scale-105 select-none ${borderClass}`}
                >
                  <span className="font-mono text-xs font-bold leading-none">{cat.num}</span>
                  <span className="text-[9px] uppercase tracking-tighter opacity-80 mt-0.5">
                    {isAuto ? 'AUTO' : hasEntries ? `${entries.length} DATA` : 'SCREEN'}
                  </span>
                </button>
              </Tooltip>
            );
          })}
        </div>
      </Card>

      {/* CATEGORY 3 AUTO-DERIVATION CALLOUT */}
      {(!selectedCategoryFilter || selectedCategoryFilter === 'cat3_fuel_energy') && (
        <Card className="p-5 mb-6 bg-surface-raised border border-border">
          <div className="flex items-start gap-3.5">
            <div className="w-8 h-8 rounded bg-purple-700 text-white flex items-center justify-center flex-shrink-0 mt-0.5">
              <Calculator size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-border">
                <h3 className="text-sm font-bold text-brand-heading flex items-center gap-2">
                  Category 3: Fuel- and Energy-Related Activities
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-800 border border-purple-200">
                    Derived
                  </span>
                </h3>
                {/* The engine's own Category 3 total. It ALREADY includes any
                    row recorded against this category by hand, so adding those
                    on top would count them twice. */}
                <span className="text-sm font-mono font-bold text-brand-heading">
                  {formatIndianNumber(category3.tco2e)} tCO₂e
                  {cat3Recorded > 0 && (
                    <span className="ml-2 text-[11px] font-normal text-brand-muted">
                      including {formatIndianNumber(cat3Recorded)} recorded by hand
                    </span>
                  )}
                </span>
              </div>

              <p className="text-xs text-brand-muted mt-2 leading-relaxed">
                Worked out from the rows already recorded in Scope 1 and Scope 2, by the same
                engine and against the same published factors. Nothing here is a percentage of
                another total: the upstream emissions of a fuel are DESNZ&rsquo;s published
                well-to-tank factor applied to the quantity already entered, and the losses are
                the generation needed to deliver what the meter received.
              </p>

              {category3.derived.length > 0 && (
                <ul className="mt-3 flex flex-col gap-1.5">
                  {category3.derived.map((item) => (
                    <li key={item.record_id} className="flex gap-2 items-start text-[11.5px]">
                      <Check size={13} className="text-status-success shrink-0 mt-0.5" />
                      <span className="text-brand-body">{item.basis}</span>
                    </li>
                  ))}
                </ul>
              )}

              {category3.notDerived.length > 0 && (
                <div className="mt-3 rounded-md border border-[#F0D9A0] bg-[#FFF8E6] px-3 py-2">
                  <p className="text-[11.5px] font-semibold text-[#8A5A00]">
                    Not included, and why — a category that covers only some of its sources has
                    to say which:
                  </p>
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {/* One line per reason, not per row: ten rows of the same
                        unmapped fuel is one thing to tell the reader. */}
                    {Array.from(new Set(category3.notDerived.map((item) => item.reason)))
                      .map((reason) => (
                        <li key={reason} className="text-[11.5px] text-[#8A5A00]">
                          {reason}
                        </li>
                      ))}
                  </ul>
                </div>
              )}

              {/*
                The loss rate unlocks the second half of this category. It is
                published for each grid and each utility and varies several-fold
                across India, so it is the customer's figure with the customer's
                source — never a default this product picked.
              */}
              <div className="mt-4 pt-3 border-t border-border flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-brand-body">
                    Transmission &amp; distribution loss rate
                  </span>
                  <span className="flex items-center gap-1.5">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="99"
                      value={tdLoss.rate === undefined ? '' : (tdLoss.rate * 100).toFixed(1)}
                      onChange={(event) => {
                        const percent = parseFloat(event.target.value);
                        setTdLoss({
                          ...tdLoss,
                          rate: Number.isFinite(percent) && percent >= 0 && percent < 100
                            ? percent / 100 : undefined,
                        });
                      }}
                      placeholder="e.g. 17.0"
                      className="w-24 h-8 px-2 rounded border border-border bg-surface text-xs text-brand-body"
                    />
                    <span className="text-[11px] text-brand-muted">% of generation</span>
                  </span>
                </label>
                <label className="flex flex-col gap-1 flex-1 min-w-[16rem]">
                  <span className="text-[11px] font-semibold text-brand-body">Where it came from</span>
                  <input
                    type="text"
                    value={tdLoss.source}
                    onChange={(event) => setTdLoss({ ...tdLoss, source: event.target.value })}
                    placeholder="e.g. CEA, Growth of Electricity Sector in India 2025, Table 4.3"
                    className="h-8 px-2 rounded border border-border bg-surface text-xs text-brand-body"
                  />
                </label>
              </div>
              <p className="text-[11px] text-brand-muted mt-1.5">
                Both are needed. A rate with nowhere to trace it to is indistinguishable from an
                invented one, so without the source the line is left out and said to be left out.
              </p>

              {/*
                The upstream of purchased electricity. No published set gives one
                for the Indian grid, so a company that holds a figure supplies it
                here — on the same terms as every other number in this product.
              */}
              <div className="mt-3 pt-3 border-t border-border flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-brand-body">
                    Upstream of purchased electricity
                  </span>
                  <span className="flex items-center gap-1.5">
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={electricityWtt.factor ?? ''}
                      onChange={(event) => {
                        const value = parseFloat(event.target.value);
                        setElectricityWtt({
                          ...electricityWtt,
                          factor: Number.isFinite(value) && value >= 0 ? value : undefined,
                        });
                      }}
                      placeholder="e.g. 0.090"
                      className="w-24 h-8 px-2 rounded border border-border bg-surface text-xs text-brand-body"
                    />
                    <span className="text-[11px] text-brand-muted">kgCO₂e per kWh</span>
                  </span>
                </label>
                <label className="flex flex-col gap-1 flex-1 min-w-[16rem]">
                  <span className="text-[11px] font-semibold text-brand-body">Where it came from</span>
                  <input
                    type="text"
                    value={electricityWtt.source}
                    onChange={(event) => setElectricityWtt({
                      ...electricityWtt, source: event.target.value,
                    })}
                    placeholder="e.g. supplier disclosure, or a published Indian grid upstream study"
                    className="h-8 px-2 rounded border border-border bg-surface text-xs text-brand-body"
                  />
                </label>
              </div>
              <p className="text-[11px] text-brand-muted mt-1.5">
                The fuel burned to generate the electricity, before it reaches the grid. Nobody
                publishes this for India, so it is left out until you give a figure — never
                guessed, and never borrowed from another country&rsquo;s grid.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Spend-based factors are published per US dollar (EPA USEEIO, 2022 USD).
          Rupee spend is converted at the company's own stated rate, never one
          this product picked. */}
      <Card className={`p-5 mb-6 border ${rupeeRows.length > 0 && !fxReady ? 'border-[#A66300]/40 bg-[#FFF8E6]' : 'border-border bg-surface-raised'}`}>
        <h3 className="text-sm font-bold text-brand-heading">Spend in rupees</h3>
        <p className="text-xs text-brand-muted mt-1 leading-relaxed">
          Spend-based factors (purchased services, capital goods, warehousing) are published per US
          dollar of 2022 purchaser price. Rows recorded in INR are converted at the rate entered here.
          {rupeeRows.length > 0 && (
            <span className={`ml-1 font-semibold ${fxReady ? 'text-status-success' : 'text-[#8A5A00]'}`}>
              {fxReady
                ? `${rupeeRows.length} rupee row${rupeeRows.length === 1 ? '' : 's'} converted.`
                : `${rupeeRows.length} rupee row${rupeeRows.length === 1 ? ' is' : 's are'} waiting for this rate.`}
            </span>
          )}
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-brand-body">Rupees per US dollar</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={fx.rate ?? ''}
              onChange={(event) => {
                const value = parseFloat(event.target.value);
                setFx({ ...fx, rate: Number.isFinite(value) && value > 0 ? value : undefined });
              }}
              placeholder="₹ per US$"
              className="w-28 h-8 px-2 rounded border border-border bg-surface text-xs text-brand-body"
            />
          </label>
          <label className="flex flex-col gap-1 flex-1 min-w-[16rem]">
            <span className="text-[11px] font-semibold text-brand-body">Where it came from</span>
            <input
              type="text"
              value={fx.source}
              onChange={(event) => setFx({ ...fx, source: event.target.value })}
              placeholder="e.g. RBI reference rate, annual average for 2022"
              className="h-8 px-2 rounded border border-border bg-surface text-xs text-brand-body"
            />
          </label>
        </div>
        <p className="text-[11px] text-brand-muted mt-1.5">
          Both are needed, and the rate should be for the factors&rsquo; price year (2022). Each
          converted row records the rate and its source in the report.
        </p>
      </Card>

      {/* ALL 15 ACCORDION CATEGORIES */}
      <div className="space-y-5">
        {categoriesToRender
          .map((cat) => {
            const entries = getCategoryEntries(cat.id);
            const isSingleFiltered = selectedCategoryFilter === cat.id;
            // Category 3's upstream and T&D lines are derived above. What can be
            // recorded here is the rest of the category (electricity bought and
            // resold to end users), which the engine adds to the derived lines
            // once rather than twice.
            const title = cat.auto
              ? `Cat ${cat.num}: ${cat.name} — sources recorded by hand`
              : `Cat ${cat.num}: ${cat.name}`;
            const subtitle = cat.auto
              ? 'Only what is not derived above, e.g. electricity bought and resold to end users'
              : cat.subtitle;

            return (
              <Accordion
                // Remount when a tile selects this category, so "Click to Screen
                // & Add" opens it rather than showing it still collapsed.
                key={`${cat.id}-${isSingleFiltered ? 'selected' : 'all'}`}
                title={title}
                subtitle={subtitle}
                badge={
                  entries.length > 0 ? (
                    <Badge variant="primary">{entries.length} {entries.length === 1 ? 'item' : 'items'}</Badge>
                  ) : (
                    <span className="text-[11px] text-brand-muted">0 entries</span>
                  )
                }
                defaultOpen={isSingleFiltered || (cat.defaultIncluded && !cat.auto)}
              >
                <div className="p-4 space-y-4">
                  {entries.length === 0 ? (
                    <EmptyState
                      title={`No active entries for Cat ${cat.num}: ${cat.name}`}
                      description={subtitle}
                      actionLabel={`Add Entry for Cat ${cat.num}`}
                      onAdd={() => addRow('scope-3', cat.id)}
                    />
                  ) : (
                    <>
                      <div className="hidden lg:grid grid-cols-12 gap-3 px-4 py-2 text-[11px] font-bold text-brand-muted uppercase tracking-wider border-b border-border">
                        <div className="col-span-3">Activity / Description</div>
                        <div className="col-span-3">Source / Emission Factor</div>
                        <div className="col-span-2">Quantity</div>
                        <div className="col-span-1">Unit</div>
                        <div className="col-span-2 text-right">Emissions (tCO₂e)</div>
                        <div className="col-span-1 text-center">Actions</div>
                      </div>

                      {entries.map((row) => (
                        <ActivityRow
                period={period}
                  onNavigate={onNavigate}
                          key={row.id}
                          entry={row}
                          onUpdate={(updates) => updateRow('scope-3', row.id, updates)}
                          onDelete={() => deleteRow('scope-3', row.id)}
                          onDuplicate={() => duplicateRow('scope-3', row.id)}
                        />
                      ))}
                    </>
                  )}

                  {/* Category Action Strip */}
                  <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-border/60">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => addRow('scope-3', cat.id)}
                      leftIcon={<Plus size={14} />}
                    >
                      Add Entry for Cat {cat.num}
                    </Button>
                  </div>
                </div>
              </Accordion>
            );
          })}
      </div>

      {/* Sticky Bottom Summary Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-surface/95 backdrop-blur border-t border-border shadow-nm-raised">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-6 text-xs">
            <div>
              <span className="text-brand-muted block">Scope 3 Total:</span>
              <span className="text-sm font-mono font-bold text-brand-heading">
                {formatIndianNumber(summary.scope3)} tCO₂e
              </span>
            </div>
            <div className="h-7 w-px bg-border hidden sm:block" />
            <div>
              <span className="text-brand-muted block">Cat 3 recorded:</span>
              <span className="text-sm font-mono font-bold text-brand-heading">
                {formatIndianNumber(cat3Recorded)} tCO₂e
              </span>
            </div>
            <div className="h-7 w-px bg-border hidden sm:block" />
            <div>
              <span className="text-brand-muted block">Categories Active:</span>
              <span className="text-sm font-mono font-semibold text-brand-heading">
                {summary.coverage.scope3CategoriesIncluded} of 15
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Button
              variant="secondary"
              size="md"
              onClick={saveToStorage}
              className="flex-1 sm:flex-initial"
            >
              Save Draft
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={() => onNavigate('dashboard')}
              rightIcon={<ArrowRight size={16} />}
              className="flex-1 sm:flex-initial"
            >
              Save & View Dashboard
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
