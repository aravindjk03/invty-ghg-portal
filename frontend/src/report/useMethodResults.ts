/**
 * Runs every saved IPCC method entry through the engine.
 *
 * Only the inputs are stored in the inventory; the answers are recalculated on
 * every change, including a change of GWP basis. That is deliberate: a landfill
 * stated under AR5 and left in place while the report switched to AR6 would be
 * a figure nobody could reproduce.
 *
 * An entry the engine refuses keeps its reason and is excluded from the totals
 * rather than being valued at zero.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { calculateMethod, MethodError } from '../services/methodsService';
import { GwpSetName } from '../types/inventory';
import { MethodEntry, MethodResult } from '../types/methods';

export interface MethodResults {
  /** Keyed by entry id. Only entries marked included are run. */
  byEntry: Map<string, MethodResult>;
  errors: Map<string, string>;
  loading: boolean;
  /** Total CO2e of every included entry that calculated, in kilograms. */
  totalCo2eKg: number;
}

export function useMethodResults(entries: MethodEntry[], gwpSet: GwpSetName): MethodResults {
  const [byEntry, setByEntry] = useState<Map<string, MethodResult>>(new Map());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const abort = useRef<AbortController>();

  const included = useMemo(() => entries.filter((entry) => entry.included), [entries]);
  const fingerprint = JSON.stringify([
    included.map((entry) => [entry.id, entry.input]), gwpSet,
  ]);

  useEffect(() => {
    if (included.length === 0) {
      setByEntry(new Map());
      setErrors(new Map());
      return undefined;
    }
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setLoading(true);

    Promise.all(included.map((entry) =>
      calculateMethod(entry.input, { gwpSet }, controller.signal)
        .then((result) => ({ entry, result }))
        .catch((caught: Error) => {
          if (caught.name === 'AbortError') throw caught;
          return {
            entry,
            error: caught instanceof MethodError ? caught.message : caught.message,
          };
        })))
      .then((settled) => {
        const results = new Map<string, MethodResult>();
        const failures = new Map<string, string>();
        settled.forEach((item) => {
          if ('result' in item && item.result) results.set(item.entry.id, item.result);
          if ('error' in item && item.error) failures.set(item.entry.id, item.error);
        });
        setByEntry(results);
        setErrors(failures);
      })
      .catch(() => { /* aborted: a newer run is already in flight */ })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint]);

  const totalCo2eKg = useMemo(() => {
    let total = 0;
    included.forEach((entry) => {
      const result = byEntry.get(entry.id);
      if (result) total += Number(result.co2e_kg);
    });
    return total;
  }, [included, byEntry]);

  return { byEntry, errors, loading, totalCo2eKg };
}
