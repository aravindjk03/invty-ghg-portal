/**
 * Which catalogue sources are calculated as an IPCC method rather than a factor.
 *
 * Six sources in the catalogue can never have a factor per unit of activity
 * attached to them. A herd's methane depends on the region and the climate, a
 * landfill's on what was buried in earlier years, a fertiliser's nitrous oxide
 * on what happened to the nitrogen after it reached the soil. They are
 * calculated on the Methods page by the same engine, and they count in Scope 1.
 *
 * Without this list a user picking "Enteric fermentation — livestock" saw only
 * "no published factor chosen" and had no way to know the product can in fact
 * calculate it. This is a fact about how this product is laid out, not a
 * published value, so it lives here rather than in the ingested data.
 */
import { MethodKey } from '../types/methods';

export const METHOD_FOR_SOURCE: Record<string, MethodKey> = {
  'agri.enteric_fermentation': 'enteric_fermentation',
  'agri.manure_management': 'manure_management',
  'agri.fertiliser_n2o': 'managed_soils',
  'agri.urea_application': 'lime_and_urea',
  'agri.lime_application': 'lime_and_urea',
  'fugitive.ch4_wastewater': 'wastewater',
  'fugitive.n2o_wastewater': 'wastewater',
};

export const METHOD_NAME: Record<MethodKey, string> = {
  managed_soils: 'N₂O from managed soils',
  lime_and_urea: 'CO₂ from liming and urea application',
  enteric_fermentation: 'CH₄ from enteric fermentation',
  manure_management: 'CH₄ and N₂O from manure management',
  wastewater: 'CH₄ and N₂O from wastewater',
  solid_waste: 'CH₄ from solid waste disposal',
};

/**
 * Sources a method covers but which this product does not implement.
 *
 * Rice cultivation is IPCC 2006 Volume 4 Chapter 5. It is a real source with a
 * published method, and saying so is more use to a reader than an unexplained
 * blank — but nothing here calculates it yet, so it must not look as though
 * something does.
 */
export const METHOD_NOT_IMPLEMENTED: Record<string, string> = {
  'agri.rice_cultivation':
    'Rice cultivation methane is IPCC 2006 Volume 4 Chapter 5, which this engine does not '
    + 'implement yet. Record the area, water regime and organic amendments in your own '
    + 'records and report the source as excluded until it is added.',
};

export const methodFor = (catalogueKey: string | undefined): MethodKey | undefined =>
  (catalogueKey ? METHOD_FOR_SOURCE[catalogueKey] : undefined);
