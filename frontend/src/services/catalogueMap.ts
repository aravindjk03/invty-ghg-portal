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
import { env } from '../config/env';

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
  gj: ['GJ', 'kWh (Net CV)'],
  mmbtu: ['kWh (Net CV)', 'GJ'],
  km: ['km'],
  mi: ['km'],
  't.km': ['tonne.km'],
  'passenger.km': ['passenger.km'],
  ml: ['million litres'],
};

export async function getCatalogueMap(): Promise<CatalogueMap> {
  const response = await fetch(`${env.PCF_API_BASE_URL}/v1/inventory/catalogue-map`);
  if (!response.ok) throw new Error('catalogue map unavailable');
  const rows = MappingSchema.array().parse(await response.json());
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
