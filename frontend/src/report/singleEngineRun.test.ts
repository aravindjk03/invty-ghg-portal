import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * One inventory, one calculation.
 *
 * ReportPreviewPage used to call useEngineInventory a second time — on a
 * different GWP basis, with the reporting year scraped out of the display
 * label by regular expression, and without the T&D-loss, well-to-tank and FX
 * inputs the real run is given. It then printed that second run's calculation
 * reference beside totals the first run had produced, so a verifier checking
 * the reference against the figures was checking two different calculations.
 *
 * The context owns the only run. These tests fail if a second one reappears.
 */

const src = (path: string) => readFileSync(join(__dirname, '..', path), 'utf8');

describe('a single engine run', () => {
  it('is started by the context and nowhere else', () => {
    const callers = ['context/GHGContext.tsx', 'pages/ReportPreviewPage.tsx']
      .filter((path) => /useEngineInventory\s*\(/.test(src(path)));
    expect(callers).toEqual(['context/GHGContext.tsx']);
  });

  it('does not scrape the reporting year out of a display label', () => {
    // reportingPeriod.ts was written to remove exactly this.
    expect(src('pages/ReportPreviewPage.tsx')).not.toMatch(/reportingPeriod\.match\(/);
  });

  it('reaches the report page through the context', () => {
    expect(src('context/GHGContext.tsx')).toMatch(/engine: EngineInventory;/);
    expect(src('pages/ReportPreviewPage.tsx')).toMatch(/engine[,\s]/);
  });
});

describe('claims the tool can stand behind', () => {
  it('does not report a document as traceable when only its name was kept', () => {
    // Picking a file never stored it. The export said "Traceable: Yes".
    expect(src('report/export/workbook.ts')).not.toMatch(/Traceable:/);
  });

  it('does not invent a completeness percentage', () => {
    const hub = src('pages/ScopeHubPage.tsx');
    expect(hub).not.toMatch(/s1Progress|s2Progress/);
  });

  it('reads the Scope 3 category matrix from the inventory', () => {
    const hub = src('pages/ScopeHubPage.tsx');
    expect(hub).toMatch(/ALL_15_CATEGORIES/);
    // the old literal statuses
    expect(hub).not.toMatch(/status: 'screened'/);
  });
});
