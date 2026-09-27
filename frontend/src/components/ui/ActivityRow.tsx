import React, { useState, useEffect, useId, useMemo, useRef } from 'react';
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
import { CATALOGUE_SOURCES } from '../../data/catalogueData';
import { groupedSourcesFor, isVerified, toEmissionFactor, unitsFor } from '../../data/factorCatalogue';
import { EngineFactorPicker } from './EngineFactorPicker';
import { parseIndianNumber, formatIndianNumber } from '../../engine/unitConverter';
import { useCatalogueMap } from '../../services/useCatalogueMap';
import { METHOD_NAME, METHOD_NOT_IMPLEMENTED, methodFor } from '../../data/methodSources';

export interface ActivityRowProps {
  entry: ActivityEntry;
  onUpdate: (updates: Partial<ActivityEntry>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  /** Lets a row send the user to the page that can actually calculate it. */
  onNavigate?: (page: string) => void;
}

export const ActivityRow: React.FC<ActivityRowProps> = ({
  entry,
  onUpdate,
  onDelete,
  onDuplicate,
  onNavigate,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [displayResult, setDisplayResult] = useState(entry.calculatedTco2e);
  const [isOverridingFactor, setIsOverridingFactor] = useState(false);
  const [overrideFactorSource, setOverrideFactorSource] = useState(
    entry.customFactorSource ?? '');
  const [overrideError, setOverrideError] = useState<string | null>(null);
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

  // Only the sources that belong to THIS scope and category. A stationary
  // combustion row offers fuels burned in fixed equipment, not refrigerants,
  // grid electricity or air travel.
  const groupedSources = useMemo(
    () => groupedSourcesFor(entry.scope, entry.category),
    [entry.scope, entry.category],
  );
  const units = useMemo(() => unitsFor(entry.emissionFactor.id), [entry.emissionFactor.id]);
  const catalogueMap = useCatalogueMap();
  const monthFieldId = useId();
  const factorUnverified = !isVerified(entry.emissionFactor.id)
    && entry.customFactorOverride === undefined;
  // The engine calculates a row only when it names a published factor.
  const engineFactorAttached = Boolean(entry.engineActivityKey);
  // Some sources cannot be a factor per unit at all. They are calculated as
  // IPCC methods, on their own page, and counted in Scope 1 from there.
  const method = methodFor(entry.emissionFactor?.id);
  const methodNotImplemented = METHOD_NOT_IMPLEMENTED[entry.emissionFactor?.id ?? ''];
  // What that factor is called. A row should never show a raw activity key.
  const engineFactorName = useMemo(() => {
    if (!entry.engineActivityKey) return undefined;
    for (const rows of catalogueMap.values()) {
      const match = rows.find((row) => row.activity_key === entry.engineActivityKey);
      if (match) return `${match.engine_name} (per ${match.unit})`;
    }
    return undefined;
  }, [catalogueMap, entry.engineActivityKey]);

  const handleFuelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const source = CATALOGUE_SOURCES.find((item) => item.activity_key === e.target.value);
    if (source) {
      const selectedFactor = toEmissionFactor(source);
      onUpdate({
        fuelOrSource: selectedFactor.fuelOrActivity,
        emissionFactor: selectedFactor,
        unit: selectedFactor.unit,
        customFactorOverride: undefined,
        customFactorSource: undefined,
        // The row is now about a different source, so whatever published factor
        // it pointed at no longer applies. Clearing it lets the catalogue map
        // attach the right one; keeping it would calculate diesel against the
        // factor for coal.
        engineActivityKey: undefined,
        engineRegion: undefined,
        factorChosenByUser: undefined,
        warning: undefined,
      });
      setOverrideFactorValue(source.verified ? String(selectedFactor.factorValue) : '');
      setOverrideFactorSource('');
      setOverrideError(null);
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
    const source = overrideFactorSource.trim();
    // The engine refuses a supplied factor with no source, so the row asks for
    // one here rather than letting the whole inventory come back with an error.
    if (isNaN(parsed) || parsed < 0) {
      setOverrideError('Enter the factor as a number, in kgCO₂e per unit.');
      return;
    }
    if (!source) {
      setOverrideError('Say where this factor came from — the contract, certificate '
        + 'or supplier document. A verifier will ask, and the engine will not use '
        + 'an unsourced number.');
      return;
    }
    setOverrideError(null);
    onUpdate({
      emissionFactor: {
        ...entry.emissionFactor,
        factorValue: parsed,
        qualityTier: 'Estimated',
      },
      customFactorOverride: parsed,
      customFactorSource: source,
    });
    setIsOverridingFactor(false);
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

      {method && (
        <div className="mb-2 rounded-md border border-blue-200 bg-blue-50/70 px-3 py-2 text-[11.5px] text-brand-body">
          <strong>{METHOD_NAME[method]}</strong> cannot be a factor per unit of activity — it
          depends on the region, the climate, or what happened in earlier years. It is
          calculated on the IPCC methods page, and its total is already counted in Scope 1.
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('methods')}
              className="ml-1 font-semibold text-brand-link hover:underline"
            >
              Record it there →
            </button>
          )}
        </div>
      )}

