import React, { useState } from 'react';
import { useGHG } from '../context/GHGContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { ScopeBadge } from '../components/ui/ScopeBadge';
import { Accordion } from '../components/ui/Accordion';
import { ActivityRow } from '../components/ui/ActivityRow';
import { Tooltip } from '../components/ui/Tooltip';
import { EmptyState } from '../components/ui/EmptyState';
import { formatIndianNumber } from '../engine/unitConverter';
import { deriveCategory3Emissions } from '../engine/calculator';
import Decimal from 'decimal.js';
import { 
  ArrowLeft, 
  ArrowRight, 
  Plus, 
  Filter, 
  Calculator 
} from 'lucide-react';

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
  } = useGHG();

  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string | null>(null);

  // Auto-derived Category 3 breakdown calculation
  const s2LocDecimal = new Decimal(summary.scope2Location || 0);
  const derivedCat3Total = deriveCategory3Emissions(scope1Entries, s2LocDecimal);

  // Helper to get entries for a specific category ID
  const getCategoryEntries = (catId: string) => {
    return scope3Entries.filter((e) => e.category === catId);
  };

  const categoriesToRender = selectedCategoryFilter
    ? ALL_15_CATEGORIES.filter((c) => c.id === selectedCategoryFilter)
    : ALL_15_CATEGORIES;

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-28">
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
                  Category 3: Fuel- and Energy-Related Activities (Auto-Derived Engine)
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                    Automated Synthesis
                  </span>
                </h3>
                <span className="text-sm font-mono font-bold text-brand-heading">
                  + {formatIndianNumber(derivedCat3Total.toNumber())} tCO₂e
                </span>
              </div>
              <p className="text-xs text-brand-muted mt-2 leading-relaxed">
                In accordance with Bug Guard Rule #10, Category 3 is calculated as an automated secondary pass directly from verified Scope 1 & Scope 2 lines. This structurally eliminates circular recalculation loops and guarantees 100% audit trail synchronization:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                <div className="p-2.5 rounded bg-surface border border-border text-xs">
                  <span className="text-[11px] text-brand-muted font-semibold block">WTT of Scope 1 Fuels (18%)</span>
                  <span className="font-mono font-bold text-brand-heading text-sm">
                    {formatIndianNumber(new Decimal(summary.scope1).times(0.18).toNumber())} tCO₂e
                  </span>
                </div>
                <div className="p-2.5 rounded bg-surface border border-border text-xs">
                  <span className="text-[11px] text-brand-muted font-semibold block">WTT of Purchased Elec (12%)</span>
                  <span className="font-mono font-bold text-brand-heading text-sm">
                    {formatIndianNumber(s2LocDecimal.times(0.12).toNumber())} tCO₂e
                  </span>
                </div>
                <div className="p-2.5 rounded bg-surface border border-border text-xs">
                  <span className="text-[11px] text-brand-muted font-semibold block">India Grid T&D Losses (19%)</span>
                  <span className="font-mono font-bold text-brand-heading text-sm">
                    {formatIndianNumber(s2LocDecimal.times(0.19).toNumber())} tCO₂e
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* ALL 15 ACCORDION CATEGORIES */}
      <div className="space-y-5">
        {categoriesToRender
          .filter((cat) => !cat.auto) // Category 3 is auto-rendered above
          .map((cat) => {
            const entries = getCategoryEntries(cat.id);
            const isSingleFiltered = selectedCategoryFilter === cat.id;

            return (
              <Accordion
                key={cat.id}
                title={`Cat ${cat.num}: ${cat.name}`}
                subtitle={cat.subtitle}
                badge={
                  entries.length > 0 ? (
                    <Badge variant="primary">{entries.length} {entries.length === 1 ? 'item' : 'items'}</Badge>
                  ) : (
                    <span className="text-[11px] text-brand-muted">0 entries</span>
                  )
                }
                defaultOpen={isSingleFiltered || cat.defaultIncluded}
              >
                <div className="p-4 space-y-4">
                  {entries.length === 0 ? (
                    <EmptyState
                      title={`No active entries for Cat ${cat.num}: ${cat.name}`}
                      description={cat.subtitle}
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
              <span className="text-brand-muted block">Auto-Derived Cat 3:</span>
              <span className="text-sm font-mono font-bold text-purple-700">
                {formatIndianNumber(derivedCat3Total.toNumber())} tCO₂e
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
