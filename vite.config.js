import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Frontend-only project.
 *
 * There is no API server, no proxy and no second port. `npm run dev` starts this
 * Vite dev server and nothing else; every page, the catalog and the admin
 * workspace are all served from `src/`, backed by local data and localStorage.
 *
 * `npm run build` emits dist/, which any static host (Hostinger, Netlify,
 * Cloudflare Pages, S3, nginx) can serve as-is.
 *
 * The entry is the root index.html, which loads /src/main.jsx.
 */
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    port: 5173,
    // The catalog and admin workspace are client-side routes, so a deep link such
    // as /admin/orders must fall back to index.html instead of 404ing.
    open: false,
    proxy: {
      // Enquiry PDFs are stored and served by the local server (server/index.js).
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: false,
      },
    },
  },
});