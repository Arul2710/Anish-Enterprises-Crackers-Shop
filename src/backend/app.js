import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';

import { env, projectRoot } from './config/env.js';
import routes from './routes/index.js';
import { attachAdmin } from './middleware/auth.middleware.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { apiLimiter } from './middleware/rateLimit.middleware.js';
import { logger } from './utils/logger.js';

/** Vite's production output. Express serves this directory directly. */
export const distDir = path.join(projectRoot, 'dist');

/**
 * Everything under /api is the REST API. Nothing else may reach this router, and an
 * unmatched /api path must never fall through to the React app - a JSON 404 keeps the
 * API contract intact instead of returning index.html for a mistyped endpoint.
 */
const mountApi = (app) => {
  // Broad safety net; individual routes add tighter limits where it matters.
  app.use('/api', apiLimiter);

  // Populates req.admin when a valid session cookie or bearer token is present.
  // Never blocks, so public routes stay public.
  app.use('/api', attachAdmin);

  app.use('/api', routes);

  app.use('/api', notFoundHandler);
};

/**
 * Serves the Vite build in dist/, then hands every non-API GET to index.html so a
 * deep link or a browser refresh on /admin/orders still boots React Router.
 *
 * This is how the frontend is served in every mode: there is no second dev server,
 * so the browser only ever talks to the one Express process on port 5000.
 */
const mountBuiltFrontend = (app) => {
  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    logger.error('no React build found in dist/', {
      hint: 'run "npm run build" (or just "npm run dev", which builds first)',
      expected: distDir,
    });
    return;
  }

  // Fingerprinted files under assets/ are immutable, so they can be cached hard.
  // index.html must stay revalidated or clients would pin an old build, and files
  // copied straight from public/ keep their name, so they must revalidate too.
  app.use(
    express.static(distDir, {
      index: false,
      setHeaders(res, filePath) {
        const isFingerprinted = filePath.includes(`${path.sep}assets${path.sep}`);
        res.setHeader('Cache-Control', isFingerprinted ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    }),
  );

  app.get('*', (req, res, next) => {
    if (req.method !== 'GET') return next();
    res.setHeader('Cache-Control', 'no-cache');
    return res.sendFile(path.join(distDir, 'index.html'), (error) => {
      if (error) next(error);
    });
  });
};

/**
 * Opt-in alternative to serving dist/: run Vite as middleware inside this same
 * Express process, which gives hot module replacement without opening a second
 * port or spawning a second server. `npm run dev` turns this on; every other mode
 * (npm start, npm run serve:prod) serves the build instead.
 *
 * The instance is stashed on app.locals so server.js can close it on shutdown
 * without needing a second return value.
 */
export const mountViteDevServer = async (app, httpServer) => {
  const { createServer } = await import('vite');
  const vite = await createServer({
    root: projectRoot,
    appType: 'spa',
    // middlewareMode takes the existing HTTP server rather than opening its own,
    // which is what keeps HMR on this port instead of spawning a second listener.
    server: {
      middlewareMode: { server: httpServer },
      hmr: { server: httpServer },
    },
  });

  app.use(vite.middlewares);
  app.locals.vite = vite;
  return vite;
};

/**
 * Builds the whole middleware stack: the API first, the frontend second, the error
 * handler last.
 *
 * The frontend is the built dist/ by default. Passing `httpServer` together with
 * `useViteMiddleware` swaps that for Vite's middleware, which is the case
 * `npm run dev` uses.
 */
export const createApp = async ({ httpServer = null, useViteMiddleware = false } = {}) => {
  const app = express();

  // Behind a reverse proxy, req.ip and secure cookies depend on this.
  if (env.TRUST_PROXY) app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // The API serves JSON and the storefront is served from this same origin, so a
      // strict default-src policy here would only get in the way.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-origin' },
    }),
  );

  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());
  app.use(morgan(env.isProduction ? 'combined' : 'dev', { stream: { write: (line) => logger.info(line.trim()) } }));

  // No CORS middleware: the storefront and the API share one origin, so the browser
  // never makes a cross-origin request and the admin cookie needs no CORS allowance.
  mountApi(app);

  // Frontend last, so API routes are always matched by the API first. By default that
  // is the built dist/; `npm run dev` puts Vite in middleware mode instead.
  if (useViteMiddleware && httpServer) await mountViteDevServer(app, httpServer);
  else mountBuiltFrontend(app);

  // Must stay last so it can see errors thrown by everything above it.
  app.use(errorHandler);

  return app;
};

export default createApp;
