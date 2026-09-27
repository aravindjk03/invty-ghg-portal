/**
 * Runs the inventory through the engine and reports what it could not do.
 *
 * A row is only calculated when it names a published factor. Rows that do not
 * are returned as `unmapped` so the report can list them in its exclusion
 * register — never silently valued at zero, and never calculated here by a
 * second method.
 *
 * Scope 2 is reported twice, which is what the GHG Protocol's Scope 2 Guidance
 * requires. The SAME kilowatt hour appears in both columns:
 *
 *   location-based  at the grid average, whoever sold it and whatever the
 *                   contract says. A green tariff does not change the
 *                   electrons, so its kilowatt hours belong here too.
 *
 *   market-based    at the rate the company contracted for, where it has one —
 *                   a PPA, a green tariff, a retired certificate, a supplier's
 *                   own rate. Where it has none the Guidance falls back to the
 *                   residual mix, and India publishes none, so the grid average
 *                   stands in and the report discloses that.
 *
 * So every Scope 2 row is sent to the engine twice, and the engine keeps the
 * two columns apart. Only the headline view enters the grand total, so nothing
 * is counted twice.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityEntry } from '../types/ghg';
import { calculateInventory, InventoryError } from '../services/inventoryService';
import { GwpSetName, InventoryRecordInput, InventoryResult } from '../types/inventory';

const GHG_CATEGORY: Record<string, string> = {
  stationary_combustion: '1.1', mobile_combustion: '1.2', process_emissions: '1.3',
  fugitive_emissions: '1.4', agricultural_emissions: '1.5',
  purchased_electricity: '2.1', purchased_steam_heat_cooling: '2.2', market_instruments: '2.1',
};

const SCOPE_CODE: Record<string, '1' | '2' | '3' | 'memo'> = {
  'scope-1': '1', 'scope-2': '2', 'scope-3': '3', biogenic: 'memo', memo: 'memo',
};

const scopeOf = (entry: ActivityEntry): '1' | '2' | '3' | 'memo' =>
  SCOPE_CODE[entry.scope] ?? 'memo';

const categoryOf = (entry: ActivityEntry): string => {
  if (GHG_CATEGORY[entry.category]) return GHG_CATEGORY[entry.category];
  const match = entry.category.match(/^cat(\d+)_/);
  return match ? `3.${match[1]}` : 'memo';
};

export interface EngineInventory {
  result?: InventoryResult;
  loading: boolean;
  error?: string;
  /** Rows with no published factor chosen; they are excluded from every total. */
  unmapped: ActivityEntry[];
}

/** The market-based twin of a Scope 2 row, so the two lines never collide. */
export const marketRecordId = (entryId: string): string => `${entryId}::market`;

/**
 * The engine records for a set of rows, and the rows that produce none.
 *
 * Pure and exported so it can be tested without a component: the Scope 2
 * rules below decide what a customer's market-based figure is, and they are
 * not something to find out by reading a dashboard.
 */
export function recordsFor(entries: ActivityEntry[]): {
  records: InventoryRecordInput[];
  unmapped: ActivityEntry[];
} {
  const mappedRecords: InventoryRecordInput[] = [];
  const missing: ActivityEntry[] = [];

  entries.forEach((entry) => {
    // A row carrying a factor the company supplied - a power purchase
    // agreement, a green tariff, a supplier's EPD - reaches the engine even
    // with no published factor behind it. That is the whole point of it:
    // for a market-based Scope 2 figure the GHG Protocol requires the
    // contractual rate, and no published set has it.
    // Only WITH a citation. The engine refuses an unsourced factor, and it
    // is right to: an unsourced number cannot be told from an invented one.
    // Rows saved before the row asked for a source would otherwise fail the
    // whole inventory, so such a factor is treated as absent and the row is
    // listed as needing one.
    const supplied = entry.customFactorSource?.trim()
      ? entry.customFactorOverride : undefined;
    if (!entry.engineActivityKey && supplied === undefined) {
      missing.push(entry);
      return;
    }
    const isScope2 = scopeOf(entry) === '2';
    const base = {
      scope: scopeOf(entry),
      ghg_category: categoryOf(entry),
      region: entry.engineRegion || 'IN',
      value: entry.amount ? String(entry.amount) : null,
      unit: entry.unit || null,
      facility_id: entry.facility || undefined,
      period_month: entry.periodMonth,
    };
    const ownFactor = supplied !== undefined ? {
      supplied_factor: String(supplied),
      supplied_factor_unit: entry.unit || undefined,
      supplied_factor_source: entry.customFactorSource || '',
    } : {};

    // The location-based line, at the published grid factor. A row with no
    // published factor at all has only the company's own number, so that is
    // what both views use.
    mappedRecords.push({
      ...base,
      ...(entry.engineActivityKey ? {} : ownFactor),
      record_id: entry.id,
      activity_key: entry.engineActivityKey || `supplied.${entry.id}`,
      scope2_view: isScope2 ? 'location' : undefined,
    });

    if (!isScope2) return;

    // The market-based line for the same kilowatt hours: the contracted rate
    // where there is one, and otherwise the same published factor, which is
    // the Guidance's fallback where no residual mix is published.
    mappedRecords.push({
      ...base,
      ...ownFactor,
      record_id: marketRecordId(entry.id),
      activity_key: supplied !== undefined
        ? `supplied.${marketRecordId(entry.id)}`
        : (entry.engineActivityKey as string),
      scope2_view: 'market',
    });
  });

  return { records: mappedRecords, unmapped: missing };
}

export function useEngineInventory(
  entries: ActivityEntry[], gwpSet: GwpSetName, reportingYear: number,
): EngineInventory {
  const [result, setResult] = useState<InventoryResult | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const abort = useRef<AbortController>();

  const { records, unmapped } = useMemo(() => recordsFor(entries), [entries]);

  const fingerprint = JSON.stringify([records, gwpSet, reportingYear]);

  useEffect(() => {
    if (records.length === 0) {
      setResult(undefined);
      setError(undefined);
      return undefined;
    }
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setLoading(true);

    calculateInventory(records, { gwpSet, reportingYear }, controller.signal)
      .then((calculated) => { setResult(calculated); setError(undefined); })
      .catch((caught: Error) => {
        if (caught.name === 'AbortError') return;
        setResult(undefined);
        setError(caught instanceof InventoryError ? caught.message : caught.message);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint]);

  return { result, loading, error, unmapped };
}
