/**
 * Backup and restore for a browser-held inventory.
 *
 * What this replaces: the export wrote seven fields and the import read back
 * three of them — the Scope 1, 2 and 3 rows — while reporting "Backup restored
 * successfully". Everything else in the file was dropped on the floor: the
 * organisation, the reporting period, the consolidation boundary, the steel
 * method, the IPCC method entries that feed Scope 1, and all forty report
 * metadata fields. A reporter restoring last quarter's backup got their rows
 * back and silently lost the settings those rows are calculated under.
 *
 * Worse, the import checked `if (json.scope1Entries)` — truthiness, not shape.
 * Any JSON carrying that key was written straight to storage, and on the
 * reload that followed the parse threw and the inventory was emptied with no
 * message at all.
 *
 * Everything this app persists now goes in the file, every value is checked
 * before it is written, and a file that cannot be read changes nothing.
 */

const PREFIX = 'INVTY_GHG_INVENTORY_DATA_V2';

/** Every key the app persists, and how to recognise a valid value. */
const BACKED_UP: Record<string, 'array' | 'object' | 'string' | 'number'> = {
  [`${PREFIX}_S1`]: 'array',
  [`${PREFIX}_S2`]: 'array',
  [`${PREFIX}_S3`]: 'array',
  [`${PREFIX}_METHODS`]: 'array',
  [`${PREFIX}_PERIOD`]: 'object',
  [`${PREFIX}_TD_LOSS`]: 'object',
  [`${PREFIX}_FX`]: 'object',
  [`${PREFIX}_ELEC_WTT`]: 'object',
  [`${PREFIX}_TURNOVER`]: 'number',
  [`${PREFIX}_BOUNDARY`]: 'string',
  [`${PREFIX}_STEEL_METHOD`]: 'string',
  [`${PREFIX}_COMPANY`]: 'string',
  [`${PREFIX}_GWP_SET`]: 'string',
  [`${PREFIX}_SETUP`]: 'string',
  INVTY_GHG_REPORT_META_V1: 'object',
};

export const BACKUP_VERSION = 3;

export interface Backup {
  version: number;
  exportedAt: string;
  /** Raw stored strings, keyed exactly as the app stores them. */
  entries: Record<string, string>;
}

export interface RestoreOutcome {
  restored: string[];
  /** Keys present in the file whose value did not match its expected shape. */
  rejected: string[];
}

export class BackupError extends Error {}

function shapeOf(raw: string, expected: 'array' | 'object' | 'string' | 'number'): boolean {
  if (expected === 'string') return raw.length > 0;
  if (expected === 'number') return Number.isFinite(Number(raw));
  try {
    const parsed = JSON.parse(raw);
    if (expected === 'array') return Array.isArray(parsed);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

export function createBackup(): Backup {
  const entries: Record<string, string> = {};
  for (const key of Object.keys(BACKED_UP)) {
    try {
      const value = localStorage.getItem(key);
      if (value !== null) entries[key] = value;
    } catch {
      // Unreadable storage: the key is simply absent from the file.
    }
  }
  return { version: BACKUP_VERSION, exportedAt: new Date().toISOString(), entries };
}

/**
 * Writes a backup back into storage. Validates every value first and writes
 * nothing at all if the file is not a backup, so a bad file cannot empty an
 * inventory that was fine a moment ago.
 */
export function restoreBackup(parsed: unknown): RestoreOutcome {
  if (!parsed || typeof parsed !== 'object') {
    throw new BackupError('That file is not an IINVTY backup.');
  }

  const file = parsed as Partial<Backup> & Record<string, unknown>;

  // Backups written before this module had the values at the top level.
  const entries: Record<string, string> = file.entries && typeof file.entries === 'object'
    ? (file.entries as Record<string, string>)
    : legacyEntries(file);

  const keys = Object.keys(entries).filter((key) => key in BACKED_UP);
  if (keys.length === 0) {
    throw new BackupError('That file holds no inventory data this version recognises.');
  }

  const restored: string[] = [];
  const rejected: string[] = [];

  // Check everything before writing anything.
  const writable = keys.filter((key) => {
    const raw = entries[key];
    if (typeof raw !== 'string' || !shapeOf(raw, BACKED_UP[key])) {
      rejected.push(key);
      return false;
    }
    return true;
  });

  if (writable.length === 0) {
    throw new BackupError('Every value in that file was unreadable, so nothing was changed.');
  }

  for (const key of writable) {
    try {
      localStorage.setItem(key, entries[key]);
      restored.push(key);
    } catch {
      rejected.push(key);
    }
  }

  return { restored, rejected };
}

/** A pre-v3 backup: `{ companyName, scope1Entries, ... }` at the top level. */
function legacyEntries(file: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (key: string, value: unknown) => {
    if (value !== undefined && value !== null) out[key] = JSON.stringify(value);
  };
  put(`${PREFIX}_S1`, file.scope1Entries);
  put(`${PREFIX}_S2`, file.scope2Entries);
  put(`${PREFIX}_S3`, file.scope3Entries);
  if (typeof file.companyName === 'string' && file.companyName) {
    out[`${PREFIX}_COMPANY`] = file.companyName;
  }
  if (typeof file.boundaryApproach === 'string' && file.boundaryApproach) {
    out[`${PREFIX}_BOUNDARY`] = file.boundaryApproach;
  }
  if (typeof file.steelMethod === 'string' && file.steelMethod) {
    out[`${PREFIX}_STEEL_METHOD`] = file.steelMethod;
  }
  return out;
}
