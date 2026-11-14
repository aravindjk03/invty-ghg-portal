/**
 * Where a calculation runs: the calculation server when one is reachable,
 * otherwise the same engine running in this browser.
 *
 * Both run the identical ghg_core code against the identical factor tables
 * (tests/test_browser_api.py holds them to it), so a figure never depends on
 * which answered. The browser engine is what lets the free static site work
 * with no server at all, and keeps a sleeping or unreachable server from
 * blanking every page.
 *
 * Only the deterministic calculation endpoints come through here. The AI
 * product estimate needs secret keys and stays on the server.
 */
import { env } from '../config/env';

/** How long the server gets to answer before the browser engine takes over. */
const SERVER_TIMEOUT_MS = 6000;

type ServerState = 'unknown' | 'up' | 'down';
let serverState: ServerState = env.PCF_API_BASE_URL ? 'unknown' : 'down';

interface WorkerReply {
  id: number; ok: boolean; result?: string; error?: string;
  /** Sent while the engine starts: where it has got to. */
  progress?: EngineStage;
}

/** Where the in-browser engine has got to while it starts. */
export type EngineStage = 'idle' | 'downloading' | 'starting_python' | 'loading_factors' | 'ready' | 'failed';

let stage: EngineStage = 'idle';
const stageListeners = new Set<(stage: EngineStage) => void>();

function setStage(next: EngineStage): void {
  if (stage === next) return;
  stage = next;
  stageListeners.forEach((listener) => listener(next));
}

export function engineStage(): EngineStage { return stage; }

export function onEngineStage(listener: (stage: EngineStage) => void): () => void {
  stageListeners.add(listener);
  return () => { stageListeners.delete(listener); };
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (text: string) => void; reject: (error: Error) => void }>();

function engineWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./browserEngine.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<WorkerReply>) => {
    if (event.data.progress) {
      setStage(event.data.progress);
      return;
    }
    const call = pending.get(event.data.id);
    if (!call) return;
    pending.delete(event.data.id);
    if (event.data.ok) {
      setStage('ready');
      call.resolve(event.data.result!);
    } else call.reject(new Error(event.data.error || 'The in-browser engine failed.'));
  };
  worker.onerror = (event) => {
    setStage('failed');
    pending.forEach((call) => call.reject(new Error(event.message || 'The in-browser engine failed.')));
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

function siteBase(): string {
  return new URL(import.meta.env.BASE_URL, window.location.href).href;
}

function abortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError');
}

async function runInBrowser(path: string, init: RequestInit): Promise<Response> {
  const signal = init.signal ?? undefined;
  if (signal?.aborted) throw abortError();
  const url = new URL(path, 'http://engine.local');
  const id = nextId++;

  const text = await new Promise<string>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    if (stage === 'idle' || stage === 'failed') setStage('downloading');
    signal?.addEventListener('abort', () => { pending.delete(id); reject(abortError()); }, { once: true });
    engineWorker().postMessage({
      id,
      base: siteBase(),
      method: (init.method || 'GET').toUpperCase(),
      path: url.pathname,
      query: url.search.replace(/^\?/, ''),
      body: typeof init.body === 'string' ? init.body : null,
    });
  });

  const { status, body } = JSON.parse(text) as { status: number; body: unknown };
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/**
 * The engine build's version stamp (scripts/build-browser-engine.mjs). Read
 * once, never from cache, so a new deploy is noticed on the next visit.
 */
interface EngineVersion { version: string; static: string[] }
let versionInFlight: Promise<EngineVersion | null> | null = null;

export function engineVersion(): Promise<EngineVersion | null> {
  versionInFlight ??= fetch(`${siteBase()}engine/engine-version.json`, { cache: 'no-cache' })
    .then((response) => (response.ok ? response.json() as Promise<EngineVersion> : null))
    .catch(() => null);
  return versionInFlight;
}

/**
 * The engine's fixed answers - the factor map, unit choices, methods list and
 * GWP sets - written at build time by the engine's own handler. Read as files
 * they appear at once instead of after Python has started.
 */
const STATIC_ANSWERS: Record<string, string> = {
  '/v1/inventory/catalogue-map': 'catalogue-map.json',
  '/v1/inventory/unit-choices': 'unit-choices.json',
  '/v1/methods': 'methods.json',
  '/v1/inventory/gwp-sets': 'gwp-sets.json',
};

async function staticAnswer(path: string, init: RequestInit): Promise<Response | null> {
  const file = STATIC_ANSWERS[path];
  if (!file || (init.method && init.method.toUpperCase() !== 'GET')) return null;
  const version = await engineVersion();
  if (!version?.static.includes(file)) return null;
  try {
    const response = await fetch(`${siteBase()}engine/static/${file}?v=${version.version}`,
      { signal: init.signal ?? undefined });
    if (!response.ok) return null;
    const body = await response.text();
    return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    return null;
  }
}

/**
 * Starts the in-browser engine now, so it downloads and boots while the visitor
 * is still signing in rather than after. Does nothing when a calculation
 * server is configured: that answers instead.
 */
export function warmEngine(): void {
  if (serverState !== 'down' || worker) return;
  runInBrowser('/health', {}).catch(() => { /* reported when a real request fails */ });
}

/** True when the reply came from the calculation server rather than a host page or proxy. */
function isEngineReply(response: Response): boolean {
  if (response.status >= 500 || response.status === 404) return false;
  return (response.headers.get('Content-Type') || '').includes('application/json');
}

async function tryServer(path: string, init: RequestInit): Promise<Response | null> {
  const timeout = AbortSignal.timeout(SERVER_TIMEOUT_MS);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  try {
    const response = await fetch(`${env.PCF_API_BASE_URL}${path}`, { ...init, signal });
    if (isEngineReply(response)) {
      serverState = 'up';
      return response;
    }
  } catch (error) {
    if (init.signal?.aborted) throw error;
  }
  serverState = 'down';
  return null;
}

/**
 * fetch() for the calculation endpoints. `path` is the server path, e.g.
 * '/v1/inventory/calculate'. Resolves to a Response either way, so callers
 * handle status and body exactly as they would from the server.
 */
export async function engineFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const fixed = await staticAnswer(path, init);
  if (fixed) return fixed;
  if (serverState !== 'down') {
    const fromServer = await tryServer(path, init);
    if (fromServer) return fromServer;
  }
  return runInBrowser(path, init);
}

/** Which engine answered most recently, for status displays. */
export function engineLocation(): 'server' | 'browser' | 'unknown' {
  return serverState === 'up' ? 'server' : serverState === 'down' ? 'browser' : 'unknown';
}
