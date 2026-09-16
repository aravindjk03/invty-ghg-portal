import React, { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Loader2,
  MapPin,
  Package,
  RotateCcw,
  Search,
  Sparkles,
  Terminal,
  X,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { EstimateResult } from '../components/pcf/EstimateResult';
import { estimateProduct, getPcfHealth, PcfError } from '../services/pcfService';
import { EstimateInput, Region } from '../types/pcf';

export interface ProductCarbonPageProps {
  onNavigate: (page: string) => void;
}

const REGION_OPTIONS: { value: Region; label: string }[] = [
  { value: 'IN', label: 'India' },
  { value: 'GLOBAL', label: 'Global average' },
  { value: 'EU', label: 'European Union' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'US', label: 'United States' },
];

// Spread across the families the catalogue covers, so a first visitor sees range.
const EXAMPLES = [
  '50 kg bag of PPC cement',
  '1 kg caustic soda, membrane cell',
  '1.5-ton 5-star split air conditioner',
  'Stainless steel water bottle, 750 ml',
  'Cotton T-shirt',
  'Electric scooter',
  'Smartphone',
  '1 tonne TMT steel rebar',
];

// ─── Service status ─────────────────────────────────────────────────────────

function ServiceStatus() {
  const health = useQuery({ queryKey: ['pcf-health'], queryFn: getPcfHealth, retry: false, staleTime: 30_000 });

  let dot = 'bg-brand-muted';
  let text = 'Checking service…';
  if (health.isError) {
    dot = 'bg-status-danger';
    text = 'Service offline';
  } else if (health.data && !health.data.ai_configured) {
    dot = 'bg-status-warning';
    text = 'AI not configured';
  } else if (health.data) {
    dot = 'bg-status-success';
    text = `AI ready · ${health.data.model_label}${health.data.billing === 'free_tier' ? ' (free tier)' : ''}`;
  }

  return (
    <div className="flex flex-col items-start sm:items-end gap-1">
      <span className="inline-flex items-center gap-2 rounded-md border border-border bg-surface-raised px-3 py-1.5 text-xs font-medium text-brand-body">
        <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
        {text}
      </span>
      {health.data && (
        <span className="text-xs text-brand-muted font-mono tabular-nums">
          {health.data.verified_factors} verified factors · {health.data.catalogue_rows} catalogued materials
        </span>
      )}
      {health.data && health.data.ai_calls + health.data.cache_hits > 0 && (
        <span className="text-xs text-brand-muted font-mono tabular-nums">
          {health.data.billing === 'free_tier' ? 'Free tier' : `Est. AI spend $${health.data.estimated_spend_usd}`} ·{' '}
          {health.data.ai_calls} new ·{' '}
          {health.data.cache_hits} from cache
        </span>
      )}
    </div>
  );
}

// ─── Idle, loading and error states ────────────────────────────────────────

function HowItWorks() {
  const steps = [
    {
      title: 'AI breaks the product down',
      body: 'It works out the materials, manufacturing energy, transport, service life and disposal behind one unit — and proposes an emission-factor range for each.',
    },
    {
      title: 'The engine does the maths',
      body: "INVTY's calculation engine multiplies and sums every input in exact decimal arithmetic. The AI never states a total.",
    },
    {
      title: 'Verified data takes over',
      body: 'Wherever INVTY holds a verified factor for a material, it replaces the AI estimate — and the page says which is which.',
    },
  ];
  return (
    <Card className="p-6">
      <h2 className="text-base font-semibold text-brand-heading">How the estimate is made</h2>
      <ol className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-6">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-border bg-surface font-mono text-sm text-brand-link">
              {i + 1}
            </span>
            <div>
              <p className="text-sm font-semibold text-brand-heading">{s.title}</p>
              <p className="text-sm text-brand-muted mt-1 leading-relaxed">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-6 border-t border-border pt-4 text-xs text-brand-muted">
        Results are screening estimates for comparison and planning. They are not an ISO 14067-verified product
        footprint or an Environmental Product Declaration.
      </p>
    </Card>
  );
}

function Pending({ product, onCancel }: { product: string; onCancel: () => void }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const id = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <Card className="p-8">
      <div className="flex flex-col sm:flex-row sm:items-center gap-5">
        <Loader2 size={28} className="text-brand-link animate-spin motion-reduce:animate-none flex-shrink-0" />
        <div className="flex-1" role="status" aria-live="polite">
          <p className="text-base font-semibold text-brand-heading">Analysing “{product}”</p>
          <p className="text-sm text-brand-muted mt-1">
            The AI is working through materials, manufacturing, use and disposal. This usually takes under a minute.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-mono tabular-nums text-sm text-brand-muted" aria-label={`${seconds} seconds elapsed`}>
            {seconds}s
          </span>
          <Button variant="secondary" size="sm" onClick={onCancel} leftIcon={<X size={14} />}>
            Cancel
          </Button>
        </div>
      </div>
    </Card>
  );
}

