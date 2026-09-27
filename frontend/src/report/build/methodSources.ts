/**
 * The IPCC method sources, as the report states them.
 *
 * A method entry the engine calculated becomes a row with its gas masses, its
 * CO2e under the reported basis, and every note the method attached. An entry
 * the engine refused becomes a row with the reason and a zero: it is listed in
 * the exclusion register rather than dropped, because a source that could not
 * be calculated is a finding, not an absence.
 */
import { MethodSourceRow } from '../model/types';
import { MethodEntry, MethodResult } from '../../types/methods';

const METHOD_NAME: Record<string, string> = {
  managed_soils: 'N2O from managed soils',
  lime_and_urea: 'CO2 from liming and urea application',
  enteric_fermentation: 'CH4 from enteric fermentation',
  manure_management: 'CH4 and N2O from manure management',
  wastewater: 'CH4 and N2O from wastewater',
  solid_waste: 'CH4 from solid waste disposal',
};

export function buildMethodSources(
  entries: MethodEntry[],
  results: Map<string, MethodResult>,
  errors: Map<string, string>,
): MethodSourceRow[] {
  return entries
    .filter((entry) => entry.included)
    .map((entry) => {
      const method = METHOD_NAME[entry.method] ?? entry.method;
      const result = results.get(entry.id);

      if (!result) {
        return {
          label: entry.label || method,
          facility: entry.facility,
          method,
          source: 'IPCC 2006 Guidelines',
          gwpSet: '',
          gasMasses: [],
          tco2e: 0,
          notes: [],
          refusedReason: errors.get(entry.id)
            ?? 'Not yet calculated, so it is excluded from every total.',
        };
      }

      return {
        label: entry.label || method,
        facility: entry.facility,
        method,
        source: result.source,
        gwpSet: result.gwp_set,
        gasMasses: Object.entries(result.gas_masses_kg)
          .map(([gas, kg]) => ({ gas, kg: Number(kg) })),
        tco2e: Number(result.co2e_kg) / 1000,
        notes: result.notes,
      };
    });
}
