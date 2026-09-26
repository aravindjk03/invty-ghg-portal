/**
 * One form per IPCC method.
 *
 * Every choice offered here comes from the engine's option lists, which are
 * read from the ingested IPCC tables. Nothing is typed out twice: if a table
 * gains a row the form gains it, and a screen can never offer a species,
 * system or site type IPCC does not publish.
 *
 * Where the method refuses something — a herd on pasture, a waste type with no
 * decay rate — the engine's own sentence is shown, because it says what to do
 * about it.
 */
import React, { useId } from 'react';
import { Info } from 'lucide-react';
import {
  Choice, Grid, Num, RepeatingRows, Section, Switch, notesFor, optionsFor,
} from './MethodFields';
import { Input } from '../ui/Input';
import {
  EntericInput, LimeAndUreaInput, ManagedSoilsInput, ManureGroupInput, ManureInput,
  ManureStreamInput, MethodInfo, MethodInput, SolidWasteInput, WasteStreamInput,
  WastewaterInput, WastewaterPathwayInput,
} from '../../types/methods';

interface FormProps<T extends MethodInput> {
  input: T;
  info?: MethodInfo;
  onChange: (input: T) => void;
}

const Note: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex gap-2 rounded-lg bg-blue-50/70 border border-blue-100 p-3">
    <Info size={15} className="text-brand-primary shrink-0 mt-0.5" />
    <p className="text-[12px] leading-relaxed text-brand-body">{children}</p>
  </div>
);

// --- managed soils ----------------------------------------------------------

export const ManagedSoilsForm: React.FC<FormProps<ManagedSoilsInput>> = ({ input, onChange }) => {
  const set = (patch: Partial<ManagedSoilsInput>) => onChange({ ...input, ...patch });

  return (
    <div className="flex flex-col gap-5">
      <Note>
        These are kilograms of <strong>nitrogen</strong>, not kilograms of product. A 100 kg bag
        of urea is 46 kg of N; DAP is 18% and ammonium sulphate 21%. The nutrient content is
        printed on the bag, so it is not assumed here.
      </Note>

      <Section title="Nitrogen reaching the soil" description="One year, in kilograms of N.">
        <Grid>
          <Num label="Synthetic fertiliser" value={input.synthetic_fertiliser_n}
               onChange={(v) => set({ synthetic_fertiliser_n: v })} unit="kg N" />
          <Num label="Organic amendments" value={input.organic_amendment_n}
               onChange={(v) => set({ organic_amendment_n: v })} unit="kg N"
               hint="Manure, compost, sewage sludge applied to land." />
          <Num label="Grazing deposition" value={input.grazing_deposition_n}
               onChange={(v) => set({ grazing_deposition_n: v })} unit="kg N"
               hint="Urine and dung dropped on pasture, not manure that was collected." />
          <Num label="Crop residues" value={input.crop_residue_n}
               onChange={(v) => set({ crop_residue_n: v })} unit="kg N" />
          <Num label="Mineralised soil nitrogen" value={input.mineralised_n}
               onChange={(v) => set({ mineralised_n: v })} unit="kg N" />
          <Num label="Nitrogen on flooded rice" value={input.flooded_rice_n}
               onChange={(v) => set({ flooded_rice_n: v })} unit="kg N"
               hint="Takes its own lower factor (EF1FR 0.003, against 0.01)." />
        </Grid>
      </Section>

      <Section title="Conditions">
        <div className="flex flex-col gap-3">
          <Switch
            label="Grazing animals are cattle, poultry or pigs"
            checked={input.grazing_is_cattle_poultry_pigs}
            onChange={(checked) => set({ grazing_is_cattle_poultry_pigs: checked })}
            hint="Sheep and other animals take EF3 of 0.01 instead of 0.02."
          />
          <Switch
            label="Nitrogen leaches or runs off from this land"
            checked={input.leaching_occurs}
            onChange={(checked) => set({ leaching_occurs: checked })}
            hint="True where rainfall exceeds the soil's water holding capacity, or where irrigation other than drip is used. Where it does not, IPCC's default is zero - not 0.3 - so this is asked rather than assumed."
          />
        </div>
      </Section>
    </div>
  );
};

