import { env } from '../config/env';
import {
  EstimateInput,
  EstimateResponse,
  EstimateResponseSchema,
  HealthSchema,
  PcfHealth,
} from '../types/pcf';

/** An error the page can explain in plain language. */
export class PcfError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'PcfError';
  }
}

const SERVICE_DOWN =
  'The Product Carbon service is not running. Start it with: npm run dev:pcf';

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
      headers: { 'Content-Type': 'application/json' },
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
      throw new PcfError(String(detail.code), String(detail.message));
    }
    if (res.status === 422) {
      throw new PcfError('invalid_input', 'Describe the product in a few words (2–300 characters).');
    }
    throw new PcfError('ai_unavailable', 'The estimate could not be completed. Try again shortly.');
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
