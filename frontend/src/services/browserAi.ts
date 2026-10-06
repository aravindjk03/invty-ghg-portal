/**
 * INSITY EDGE AI without a server: the product estimate run from this browser.
 *
 * Used only when the estimate service cannot be reached. The calculation
 * engine running in the page builds exactly the request the server would send
 * (service/browser_api.py), this module makes that one model call with an
 * access key the visitor entered, and the engine then validates the answer and
 * computes every figure from it. The model never states a total.
 *
 * The key is held in this browser's storage only. It is never part of the
 * published site, so it cannot be read from the page source or the repository.
 */
import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env';
import { engineFetch } from '../engine/engineFetch';
import { EstimateInput } from '../types/pcf';

const KEY_STORAGE = 'insity_edge_ai_access_key';

export function getAccessKey(): string | null {
  try {
    return localStorage.getItem(KEY_STORAGE);
  } catch {
    return null;
  }
}

export function setAccessKey(key: string): void {
  try {
    localStorage.setItem(KEY_STORAGE, key.trim());
  } catch {
    // Storage blocked (private window): the key lasts until the page closes.
    sessionKey = key.trim();
  }
}

export function clearAccessKey(): void {
  sessionKey = null;
  try {
    localStorage.removeItem(KEY_STORAGE);
  } catch {
    // nothing stored
  }
}

let sessionKey: string | null = null;
const currentKey = (): string | null => getAccessKey() || sessionKey;

export const hasAccessKey = (): boolean => Boolean(currentKey());

/** True when the site itself carries the free Gemini key, so no visitor needs one. */
export const hasBuiltInAi = (): boolean => Boolean(env.GEMINI_API_KEY);

/** A failure with the code and wording the page already knows how to show. */
export class BrowserAiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'BrowserAiError';
  }
}

const NAME = env.ASSISTANT_NAME;

async function engineJson(path: string, body: unknown, signal?: AbortSignal): Promise<{ status: number; body: any }> {
  const res = await engineFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

function fromEngine(status: number, body: any): never {
  const detail = body?.detail;
  if (detail && typeof detail === 'object' && 'code' in detail && 'message' in detail) {
    throw new BrowserAiError(String(detail.code), String(detail.message));
  }
  if (status === 422) {
    throw new BrowserAiError('invalid_input', 'Describe the product in a few words (2–300 characters).');
  }
  throw new BrowserAiError('ai_unavailable', `${NAME} could not complete this estimate. Please try again shortly.`);
}

/** The model call, with every failure translated into the assistant's own words. */
async function callModel(useBeta: boolean, params: any, signal?: AbortSignal) {
  const apiKey = currentKey();
  if (!apiKey) {
    throw new BrowserAiError('needs_key', `${NAME} needs its access key on this computer.`);
  }
  // The key is the visitor's own, typed into this page; nothing is embedded in the site.
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
  try {
    const stream = useBeta
      ? client.beta.messages.stream(params, { signal })
      : client.messages.stream(params, { signal });
    const message = await stream.finalMessage();
    return message;
  } catch (error) {
    if (error instanceof Anthropic.APIUserAbortError) {
      throw new DOMException('The operation was aborted.', 'AbortError');
    }
    if (error instanceof Anthropic.AuthenticationError) {
      throw new BrowserAiError('key_rejected', `That access key was not accepted. Enter it again.`);
    }
    if (error instanceof Anthropic.PermissionDeniedError) {
      throw new BrowserAiError('key_rejected', `That access key cannot use ${NAME}. Check the key.`);
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new BrowserAiError('ai_quota_exceeded',
        `${NAME} is busy right now. Wait a minute and try again.`);
    }
    if (error instanceof Anthropic.BadRequestError && /credit balance/i.test(error.message)) {
      throw new BrowserAiError('no_credit',
        `${NAME} has no usage credit on this access key. Add credit to the account and try again.`);
    }
    if (error instanceof Anthropic.APIConnectionError) {
      throw new BrowserAiError('ai_unavailable',
        `${NAME} could not be reached. Check the internet connection and try again.`);
    }
    if (error instanceof Anthropic.APIError) {
      throw new BrowserAiError('ai_unavailable',
        `${NAME} could not complete this estimate. Please try again shortly.`);
    }
    throw error;
  }
}

/** One product estimate, start to finish, in the shape the server returns. */
export async function estimateInBrowser(input: EstimateInput, signal?: AbortSignal): Promise<unknown> {
  const prepared = await engineJson('/v1/pcf/browser-request', input, signal);
  if (prepared.status !== 200) fromEngine(prepared.status, prepared.body);

  const message = await callModel(Boolean(prepared.body.use_beta), prepared.body.params, signal);

  const assembled = await engineJson('/v1/pcf/browser-assemble', { request: input, message }, signal);
  if (assembled.status !== 200) fromEngine(assembled.status, assembled.body);
  return assembled.body;
}

// ─── Free Gemini, built into the site ─────────────────────────────────────────

/** Free-tier answers are slow when Google is busy; give each attempt this long. */
const GEMINI_TIMEOUT_MS = 180_000;
/** Times through the whole model list before giving up. */
const GEMINI_ROUNDS = 3;
/** Statuses that mean "this model, not now": try the next one. */
const GEMINI_RETRY = new Set([429, 500, 502, 503, 504]);

const pause = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => {
    clearTimeout(timer);
    reject(new DOMException('The operation was aborted.', 'AbortError'));
  }, { once: true });
});

async function askGemini(prepared: { models: string[]; endpoint: string; body: unknown },
                         signal?: AbortSignal): Promise<{ status: number; data: unknown; model: string }> {
  let last = { status: 503, data: {} as unknown, model: prepared.models[0] };
  for (let round = 0; round < GEMINI_ROUNDS; round += 1) {
    for (const model of prepared.models) {
      const timeout = AbortSignal.timeout(GEMINI_TIMEOUT_MS);
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
      try {
        const res = await fetch(prepared.endpoint.replace('{model}', model), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
          body: JSON.stringify(prepared.body),
          signal: combined,
        });
        const data = await res.json().catch(() => ({}));
        last = { status: res.status, data, model };
        if (!GEMINI_RETRY.has(res.status)) return last;      // an answer, or a fault retrying cannot fix
      } catch (error) {
        if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
        last = { status: 503, data: {}, model };              // network drop or timeout: next model
      }
    }
    await pause(4000 * (round + 1), signal);                  // Google asks for a short wait when busy
  }
  return last;
}

/** One product estimate on the free Gemini models, in the shape the server returns. */
export async function estimateWithGemini(input: EstimateInput, signal?: AbortSignal): Promise<unknown> {
  const prepared = await engineJson('/v1/pcf/gemini-request', input, signal);
  if (prepared.status !== 200) fromEngine(prepared.status, prepared.body);

  const reply = await askGemini(prepared.body, signal);

  const assembled = await engineJson('/v1/pcf/gemini-assemble', { request: input, ...reply }, signal);
  if (assembled.status !== 200) fromEngine(assembled.status, assembled.body);
  return assembled.body;
}
