import React from 'react';
import {
  AlertTriangle,
  Factory,
  Info,
  Lightbulb,
  ListChecks,
  PlugZap,
  Recycle,
  ShieldAlert,
  ShieldCheck,
  Sigma,
  Sparkles,
  TrendingDown,
} from 'lucide-react';
import { clsx } from 'clsx';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { EstimateLine, EstimateResponse, RangeValue, STAGES, Stage } from '../../types/pcf';

/*
 * Every figure on this view is a string computed by ghg_core on the server.
 * The helpers below only change how a string LOOKS - digit grouping and unit
 * labels. None of them performs emissions arithmetic.
 */

const STAGE_META: Record<Stage, { label: string; bar: string; dot: string }> = {
  raw_materials: { label: 'Raw materials', bar: 'bg-blue-700', dot: 'bg-blue-700' },
  manufacturing: { label: 'Manufacturing', bar: 'bg-blue-500', dot: 'bg-blue-500' },
  distribution: { label: 'Distribution', bar: 'bg-blue-200', dot: 'bg-blue-200' },
  use: { label: 'Use phase', bar: 'bg-status-warning', dot: 'bg-status-warning' },
  end_of_life: { label: 'End of life', bar: 'bg-scope-biogenic', dot: 'bg-scope-biogenic' },
};

const REGION_LABEL: Record<string, string> = {
  IN: 'India',
  GLOBAL: 'Global average',
  GB: 'United Kingdom',
  US: 'United States',
  EU: 'European Union',
};

/** Group the integer digits of an already-rounded display string (en-IN). */
export function groupDigits(value: string): string {
  const [whole, fraction] = value.split('.');
  const grouped = Number(whole).toLocaleString('en-IN');
  return fraction ? `${grouped}.${fraction}` : grouped;
}

/** "kgCO2e" -> "kg CO₂e", "kgCO2e/kWh" -> "kg CO₂e / kWh" */
export function unitLabel(unit: string): string {
  return unit
    .replace('kgCO2e', 'kg CO₂e')
    .replace('tCO2e', 't CO₂e')
    .replace('/', ' / ');
}

const isZero = (r: RangeValue) => r.central === '0';

function RangeText({ range }: { range: RangeValue }) {
  const { low, high, unit } = range.display;
  if (low === high) return <span>No spread in the inputs</span>;
  return (
    <span className="font-mono tabular-nums">
      {groupDigits(low)} – {groupDigits(high)} {unitLabel(unit)}
    </span>
  );
}

function SectionTitle({ icon, children, aside }: { icon: React.ReactNode; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
      <h3 className="text-base font-semibold text-brand-heading flex items-center gap-2">
        <span className="text-brand-link">{icon}</span>
        {children}
      </h3>
      {aside}
    </div>
  );
}

// ─── Interpretation & provenance ────────────────────────────────────────────

function Interpretation({ data }: { data: EstimateResponse }) {
  const { product, analysis } = data;
  const confidenceVariant = { high: 'success', medium: 'warning', low: 'danger' } as const;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-sm text-brand-muted">Interpreted as</span>
        <span className="text-lg font-semibold text-brand-heading">{product.interpreted_as}</span>
        <Badge variant="default">{product.category.replace(/_/g, ' ')}</Badge>
        <Badge variant="default">per {product.declared_unit}</Badge>
        <Badge variant={confidenceVariant[analysis.confidence]}>
          {analysis.confidence} confidence
        </Badge>
      </div>

      {product.is_ambiguous && product.clarification && (
        <div className="flex gap-3 rounded-lg border border-[#A66300]/30 bg-[#A66300]/10 p-3.5">
          <AlertTriangle size={18} className="text-status-warning flex-shrink-0 mt-0.5" />
          <p className="text-sm text-brand-body">
            <strong className="font-semibold text-brand-heading">This description is broad, so the estimate is a typical case. </strong>
            {product.clarification}
          </p>
        </div>
      )}
    </div>
  );
}

