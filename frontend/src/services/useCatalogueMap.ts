/**
 * The catalogue-to-factor map, fetched once and shared.
 *
 * Kept out of the GHG context on purpose: an activity row needs this map to
 * name the factor it was calculated with, and importing the context into a row
 * component makes a module cycle between the context and the components it
 * renders. A module-level cache has no such problem, and the map never changes
 * during a session.
 */
import { useEffect, useState } from 'react';
import { CatalogueMap, getCatalogueMap } from './catalogueMap';

const EMPTY: CatalogueMap = new Map();

let cached: CatalogueMap | null = null;
let inFlight: Promise<CatalogueMap> | null = null;
const listeners = new Set<(map: CatalogueMap) => void>();

function load(): Promise<CatalogueMap> {
  if (cached) return Promise.resolve(cached);
  if (!inFlight) {
    inFlight = getCatalogueMap()
      .then((map) => {
        cached = map;
        listeners.forEach((listener) => listener(map));
        return map;
      })
      .catch(() => {
        // The engine is down. The status bar already says so, and a row with no
        // mapping keeps its honest "not calculated" state.
        inFlight = null;
        return EMPTY;
      });
  }
  return inFlight;
}

export function useCatalogueMap(): CatalogueMap {
  const [map, setMap] = useState<CatalogueMap>(cached ?? EMPTY);

  useEffect(() => {
    let cancelled = false;
    listeners.add(setMap);
    load().then((loaded) => { if (!cancelled) setMap(loaded); });
    return () => {
      cancelled = true;
      listeners.delete(setMap);
    };
  }, []);

  return map;
}
