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
import { co2ePerUnit, factorStatus, FactorStatusKind, isListed } from '../data/factorStatus';
import { useCatalogueMapState } from '../services/useCatalogueMap';
import { useGHG } from '../context/GHGContext';

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

  const { gwpSet } = useGHG();
  const { map, loading } = useCatalogueMapState();
  const statusOf = useMemo(() => {
    const cache = new Map<string, ReturnType<typeof factorStatus>>();
    return (source: CatalogueSource) => {
      let status = cache.get(source.activity_key);
      if (!status) {
        status = factorStatus(map, source);
        cache.set(source.activity_key, status);
      }
      return status;
    };
  }, [map]);
  const coverage = useMemo(
    () => catalogueCoverage(isListed, (source) => {
      const kind = statusOf(source).kind;
      return kind === 'published' || kind === 'method' || kind === 'auto';
    }),
    [statusOf],
  );

  const categories = useMemo(() => {
    const names = new Set<string>();
    CATALOGUE_SOURCES.forEach((source) => {
      if (isListed(source.activity_key) && (scope === 'all' || source.scope === scope)) {
        names.add(source.category_name);
      }
    });
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [scope]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return CATALOGUE_SOURCES.filter((source) => {
      if (!isListed(source.activity_key)) return false;
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
        <span className="whitespace-nowrap">
          <Badge variant={SCOPE_BADGE[row.scope] ?? 'default'}>{SCOPE_LABEL[row.scope] ?? row.scope}</Badge>
        </span>
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
      header: 'Value used',
      cell: (row) => <ValueCell status={statusOf(row)} gwpSet={gwpSet} loading={loading} />,
    },
    {
      header: 'Gases',
      cell: (row) => <span className="text-[12px] text-brand-muted">{row.gases || '—'}</span>,
    },
    {
      header: 'Published source',
      cell: (row) => (
        <span className="text-[12px] text-brand-body block max-w-[320px]">
          {statusOf(row).mapping?.source ?? row.factor_source ?? '—'}
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
              Every emission source the inventory can draw on, with the value the engine actually
              calculates with ({gwpSet}) and where it comes from. A source without a value says why,
              and what to use instead. Memo items are reported alongside the inventory but never
              counted in a scope total. Well-to-tank, transmission losses and biogenic CO₂ are not
              listed separately: the engine adds them to the rows that cause them.
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
                {loading ? 'checking the engine…' : `${coverage.verified} calculated by the engine`}
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

const KIND_LABEL: Record<FactorStatusKind, string> = {
  published: 'Published',
  method: 'IPCC method',
  auto: 'Automatic',
  supplier: 'Your supplier\'s figure',
  memo: 'Memo',
  choose: 'Use a specific row',
  not_calculated: 'Not calculated',
};

const KIND_CLASS: Record<FactorStatusKind, string> = {
  published: 'text-brand-body',
  method: 'text-brand-primary',
  auto: 'text-brand-primary',
  supplier: 'text-brand-body',
  memo: 'text-brand-muted',
  choose: 'text-brand-body',
  not_calculated: 'text-status-warning',
};

const formatNumber = (value: string) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return n.toLocaleString('en-IN', { maximumSignificantDigits: 6 });
};

/** The value the engine uses, or what stands in its place, with the reason. */
const ValueCell: React.FC<{
  status: ReturnType<typeof factorStatus>;
  gwpSet: 'AR5' | 'AR6';
  loading: boolean;
}> = ({ status, gwpSet, loading }) => {
  if (status.kind === 'published' && status.mapping) {
    const mapping = status.mapping;
    const co2e = co2ePerUnit(mapping, gwpSet);
    const perGas = mapping.values.filter((v) => v.gas !== 'CO2e');
    return (
      <div className="flex flex-col py-1.5 min-w-[200px] max-w-[300px]">
        {co2e !== undefined && (
          <span className="font-mono tabular-nums whitespace-nowrap text-brand-heading">
            {formatNumber(co2e)}
            <span className="text-brand-muted"> kgCO₂e/{mapping.unit}</span>
          </span>
        )}
        {perGas.length > 0 && (
          <span className="text-[11px] text-brand-muted leading-snug">
            {perGas.map((v) => `${v.gas} ${formatNumber(v.value)} kg`).join(' · ')} per {mapping.unit}
          </span>
        )}
        {mapping.values[0]?.reference && (
          <span className="text-[11px] text-brand-muted leading-snug line-clamp-2"
                title={mapping.values[0].reference}>
            {mapping.values[0].reference}
          </span>
        )}
      </div>
    );
  }
  if (loading && status.kind === 'not_calculated') {
    return <span className="text-[12px] text-brand-muted">Loading…</span>;
  }
  return (
    <div className="flex flex-col py-1.5 min-w-[200px] max-w-[300px]">
      <span className={`text-[12px] font-semibold ${KIND_CLASS[status.kind]}`}>
        {KIND_LABEL[status.kind]}
      </span>
      <span className="text-[11px] text-brand-muted leading-snug">{status.text}</span>
    </div>
  );
};