function ProvenanceBanner({ data }: { data: EstimateResponse }) {
  const verified = data.verified_share_pct;
  if (verified === null || verified === '0') {
    return (
      <div className="flex gap-3 rounded-lg border border-border bg-surface p-4">
        <ShieldAlert size={20} className="text-status-warning flex-shrink-0 mt-0.5" />
        <div className="text-sm text-brand-body">
          <p className="font-semibold text-brand-heading">Every figure below is an AI estimate from {data.method.assistant}</p>
          <p className="mt-1">
            No verified emission factors were available for these inputs yet. Treat this as a
            screening estimate — not an ISO 14067 product footprint or an Environmental Product
            Declaration.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-3 rounded-lg border border-border bg-surface p-4">
      <ShieldCheck size={20} className="text-status-success flex-shrink-0 mt-0.5" />
      <p className="text-sm text-brand-body">
        <span className="font-semibold text-brand-heading font-mono tabular-nums">{verified}%</span> of the
        lifecycle total uses verified factors from IINVTY&apos;s registry. The remainder are AI estimates,
        marked on each line.
      </p>
    </div>
  );
}

// ─── Headline figures ───────────────────────────────────────────────────────

function Figure({
  eyebrow,
  caption,
  icon,
  range,
  emptyText,
  size = 'lg',
}: {
  eyebrow: string;
  caption: string;
  icon: React.ReactNode;
  range: RangeValue;
  emptyText?: string;
  size?: 'lg' | 'sm';
}) {
  const { central, unit } = range.display;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-brand-link">{eyebrow}</p>
          <p className="text-sm text-brand-muted mt-0.5">{caption}</p>
        </div>
        <span className="text-brand-muted flex-shrink-0">{icon}</span>
      </div>
      {isZero(range) && emptyText ? (
        <p className="text-sm text-brand-muted mt-3">{emptyText}</p>
      ) : (
        <>
          <p className="mt-3 flex items-baseline gap-2">
            <span
              className={clsx(
                'font-mono tabular-nums font-semibold text-brand-heading leading-none',
                size === 'lg' ? 'text-[40px]' : 'text-[28px]'
              )}
            >
              {groupDigits(central)}
            </span>
            <span className="text-sm font-medium text-brand-muted">{unitLabel(unit)}</span>
          </p>
          <p className="text-xs text-brand-muted mt-1.5">
            Range <RangeText range={range} />
          </p>
        </>
      )}
    </div>
  );
}

function HeadlineFigures({ data }: { data: EstimateResponse }) {
  const { totals, assumptions } = data;
  const years = String(assumptions.service_life_years);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <Card className="p-6">
        <Figure
          eyebrow="Creation"
          caption="Materials, manufacturing and delivery"
          icon={<Factory size={22} />}
          range={totals.creation}
          emptyText="No creation emissions were identified."
        />
      </Card>
      <Card className="p-6">
        <Figure
          eyebrow="Use"
          caption={`Over ${years} ${years === '1' ? 'year' : 'years'} · ${assumptions.use_profile}`}
          icon={<PlugZap size={22} />}
          range={totals.use}
          emptyText="This product has no use-phase emissions in this estimate."
        />
      </Card>
      <Card className="p-6 flex flex-col gap-5">
        <Figure
          eyebrow="Total lifecycle"
          caption="Creation, use and end of life"
          icon={<Sigma size={20} />}
          range={totals.lifecycle}
          size="sm"
        />
        <div className="border-t border-border pt-4">
          <Figure
            eyebrow="End of life"
            caption={assumptions.end_of_life_route}
            icon={<Recycle size={20} />}
            range={totals.end_of_life}
            emptyText="No end-of-life emissions identified."
            size="sm"
          />
        </div>
      </Card>
    </div>
  );
}

// ─── Stage split & hotspots ─────────────────────────────────────────────────

