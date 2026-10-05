import express from 'express';
import { mkdir, stat } from 'node:fs/promises';
import { createReadStream, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const uploadsDir = path.join(rootDir, 'uploads', 'enquiries');

mkdirSync(uploadsDir, { recursive: true });

const app = express();
const port = Number(process.env.PORT) || 8080;

app.disable('x-powered-by');

const REFERENCE_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;
const uploadsPath = (reference) => path.join(uploadsDir, `${reference}.pdf`);

// Store a generated enquiry PDF: raw application/pdf body in, public URL out.
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
    await mkdir(uploadsDir, { recursive: true });
    const { writeFile } = await import('node:fs/promises');
    await writeFile(uploadsPath(reference), body);
    const base = `${req.protocol}://${req.get('host')}`;
    return res.status(201).json({
      pdfUrl: `${base}/api/enquiries/${reference}/pdf`,
    });
  } catch (error) {
    console.error(`[pdf] storage error for ${reference}:`, error);
    return res.status(500).json({ error: 'Unable to store the enquiry PDF.' });
  }
});

// Download a stored enquiry PDF. Always forces a browser download.
app.get('/api/enquiries/:reference/pdf', async (req, res) => {
  const { reference } = req.params;
  try {
    if (!REFERENCE_PATTERN.test(reference)) {
      return res.status(400).json({ error: 'Invalid enquiry reference.' });
    }
    const filePath = uploadsPath(reference);
    if (!existsSync(filePath)) {
      return res.status(404).json({ error: 'Enquiry PDF not found.' });
    }
    const info = await stat(filePath);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${reference}.pdf"`);
    res.setHeader('Content-Length', info.size);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error(`[pdf] download error for ${reference}:`, error);
    return res.status(500).json({ error: 'Unable to serve the enquiry PDF.' });
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
