// Build the website and publish it to GitHub Pages (the gh-pages branch).
//
//   npm run deploy:pages
//
// The site is static, so it needs the addresses of the two server parts at
// build time. Set them once they are hosted (see render.yaml):
//   IINVTY_BACKEND_URL   e.g. https://iinvty-backend.onrender.com/api/v1
//   IINVTY_AI_URL        e.g. https://iinvty-insity-edge-ai.onrender.com
//   IINVTY_GOOGLE_CLIENT_ID  the OAuth Web client ID (see SETUP-GOOGLE.md);
//                            without it the Google button explains it is not set up
// Without IINVTY_BACKEND_URL it refuses to publish unless --trial is given.
//
// Publishing adds one commit on top of gh-pages; history is never rewritten.
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontend = path.join(root, 'frontend');
const branch = 'gh-pages';

const run = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', cwd: root, ...opts });
const read = (cmd, opts = {}) => execSync(cmd, { cwd: root, encoding: 'utf8', ...opts }).trim();

const remote = read('git remote get-url origin');
const repo = remote.replace(/\.git$/, '').split('/').pop();
const env = { ...process.env, VITE_BASE_PATH: `/${repo}/` };
if (process.env.IINVTY_BACKEND_URL) env.VITE_API_BASE_URL = process.env.IINVTY_BACKEND_URL;
if (process.env.IINVTY_AI_URL) env.VITE_PCF_API_BASE_URL = process.env.IINVTY_AI_URL;
if (process.env.IINVTY_GOOGLE_CLIENT_ID) env.VITE_GOOGLE_CLIENT_ID = process.env.IINVTY_GOOGLE_CLIENT_ID;
// An AI key is never built into the site: anything baked in here is public the
// moment it is published. The key belongs to the estimate service (render.yaml).
if (process.env.IINVTY_GEMINI_KEY) {
  console.error('\n[deploy:pages] IINVTY_GEMINI_KEY is set, and is being IGNORED. A key built into the\n' +
    'site is readable by every visitor. Set GEMINI_API_KEY on the estimate service instead.\n');
}
// Publishing without a backend used to only print a warning, and the live site
// then quietly ran as a browser-only trial (accounts kept in each visitor's
// browser). Now it has to be asked for: `npm run deploy:pages -- --trial`.
const trial = process.argv.includes('--trial');
if (!process.env.IINVTY_BACKEND_URL && !trial) {
  console.error('\n[deploy:pages] IINVTY_BACKEND_URL is not set, so this would publish a browser-only trial\n' +
    '(accounts stay in each visitor\'s browser). Set it to your backend, e.g.\n' +
    '  IINVTY_BACKEND_URL=https://iinvty-backend.onrender.com/api/v1 npm run deploy:pages\n' +
    'or publish the trial on purpose with: npm run deploy:pages -- --trial\n');
  process.exit(1);
}
if (trial) console.warn('\n[deploy:pages] Publishing the browser-only trial (no backend).\n');
if (!process.env.IINVTY_AI_URL) {
  console.warn('[deploy:pages] IINVTY_AI_URL is not set: Product Carbon estimates will be unavailable.\n');
}
if (!process.env.IINVTY_GOOGLE_CLIENT_ID) {
  console.warn('[deploy:pages] IINVTY_GOOGLE_CLIENT_ID is not set: the Google sign-in button is hidden.\n');
}

console.log(`[deploy:pages] Building the website for /${repo}/ ...`);
run('npm run build', { cwd: frontend, env });

const source = read('git rev-parse --short HEAD');
const work = mkdtempSync(path.join(tmpdir(), 'iinvty-pages-'));
try {
  const exists = read(`git ls-remote --heads origin ${branch}`) !== '';
  if (exists) {
    run(`git fetch origin ${branch}`);
    run(`git worktree add "${work}" origin/${branch}`);
    run(`git checkout -B ${branch}`, { cwd: work });
  } else {
    run(`git worktree add --detach "${work}"`);
    run(`git checkout --orphan ${branch}`, { cwd: work });
    run('git rm -rfq .', { cwd: work });
  }

  for (const entry of readdirSync(work)) {
    if (entry !== '.git') rmSync(path.join(work, entry), { recursive: true, force: true });
  }
  cpSync(path.join(frontend, 'dist'), work, { recursive: true });
  writeFileSync(path.join(work, '.nojekyll'), '');   // serve files as built, no Jekyll

  run('git add -A', { cwd: work });
  if (read('git status --porcelain', { cwd: work }) === '') {
    console.log('[deploy:pages] The published site is already up to date.');
  } else {
    run(`git commit -q -m "Publish website from ${source}"`, { cwd: work });
    run(`git push origin ${branch}`, { cwd: work });
  }
  const owner = remote.replace(/\.git$/, '').split(/[/:]/).slice(-2)[0];
  console.log(`[deploy:pages] Done: https://${owner.toLowerCase()}.github.io/${repo}/`);
} finally {
  if (existsSync(work)) run(`git worktree remove --force "${work}"`);
}
