import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PAGES = join(__dirname, '..', 'pages');
const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const routedPages = readdirSync(PAGES).filter((f) => f.endsWith('.tsx'));

/**
 * The product is for reporters, not for the people who built it. These pin the
 * phrases that had leaked out of the engineering notebook and onto the screen.
 */
describe('no engineering vocabulary on screen', () => {
  it('names no internal defect-tracker rule', () => {
    expect(src('pages/SettingsPage.tsx')).not.toMatch(/Bug Guard/i);
  });

  it('does not explain floating-point representation to a reporter', () => {
    expect(src('components/layout/TopBar.tsx')).not.toMatch(/IEEE 754/);
  });

  it('keeps the worst of the jargon headings out of the pages', () => {
    const banned = [
      'Decarbonisation Scenario Modelling',
      'Gross operational boundary distribution',
      'Source Concentration',
      'Matrix Screening Status',
      'Indirect Purchased Energy Workspace',
      'Value Chain Upstream & Downstream Workspace',
    ];
    for (const page of routedPages) {
      const text = readFileSync(join(PAGES, page), 'utf8');
      for (const phrase of banned) {
        expect(`${page}: ${text.includes(phrase)}`).toBe(`${page}: false`);
      }
    }
  });
});

describe('the app asks who is using it', () => {
  it('offers the three roles at first run', () => {
    const setup = src('components/WorkspaceSetup.tsx');
    expect(setup).toMatch(/Your role/);
    expect(setup).toMatch(/I run or work at the site/);
    expect(setup).toMatch(/I handle sustainability or ESG reporting/);
    expect(setup).toMatch(/I am reviewing or assuring this inventory/);
  });

  it('remembers the role and exposes a plain-language switch', () => {
    const ctx = src('context/GHGContext.tsx');
    expect(ctx).toMatch(/_ROLE/);
    expect(ctx).toMatch(/plainLanguage/);
  });

  it('records who entered a row, so a reviewer knows who to ask', () => {
    // dataOwner existed and the calculation record printed it, but nothing
    // ever filled it, so the column was always blank.
    expect(src('context/GHGContext.tsx')).toMatch(/dataOwner: currentUser\?\.name/);
  });
});

describe('one empty state, not five', () => {
  it('uses the shared component rather than hand-rolled panels', () => {
    for (const page of ['pages/MethodsPage.tsx', 'pages/Scope2Page.tsx', 'pages/AuditTrailPage.tsx']) {
      expect(src(page)).toMatch(/<EmptyState/);
    }
    expect(src('pages/MethodsPage.tsx')).not.toMatch(/No method sources recorded/);
    expect(src('pages/AuditTrailPage.tsx')).not.toMatch(/No activity rows yet\. Add Scope/);
  });
});
