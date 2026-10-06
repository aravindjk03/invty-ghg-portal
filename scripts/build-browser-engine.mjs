// Package the calculation engine so the website can run it without a server.
//
//   node scripts/build-browser-engine.mjs      (run by the frontend's build and dev scripts)
//
// Writes, under frontend/public (both generated, both gitignored):
//   pyodide/  Python for the browser (from the pinned `pyodide` npm package) and
//             the five wheels service.browser_api needs, from
//             frontend/vendor/pyodide-packages. Every wheel is checked against
//             the SHA-256 in Pyodide's own lock file, and the lock is cut down
//             to the packages actually shipped.
//   engine/engine-files.json  ghg_core, the calculation endpoints and the
//             factor, GWP and IPCC tables they read, as {path: text}.
//
// Nothing here is fetched from the network, so the published site never
// depends on a CDN being reachable.
import { createHash } from 'node:crypto';
import {
  copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontend = path.join(root, 'frontend');
const pyodideSrc = path.join(frontend, 'node_modules', 'pyodide');
const wheelSrc = path.join(frontend, 'vendor', 'pyodide-packages');
const pyodideOut = path.join(frontend, 'public', 'pyodide');
const engineOut = path.join(frontend, 'public', 'engine');

const RUNTIME = ['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip'];
const PACKAGES = ['pydantic', 'pydantic-core', 'typing-extensions', 'annotated-types', 'typing-inspection'];

// What service.browser_api imports and reads. The model clients (Gemini,
// Anthropic), the web server, the cache and the metering stay out.
const SERVICE_MODULES = [
  '__init__.py', 'inventory.py', 'inventory_api.py', 'methods_api.py', 'browser_api.py',
  // The product carbon estimate's deterministic half: request building, output
  // validation and the screening maths. No model client is among them.
  'catalogue.py', 'config.py', 'estimator.py', 'guard.py', 'models.py', 'pipeline.py',
  'schemas.py', 'text.py',
];
const DATA = [
  ['data/factors', /\.csv$/],
  ['data/gwp', /\.json$/],
  ['data/ipcc', /\.json$/],
];

function fail(message) {
  console.error(`[browser-engine] ${message}`);
  process.exit(1);
}

function walk(dir, keep, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (entry === '__pycache__') continue;
    if (statSync(full).isDirectory()) walk(full, keep, out);
    else if (keep.test(entry)) out.push(full);
  }
  return out;
}

// --- Python runtime and wheels ------------------------------------------------
if (!existsSync(pyodideSrc)) fail('frontend/node_modules/pyodide is missing. Run npm install in frontend/.');
rmSync(pyodideOut, { recursive: true, force: true });
mkdirSync(pyodideOut, { recursive: true });
for (const file of RUNTIME) copyFileSync(path.join(pyodideSrc, file), path.join(pyodideOut, file));

const lock = JSON.parse(readFileSync(path.join(pyodideSrc, 'pyodide-lock.json'), 'utf8'));
const shipped = {};
for (const name of PACKAGES) {
  const pkg = lock.packages[name];
  if (!pkg) fail(`Pyodide ${lock.info.version ?? ''} has no package "${name}".`);
  const wheel = path.join(wheelSrc, pkg.file_name);
  if (!existsSync(wheel)) {
    fail(`${pkg.file_name} is not in frontend/vendor/pyodide-packages. It must match the pinned `
      + 'pyodide version; take it from that release on github.com/pyodide/pyodide/releases.');
  }
  const sha = createHash('sha256').update(readFileSync(wheel)).digest('hex');
  if (sha !== pkg.sha256) fail(`${pkg.file_name} does not match Pyodide's published checksum.`);
  copyFileSync(wheel, path.join(pyodideOut, pkg.file_name));
  shipped[name] = pkg;
}
writeFileSync(path.join(pyodideOut, 'pyodide-lock.json'), JSON.stringify({ ...lock, packages: shipped }));

// --- the engine itself ---------------------------------------------------------
const files = {};
const add = (full) => { files[path.relative(root, full).split(path.sep).join('/')] = readFileSync(full, 'utf8'); };
walk(path.join(root, 'ghg_core'), /\.(py|json)$/).forEach(add);
SERVICE_MODULES.forEach((name) => add(path.join(root, 'service', name)));
DATA.forEach(([dir, keep]) => walk(path.join(root, dir), keep).forEach(add));
add(path.join(root, 'data', 'catalogue_engine_map.csv'));
add(path.join(root, 'data', 'product_carbon_catalogue.csv'));
add(path.join(root, 'data', 'emission_source_catalogue.json'));

rmSync(engineOut, { recursive: true, force: true });
mkdirSync(engineOut, { recursive: true });
const bundle = JSON.stringify(files);
writeFileSync(path.join(engineOut, 'engine-files.json'), bundle);

console.log(`[browser-engine] ${Object.keys(files).length} engine files (${(bundle.length / 1e6).toFixed(1)} MB), `
  + `Python ${lock.info.python} with ${PACKAGES.length} packages.`);
