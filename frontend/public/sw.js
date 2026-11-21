/*
 * Keeps the calculation engine on this device between visits.
 *
 * The engine is Python compiled to WebAssembly, about 18 MB. GitHub Pages lets
 * a browser keep a file for only ten minutes, so without this every visit
 * downloaded the whole engine again before a single figure could be shown.
 *
 * Only the engine's own files are kept: the Python runtime (pyodide/) and the
 * engine bundle and its fixed answers (engine/). They are stored under the
 * build's version stamp, which this script is registered with (sw.js?v=...),
 * so a deploy that changes the engine is downloaded exactly once and an
 * unchanged one never again. Everything else - the app itself, sign-in, any
 * server call - always goes to the network as before.
 */
const VERSION = new URL(self.location.href).searchParams.get('v') || 'unversioned';
const CACHE = `iinvty-engine-${VERSION}`;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith('iinvty-engine-') && name !== CACHE)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

function isEngineFile(url) {
  if (url.origin !== self.location.origin) return false;
  // The version stamp itself must always be fresh, or a deploy is never seen.
  if (url.pathname.endsWith('/engine/engine-version.json')) return false;
  return url.pathname.includes('/pyodide/') || url.pathname.includes('/engine/');
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (!isEngineFile(url)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const kept = await cache.match(request);
    if (kept) return kept;
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      cache.put(request, response.clone()).catch(() => { /* quota: serve without keeping */ });
    }
    return response;
  })());
});