// --- lime and urea ----------------------------------------------------------

export const LimeAndUreaForm: React.FC<FormProps<LimeAndUreaInput>> = ({ input, info, onChange }) => {
  const set = (patch: Partial<LimeAndUreaInput>) => onChange({ ...input, ...patch });

  return (
    <div className="flex flex-col gap-5">
      <Note>
        Limestone and dolomite carry different carbon, so a single &quot;lime&quot; figure cannot
        be split here. Urea applied to soil is counted twice on purpose, as two different gases:
        the carbon leaves as CO₂ here, and the nitrogen produces N₂O through managed soils.
      </Note>

      <Grid>
        <Choice label="Mass unit" value={input.mass_unit}
                options={optionsFor(info, 'mass_unit')}
                onChange={(value) => set({ mass_unit: value as 'tonne' | 'kg' })} />
        <Num label="Limestone (CaCO₃)" value={input.limestone}
             onChange={(v) => set({ limestone: v })} unit={input.mass_unit} />
        <Num label="Dolomite (CaMg(CO₃)₂)" value={input.dolomite}
             onChange={(v) => set({ dolomite: v })} unit={input.mass_unit} />
        <Num label="Urea applied" value={input.urea}
             onChange={(v) => set({ urea: v })} unit={input.mass_unit} />
        <Num label="Urea share of the solution" value={input.urea_fraction_of_solution}
             onChange={(v) => set({ urea_fraction_of_solution: v })} step="0.01"
             hint="Leave at 1 where urea arrives neat, or where the share of a fertiliser solution is unknown: IPCC prefers that to under-estimating." />
      </Grid>
    </div>
  );
};

// --- enteric fermentation ---------------------------------------------------

export const EntericForm: React.FC<FormProps<EntericInput>> = ({ input, info, onChange }) => {
  const set = (patch: Partial<EntericInput>) => onChange({ ...input, ...patch });
  const animals = optionsFor(info, 'other_animals');
  const notPublished = notesFor(info, 'not_published');

  const rows = Object.entries(input.other_animals).map(([animal, head]) => ({ animal, head }));
  const setRows = (next: { animal: string; head: number }[]) => {
    const merged: Record<string, number> = {};
    next.forEach((row) => { if (row.animal) merged[row.animal] = row.head; });
    set({ other_animals: merged });
  };

  return (
    <div className="flex flex-col gap-5">
      <Note>
        The factor per head differs by region because animal size and milk yield differ: an
        Indian dairy cow and a North American one are not the same source.
      </Note>

      <Grid cols={2}>
        <Choice label="Region the cattle are farmed in" value={input.cattle_region}
                options={optionsFor(info, 'cattle_region')}
                onChange={(value) => set({ cattle_region: value })}
                hint="Table 10.11 of the IPCC guidelines." />
        <Choice label="Economy (for the other species)" value={input.economy}
                options={[{ value: 'developing', label: 'Developing' },
                          { value: 'developed', label: 'Developed' }]}
                onChange={(value) => set({ economy: value as 'developed' | 'developing' })} />
      </Grid>

      <Section title="Cattle" description="Head present over the year.">
        <Grid cols={2}>
          <Num label="Dairy cattle" value={input.dairy_cattle}
               onChange={(v) => set({ dairy_cattle: v })} unit="head" />
          <Num label="Other cattle" value={input.other_cattle}
               onChange={(v) => set({ other_cattle: v })} unit="head" />
        </Grid>
      </Section>

      <Section title="Other livestock" description="Buffalo, sheep, goats, camels and the rest.">
        <RepeatingRows
          rows={rows}
          onChange={setRows}
          blank={() => ({ animal: animals[0]?.value || '', head: 0 })}
          addLabel="Add a species"
          emptyMessage="No other livestock recorded."
          render={(row, update) => (
            <Grid cols={2}>
              <Choice label="Species" value={row.animal} options={animals}
                      onChange={(value) => update({ animal: value })} />
              <Num label="Head" value={row.head} onChange={(v) => update({ head: v })} unit="head" />
            </Grid>
          )}
        />
        {Object.keys(notPublished).length > 0 && (
          <p className="text-[11px] leading-snug text-status-warning">
            {Object.values(notPublished).join(' ')}
          </p>
        )}
      </Section>
    </div>
  );
};

