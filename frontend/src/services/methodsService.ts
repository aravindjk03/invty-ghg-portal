/**
 * Talks to the IPCC methods in the calculation engine.
 *
 * As with the inventory, there is no local fallback arithmetic. A landfill's
 * decay curve and a herd's methane are not things the browser recomputes from a
 * remembered answer; if the engine cannot be reached the page says so.
 */
import { env } from '../config/env';
import { GwpSetName } from '../types/inventory';
import {
  MethodInfo, MethodInfoSchema, MethodInput, MethodResult, MethodResultSchema,
} from '../types/methods';

export class MethodError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'MethodError';
  }
}

const ENGINE_DOWN =
  'The calculation engine is not reachable, so this source cannot be calculated. Nothing has '
  + 'been lost: the inputs are saved and will calculate when it is back.';

/** Every method, with the choices its form may offer, read from the IPCC tables. */
export async function getMethodCatalogue(): Promise<MethodInfo[]> {
  let response: Response;
  try {
    response = await fetch(`${env.PCF_API_BASE_URL}/v1/methods`);
  } catch {
    throw new MethodError('engine_down', ENGINE_DOWN);
  }
  if (!response.ok) throw new MethodError('engine_error', ENGINE_DOWN);
  return MethodInfoSchema.array().parse(await response.json());
}

export async function calculateMethod(
  input: MethodInput, options: { gwpSet: GwpSetName }, signal?: AbortSignal,
): Promise<MethodResult> {
  let response: Response;
  try {
    response = await fetch(`${env.PCF_API_BASE_URL}/v1/methods/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({ ...input, gwp_set: options.gwpSet }),
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new MethodError('engine_down', ENGINE_DOWN);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = (body as { detail?: unknown } | null)?.detail;
    // 422 carries the method's own refusal - a parameter IPCC never published,
    // a herd on pasture that belongs in managed soils - and those sentences say
    // what to do about it, so they are shown as written.
    throw new MethodError(
      'refused',
      typeof detail === 'string' ? detail
        : 'The engine could not calculate this source from the inputs given.',
    );
  }

  const parsed = MethodResultSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new MethodError('bad_response',
      'The engine returned a result in an unexpected shape, so it was not displayed.');
  }
  return parsed.data;
}
