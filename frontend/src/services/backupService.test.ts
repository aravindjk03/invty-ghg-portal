import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createBackup, restoreBackup, BackupError, BACKUP_VERSION } from './backupService';

/**
 * A backup that silently drops most of what it claims to hold is worse than
 * no backup: the reporter restores it, sees their rows, and does not notice
 * that the settings those rows are calculated under have reverted.
 */

const P = 'INVTY_GHG_INVENTORY_DATA_V2';
let store: Map<string, string>;

function installStorage() {
  store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    get length() { return store.size; },
  });
}

function seedAFullWorkspace() {
  store.set(`${P}_S1`, JSON.stringify([{ id: 's1', amount: 10 }]));
  store.set(`${P}_S2`, JSON.stringify([{ id: 's2' }]));
  store.set(`${P}_S3`, JSON.stringify([]));
  store.set(`${P}_METHODS`, JSON.stringify([{ id: 'm1' }]));
  store.set(`${P}_PERIOD`, JSON.stringify({ start: '2025-04', months: 12 }));
  store.set(`${P}_BOUNDARY`, 'Financial control');
  store.set(`${P}_STEEL_METHOD`, 'carbon_balance');
  store.set(`${P}_COMPANY`, 'Rao Metals Pvt Ltd');
  store.set(`${P}_GWP_SET`, 'AR6');
  store.set(`${P}_TURNOVER`, '480');
  store.set('INVTY_GHG_REPORT_META_V1', JSON.stringify({ baseYear: 'FY 2022-23' }));
}

beforeEach(() => installStorage());

describe('a backup round-trips', () => {
  it('carries the settings the rows are calculated under, not just the rows', () => {
    seedAFullWorkspace();
    const backup = createBackup();
    // The old export wrote three registers and dropped the rest.
    expect(Object.keys(backup.entries)).toEqual(expect.arrayContaining([
      `${P}_S1`, `${P}_S2`, `${P}_S3`, `${P}_METHODS`, `${P}_PERIOD`,
      `${P}_BOUNDARY`, `${P}_STEEL_METHOD`, `${P}_COMPANY`, `${P}_GWP_SET`,
      'INVTY_GHG_REPORT_META_V1',
    ]));
    expect(backup.version).toBe(BACKUP_VERSION);
  });

  it('restores every part it saved', () => {
    seedAFullWorkspace();
    const backup = createBackup();
    store.clear();

    const { restored, rejected } = restoreBackup(backup);
    expect(rejected).toEqual([]);
    expect(restored.length).toBe(Object.keys(backup.entries).length);
    expect(store.get(`${P}_BOUNDARY`)).toBe('Financial control');
    expect(store.get(`${P}_COMPANY`)).toBe('Rao Metals Pvt Ltd');
    expect(store.get(`${P}_GWP_SET`)).toBe('AR6');
    expect(store.get(`${P}_METHODS`)).toBe(JSON.stringify([{ id: 'm1' }]));
  });
});

describe('a file that is not a backup changes nothing', () => {
  it('refuses a non-object', () => {
    expect(() => restoreBackup('nope')).toThrow(BackupError);
    expect(() => restoreBackup(null)).toThrow(BackupError);
  });

  it('refuses a JSON file that holds nothing it recognises', () => {
    expect(() => restoreBackup({ some: 'other file' })).toThrow(BackupError);
  });

  it('does not empty a healthy inventory when the file is rubbish', () => {
    seedAFullWorkspace();
    expect(() => restoreBackup({ entries: { [`${P}_S1`]: 'not json at all' } })).toThrow(BackupError);
    // The rows that were there are still there.
    expect(JSON.parse(store.get(`${P}_S1`)!)).toHaveLength(1);
  });

  it('rejects a value of the wrong shape rather than writing it', () => {
    // A valid JSON object where an array belongs: the old code wrote this,
    // and the next reload emptied the inventory with no message.
    seedAFullWorkspace();
    const { restored, rejected } = restoreBackup({
      entries: { [`${P}_S1`]: '{}', [`${P}_BOUNDARY`]: 'Equity share' },
    });
    expect(rejected).toContain(`${P}_S1`);
    expect(restored).toContain(`${P}_BOUNDARY`);
    expect(JSON.parse(store.get(`${P}_S1`)!)).toHaveLength(1);
  });
});

describe('older backup files', () => {
  it('still restores a pre-v3 file that had the values at the top level', () => {
    const { restored } = restoreBackup({
      version: '2.0.0',
      companyName: 'Older Co',
      boundaryApproach: 'Equity share',
      scope1Entries: [{ id: 'a' }],
      scope2Entries: [],
      scope3Entries: [],
    });
    expect(restored).toContain(`${P}_S1`);
    expect(store.get(`${P}_COMPANY`)).toBe('Older Co');
    expect(store.get(`${P}_BOUNDARY`)).toBe('Equity share');
  });
});
