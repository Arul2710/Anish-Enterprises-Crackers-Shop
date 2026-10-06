import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// Lightweight .env loader so GOFILE_TOKEN can live in a local .env file
// without adding a dependency. Existing process.env values always win.
const envFile = path.join(rootDir, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  }
}
const distDir = path.join(rootDir, 'dist');

const app = express();
const port = Number(process.env.PORT) || 8080;

app.disable('x-powered-by');

const REFERENCE_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;

// Store the generated enquiry PDF and return its DIRECT GoFile link.
app.put('/api/enquiries/:reference/pdf', express.raw({ type: 'application/pdf', limit: '25mb' }), async (req, res) => {
  const { reference } = req.params;
  try {
    if (!REFERENCE_PATTERN.test(reference)) {
      return res.status(400).json({ error: 'Invalid enquiry reference.' });
    }
    const body = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0 || body.subarray(0, 5).toString('latin1') !== '%PDF-') {
      return res.status(400).json({ error: 'A valid PDF file is required.' });
    }

    const { uploadPdfToGoFile } = await import('./gofile.js');
    let directLink;
    try {
      directLink = await uploadPdfToGoFile(body, `${reference}.pdf`);
    } catch (uploadError) {
      console.error(`[pdf] GoFile upload/direct link failed for ${reference}:`, uploadError.message);
      return res.status(502).json({ error: uploadError.message || 'Unable to create PDF link.' });
    }

    return res.status(201).json({ pdfUrl: directLink });
  } catch (error) {
    console.error(`[pdf] error for ${reference}:`, error);
    return res.status(500).json({ error: 'Unable to store the enquiry PDF.' });
  }
});

app.use(express.static(distDir));

// SPA fallback so deep links like /admin/orders resolve on refresh.
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found.' });
  if (req.method !== 'GET') return next();
  res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(port, () => {
  console.log(`Anish Enterprises app + PDF downloads serving on http://localhost:${port}`);
});
