import React from 'react';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { CbamData, OTHER_COUNTRIES, ROUTE_LABELS, lookupBenchmark } from './data';
import type { EmissionLine, ExporterInput, PrecursorUse, Process, Product } from './model';
import { Choice, CnBox, Field, NumBox, TextBox } from './fields';
import { blankLine, blankPrecursor, blankProcess, blankProduct } from './state';

interface Props {
  data: CbamData;
  value: ExporterInput;
  onChange: (next: ExporterInput) => void;
  /** The GHG inventory's Scope 1 total and period, offered as a measured line. */
  inventory?: { scope1: number; period: string };
}

const YEARS = [2026, 2027, 2028, 2029, 2030].map((y) => ({ value: String(y), label: String(y) }));

export const ExporterForm: React.FC<Props> = ({ data, value, onChange, inventory }) => {
  const inst = value.installation;
  const setInst = (patch: Partial<typeof inst>) => onChange({ ...value, installation: { ...inst, ...patch } });
  const setProcess = (id: string, patch: Partial<Process>) =>
    onChange({ ...value, processes: value.processes.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  const countries = [...data.countries.map((c) => ({ value: c, label: c })), { value: OTHER_COUNTRIES, label: 'Other country' }];

  return (
    <div className="flex flex-col gap-5">
      <Card className="p-4 sm:p-5">
        <h2 className="text-[15px] font-bold text-brand-heading">1. Installation</h2>
        <p className="text-[12.5px] text-brand-muted mt-0.5 mb-3">The plant where the goods are made, and the production year you are reporting.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Field label="Installation name"><TextBox value={inst.name} onChange={(v) => setInst({ name: v })} /></Field>
          <Field label="Operator (company)"><TextBox value={inst.operator} onChange={(v) => setInst({ operator: v })} /></Field>
          <Field label="Country of production"><Choice value={inst.country} onChange={(v) => setInst({ country: v })} options={countries} /></Field>
          <Field label="UN/LOCODE" hint="Five letters, e.g. INMAA"><TextBox value={inst.unlocode} onChange={(v) => setInst({ unlocode: v.toUpperCase() })} /></Field>
          <Field label="Address"><TextBox value={inst.address} onChange={(v) => setInst({ address: v })} /></Field>
          <Field label="Production year (reporting period)">
            <Choice value={String(inst.year)} onChange={(v) => setInst({ year: Number(v) })} options={YEARS} />
          </Field>
        </div>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-bold text-brand-heading">2. Production processes</h2>
          <p className="text-[12.5px] text-brand-muted">One per process that makes a CBAM good. A process can make several products.</p>
        </div>
        <Button size="sm" variant="secondary" leftIcon={<Plus size={14} />}
          onClick={() => onChange({ ...value, processes: [...value.processes, blankProcess(value.processes.length + 1)] })}>
          Add process
        </Button>
      </div>

      {value.processes.map((p, i) => (
        <ProcessCard key={p.id} data={data} process={p} index={i} all={value.processes} year={inst.year}
          inventory={inventory} countries={countries}
          onChange={(patch) => setProcess(p.id, patch)}
          onRemove={value.processes.length > 1 ? () => onChange({ ...value, processes: value.processes.filter((x) => x.id !== p.id) }) : undefined} />
      ))}
    </div>
  );
};

const Section: React.FC<{ title: string; hint?: string; children: React.ReactNode; action?: React.ReactNode; open?: boolean }> = ({
  title, hint, children, action, open = true,
}) => (
  <details open={open} className="group border-t border-border pt-3 mt-3">
    <summary className="flex items-center justify-between gap-2 cursor-pointer list-none">
      <span>
        <span className="text-[13px] font-bold text-brand-heading">{title}</span>
        {hint && <span className="block text-[11.5px] text-brand-muted">{hint}</span>}
      </span>
      <span className="flex items-center gap-2">
        {action}
        <ChevronDown size={15} className="text-brand-muted transition-transform group-open:rotate-180" />
      </span>
    </summary>
    <div className="mt-3">{children}</div>
  </details>
);

const RemoveButton: React.FC<{ onClick: () => void; label: string }> = ({ onClick, label }) => (
  <button type="button" onClick={onClick} aria-label={label}
    className="h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-md text-brand-muted hover:text-red-600 hover:bg-red-50">
    <Trash2 size={15} />
  </button>
);

const ProcessCard: React.FC<{
  data: CbamData; process: Process; index: number; all: Process[]; year: number;
  inventory?: Props['inventory']; countries: Array<{ value: string; label: string }>;
  onChange: (patch: Partial<Process>) => void; onRemove?: () => void;
}> = ({ data, process: p, all, year, inventory, countries, onChange, onRemove }) => {
  const setProduct = (id: string, patch: Partial<Product>) => onChange({ products: p.products.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const setLine = (id: string, patch: Partial<EmissionLine>) => onChange({ direct: p.direct.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const setPre = (id: string, patch: Partial<PrecursorUse>) => onChange({ precursors: p.precursors.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const others = all.filter((x) => x.id !== p.id);

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-end gap-2">
        <Field label="Process name" className="flex-1"><TextBox value={p.name} onChange={(v) => onChange({ name: v })} /></Field>
        {onRemove && <RemoveButton onClick={onRemove} label="Remove process" />}
      </div>

      <Section title="Products" hint="Goods leaving this process in the year. Functional units: 1, or clinker content for cement, nitrogen content for fertilisers."
        action={<AddLink onClick={() => onChange({ products: [...p.products, blankProduct()] })} />}>
        <div className="flex flex-col gap-3">
          {p.products.map((pr) => {
            const bm = pr.cn.trim() ? lookupBenchmark(data, pr.cn, 'A', pr.route, year) : null;
            const routes = bm && !bm.ok && bm.options ? bm.options : null;
            return (
              <div key={pr.id} className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-start rounded-lg bg-surface/60 p-2.5">
                <div className="col-span-2 sm:col-span-4"><Field label="CN code"><CnBox data={data} value={pr.cn} onChange={(v) => setProduct(pr.id, { cn: v })} /></Field></div>
                <div className="col-span-2 sm:col-span-3"><Field label="Product name"><TextBox value={pr.name} onChange={(v) => setProduct(pr.id, { name: v })} /></Field></div>
                <div className="sm:col-span-2"><Field label="Produced (t)"><NumBox value={pr.tonnes} onChange={(v) => setProduct(pr.id, { tonnes: v })} /></Field></div>
                <div className="sm:col-span-2"><Field label="Functional units / t"><NumBox value={pr.functionalUnitsPerTonne} onChange={(v) => setProduct(pr.id, { functionalUnitsPerTonne: v })} /></Field></div>
                <div className="col-span-2 sm:col-span-1 flex sm:justify-end sm:pt-5">
                  {p.products.length > 1 && <RemoveButton onClick={() => onChange({ products: p.products.filter((x) => x.id !== pr.id) })} label="Remove product" />}
                </div>
                {(routes || pr.route) && (
                  <div className="col-span-2 sm:col-span-6">
                    <Field label="Production route (for the benchmark)">
                      <Choice value={pr.route ?? ''} onChange={(v) => setProduct(pr.id, { route: v || undefined })}
                        options={[{ value: '', label: 'Choose…' }, ...(routes ?? (pr.route ? [pr.route] : [])).map((r) => ({ value: r, label: `${r} ${ROUTE_LABELS[r] ?? ''}` }))]} />
                    </Field>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Direct emissions (DirEm*)"
        hint="Fuels and materials: activity × emission factor × oxidation factor, or a measured value. Give the source of each factor."
        action={<AddLink onClick={() => onChange({ direct: [...p.direct, blankLine()] })} />}>
        {inventory && inventory.scope1 > 0 && (
          <button type="button" className="mb-3 text-[12.5px] font-semibold text-brand-link hover:underline"
            onClick={() => onChange({ direct: [...p.direct, {
              ...blankLine(), kind: 'measured', label: 'Scope 1 total from the GHG inventory', tco2e: String(inventory.scope1),
              source: `IINVTY GHG inventory, Scope 1, ${inventory.period} (company total: check it matches this process's boundary)`,
            }] })}>
            + Use my Scope 1 inventory total ({inventory.scope1.toLocaleString('en-IN', { maximumFractionDigits: 1 })} tCO₂e)
          </button>
        )}
        {p.direct.length === 0 && <p className="text-[12.5px] text-brand-muted">No emission sources yet.</p>}
        <div className="flex flex-col gap-3">
          {p.direct.map((l) => (
            <div key={l.id} className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-end rounded-lg bg-surface/60 p-2.5">
              <div className="col-span-2 sm:col-span-3"><Field label="Source stream"><TextBox value={l.label} placeholder="e.g. Coking coal" onChange={(v) => setLine(l.id, { label: v })} /></Field></div>
              <div className="col-span-2 sm:col-span-2">
                <Field label="Method"><Choice value={l.kind} onChange={(v) => setLine(l.id, { kind: v as EmissionLine['kind'] })}
                  options={[{ value: 'calc', label: 'Calculated' }, { value: 'measured', label: 'Measured' }]} /></Field>
              </div>
              {l.kind === 'calc' ? (
                <>
                  <div className="sm:col-span-2"><Field label="Activity"><NumBox value={l.activity} onChange={(v) => setLine(l.id, { activity: v })} /></Field></div>
                  <div className="sm:col-span-1"><Field label="Unit"><TextBox value={l.activityUnit} placeholder="t, TJ" onChange={(v) => setLine(l.id, { activityUnit: v })} /></Field></div>
                  <div className="sm:col-span-2"><Field label="tCO₂e per unit"><NumBox value={l.emissionFactor} onChange={(v) => setLine(l.id, { emissionFactor: v })} /></Field></div>
                  <div className="sm:col-span-1"><Field label="Ox. factor"><NumBox value={l.oxidationFactor} onChange={(v) => setLine(l.id, { oxidationFactor: v })} /></Field></div>
                </>
              ) : (
                <div className="col-span-2 sm:col-span-6"><Field label="Measured emissions (tCO₂e)"><NumBox value={l.tco2e} onChange={(v) => setLine(l.id, { tco2e: v })} /></Field></div>
              )}
              <div className="col-span-2 sm:col-span-1 flex justify-end">
                <RemoveButton onClick={() => onChange({ direct: p.direct.filter((x) => x.id !== l.id) })} label="Remove line" />
              </div>
              <div className="col-span-2 sm:col-span-12">
                <Field label="Source of the factor or measurement"><TextBox value={l.source} placeholder="e.g. IPCC 2006 Vol. 2 Table 2.2; lab analysis 2026" onChange={(v) => setLine(l.id, { source: v })} /></Field>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Electricity consumed (indirect emissions)"
        hint="Counted in the CBAM obligation only for cement and fertilisers; always reported.">
        <div className="grid grid-cols-2 sm:grid-cols-12 gap-2">
          <div className="sm:col-span-3"><Field label="Electricity (MWh)"><NumBox value={p.electricityMWh} onChange={(v) => onChange({ electricityMWh: v })} /></Field></div>
          <div className="sm:col-span-3"><Field label="tCO₂e per MWh"><NumBox value={p.electricityEF} onChange={(v) => onChange({ electricityEF: v })} /></Field></div>
          <div className="col-span-2 sm:col-span-6"><Field label="Source of the factor" hint="CBAM's default grid factors (Annex II) are not loaded: give the factor you use and where it is from.">
            <TextBox value={p.electricitySource} placeholder="e.g. CEA CO2 Baseline Database v20; PPA certificate" onChange={(v) => onChange({ electricitySource: v })} /></Field></div>
        </div>
      </Section>

      <Section title="Heat, waste gases and electricity produced" hint="Only if heat or waste gases cross this process's boundary." open={false}>
        <div className="grid grid-cols-2 sm:grid-cols-12 gap-2">
          <div className="sm:col-span-3"><Field label="Heat imported (TJ)"><NumBox value={p.heatImportTJ} onChange={(v) => onChange({ heatImportTJ: v })} /></Field></div>
          <div className="sm:col-span-3"><Field label="tCO₂ per TJ (imported)"><NumBox value={p.heatImportEF} onChange={(v) => onChange({ heatImportEF: v })} /></Field></div>
          <div className="sm:col-span-3"><Field label="Heat exported (TJ)"><NumBox value={p.heatExportTJ} onChange={(v) => onChange({ heatExportTJ: v })} /></Field></div>
          <div className="sm:col-span-3"><Field label="tCO₂ per TJ (exported)"><NumBox value={p.heatExportEF} onChange={(v) => onChange({ heatExportEF: v })} /></Field></div>
          <div className="col-span-2 sm:col-span-12"><Field label="Source of the heat factors"><TextBox value={p.heatSource} onChange={(v) => onChange({ heatSource: v })} /></Field></div>
          <div className="sm:col-span-3"><Field label="Waste gas imported (TJ)" hint="Volume × NCV"><NumBox value={p.wasteGasImportTJ} onChange={(v) => onChange({ wasteGasImportTJ: v })} /></Field></div>
          <div className="sm:col-span-3"><Field label="Waste gas exported (TJ)" hint="× 0.667 efficiency correction"><NumBox value={p.wasteGasExportTJ} onChange={(v) => onChange({ wasteGasExportTJ: v })} /></Field></div>
          <div className="sm:col-span-3"><Field label="Natural gas factor (tCO₂/TJ)"><NumBox value={p.naturalGasEF} onChange={(v) => onChange({ naturalGasEF: v })} /></Field></div>
          <div className="sm:col-span-3"><Field label="Electricity produced (tCO₂e)"><NumBox value={p.electricityProducedTco2e} onChange={(v) => onChange({ electricityProducedTco2e: v })} /></Field></div>
          <div className="col-span-2 sm:col-span-12"><Field label="Source of the natural gas factor"><TextBox value={p.naturalGasEFSource} onChange={(v) => onChange({ naturalGasEFSource: v })} /></Field></div>
        </div>
      </Section>

      <Section title="Precursors" hint="CBAM goods consumed by this process (e.g. clinker, pig iron, crude steel, ammonia), including losses."
        action={<AddLink onClick={() => onChange({ precursors: [...p.precursors, blankPrecursor()] })} />}>
        {p.precursors.length === 0 && <p className="text-[12.5px] text-brand-muted">None. Add any CBAM good this process uses as an input.</p>}
        <div className="flex flex-col gap-3">
          {p.precursors.map((pc) => {
            const src = others.find((x) => x.id === pc.ownProcessId);
            return (
              <div key={pc.id} className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-start rounded-lg bg-surface/60 p-2.5">
                <div className="col-span-2 sm:col-span-4"><Field label="CN code"><CnBox data={data} value={pc.cn} onChange={(v) => setPre(pc.id, { cn: v })} /></Field></div>
                <div className="col-span-2 sm:col-span-3"><Field label="Name"><TextBox value={pc.name} onChange={(v) => setPre(pc.id, { name: v })} /></Field></div>
                <div className="sm:col-span-2"><Field label="Consumed (t)"><NumBox value={pc.tonnes} onChange={(v) => setPre(pc.id, { tonnes: v })} /></Field></div>
                <div className="sm:col-span-2">
                  <Field label="Data">
                    <Choice value={pc.origin} onChange={(v) => setPre(pc.id, { origin: v as PrecursorUse['origin'] })} options={[
                      { value: 'default', label: 'Default value' },
                      { value: 'supplier_actual', label: "Supplier's verified data" },
                      ...(others.length ? [{ value: 'own_process', label: 'Made in this installation' }] : []),
                      { value: 'eu', label: 'From the EU' },
                    ]} />
                  </Field>
                </div>
                <div className="col-span-2 sm:col-span-1 flex sm:justify-end sm:pt-5">
                  <RemoveButton onClick={() => onChange({ precursors: p.precursors.filter((x) => x.id !== pc.id) })} label="Remove precursor" />
                </div>
                {pc.origin === 'default' && (
                  <div className="col-span-2 sm:col-span-6">
                    <Field label="Country of production" hint="Unknown: Annex IV (highest default) applies.">
                      <Choice value={pc.country ?? ''} onChange={(v) => setPre(pc.id, { country: v || null })}
                        options={[{ value: '', label: 'Unknown' }, ...countries]} />
                    </Field>
                  </div>
                )}
                {pc.origin === 'supplier_actual' && (
                  <>
                    <div className="col-span-2 sm:col-span-3"><Field label="Supplier"><TextBox value={pc.supplierName} onChange={(v) => setPre(pc.id, { supplierName: v })} /></Field></div>
                    <div className="sm:col-span-3"><Field label="SEE direct (t/t)"><NumBox value={pc.supplierSeeDirect} onChange={(v) => setPre(pc.id, { supplierSeeDirect: v })} /></Field></div>
                    <div className="sm:col-span-3"><Field label="SEE indirect (t/t)"><NumBox value={pc.supplierSeeIndirect} onChange={(v) => setPre(pc.id, { supplierSeeIndirect: v })} /></Field></div>
                    <div className="col-span-2 sm:col-span-3"><Field label="SEFA (t/t)" hint="From the supplier's report"><NumBox value={pc.supplierSefa} onChange={(v) => setPre(pc.id, { supplierSefa: v })} /></Field></div>
                  </>
                )}
                {pc.origin === 'own_process' && (
                  <>
                    <div className="col-span-2 sm:col-span-4">
                      <Field label="Made by process">
                        <Choice value={pc.ownProcessId ?? ''} onChange={(v) => setPre(pc.id, { ownProcessId: v, ownProductId: undefined })}
                          options={[{ value: '', label: 'Choose…' }, ...others.map((x) => ({ value: x.id, label: x.name }))]} />
                      </Field>
                    </div>
                    {src && src.products.length > 1 && (
                      <div className="col-span-2 sm:col-span-4">
                        <Field label="Product">
                          <Choice value={pc.ownProductId ?? src.products[0].id} onChange={(v) => setPre(pc.id, { ownProductId: v })}
                            options={src.products.map((x) => ({ value: x.id, label: x.name || x.cn }))} />
                        </Field>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </Section>
    </Card>
  );
};

const AddLink: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button type="button" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand-link hover:underline"
    onClick={(e) => { e.preventDefault(); onClick(); }}>
    <Plus size={13} /> Add
  </button>
);
