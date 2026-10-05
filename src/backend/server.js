import http from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase, mongoCapabilities } from './config/db.js';
import { logger } from './utils/logger.js';
import { assertPortAvailable } from './utils/port.js';

const start = async () => {
  // Claim the port before opening a database connection, so a duplicate start fails
  // immediately and clearly instead of after a slow MongoDB handshake. A second copy
  // of this server is refused here rather than quietly binding nothing.
  await assertPortAvailable(env.PORT);
  logger.info('starting server', { pid: process.pid, port: env.PORT, environment: env.NODE_ENV });

  await connectDatabase();

  // `npm run dev` turns this on so the storefront is served with hot reload from this
  // same listener; every other mode (npm start, npm run serve:prod) serves dist/.
  const useViteMiddleware = process.env.VITE_MIDDLEWARE === 'true';

  // One HTTP server, created once and listened on once. The request handler is
  // attached after the middleware stack exists, which keeps the ordering in one
  // place: /api routes, then the frontend, then the error handler.
  const server = http.createServer();

  const app = await createApp({ httpServer: server, useViteMiddleware });
  server.on('request', app);

  // Belt and braces for a shutdown that never reaches the handler below; the handler
  // closes Vite first, because its HMR socket would otherwise keep the server open.
  if (useViteMiddleware) {
    server.on('close', () => app.locals.vite?.close().catch(() => {}));
  }

  server.listen(env.PORT, () => {
    const capabilities = mongoCapabilities();
    logger.info('Anish Enterprises is running', {
      pid: process.pid,
      url: `http://localhost:${env.PORT}`,
      environment: env.NODE_ENV,
      mode: useViteMiddleware ? 'development (vite in middleware mode)' : 'serving the React build in dist/',
      database: env.mongoDatabaseName,
      transactions: capabilities?.supportsTransactions ? 'available' : 'unavailable (guarded atomic stock updates in use)',
      imageStorage: env.UPLOAD_STORAGE,
    });
  });

  // Backstop for a port taken between the preflight check and this bind, and
  // for permission problems: report them plainly rather than as a raw stack.
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      logger.error(`port ${env.PORT} became unavailable before the server could bind`, {
        hint: 'another process took the port, or another instance of this server is already running',
      });
    } else if (error.code === 'EACCES') {
      logger.error(`not allowed to listen on port ${env.PORT}`, { hint: 'choose a port above 1023 via PORT=<number>' });
    } else {
      logger.error('server error', { message: error.message });
    }
    disconnectDatabase()
      .catch(() => {})
      .finally(() => process.exit(1));
  });

  // Slow clients must not hold a socket open indefinitely.
  server.headersTimeout = 65000;
  server.keepAliveTimeout = 61000;

  let shuttingDown = false;
  const shutdown = async (signal) => {
    // SIGINT and SIGTERM can both arrive; only drain the connections once.
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`received ${signal}, shutting down`);

    // Close the Vite dev server first. Its HMR client holds a WebSocket, and an
    // upgraded socket is not an idle HTTP connection, so server.close() below would
    // wait for the browser instead of finishing - and Ctrl+C would look like it hung.
    await app.locals.vite?.close().catch(() => {});

    // Stop accepting new work, then release the database.
    server.close(async () => {
      try {
        await disconnectDatabase();
        logger.info('shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error('error during shutdown', { message: error.message });
        process.exit(1);
      }
    });
    // Do not hang forever if a connection refuses to drain.
    setTimeout(() => {
      logger.error('forced shutdown after timeout');
      process.exit(1);
    }, 10000).unref();

    // Keep-alive sockets would otherwise hold the close callback open until the
    // timeout above, so drop them once there has been a short grace period for
    // in-flight requests to finish.
    setTimeout(() => server.closeAllConnections?.(), 3000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    logger.error('unhandled promise rejection', { reason: reason?.message || String(reason) });
  });
  process.on('uncaughtException', (error) => {
    logger.error('uncaught exception, exiting', { message: error.message, stack: error.stack });
    process.exit(1);
  });
};

start().catch((error) => {
  // A port clash is a configuration problem, not a crash: report the reason
  // and the way out instead of a stack trace.
  if (error.name === 'PortUnavailableError') {
    logger.error(error.message, { code: error.code, port: env.PORT, pid: process.pid });
    process.exit(1);
  }
  logger.error('failed to start the server', { message: error.message, stack: error.stack });
  process.exit(1);
});
