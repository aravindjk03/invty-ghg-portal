import React, { useMemo, useState } from 'react';
import { useGHG } from '../context/GHGContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import {
  ArrowLeft,
  ShieldCheck,
  FileCheck,
  Download,
  AlertTriangle,
  Search,
} from 'lucide-react';
import { ActivityEntry } from '../types/ghg';

interface AuditTrailPageProps {
  onNavigate: (page: string) => void;
}

/**
 * The calculation record: every row that produced a figure in this inventory,
 * with the factor that calculated it and where that factor came from.
 *
 * This page used to display a blockchain-style ledger of SHA-256 blocks with a
 * green "Cryptographic Integrity Verified" banner. None of it was real — the
 * hashes were literals that did not chain, the actors were invented, and the
 * verification result was pre-set in component state rather than computed. A
 * reporter could have shown that screen to an assurer as evidence.
 *
 * What an assurer actually needs is here instead, and all of it is real: the
 * activity figure, the factor applied, the published source of that factor, and
 * what the engine could not calculate and why. Tamper-evident sealing is a
 * server-side feature and is described as not yet available rather than mocked.
 */

type RecordRow = {
  id: string;
  scope: 'Scope 1' | 'Scope 2' | 'Scope 3';
  facility: string;
  source: string;
  activity: string;
  factor: string;
  factorSource: string;
  region?: string;
  tco2e?: number;
  owner?: string;
  evidence?: string;
  supplied: boolean;
  suppliedSource?: string;
  updatedAt: string;
  calculated: boolean;
};

const scopeLabel = {
  'scope-1': 'Scope 1',
  'scope-2': 'Scope 2',
  'scope-3': 'Scope 3',
} as const;

function toRow(entry: ActivityEntry, scope: keyof typeof scopeLabel): RecordRow {
  const supplied = entry.customFactorOverride != null;
  // Only the factor the engine actually used is shown. The catalogue ships a
  // display value of its own for the row picker, and printing that beside a
  // total it did not produce is how a report comes to state two numbers.
  const factorValue = supplied ? entry.customFactorOverride : entry.engineFactorValue;
  const factorUnit = entry.engineFactorUnit || `kgCO₂e / ${entry.unit}`;

  return {
    id: entry.id,
    scope: scopeLabel[scope],
    facility: entry.facility,
    source: entry.fuelOrSource,
    activity: `${entry.amount.toLocaleString()} ${entry.unit}`,
    factor: factorValue != null ? `${factorValue} ${factorUnit}` : '—',
    factorSource: supplied
      ? 'Supplied by the reporting company'
      : entry.engineFactorSource || 'No published factor chosen',
    region: entry.engineRegion,
    tco2e: entry.calculatedTco2e,
    owner: entry.dataOwner,
    evidence: entry.evidenceFile,
    supplied,
    suppliedSource: entry.customFactorSource,
    updatedAt: entry.updatedAt,
    calculated: factorValue != null,
  };
}

