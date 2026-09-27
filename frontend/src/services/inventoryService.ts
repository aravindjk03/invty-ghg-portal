/**
 * Talks to the calculation engine.
 *
 * There is deliberately no local fallback arithmetic. If the engine cannot be
 * reached the page says so; it does not quietly produce a second set of numbers
 * from a different method, which is how two figures for the same inventory
 * reach a report.
 */
import { env } from '../config/env';
import {
  ActivitySchema, GwpSetName, GwpSetInfo, GwpSetSchema, InventoryRecordInput,
  InventoryResponseSchema, InventoryResult, SelectableActivity,
} from '../types/inventory';

export class InventoryError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'InventoryError';
  }
}

const ENGINE_DOWN =
  'The calculation engine is not reachable, so no figures can be shown. Nothing has been lost: '
  + 'your entries are saved and will calculate when it is back.';

async function getJson(path: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${env.PCF_API_BASE_URL}${path}`);
  } catch {
    throw new InventoryError('engine_down', ENGINE_DOWN);
  }
  if (!response.ok) throw new InventoryError('engine_error', ENGINE_DOWN);
  return response.json();
}

/** The GWP bases a customer may report on, each with the source it was read from. */
export async function getGwpSets(): Promise<GwpSetInfo[]> {
  return GwpSetSchema.array().parse(await getJson('/v1/inventory/gwp-sets'));
}

/** The activities that may be recorded in this scope, from the ingested factor sets. */
export async function searchActivities(
  scope?: string, search?: string, region?: string, limit = 100,
): Promise<SelectableActivity[]> {
  const query = new URLSearchParams();
  if (scope) query.set('scope', scope);
  if (search) query.set('search', search);
  if (region) query.set('region', region);
  query.set('limit', String(limit));
  return ActivitySchema.array().parse(await getJson(`/v1/inventory/activities?${query}`));
}

export async function calculateInventory(
  records: InventoryRecordInput[],
  options: { gwpSet: GwpSetName; reportingYear: number; scope2View?: 'location' | 'market' },
  signal?: AbortSignal,
): Promise<InventoryResult> {
  let response: Response;
  try {
    response = await fetch(`${env.PCF_API_BASE_URL}/v1/inventory/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        records,
        gwp_set: options.gwpSet,
        reporting_year: options.reportingYear,
        scope2_view: options.scope2View ?? 'location',
      }),
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new InventoryError('engine_down', ENGINE_DOWN);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = (body as { detail?: unknown } | null)?.detail;
    throw new InventoryError(
      'engine_error',
      typeof detail === 'string' ? detail
        : 'The engine rejected these records. Check the units and activities used.',
    );
  }

  const parsed = InventoryResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new InventoryError('bad_response',
      'The engine returned a result in an unexpected shape, so it was not displayed.');
  }
  return parsed.data;
}
