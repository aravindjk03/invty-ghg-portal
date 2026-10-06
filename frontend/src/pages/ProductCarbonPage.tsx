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
  X,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { ChemicalSafetyPanel } from '../components/pcf/ChemicalSafetyPanel';
import { PlanStatus, UpgradeWall } from '../components/pcf/PlanBanner';
import { LeadGateModal } from '../components/ui/LeadGateModal';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { EstimateResult } from '../components/pcf/EstimateResult';
import { AccessKeyPanel } from '../components/pcf/AccessKeyPanel';
import { estimateProduct, getEntitlement, getPcfHealth, PcfError } from '../services/pcfService';
import { EstimateInput, Region } from '../types/pcf';
import { env } from '../config/env';

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

function useHealth() {
  return useQuery({ queryKey: ['pcf-health'], queryFn: getPcfHealth, retry: false, staleTime: 30_000 });
}

/** The assistant's public name, from the service when available. */
function useAssistantName() {
  return useHealth().data?.assistant ?? env.ASSISTANT_NAME;
}

function ServiceStatus() {
  const health = useHealth();
  const name = health.data?.assistant ?? env.ASSISTANT_NAME;

  let dot = 'bg-brand-muted';
  let state = 'checking…';
  if (health.isError) {
    dot = 'bg-status-danger';
    state = 'offline';
  } else if (health.data?.mode === 'browser' && !health.data.ai_ready) {
    dot = 'bg-status-warning';
    state = 'needs access key';
  } else if (health.data && !health.data.ai_ready) {
    dot = 'bg-status-warning';
    state = 'unavailable';
  } else if (health.data) {
    dot = 'bg-status-success';
    state = 'ready';
  }

  return (
    <div className="flex flex-col items-start sm:items-end gap-1">
      <span className="inline-flex items-center gap-2 rounded-md border border-border bg-surface-raised px-3 py-1.5 text-xs font-medium text-brand-body">
        <Sparkles size={13} className="text-brand-link" aria-hidden />
        <span className="font-semibold text-brand-heading">{name}</span>
        <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
        {state}
      </span>
      {health.data && health.data.mode !== 'browser' && (
        <span className="text-xs text-brand-muted font-mono tabular-nums">
          {health.data.verified_factors} verified factors · {health.data.catalogue_rows} catalogued materials
        </span>
      )}
    </div>
  );
}

// ─── Idle, loading and error states ────────────────────────────────────────

