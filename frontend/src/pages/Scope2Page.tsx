import React, { useState } from 'react';
import { useGHG } from '../context/GHGContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { ScopeBadge } from '../components/ui/ScopeBadge';
import { Accordion } from '../components/ui/Accordion';
import { ActivityRow } from '../components/ui/ActivityRow';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { EmptyState } from '../components/ui/EmptyState';
import { ghgService } from '../services/ghgService';
import { formatIndianNumber } from '../engine/unitConverter';
import { 
  ArrowLeft, 
  ArrowRight, 
  Plus, 
  Info, 
  Zap, 
  Flame, 
  SunMedium, 
  FileSpreadsheet, 
  CheckCircle,
  HelpCircle,
  AlertTriangle
} from 'lucide-react';

interface Scope2PageProps {
  onNavigate: (page: string) => void;
}

export const Scope2Page: React.FC<Scope2PageProps> = ({ onNavigate }) => {
  const {
    scope2Entries,
    summary,
    updateRow,
    addRow,
    deleteRow,
    duplicateRow,
    addBatchEntries,
    addToast,
    saveToStorage,
  } = useGHG();

  const [entryMode, setEntryMode] = useState<'guided' | 'csv' | 'quick'>('guided');
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [isProcessingCsv, setIsProcessingCsv] = useState(false);

  // Filter entries into Scope 2 categories
  const electricityEntries = scope2Entries.filter(
    (e) => e.category === 'purchased_electricity' || e.category === 'market_instruments'
  );
  const steamHeatEntries = scope2Entries.filter(
    (e) => e.category === 'purchased_steam_heat_cooling'
  );
  const memoEnergyEntries = scope2Entries.filter(
    (e) => e.category === 'memo_energy_balance'
  );

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingCsv(true);
    setCsvErrors([]);

    try {
      const result = await ghgService.parseCsvFile(file);
      if (result.errors.length > 0) {
        setCsvErrors(result.errors);
      }
      if (result.entries.length > 0) {
        addBatchEntries(
          'scope-2',
          result.entries.map((entry) => ({
            ...entry,
            category: 'purchased_electricity',
            scope: 'scope-2',
          }))
        );
        addToast('success', `Imported ${result.entries.length} Scope 2 rows from CSV`);
        setEntryMode('guided');
      }
    } catch (err: any) {
      setCsvErrors([err.message || 'Failed to parse CSV file']);
    } finally {
      setIsProcessingCsv(false);
      e.target.value = '';
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-28">
      {/* Breadcrumb & Navigation */}
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
          <ScopeBadge scope="scope-2" size="md" />
          <Badge variant="verified">Dual Reporting Ready</Badge>
        </div>
      </div>

      {/* Header Banner */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-brand-heading tracking-tight">
          Scope 2 — Indirect Purchased Energy Workspace
        </h1>
        <p className="text-sm text-brand-muted mt-1 max-w-3xl">
          Track emissions from purchased electricity, steam, heating, and cooling. In accordance with the GHG Protocol Scope 2 Guidance, both Location-Based (grid average) and Market-Based (contractual instruments) figures are evaluated concurrently.
        </p>
      </div>

      {/* Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 bg-surface-raised p-3 rounded-xl border border-border">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-brand-body uppercase tracking-wider">
            Data Input Workflow:
          </span>
          <SegmentedControl
            options={[
              { value: 'guided', label: 'Activity Registry (Guided)' },
              { value: 'csv', label: 'Bulk CSV Import' },
              { value: 'quick', label: 'Quick Utility Bill Estimate' },
            ]}
            value={entryMode}
            onChange={(val) => setEntryMode(val as any)}
            size="sm"
          />
        </div>

        <div className="text-xs text-brand-muted flex items-center gap-2 font-mono">
          <span>Location: <strong className="text-brand-heading">{formatIndianNumber(summary.scope2Location)} tCO₂e</strong></span>
          <span>·</span>
          <span>Market: <strong className="text-emerald-700">{formatIndianNumber(summary.scope2Market)} tCO₂e</strong></span>
        </div>
      </div>

      {/* DUAL REPORTING CALLOUT NOTICE */}
      <div className="mb-6 p-4 rounded-xl bg-blue-50/70 border border-blue-200/80 flex items-start gap-3.5 shadow-nm-flat">
        <Info size={20} className="text-brand-primary flex-shrink-0 mt-0.5" />
        <div className="text-xs leading-relaxed text-blue-950">
          <strong className="font-semibold block mb-0.5 text-blue-900">
            Scope 2 Dual Reporting Rule (GHG Protocol Compliance)
          </strong>
          <span>
            Location-based and Market-based totals reflect two distinct accounting views of the same purchased energy. <strong>They are never added together in the headline gross total.</strong> The portal defaults to the CEA India National Grid location emission factor (0.716 kgCO₂e/kWh) for standard compliance and applies contractual RECs/green tariffs to the market figure.
          </span>
        </div>
      </div>

      {/* CSV IMPORT VIEW */}
      {entryMode === 'csv' && (
        <Card className="p-8 mb-8 border-2 border-dashed border-border text-center">
          <div className="max-w-md mx-auto">
            <div className="w-12 h-12 rounded-full bg-blue-50 border border-blue-200 text-brand-primary flex items-center justify-center mx-auto mb-4">
              <FileSpreadsheet size={24} />
            </div>
            <h3 className="text-base font-bold text-brand-heading mb-1">
              Upload Scope 2 Utility Data (CSV)
            </h3>
            <p className="text-xs text-brand-muted mb-6">
              Upload monthly electricity or steam invoices. Required columns: <code className="bg-slate-100 px-1 py-0.5 rounded">facility</code>, <code className="bg-slate-100 px-1 py-0.5 rounded">source</code>, <code className="bg-slate-100 px-1 py-0.5 rounded">quantity</code>, <code className="bg-slate-100 px-1 py-0.5 rounded">unit</code>.
            </p>

            <label className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-primary text-white text-xs font-semibold rounded-lg cursor-pointer hover:bg-blue-700 transition-colors shadow-nm-flat">
              <FileSpreadsheet size={16} />
              <span>{isProcessingCsv ? 'Parsing File...' : 'Select CSV File'}</span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleCsvUpload}
                disabled={isProcessingCsv}
                className="hidden"
              />
            </label>

            {csvErrors.length > 0 && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-left text-xs text-red-700">
                <p className="font-bold mb-1 flex items-center gap-1">
                  <AlertTriangle size={14} /> Import Errors:
                </p>
                <ul className="list-disc pl-4 space-y-1">
                  {csvErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* QUICK ESTIMATE VIEW */}
      {entryMode === 'quick' && (
        <Card className="p-6 mb-8 bg-surface-raised border border-border">
          <h3 className="text-sm font-bold text-brand-heading mb-3 flex items-center gap-2">
            <Zap size={16} className="text-amber-500" />
            Quick Utility Bill Spend / KWh Estimator
          </h3>
          <p className="text-xs text-brand-muted mb-4">
            If sub-metered invoices are pending, calculate an interim screening estimate using average industrial tariff rates:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-surface border border-border">
              <span className="text-xs font-semibold text-brand-body block mb-1">State DISCOM Tariff</span>
              <span className="text-lg font-mono font-bold text-brand-heading">₹7.80 / kWh</span>
              <span className="text-[11px] text-brand-muted block mt-1">HT Industrial Tariff (JSERC)</span>
            </div>
            <div className="p-4 rounded-lg bg-surface border border-border">
              <span className="text-xs font-semibold text-brand-body block mb-1">CEA Baseline v19 Factor</span>
              <span className="text-lg font-mono font-bold text-brand-heading">0.716 kgCO₂e / kWh</span>
              <span className="text-[11px] text-brand-muted block mt-1">Indian National Grid Average</span>
            </div>
            <div className="p-4 rounded-lg bg-surface border border-border flex flex-col justify-between">
              <div>
                <span className="text-xs font-semibold text-brand-body block mb-1">Estimate Action</span>
                <span className="text-xs text-brand-muted">Populate standard monthly bill to grid row</span>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  addRow('scope-2', 'purchased_electricity');
                  setEntryMode('guided');
                }}
              >
                Insert 100 MWh Row
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* GUIDED REGISTRY VIEW (MAIN ACCORDIONS) */}
      <div className="space-y-6">
        {/* Accordion 1: Purchased Electricity */}
        <Accordion
          title="2.1 Purchased Electricity (Location & Market Reporting)"
          subtitle="Grid power, open-access, solar PPAs, green tariffs, and on-site EV fleet charging"
          badge={<ScopeBadge scope="scope-2" size="sm" />}
          defaultOpen={true}
        >
          <div className="p-4 space-y-4">
            {/* Column Headers */}
            <div className="hidden lg:grid grid-cols-12 gap-3 px-4 py-2 text-[11px] font-bold text-brand-muted uppercase tracking-wider border-b border-border">
              <div className="col-span-3">Facility / Meter Point</div>
              <div className="col-span-3">Energy Source / Contract</div>
              <div className="col-span-2">Quantity</div>
              <div className="col-span-1">Unit</div>
              <div className="col-span-2 text-right">Calculated (tCO₂e)</div>
              <div className="col-span-1 text-center">Actions</div>
            </div>

            {electricityEntries.length === 0 ? (
              <EmptyState
                title="No electricity entries added yet"
                description="Add grid connection meters, open access solar contracts, or green tariffs."
                actionLabel="Add Electricity Meter"
                onAdd={() => addRow('scope-2', 'purchased_electricity')}
              />
            ) : (
              electricityEntries.map((row) => (
                <ActivityRow
                  key={row.id}
                  entry={row}
                  onUpdate={(updates) => updateRow('scope-2', row.id, updates)}
                  onDelete={() => deleteRow('scope-2', row.id)}
                  onDuplicate={() => duplicateRow('scope-2', row.id)}
                />
              ))
            )}

            <div className="pt-2 flex justify-start">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => addRow('scope-2', 'purchased_electricity')}
                leftIcon={<Plus size={14} />}
              >
                Add Electricity Entry
              </Button>
            </div>
          </div>
        </Accordion>

        {/* Accordion 2: Purchased Steam, Heating & Cooling */}
        <Accordion
          title="2.2 Purchased Steam, District Heating & Chilled Water"
          subtitle="Direct imported steam from neighbouring industrial complexes, waste-heat boilers, or district cooling"
          badge={<Badge variant="primary">Thermal Energy</Badge>}
          defaultOpen={false}
        >
          <div className="p-4 space-y-4">
            {steamHeatEntries.length === 0 ? (
              <EmptyState
                title="No steam or chilled water entries"
                description="If your plant imports steam from an adjacent blast furnace or co-gen unit, add it here."
                actionLabel="Add Steam Entry"
                onAdd={() => addRow('scope-2', 'purchased_steam_heat_cooling')}
              />
            ) : (
              steamHeatEntries.map((row) => (
                <ActivityRow
                  key={row.id}
                  entry={row}
                  onUpdate={(updates) => updateRow('scope-2', row.id, updates)}
                  onDelete={() => deleteRow('scope-2', row.id)}
                  onDuplicate={() => duplicateRow('scope-2', row.id)}
                />
              ))
            )}

            <div className="pt-2 flex justify-start">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => addRow('scope-2', 'purchased_steam_heat_cooling')}
                leftIcon={<Plus size={14} />}
              >
                Add Purchased Steam/Heat Entry
              </Button>
            </div>
          </div>
        </Accordion>

        {/* Accordion 3: Energy Balance Memos */}
        <Accordion
          title="Energy Balance Memo Items (Self-Generated Solar & Grid Export)"
          subtitle="On-site rooftop solar and wheeling export. Recorded for complete facility energy balance; excluded from Scope 2 gross total."
          badge={<Badge variant="default">Energy Balance Memo</Badge>}
          defaultOpen={false}
        >
          <div className="p-4 space-y-4">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start gap-2">
              <SunMedium size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <strong>GHG Protocol Scope 2 Guidance Section 5.4:</strong> Energy produced and consumed on-site by the same reporting entity generates <em>zero</em> Scope 2 emissions. Power exported back to the grid must never be subtracted from gross emissions.
              </div>
            </div>

            {memoEnergyEntries.length === 0 ? (
              <div className="text-center py-6 text-xs text-brand-muted">
                No self-generation or grid export items logged.
                <div className="mt-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => addRow('scope-2', 'memo_energy_balance')}
                  >
                    + Record On-Site Solar Generation
                  </Button>
                </div>
              </div>
            ) : (
              memoEnergyEntries.map((row) => (
                <ActivityRow
                  key={row.id}
                  entry={row}
                  onUpdate={(updates) => updateRow('scope-2', row.id, updates)}
                  onDelete={() => deleteRow('scope-2', row.id)}
                  onDuplicate={() => duplicateRow('scope-2', row.id)}
                />
              ))
            )}
          </div>
        </Accordion>
      </div>

      {/* Sticky Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-surface/95 backdrop-blur border-t border-border shadow-nm-raised">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-6 text-xs">
            <div>
              <span className="text-brand-muted block">Location-Based:</span>
              <span className="text-sm font-mono font-bold text-brand-heading">
                {formatIndianNumber(summary.scope2Location)} tCO₂e
              </span>
            </div>
            <div className="h-7 w-px bg-border hidden sm:block" />
            <div>
              <span className="text-brand-muted block">Market-Based:</span>
              <span className="text-sm font-mono font-bold text-emerald-700">
                {formatIndianNumber(summary.scope2Market)} tCO₂e
              </span>
            </div>
            <div className="h-7 w-px bg-border hidden sm:block" />
            <div>
              <span className="text-brand-muted block">Active Entries:</span>
              <span className="text-sm font-mono font-semibold text-brand-heading">
                {scope2Entries.length} items
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
