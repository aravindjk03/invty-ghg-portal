import { z } from 'zod';
import { env } from '../config/env';
import { authService } from './authService';
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

const SERVICE_DOWN = `${env.ASSISTANT_NAME} is offline right now. Please try again later.`;

export async function getPcfHealth(): Promise<PcfHealth> {
  let res: Response;
  try {
    res = await fetch(`${env.PCF_API_BASE_URL}/health`);
  } catch {
    throw new PcfError('service_down', SERVICE_DOWN);
  }
  if (!res.ok) throw new PcfError('service_down', SERVICE_DOWN);
  return HealthSchema.parse(await res.json());
}

export async function estimateProduct(
  input: EstimateInput,
  signal?: AbortSignal
): Promise<EstimateResponse> {
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
    throw new PcfError('service_down', SERVICE_DOWN);
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
