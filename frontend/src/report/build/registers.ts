/**
 * The registers that make an inventory traceable: emission source register,
 * evidence register and emission-factor register (report parts 9, 17, 18).
 *
 * Each row is derived from the entries themselves, so a register can never
 * disagree with the numbers in the inventory.
 */
import { ActivityEntry } from '../../types/ghg';
import { Annexure, EmissionFactorRow, EvidenceRow, SourceRegisterRow } from '../model/types';
import { scopeLabel, sum } from './aggregate';

const categoryLabel = (category: string): string =>
  category.replace(/^cat(\d+)_/, 'Cat $1 ').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

export function buildSourceRegister(entries: ActivityEntry[]): SourceRegisterRow[] {
  const groups = new Map<string, ActivityEntry[]>();
  entries.forEach((entry) => {
    const key = `${entry.scope}|${entry.category}|${entry.fuelOrSource}|${entry.facility}`;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  });

  return [...groups.entries()]
    .map(([key, group], index) => {
      const [scope, category, source, facility] = key.split('|');
      return {
        sourceId: `SRC-${String(index + 1).padStart(3, '0')}`,
        source: source || categoryLabel(category),
        scopeLabel: scopeLabel(scope),
        categoryLabel: categoryLabel(category),
        facility: facility || 'Not recorded',
        entryCount: group.length,
        tco2e: sum(group),
      };
    })
    .sort((a, b) => b.tco2e - a.tco2e);
}

/**
 * One row per source, showing whether the figure can be traced to a document.
 * `hasEvidence` drives the QA/QC check and the readiness score.
 */
export function buildEvidenceRegister(entries: ActivityEntry[]): EvidenceRow[] {
  const groups = new Map<string, ActivityEntry[]>();
  entries.forEach((entry) => {
    const key = `${entry.scope}|${entry.category}|${entry.fuelOrSource}`;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  });

  return [...groups.entries()].map(([key, group], index) => {
    const [scope, category, source] = key.split('|');
    const withEvidence = group.filter((entry) => Boolean(entry.evidenceFile));
    const unit = group[0]?.unit ?? '';
    return {
      id: `E-${String(index + 1).padStart(3, '0')}`,
      source: `${source || categoryLabel(category)} (${scopeLabel(scope)})`,
      dataType: unit ? `Activity data in ${unit}` : 'Activity data',
      frequency: group.length > 1 ? `${group.length} records in the period` : 'Single record',
      evidence: withEvidence.length === group.length && withEvidence.length > 0
        ? withEvidence.map((entry) => entry.evidenceFile).join(', ')
        : withEvidence.length > 0
          ? `${withEvidence.map((entry) => entry.evidenceFile).join(', ')} — ${group.length - withEvidence.length} record(s) without evidence`
          : 'No supporting document attached',
      hasEvidence: withEvidence.length === group.length && withEvidence.length > 0,
    };
  });
}

export function buildFactorRegister(entries: ActivityEntry[], reportingYear: number): EmissionFactorRow[] {
  const byFactor = new Map<string, { entries: ActivityEntry[] }>();
  entries.forEach((entry) => {
    const id = entry.emissionFactor?.id ?? 'UNSPECIFIED';
    byFactor.set(id, { entries: [...(byFactor.get(id)?.entries ?? []), entry] });
  });

  return [...byFactor.entries()]
    .map(([id, group]) => {
      const factor = group.entries[0]?.emissionFactor;
      const publicationYear = factor?.publicationYear ?? 0;
      return {
        id,
        activity: factor?.fuelOrActivity ?? group.entries[0]?.fuelOrSource ?? 'Not recorded',
        factorValue: factor?.factorValue ?? 0,
        unit: factor?.unit ?? '',
        source: factor?.source ?? 'Not recorded',
        publicationYear,
        qualityTier: factor?.qualityTier ?? 'Estimated',
        gwpSet: factor?.gwpSet ?? 'Not recorded',
        ageYears: publicationYear > 0 ? Math.max(0, reportingYear - publicationYear) : -1,
        usedByEntries: group.entries.length,
      };
    })
    .sort((a, b) => b.usedByEntries - a.usedByEntries);
}

/** Annexures A-O: each points at the part of the report that holds the content. */
export function buildAnnexures(populated: Record<string, boolean>): Annexure[] {
  const list: { letter: string; title: string; contentRef: string; key: string }[] = [
    { letter: 'A', title: 'Organizational boundary', contentRef: 'Part 8', key: 'boundary' },
    { letter: 'B', title: 'Facility list', contentRef: 'Part 8', key: 'facilities' },
    { letter: 'C', title: 'Emission source register', contentRef: 'Part 9', key: 'sources' },
    { letter: 'D', title: 'Activity data', contentRef: 'Parts 10-15', key: 'activity' },
    { letter: 'E', title: 'Emission factor register', contentRef: 'Part 18', key: 'factors' },
    { letter: 'F', title: 'Calculation workbook', contentRef: 'Exported separately (XLSX)', key: 'workbook' },
    { letter: 'G', title: 'Scope 3 category assessment', contentRef: 'Part 15', key: 'scope3' },
    { letter: 'H', title: 'Data quality assessment', contentRef: 'Part 27', key: 'quality' },
    { letter: 'I', title: 'Uncertainty assessment', contentRef: 'Part 28', key: 'uncertainty' },
    { letter: 'J', title: 'Exclusion register', contentRef: 'Part 26', key: 'exclusions' },
    { letter: 'K', title: 'QA/QC records', contentRef: 'Part 29', key: 'qaqc' },
    { letter: 'L', title: 'Evidence register', contentRef: 'Part 17', key: 'evidence' },
    { letter: 'M', title: 'Base-year recalculation assessment', contentRef: 'Part 25', key: 'baseYear' },
    { letter: 'N', title: 'GHG reduction initiatives', contentRef: 'Part 31', key: 'mitigation' },
    { letter: 'O', title: 'Definitions and abbreviations', contentRef: 'Part 36', key: 'definitions' },
  ];
  return list.map(({ key, ...annexure }) => ({ ...annexure, populated: populated[key] ?? false }));
}
