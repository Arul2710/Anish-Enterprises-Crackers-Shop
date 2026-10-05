/**
 * `npm run dev` -> one Node process that is the API *and* the React dev server.
 *
 * There is deliberately no second server and no `concurrently`. Vite runs as
 * middleware inside the Express app (see src/backend/app.js), so the storefront and
 * the REST API are handled by the same listener on the same port: one process, one
 * origin, no proxy, no CORS, and nothing left behind on port 5000.
 *
 * Startup order:
 *   1. VITE_MIDDLEWARE is set before the server is imported, because app.js reads it
 *      when it decides between dist/ and the Vite dev middleware.
 *   2. server.js is imported exactly once. It owns the port guard, the MongoDB
 *      connection and the HTTP listener - this file never binds anything itself, so a
 *      second backend can never be started from here.
 *   3. Once /api/health answers, both halves are reported as started and the orphan
 *      watchdog is armed.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../src/backend/config/env.js';
import { logger } from '../src/backend/utils/logger.js';

// Must be set before src/backend/server.js is evaluated: app.js reads this flag when
// it picks between serving dist/ and mounting the Vite dev server.
process.env.VITE_MIDDLEWARE = 'true';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PORT = env.PORT;
const HOST = `http://localhost:${PORT}`;
const READY_TIMEOUT_MS = 60_000;

/**
 * Records which pid is this dev server, so `npm run dev:stop` can find it again without
 * having to guess from a port number. It is a plain file in the project root and is
 * gitignored; nothing outside this checkout reads or writes it.
 */
const devLockFile = path.join(projectRoot, '.dev-server.json');

const writeLockFile = () => {
  try {
    const record = { pid: process.pid, port: PORT, projectRoot, startedAt: new Date().toISOString() };
    fs.writeFileSync(devLockFile, `${JSON.stringify(record, null, 2)}\n`);
  } catch (error) {
    logger.warn('could not write .dev-server.json; `npm run dev:stop` will fall back to the port check', {
      message: error.message,
    });
  }
};

const clearLockFile = () => {
  try {
    // Only ever remove our own record.
    const lock = JSON.parse(fs.readFileSync(devLockFile, 'utf8'));
    if (lock?.pid === process.pid) fs.rmSync(devLockFile, { force: true });
  } catch {
    /* already gone, or never written */
  }
};

/**
 * Resolves once this very process is answering on the port. Polling /api/health is the
 * cheapest proof that the whole stack is up: the listener is bound, the database is
 * connected and the middleware stack is mounted.
 */
const waitUntilServing = (port, timeoutMs) =>
  new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;

    const attempt = () => {
      // server.js calls process.exit() when it cannot start, so a failure here is only
      // ever a genuine timeout rather than a dead process to keep waiting on.
      const request = http.get({ host: '127.0.0.1', port, path: '/api/health', timeout: 2000 }, (response) => {
        response.resume();
        if (response.statusCode === 200) return resolve();
        retry();
      });
      request.on('timeout', () => request.destroy());
      request.on('error', retry);
    };

    const retry = () => {
      if (Date.now() > deadline) {
        reject(new Error(`the server did not start answering on port ${port} within ${timeoutMs / 1000}s`));
        return;
      }
      setTimeout(attempt, 400);
    };

    attempt();
  });

/**
 * Asks server.js to run its own graceful shutdown instead of tearing down from here,
 * so the Vite dev server, the HTTP listener and the MongoDB connection are all closed
 * in the right order. The timer is the backstop: if that path cannot finish, the port
 * is released anyway rather than being held by a process nobody can reach.
 */
const requestShutdown = (reason) => {
  logger.warn(`shutting down: ${reason}`);
  clearLockFile();
  process.emit('SIGINT');
  setTimeout(() => process.exit(0), 8000).unref();
};

/**
 * Windows runs `npm run dev` as npm -> cmd.exe -> this process. If the shell that
 * started it is closed or npm dies, nothing delivers Ctrl+C here and the port stays
 * held by an orphan - which is exactly what produced "Port 5000 is already serving
 * this backend" on the next run. Watching the parent closes that gap: only our own
 * parent is inspected, and only its disappearance triggers a shutdown.
 */
const armOrphanWatchdog = () => {
  const parentPid = process.ppid;
  // 1 is init/launchd: already reparented, so there is nothing meaningful to watch.
  if (!parentPid || parentPid <= 1) return;

  const parentAlive = () => {
    try {
      process.kill(parentPid, 0);
      return true;
    } catch (error) {
      // EPERM means the process exists but belongs to another user.
      return error.code === 'EPERM';
    }
  };

  const timer = setInterval(() => {
    if (parentAlive()) return;
    requestShutdown(`the process that started it (pid ${parentPid}) has exited`);
  }, 3000);

  // Never the reason the process stays alive; the HTTP server holds the loop open.
  timer.unref();
};

// One import, one server. Everything below only observes the result.
await import('../src/backend/server.js');

try {
  await waitUntilServing(PORT, READY_TIMEOUT_MS);
} catch (error) {
  logger.error(error.message, { port: PORT, pid: process.pid });
  process.exit(1);
}

// Ctrl+C reaches server.js's own handler, which calls process.exit(); this only has to
// catch the record on the way out.
process.on('exit', clearLockFile);

writeLockFile();

const line = (label, detail) => process.stdout.write(`  ${label.padEnd(9)} ${detail}\n`);

process.stdout.write('\n  Anish Enterprises - development\n\n');
line('backend', `${HOST}/api/health  (pid ${process.pid})`);
line('frontend', `${HOST}  (Vite middleware, hot reload on)`);
process.stdout.write('\n  One process, one origin. Press Ctrl+C to stop both.\n\n');

armOrphanWatchdog();