/**
 * Which published factor calculates each source a user may pick.
 *
 * The catalogue is the list of sources the product offers. The engine's
 * registry is the list of factors that exist. Nothing joined the two, so a user
 * could choose "Diesel / HSD — stationary", see a factor printed on the row,
 * and still get 0.00 tCO2e: the row named no published factor, the engine
 * refused it, and the report excluded it. That join is data now
 * (data/catalogue_engine_map.csv), served by the engine so there is one source
 * of truth, and applied here as a source is chosen.
 *
 * A source absent from the map has no published factor in any ingested set. It
 * stays uncalculated and the report lists it — which is the right answer, not a
 * bug to paper over with a made-up number.
 */
import { z } from 'zod';
import { engineFetch } from '../engine/engineFetch';

const MappingSchema = z.object({
  catalogue_key: z.string(),
  catalogue_name: z.string(),
  unit: z.string(),
  activity_key: z.string(),
  engine_name: z.string(),
  region: z.string(),
  source: z.string(),
});
export type CatalogueMapping = z.infer<typeof MappingSchema>;

/** Catalogue key -> the mappings for it, one per unit the factor is published in. */
export type CatalogueMap = Map<string, CatalogueMapping[]>;

const UnitChoiceSchema = z.object({
  catalogue_key: z.string(),
  unit: z.string(),
  activity_key: z.string(),
  region: z.string(),
  needs_fx: z.boolean(),
});
export type UnitChoice = z.infer<typeof UnitChoiceSchema>;

/**
 * For each source, the units a row may record it in that the engine can
 * actually calculate, worked out by the engine itself (unit-choices). Filled
 * when the map loads; empty until then, which leaves every unit on offer.
 */
let choicesByKey = new Map<string, UnitChoice[]>();

/** Replaces the engine's unit choices; called when the map loads (and by tests). */
export function setUnitChoices(choices: UnitChoice[]): void {
  const byKey = new Map<string, UnitChoice[]>();
  choices.forEach((choice) => {
    byKey.set(choice.catalogue_key, [...(byKey.get(choice.catalogue_key) ?? []), choice]);
  });
  choicesByKey = byKey;
}

export function unitChoicesFor(catalogueKey: string | undefined): UnitChoice[] {
  return (catalogueKey && choicesByKey.get(catalogueKey)) || [];
}

export function unitChoiceFor(catalogueKey: string | undefined, unit: string | undefined): UnitChoice | undefined {
  const wanted = (unit ?? '').toLowerCase();
  return unitChoicesFor(catalogueKey).find((choice) => choice.unit.toLowerCase() === wanted);
}

/** The unit a row should start in: the source's own unit if it calculates, else the first that does. */
export function startingUnit(catalogueKey: string, defaultUnit: string): string {
  const choices = unitChoicesFor(catalogueKey);
  if (choices.length === 0 || choices.some((choice) => choice.unit === defaultUnit)) return defaultUnit;
  return (choices.find((choice) => !choice.needs_fx) ?? choices[0]).unit;
}

/**
 * A row's unit as the user writes it -> the unit the published factor is in.
 * Only conversions that are exact and dimensionally honest are listed; a unit
 * with no entry resolves nothing rather than being coerced into something else.
 */
const UNIT_EQUIVALENTS: Record<string, string[]> = {
  l: ['litres'],
  kl: ['cubic metres', 'litres'],
  gal: ['litres'],
  m3: ['cubic metres'],
  scm: ['cubic metres'],
  nm3: ['cubic metres'],
  kg: ['kg', 'tonnes'],
  t: ['tonnes', 'kg'],
  lb: ['kg', 'tonnes'],
  g: ['kg'],
  kwh: ['kWh', 'kWh (Net CV)', 'kWh (Gross CV)'],
  mwh: ['kWh', 'kWh (Net CV)', 'kWh (Gross CV)'],
  // Plain kWh last: for a FUEL the net and gross calorific bases are different
  // measurements and the right one must win, but heat and steam are published
  // in plain kilowatt hours and a gigajoule is 277.78 of them exactly.
  gj: ['GJ', 'kWh (Net CV)', 'kWh'],
  mmbtu: ['kWh (Net CV)', 'GJ', 'kWh'],
  km: ['km'],
  mi: ['km'],
  't.km': ['tonne.km'],
  // A seat on a bus, a train, a ferry or a plane is published per
  // passenger-kilometre, which the engine keeps as its own dimension so a
  // vehicle's kilometres can never be multiplied by a per-passenger factor.
  'pax.km': ['passenger.km'],
  'pax.mi': ['passenger.mi', 'passenger.km'],
  'passenger.km': ['passenger.km'],
  night: ['Room per night'],
  'fte.hr': ['per FTE Working Hour'],
  ml: ['million litres'],
};

export async function getCatalogueMap(): Promise<CatalogueMap> {
  const [response, choices] = await Promise.all([
    engineFetch('/v1/inventory/catalogue-map'),
    engineFetch('/v1/inventory/unit-choices').catch(() => null),
  ]);
  if (!response.ok) throw new Error('catalogue map unavailable');
  const rows = MappingSchema.array().parse(await response.json());
  if (choices?.ok) {
    const parsed = UnitChoiceSchema.array().safeParse(await choices.json());
    if (parsed.success) setUnitChoices(parsed.data);
  }
  const map: CatalogueMap = new Map();
  rows.forEach((row) => {
    map.set(row.catalogue_key, [...(map.get(row.catalogue_key) ?? []), row]);
  });
  return map;
}

/**
 * The published factor for this source in this unit, or the one in its own
 * unit when the row's unit does not line up with anything published.
 */
export function mappingFor(
  map: CatalogueMap, catalogueKey: string | undefined, unit: string | undefined,
): CatalogueMapping | undefined {
  if (!catalogueKey) return undefined;
  const candidates = map.get(catalogueKey);
  if (!candidates || candidates.length === 0) return undefined;

  // The engine's own answer for this unit, when it has one.
  const choice = unitChoiceFor(catalogueKey, unit);
  const chosen = choice && candidates.find((row) => row.activity_key === choice.activity_key);
  if (chosen) return chosen;

  const wanted = UNIT_EQUIVALENTS[(unit ?? '').toLowerCase()] ?? [];
  for (const engineUnit of wanted) {
    const exact = candidates.find((row) => row.unit === engineUnit);
    if (exact) return exact;
  }
  // Nothing lines up with the unit on the row. Return the first published
  // variant so the row still names a real factor; the engine then decides
  // whether the unit can be converted, and says so if it cannot.
  return candidates[0];
}
