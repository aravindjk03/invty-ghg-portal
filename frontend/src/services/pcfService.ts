import { z } from 'zod';
import { env } from '../config/env';
import { authService } from './authService';
import {
  BrowserAiError, estimateInBrowser, estimateWithGemini, hasAccessKey, hasBuiltInAi,
} from './browserAi';
import {
  EstimateInput,
  EstimateResponse,
  EstimateResponseSchema,
  HealthSchema,
  PcfHealth,
} from '../types/pcf';

/** An error the page can explain in plain language. */
export class PcfError extends Error {
  constructor(
    public code: string,
    message: string,
    /** Present on `estimate_limit_reached`, so the wall can show the numbers. */
    public entitlement?: Entitlement,
  ) {
    super(message);
    this.name = 'PcfError';
  }
}

export const EntitlementSchema = z.object({
  plan: z.enum(['free', 'premium']),
  estimatesUsed: z.number(),
  estimatesLimit: z.number().nullable(),
  estimatesRemaining: z.number().nullable(),
});
export type Entitlement = z.infer<typeof EntitlementSchema>;

/** The signed-in user's bearer token, for the endpoints that meter usage. */
function authHeaders(): Record<string, string> {
  const token = authService.getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * What this account's plan allows.
 *
 * Read from the server every time rather than remembered in the browser: a
 * count the page could edit is not a count, and this one decides whether the
 * customer is asked to pay.
 */
export async function getEntitlement(): Promise<Entitlement | null> {
  // Run from this browser there is no account metering to report.
  if (serviceMode === 'browser') return null;
  let res: Response;
  try {
    res = await fetch(`${env.PCF_API_BASE_URL}/v1/pcf/entitlement`, { headers: authHeaders() });
  } catch {
    return null;        // the page carries on; the estimate itself will report it
  }
  if (!res.ok) return null;
  const body = await res.json().catch(() => null);
  const parsed = EntitlementSchema.safeParse(body?.entitlement);
  return parsed.success ? parsed.data : null;
}


/** How long the estimate service gets to answer before the page runs it itself. */
const SERVICE_TIMEOUT_MS = 6000;

/**
 * Whether estimates go to the service or are made from this browser. Decided by
 * the health check: no reachable service means the browser, where the visitor's
 * own access key is used (see browserAi.ts).
 */
let serviceMode: 'unknown' | 'server' | 'browser' = 'unknown';

function browserHealth(): PcfHealth {
  return {
    status: 'ok',
    assistant: env.ASSISTANT_NAME,
    ai_ready: hasBuiltInAi() || hasAccessKey(),
    engine_version: 'browser',
    catalogue_rows: 0,
    verified_factors: 0,
    cache_enabled: false,
    rate_limit_per_hour: 0,
    mode: 'browser',
  };
}

export async function getPcfHealth(): Promise<PcfHealth> {
  if (serviceMode === 'browser') return browserHealth();
  try {
    const res = await fetch(`${env.PCF_API_BASE_URL}/health`, {
      signal: AbortSignal.timeout(SERVICE_TIMEOUT_MS),
    });
    if (res.ok) {
      const health = HealthSchema.parse(await res.json());
      serviceMode = 'server';
      return { ...health, mode: 'server' };
    }
  } catch {
    // unreachable, asleep or not deployed: fall through to the browser
  }
  serviceMode = 'browser';
  return browserHealth();
}

/**
 * Estimates made from this browser, kept so the same product asked twice gets
 * the same answer. The server caches the same way; without this a free model
 * could give two different figures for one product in the same demo.
 */
const ESTIMATE_CACHE = 'insity_edge_ai_estimates_v1';
const CACHE_LIMIT = 40;

const cacheKey = (input: EstimateInput) =>
  JSON.stringify([input.product.trim().toLowerCase(), input.region, input.details.trim().toLowerCase()]);

function readCache(): Record<string, EstimateResponse> {
  try {
    return JSON.parse(localStorage.getItem(ESTIMATE_CACHE) || '{}');
  } catch {
    return {};
  }
}

function remember(input: EstimateInput, estimate: EstimateResponse): void {
  try {
    const cache = readCache();
    cache[cacheKey(input)] = estimate;
    const keys = Object.keys(cache);
    keys.slice(0, Math.max(0, keys.length - CACHE_LIMIT)).forEach((key) => delete cache[key]);
    localStorage.setItem(ESTIMATE_CACHE, JSON.stringify(cache));
  } catch {
    // storage unavailable: the estimate is still shown, just not kept
  }
}

async function estimateHere(input: EstimateInput, signal?: AbortSignal): Promise<EstimateResponse> {
  const kept = EstimateResponseSchema.safeParse(readCache()[cacheKey(input)]);
  if (kept.success) return kept.data;
  let body: unknown;
  try {
    // A visitor's own Claude key, when they gave one, is used; otherwise the
    // free Gemini models built into the site.
    body = hasAccessKey() || !hasBuiltInAi()
      ? await estimateInBrowser(input, signal)
      : await estimateWithGemini(input, signal);
  } catch (err) {
    if (err instanceof BrowserAiError) throw new PcfError(err.code, err.message);
    throw err;
  }
  const parsed = EstimateResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new PcfError('bad_response',
      'The service returned a result in an unexpected shape, so it was not displayed.');
  }
  remember(input, parsed.data);
  return parsed.data;
}

export async function estimateProduct(
  input: EstimateInput,
  signal?: AbortSignal
): Promise<EstimateResponse> {
  if (serviceMode === 'browser') return estimateHere(input, signal);
  let res: Response;
  try {
    res = await fetch(`${env.PCF_API_BASE_URL}/v1/pcf/estimate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(input),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    // The service went away after the health check: carry on from the browser.
    serviceMode = 'browser';
    return estimateHere(input, signal);
  }

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const detail = body?.detail;
    if (detail && typeof detail === 'object' && 'code' in detail && 'message' in detail) {
      const entitlement = EntitlementSchema.safeParse((detail as Record<string, unknown>).entitlement);
      throw new PcfError(
        String(detail.code),
        String(detail.message),
        entitlement.success ? entitlement.data : undefined,
      );
    }
    if (res.status === 422) {
      throw new PcfError('invalid_input', 'Describe the product in a few words (2–300 characters).');
    }
    throw new PcfError('ai_unavailable', `${env.ASSISTANT_NAME} could not complete this estimate. Please try again shortly.`);
  }

  const parsed = EstimateResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new PcfError(
      'bad_response',
      'The service returned a result in an unexpected shape, so it was not displayed.'
    );
  }
  return parsed.data;
}
