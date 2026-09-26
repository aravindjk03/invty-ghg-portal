/**
 * What the engine made of one method entry.
 *
 * Shows the gas masses, the CO2e under the chosen basis, the working the
 * equations produced, and every note the method attached. The notes are the
 * point: they carry the source a report would otherwise leave out, the region
 * that had to be substituted, and the figure that could not be calculated and
 * why.
 */
import React, { useState } from 'react';
import { AlertTriangle, ChevronDown, Info, Loader2 } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { MethodResult } from '../../types/methods';

const GAS_LABEL: Record<string, string> = { CO2: 'CO₂', CH4: 'CH₄', N2O: 'N₂O' };

const readable = (key: string) =>
  key.replace(/_/g, ' ').replace(/\bkg\b/g, 'kg').replace(/^./, (c) => c.toUpperCase());

const short = (value: string): string => {
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  if (number !== 0 && Math.abs(number) < 0.001) return number.toExponential(3);
  return number.toLocaleString('en-IN', { maximumFractionDigits: 3 });
};

export const MethodResultPanel: React.FC<{
  result?: MethodResult;
  error?: string;
  loading: boolean;
  included: boolean;
}> = ({ result, error, loading, included }) => {
  const [showWorking, setShowWorking] = useState(false);

  if (!included) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-surface-raised p-4">
        <p className="text-[12px] text-brand-muted">
          Not included in the inventory yet. Turn it on once the inputs are complete, and it
          will be calculated and added to Scope 1.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex gap-2.5">
        <AlertTriangle size={16} className="text-status-danger shrink-0 mt-0.5" />
        <div>
          <p className="text-[12px] font-semibold text-status-danger mb-0.5">
            Not calculated, so it is excluded from every total
          </p>
          <p className="text-[12px] leading-relaxed text-brand-body">{error}</p>
        </div>
      </div>
    );
  }

  if (loading && !result) {
    return (
      <div className="rounded-lg border border-border bg-surface-raised p-4 flex items-center gap-2">
        <Loader2 size={15} className="animate-spin text-brand-primary" />
        <span className="text-[12px] text-brand-muted">Calculating…</span>
      </div>
    );
  }

  if (!result) return null;

  const tonnes = Number(result.co2e_kg) / 1000;
  const working = Object.entries(result.working);

  return (
    <div className="rounded-lg border border-border bg-surface-raised overflow-hidden">
      <div className="p-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-brand-muted">
            Emissions, {result.gwp_set} basis
          </span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-[26px] font-bold text-brand-heading tabular-nums leading-none">
              {tonnes.toLocaleString('en-IN', { maximumFractionDigits: 3 })}
            </span>
            <span className="text-[13px] font-medium text-brand-muted">tCO₂e</span>
            {loading && <Loader2 size={13} className="animate-spin text-brand-muted ml-1" />}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {Object.entries(result.gas_masses_kg).map(([gas, mass]) => (
            <Badge key={gas} variant="verified">
              {short(mass)} kg {GAS_LABEL[gas] || gas}
            </Badge>
          ))}
        </div>
      </div>

      {result.notes.length > 0 && (
        <div className="px-4 pb-3 flex flex-col gap-2">
          {result.notes.map((note) => (
            <div key={note} className="flex gap-2">
              <Info size={13} className="text-brand-primary shrink-0 mt-[3px]" />
              <p className="text-[12px] leading-relaxed text-brand-body">{note}</p>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-border">
        <button
          type="button"
          onClick={() => setShowWorking((open) => !open)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-[12px] font-semibold text-brand-body hover:bg-canvas transition-colors"
        >
          <span>Show the working ({working.length} figures)</span>
          <ChevronDown
            size={15}
            className={`transition-transform ${showWorking ? 'rotate-180' : ''}`}
          />
        </button>

        {showWorking && (
          <div className="px-4 pb-4">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
              {working.map(([key, value]) => (
                <div key={key} className="flex justify-between gap-3 border-b border-border/60 py-1">
                  <dt className="text-[12px] text-brand-muted">{readable(key)}</dt>
                  <dd className="text-[12px] font-medium text-brand-body tabular-nums text-right">
                    {short(value)}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-[11px] leading-snug text-brand-muted mt-3">
              {result.source}. Global warming potentials: {result.gwp_source}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
