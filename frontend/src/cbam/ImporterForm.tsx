import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { CbamData, OTHER_COUNTRIES, ROUTE_LABELS } from './data';
import type { ImportLine, ImporterInput } from './model';
import type { ImporterResult } from './importer';
import { Choice, CnBox, Field, NumBox, TextBox } from './fields';
import { blankImportLine } from './state';

const QUARTERS: Array<'Q1' | 'Q2' | 'Q3' | 'Q4'> = ['Q1', 'Q2', 'Q3', 'Q4'];

export const ImporterForm: React.FC<{
  data: CbamData; value: ImporterInput; result: ImporterResult | null; onChange: (next: ImporterInput) => void;
}> = ({ data, value, result, onChange }) => {
  const setLine = (id: string, patch: Partial<ImportLine>) => onChange({ ...value, lines: value.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  const countries = [{ value: '', label: 'Unknown / not listed' }, ...data.countries.map((c) => ({ value: c, label: c }))];
  const published = Object.fromEntries(data.parameters.certificatePrice.quarterly2026.map((q) => [q.quarter.split(' ')[0], q]));

  return (
    <div className="flex flex-col gap-5">
      <Card className="p-4 sm:p-5">
        <h2 className="text-[15px] font-bold text-brand-heading">1. Declarant and year</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
          <Field label="Authorised CBAM declarant"><TextBox value={value.declarant} onChange={(v) => onChange({ ...value, declarant: v })} /></Field>
          <Field label="Year of import">
            <Choice value={String(value.year)} onChange={(v) => onChange({ ...value, year: Number(v) })}
              options={[2026, 2027, 2028, 2029, 2030].map((y) => ({ value: String(y), label: String(y) }))} />
          </Field>
          <Field label="Reference price RP (€)" hint={result?.referencePrice.basis}>
            <NumBox value={value.referencePrice} placeholder={result?.referencePrice.value ? Number(result.referencePrice.value).toFixed(2) : ''}
              onChange={(v) => onChange({ ...value, referencePrice: v })} />
          </Field>
        </div>
        <h3 className="text-[12.5px] font-bold text-brand-heading mt-4">Certificate price (€ per certificate)</h3>
        <p className="text-[11.5px] text-brand-muted mb-2">
          {value.year === 2026
            ? `The Commission's published 2026 quarterly prices are filled in. Source: ${data.parameters.certificatePrice.source.url}, read ${data.parameters.certificatePrice.source.fetched}.`
            : 'From 2027 the Commission publishes weekly prices: enter the price that applies.'}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {QUARTERS.map((q) => {
            const pub = value.year === 2026 ? published[q] : undefined;
            return (
              <Field key={q} label={`${q} ${value.year}`} hint={pub ? (pub.eurPerCertificate ? `Published ${pub.published}` : `Due ${pub.published}`) : undefined}>
                <NumBox value={value.certificatePrice[q]} placeholder={pub?.eurPerCertificate ?? ''}
                  onChange={(v) => onChange({ ...value, certificatePrice: { ...value.certificatePrice, [q]: v } })} />
              </Field>
            );
          })}
        </div>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-bold text-brand-heading">2. Imported goods</h2>
          <p className="text-[12.5px] text-brand-muted">Use the operator's verified data where you have it; default values otherwise.</p>
        </div>
        <Button size="sm" variant="secondary" leftIcon={<Plus size={14} />} onClick={() => onChange({ ...value, lines: [...value.lines, blankImportLine()] })}>
          Add goods
        </Button>
      </div>

      {value.lines.map((l) => {
        const res = result?.lines.find((x) => x.id === l.id);
        return (
          <Card key={l.id} className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-start">
              <div className="col-span-2 sm:col-span-4"><Field label="CN code"><CnBox data={data} value={l.cn} onChange={(v) => setLine(l.id, { cn: v })} /></Field></div>
              <div className="col-span-2 sm:col-span-3"><Field label="Description"><TextBox value={l.name} onChange={(v) => setLine(l.id, { name: v })} /></Field></div>
              <div className="col-span-2 sm:col-span-3">
                <Field label="Country of origin">
                  <Choice value={l.country ?? ''} onChange={(v) => setLine(l.id, { country: v || null })} options={countries} />
                </Field>
              </div>
              <div className="col-span-2 sm:col-span-2 flex justify-end sm:pt-5">
                {value.lines.length > 1 && (
                  <button type="button" aria-label="Remove goods" onClick={() => onChange({ ...value, lines: value.lines.filter((x) => x.id !== l.id) })}
                    className="h-9 w-9 inline-flex items-center justify-center rounded-md text-brand-muted hover:text-red-600 hover:bg-red-50"><Trash2 size={15} /></button>
                )}
              </div>
              <div className="sm:col-span-2"><Field label="Net mass (t)"><NumBox value={l.tonnes} onChange={(v) => setLine(l.id, { tonnes: v })} /></Field></div>
              <div className="sm:col-span-2">
                <Field label="Quarter imported"><Choice value={l.quarter} onChange={(v) => setLine(l.id, { quarter: v as ImportLine['quarter'] })}
                  options={QUARTERS.map((q) => ({ value: q, label: q }))} /></Field>
              </div>
              <div className="sm:col-span-3">
                <Field label="Data"><Choice value={l.basis} onChange={(v) => setLine(l.id, { basis: v as ImportLine['basis'] })}
                  options={[{ value: 'default', label: 'Default values' }, { value: 'actual', label: "Operator's verified data" }]} /></Field>
              </div>
              <div className="sm:col-span-3">
                <Field label="Carbon price paid (€/t good)" hint="Only with evidence of a price effectively paid">
                  <NumBox value={l.carbonPricePaidPerTonne} onChange={(v) => setLine(l.id, { carbonPricePaidPerTonne: v })} />
                </Field>
              </div>
              {res?.routeOptions && (
                <div className="col-span-2 sm:col-span-4">
                  <Field label="Production route">
                    <Choice value={l.route ?? ''} onChange={(v) => setLine(l.id, { route: v || undefined })}
                      options={[{ value: '', label: 'Choose…' }, ...res.routeOptions.map((r) => ({ value: r, label: `${r} ${ROUTE_LABELS[r] ?? ''}` }))]} />
                  </Field>
                </div>
              )}
              {l.basis === 'actual' && (
                <>
                  <div className="col-span-2 sm:col-span-3"><Field label="Operator / installation"><TextBox value={l.operatorName} onChange={(v) => setLine(l.id, { operatorName: v })} /></Field></div>
                  <div className="sm:col-span-3"><Field label="SEE direct (t/t)"><NumBox value={l.seeDirect} onChange={(v) => setLine(l.id, { seeDirect: v })} /></Field></div>
                  <div className="sm:col-span-3"><Field label="SEE indirect (t/t)"><NumBox value={l.seeIndirect} onChange={(v) => setLine(l.id, { seeIndirect: v })} /></Field></div>
                  <div className="col-span-2 sm:col-span-3"><Field label="SEFA (t/t)"><NumBox value={l.sefa} onChange={(v) => setLine(l.id, { sefa: v })} /></Field></div>
                </>
              )}
            </div>
            {res?.problem && <p className="mt-2 text-[12px] text-amber-800">{res.problem}</p>}
            {res?.defaultUsed && (
              <p className="mt-2 text-[11.5px] text-brand-muted">
                Default: {res.defaultUsed.table}, CN {res.defaultUsed.matchedCn}, {res.defaultUsed.total} t/t + {Number(res.defaultUsed.markUp) * 100}% mark-up
                {res.defaultUsed.note ? `. ${res.defaultUsed.note}` : ''}
              </p>
            )}
          </Card>
        );
      })}
      <p className="text-[11.5px] text-brand-muted">
        Country "Unknown / not listed" uses the table '{OTHER_COUNTRIES}' in Annex I.
      </p>
    </div>
  );
};