      {methodNotImplemented && (
        <div className="mb-2 rounded-md border border-[#F0D9A0] bg-[#FFF8E6] px-3 py-2 text-[11.5px] text-[#8A5A00]">
          {methodNotImplemented}
        </div>
      )}

      {!method && (['scope-1', 'scope-2', 'scope-3'] as const).includes(entry.scope as 'scope-1') && (
        <EngineFactorPicker
          scope={entry.scope.replace('scope-', '') as '1' | '2' | '3'}
          hint={entry.fuelOrSource}
          selectedKey={entry.engineActivityKey}
          selectedName={engineFactorName}
          onSelect={(activity) => onUpdate({
            engineActivityKey: activity.activity_key,
            engineRegion: activity.region,
            // Their choice, so the catalogue map leaves it alone from here on.
            factorChosenByUser: true,
            unit: activity.unit,
            fuelOrSource: entry.fuelOrSource || activity.name,
          })}
        />
      )}

      {factorUnverified && !entry.engineActivityKey && !method && !methodNotImplemented && (
        <div className="mb-2 rounded-md border border-[#F0D9A0] bg-[#FFF8E6] px-3 py-2 text-[11.5px] text-[#8A5A00]">
          <strong>No published set covers this source.</strong> Some never will: a power purchase
          agreement, a green tariff or a retired certificate is priced by contract, and the GHG
          Protocol asks for that rate rather than a grid average. Choose{' '}
          <em>Use my own emission factor</em> from the menu on this row, enter the rate and say
          where it came from — the engine will then calculate it and the report will show it as
          supplied by you. Until then the row contributes 0, so nothing made up reaches a total.
        </div>
      )}

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
            {groupedSources.map(([group, sources]) => (
              <optgroup key={group} label={group}>
                {sources.map((source) => (
                  <option key={source.activity_key} value={source.activity_key}>
                    {source.display_name}{source.verified ? '' : '  — factor not ingested'}
                  </option>
                ))}
              </optgroup>
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

        {/* Unit (1 col) - only the units this source may be recorded in */}
        <div className="col-span-5 sm:col-span-2 lg:col-span-1">
          {units.length > 1 ? (
            <select
              value={entry.unit}
              onChange={(event) => onUpdate({ unit: event.target.value })}
              aria-label="Unit"
              className="w-full h-10 bg-surface-raised border border-border rounded-md px-2 text-xs font-mono text-brand-body shadow-nm-inset-input focus-visible:outline-2 focus-visible:outline-blue-600 cursor-pointer"
            >
              {units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
            </select>
          ) : (
          <span className="inline-flex items-center justify-center w-full h-10 bg-surface-sunken border border-border rounded-md text-xs font-mono text-brand-muted select-none font-semibold truncate px-1">
            {entry.unit}
          </span>
          )}
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
                    <span>Use my own emission factor</span>
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
        <div className="mt-3 p-3 bg-blue-50/70 border border-blue-200 rounded-md flex flex-col gap-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-brand-heading">Your own factor (kgCO₂e/{entry.unit}):</span>
            <input
              type="number"
              step="any"
              value={overrideFactorValue}
              onChange={(e) => setOverrideFactorValue(e.target.value)}
              className="w-28 h-8 px-2 bg-white border border-border rounded font-mono text-xs"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-brand-heading">Where it came from:</span>
            <input
              type="text"
              value={overrideFactorSource}
              onChange={(e) => setOverrideFactorSource(e.target.value)}
              placeholder="e.g. Tata Power PPA 2025-26, clause 4 · supplier EPD ref 2031"
              className="flex-1 min-w-[16rem] h-8 px-2 bg-white border border-border rounded text-xs"
            />
          </div>
          <p className="text-[11px] text-brand-muted leading-relaxed">
            For a market-based Scope 2 figure — a PPA, a green tariff, a retired I-REC —
            this contractual rate is what the GHG Protocol asks for, not a grid average.
            The report shows it as supplied by you, with this reference beside it.
          </p>
          {overrideError && (
            <p className="text-[11px] font-medium text-status-danger">{overrideError}</p>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveFactorOverride}
              className="px-2.5 py-1 bg-brand-primary text-white rounded text-xs font-semibold hover:bg-blue-700 flex items-center gap-1"
            >
              <Check size={13} /> Use this factor
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

      {/*
        The month this activity falls in.

        The engine already accepts it and the report already has a monthly
        analysis and a missing-month QA/QC check — but there was nowhere to
        enter it, so every row was undated and the check could only ever report
        "cannot be assessed". A verifier asks for the period split first.
      */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label htmlFor={`${monthFieldId}`} className="text-[11px] font-medium text-brand-muted">
          Period
        </label>
        <input
          id={monthFieldId}
          type="month"
          value={entry.periodMonth || ''}
          onChange={(e) => onUpdate({ periodMonth: e.target.value || undefined })}
          aria-label="Reporting month for this activity"
          className="h-8 bg-surface-raised border border-border rounded-md px-2 text-[12px] text-brand-body shadow-nm-inset-input focus-visible:outline-2 focus-visible:outline-blue-600"
        />
        {entry.periodMonth ? (
          <button
            type="button"
            onClick={() => onUpdate({ periodMonth: undefined })}
            className="text-[11px] text-brand-muted hover:text-brand-body underline"
          >
            clear
          </button>
        ) : (
          <span className="text-[11px] text-brand-muted">
            Optional. A dated row joins the monthly analysis; an undated one is reported for
            the year as a whole.
          </span>
        )}
      </div>

      {/* Lower Provenance & Quality Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 mt-2 pt-2 border-t border-border/40 text-[11px] text-brand-muted">
        <div className="flex items-center gap-2">
          {/*
            Only a row the engine will actually calculate may show a factor and
            a quality tier. Printing "2.6865 kgCO2e/L · Primary Quality" beside
            "this row is not calculated" told the reader two different things
            about the same row, and the number shown was not the one that would
            have been used.
          */}
          {engineFactorAttached ? (
            <>
              <span
                className={clsx('w-2 h-2 rounded-full flex-shrink-0', tierColor)}
                title={`Quality Tier: ${entry.emissionFactor.qualityTier}`}
              />
              <span className="font-medium text-brand-body">
                {entry.customFactorOverride !== undefined ? 'Estimated' : 'Published'} factor
              </span>
              <span>·</span>
              <span className="font-mono">calculated by the engine, gas by gas</span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full flex-shrink-0 bg-status-warning" />
              <span className="font-medium text-status-warning">
                No published factor — not calculated
              </span>
            </>
          )}

          {entry.evidenceFile && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium">
              <Paperclip size={11} />
              {entry.evidenceFile}
            </span>
          )}
        </div>

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
