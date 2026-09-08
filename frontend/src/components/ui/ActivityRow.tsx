import React, { useState, useEffect, useMemo, useRef } from 'react';
import { clsx } from 'clsx';
import { ActivityEntry } from '../../types/ghg';
import { 
  MoreVertical, 
  AlertTriangle, 
  Info, 
  Copy, 
  Trash2, 
  FileText, 
  Settings, 
  ShieldCheck,
  Paperclip,
  Check
} from 'lucide-react';
import { useGHG } from '../../context/GHGContext';
import { getFactorsForCategory, isFactorValidForCategory } from '../../engine/factorCatalogue';
import { parseIndianNumber, formatIndianNumber } from '../../engine/unitConverter';

export interface ActivityRowProps {
  entry: ActivityEntry;
  onUpdate: (updates: Partial<ActivityEntry>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

export const ActivityRow: React.FC<ActivityRowProps> = ({
  entry,
  onUpdate,
  onDelete,
  onDuplicate,
}) => {
  const { factors } = useGHG();
  const [menuOpen, setMenuOpen] = useState(false);
  const [displayResult, setDisplayResult] = useState(entry.calculatedTco2e);
  const [isOverridingFactor, setIsOverridingFactor] = useState(false);
  const [overrideFactorValue, setOverrideFactorValue] = useState<string>(
    String(entry.emissionFactor.factorValue)
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Animated count up on calculated value change
  useEffect(() => {
    const start = displayResult;
    const end = entry.calculatedTco2e;
    const duration = 250;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const current = start + (end - start) * easeOut;

      setDisplayResult(Number(current.toFixed(2)));

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setDisplayResult(end);
      }
    };

    requestAnimationFrame(animate);
  }, [entry.calculatedTco2e]);

  // Sources valid for THIS category only. The previous `category || scope` test
  // could never match on category (the row uses snake_case keys, the catalogue
  // uses GHG Protocol names), so every picker fell through to the scope clause
  // and offered all 147 Scope 1 factors under, say, Mobile combustion.
  const categoryFactors = useMemo(
    () => getFactorsForCategory(entry.category, entry.scope, factors),
    [entry.category, entry.scope, factors]
  );

  // A row can still carry a factor from outside its category (imported CSV, a
  // category edit, restored draft). Keep it selectable so the value the user is
  // looking at is never silently swapped out from under them.
  const selectableFactors = useMemo(
    () =>
      categoryFactors.some((f) => f.id === entry.emissionFactor.id)
        ? categoryFactors
        : [entry.emissionFactor, ...categoryFactors],
    [categoryFactors, entry.emissionFactor]
  );

  const factorIsOutsideCategory = !isFactorValidForCategory(entry.emissionFactor, entry.category);

  const handleFuelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedFactor = factors.find((f) => f.id === e.target.value);
    if (selectedFactor) {
      onUpdate({
        fuelOrSource: selectedFactor.fuelOrActivity,
        emissionFactor: selectedFactor,
        unit: selectedFactor.unit,
      });
      setOverrideFactorValue(String(selectedFactor.factorValue));
    }
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const parsed = parseIndianNumber(e.target.value);
    onUpdate({ amount: parsed ? parsed.toNumber() : 0 });
  };

  const handleAttachEvidenceClick = () => {
    setMenuOpen(false);
    fileInputRef.current?.click();
  };

