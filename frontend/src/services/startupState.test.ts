import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

/**
 * A normal first visit must not read as a failure, and a phone must not lose
 * a feature the desktop has.
 */
describe('starting up', () => {
  it('tells apart "the engine is still loading" from "no row names a factor"', () => {
    const ctx = src('context/GHGContext.tsx');
    expect(ctx).toMatch(/catalogueLoading/);
    // The loading branch must come before the nothing_mapped branch.
    expect(ctx.indexOf("state: 'starting'")).toBeLessThan(ctx.indexOf("state: 'nothing_mapped'"));
  });

  it('has a visible starting state in the status bar', () => {
    expect(src('components/ui/EngineStatusBar.tsx')).toMatch(/Starting the calculation engine/);
  });

  it('shows the engine status on the pages that print figures', () => {
    for (const page of ['pages/DashboardPage.tsx', 'pages/AuditTrailPage.tsx']) {
      expect(src(page)).toMatch(/<EngineStatusBar \/>/);
    }
  });
});

describe('on a phone', () => {
  it('can still reach every export format', () => {
    // The picker was `hidden md:flex` while the handler still read its value,
    // so below 768px only PDF was reachable.
    const dash = src('pages/DashboardPage.tsx');
    expect(dash).toMatch(/md:hidden[\s\S]{0,400}<select/);
  });

  it('does not block selecting the numbers on the page', () => {
    expect(src('pages/DashboardPage.tsx')).not.toMatch(/pb-32 space-y-8 select-none/);
    expect(src('components/layout/SummaryRail.tsx')).not.toMatch(/gap-5 select-none/);
  });

  it('uses a grid class Tailwind actually ships', () => {
    // grid-cols-15 does not exist; the 15-tile strip never went wide.
    expect(src('pages/Scope3Page.tsx')).not.toMatch(/md:grid-cols-15\b/);
  });
});

describe('printing', () => {
  it('has a print stylesheet that breaks pages', () => {
    const css = src('index.css');
    expect(css).toMatch(/@media print/);
    expect(css).toMatch(/\.page-break-after[\s\S]{0,120}break-after: page/);
  });

  it('draws the watermark inside each sheet, where an export can see it', () => {
    // It was one position:fixed element outside every section, so the per
    // section capture never included it.
    expect(src('report/ReportDocument.tsx')).not.toMatch(/fixed inset-0/);
    expect(src('report/sections/primitives.tsx')).toMatch(/WatermarkOpacity/);
  });
});
