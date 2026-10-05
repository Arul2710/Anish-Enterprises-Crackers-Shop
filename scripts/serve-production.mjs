/**
 * Runs the single server in production mode.
 *
 * The obvious `NODE_ENV=production node src/backend/server.js` only works in a
 * POSIX shell, so `npm run serve:prod` breaks on Windows - which is where this
 * project is developed. Setting the variable in Node works the same everywhere, and
 * it is set before the server module is imported so config/env.js reads it.
 */
process.env.NODE_ENV = 'production';

await import('../src/backend/server.js');