// --- manure management ------------------------------------------------------

export const ManureForm: React.FC<FormProps<ManureInput>> = ({ input, info, onChange }) => {
  const set = (patch: Partial<ManureInput>) => onChange({ ...input, ...patch });
  const species = optionsFor(info, 'species');
  const categories = optionsFor(info, 'category');
  const systems = optionsFor(info, 'system');
  const excretionRegions = optionsFor(info, 'excretion_region');
  const elsewhere = notesFor(info, 'reported_elsewhere');

  const regionHasExcretionRates = excretionRegions.some((r) => r.value === input.region);

  return (
    <div className="flex flex-col gap-5">
      <Note>
        The methane depends on the average <strong>annual</strong> temperature where the manure
        sits — a summer figure would put a temperate site in the warm column and overstate it.
        The nitrous oxide depends on how the manure is stored, not on the animal.
      </Note>

      <Grid>
        <Choice label="Region" value={input.region} options={optionsFor(info, 'region')}
                onChange={(value) => set({ region: value })}
                hint="Table 10.14: how manure is typically managed there." />
        <Num label="Average annual temperature" value={input.temperature_c}
             onChange={(v) => set({ temperature_c: v })} unit="°C" step="1" />
        <Choice label="Region for excretion rates"
                value={input.excretion_region || input.region}
                options={excretionRegions}
                onChange={(value) => set({ excretion_region: value })}
                hint={regionHasExcretionRates
                  ? 'Table 10.19, used for the nitrogen side.'
                  : 'Table 10.19 has no column for the region above, so one has to be chosen here and stated in the report.'} />
      </Grid>

      <Section title="Herd — for methane"
               description="Head present over the year, by species (Tables 10.14 to 10.16).">
        <RepeatingRows<ManureGroupInput>
          rows={input.groups}
          onChange={(groups) => set({ groups })}
          blank={() => ({ species: species[0]?.value || '', head: 0, economy: 'developing' })}
          addLabel="Add a species"
          emptyMessage="No livestock recorded, so no manure methane will be calculated."
          render={(row, update) => (
            <Grid>
              <Choice label="Species" value={row.species} options={species}
                      onChange={(value) => update({ species: value })} />
              <Num label="Head" value={row.head} onChange={(v) => update({ head: v })} unit="head" />
              <Choice label="Economy" value={row.economy || 'developing'}
                      options={[{ value: 'developing', label: 'Developing' },
                                { value: 'developed', label: 'Developed' }]}
                      onChange={(value) => update({ economy: value as 'developed' | 'developing' })}
                      hint="Only used for sheep, goats, camels, horses and poultry." />
            </Grid>
          )}
        />
      </Section>

      <Section
        title="Storage — for nitrous oxide"
        description="Each livestock category's nitrogen going to one storage system. A category's shares may add to less than one — the rest is usually dropped on pasture — but never to more."
      >
        <RepeatingRows<ManureStreamInput>
          rows={input.streams}
          onChange={(streams) => set({ streams })}
          blank={() => ({
            category: categories[0]?.value || '', head: 0,
            system: systems[0]?.value || '', typical_animal_mass_kg: 300, share: 1,
          })}
          addLabel="Add a storage route"
          emptyMessage="No storage recorded, so only methane will be calculated."
          render={(row, update) => (
            <div className="flex flex-col gap-4">
              <Grid>
                <Choice label="Livestock category" value={row.category} options={categories}
                        onChange={(value) => update({ category: value })} />
                <Num label="Head" value={row.head} onChange={(v) => update({ head: v })} unit="head" />
                <Choice label="Manure system" value={row.system} options={systems}
                        onChange={(value) => update({ system: value })} />
              </Grid>
              <Grid>
                <Num label="Typical animal mass" value={row.typical_animal_mass_kg ?? 0}
                     onChange={(v) => update({ typical_animal_mass_kg: v })} unit="kg"
                     hint="The live weight of one animal. A 250 kg Indian dairy cow and a 600 kg Holstein excrete very differently." />
                <Num label="Share of this category's manure" value={row.share ?? 1}
                     onChange={(v) => update({ share: v })} step="0.05" />
                <Num label="Measured nitrogen excreted (optional)"
                     value={row.nitrogen_excreted_kg_per_head ?? 0}
                     onChange={(v) => update({ nitrogen_excreted_kg_per_head: v || null })}
                     unit="kg N/head/yr"
                     hint="Overrides the Table 10.19 default where the site has measured it." />
              </Grid>
              <Grid>
                <Num label="Volatilisation (optional)" value={row.volatilisation_percent ?? 0}
                     onChange={(v) => update({ volatilisation_percent: v || null })} unit="%"
                     hint="Leave blank to use Table 10.22." />
                <Num label="Leaching and runoff (optional)" value={row.leaching_percent ?? 0}
                     onChange={(v) => update({ leaching_percent: v || null })} unit="%"
                     hint="IPCC publishes no default. Left blank, leaching is reported as zero and the report says so." />
                <Num label="Total nitrogen loss (optional)" value={row.total_loss_percent ?? 0}
                     onChange={(v) => update({ total_loss_percent: v || null })} unit="%"
                     hint="Leave blank to use Table 10.23." />
              </Grid>
            </div>
          )}
        />
        {Object.values(elsewhere).map((sentence) => (
          <p key={sentence} className="text-[11px] leading-snug text-brand-muted">{sentence}</p>
        ))}
      </Section>
    </div>
  );
};

