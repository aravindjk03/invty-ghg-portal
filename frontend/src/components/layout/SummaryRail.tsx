import React, { useEffect, useState, useMemo } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { useGHG } from '../../context/GHGContext';
import { ghgService } from '../../services/ghgService';
import { formatIndianNumber } from '../../engine/unitConverter';
import { Download, FileCheck, ShieldCheck } from 'lucide-react';

export interface SummaryRailProps {
  onGenerateReport?: () => void;
  scopedTo?: 'all' | 'scope-1';
}

export const SummaryRail: React.FC<SummaryRailProps> = ({
  onGenerateReport,
  scopedTo = 'all',
}) => {
  const { summary, companyName, scope1Entries, scope2Entries, scope3Entries, addToast } = useGHG();
  const [animatedTotal, setAnimatedTotal] = useState(summary.totalEmissions);

  const allEntries = useMemo(() => {
    return [...scope1Entries, ...scope2Entries, ...scope3Entries];
  }, [scope1Entries, scope2Entries, scope3Entries]);

  const displayTotal = scopedTo === 'scope-1' ? summary.scope1 : summary.totalEmissions;

  // Animated count-up
  useEffect(() => {
    const start = animatedTotal;
    const end = displayTotal;
    const duration = 300;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const current = start + (end - start) * easeOut;

      setAnimatedTotal(Number(current.toFixed(1)));

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setAnimatedTotal(end);
      }
    };

    requestAnimationFrame(animate);
  }, [displayTotal]);

  // Compute percentages
  const s1Pct = summary.totalEmissions > 0 ? (summary.scope1 / summary.totalEmissions) * 100 : 0;
  const s2Pct = summary.totalEmissions > 0 ? (summary.scope2Location / summary.totalEmissions) * 100 : 0;
  const s3Pct = summary.totalEmissions > 0 ? (summary.scope3 / summary.totalEmissions) * 100 : 0;

  const gradeColor = {
    A: 'bg-grade-a',
    B: 'bg-grade-b',
    C: 'bg-grade-c',
    D: 'bg-grade-d',
    E: 'bg-grade-e',
  }[summary.dataQualityGrade];

  const handleDownloadXlsx = () => {
    ghgService.exportXlsx(
      allEntries,
      summary,
      `${companyName.replace(/\s+/g, '_')}_GHG_Inventory.xlsx`
    );
    addToast('success', 'Exported dataset as Excel audit log (XLSX)');
  };

  return (
    <Card
      elevation="raised-lg"
      className="sticky top-24 p-6 rounded-xl border border-border shadow-nm-raised-lg flex flex-col gap-5 select-none"
    >
      {/* 1. Header & Large Total */}
      <div aria-live="polite" className="flex flex-col">
        <span className="text-xs font-bold uppercase tracking-[0.08em] text-brand-muted">
          {scopedTo === 'scope-1' ? 'SCOPE 1 SUBTOTAL' : 'TOTAL EMISSIONS'}
        </span>
        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-[46px] font-mono font-bold text-brand-heading tracking-tight tabular-nums leading-none">
            {formatIndianNumber(animatedTotal, 1)}
          </span>
          <span className="text-[15px] font-semibold text-brand-muted">tCO₂e</span>
        </div>
        <span className="text-xs text-brand-muted mt-1">
          {scopedTo === 'scope-1'
            ? 'Direct emissions on site'
            : 'Operational inventory to date'}
        </span>
      </div>

      {/* 2. Horizontal Stacked Bar */}
      <div className="flex flex-col gap-2">
        <div className="w-full h-2.5 rounded-md bg-surface-sunken overflow-hidden flex shadow-nm-pressed border border-border">
          <div
            style={{ width: `${s1Pct}%` }}
            className="h-full bg-scope-1 transition-all duration-300"
            title={`Scope 1: ${s1Pct.toFixed(1)}%`}
          />
          <div
            style={{ width: `${s2Pct}%` }}
            className="h-full bg-scope-2 transition-all duration-300"
            title={`Scope 2: ${s2Pct.toFixed(1)}%`}
          />
          <div
            style={{ width: `${s3Pct}%` }}
            className="h-full bg-scope-3 transition-all duration-300"
            title={`Scope 3: ${s3Pct.toFixed(1)}%`}
          />
        </div>

        {/* Legend table */}
        <div className="flex flex-col gap-1.5 text-xs pt-1">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-medium text-brand-body">
              <span className="w-2 h-2 rounded bg-scope-1" />
              Scope 1 (Direct)
            </span>
            <span className="font-mono text-brand-heading font-semibold">
              {formatIndianNumber(summary.scope1)} t ({s1Pct.toFixed(0)}%)
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-medium text-brand-body">
              <span className="w-2 h-2 rounded bg-scope-2" />
              Scope 2 (Electricity)
            </span>
            <span className="font-mono text-brand-heading font-semibold">
              {formatIndianNumber(summary.scope2Location)} t ({s2Pct.toFixed(0)}%)
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-medium text-brand-body">
              <span className="w-2 h-2 rounded bg-scope-3" />
              Scope 3 (Value Chain)
            </span>
            <span className="font-mono text-brand-heading font-semibold">
              {formatIndianNumber(summary.scope3)} t ({s3Pct.toFixed(0)}%)
            </span>
          </div>
        </div>
      </div>

      <div className="border-t border-border" />

      {/* 3. Data Quality Grade */}
      <div className="flex items-center gap-4">
        <div
          className={`w-10 h-10 rounded-md ${gradeColor} flex items-center justify-center font-mono font-bold text-lg text-white border border-white/20 shadow-sm flex-shrink-0`}
        >
          {summary.dataQualityGrade}
        </div>
        <div className="flex flex-col">
          <span className="text-[11px] font-bold uppercase tracking-wider text-brand-muted">
            DATA QUALITY GRADE
          </span>
          <span className="text-xs text-brand-body font-medium mt-0.5">
            Secondary & proxy data with partial primary verification.
          </span>
        </div>
      </div>

      {/* 4. Coverage */}
      <div className="flex flex-col gap-1 text-xs">
        <span className="font-bold uppercase tracking-wider text-brand-muted text-[11px]">
          COVERAGE
        </span>
        <div className="flex items-center gap-1.5 text-brand-body font-medium">
          <ShieldCheck size={14} className="text-status-success" />
          <span>
            {summary.coverage.scopesCompleted} of {summary.coverage.totalScopes} scopes ·{' '}
            {summary.coverage.scope3CategoriesIncluded} of {summary.coverage.totalScope3Categories} Scope 3 categories
          </span>
        </div>
      </div>

      <div className="border-t border-border pt-1" />

      {/* 5. Primary & Secondary CTA */}
      <div className="flex flex-col gap-2.5">
        <Button
          variant="primary"
          fullWidth
          size="md"
          leftIcon={<FileCheck size={16} />}
          onClick={onGenerateReport}
          disabled={summary.totalEmissions <= 0}
        >
          Generate report
        </Button>

        <Button
          variant="ghost"
          fullWidth
          size="sm"
          leftIcon={<Download size={14} />}
          onClick={handleDownloadXlsx}
        >
          Download data (XLSX)
        </Button>
      </div>
    </Card>
  );
};