function HowItWorks() {
  const name = useAssistantName();
  const steps = [
    {
      title: `${name} breaks the product down`,
      body: 'It works out the materials, manufacturing energy, transport, service life and disposal behind one unit — and proposes an emission-factor range for each.',
    },
    {
      title: 'The engine does the maths',
      body: `IINVTY's calculation engine multiplies and sums every input in exact decimal arithmetic. ${name} never states a total.`,
    },
    {
      title: 'Verified data takes over',
      body: 'Wherever IINVTY holds a verified factor for a material, it replaces the AI estimate — and the page says which is which.',
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
        Results are AI screening estimates for comparison and planning. They are not an ISO 14067-verified product
        footprint or an Environmental Product Declaration.
      </p>
    </Card>
  );
}

function Pending({ product, onCancel }: { product: string; onCancel: () => void }) {
  const name = useAssistantName();
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
            {name} is working through materials, manufacturing, use and disposal. This usually takes under a minute.
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

function Failure({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const name = useAssistantName();
  const err = error instanceof PcfError ? error : new PcfError('unknown', 'Something went wrong. Try again.');
  const titles: Record<string, string> = {
    ai_not_configured: `${name} is unavailable`,
    service_down: `${name} is offline`,
    ai_refused: `${name} could not analyse this`,
    not_a_product: "That doesn't look like a product",
    invalid_input: 'That description could not be used',
    rate_limited: 'Hourly estimate limit reached',
    ai_quota_exceeded: `${name} is busy`,
    needs_key: `Connect ${name} first`,
    key_rejected: 'Access key not accepted',
    no_credit: `${name} has no usage credit`,
  };
  const title = titles[err.code] ?? 'The estimate could not be completed';

  return (
    <Card className="p-6 border-[#B42318]/25">
      <div className="flex gap-3">
        <AlertTriangle size={20} className="text-status-danger flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-base font-semibold text-brand-heading">{title}</p>
          <p className="text-sm text-brand-body mt-1">{err.message}</p>
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

  // What this account's plan allows. Read from the server, never remembered
  // here: a count the page could edit would not be a limit.
  const entitlement = useQuery({
    queryKey: ['pcf-entitlement'],
    queryFn: getEntitlement,
    retry: false,
    staleTime: 10_000,
  });
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const estimate = useMutation({
    mutationFn: (input: EstimateInput) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      return estimateProduct(input, controller.signal);
    },
    onSettled: () => {
      health.refetch();
      // One estimate has just been spent, or given back. Either way the
      // number on the page must be the server's, not one counted here.
      entitlement.refetch();
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
            Name any product or material. AI works out how it is made and used, and IINVTY&apos;s calculation engine
            computes the carbon from creating it and from using it.
          </p>
        </div>
        <ServiceStatus />
      </header>

      <div className="flex flex-col gap-6">
        {/* No estimate service reachable: the estimate runs from this browser with
            an access key saved on this computer. */}
        {health.data?.mode === 'browser' && (
          <AccessKeyPanel
            assistant={health.data.assistant}
            hasKey={health.data.ai_ready}
            onChange={() => { estimate.reset(); health.refetch(); }}
          />
        )}

        {/* Availability notice - brand-level only; operators see detail at /admin/status */}
        {health.data && health.data.mode !== 'browser' && !health.data.ai_ready && !estimate.isError && (
          <Card className="p-5 border-[#A66300]/30">
            <div className="flex gap-3">
              <AlertTriangle size={18} className="text-status-warning flex-shrink-0 mt-0.5" />
              <p className="text-sm text-brand-body">
                <span className="font-semibold text-brand-heading">{health.data.assistant} is not available right now.</span>{' '}
                Products estimated before still load; new estimates will resume shortly.
              </p>
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

        {/* What the plan allows, said before the button is pressed rather than
            discovered by hitting it. */}
        <PlanStatus entitlement={entitlement.data ?? null} onUpgrade={() => setUpgradeOpen(true)} />

        {/* Output */}
        {estimate.isPending && submitted && <Pending product={submitted.product} onCancel={cancel} />}
        {estimate.isError && !estimate.isPending
          && (estimate.error instanceof PcfError
            && estimate.error.code === 'estimate_limit_reached' ? (
              <UpgradeWall
                message={estimate.error.message}
                entitlement={estimate.error.entitlement}
                onUpgrade={() => setUpgradeOpen(true)}
              />
            ) : (
              <Failure error={estimate.error} onRetry={retry} />
            ))}
        {estimate.isSuccess && <EstimateResult data={estimate.data} />}
        {estimate.isIdle && <HowItWorks />}

        {/*
          The other half of the question. A carbon figure says what a material
          costs the climate; whoever handles it wants to know whether it will
          burn or harm them, and that is a different source entirely.
        */}
        <ChemicalSafetyPanel initialQuery={submitted?.product ?? ''} />
      </div>

      {/*
        There is no card payment in the product yet, so this records the
        request and says so. Telling someone they have upgraded when nothing
        has been charged would be worse than asking them to wait for a call.
      */}
      <LeadGateModal
        isOpen={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        onSuccess={() => setUpgradeOpen(false)}
        actionType="premium"
        title="Upgrade to Premium"
        description="Unlimited product estimates, answered by the most capable model. Leave your details and we will set the account up and confirm pricing with you."
      />
    </div>
  );
};
