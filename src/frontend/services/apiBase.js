/**
 * Single source of truth for where the API lives.
 *
 * The storefront and the API are served by the same Node/Express process, so the
 * browser only ever makes same-origin requests and a relative path is correct in
 * development, in a production build and behind a reverse proxy alike. No host,
 * port or scheme is hardcoded anywhere in the React app - that is what lets the
 * whole deployment move without touching a component.
 */
export const API_BASE = '/api';

/** Joins a path onto the API base, tolerating a leading or missing slash. */
export const apiUrl = (path) => `${API_BASE}${String(path).startsWith('/') ? path : `/${path}`}`;
