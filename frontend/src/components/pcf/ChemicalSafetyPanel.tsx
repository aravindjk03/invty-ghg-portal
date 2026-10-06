/**
 * What PubChem publishes about a substance, beside its carbon figure.
 *
 * A Product Carbon estimate says what a material costs the climate. It says
 * nothing about whether it will burn, corrode or poison the person handling
 * it, and for a plant buying solvents or acids that is the question asked
 * first.
 *
 * Three things this panel is careful about, because getting them wrong would
 * be worse than showing nothing:
 *
 *   - A product is not a substance. "Cotton T-shirt" matches no PubChem
 *     record, and the panel says so rather than showing the hazards of
 *     something with a similar name.
 *   - "PubChem is busy" and "no hazards" are different sentences. The panel
 *     never lets the first read as the second.
 *   - It is not a safety data sheet. The supplier's SDS is the legal document
 *     and the panel says so every time.
 */
import React, { useState } from 'react';
import { AlertTriangle, ExternalLink, FlaskConical, Info, Loader2, Search } from 'lucide-react';
import { z } from 'zod';
import { env } from '../../config/env';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';

const SafetySchema = z.object({
  query: z.string(),
  matched: z.boolean(),
  cid: z.number().nullable(),
  name: z.string().nullable(),
  molecular_formula: z.string().nullable(),
  molecular_weight: z.string().nullable(),
  signal_word: z.string().nullable(),
  hazard_statements: z.array(z.object({ code: z.string(), statement: z.string() })),
  precautionary_codes: z.array(z.string()),
  source: z.string(),
  source_url: z.string().nullable(),
  notes: z.array(z.string()),
});
type Safety = z.infer<typeof SafetySchema>;

/** Danger and Warning are the two GHS signal words; nothing else is one. */
const signalStyle = (signal: string | null) =>
  signal === 'Danger'
    ? 'bg-red-50 text-status-danger border-red-200'
    : 'bg-[#FFF8E6] text-[#8A5A00] border-[#F0D9A0]';

export const ChemicalSafetyPanel: React.FC<{ initialQuery?: string }> = ({
  initialQuery = '',
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [result, setResult] = useState<Safety>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  const search = async (term: string) => {
    const name = term.trim();
    if (!name) return;
    setLoading(true);
    setError(undefined);
    try {
      const response = await fetch(
        `${env.PCF_API_BASE_URL}/v1/chemical-safety?name=${encodeURIComponent(name)}`,
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        // The engine's own sentence already says that a failure here is not a
        // finding of "no hazards", so it is shown as written.
        setError(typeof body?.detail === 'string'
          ? body.detail
          : 'The safety lookup could not be completed. This is not a finding that the '
            + 'substance is safe.');
        setResult(undefined);
        return;
      }
      setResult(SafetySchema.parse(body));
    } catch {
      setError('The safety lookup could not be reached. This is not a finding that the '
        + 'substance is safe.');
      setResult(undefined);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-5 flex flex-col gap-4">
      <div>
        <div className="flex items-center gap-2">
          <FlaskConical size={18} className="text-brand-primary" />
          <h3 className="text-[15px] font-bold text-brand-heading">Chemical safety</h3>
        </div>
        <p className="text-[13px] text-brand-muted mt-1">
          A carbon figure says what a material costs the climate. It says nothing about
          whether it will burn or harm whoever handles it. Look the substance up in PubChem.
        </p>
      </div>

      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => { event.preventDefault(); search(query); }}
      >
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="acetone, sulfuric acid, toluene…"
            aria-label="Substance name"
            maxLength={200}
            className="w-full h-10 bg-surface-raised border border-border rounded-md pl-9 pr-3 text-sm text-brand-body shadow-nm-inset-input focus-visible:outline-2 focus-visible:outline-blue-600"
          />
        </div>
        <Button type="submit" disabled={loading || !query.trim()}>
          {loading ? 'Looking up…' : 'Look up'}
        </Button>
      </form>

      {loading && (
        <div className="flex items-center gap-2 text-[13px] text-brand-muted">
          <Loader2 size={15} className="animate-spin" /> Asking PubChem…
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 flex gap-2.5">
          <AlertTriangle size={16} className="text-status-danger shrink-0 mt-0.5" />
          <p className="text-[12px] leading-relaxed text-brand-body">{error}</p>
        </div>
      )}

      {result && !result.matched && (
        <div className="rounded-lg border border-border bg-surface-raised p-3 flex flex-col gap-2">
          {result.notes.map((note) => (
            <div key={note} className="flex gap-2">
              <Info size={13} className="text-brand-muted shrink-0 mt-[3px]" />
              <p className="text-[12px] leading-relaxed text-brand-body">{note}</p>
            </div>
          ))}
        </div>
      )}

      {result?.matched && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-brand-muted">
                {result.query}
              </span>
              <p className="text-[14px] font-semibold text-brand-heading">
                {result.name}
              </p>
            </div>
            {result.signal_word && (
              <span className={`px-2.5 py-1 rounded-md border text-[12px] font-bold uppercase tracking-wide ${signalStyle(result.signal_word)}`}>
                {result.signal_word}
              </span>
            )}
            <span className="text-[12px] font-mono text-brand-muted">
              {result.molecular_formula}
              {result.molecular_weight ? ` · ${result.molecular_weight} g/mol` : ''}
            </span>
          </div>

          {result.hazard_statements.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <h4 className="text-[12px] font-bold text-brand-heading">Hazard statements</h4>
              {result.hazard_statements.map((hazard) => (
                <div key={hazard.code} className="flex gap-2 items-baseline">
                  <span className="font-mono text-[12px] font-bold text-status-danger shrink-0">
                    {hazard.code}
                  </span>
                  <span className="text-[12.5px] text-brand-body">{hazard.statement}</span>
                </div>
              ))}
            </div>
          )}

          {result.precautionary_codes.length > 0 && (
            <div>
              <h4 className="text-[12px] font-bold text-brand-heading mb-1">
                Precautionary codes
              </h4>
              <p className="text-[12px] font-mono text-brand-muted leading-relaxed">
                {result.precautionary_codes.join(', ')}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2 pt-1 border-t border-border">
            {result.notes.map((note) => (
              <div key={note} className="flex gap-2">
                <Info size={13} className="text-brand-primary shrink-0 mt-[3px]" />
                <p className="text-[12px] leading-relaxed text-brand-body">{note}</p>
              </div>
            ))}
            {result.source_url && (
              <a
                href={result.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-link hover:underline"
              >
                {result.source} <ExternalLink size={12} />
              </a>
            )}
          </div>
        </div>
      )}
    </Card>
  );
};