// --- wastewater -------------------------------------------------------------

export const WastewaterForm: React.FC<FormProps<WastewaterInput>> = ({ input, info, onChange }) => {
  const set = (patch: Partial<WastewaterInput>) => onChange({ ...input, ...patch });
  const systems = optionsFor(info, 'system');
  const shareTotal = input.pathways.reduce((total, row) => total + (row.share_of_load || 0), 0);

  return (
    <div className="flex flex-col gap-5">
      <Note>
        There is no factor per cubic metre here: that would assume a strength of effluent nobody
        measured. Methane follows the <strong>organic load</strong> and how anaerobic the
        treatment is; nitrous oxide follows the <strong>nitrogen discharged</strong>.
      </Note>

      <Section title="Methane — the organic load"
               description="Give the load directly, or build it from the population served.">
        <Grid>
          <Choice label="Load measured as" value={input.load_basis}
                  options={optionsFor(info, 'load_basis')}
                  onChange={(value) => set({ load_basis: value as 'BOD' | 'COD' })}
                  hint="Domestic effluent is normally BOD, industrial COD. They are not interchangeable." />
          <Num label="Organic load" value={input.organic_load ?? 0}
               onChange={(v) => set({ organic_load: v || null })}
               unit={`kg ${input.load_basis}/yr`} />
          <Num label="Organics removed as sludge" value={input.sludge_removed_kg}
               onChange={(v) => set({ sludge_removed_kg: v })} unit="kg/yr"
               hint="Never reaches the treatment step, so it is subtracted first." />
        </Grid>
        <Grid>
          <Num label="Population served" value={input.population ?? 0}
               onChange={(v) => set({ population: v || null })} unit="people" />
          <Num label="BOD per person" value={input.bod_per_person_g_day ?? 0}
               onChange={(v) => set({ bod_per_person_g_day: v || null })} unit="g/day"
               hint="Country-specific; IPCC publishes no single value for everywhere." />
          <Num label="Industrial discharge uplift" value={input.industrial_correction}
               onChange={(v) => set({ industrial_correction: v })} step="0.05"
               hint="1.25 where industry discharges into the sewer." />
        </Grid>
      </Section>

      <Section title="Treatment route"
               description="Where the load goes. The shares have to add to 1: every part of the load has to go somewhere before the total means anything.">
        <RepeatingRows<WastewaterPathwayInput>
          rows={input.pathways}
          onChange={(pathways) => set({ pathways })}
          blank={() => ({ system: systems[0]?.value || '', share_of_load: 1, methane_recovered_kg: 0 })}
          addLabel="Add a treatment route"
          emptyMessage="No route recorded, so no methane will be calculated."
          render={(row, update) => (
            <Grid>
              <Choice label="System" value={row.system} options={systems}
                      onChange={(value) => update({ system: value })} />
              <Num label="Share of the load" value={row.share_of_load}
                   onChange={(v) => update({ share_of_load: v })} step="0.05" />
              <Num label="Methane recovered" value={row.methane_recovered_kg ?? 0}
                   onChange={(v) => update({ methane_recovered_kg: v })} unit="kg CH₄/yr" />
            </Grid>
          )}
        />
        {input.pathways.length > 0 && Math.abs(shareTotal - 1) > 0.001 && (
          <p className="text-[12px] font-medium text-status-warning">
            The shares add to {shareTotal.toFixed(3)}, not 1. The engine will refuse this until
            the whole load is accounted for.
          </p>
        )}
      </Section>

      <Section title="Nitrous oxide — the nitrogen discharged"
               description="Give the nitrogen directly, or build it from population and protein intake.">
        <Grid>
          <Num label="Nitrogen discharged" value={input.nitrogen_discharged_kg ?? 0}
               onChange={(v) => set({ nitrogen_discharged_kg: v || null })} unit="kg N/yr" />
          <Num label="Protein intake per person" value={input.protein_kg_per_person_year ?? 0}
               onChange={(v) => set({ protein_kg_per_person_year: v || null })} unit="kg/yr" />
          <Num label="Nitrogen removed as sludge" value={input.sludge_nitrogen_kg}
               onChange={(v) => set({ sludge_nitrogen_kg: v })} unit="kg N/yr" />
        </Grid>
        <div className="flex flex-col gap-3">
          <Choice label="Economy" value={input.economy}
                  options={[{ value: 'developing', label: 'Developing' },
                            { value: 'developed', label: 'Developed' }]}
                  onChange={(value) => set({ economy: value as 'developed' | 'developing' })}
                  hint="A developed economy wastes more of its protein: 1.4 against 1.1." />
          <Switch
            label="Industry and commerce discharge into this sewer"
            checked={input.industrial_discharges_to_sewer}
            onChange={(checked) => set({ industrial_discharges_to_sewer: checked })}
          />
        </div>
      </Section>
    </div>
  );
};

