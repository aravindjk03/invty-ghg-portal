/**
 * Registers the service worker that keeps the engine on this device between
 * visits (public/sw.js), then starts the engine.
 *
 * The first visit still downloads the engine once; the worker is registered
 * first so that download is kept. If the browser has no service worker, or
 * registration fails, the engine starts exactly as before.
 */
import { engineVersion, warmEngine } from './engineFetch';

/** How long to wait for the service worker to take control before starting anyway. */
const CONTROL_TIMEOUT_MS = 1500;

function controlled(): Promise<void> {
  if (navigator.serviceWorker.controller) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => resolve();
    navigator.serviceWorker.addEventListener('controllerchange', done, { once: true });
    setTimeout(done, CONTROL_TIMEOUT_MS);
  });
}

export async function startEngine(): Promise<void> {
  try {
    if (import.meta.env.PROD && 'serviceWorker' in navigator) {
      const stamp = await engineVersion();
      if (stamp?.version) {
        await navigator.serviceWorker.register(
          `${import.meta.env.BASE_URL}sw.js?v=${stamp.version}`,
          { scope: import.meta.env.BASE_URL });
        await controlled();
      }
    }
  } catch {
    // No service worker: the engine still runs, it is just not kept.
  }
  warmEngine();
}
