/**
 * Runs the inventory through the engine and reports what it could not do.
 *
 * A row is only calculated when it names a published factor. Rows that do not
 * are returned as `unmapped` so the report can list them in its exclusion
 * register — never silently valued at zero, and never calculated here by a
 * second method.
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

export function useEngineInventory(
  entries: ActivityEntry[], gwpSet: GwpSetName, reportingYear: number,
): EngineInventory {
  const [result, setResult] = useState<InventoryResult | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const abort = useRef<AbortController>();

  const { records, unmapped } = useMemo(() => {
    const mappedRecords: InventoryRecordInput[] = [];
    const missing: ActivityEntry[] = [];
    entries.forEach((entry) => {
      if (!entry.engineActivityKey) {
        missing.push(entry);
        return;
      }
      mappedRecords.push({
        record_id: entry.id,
        activity_key: entry.engineActivityKey,
        scope: scopeOf(entry),
        ghg_category: categoryOf(entry),
        region: entry.engineRegion || 'IN',
        value: entry.amount ? String(entry.amount) : null,
        unit: entry.unit || null,
        facility_id: entry.facility || undefined,
        scope2_view: entry.category === 'market_instruments' ? 'market' : undefined,
        period_month: entry.periodMonth,
      });
    });
    return { records: mappedRecords, unmapped: missing };
  }, [entries]);

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