function StageSplit({ data }: { data: EstimateResponse }) {
  const present = STAGES.filter((s) => data.stages[s] && !isZero(data.stages[s]));
  return (
    <Card className="p-6">
      <SectionTitle icon={<ListChecks size={18} />}>Where the emissions occur</SectionTitle>
      {present.length === 0 ? (
        <p className="text-sm text-brand-muted">No emissions were computed for this product.</p>
      ) : (
        <>
          <div
            className="flex h-3 w-full overflow-hidden rounded-sm bg-surface-sunken"
            role="img"
            aria-label={present
              .map((s) => `${STAGE_META[s].label} ${data.stage_shares_pct[s] ?? '0'} percent`)
              .join(', ')}
          >
            {present.map((s) => (
              <div
                key={s}
                className={STAGE_META[s].bar}
                style={{ width: `${data.stage_shares_pct[s] ?? '0'}%` }}
              />
            ))}
          </div>
          <ul className="mt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-x-6 gap-y-3">
            {STAGES.map((s) => {
              const r = data.stages[s];
              return (
                <li key={s} className="flex flex-col gap-0.5">
                  <span className="flex items-center gap-2 text-sm font-medium text-brand-heading">
                    <span className={clsx('h-2.5 w-2.5 rounded-sm', STAGE_META[s].dot)} aria-hidden />
                    {STAGE_META[s].label}
                  </span>
                  <span className="pl-[18px] text-sm font-mono tabular-nums text-brand-body">
                    {r && !isZero(r)
                      ? `${data.stage_shares_pct[s]}% · ${groupDigits(r.display.central)} ${unitLabel(r.display.unit)}`
                      : '—'}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}

function Hotspots({ data }: { data: EstimateResponse }) {
  const byId = new Map(data.lines.map((l) => [l.line_id, l]));
  const hotspots = data.hotspot_line_ids.map((id) => byId.get(id)).filter(Boolean) as EstimateLine[];
  if (hotspots.length === 0) return null;
  return (
    <Card className="p-6">
      <SectionTitle icon={<TrendingDown size={18} />}>Largest contributors</SectionTitle>
      <ol className="flex flex-col divide-y divide-border">
        {hotspots.map((l, i) => (
          <li key={l.line_id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
            <span className="font-mono tabular-nums text-sm text-brand-muted w-5">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-brand-heading">{l.component}</p>
              <p className="text-xs text-brand-muted">{STAGE_META[l.stage].label}</p>
            </div>
            <div className="text-right">
              <p className="font-mono tabular-nums text-sm font-semibold text-brand-heading">
                {l.share_of_lifecycle_pct ?? '—'}%
              </p>
              <p className="font-mono tabular-nums text-xs text-brand-muted">
                {groupDigits(l.emissions.display.central)} {unitLabel(l.emissions.display.unit)}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

// ─── Inventory table ────────────────────────────────────────────────────────

function SourceCell({ line }: { line: EstimateLine }) {
  const verified = line.provenance === 'verified_registry';
  return (
    <div className="flex flex-col gap-1 min-w-[200px]">
      <span>
        {verified ? (
          <Badge variant="success">Verified{line.tier ? ` · Tier ${line.tier}` : ''}</Badge>
        ) : (
          <Badge variant="warning">AI estimate</Badge>
        )}
      </span>
      {line.factor_basis && <span className="text-xs text-brand-body">{line.factor_basis}</span>}
      <span className="text-xs text-brand-muted">
        {line.reference ? (verified ? line.reference : `Cited by AI, unverified: ${line.reference}`) : 'No source cited'}
      </span>
    </div>
  );
}

function InventoryTable({ data }: { data: EstimateResponse }) {
  return (
    <Card noPadding>
      <div className="p-6 pb-4">
        <SectionTitle
          icon={<Info size={18} />}
          aside={<span className="text-xs text-brand-muted">{data.lines.length} lifecycle inputs</span>}
        >
          Lifecycle inventory
        </SectionTitle>
        <p className="text-sm text-brand-muted -mt-2">
          Each input&apos;s emissions are its quantity multiplied by its factor. The engine sums every row.
        </p>
      </div>
      <div className="overflow-x-auto border-t border-border">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="bg-surface text-left">
              {['Input', 'Quantity', 'Emission factor', 'Emissions', 'Share', 'Source'].map((h) => (
                <th key={h} scope="col" className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.06em] text-brand-muted">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          {STAGES.map((stage) => {
            const rows = data.lines.filter((l) => l.stage === stage);
            if (rows.length === 0) return null;
            return (
              <tbody key={stage}>
                <tr className="border-t border-border bg-surface-sunken/40">
                  <th colSpan={6} scope="rowgroup" className="px-4 py-2 text-left">
                    <span className="flex items-center gap-2 text-xs font-semibold text-brand-heading">
                      <span className={clsx('h-2.5 w-2.5 rounded-sm', STAGE_META[stage].dot)} aria-hidden />
                      {STAGE_META[stage].label}
                    </span>
                  </th>
                </tr>
                {rows.map((l) => (
                  <tr key={l.line_id} className="border-t border-border align-top">
                    <td className="px-4 py-3 font-medium text-brand-heading">{l.component}</td>
                    <td className="px-4 py-3 font-mono tabular-nums text-brand-body whitespace-nowrap">
                      {groupDigits(l.quantity)} {l.quantity_unit}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-mono tabular-nums text-brand-body">
                        {groupDigits(l.factor.display.central)}
                      </span>{' '}
                      <span className="text-xs text-brand-muted">{unitLabel(l.factor.display.unit)}</span>
                      {l.factor.display.low !== l.factor.display.high && (
                        <span className="block text-xs text-brand-muted font-mono tabular-nums">
                          {groupDigits(l.factor.display.low)} – {groupDigits(l.factor.display.high)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-mono tabular-nums font-semibold text-brand-heading">
                        {groupDigits(l.emissions.display.central)}
                      </span>{' '}
                      <span className="text-xs text-brand-muted">{unitLabel(l.emissions.display.unit)}</span>
                      {l.emissions.display.low !== l.emissions.display.high && (
                        <span className="block text-xs text-brand-muted font-mono tabular-nums">
                          {groupDigits(l.emissions.display.low)} – {groupDigits(l.emissions.display.high)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums text-brand-body whitespace-nowrap">
                      {l.share_of_lifecycle_pct === null ? '—' : `${l.share_of_lifecycle_pct}%`}
                    </td>
                    <td className="px-4 py-3">
                      <SourceCell line={l} />
                    </td>
                  </tr>
                ))}
              </tbody>
            );
          })}
        </table>
      </div>
    </Card>
  );
}

// ─── AI analysis ────────────────────────────────────────────────────────────

function BulletList({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-brand-muted">{empty}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2.5 text-sm text-brand-body leading-relaxed">
          <span className="mt-2 h-1 w-1 rounded-full bg-brand-muted flex-shrink-0" aria-hidden />
          {t}
        </li>
      ))}
    </ul>
  );
}

function AnalysisPanel({ data }: { data: EstimateResponse }) {
  const { analysis } = data;
  return (
    <Card className="p-6">
      <SectionTitle
        icon={<Sparkles size={18} />}
        aside={<span className="text-xs text-brand-muted">Qualitative · figures come from the calculation engine</span>}
      >
        {data.method.assistant} analysis
      </SectionTitle>

      <p className="text-[15px] text-brand-body leading-relaxed max-w-[72ch]">{analysis.summary}</p>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h4 className="text-sm font-semibold text-brand-heading mb-2.5">What drives creation emissions</h4>
          <BulletList items={analysis.creation_drivers} empty="None identified." />
        </div>
        <div>
          <h4 className="text-sm font-semibold text-brand-heading mb-2.5">What drives use-phase emissions</h4>
          <BulletList items={analysis.use_phase_drivers} empty="No use-phase emissions identified." />
        </div>
      </div>

      <div className="mt-6 border-t border-border pt-5">
        <h4 className="text-sm font-semibold text-brand-heading mb-3 flex items-center gap-2">
          <Lightbulb size={16} className="text-brand-link" />
          Ways to reduce it
        </h4>
        {analysis.reduction_opportunities.length === 0 ? (
          <p className="text-sm text-brand-muted">No reduction opportunities suggested.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {analysis.reduction_opportunities.map((o, i) => (
              <li key={i} className="py-3 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
                <span className="sm:w-36 flex-shrink-0">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-muted">
                    <span className={clsx('h-2 w-2 rounded-sm', STAGE_META[o.stage].dot)} aria-hidden />
                    {STAGE_META[o.stage].label}
                  </span>
                </span>
                <div>
                  <p className="text-sm font-semibold text-brand-heading">{o.lever}</p>
                  <p className="text-sm text-brand-body mt-0.5 leading-relaxed">{o.rationale}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6 border-t border-border pt-5">
        <h4 className="text-sm font-semibold text-brand-heading mb-2.5">What would change this estimate most</h4>
        <BulletList items={analysis.data_gaps} empty="No data gaps flagged." />
      </div>
    </Card>
  );
}

// ─── Exclusions & method ────────────────────────────────────────────────────

function Exclusions({ data }: { data: EstimateResponse }) {
  if (data.excluded.length === 0) return null;
  return (
    <Card className="p-6 border-[#A66300]/30">
      <SectionTitle icon={<AlertTriangle size={18} />}>Inputs left out of the calculation</SectionTitle>
      <p className="text-sm text-brand-muted -mt-2 mb-3">
        These inputs failed validation, so they are not counted in any figure above.
      </p>
      <ul className="flex flex-col divide-y divide-border">
        {data.excluded.map((e, i) => (
          <li key={i} className="py-2.5 text-sm">
            <span className="font-medium text-brand-heading">{e.component}</span>
            <span className="text-brand-muted"> — {e.reason}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function MethodNote({ data }: { data: EstimateResponse }) {
  const { method } = data;
  const generated = new Date(method.generated_at).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <h3 className="text-sm font-semibold text-brand-heading">How this estimate was made</h3>
      <ol className="mt-3 flex flex-col gap-2 text-sm text-brand-body list-decimal pl-5 max-w-[80ch]">
        <li>
          {method.assistant} broke the product into {data.lines.length + data.excluded.length} lifecycle inputs and
          proposed a quantity and an emission-factor range for each.
        </li>
        <li>
          Inputs that match IINVTY&apos;s verified factor registry use the verified value instead of the AI&apos;s.
        </li>
        <li>
          IINVTY&apos;s calculation engine (ghg_core {method.engine_version}) multiplied and summed every figure in exact
          decimal arithmetic. Ranges add all the low values and all the high values — a deliberately wide bracket,
          not a statistical confidence interval.
        </li>
      </ol>
      {method.cache_hit && (
        <p className="mt-4 text-sm text-brand-body">This product was estimated before, so the answer came from cache.</p>
      )}
      <p className="mt-2 text-xs text-brand-muted font-mono tabular-nums">
        Estimate {data.estimate_id} · {REGION_LABEL[data.request.region] ?? data.request.region} · generated {generated}
      </p>
    </section>
  );
}

export const EstimateResult: React.FC<{ data: EstimateResponse }> = ({ data }) => (
  <div className="flex flex-col gap-6">
    <Interpretation data={data} />
    <ProvenanceBanner data={data} />
    <HeadlineFigures data={data} />
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
      <div className="xl:col-span-8">
        <StageSplit data={data} />
      </div>
      <div className="xl:col-span-4">
        <Hotspots data={data} />
      </div>
    </div>
    <InventoryTable data={data} />
    <AnalysisPanel data={data} />
    <Exclusions data={data} />
    <MethodNote data={data} />
  </div>
);
