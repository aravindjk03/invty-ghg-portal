import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { LeadSubmissionPayload } from '../types/leads.types';

/**
 * A lead the operator never receives is worse than no form at all: the visitor
 * believes they made contact. These tests pin the two failures that were live.
 */

function installStorage(opts: { throwOnWrite?: boolean } = {}) {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      if (opts.throwOnWrite) throw new DOMException('QuotaExceededError');
      store.set(k, String(v));
    },
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    get length() { return store.size; },
  });
  return store;
}

const lead = (over: Partial<LeadSubmissionPayload> = {}): LeadSubmissionPayload => ({
  name: 'Asha Rao',
  workEmail: 'asha@raometals.example',
  companyName: 'Rao Metals',
  sector: 'Steel & Ferroalloys',
  primaryNeed: 'cbam',
  referralSource: 'direct',
  ...over,
});

let leadService: typeof import('./leadService').leadService;

async function load() {
  vi.resetModules();
  ({ leadService } = await import('./leadService'));
}

beforeEach(() => {
  installStorage();
});

describe('when no server is reachable', () => {
  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await load();
  });

  it('never claims a lead was delivered', async () => {
    const result = await leadService.submit(lead());
    expect(result.delivered).toBe(false);
  });

  it('keeps the lead instead of losing it', async () => {
    await leadService.submit(lead());
    expect(leadService.pendingCount()).toBe(1);
  });

  it('sends what it kept once a server answers', async () => {
    await leadService.submit(lead({ workEmail: 'one@example.com' }));
    await leadService.submit(lead({ workEmail: 'two@example.com' }));
    expect(leadService.pendingCount()).toBe(2);

    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) } as Response)));

    expect(await leadService.flush()).toBe(2);
    expect(leadService.pendingCount()).toBe(0);
  });
});

describe('when the host answers but stores nothing', () => {
  it('treats a static 404 page as a failure, not a delivery', async () => {
    // GitHub Pages answers every unknown path with an HTML 404.
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error('html')) } as unknown as Response)));
    await load();
    const result = await leadService.submit(lead());
    expect(result.delivered).toBe(false);
    expect(leadService.pendingCount()).toBe(1);
  });

  it('treats a 200 that is not a success body as a failure', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ notOurShape: true }) } as Response)));
    await load();
    expect((await leadService.submit(lead())).delivered).toBe(false);
  });
});

describe('when a server accepts the lead', () => {
  it('reports it delivered and queues nothing', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, leadId: 'x' }) } as Response)));
    await load();
    const result = await leadService.submit(lead());
    expect(result).toEqual({ delivered: true, queued: false });
    expect(leadService.pendingCount()).toBe(0);
  });

  it('sends a JSON content type, or the server sees an empty body', async () => {
    const spy = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) } as Response));
    vi.stubGlobal('fetch', spy);
    await load();
    await leadService.submit(lead());
    const init = spy.mock.calls[0][1];
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });
});

describe('when this browser refuses to store anything', () => {
  it('says so rather than throwing out of its own handler', async () => {
    installStorage({ throwOnWrite: true });
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await load();
    const result = await leadService.submit(lead());
    expect(result).toEqual({ delivered: false, queued: false });
  });
});
