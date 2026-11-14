/**
 * A returning visitor's last figures are shown early only for exactly the same
 * inputs AND the same engine build; anything else shows nothing from storage.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { keepLastInventory, readLastInventory } from './useEngineInventory';
import { InventoryResult } from '../types/inventory';

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});

const result = { run_id: 'run-1' } as unknown as InventoryResult;

describe('last calculation kept on this device', () => {
  it('is returned for the same inputs and engine build', () => {
    keepLastInventory('inputs-a', 'engine-1', result);
    expect(readLastInventory('inputs-a', 'engine-1')).toEqual(result);
  });

  it('is never returned when any input changed', () => {
    keepLastInventory('inputs-a', 'engine-1', result);
    expect(readLastInventory('inputs-b', 'engine-1')).toBeUndefined();
  });

  it('is never returned after the engine or its factors changed', () => {
    keepLastInventory('inputs-a', 'engine-1', result);
    expect(readLastInventory('inputs-a', 'engine-2')).toBeUndefined();
  });

  it('survives storage that cannot be read', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); } });
    expect(readLastInventory('inputs-a', 'engine-1')).toBeUndefined();
  });
});
