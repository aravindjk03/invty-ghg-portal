/**
 * The whole emission factor catalogue on one screen.
 *
 * Each workspace row only offers the sources that belong to its scope and
 * category, which is right for data entry but means nowhere showed the library
 * as a whole. This page lists every entry, including the memo items that never
 * enter a scope total, so a reviewer can see exactly what the inventory draws on.
 */
import React, { useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, Search } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge, BadgeVariant } from '../components/ui/Badge';
import { Table, Column } from '../components/ui/Table';
import { CATALOGUE_SOURCES, CatalogueSource } from '../data/catalogueData';
import { catalogueCoverage } from '../data/factorCatalogue';

export interface FactorLibraryPageProps {
  onNavigate: (page: string) => void;
}

const SCOPE_LABEL: Record<string, string> = {
  '1': 'Scope 1',
  '2': 'Scope 2',
  '3': 'Scope 3',
  memo: 'Memo',
};

const SCOPE_BADGE: Record<string, BadgeVariant> = {
  '1': 'scope1',
  '2': 'scope2',
  '3': 'scope3',
  memo: 'biogenic',
};

const SCOPE_ORDER = ['1', '2', '3', 'memo'];

const selectClass =
  'h-10 rounded-md border border-border bg-surface-raised px-3 text-[13px] text-brand-body '
  + 'focus-visible:outline-2 focus-visible:outline-blue-600';

export const FactorLibraryPage: React.FC<FactorLibraryPageProps> = ({ onNavigate }) => {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('all');
  const [category, setCategory] = useState('all');

  const coverage = useMemo(() => catalogueCoverage(), []);

  const categories = useMemo(() => {
    const names = new Set<string>();
    CATALOGUE_SOURCES.forEach((source) => {
      if (scope === 'all' || source.scope === scope) names.add(source.category_name);
    });
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [scope]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return CATALOGUE_SOURCES.filter((source) => {
      if (scope !== 'all' && source.scope !== scope) return false;
      if (category !== 'all' && source.category_name !== category) return false;
      if (!needle) return true;
      return [source.display_name, source.group, source.category_name, source.factor_source, source.activity_key]
        .some((text) => text?.toLowerCase().includes(needle));
    }).sort((a, b) =>
      SCOPE_ORDER.indexOf(a.scope) - SCOPE_ORDER.indexOf(b.scope)
      || a.category_name.localeCompare(b.category_name)
      || a.display_name.localeCompare(b.display_name));
  }, [query, scope, category]);

  const columns: Column<CatalogueSource>[] = [
    {
      header: 'Source',
      cell: (row) => (
        <div className="flex flex-col py-1.5 min-w-[220px]">
          <span className="font-medium text-brand-heading">{row.display_name}</span>
          <span className="text-[11px] text-brand-muted">{row.group}</span>
        </div>
      ),
    },
    {
      header: 'Scope',
      cell: (row) => (
        <Badge variant={SCOPE_BADGE[row.scope] ?? 'default'}>{SCOPE_LABEL[row.scope] ?? row.scope}</Badge>
      ),
    },
    {
      header: 'Category',
      cell: (row) => (
        <span className="text-[13px] whitespace-nowrap">
          {row.ghg_category ? `${row.ghg_category} · ` : ''}{row.category_name}
        </span>
      ),
    },
    {
      header: 'Factor',
      numeric: true,
      cell: (row) => (row.verified ? (
        <span className="font-mono tabular-nums whitespace-nowrap">
          {row.factorValue.toLocaleString('en-IN', { maximumFractionDigits: 6 })}
          <span className="text-brand-muted"> kgCO₂e/{row.default_unit}</span>
        </span>
      ) : (
        <span className="text-[12px] text-brand-muted whitespace-nowrap">No published value yet</span>
      )),
    },
    {
      header: 'Gases',
      cell: (row) => <span className="text-[12px] text-brand-muted">{row.gases || '—'}</span>,
    },
    {
      header: 'Published source',
      cell: (row) => (
        <span className="text-[12px] text-brand-body block max-w-[320px]">
          {row.factor_source || '—'}
          {row.publicationYear ? ` (${row.publicationYear})` : ''}
        </span>
      ),
    },
  ];

  return (
    <div className="max-w-[1440px] mx-auto px-6 py-8 pb-32">
      <div className="mb-5">
        <Button variant="ghost" size="sm" onClick={() => onNavigate('scope-hub')}
                leftIcon={<ArrowLeft size={15} />}>
          All scopes
        </Button>
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-3xl">
            <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-brand-muted flex items-center gap-1.5">
              <BookOpen size={14} /> EMISSION FACTOR CATALOGUE
            </span>
            <h1 className="text-[32px] font-bold text-brand-heading tracking-tight mt-0.5">
              Factor library
            </h1>
            <p className="text-[15px] text-brand-muted mt-1">
              Every emission source the inventory can draw on, with its published factor and
              where it comes from. Memo items are listed too: they are reported alongside the
              inventory but never counted in a scope total.
            </p>
          </div>

          <Card className="px-5 py-4 min-w-[260px]">
            <span className="text-[11px] font-bold uppercase tracking-wider text-brand-muted">
              Sources in the library
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-[28px] font-bold text-brand-heading tabular-nums leading-none">
                {coverage.total}
              </span>
              <span className="text-[13px] font-medium text-brand-muted">
                {coverage.verified} with a published value
              </span>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[12px] text-brand-muted">
              {SCOPE_ORDER.filter((key) => coverage.byScope[key]).map((key) => (
                <span key={key}>{SCOPE_LABEL[key]}: {coverage.byScope[key].total}</span>
              ))}
            </div>
          </Card>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="relative flex-1 min-w-[240px]">
            <span className="sr-only">Search the library</span>
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by fuel, activity, category or source (e.g. diesel, CEA, R-134a)"
              className={`${selectClass} w-full pl-9`}
            />
          </label>
          <label>
            <span className="sr-only">Scope</span>
            <select
              value={scope}
              onChange={(e) => { setScope(e.target.value); setCategory('all'); }}
              className={selectClass}
            >
              <option value="all">All scopes</option>
              {SCOPE_ORDER.filter((key) => coverage.byScope[key]).map((key) => (
                <option key={key} value={key}>{SCOPE_LABEL[key]} ({coverage.byScope[key].total})</option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Category</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectClass}>
              <option value="all">All categories</option>
              {categories.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        </div>

        <p className="text-[13px] text-brand-muted -mt-2" aria-live="polite">
          Showing {rows.length} of {coverage.total} sources
        </p>

        {rows.length > 0 ? (
          <Table columns={columns} data={rows} keyExtractor={(row) => row.activity_key} />
        ) : (
          <Card className="px-5 py-10 text-center text-[14px] text-brand-muted">
            No source matches that search. Clear the filters to see all {coverage.total}.
          </Card>
        )}
      </div>
    </div>
  );
};
