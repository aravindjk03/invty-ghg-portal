import React, { useEffect, useState } from 'react';
import { Card } from './Card';
import { HelpCircle } from 'lucide-react';

export interface KPITileProps {
  label: string;
  value: number | string;
  unit?: string;
  subtext?: string;
  /** Names the period being compared against, e.g. "vs FY 2024-25". */
  deltaLabel?: string;
  delta?: {
    value: string;
    isPositiveGood?: boolean;
    isDecrease?: boolean;
  };
  tooltipText?: string;
  gradeCircle?: {
    grade: string;
    color: string;
  };
}

export const KPITile: React.FC<KPITileProps> = ({
  label,
  value,
  unit,
  subtext,
  delta,
  deltaLabel,
  tooltipText,
  gradeCircle,
}) => {
  // Animated count-up for numbers
  const [displayValue, setDisplayValue] = useState<number | string>(value);

  useEffect(() => {
    if (typeof value === 'number') {
      const start = typeof displayValue === 'number' ? displayValue : 0;
      const end = value;
      const duration = 400; // ms
      const startTime = performance.now();

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const current = start + (end - start) * easeOut;

        setDisplayValue(Number(current.toFixed(1)));

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          setDisplayValue(end);
        }
      };

      requestAnimationFrame(animate);
    } else {
      setDisplayValue(value);
    }
  }, [value]);

  return (
    <Card className="flex flex-col justify-between h-full p-5 relative overflow-hidden">
      {/* Header with Tooltip */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-brand-muted truncate">
          {label}
        </span>
        {tooltipText && (
          <div className="group relative cursor-pointer text-brand-decorative hover:text-brand-muted">
            <HelpCircle size={15} />
            <div className="absolute right-0 bottom-full mb-2 hidden group-hover:block z-30 w-60 p-2.5 bg-surface-raised border border-border shadow-nm-raised-sm rounded-md text-xs text-brand-body leading-relaxed">
              {tooltipText}
            </div>
          </div>
        )}
      </div>

      {/* Main Metric Value Area (Fixed height container for uniform alignment) */}
      <div className="h-12 flex items-center gap-2">
        {gradeCircle ? (
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center font-mono font-bold text-xl text-white shadow-nm-raised-sm flex-shrink-0"
              style={{ backgroundColor: gradeCircle.color }}
            >
              {gradeCircle.grade}
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-bold text-brand-heading leading-tight">
                {value}
              </span>
              <span className="text-[11px] text-brand-muted font-medium">
                Verified Accuracy
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-baseline gap-2">
            <span className="text-[34px] font-mono font-bold text-brand-heading tracking-tight tabular-nums leading-none">
              {typeof displayValue === 'number'
                ? displayValue.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                : displayValue}
            </span>
            {unit && (
              <span className="text-[14px] font-semibold text-brand-muted">
                {unit}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Consistent Footer Section */}
      <div className="mt-3 pt-2.5 border-t border-border/60 flex items-center justify-between text-xs min-h-[26px]">
        {delta ? (
          <div className="flex items-center gap-1.5">
            <span
              className={`font-semibold px-1.5 py-0.5 rounded font-mono text-[11px] ${
                delta.isDecrease ? 'bg-green-100 text-status-success' : 'bg-blue-100 text-brand-link'
              }`}
            >
              {delta.value}
            </span>
            <span className="text-brand-muted">{deltaLabel || 'vs previous period'}</span>
          </div>
        ) : subtext ? (
          <span className="text-brand-muted font-medium">{subtext}</span>
        ) : (
          <span className="text-brand-muted">Operational standard</span>
        )}
      </div>
    </Card>
  );
};
