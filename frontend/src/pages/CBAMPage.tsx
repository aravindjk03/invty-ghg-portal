/**
 * CBAM calculator: embedded emissions of goods exported to the EU (operator),
 * and the certificates an EU importer must surrender (declarant), with a report
 * of its own. Values come only from the Commission's published files
 * (src/cbam/data, built by scripts/ingest_cbam.py) and from what the user enters.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Download, FileCode, FileSpreadsheet, FileText, Globe, Loader2 } from 'lucide-react';
import { useGHG } from '../context/GHGContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { LeadGateModal } from '../components/ui/LeadGateModal';
import { hasProfile } from '../services/leadService';
import { reportUsage } from '../services/usageReporter';
import { ghgService } from '../services/ghgService';
import { safeFilename } from '../lib/utils';
import { CbamData, formatCn, loadCbamData } from '../cbam/data';
import { calculateExporter } from '../cbam/calculate';
import { calculateImporter } from '../cbam/importer';
import { ExporterForm } from '../cbam/ExporterForm';
import { ImporterForm } from '../cbam/ImporterForm';
import { GoodsDatalist, SECTOR_LABEL } from '../cbam/fields';
import { CbamState, loadState, saveState } from '../cbam/state';
import { fmt, pctOf } from '../cbam/num';
import { CbamReport } from '../cbam/report/CbamReport';
import { buildExporterWorkbook, buildImporterWorkbook, downloadWorkbook } from '../cbam/export/communicationWorkbook';
import { downloadText, exporterXml, importerXml, toJson } from '../cbam/export/dataExport';
import type { Note, Role } from '../cbam/model';

type View = 'inputs' | 'results' | 'report';
type ExportKind = 'pdf' | 'xlsx' | 'xml' | 'json';

export const CBAMPage: React.FC<{ onNavigate: (page: string) => void }> = ({ onNavigate }) => {
  const { companyName, summary, reportingPeriod, addToast } = useGHG();
  const [data, setData] = useState<CbamData | null>(null);
  const [loadError, setLoadError] = useState<string>();
  const [state, setState] = useState<CbamState>(() => loadState(companyName));
  const [view, setView] = useState<View>('inputs');
  const [busy, setBusy] = useState(false);
  const [gate, setGate] = useState<ExportKind | null>(null);
  const generatedAt = useMemo(() => new Date(), [view]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadCbamData().then(setData).catch(() => setLoadError('The CBAM tables could not be loaded. Check your connection and reload.'));
  }, []);
  useEffect(() => { saveState(state); }, [state]);

  const exporterResult = useMemo(() => (data ? calculateExporter(data, state.exporter) : null), [data, state.exporter]);
  const importerResult = useMemo(() => (data ? calculateImporter(data, state.importer) : null), [data, state.importer]);
  const role = state.role;
  const setRole = (r: Role) => setState((s) => ({ ...s, role: r }));

  const baseName = role === 'exporter'
    ? `CBAM_${state.exporter.installation.name || companyName || 'Installation'}_${state.exporter.installation.year}`
    : `CBAM_Certificates_${state.importer.declarant || 'Declarant'}_${state.importer.year}`;

  const runExport = async (kind: ExportKind) => {
    if (!data || !exporterResult || !importerResult) return;
    try {
      if (kind === 'pdf') {
        if (view !== 'report') { setView('report'); await new Promise((r) => setTimeout(r, 300)); }
        setBusy(true);
        await ghgService.generatePdf('cbam-report-container', safeFilename(`${baseName}_Report.pdf`));
      } else if (kind === 'xlsx') {
        const book = role === 'exporter'
          ? buildExporterWorkbook(data, state.exporter, exporterResult)
          : buildImporterWorkbook(data, state.importer, importerResult);
        downloadWorkbook(book, `${baseName}.xlsx`);
      } else if (kind === 'xml') {
        const xml = role === 'exporter' ? exporterXml(data, state.exporter, exporterResult) : importerXml(data, state.importer, importerResult);
        downloadText(xml, safeFilename(`${baseName}.xml`), 'application/xml');
      } else {
        const json = role === 'exporter'
          ? toJson('operator', state.exporter, exporterResult, data)
          : toJson('declarant', state.importer, importerResult, data);
        downloadText(json, safeFilename(`${baseName}.json`), 'application/json');
      }
      addToast('success', 'CBAM file downloaded');
      reportUsage('report_export');
    } catch {
      addToast('error', 'The file could not be created. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const requestExport = (kind: ExportKind) => {
    if (!hasProfile()) { setGate(kind); return; }
    void runExport(kind);
  };

  if (loadError) return <div className="max-w-3xl mx-auto px-4 py-16 text-[14px] text-red-700">{loadError}</div>;
  if (!data || !exporterResult || !importerResult) {
    return <div className="max-w-3xl mx-auto px-4 py-24 flex items-center gap-2 text-brand-muted"><Loader2 size={16} className="animate-spin" /> Loading the EU CBAM tables…</div>;
  }

  const notes: Note[] = role === 'exporter'
    ? [...exporterResult.notes, ...exporterResult.processes.flatMap((p) => p.notes.map((n) => ({ ...n, text: `${p.name}: ${n.text}` })))]
    : [...importerResult.notes, ...importerResult.lines.flatMap((l) => (l.problem ? [{ level: 'warning' as const, text: `${l.name || formatCn(l.cn) || 'Goods line'}: ${l.problem}` }] : []))];

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-28">
      <GoodsDatalist data={data} />
      <button type="button" onClick={() => onNavigate('scope-hub')} className="inline-flex items-center gap-1.5 text-[13px] text-brand-muted hover:text-brand-heading mb-3">
        <ArrowLeft size={14} /> Back
      </button>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div className="min-w-0">
          <span className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-brand-link flex items-center gap-1.5">
            <Globe size={13} /> EU Carbon Border Adjustment Mechanism · definitive period
          </span>
          <h1 className="text-[26px] sm:text-[30px] font-bold text-brand-heading tracking-tight">CBAM calculator</h1>
          <p className="text-[13px] text-brand-muted max-w-2xl mt-1">
            Embedded emissions of cement, iron and steel, aluminium, fertilisers, hydrogen and electricity, by the Commission's method,
            with its published default values and benchmarks. Its own report, separate from the GHG inventory.
          </p>
        </div>
        <SegmentedControl value={role} onChange={(v) => setRole(v as Role)} options={[
          { value: 'exporter', label: 'I export to the EU' },
          { value: 'importer', label: 'I import into the EU' },
        ]} />
      </div>

      <nav className="flex gap-1 border-b border-border mb-5 overflow-x-auto" aria-label="CBAM steps">
        {([['inputs', 'Enter data'], ['results', 'Results'], ['report', 'Report']] as Array<[View, string]>).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setView(k)}
            className={`px-3 py-2 text-[13px] font-semibold whitespace-nowrap border-b-2 -mb-px ${view === k ? 'border-blue-600 text-blue-700' : 'border-transparent text-brand-muted hover:text-brand-heading'}`}>
            {label}
          </button>
        ))}
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 min-w-0">
          {view === 'inputs' && (role === 'exporter'
            ? <ExporterForm data={data} value={state.exporter} onChange={(e) => setState((s) => ({ ...s, exporter: e }))}
                inventory={{ scope1: summary.scope1, period: reportingPeriod }} />
            : <ImporterForm data={data} value={state.importer} result={importerResult} onChange={(i) => setState((s) => ({ ...s, importer: i }))} />)}

          {view === 'results' && (role === 'exporter' ? <ExporterResults result={exporterResult} /> : <ImporterResults result={importerResult} />)}

          {view === 'report' && (
            <div id="cbam-report-container" className="min-w-0 overflow-x-auto">
              {role === 'exporter'
                ? <CbamReport role="exporter" data={data} input={state.exporter} result={exporterResult} generatedAt={generatedAt} />
                : <CbamReport role="importer" data={data} input={state.importer} result={importerResult} generatedAt={generatedAt} />}
            </div>
          )}
        </div>

        <aside className="lg:col-span-4 flex flex-col gap-4 lg:sticky lg:top-20">
          <Card className="p-4">
            <h2 className="text-[13px] font-bold text-brand-heading mb-2">{role === 'exporter' ? 'Embedded emissions' : 'Certificates'}</h2>
            {role === 'exporter' ? (
              <ul className="flex flex-col gap-2">
                {exporterResult.processes.flatMap((p) => p.products).map((g) => (
                  <li key={g.id} className="flex items-baseline justify-between gap-3 text-[12.5px]">
                    <span className="truncate text-brand-body">{g.name || formatCn(g.cn) || 'Product'}</span>
                    <span className="font-mono font-semibold text-brand-heading whitespace-nowrap">{fmt(g.seeCounted, 3)} t/t</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-[11px] text-brand-muted">Certificates</p><p className="font-mono text-[18px] font-bold text-brand-heading">{fmt(importerResult.totalCertificates, 1)}</p></div>
                <div><p className="text-[11px] text-brand-muted">Cost{importerResult.costComplete ? '' : ' (partial)'}</p><p className="font-mono text-[18px] font-bold text-brand-heading">€{fmt(importerResult.totalCost, 0)}</p></div>
              </div>
            )}
          </Card>

          <Card className="p-4">
            <h2 className="text-[13px] font-bold text-brand-heading mb-1">CBAM report</h2>
            <p className="text-[12px] text-brand-muted mb-3">A separate document from the GHG inventory report.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant="primary" leftIcon={busy ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} disabled={busy} onClick={() => requestExport('pdf')}>PDF</Button>
              <Button size="sm" variant="secondary" leftIcon={<FileSpreadsheet size={14} />} onClick={() => requestExport('xlsx')}>Excel</Button>
              <Button size="sm" variant="secondary" leftIcon={<FileCode size={14} />} onClick={() => requestExport('xml')}>XML</Button>
              <Button size="sm" variant="secondary" leftIcon={<Download size={14} />} onClick={() => requestExport('json')}>JSON</Button>
            </div>
            <p className="text-[11px] text-brand-muted mt-2">The Excel file is laid out like the Commission's operator template; XML and JSON use IINVTY's own documented format, not the CBAM Registry schema.</p>
          </Card>

          <Card className="p-4">
            <h2 className="text-[13px] font-bold text-brand-heading mb-2">Checks ({notes.length})</h2>
            {notes.length === 0 ? <p className="text-[12.5px] text-brand-muted">Nothing to fix.</p> : (
              <ul className="flex flex-col gap-1.5 max-h-72 overflow-y-auto">
                {notes.map((n, i) => (
                  <li key={i} className={`text-[12px] leading-snug ${n.level === 'error' ? 'text-red-700' : n.level === 'warning' ? 'text-amber-800' : 'text-brand-muted'}`}>{n.text}</li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>

      <LeadGateModal
        isOpen={gate !== null}
        onClose={() => setGate(null)}
        onSuccess={() => { const k = gate; setGate(null); if (k) void runExport(k); }}
        title="CBAM report — download"
        description="Verify your organisation details to download the CBAM report and data files."
        actionType="cbam"
      />
    </div>
  );
};

const ExporterResults: React.FC<{ result: ReturnType<typeof calculateExporter> }> = ({ result }) => (
  <div className="flex flex-col gap-4">
    {result.processes.map((p) => (
      <Card key={p.id} className="p-4">
        <h3 className="text-[14px] font-bold text-brand-heading">{p.name}</h3>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2 text-[12px]">
          {([['Attributed direct', p.attrDirect], ['Attributed indirect', p.attrIndirect], ['Embedded direct', p.embeddedDirect], ['Embedded indirect', p.embeddedIndirect]] as const).map(([k, v]) => (
            <div key={k}><dt className="text-brand-muted">{k}</dt><dd className="font-mono font-semibold text-brand-heading">{fmt(v, 2)} t</dd></div>
          ))}
        </dl>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-[12px] min-w-[560px]">
            <thead><tr className="text-left text-brand-muted border-b border-border">
              <th className="py-1.5 pr-2">Good</th><th className="pr-2">Sector</th><th className="text-right pr-2">SEE direct</th><th className="text-right pr-2">SEE indirect</th>
              <th className="text-right pr-2">SEE counted</th><th className="text-right pr-2">Default share</th><th className="text-right">SEFA</th>
            </tr></thead>
            <tbody>
              {p.products.map((g) => (
                <tr key={g.id} className="border-b border-border/60">
                  <td className="py-1.5 pr-2">{g.name || '—'} <span className="text-brand-muted font-mono">{formatCn(g.cn)}</span></td>
                  <td className="pr-2">{g.sector ? SECTOR_LABEL[g.sector] : '—'}</td>
                  <td className="text-right pr-2 font-mono">{fmt(g.seeDirect, 4)}</td>
                  <td className="text-right pr-2 font-mono">{fmt(g.seeIndirect, 4)}{g.indirectCounted ? '' : '*'}</td>
                  <td className="text-right pr-2 font-mono font-semibold">{fmt(g.seeCounted, 4)}</td>
                  <td className="text-right pr-2 font-mono">{pctOf(g.defaultShare)}</td>
                  <td className="text-right font-mono" title={g.sefaWorking || g.problem}>{g.sefa ? fmt(g.sefa, 4) : 'n/c'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-brand-muted mt-2">t CO₂e per tonne of good. * Reported, not counted: indirect emissions count only for cement and fertilisers. n/c: not calculated, see Checks.</p>
      </Card>
    ))}
  </div>
);

const ImporterResults: React.FC<{ result: ReturnType<typeof calculateImporter> }> = ({ result }) => (
  <Card className="p-4">
    <div className="overflow-x-auto">
      <table className="w-full text-[12px] min-w-[640px]">
        <thead><tr className="text-left text-brand-muted border-b border-border">
          <th className="py-1.5 pr-2">Goods</th><th className="pr-2">Origin</th><th className="text-right pr-2">Mass (t)</th><th className="text-right pr-2">SEE</th>
          <th className="text-right pr-2">SEFA</th><th className="text-right pr-2">Certificates</th><th className="text-right pr-2">€ / cert.</th><th className="text-right">Cost (€)</th>
        </tr></thead>
        <tbody>
          {result.lines.map((l) => (
            <tr key={l.id} className="border-b border-border/60">
              <td className="py-1.5 pr-2">{l.name || '—'} <span className="text-brand-muted font-mono">{formatCn(l.cn)}</span></td>
              <td className="pr-2">{l.country ?? 'Unknown'}</td>
              <td className="text-right pr-2 font-mono">{fmt(l.tonnes, 1)}</td>
              <td className="text-right pr-2 font-mono">{fmt(l.see, 4)}</td>
              <td className="text-right pr-2 font-mono">{fmt(l.sefa, 4)}</td>
              <td className="text-right pr-2 font-mono font-semibold">{fmt(l.certificates, 2)}</td>
              <td className="text-right pr-2 font-mono">{fmt(l.price, 2)}</td>
              <td className="text-right font-mono">{fmt(l.cost, 2)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr className="font-semibold">
          <td className="py-2" colSpan={5}>Total</td>
          <td className="text-right pr-2 font-mono">{fmt(result.totalCertificates, 2)}</td><td />
          <td className="text-right font-mono">{fmt(result.totalCost, 2)}{result.costComplete ? '' : ' *'}</td>
        </tr></tfoot>
      </table>
    </div>
    <p className="text-[11px] text-brand-muted mt-2">
      Certificates = max[0; SEE − SEFA − carbon price paid ÷ RP] × mass (Commission Guidance No. 1).
      {result.costComplete ? '' : ' * Lines without a certificate price are left out of the cost.'}
    </p>
  </Card>
);

export default CBAMPage;
