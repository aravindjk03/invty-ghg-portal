import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * The browser-only trial must not ship a working account.
 *
 * A previous version seeded two accounts into the published bundle, one of them
 * an ADMIN with the password in plain sight. On a public static deployment that
 * is a sign-in for anyone who reads the JavaScript, so these tests pin the
 * behaviour: nothing exists until a visitor registers it.
 */

function installBrowserStubs() {
  const store = new Map<string, string>();
  const localStorageStub = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
  vi.stubGlobal('localStorage', localStorageStub);
  // No API anywhere: every request fails, as on static hosting.
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
  return store;
}

let authService: typeof import('./authService').authService;

beforeEach(async () => {
  installBrowserStubs();
  vi.resetModules();
  ({ authService } = await import('./authService'));
});

describe('browser-only sign-in', () => {
  it('ships no account at all', async () => {
    await expect(authService.login('anyone@example.com', 'anything')).rejects.toThrow();
  });

  it('does not accept the credentials that used to be seeded into the bundle', async () => {
    // Regression guard. These two pairs were readable in the published site.
    await expect(authService.login('admin@invty.com', 'Invty@2026')).rejects.toThrow();
    await expect(authService.login('demo@company.com', 'Demo@1234')).rejects.toThrow();
  });

  it('reports no server when nothing answers the health check', async () => {
    await expect(authService.hasServer()).resolves.toBe(false);
  });

  it('signs in an account the visitor registered themselves', async () => {
    const created = await authService.signup({
      name: 'Asha Rao',
      email: 'asha@example.com',
      password: 'correct horse battery',
      companyName: 'Rao Metals',
    });
    expect(created.user.email).toBe('asha@example.com');
    expect(created.user.companyName).toBe('Rao Metals');

    const signedIn = await authService.login('asha@example.com', 'correct horse battery');
    expect(signedIn.user.id).toBe(created.user.id);
  });

  it('refuses the wrong password for an account that does exist', async () => {
    await authService.signup({
      name: 'Asha Rao',
      email: 'asha@example.com',
      password: 'correct horse battery',
      companyName: 'Rao Metals',
    });
    await expect(authService.login('asha@example.com', 'guess')).rejects.toThrow();
  });

  it('refuses a second account on the same email', async () => {
    const payload = {
      name: 'Asha Rao',
      email: 'asha@example.com',
      password: 'correct horse battery',
      companyName: 'Rao Metals',
    };
    await authService.signup(payload);
    await expect(authService.signup(payload)).rejects.toThrow(/already exists/i);
  });
});

describe('mobile verification without an SMS service', () => {
  it('says the code is on screen rather than claiming a text was sent', async () => {
    const sent = await authService.sendMobileOtp('+919876543210');
    expect(sent.codeOnScreen).toMatch(/^\d{6}$/);
    expect(sent.message).toMatch(/shown on screen/i);
  });

  it('only accepts the code it actually issued', async () => {
    const sent = await authService.sendMobileOtp('+919876543210');
    const wrong = sent.codeOnScreen === '000000' ? '111111' : '000000';

    await expect(
      authService.verifyMobileOtp({ phone: '+919876543210', code: wrong })
    ).rejects.toThrow();

    const ok = await authService.verifyMobileOtp({
      phone: '+919876543210',
      code: sent.codeOnScreen!,
      name: 'Asha Rao',
      companyName: 'Rao Metals',
    });
    expect(ok.user.phone).toBe('+919876543210');
  });

  it('does not let the same code be used twice', async () => {
    const sent = await authService.sendMobileOtp('+919876543210');
    await authService.verifyMobileOtp({ phone: '+919876543210', code: sent.codeOnScreen! });
    await expect(
      authService.verifyMobileOtp({ phone: '+919876543210', code: sent.codeOnScreen! })
    ).rejects.toThrow();
  });
});
