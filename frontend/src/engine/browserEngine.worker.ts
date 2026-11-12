/// <reference lib="webworker" />
/**
 * Runs the calculation engine (ghg_core, via service.browser_api) on Python
 * compiled to WebAssembly, off the main thread so the page never freezes while
 * Python starts or a large inventory calculates.
 *
 * Everything it loads is served by the site itself (see
 * scripts/build-browser-engine.mjs), so it works on static hosting.
 */

interface EngineRequest {
  id: number;
  base: string;
  method: string;
  path: string;
  query: string;
  body: string | null;
}

type Handle = (method: string, path: string, query: string, body: string | null) => string;

let booting: Promise<Handle> | null = null;

const progress = (stage: string) => self.postMessage({ id: 0, ok: true, progress: stage });

async function boot(base: string): Promise<Handle> {
  progress('downloading');
  // The version stamp names this build's engine, so the files below are
  // fetched under it: the service worker keeps them on disk between visits,
  // and a new deploy replaces them exactly once.
  const stamp = await fetch(`${base}engine/engine-version.json`, { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({})) as { version?: string };
  const v = stamp.version ? `?v=${stamp.version}` : '';

  // The runtime and the engine's own files download together.
  const filesRequest = fetch(`${base}engine/engine-files.json${v}`);
  const { loadPyodide } = await import(/* @vite-ignore */ `${base}pyodide/pyodide.mjs`);
  const py = await loadPyodide({ indexURL: `${base}pyodide/` });
  progress('starting_python');
  await py.loadPackage(['pydantic'], { checkIntegrity: true });

  const response = await filesRequest;
  if (!response.ok) throw new Error(`engine files not found (${response.status})`);
  const files = (await response.json()) as Record<string, string>;
  for (const [file, text] of Object.entries(files)) {
    const full = `/engine/${file}`;
    py.FS.mkdirTree(full.slice(0, full.lastIndexOf('/')));
    py.FS.writeFile(full, text);
  }

  progress('loading_factors');
  py.runPython("import sys; sys.path.insert(0, '/engine')");
  const handle = py.pyimport('service.browser_api').handle as Handle;
  // Read the factor tables now, while the visitor is still signing in, so the
  // first calculation does not pay for it.
  py.runPython('from service.inventory import load_registry; load_registry()');
  progress('ready');
  return handle;
}

self.onmessage = async (event: MessageEvent<EngineRequest>) => {
  const { id, base, method, path, query, body } = event.data;
  try {
    booting ??= boot(base);
    const handle = await booting;
    self.postMessage({ id, ok: true, result: handle(method, path, query, body) });
  } catch (error) {
    // A failed start must not be cached, or one network blip would disable the
    // engine for the rest of the visit.
    booting = null;
    self.postMessage({ id, ok: false, error: String((error as Error)?.message ?? error) });
  }
};
