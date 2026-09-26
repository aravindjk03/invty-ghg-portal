/**
 * Says where the figures on this page came from.
 *
 * The portal shows engine figures or none at all. When the engine cannot be
 * reached, or a row has no published factor, the page says so rather than
 * falling back to a second calculation that would disagree with the report.
 */
import React from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Plug } from 'lucide-react';
import { useGHG } from '../../context/GHGContext';

export const EngineStatusBar: React.FC = () => {
  const { engineStatus, gwpSet, setGwpSet } = useGHG();
  const { state, message, runId, engineVersion, unmappedCount, excludedCount } = engineStatus;

  const tone = {
    calculated: 'border-border bg-surface-raised text-brand-body',
    calculating: 'border-border bg-surface-raised text-brand-muted',
    unavailable: 'border-[#F3C4C0] bg-[#FDECEA] text-[#B42318]',
    nothing_mapped: 'border-[#F0D9A0] bg-[#FFF8E6] text-[#8A5A00]',
  }[state];

  const icon = {
    calculated: <CheckCircle2 size={14} className="text-status-success" />,
    calculating: <Loader2 size={14} className="animate-spin" />,
    unavailable: <AlertTriangle size={14} />,
    nothing_mapped: <AlertTriangle size={14} />,
  }[state];

  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border px-4 py-2.5 mb-5 text-xs ${tone}`}>
      <span className="flex items-center gap-2 font-semibold">
        {icon}
        {state === 'calculated' && `Calculated by ghg_core ${engineVersion}`}
        {state === 'calculating' && 'Calculating…'}
        {state === 'unavailable' && 'The calculation engine is not reachable'}
        {state === 'nothing_mapped' && 'Nothing calculated yet'}
      </span>

      {message && <span className="text-[11.5px]">{message}</span>}

      {state === 'calculated' && (
        <span className="font-mono text-[11px] text-brand-muted">run {runId?.slice(0, 10)}</span>
      )}

      {unmappedCount > 0 && (
        <span className="text-[11.5px]">
          {unmappedCount} row{unmappedCount === 1 ? '' : 's'} without a published factor —
          excluded from every total.
        </span>
      )}
      {excludedCount > 0 && (
        <span className="text-[11.5px]">
          {excludedCount} row{excludedCount === 1 ? '' : 's'} could not be calculated.
        </span>
      )}

      <span className="ml-auto flex items-center gap-1.5">
        <Plug size={12} className="text-brand-muted" />
        <span className="text-brand-muted">GWP basis</span>
        {(['AR5', 'AR6'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setGwpSet(option)}
            className={`rounded px-2 py-0.5 text-[11px] font-semibold border ${
              gwpSet === option
                ? 'border-brand-link bg-brand-link/10 text-brand-link'
                : 'border-border bg-surface text-brand-muted'
            }`}
          >
            {option}
          </button>
        ))}
      </span>
    </div>
  );
};