// --- solid waste ------------------------------------------------------------

export const SolidWasteForm: React.FC<FormProps<SolidWasteInput>> = ({ input, info, onChange }) => {
  const set = (patch: Partial<SolidWasteInput>) => onChange({ ...input, ...patch });
  const components = optionsFor(info, 'component');
  const siteTypes = optionsFor(info, 'site_type');
  const zoneHelp = notesFor(info, 'climate_zone_help');
  const noDecayRate = notesFor(info, 'no_decay_rate');

  return (
    <div className="flex flex-col gap-5">
      <Note>
        Waste buried this year emits nothing this year, and waste buried a decade ago is still
        decaying. Give the site&apos;s <strong>disposal history</strong>: with a single year the
        model has nothing to decay and returns nothing.
      </Note>

      <Grid>
        <Num label="Inventory year" value={input.inventory_year}
             onChange={(v) => set({ inventory_year: Math.round(v) })} step="1" />
        <Choice label="Climate zone" value={input.climate_zone}
                options={optionsFor(info, 'climate_zone')}
                onChange={(value) => set({ climate_zone: value })}
                hint={zoneHelp[input.climate_zone]} />
        <Num label="Methane recovered this year" value={input.recovered_ch4_kg}
             onChange={(v) => set({ recovered_ch4_kg: v })} unit="kg CH₄"
             hint="Captured and flared or used. Subtracted before the cover oxidation is applied." />
      </Grid>

      <Section title="What was buried, and when"
               description="One entry per waste type. Each carries its own years, so a site that stopped taking food waste but kept taking paper can say so.">
        <RepeatingRows<WasteStreamInput>
          rows={input.streams}
          onChange={(streams) => set({ streams })}
          blank={() => ({
            component: components[0]?.value || '',
            site_type: siteTypes[0]?.value || '',
            tonnes_by_year: {},
            covered_with_oxidising_material: false,
          })}
          addLabel="Add a waste type"
          emptyMessage="Nothing recorded, so no landfill methane will be calculated."
          render={(row, update) => (
            <div className="flex flex-col gap-4">
              <Grid>
                <Choice label="Waste type" value={row.component} options={components}
                        onChange={(value) => update({ component: value })} />
                <Choice label="Kind of site" value={row.site_type} options={siteTypes}
                        onChange={(value) => update({ site_type: value })} />
                <Num label="Decay rate k (optional)" value={row.k ?? 0}
                     onChange={(v) => update({ k: v || null })} step="0.005" unit="per year"
                     hint="Leave blank to use Table 3.3 for this waste type and climate." />
              </Grid>
              <Switch
                label="Covered with methane-oxidising material (soil or compost)"
                checked={row.covered_with_oxidising_material || false}
                onChange={(checked) => update({ covered_with_oxidising_material: checked })}
              />
              <YearlyTonnages
                value={row.tonnes_by_year}
                inventoryYear={input.inventory_year}
                onChange={(tonnes_by_year) => update({ tonnes_by_year })}
              />
            </div>
          )}
        />
        {Object.values(noDecayRate).map((sentence) => (
          <p key={sentence} className="text-[11px] leading-snug text-brand-muted">{sentence}</p>
        ))}
      </Section>
    </div>
  );
};

