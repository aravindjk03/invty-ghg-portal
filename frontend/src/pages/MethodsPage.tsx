/**
 * The IPCC methods: Scope 1 sources that are equations, not a factor per unit.
 *
 * Six sources in an inventory cannot be read off a table against a tonne of
 * something. They are calculated by the same engine, under the same GWP basis,
 * and their CO2e joins Scope 1 — so a dairy unit or a landfill can no longer be
 * left out of a report simply because there was nowhere to record it.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, Beef, FlaskConical, Leaf, Loader2, Plus, Sprout,
  Trash2, Droplets, Trash,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { EngineStatusBar } from '../components/ui/EngineStatusBar';
import {
  EntericForm, LimeAndUreaForm, ManagedSoilsForm, ManureForm, MethodIdentity,
  SolidWasteForm, WastewaterForm,
} from '../components/methods/MethodForms';
import { Switch } from '../components/methods/MethodFields';
import { MethodResultPanel } from '../components/methods/MethodResultPanel';
import { useGHG } from '../context/GHGContext';
import { getMethodCatalogue } from '../services/methodsService';
import {
  EntericInput, LimeAndUreaInput, ManagedSoilsInput, ManureInput, MethodEntry,
  MethodInfo, MethodInput, MethodKey, SolidWasteInput, WastewaterInput,
} from '../types/methods';

export interface MethodsPageProps {
  onNavigate: (page: string) => void;
}

const ICONS: Record<MethodKey, React.ReactNode> = {
  managed_soils: <Sprout size={18} />,
  lime_and_urea: <FlaskConical size={18} />,
  enteric_fermentation: <Beef size={18} />,
  manure_management: <Leaf size={18} />,
  wastewater: <Droplets size={18} />,
  solid_waste: <Trash size={18} />,
};

export const MethodsPage: React.FC<MethodsPageProps> = ({ onNavigate }) => {
  const {
    methodEntries, methodResults, methodErrors, methodsLoading,
    addMethodEntry, updateMethodEntry, deleteMethodEntry,
    gwpSet, addToast, saveToStorage,
  } = useGHG();

  const [catalogue, setCatalogue] = useState<MethodInfo[]>([]);
  const [catalogueError, setCatalogueError] = useState<string>();
  const [loadingCatalogue, setLoadingCatalogue] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getMethodCatalogue()
      .then((methods) => { if (!cancelled) { setCatalogue(methods); setCatalogueError(undefined); } })
      .catch((error: Error) => { if (!cancelled) setCatalogueError(error.message); })
      .finally(() => { if (!cancelled) setLoadingCatalogue(false); });
    return () => { cancelled = true; };
  }, []);

  const infoFor = useMemo(() => {
    const map = new Map<string, MethodInfo>();
    catalogue.forEach((info) => map.set(info.key, info));
    return map;
  }, [catalogue]);

  const totalTonnes = useMemo(() => {
    let total = 0;
    methodEntries.forEach((entry) => {
      const result = methodResults.get(entry.id);
      if (entry.included && result) total += Number(result.co2e_kg) / 1000;
    });
    return total;
  }, [methodEntries, methodResults]);

  const includedCount = methodEntries.filter((entry) => entry.included).length;

  const renderForm = (entry: MethodEntry, info?: MethodInfo) => {
    const onChange = (input: MethodInput) => updateMethodEntry(entry.id, { input });

    switch (entry.input.method) {
      case 'managed_soils':
        return <ManagedSoilsForm input={entry.input as ManagedSoilsInput} info={info} onChange={onChange} />;
      case 'lime_and_urea':
        return <LimeAndUreaForm input={entry.input as LimeAndUreaInput} info={info} onChange={onChange} />;
      case 'enteric_fermentation':
        return <EntericForm input={entry.input as EntericInput} info={info} onChange={onChange} />;
      case 'manure_management':
        return <ManureForm input={entry.input as ManureInput} info={info} onChange={onChange} />;
      case 'wastewater':
        return <WastewaterForm input={entry.input as WastewaterInput} info={info} onChange={onChange} />;
      case 'solid_waste':
        return <SolidWasteForm input={entry.input as SolidWasteInput} info={info} onChange={onChange} />;
      default:
        return null;
    }
  };

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
            <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-scope-1 block">
              SCOPE 1 — CALCULATED BY METHOD
            </span>
            <h1 className="text-[32px] font-bold text-brand-heading tracking-tight mt-0.5">
              IPCC methods
            </h1>
            <p className="text-[15px] text-brand-muted mt-1">
              Six sources cannot be a factor per unit of activity. A landfill&apos;s methane
              depends on what was buried in earlier years; a fertiliser&apos;s nitrous oxide on
              what happened to the nitrogen after it reached the soil; a herd&apos;s methane on
              the region and the climate. They are calculated here, by the same engine and under
              the same {gwpSet} basis as the rest of the inventory.
            </p>
          </div>

          <Card className="px-5 py-4 min-w-[220px]">
            <span className="text-[11px] font-bold uppercase tracking-wider text-brand-muted">
              These sources, {gwpSet} basis
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-[28px] font-bold text-brand-heading tabular-nums leading-none">
                {totalTonnes.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </span>
              <span className="text-[13px] font-medium text-brand-muted">tCO₂e</span>
              {methodsLoading && <Loader2 size={14} className="animate-spin text-brand-muted ml-1" />}
            </div>
            <p className="text-[11px] text-brand-muted mt-1">
              {includedCount} of {methodEntries.length} included in Scope 1
            </p>
          </Card>
        </div>

        <EngineStatusBar />

        {catalogueError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex gap-2.5">
            <AlertTriangle size={16} className="text-status-danger shrink-0 mt-0.5" />
            <p className="text-[13px] text-brand-body">{catalogueError}</p>
          </div>
        )}

        {/* What can be added */}
        <Card className="p-5">
          <h2 className="text-[15px] font-bold text-brand-heading mb-1">Add a source</h2>
          <p className="text-[13px] text-brand-muted mb-4">
            Each of these is published as an equation with parameters, not as a factor. Pick the
            one that matches what the site actually does.
          </p>

          {loadingCatalogue ? (
            <div className="flex items-center gap-2 py-3">
              <Loader2 size={15} className="animate-spin text-brand-primary" />
              <span className="text-[13px] text-brand-muted">Loading the published methods…</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {catalogue.map((info) => (
                <button
                  key={info.key}
                  type="button"
                  onClick={() => {
                    addMethodEntry(info.key as MethodKey, info.name);
                    addToast('info', `${info.name} added. Fill it in, then include it in Scope 1.`);
                  }}
                  className="text-left rounded-lg border border-border bg-surface-raised p-4 hover:border-brand-primary hover:shadow-nm-raised-sm transition-all group"
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 text-scope-1 shrink-0">
                      {ICONS[info.key as MethodKey]}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-[13px] font-bold text-brand-heading">{info.name}</h3>
                        {info.gases.map((gas) => (
                          <Badge key={gas} variant="default">{gas}</Badge>
                        ))}
                      </div>
                      <p className="text-[12px] leading-snug text-brand-muted mt-1">
                        {info.why_not_a_factor}
                      </p>
                      <p className="text-[11px] text-brand-muted mt-2">
                        Needs: {info.needs.join('; ')}.
                      </p>
                      <p className="text-[11px] text-brand-muted/80 mt-1">{info.source}</p>
                      <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-primary mt-2 group-hover:gap-1.5 transition-all">
                        <Plus size={13} /> Add
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* The entries */}
        {methodEntries.length === 0 ? (
          <Card className="p-8 text-center border-2 border-dashed border-border">
            <h3 className="text-[15px] font-bold text-brand-heading mb-1">
              No method sources recorded
            </h3>
            <p className="text-[13px] text-brand-muted max-w-lg mx-auto">
              If the site has livestock, applies fertiliser or lime, treats its own effluent or
              sends waste to a disposal site, those are Scope 1 sources and belong here. Leaving
              them out understates the inventory; there is no factor per tonne that can stand in
              for them.
            </p>
          </Card>
        ) : (
          <div className="flex flex-col gap-5">
            {methodEntries.map((entry) => {
              const info = infoFor.get(entry.method);
              return (
                <Card key={entry.id} className="p-0 overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-border bg-surface-raised">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-scope-1 shrink-0">{ICONS[entry.method]}</span>
                      <div className="min-w-0">
                        <h3 className="text-[14px] font-bold text-brand-heading truncate">
                          {entry.label || info?.name || entry.method}
                        </h3>
                        <p className="text-[11px] text-brand-muted truncate">
                          {info?.name}
                          {entry.facility ? ` · ${entry.facility}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <Switch
                        label="Include in Scope 1"
                        checked={entry.included}
                        onChange={(included) => updateMethodEntry(entry.id, { included })}
                      />
                      <button
                        type="button"
                        aria-label="Delete this source"
                        onClick={() => {
                          deleteMethodEntry(entry.id);
                          addToast('info', 'Source removed from the inventory.');
                        }}
                        className="p-2 rounded-md text-brand-muted hover:text-status-danger hover:bg-red-50 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="p-5 flex flex-col gap-5">
                    <MethodIdentity
                      label={entry.label}
                      facility={entry.facility}
                      onChange={(patch) => updateMethodEntry(entry.id, patch)}
                    />
                    {renderForm(entry, info)}
                    <MethodResultPanel
                      result={methodResults.get(entry.id)}
                      error={methodErrors.get(entry.id)}
                      loading={methodsLoading}
                      included={entry.included}
                    />
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
          <Button variant="secondary" onClick={saveToStorage}>Save draft</Button>
          <Button onClick={() => onNavigate('dashboard')}>
            Go to the dashboard
          </Button>
        </div>
      </div>
    </div>
  );
};
