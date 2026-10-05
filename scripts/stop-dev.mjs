/**
 * `npm run dev:stop` - stop this project's dev server, and nothing else.
 *
 * The port guard in src/backend/utils/port.js deliberately refuses to kill whatever
 * holds port 5000, because that is not always ours. This script is the other half of
 * that decision. It only ever stops a process it can positively attribute to this
 * checkout, by one of two routes:
 *
 *   1. The lock file that `npm run dev` writes for itself, naming its own pid.
 *   2. A fallback for a dev server started before the lock file existed: the pid that
 *      actually holds the port, accepted only when the port answers as this backend
 *      *and* that pid's command line is this project's dev entry script.
 *
 * Anything else on port 5000 is reported and left alone.
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { identifyOccupant } from '../src/backend/utils/port.js';
import { env } from '../src/backend/config/env.js';

const run = promisify(execFile);

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Must match the `service` value reported by GET /api/health. */
const SERVICE_ID = 'anish-enterprises-api';

/** Written by scripts/dev.mjs; see armOrphanWatchdog there for the rest. */
export const devLockFile = path.join(projectRoot, '.dev-server.json');

/** This checkout's dev entry points, as they appear in a command line. */
const isOwnDevCommand = (commandLine) => {
  const value = String(commandLine || '');
  const runsDevScript = /scripts[\\/]dev\.mjs/.test(value) || /src[\\/]backend[\\/]server\.js/.test(value);
  if (!runsDevScript) return false;
  // Either invoked by absolute path inside this checkout, or by the relative path npm
  // uses with the project root as the working directory.
  return value.includes(projectRoot) || /node\s+"?[a-z]*scripts[\\/]dev\.mjs/i.test(value);
};

const processExists = (pid) => {
  if (!pid || pid <= 1) return false;
  try {
    // Signal 0 performs the permission/existence check without delivering anything.
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but belongs to another user.
    return error.code === 'EPERM';
  }
};

/** Which pid is LISTENING on the port, if any. */
const findPortOwner = async (port) => {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await run('netstat', ['-ano', '-p', 'tcp'], { maxBuffer: 8 * 1024 * 1024, windowsHide: true });
      for (const line of stdout.split(/\r?\n/)) {
        const columns = line.trim().split(/\s+/);
        if (columns.length < 5) continue;
        const [, local, , state, pid] = columns;
        if (state !== 'LISTENING') continue;
        if (local && local.endsWith(`:${port}`)) return Number(pid);
      }
      return null;
    }

    const { stdout } = await run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { maxBuffer: 1024 * 1024 });
    const pid = Number(stdout.trim().split(/\r?\n/)[0]);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
};

/** The command line of one pid, or null when the platform will not say. */
const readCommandLine = async (pid) => {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await run(
        'powershell.exe',
        ['-NoProfile', '-Command', `(Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}").CommandLine`],
        { windowsHide: true },
      );
      return stdout.trim() || null;
    }
    const { stdout } = await run('ps', ['-p', String(pid), '-o', 'command='], { maxBuffer: 1024 * 1024 });
    return stdout.trim() || null;
  } catch {
    return null;
  }
};

const stopProcessTree = async (pid) => {
  if (process.platform === 'win32') {
    // /T so Vite's esbuild helper goes with it; nothing is killed that is not a
    // descendant of this exact dev server.
    await run('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true });
    return;
  }
  process.kill(pid, 'SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 1500));
  try {
    process.kill(pid, 0);
    process.kill(pid, 'SIGKILL');
  } catch {
    /* already gone */
  }
};

const clearLockFile = () => {
  try {
    fs.rmSync(devLockFile, { force: true });
  } catch {
    /* nothing to clear */
  }
};

/** Route 1: the pid `npm run dev` recorded for itself. */
const targetFromLockFile = async () => {
  try {
    const lock = JSON.parse(fs.readFileSync(devLockFile, 'utf8'));
    if (lock?.projectRoot !== projectRoot) return null;
    const pid = Number(lock.pid);
    if (!pid || pid === process.pid) return null;
    if (!(await processExists(pid))) {
      clearLockFile();
      return null;
    }
    return { pid, reason: 'recorded by npm run dev' };
  } catch {
    return null;
  }
};

/** Route 2: the verified port owner. */
const targetFromPortOwner = async (port) => {
  const pid = await findPortOwner(port);
  if (!pid || pid === process.pid) return null;

  const occupant = await identifyOccupant(port);
  if (!occupant?.isSameBackend) return null;

  const commandLine = await readCommandLine(pid);
  if (!isOwnDevCommand(commandLine)) return null;

  return { pid, reason: `holding port ${port} as ${occupant.service} (${occupant.environment})` };
};

const main = async () => {
  const target = (await targetFromLockFile()) ?? (await targetFromPortOwner(env.PORT));

  if (!target) {
    console.log(`No Anish Enterprises dev server is running on port ${env.PORT}.`);
    console.log('If something else is holding that port, this script will not touch it.');
    return;
  }

  console.log(`stopping dev server pid ${target.pid} - ${target.reason}`);
  try {
    await stopProcessTree(target.pid);
  } catch (error) {
    console.error(`  could not stop pid ${target.pid}: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  clearLockFile();
  console.log(`Done. Port ${env.PORT} is free - run "npm run dev".`);
};

main().catch((error) => {
  console.error(`dev:stop failed: ${error.message}`);
  process.exit(1);
});