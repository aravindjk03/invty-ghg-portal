/**
 * The three industrial process forms — minerals, chemicals, metals.
 *
 * These are the emissions a plant makes from its PROCESS rather than from
 * burning fuel, and for a cement works or a steel mill they are usually the
 * larger half of the inventory. A form may be filled in partly: a cement works
 * enters clinker and leaves lime and glass at zero, and only what is entered is
 * calculated.
 *
 * As with the other methods, every choice comes from the engine's option lists,
 * which are read from the ingested IPCC tables.
 */
import React from 'react';
import { Info } from 'lucide-react';
import { Choice, Grid, Num, RepeatingRows, Section, Switch, notesFor, optionsFor } from './MethodFields';
import {
  CarbonateInputRow, ChemicalIndustryInput, MetalIndustryInput, MethodInfo,
  MineralIndustryInput, SteelStepRow,
} from '../../types/methods';

interface FormProps<T> {
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

const NONE = { value: '', label: '— not applicable —' };

// --- minerals ---------------------------------------------------------------

export const MineralIndustryForm: React.FC<FormProps<MineralIndustryInput>> = ({
  input, info, onChange,
}) => {
  const set = (patch: Partial<MineralIndustryInput>) => onChange({ ...input, ...patch });
  const carbonates = optionsFor(info, 'carbonate');

  return (
    <div className="flex flex-col gap-5">
      <Note>
        This CO₂ comes out of the <strong>limestone</strong>, not out of the fuel that heats
        it. Enter only what this site makes; leave the rest at zero.
      </Note>

      <Section
        title="Cement"
        description="The activity is CLINKER, not cement. Clinker bought in was calcined by whoever made it; clinker sold on was still calcined here."
      >
        <Grid>
          <Num label="Clinker produced" value={input.clinker_tonnes}
               onChange={(v) => set({ clinker_tonnes: v })} unit="t" />
          <Choice label="Clinker CaO content (optional)"
                  value={input.clinker_cao_content || ''}
                  options={[NONE, ...optionsFor(info, 'clinker_cao_content')]}
                  onChange={(value) => set({ clinker_cao_content: value || null })}
                  hint="Leave blank for the 65% default the published factor assumes." />
        </Grid>
        <Switch
          label="All cement kiln dust is returned to the kiln"
          checked={input.kiln_dust_recycled}
          onChange={(checked) => set({ kiln_dust_recycled: checked })}
          hint="Otherwise a 2% correction is added for the CO2 that leaves in dust lost from the system."
        />
      </Section>

      <Section title="Lime" description="Lime MADE here. Lime spread on farmland goes through the managed soils method instead, not twice.">
        <Grid>
          <Num label="Lime produced" value={input.lime_tonnes}
               onChange={(v) => set({ lime_tonnes: v })} unit="t" />
          <Choice label="Lime type" value={input.lime_type}
                  options={optionsFor(info, 'lime_type')}
                  onChange={(value) => set({ lime_type: value })}
                  hint="The default mix is 85% high calcium and 15% dolomitic." />
        </Grid>
      </Section>

      <Section title="Glass" description="Cullet is recycled glass; it released its carbonate CO2 when it was first made, so only the virgin part of the batch emits.">
        <Grid>
          <Num label="Glass melted" value={input.glass_tonnes}
               onChange={(v) => set({ glass_tonnes: v })} unit="t" />
          <Choice label="Glass type" value={input.glass_type || ''}
                  options={[NONE, ...optionsFor(info, 'glass_type')]}
                  onChange={(value) => set({ glass_type: value || null })} />
          <Num label="Cullet ratio" value={input.cullet_ratio ?? 0}
               onChange={(v) => set({ cullet_ratio: v || null })} step="0.05"
               hint="Leave at 0 to use IPCC's Tier 1 assumption of 50%. A measured ratio changes this materially." />
        </Grid>
      </Section>

      <Section
        title="Other carbonates calcined"
        description="Flux in a furnace, soda ash, the carbonates in a brick or ceramic body. Carbonate that leaves the furnace unchanged released nothing, so say how much actually calcined."
      >
        <RepeatingRows<CarbonateInputRow>
          rows={input.carbonates}
          onChange={(rows) => set({ carbonates: rows })}
          blank={() => ({ carbonate: carbonates[0]?.value || '', tonnes: 0,
                          fraction_calcined: 1 })}
          addLabel="Add a carbonate"
          emptyMessage="No other carbonates recorded."
          render={(row, update) => (
            <Grid>
              <Choice label="Carbonate" value={row.carbonate} options={carbonates}
                      onChange={(value) => update({ carbonate: value })} />
              <Num label="Consumed" value={row.tonnes}
                   onChange={(v) => update({ tonnes: v })} unit="t" />
              <Num label="Fraction calcined" value={row.fraction_calcined}
                   onChange={(v) => update({ fraction_calcined: v })} step="0.05" />
            </Grid>
          )}
        />
      </Section>
    </div>
  );
};

// --- chemicals --------------------------------------------------------------

export const ChemicalIndustryForm: React.FC<FormProps<ChemicalIndustryInput>> = ({
  input, info, onChange,
}) => {
  const set = (patch: Partial<ChemicalIndustryInput>) => onChange({ ...input, ...patch });
  const notPublished = notesFor(info, 'not_published');

  return (
    <div className="flex flex-col gap-5">
      <Note>
        A nitric acid plant makes N₂O in the reaction itself, and how much depends on the
        plant type and on whether its abatement was actually running — not on the tonnage
        alone.
      </Note>

      <Section title="Ammonia" description="This factor counts the fuel AND the feedstock together, which is how ammonia is reported. Do not also report that fuel under stationary combustion.">
        <Grid>
          <Num label="Ammonia produced" value={input.ammonia_tonnes}
               onChange={(v) => set({ ammonia_tonnes: v })} unit="t" />
          <Choice label="Production route" value={input.ammonia_process}
                  options={optionsFor(info, 'ammonia_process')}
                  onChange={(value) => set({ ammonia_process: value })} />
          <Num label="CO₂ recovered for urea" value={input.ammonia_co2_recovered_tonnes}
               onChange={(v) => set({ ammonia_co2_recovered_tonnes: v })} unit="t"
               hint="That CO2 leaves as urea, not to air. It is released when the urea is applied, which managed soils covers." />
        </Grid>
      </Section>

      <Section title="Nitric acid" description="On a 100% HNO3 basis. Reporting the weight of a solution as though it were pure acid overstates the source.">
        <Grid cols={2}>
          <Num label="Nitric acid produced" value={input.nitric_acid_tonnes}
               onChange={(v) => set({ nitric_acid_tonnes: v })} unit="t" />
          <Choice label="Plant type" value={input.nitric_acid_plant_type || ''}
                  options={[NONE, ...optionsFor(info, 'nitric_acid_plant_type')]}
                  onChange={(value) => set({ nitric_acid_plant_type: value || null })}
                  hint="Required: the factor runs from 2 to 9 kg N2O per tonne depending on it." />
        </Grid>
      </Section>

      <Section title="Adipic acid" description="Abatement is two numbers: how much the technology destroys when it runs, and how much of the year it ran.">
        <Grid cols={2}>
          <Num label="Adipic acid produced" value={input.adipic_acid_tonnes}
               onChange={(v) => set({ adipic_acid_tonnes: v })} unit="t" />
          <Choice label="Abatement fitted" value={input.adipic_acid_abatement || ''}
                  options={[{ value: '', label: 'None' },
                            ...optionsFor(info, 'adipic_acid_abatement')]}
                  onChange={(value) => set({ adipic_acid_abatement: value || null })} />
        </Grid>
      </Section>

      <Section title="Carbides">
        <Grid>
          <Num label="Quantity" value={input.carbide_tonnes}
               onChange={(v) => set({ carbide_tonnes: v })} unit="t" />
          <Choice label="Carbide" value={input.carbide_type}
                  options={optionsFor(info, 'carbide_type')}
                  onChange={(value) => set({ carbide_type: value })} />
          <Choice label="That quantity is" value={input.carbide_basis}
                  options={optionsFor(info, 'carbide_basis')}
                  onChange={(value) => set({
                    carbide_basis: value as ChemicalIndustryInput['carbide_basis'],
                  })}
                  hint="The carbide made, the petroleum coke that went in, or the carbide used to make acetylene." />
        </Grid>
      </Section>

      <Section title="Titanium dioxide">
        <Grid cols={2}>
          <Num label="Produced" value={input.titanium_dioxide_tonnes}
               onChange={(v) => set({ titanium_dioxide_tonnes: v })} unit="t" />
          <Choice label="Product" value={input.titanium_dioxide_product}
                  options={optionsFor(info, 'titanium_dioxide_product')}
                  onChange={(value) => set({ titanium_dioxide_product: value })} />
        </Grid>
        {Object.values(notPublished).map((sentence) => (
          <p key={sentence} className="text-[11px] leading-snug text-brand-muted">{sentence}</p>
        ))}
      </Section>
    </div>
  );
};

// --- metals -----------------------------------------------------------------

export const MetalIndustryForm: React.FC<FormProps<MetalIndustryInput>> = ({
  input, info, onChange,
}) => {
  const set = (patch: Partial<MetalIndustryInput>) => onChange({ ...input, ...patch });
  const steps = optionsFor(info, 'steel_step');
  const notPublished = notesFor(info, 'not_published');

  return (
    <div className="flex flex-col gap-5">
      <Note>
        Here the carbon is the <strong>reductant</strong>, not a fuel, and an aluminium cell
        makes CF₄ and C₂F₆ during an anode effect. The route matters more than the tonnage:
        scrap through an arc furnace is about an eighteenth of iron through a basic oxygen
        furnace.
      </Note>

      <Section
        title="Iron and steel"
        description="One row per step. Careful: the BOF and open hearth factors already include the blast furnace iron making, so reporting pig iron beside them counts the same carbon twice — the engine will say so."
      >
        <RepeatingRows<SteelStepRow>
          rows={input.steel_steps}
          onChange={(rows) => set({ steel_steps: rows })}
          blank={() => ({ step: steps[0]?.value || '', tonnes: 0 })}
          addLabel="Add a step"
          emptyMessage="No iron or steel recorded."
          render={(row, update) => (
            <Grid cols={2}>
              <Choice label="Step" value={row.step} options={steps}
                      onChange={(value) => update({ step: value })} />
              <Num label="Produced" value={row.tonnes}
                   onChange={(v) => update({ tonnes: v })} unit="t" />
            </Grid>
          )}
        />
      </Section>

      <Section title="Ferroalloys" description="These factors assume fossil reductants. A furnace charged with charcoal needs its own figure.">
        <Grid cols={2}>
          <Num label="Produced" value={input.ferroalloy_tonnes}
               onChange={(v) => set({ ferroalloy_tonnes: v })} unit="t" />
          <Choice label="Alloy" value={input.ferroalloy_type || ''}
                  options={[NONE, ...optionsFor(info, 'ferroalloy_type')]}
                  onChange={(value) => set({ ferroalloy_type: value || null })}
                  hint="Required: the factor runs from 1.3 to 5.0 tonnes of CO2 per tonne." />
        </Grid>
      </Section>

      <Section title="Aluminium" description="The cell technology sets both the anode CO2 and the perfluorocarbons.">
        <Grid cols={2}>
          <Num label="Aluminium produced" value={input.aluminium_tonnes}
               onChange={(v) => set({ aluminium_tonnes: v })} unit="t" />
          <Choice label="Cell technology" value={input.aluminium_cell_technology || ''}
                  options={[NONE, ...optionsFor(info, 'aluminium_cell_technology')]}
                  onChange={(value) => set({ aluminium_cell_technology: value || null })}
                  hint="CWPB and SWPB are prebake; VSS and HSS are Søderberg." />
        </Grid>
      </Section>

      <Section title="Magnesium casting">
        <Grid cols={2}>
          <Num label="Magnesium cast" value={input.magnesium_tonnes}
               onChange={(v) => set({ magnesium_tonnes: v })} unit="t" />
          <Num label="SF₆ purchased (better, if known)"
               value={input.magnesium_sf6_consumed_kg ?? 0}
               onChange={(v) => set({ magnesium_sf6_consumed_kg: v || null })} unit="kg"
               hint="Cover gas use varies by orders of magnitude between foundries, so the gas actually bought beats the default." />
        </Grid>
      </Section>

      <Section title="Lead and zinc">
        <Grid>
          <Num label="Lead produced" value={input.lead_tonnes}
               onChange={(v) => set({ lead_tonnes: v })} unit="t" />
          <Choice label="Lead route" value={input.lead_route}
                  options={optionsFor(info, 'lead_route')}
                  onChange={(value) => set({ lead_route: value })} />
          <Num label="Zinc produced" value={input.zinc_tonnes}
               onChange={(v) => set({ zinc_tonnes: v })} unit="t" />
        </Grid>
        <Grid cols={2}>
          <Choice label="Zinc process" value={input.zinc_process}
                  options={optionsFor(info, 'zinc_process')}
                  onChange={(value) => set({ zinc_process: value })} />
        </Grid>
        {Object.values(notPublished).map((sentence) => (
          <p key={sentence} className="text-[11px] leading-snug text-brand-muted">{sentence}</p>
        ))}
      </Section>
    </div>
  );
};