  const handleEvidenceFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpdate({ evidenceFile: file.name });
    }
    e.target.value = '';
  };

  const handleSaveFactorOverride = () => {
    const parsed = parseFloat(overrideFactorValue);
    if (!isNaN(parsed) && parsed >= 0) {
      onUpdate({
        emissionFactor: {
          ...entry.emissionFactor,
          factorValue: parsed,
          qualityTier: 'Estimated',
        },
        customFactorOverride: parsed,
      });
      setIsOverridingFactor(false);
    }
  };

  const tierColor = {
    Primary: 'bg-status-success',
    Secondary: 'bg-blue-600',
    Proxy: 'bg-status-warning',
    Estimated: 'bg-brand-muted',
  }[entry.emissionFactor.qualityTier] || 'bg-brand-muted';

  return (
    <div className="flex flex-col bg-surface-raised border border-border rounded-lg p-3.5 transition-all duration-150 hover:border-border-strong hover:shadow-sm relative">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleEvidenceFileChange}
        className="hidden"
      />

      {/* Upper Control Grid (Strictly Aligned) */}
      <div className="grid grid-cols-12 gap-3 items-center w-full">
        {/* Facility Name (3 cols) */}
        <div className="col-span-12 sm:col-span-6 lg:col-span-3">
          <input
            type="text"
            value={entry.facility}
            onChange={(e) => onUpdate({ facility: e.target.value })}
            placeholder="Facility name"
            aria-label="Facility Name"
            className="w-full h-10 bg-surface-raised border border-border rounded-md px-3 text-xs md:text-sm text-brand-body shadow-nm-inset-input focus-visible:outline-2 focus-visible:outline-blue-600 truncate"
          />
        </div>

        {/* Fuel / Source Dropdown (3 cols) */}
        <div className="col-span-12 sm:col-span-6 lg:col-span-3">
          <select
            value={entry.emissionFactor.id}
            onChange={handleFuelChange}
            aria-label="Emission Source"
            className="w-full h-10 bg-surface-raised border border-border rounded-md px-3 text-xs md:text-sm text-brand-body shadow-nm-inset-input focus-visible:outline-2 focus-visible:outline-blue-600 cursor-pointer truncate"
          >
            {selectableFactors.map((factor) => (
              <option key={factor.id} value={factor.id}>
                {factor.fuelOrActivity}
                {isFactorValidForCategory(factor, entry.category) ? '' : ' — outside this category'}
              </option>
            ))}
          </select>
        </div>

        {/* Amount Input (2 cols) */}
        <div className="col-span-7 sm:col-span-4 lg:col-span-2">
          <input
            type="text"
            value={entry.amount === 0 ? '' : entry.amount}
            onChange={handleAmountChange}
            aria-label="Activity Quantity"
            placeholder="Quantity"
            className="w-full h-10 bg-surface-raised border border-border rounded-md px-3 font-mono tabular-nums text-xs md:text-sm text-brand-body shadow-nm-inset-input focus-visible:outline-2 focus-visible:outline-blue-600 text-right"
          />
        </div>

        {/* Unit Badge (1 col) */}
        <div className="col-span-5 sm:col-span-2 lg:col-span-1">
          <span className="inline-flex items-center justify-center w-full h-10 bg-surface-sunken border border-border rounded-md text-xs font-mono text-brand-muted select-none font-semibold truncate px-1">
            {entry.unit}
          </span>
        </div>

        {/* Live Result + Action Menu (3 cols) */}
        <div className="col-span-12 sm:col-span-6 lg:col-span-3 flex items-center justify-between sm:justify-end gap-3 pt-1 sm:pt-0">
          <div className="flex items-baseline justify-end gap-1.5 text-right">
            <span className="text-brand-muted text-xs font-mono select-none">=</span>
            <span className="text-[17px] font-mono font-bold text-brand-heading tabular-nums leading-none">
              {formatIndianNumber(displayResult)}
            </span>
            <span className="text-xs font-medium text-brand-muted select-none">
              tCO₂e
            </span>
          </div>

          {/* Action Menu button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="More options"
              className="w-8 h-8 rounded-md flex items-center justify-center text-brand-muted hover:text-brand-body hover:bg-blue-50 border border-border transition-colors focus-visible:outline-2 focus-visible:outline-blue-600"
            >
              <MoreVertical size={16} />
            </button>

            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-20"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute right-0 top-9 w-48 bg-surface-raised border border-border rounded-md shadow-nm-raised z-30 py-1.5 text-xs text-brand-body">
                  <button
                    type="button"
                    onClick={() => {
                      onDuplicate();
                      setMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-blue-50 text-left"
                  >
                    <Copy size={14} className="text-brand-muted" />
                    <span>Duplicate row</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleAttachEvidenceClick}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-blue-50 text-left"
                  >
                    <FileText size={14} className="text-brand-muted" />
                    <span>Attach invoice / evidence</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsOverridingFactor(true);
                      setMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-blue-50 text-left"
                  >
                    <Settings size={14} className="text-brand-muted" />
                    <span>Override emission factor</span>
                  </button>
                  <div className="my-1 border-t border-border" />
                  <button
                    type="button"
                    onClick={() => {
                      onDelete();
                      setMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-status-danger hover:bg-red-50 text-left"
                  >
                    <Trash2 size={14} />
                    <span>Delete row</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Factor Override Inline Drawer */}
      {isOverridingFactor && (
        <div className="mt-3 p-3 bg-blue-50/70 border border-blue-200 rounded-md flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-brand-heading">Custom Factor (kgCO₂e/{entry.unit}):</span>
            <input
              type="number"
              step="any"
              value={overrideFactorValue}
              onChange={(e) => setOverrideFactorValue(e.target.value)}
              className="w-28 h-8 px-2 bg-white border border-border rounded font-mono text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveFactorOverride}
              className="px-2.5 py-1 bg-brand-primary text-white rounded text-xs font-semibold hover:bg-blue-700 flex items-center gap-1"
            >
              <Check size={13} /> Apply Override
            </button>
            <button
              type="button"
              onClick={() => setIsOverridingFactor(false)}
              className="px-2.5 py-1 bg-white border border-border text-brand-muted rounded text-xs hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Lower Provenance & Quality Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 mt-2 pt-2 border-t border-border/40 text-[11px] text-brand-muted">
        <div className="flex items-center gap-2">
          {/* Data Quality Tier Pip */}
          <span
            className={clsx('w-2 h-2 rounded-full flex-shrink-0', tierColor)}
            title={`Quality Tier: ${entry.emissionFactor.qualityTier}`}
          />
          <span className="font-medium text-brand-body">
            {entry.emissionFactor.qualityTier} Quality
          </span>
          <span>·</span>
          {/* Factor value and source citation */}
          <span className="font-mono">
            {entry.emissionFactor.factorValue} kgCO₂e/{entry.unit}
          </span>
          <span>({entry.emissionFactor.source})</span>

          {entry.evidenceFile && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium">
              <Paperclip size={11} />
              {entry.evidenceFile}
            </span>
          )}
        </div>

        {/* Factor sits outside the category this row is filed under */}
        {factorIsOutsideCategory && (
          <div className="flex items-center gap-1 text-status-warning font-medium bg-amber-50 px-2 py-0.5 rounded border border-amber-200/60">
            <AlertTriangle size={13} className="flex-shrink-0" />
            <span>
              Factor belongs to “{entry.emissionFactor.category}”, not this category — check the
              source allocation before assurance.
            </span>
          </div>
        )}

        {/* Industrial Anomaly Warning Callout */}
        {entry.warning && (
          <div className="flex items-center gap-1 text-status-warning font-medium bg-amber-50 px-2 py-0.5 rounded border border-amber-200/60 animate-in fade-in duration-200">
            <AlertTriangle size={13} className="flex-shrink-0" />
            <span>{entry.warning}</span>
          </div>
        )}
      </div>
    </div>
  );
};