/** The disposal history: a year and a tonnage, as many rows as the site has. */
const YearlyTonnages: React.FC<{
  value: Record<string, number>;
  inventoryYear: number;
  onChange: (value: Record<string, number>) => void;
}> = ({ value, inventoryYear, onChange }) => {
  const rows = Object.entries(value)
    .map(([year, tonnes]) => ({ year: Number(year), tonnes }))
    .sort((a, b) => a.year - b.year);

  const setRows = (next: { year: number; tonnes: number }[]) => {
    const merged: Record<string, number> = {};
    next.forEach((row) => { if (row.year) merged[String(row.year)] = row.tonnes; });
    onChange(merged);
  };

  const fillBack = (years: number) => {
    const latest = rows[rows.length - 1];
    const tonnes = latest?.tonnes || 0;
    const merged: Record<string, number> = { ...value };
    for (let year = inventoryYear - years; year < inventoryYear; year += 1) {
      if (merged[String(year)] === undefined) merged[String(year)] = tonnes;
    }
    onChange(merged);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h5 className="text-[12px] font-bold text-brand-heading">Tonnes buried, by year</h5>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => fillBack(10)}
                  className="text-[11px] font-semibold text-brand-primary hover:text-blue-700">
            Repeat the last figure back 10 years
          </button>
          <button type="button" onClick={() => fillBack(20)}
                  className="text-[11px] font-semibold text-brand-primary hover:text-blue-700">
            back 20 years
          </button>
        </div>
      </div>
      <RepeatingRows
        rows={rows}
        onChange={setRows}
        blank={() => ({
          year: rows.length ? rows[rows.length - 1].year + 1 : inventoryYear - 1,
          tonnes: 0,
        })}
        addLabel="Add a year"
        emptyMessage="No disposal history yet. Without earlier years this stream contributes nothing."
        render={(row, update) => (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Num label="Year" value={row.year} onChange={(v) => update({ year: Math.round(v) })}
                 step="1" />
            <Num label="Tonnes buried" value={row.tonnes} onChange={(v) => update({ tonnes: v })}
                 unit="t" />
          </div>
        )}
      />
      {rows.some((row) => row.year > inventoryYear) && (
        <p className="text-[12px] font-medium text-status-warning">
          A year here is later than the inventory year. Waste buried in the future cannot
          contribute to this year&apos;s emissions, and the engine will refuse it.
        </p>
      )}
    </div>
  );
};

/** A label and a facility, shared by every method. */
export const MethodIdentity: React.FC<{
  label: string;
  facility: string;
  onChange: (patch: { label?: string; facility?: string }) => void;
}> = ({ label, facility, onChange }) => {
  const prefix = useId();
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Input id={`${prefix}-label`} label="What this is" value={label}
             placeholder="e.g. Dairy unit, north block"
             onChange={(event) => onChange({ label: event.target.value })} />
      <Input id={`${prefix}-facility`} label="Facility" value={facility}
             placeholder="e.g. Plant 2"
             onChange={(event) => onChange({ facility: event.target.value })} />
    </div>
  );
};
