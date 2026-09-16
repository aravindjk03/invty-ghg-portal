// Start the Product Carbon service (FastAPI) with the project's virtualenv.
// Works on Windows (.venv\Scripts\python.exe) and macOS/Linux (.venv/bin/python).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const python = [
  join(root, '.venv', 'Scripts', 'python.exe'),
  join(root, '.venv', 'bin', 'python'),
].find(existsSync);

if (!python) {
  console.error(
    'No virtualenv found at .venv. Create one and install the service:\n' +
      '  python -m venv .venv\n' +
      '  .venv/Scripts/python -m pip install -e ".[service]"   (Windows)\n' +
      '  .venv/bin/python -m pip install -e ".[service]"       (macOS/Linux)'
  );
  process.exit(1);
}

const child = spawn(
  python,
  ['-m', 'uvicorn', 'service.app:app', '--port', '8000', '--reload'],
  { cwd: root, stdio: 'inherit' }
);
child.on('exit', (code) => process.exit(code ?? 0));

// Stopping this script must stop the service too. uvicorn --reload runs a
// reloader plus a worker; on Windows killing only the reloader's parent leaves
// both holding port 8000, so take the whole tree down.
let stopping = false;
function stopChild() {
  if (stopping || child.exitCode !== null) return;
  stopping = true;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
  process.on(signal, () => {
    stopChild();
    setTimeout(() => process.exit(0), 500);
  });
}
process.on('exit', stopChild);