function csvCell(value: string | number | undefined): string {
  const text = value == null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const AuditTrailPage: React.FC<AuditTrailPageProps> = ({ onNavigate }) => {
  const {
    companyName,
    reportingPeriod,
    boundaryApproach,
    gwpSet,
    engineStatus,
    scope1Entries,
    scope2Entries,
    scope3Entries,
    addToast,
  } = useGHG();

  const [query, setQuery] = useState('');

  const rows = useMemo<RecordRow[]>(
    () => [
      ...scope1Entries.map((e) => toRow(e, 'scope-1')),
      ...scope2Entries.map((e) => toRow(e, 'scope-2')),
      ...scope3Entries.map((e) => toRow(e, 'scope-3')),
    ],
    [scope1Entries, scope2Entries, scope3Entries]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.facility, r.source, r.factorSource, r.scope, r.owner].some((field) =>
        field?.toLowerCase().includes(q)
      )
    );
  }, [rows, query]);

  const uncalculated = rows.filter((r) => !r.calculated);
  const supplied = rows.filter((r) => r.supplied);
  const unsourcedSupplied = supplied.filter((r) => !r.suppliedSource);

  const handleExport = () => {
    const header = [
      'Scope', 'Facility', 'Source', 'Activity', 'Factor applied', 'Factor source',
      'Region', 'tCO2e', 'Data owner', 'Evidence', 'Factor supplied by company',
      'Supplied factor citation', 'Last changed',
    ];
    const lines = [
      `# Calculation record — ${companyName}`,
      `# Reporting period: ${reportingPeriod}`,
      `# Consolidation approach: ${boundaryApproach}`,
      `# Global warming potentials: ${gwpSet}`,
      engineStatus.runId
        ? `# Calculation reference: ${engineStatus.runId}`
        : '# Calculation reference: not calculated',
      `# Exported: ${new Date().toISOString()}`,
      header.join(','),
      ...rows.map((r) =>
        [
          r.scope, r.facility, r.source, r.activity, r.factor, r.factorSource,
          r.region ?? '', r.tco2e?.toFixed(6) ?? '', r.owner ?? '', r.evidence ?? '',
          r.supplied ? 'yes' : 'no', r.suppliedSource ?? '', r.updatedAt,
        ].map(csvCell).join(',')
      ),
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeName = companyName.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'inventory';
    link.href = url;
    link.download = `${safeName}-calculation-record.csv`;
    link.click();
    URL.revokeObjectURL(url);
    addToast('success', `Calculation record exported — ${rows.length} rows`);
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-28">
      <div className="flex items-center justify-between mb-6">
        <button
          type="button"
          onClick={() => onNavigate('dashboard')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-primary hover:text-brand-heading transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Dashboard
        </button>

        <div className="flex items-center gap-2">
          <Badge variant="default">{gwpSet}</Badge>
          <Badge variant="default">{boundaryApproach}</Badge>
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-brand-heading tracking-tight flex items-center gap-2.5">
            <FileCheck size={24} className="text-brand-primary" />
            Calculation record
          </h1>
          <p className="text-sm text-brand-muted mt-1 max-w-3xl">
            Every row that produced a figure in this inventory, the factor applied to
            it, and the published source of that factor. This is what a verifier
            needs to re-perform the calculation — one row at a time, or the whole
            register as a spreadsheet.
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={handleExport}
          disabled={rows.length === 0}
          leftIcon={<Download size={14} />}
        >
          Export register (CSV)
        </Button>
      </div>

      {/* What produced these figures */}
      <Card className="p-5 mb-6 bg-surface-raised border border-border shadow-nm-raised">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div>
            <div className="text-brand-muted uppercase tracking-wider text-[10px] font-bold mb-1">Organisation</div>
            <div className="text-brand-heading font-semibold">{companyName}</div>
          </div>
          <div>
            <div className="text-brand-muted uppercase tracking-wider text-[10px] font-bold mb-1">Reporting period</div>
            <div className="text-brand-heading font-semibold">{reportingPeriod}</div>
          </div>
          <div>
            <div className="text-brand-muted uppercase tracking-wider text-[10px] font-bold mb-1">Rows in register</div>
            <div className="text-brand-heading font-semibold">
              {rows.length} total · {rows.length - uncalculated.length} calculated
            </div>
          </div>
          <div>
            <div className="text-brand-muted uppercase tracking-wider text-[10px] font-bold mb-1">Calculation reference</div>
            <div className="text-brand-heading font-semibold font-mono">
              {engineStatus.state === 'calculated' && engineStatus.runId
                ? engineStatus.runId.slice(0, 16)
                : 'Not calculated yet'}
            </div>
          </div>
        </div>
      </Card>

      {/* Honest statement of what this record is and is not */}
      <Card className="p-4 mb-6 bg-surface-raised border border-border shadow-nm-raised">
        <div className="flex items-start gap-3">
          <ShieldCheck size={18} className="text-brand-primary flex-shrink-0 mt-0.5" />
          <div className="text-xs text-brand-muted leading-relaxed space-y-1.5">
            <p>
              <strong className="text-brand-heading">What this record proves.</strong> Each
              row below names the activity figure entered, the emission factor the
              engine applied to it, and the published dataset that factor came from.
              A verifier can take any row and reproduce its tCO₂e independently.
            </p>
            <p>
              <strong className="text-brand-heading">What it does not.</strong> These
              rows are not sealed against later change. Tamper-evident history —
              a signed, append-only log of who changed which figure and when — needs
              the hosted service and is not available in the browser-only trial.
              Until then, treat an exported register as a point-in-time copy and keep
              it with your working papers.
            </p>
          </div>
        </div>
      </Card>

      {/* Exceptions first: what a verifier would ask about */}
      {(uncalculated.length > 0 || supplied.length > 0) && (
        <Card className="p-4 mb-6 bg-surface-raised border border-border shadow-nm-raised">
          <h2 className="text-xs font-bold text-brand-heading uppercase tracking-wider mb-2.5 flex items-center gap-2">
            <AlertTriangle size={14} className="text-amber-600" />
            Exceptions
          </h2>
          <ul className="text-xs text-brand-muted space-y-1.5">
            {uncalculated.length > 0 && (
              <li>
                <strong className="text-brand-heading">{uncalculated.length} row
                {uncalculated.length === 1 ? '' : 's'}</strong> name no factor the engine
                could apply, so they contribute nothing to any total and are listed below
                with an em dash in place of a factor.
              </li>
            )}
            {supplied.length > 0 && (
              <li>
                <strong className="text-brand-heading">{supplied.length} row
                {supplied.length === 1 ? '' : 's'}</strong> use a factor supplied by the
                reporting company rather than a published dataset. Each one carries the
                citation it was accepted against.
              </li>
            )}
            {unsourcedSupplied.length > 0 && (
              <li className="text-amber-700">
                <strong>{unsourcedSupplied.length}</strong> supplied factor
                {unsourcedSupplied.length === 1 ? ' has' : 's have'} no citation recorded.
                An unsourced factor cannot be verified — add the contract, certificate or
                EPD it came from before issuing a report.
              </li>
            )}
            {engineStatus.excludedCount > 0 && (
              <li>
                The engine excluded <strong className="text-brand-heading">{engineStatus.excludedCount}</strong>{' '}
                line{engineStatus.excludedCount === 1 ? '' : 's'} from the totals. The
                Methods page states the reason for each.
              </li>
            )}
          </ul>
        </Card>
      )}

      {/* The register */}
      <Card className="bg-surface-raised border border-border shadow-nm-raised overflow-hidden mb-6">
        <div className="px-5 py-3.5 border-b border-border bg-surface-sunken flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-xs font-bold text-brand-heading uppercase tracking-wider">
            Activity register — {visible.length} of {rows.length} rows
          </h2>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Search size={13} className="text-brand-muted flex-shrink-0" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by facility, source, factor or owner"
              className="w-full sm:w-72 h-8 px-2.5 text-xs rounded-md border border-border bg-surface text-brand-heading outline-none focus:border-brand-primary"
            />
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="p-8 text-center text-xs text-brand-muted">
            No activity rows yet. Add Scope 1, 2 or 3 data and every calculated row
            appears here with the factor that produced it.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-surface-sunken/60 border-b border-border text-brand-muted uppercase text-[10px]">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Scope</th>
                  <th className="px-4 py-2.5 font-semibold">Facility</th>
                  <th className="px-4 py-2.5 font-semibold">Source</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Activity</th>
                  <th className="px-4 py-2.5 font-semibold">Factor applied</th>
                  <th className="px-4 py-2.5 font-semibold">Factor source</th>
                  <th className="px-4 py-2.5 font-semibold text-right">tCO₂e</th>
                  <th className="px-4 py-2.5 font-semibold">Last changed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((r) => (
                  <tr key={`${r.scope}-${r.id}`} className="hover:bg-blue-50/30 transition-colors align-top">
                    <td className="px-4 py-3 whitespace-nowrap font-semibold text-brand-heading">{r.scope}</td>
                    <td className="px-4 py-3 text-brand-body">{r.facility}</td>
                    <td className="px-4 py-3 text-brand-body max-w-[16rem]">
                      {r.source}
                      {r.owner && (
                        <span className="block text-[10px] text-brand-muted mt-0.5">Owner: {r.owner}</span>
                      )}
                      {r.evidence && (
                        <span className="block text-[10px] text-brand-muted mt-0.5">Evidence: {r.evidence}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums whitespace-nowrap text-brand-heading">
                      {r.activity}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-brand-heading whitespace-nowrap">
                      {r.factor}
                    </td>
                    <td className="px-4 py-3 text-brand-muted max-w-[18rem]">
                      {r.factorSource}
                      {r.region && <span className="text-[10px] block mt-0.5">Region: {r.region}</span>}
                      {r.supplied && (
                        r.suppliedSource ? (
                          <span className="text-[10px] block mt-0.5">Citation: {r.suppliedSource}</span>
                        ) : (
                          <span className="text-[10px] block mt-0.5 text-amber-700 font-semibold">
                            No citation recorded
                          </span>
                        )
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums whitespace-nowrap">
                      {r.calculated && r.tco2e != null ? (
                        r.tco2e.toFixed(3)
                      ) : (
                        <span className="text-brand-muted" title="No factor the engine could apply">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-brand-muted whitespace-nowrap">
                      {new Date(r.updatedAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default AuditTrailPage;
