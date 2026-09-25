/**
 * Choose the published factor a row is calculated with.
 *
 * The list comes from the engine's ingested factor sets (DESNZ 2025, CEA), so
 * every option carries a source, a publication year and the gases it resolves.
 * A row without a choice is not calculated: the report lists it rather than
 * inventing a number for it.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Search, CheckCircle2, AlertCircle } from 'lucide-react';
import { searchActivities } from '../../services/inventoryService';
import { SelectableActivity } from '../../types/inventory';

interface Props {
  scope: '1' | '2' | '3';
  /** What the row is about, used as the opening search term. */
  hint: string;
  selectedKey?: string;
  onSelect: (activity: SelectableActivity) => void;
}

export const EngineFactorPicker: React.FC<Props> = ({ scope, hint, selectedKey, onSelect }) => {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState(hint);
  const [results, setResults] = useState<SelectableActivity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const selected = useMemo(
    () => results.find((item) => item.activity_key === selectedKey),
    [results, selectedKey],
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    searchActivities(scope, term.trim() || undefined, undefined, 40)
      .then((found) => { if (!cancelled) { setResults(found); setError(null); } })
      .catch((err: Error) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, term, scope]);

  return (
    <div className="mt-2 border-t border-border pt-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1.5 text-[11px] font-semibold text-brand-link hover:underline"
      >
        {selectedKey ? <CheckCircle2 size={12} className="text-status-success" />
          : <AlertCircle size={12} className="text-status-warning" />}
        {selectedKey
          ? `Published factor: ${selected?.name ?? selectedKey}`
          : 'No published factor chosen — this row will not be calculated'}
      </button>

      {open && (
        <div className="mt-2 rounded-md border border-border bg-surface p-2">
          <div className="flex items-center gap-2 mb-2">
            <Search size={13} className="text-brand-muted" />
            <input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Search the published factor sets"
              className="flex-1 bg-transparent text-xs text-brand-body outline-none"
            />
          </div>

          {error && <p className="text-[11px] text-status-danger">{error}</p>}
          {loading && !error && <p className="text-[11px] text-brand-muted">Searching…</p>}

          <ul className="max-h-48 overflow-y-auto">
            {results.map((activity) => (
              <li key={activity.activity_key}>
                <button
                  type="button"
                  onClick={() => { onSelect(activity); setOpen(false); }}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-surface-raised text-[11.5px]"
                >
                  <span className="text-brand-body">{activity.name}</span>
                  <span className="block text-[10.5px] text-brand-muted font-mono">
                    per {activity.unit} · {activity.source.split(' ')[0]} {activity.reference_year}
                    {' · '}{activity.gases.join(', ')} · {activity.region}
                  </span>
                </button>
              </li>
            ))}
            {!loading && !error && results.length === 0 && (
              <li className="px-2 py-1.5 text-[11px] text-brand-muted">
                Nothing matches. Try a different word, or ingest the factor set that covers it.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};