function SetupSteps({ provider }: { provider?: 'anthropic' | 'gemini' }) {
  const keyName = provider === 'gemini' ? 'GEMINI_API_KEY' : 'ANTHROPIC_API_KEY';
  const keyOwner = provider === 'gemini' ? 'Gemini' : 'Anthropic';
  return (
    <ol className="mt-3 flex flex-col gap-2 text-sm text-brand-body list-decimal pl-5">
      <li>
        Copy <code className="font-mono text-[13px] bg-surface-sunken px-1.5 py-0.5 rounded">service/.env.example</code> to{' '}
        <code className="font-mono text-[13px] bg-surface-sunken px-1.5 py-0.5 rounded">service/.env</code>
      </li>
      <li>
        Add your {keyOwner} key to <code className="font-mono text-[13px] bg-surface-sunken px-1.5 py-0.5 rounded">{keyName}</code>
      </li>
      <li>
        Restart the service: <code className="font-mono text-[13px] bg-surface-sunken px-1.5 py-0.5 rounded">npm run dev:pcf</code>
      </li>
    </ol>
  );
}

function Failure({ error, onRetry, provider }: {
  error: unknown;
  onRetry: () => void;
  provider?: 'anthropic' | 'gemini';
}) {
  const err = error instanceof PcfError ? error : new PcfError('unknown', 'Something went wrong. Try again.');
  const titles: Record<string, string> = {
    ai_not_configured: 'AI is not set up on the server yet',
    service_down: 'The Product Carbon service is offline',
    ai_refused: 'The AI declined this request',
    invalid_input: 'That description could not be used',
    rate_limited: 'Hourly estimate limit reached',
    ai_quota_exceeded: "The AI provider's free limit has been reached",
  };
  const title = titles[err.code] ?? 'The estimate could not be completed';

  return (
    <Card className="p-6 border-[#B42318]/25">
      <div className="flex gap-3">
        <AlertTriangle size={20} className="text-status-danger flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-base font-semibold text-brand-heading">{title}</p>
          <p className="text-sm text-brand-body mt-1">{err.message}</p>
          {err.code === 'ai_not_configured' && <SetupSteps provider={provider} />}
          {err.code === 'service_down' && (
            <p className="mt-3 inline-flex items-center gap-2 text-sm text-brand-body">
              <Terminal size={15} className="text-brand-muted" />
              From the project folder, run{' '}
              <code className="font-mono text-[13px] bg-surface-sunken px-1.5 py-0.5 rounded">npm run dev:pcf</code>
            </p>
          )}
          <div className="mt-4">
            <Button variant="secondary" size="sm" onClick={onRetry} leftIcon={<RotateCcw size={14} />}>
              Try again
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export const ProductCarbonPage: React.FC<ProductCarbonPageProps> = () => {
  const [product, setProduct] = useState('');
  const [region, setRegion] = useState<Region>('IN');
  const [details, setDetails] = useState('');
  const [submitted, setSubmitted] = useState<EstimateInput | null>(null);
  const productRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const health = useQuery({ queryKey: ['pcf-health'], queryFn: getPcfHealth, retry: false, staleTime: 30_000 });

  const estimate = useMutation({
    mutationFn: (input: EstimateInput) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      return estimateProduct(input, controller.signal);
    },
    onSettled: () => {
      health.refetch();
    },
  });

  useEffect(() => () => abortRef.current?.abort(), []);

  const trimmed = product.trim();
  const canSubmit = trimmed.length >= 2 && !estimate.isPending;

  const run = (input: EstimateInput) => {
    setSubmitted(input);
    estimate.mutate(input);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    run({ product: trimmed, region, details: details.trim() });
  };

  const cancel = () => {
    abortRef.current?.abort();
    estimate.reset();
  };

  const retry = () => {
    health.refetch();
    if (submitted) run(submitted);
  };

  const pickExample = (text: string) => {
    setProduct(text);
    setDetails('');
    productRef.current?.focus();
  };

  return (
    <div className="max-w-[1440px] mx-auto px-6 py-8 pb-32">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-brand-link block">
            Product lifecycle · ISO 14067 &amp; GHG Protocol Product Standard
          </span>
          <h1 className="mt-1.5 text-[28px] font-bold text-brand-heading tracking-tight flex items-center gap-2.5">
            <Package size={26} className="text-brand-link" />
            Product Carbon Footprint
          </h1>
          <p className="text-[15px] text-brand-muted mt-1.5 max-w-[68ch] leading-relaxed">
            Name any product or material. AI works out how it is made and used, and INVTY&apos;s calculation engine
            computes the carbon from creating it and from using it.
          </p>
        </div>
        <ServiceStatus />
      </header>

      <div className="flex flex-col gap-6">
        {/* Setup notice - shown before anyone hits a failing request */}
        {health.data && !health.data.ai_configured && !estimate.isError && (
          <Card className="p-5 border-[#A66300]/30">
            <div className="flex gap-3">
              <AlertTriangle size={18} className="text-status-warning flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-brand-heading">AI is not configured yet, so estimates will not run</p>
                <SetupSteps provider={health.data.provider} />
              </div>
            </div>
          </Card>
        )}

        {/* Input */}
        <Card className="p-6">
          <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
              <div className="lg:col-span-7">
                <Input
                  id="pcf-product"
                  ref={productRef}
                  label="Product or material"
                  placeholder="e.g. 1.5-ton 5-star split air conditioner"
                  value={product}
                  onChange={(e) => setProduct(e.target.value)}
                  maxLength={300}
                  leftIcon={<Search size={16} />}
                  autoComplete="off"
                />
              </div>
              <div className="lg:col-span-2">
                <Select
                  id="pcf-region"
                  label="Region"
                  value={region}
                  onChange={(e) => setRegion(e.target.value as Region)}
                  options={REGION_OPTIONS}
                />
              </div>
              <div className="lg:col-span-3">
                <Button
                  type="submit"
                  fullWidth
                  disabled={!canSubmit}
                  leftIcon={estimate.isPending ? <Loader2 size={16} className="animate-spin motion-reduce:animate-none" /> : <Sparkles size={16} />}
                >
                  {estimate.isPending ? 'Estimating…' : 'Estimate footprint'}
                </Button>
              </div>
            </div>

            <Input
              id="pcf-details"
              label="Details (optional)"
              placeholder="Size, grade, how it is used — e.g. used 8 hours a day for 10 years"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={600}
              leftIcon={<MapPin size={16} />}
              helperText="Usage and specification details sharpen the use-phase estimate."
              autoComplete="off"
            />

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-brand-muted mr-1">Try</span>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => pickExample(ex)}
                  className="rounded-md border border-border bg-surface-raised px-2.5 py-1 text-xs text-brand-body hover:border-blue-500 hover:bg-blue-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                >
                  {ex}
                </button>
              ))}
            </div>
          </form>
        </Card>

        {/* Output */}
        {estimate.isPending && submitted && <Pending product={submitted.product} onCancel={cancel} />}
        {estimate.isError && !estimate.isPending && <Failure error={estimate.error} onRetry={retry} provider={health.data?.provider} />}
        {estimate.isSuccess && <EstimateResult data={estimate.data} />}
        {estimate.isIdle && <HowItWorks />}
      </div>
    </div>
  );
};
