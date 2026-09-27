/**
 * What the account's plan allows, and the wall when it runs out.
 *
 * Two rules this follows, because a paywall that breaks either of them reads
 * as a bug rather than a price:
 *
 *   Say the number before it matters. "1 estimate left" shown before the
 *   button is pressed is a fair warning; discovering the limit only by hitting
 *   it feels like a fault.
 *
 *   Never pretend the limit is something else. When the allowance is spent the
 *   page says so and offers the upgrade. It does not disable the button with no
 *   explanation, and it does not let a metering failure read as "you have run
 *   out" — the engine sends a different code for that, and it is shown as what
 *   it is.
 *
 * The count is never held here. The browser asks the server and shows what it
 * is told; a number the page could edit would not be a limit.
 */
import React from 'react';
import { Check, Sparkles, Zap } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import type { Entitlement } from '../../services/pcfService';

const PREMIUM_BENEFITS = [
  'Unlimited product estimates',
  'Answered by the most capable model, which reasons harder about production routes and the genuine spread of a factor',
  'Priority when the service is busy',
];

/** The strip above the form: what is left, in a sentence. */
export const PlanStatus: React.FC<{
  entitlement: Entitlement | null;
  onUpgrade: () => void;
}> = ({ entitlement, onUpgrade }) => {
  if (!entitlement) return null;

  if (entitlement.plan === 'premium') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-2">
        <Sparkles size={15} className="text-brand-primary shrink-0" />
        <span className="text-[12.5px] text-brand-body">
          <strong>Premium.</strong> Unlimited estimates, answered by the most capable model.
        </span>
      </div>
    );
  }

  const remaining = entitlement.estimatesRemaining ?? 0;
  const limit = entitlement.estimatesLimit ?? 0;
  const exhausted = remaining <= 0;

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 ${
        exhausted
          ? 'border-[#F0D9A0] bg-[#FFF8E6]'
          : 'border-border bg-surface-raised'
      }`}
    >
      <div className="flex items-center gap-2">
        <Zap size={15} className={exhausted ? 'text-[#8A5A00]' : 'text-brand-muted'} />
        <span className="text-[12.5px] text-brand-body">
          {exhausted ? (
            <>
              <strong>Free plan used up.</strong> You have run all {limit} estimates included
              with the free plan.
            </>
          ) : (
            <>
              <strong>
                {remaining} of {limit} free estimate{limit === 1 ? '' : 's'} left
              </strong>
              . Estimates you have already run stay available and do not count again.
            </>
          )}
        </span>
      </div>
      <Button size="sm" variant={exhausted ? 'primary' : 'secondary'} onClick={onUpgrade}>
        {exhausted ? 'Upgrade to Premium' : 'See Premium'}
      </Button>
    </div>
  );
};

/** The wall shown in place of a result once the allowance is spent. */
export const UpgradeWall: React.FC<{
  message: string;
  entitlement?: Entitlement;
  onUpgrade: () => void;
}> = ({ message, entitlement, onUpgrade }) => (
  <Card className="p-6 border-[#F0D9A0] bg-[#FFFDF7]">
    <div className="flex items-start gap-3">
      <div className="w-10 h-10 rounded-full bg-blue-50 text-brand-primary flex items-center justify-center shrink-0">
        <Sparkles size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-[16px] font-bold text-brand-heading">
          You have used your free estimates
        </h3>
        <p className="text-[13px] text-brand-body mt-1 leading-relaxed">{message}</p>

        {entitlement && (
          <p className="text-[12px] text-brand-muted mt-1">
            {entitlement.estimatesUsed} of {entitlement.estimatesLimit} used.
          </p>
        )}

        <ul className="mt-4 flex flex-col gap-2">
          {PREMIUM_BENEFITS.map((benefit) => (
            <li key={benefit} className="flex gap-2 items-start">
              <Check size={15} className="text-status-success shrink-0 mt-0.5" />
              <span className="text-[13px] text-brand-body">{benefit}</span>
            </li>
          ))}
        </ul>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={onUpgrade}>Upgrade to Premium</Button>
        </div>

        <p className="text-[12px] text-brand-muted mt-3">
          Every estimate you have already run stays on this page and costs nothing to open
          again. Your GHG inventory, the IPCC methods and the report are not affected by this
          limit — it applies only to new AI product estimates.
        </p>
      </div>
    </div>
  </Card>
);
