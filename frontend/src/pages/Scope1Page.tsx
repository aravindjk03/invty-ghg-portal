import React, { useState } from 'react';
import { Accordion } from '../components/ui/Accordion';
import { ActivityRow } from '../components/ui/ActivityRow';
import { Button } from '../components/ui/Button';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { EmptyState } from '../components/ui/EmptyState';
import { Card } from '../components/ui/Card';
import { DonutChart } from '../components/charts/DonutChart';
import { useGHG } from '../context/GHGContext';
import { ghgService } from '../services/ghgService';
import { formatIndianNumber } from '../engine/unitConverter';
import { 
  Flame, 
  Truck, 
  Factory, 
  ShieldAlert, 
  ArrowLeft, 
  Plus, 
  ArrowRight, 
  Info, 
  AlertTriangle,
  FileSpreadsheet,
  Zap,
  CheckCircle2
} from 'lucide-react';

export interface Scope1PageProps {
  onNavigate: (page: string) => void;
}

export const Scope1Page: React.FC<Scope1PageProps> = ({ onNavigate }) => {
  const {
    scope1Entries,
    summary,
    updateRow,
    addRow,
    deleteRow,
    duplicateRow,
    addBatchEntries,
    saveToStorage,
    addToast,
  } = useGHG();

  const [entryMode, setEntryMode] = useState<Record<string, 'guided' | 'csv' | 'quick'>>({
    stationary_combustion: 'guided',
    mobile_combustion: 'guided',
    process_emissions: 'guided',
    fugitive_emissions: 'guided',
  });

  const [csvErrors, setCsvErrors] = useState<Record<string, string[]>>({});
  const [isProcessingCsv, setIsProcessingCsv] = useState(false);

  const stationaryEntries = scope1Entries.filter((r) => r.category === 'stationary_combustion');
  const mobileEntries = scope1Entries.filter((r) => r.category === 'mobile_combustion');
  const processEntries = scope1Entries.filter((r) => r.category === 'process_emissions');
  const fugitiveEntries = scope1Entries.filter((r) => r.category === 'fugitive_emissions');

  const stationarySubtotal = stationaryEntries.reduce((acc, r) => acc + (r.calculatedTco2e || 0), 0);
  const mobileSubtotal = mobileEntries.reduce((acc, r) => acc + (r.calculatedTco2e || 0), 0);
  const processSubtotal = processEntries.reduce((acc, r) => acc + (r.calculatedTco2e || 0), 0);
  const fugitiveSubtotal = fugitiveEntries.reduce((acc, r) => acc + (r.calculatedTco2e || 0), 0);

  const scope1DonutData = [
    { name: 'Stationary Combustion', value: stationarySubtotal, color: 'var(--scope-1)' },
    { name: 'Mobile Combustion', value: mobileSubtotal, color: '#F97316' },
    { name: 'Process Emissions', value: processSubtotal, color: '#FB923C' },
    { name: 'Fugitive Leaks', value: fugitiveSubtotal, color: '#FDBA74' },
  ];

  const handleCsvUpload = async (category: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingCsv(true);
    setCsvErrors((prev) => ({ ...prev, [category]: [] }));

    try {
      const result = await ghgService.parseCsvFile(file);
      if (result.errors.length > 0) {
        setCsvErrors((prev) => ({ ...prev, [category]: result.errors }));
      }
      if (result.entries.length > 0) {
        addBatchEntries(
          'scope-1',
          result.entries.map((entry) => ({
            ...entry,
            category,
            scope: 'scope-1',
          }))
        );
        addToast('success', `Imported ${result.entries.length} rows into ${category.replace(/_/g, ' ')}`);
        setEntryMode((prev) => ({ ...prev, [category]: 'guided' }));
      }
    } catch (err: any) {
      setCsvErrors((prev) => ({ ...prev, [category]: [err.message || 'CSV parse failed'] }));
    } finally {
      setIsProcessingCsv(false);
      e.target.value = '';
    }
  };

  const renderColumnHeaders = () => (
    <div className="hidden lg:grid grid-cols-12 gap-3 px-3.5 pb-2 text-[11px] font-bold uppercase tracking-wider text-brand-muted select-none">
      <div className="col-span-3">Facility / Process Location</div>
      <div className="col-span-3">Fuel / Emission Source</div>
      <div className="col-span-2 text-right">Quantity</div>
      <div className="col-span-1 text-center">Unit</div>
      <div className="col-span-3 text-right pr-9">Emissions (tCO₂e)</div>
    </div>
  );

  const renderSectionContent = (
    categoryKey: string,
    entries: typeof scope1Entries,
    categoryName: string,
    addPrompt: string
  ) => {
    const mode = entryMode[categoryKey] || 'guided';

    if (mode === 'csv') {
      return (
        <Card className="p-6 border-2 border-dashed border-border text-center my-2">
          <div className="max-w-md mx-auto">
            <div className="w-10 h-10 rounded-full bg-blue-50 text-brand-primary flex items-center justify-center mx-auto mb-2">
              <FileSpreadsheet size={20} />
            </div>
            <h4 className="text-sm font-bold text-brand-heading mb-1">
              Upload {categoryName} Log (CSV)
            </h4>
            <p className="text-xs text-brand-muted mb-4">
              Columns: facility, source, quantity, unit.
            </p>
            <label className="inline-flex items-center gap-2 px-4 py-2 bg-brand-primary text-white text-xs font-semibold rounded-md cursor-pointer hover:bg-blue-700 transition-colors">
              <FileSpreadsheet size={14} />
              <span>{isProcessingCsv ? 'Parsing...' : 'Choose CSV File'}</span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => handleCsvUpload(categoryKey, e)}
                disabled={isProcessingCsv}
                className="hidden"
              />
            </label>
            {csvErrors[categoryKey]?.length > 0 && (
              <div className="mt-3 p-2.5 bg-red-50 text-xs text-red-700 rounded text-left">
                <ul className="list-disc pl-4 space-y-0.5">
                  {csvErrors[categoryKey].map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>
      );
    }

    if (mode === 'quick') {
      return (
        <Card className="p-5 my-2 bg-surface-raised border border-border">
          <h4 className="text-xs font-bold text-brand-heading mb-2 flex items-center gap-1.5">
            <Zap size={14} className="text-amber-500" />
            Quick Benchmark Estimation for {categoryName}
          </h4>
          <p className="text-xs text-brand-muted mb-3">
            Populate typical monthly industrial fuel consumption for a secondary steel mill:
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                addRow('scope-1', categoryKey);
                setEntryMode((prev) => ({ ...prev, [categoryKey]: 'guided' }));
              }}
            >
              Insert Standard 10,000 Unit Row
            </Button>
          </div>
        </Card>
      );
    }

    return (
      <div className="space-y-3">
        {entries.length > 0 ? (
          <>
            {renderColumnHeaders()}
            {entries.map((row) => (
              <ActivityRow
                key={row.id}
                entry={row}
                onUpdate={(up) => updateRow('scope-1', row.id, up)}
                onDelete={() => deleteRow('scope-1', row.id)}
                onDuplicate={() => duplicateRow('scope-1', row.id)}
              />
            ))}
          </>
        ) : (
          <EmptyState
            title={`No ${categoryName.toLowerCase()} entries`}
            description={`Log fuel consumption or process reactions for ${categoryName.toLowerCase()}.`}
            actionLabel={addPrompt}
            onAdd={() => addRow('scope-1', categoryKey)}
          />
        )}

        <button
          type="button"
          onClick={() => addRow('scope-1', categoryKey)}
          className="w-full h-11 rounded-md border border-dashed border-border hover:border-blue-500 bg-surface-raised/60 hover:bg-blue-50 text-brand-link text-sm font-semibold flex items-center justify-center gap-2 transition-colors focus-visible:outline-2 focus-visible:outline-blue-600"
        >
          <Plus size={16} />
          <span>{addPrompt}</span>
        </button>
      </div>
    );
  };

  return (
    <div className="max-w-[1440px] mx-auto px-6 py-8 pb-32">
      {/* Top Breadcrumb & Back Action */}
      <div className="mb-5">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onNavigate('scope-hub')}
          leftIcon={<ArrowLeft size={15} />}
        >
          All scopes
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Scope 1 Workspaces (Cols 1 to 8) */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          {/* Header */}
          <div>
            <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-scope-1 block">
              DIRECT COMBUSTION & ONSITE EMISSIONS
            </span>
            <h1 className="text-[32px] font-bold text-brand-heading tracking-tight mt-0.5">
              Scope 1 — Direct emissions
            </h1>
            <p className="text-[15px] text-brand-muted mt-1">
              Record fuel consumption in boilers, furnaces, plant vehicles, chemical process reactions, and HVAC refrigerant recharges.
            </p>
          </div>

          {/* ACCORDION 1: Stationary Combustion */}
          <Accordion
            icon={<Flame size={22} className="text-scope-1" />}
            title="Stationary combustion"
            description="Boilers, furnaces, DG sets, kilns"
            subtotal={stationarySubtotal}
            defaultOpen={true}
          >
            <div className="space-y-4">
              <div className="flex justify-between items-center pb-2 border-b border-border">
                <SegmentedControl
                  size="sm"
                  value={entryMode.stationary_combustion}
                  onChange={(val) => setEntryMode({ ...entryMode, stationary_combustion: val as any })}
                  options={[
                    { value: 'guided', label: 'Guided entry' },
                    { value: 'csv', label: 'Upload CSV' },
                    { value: 'quick', label: 'Quick estimate' },
                  ]}
                />
                <span className="text-xs font-mono text-brand-muted">
                  {stationaryEntries.length} entries logged
                </span>
              </div>
              {renderSectionContent(
                'stationary_combustion',
                stationaryEntries,
                'Stationary Combustion',
                'Add another stationary combustion entry'
              )}
            </div>
          </Accordion>

          {/* ACCORDION 2: Mobile Combustion */}
          <Accordion
            icon={<Truck size={22} className="text-orange-500" />}
            title="Mobile combustion"
            description="Company-owned trucks, yard equipment, forklifts, locomotives"
            subtotal={mobileSubtotal}
            defaultOpen={false}
          >
            <div className="space-y-4">
              <div className="flex justify-between items-center pb-2 border-b border-border">
                <SegmentedControl
                  size="sm"
                  value={entryMode.mobile_combustion}
                  onChange={(val) => setEntryMode({ ...entryMode, mobile_combustion: val as any })}
                  options={[
                    { value: 'guided', label: 'Guided entry' },
                    { value: 'csv', label: 'Upload CSV' },
                    { value: 'quick', label: 'Quick estimate' },
                  ]}
                />
                <span className="text-xs font-mono text-brand-muted">
                  {mobileEntries.length} entries logged
                </span>
              </div>
              {renderSectionContent(
                'mobile_combustion',
                mobileEntries,
                'Mobile Combustion',
                'Add fleet or yard mobile equipment entry'
              )}
            </div>
          </Accordion>

          {/* ACCORDION 3: Process Emissions */}
          <Accordion
            icon={<Factory size={22} className="text-orange-400" />}
            title="Process emissions"
            description="Limestone calcination, graphite electrode oxidation, carbon mass balance"
            subtotal={processSubtotal}
            defaultOpen={false}
          >
            <div className="space-y-4">
              <div className="flex justify-between items-center pb-2 border-b border-border">
                <SegmentedControl
                  size="sm"
                  value={entryMode.process_emissions}
                  onChange={(val) => setEntryMode({ ...entryMode, process_emissions: val as any })}
                  options={[
                    { value: 'guided', label: 'Guided entry' },
                    { value: 'csv', label: 'Upload CSV' },
                    { value: 'quick', label: 'Quick estimate' },
                  ]}
                />
                <span className="text-xs font-mono text-brand-muted">
                  {processEntries.length} entries logged
                </span>
              </div>
              {renderSectionContent(
                'process_emissions',
                processEntries,
                'Process Emissions',
                'Add furnace chemical reaction entry'
              )}
            </div>
          </Accordion>

          {/* ACCORDION 4: Fugitive Emissions */}
          <Accordion
            icon={<ShieldAlert size={22} className="text-orange-300" />}
            title="Fugitive emissions"
            description="HVAC chiller recharges, SF6 switchgear, gas piping leaks"
            subtotal={fugitiveSubtotal}
            defaultOpen={false}
          >
            <div className="space-y-4">
              <div className="flex justify-between items-center pb-2 border-b border-border">
                <SegmentedControl
                  size="sm"
                  value={entryMode.fugitive_emissions}
                  onChange={(val) => setEntryMode({ ...entryMode, fugitive_emissions: val as any })}
                  options={[
                    { value: 'guided', label: 'Guided entry' },
                    { value: 'csv', label: 'Upload CSV' },
                    { value: 'quick', label: 'Quick estimate' },
                  ]}
                />
                <span className="text-xs font-mono text-brand-muted">
                  {fugitiveEntries.length} entries logged
                </span>
              </div>
              {renderSectionContent(
                'fugitive_emissions',
                fugitiveEntries,
                'Fugitive Emissions',
                'Add refrigerant recharge entry'
              )}
            </div>
          </Accordion>
        </div>

        {/* Right Column: Scoped to Scope 1 (Cols 9 to 12) */}
        <div className="lg:col-span-4 space-y-6">
          <Card elevation="raised" className="p-6">
            <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-brand-muted">
              SCOPE 1 BREAKDOWN
            </span>
            <div className="flex items-baseline gap-2 mt-1 mb-2">
              <span className="text-[38px] font-mono font-bold text-brand-heading tabular-nums leading-none">
                {formatIndianNumber(summary.scope1)}
              </span>
              <span className="text-sm font-semibold text-brand-muted">tCO₂e</span>
            </div>

            <DonutChart
              data={scope1DonutData}
              centerLabel="Scope 1"
              centerValue={`${summary.scope1.toFixed(0)} t`}
            />

            <div className="space-y-2 text-xs pt-2 border-t border-border">
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1.5 font-medium text-brand-body">
                  <span className="w-2 h-2 rounded-full bg-scope-1" />
                  Stationary Combustion
                </span>
                <span className="font-mono text-brand-heading font-semibold">
                  {formatIndianNumber(stationarySubtotal)} t
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1.5 font-medium text-brand-body">
                  <span className="w-2 h-2 rounded-full bg-orange-500" />
                  Mobile Fleet & Equipment
                </span>
                <span className="font-mono text-brand-heading font-semibold">
                  {formatIndianNumber(mobileSubtotal)} t
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1.5 font-medium text-brand-body">
                  <span className="w-2 h-2 rounded-full bg-orange-400" />
                  Process Calcination
                </span>
                <span className="font-mono text-brand-heading font-semibold">
                  {formatIndianNumber(processSubtotal)} t
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1.5 font-medium text-brand-body">
                  <span className="w-2 h-2 rounded-full bg-orange-300" />
                  Fugitive Refrigerant
                </span>
                <span className="font-mono text-brand-heading font-semibold">
                  {formatIndianNumber(fugitiveSubtotal)} t
                </span>
              </div>
            </div>
          </Card>

          {/* Guidance Note */}
          <Card className="p-5 text-xs text-brand-muted space-y-2">
            <div className="flex items-center gap-2 font-semibold text-brand-heading">
              <Info size={15} className="text-brand-link" />
              <span>Steel Sector Accounting Guideline</span>
            </div>
            <p className="leading-relaxed">
              In integrated and secondary steel manufacturing, emissions from fuels used for metallurgical reduction (e.g. coke, coal) are accounted under stationary combustion, while flux calcination is classified as chemical process emissions.
            </p>
          </Card>
        </div>
      </div>

      {/* Sticky Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 h-16 bg-surface-raised/95 backdrop-blur-md border-t border-border shadow-nm-raised-sm z-30 flex items-center">
        <div className="max-w-[1440px] mx-auto w-full px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-muted">
              Scope 1 Subtotal:
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-mono font-bold text-brand-heading tabular-nums leading-none">
                {formatIndianNumber(summary.scope1)}
              </span>
              <span className="text-xs font-semibold text-brand-muted">tCO₂e</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => onNavigate('scope-hub')}>
              Back to all scopes
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={saveToStorage}
            >
              Save Draft
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={() => {
                saveToStorage();
                onNavigate('dashboard');
              }}
              rightIcon={<ArrowRight size={16} />}
            >
              Save & view results
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
