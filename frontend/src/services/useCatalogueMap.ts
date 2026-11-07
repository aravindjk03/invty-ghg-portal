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
  return useCatalogueMapState().map;
}

/**
 * The map, and whether it is still being fetched.
 *
 * An empty map means two very different things: the engine is still starting
 * (it boots Python and several wheels, which takes seconds on a first visit),
 * or it answered and there is genuinely nothing. Without the difference the
 * app told every visitor "No row names a published factor yet" for the whole
 * boot — the same words it uses for a real failure — beside 0.00 totals.
 */
export function useCatalogueMapState(): { map: CatalogueMap; loading: boolean } {
  const [map, setMap] = useState<CatalogueMap>(cached ?? EMPTY);
  const [loading, setLoading] = useState<boolean>(cached === null);

  useEffect(() => {
    let cancelled = false;
    listeners.add(setMap);
    load().then((loaded) => {
      if (cancelled) return;
      setMap(loaded);
      setLoading(false);
    });
    return () => {
      cancelled = true;
      listeners.delete(setMap);
    };
  }, []);

  return { map, loading };
}
