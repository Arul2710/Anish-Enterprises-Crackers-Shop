import { uploadPdfToGoFile } from '../../../server/gofile.js';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Lightweight .env loader (Vercel injects env vars directly, this covers local `vercel dev`).
const envFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  }
}

const REFERENCE_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;

const readRawBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
};

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  const { reference } = req.query;

  try {
    if (!REFERENCE_PATTERN.test(String(reference || ''))) {
      return res.status(400).json({ error: 'Invalid enquiry reference.' });
    }

    if (req.method !== 'PUT') {
      return res.status(405).json({ error: 'Method not allowed.' });
    }

    const body = await readRawBody(req);
    if (!Buffer.isBuffer(body) || body.length === 0 || body.subarray(0, 5).toString('latin1') !== '%PDF-') {
      return res.status(400).json({ error: 'A valid PDF file is required.' });
    }

    let directLink;
    try {
      directLink = await uploadPdfToGoFile(body, `${reference}.pdf`);
    } catch (uploadError) {
      console.error(`[pdf] GoFile upload/direct link failed for ${reference}:`, uploadError.message);
      return res.status(502).json({ error: uploadError.message || 'Unable to create PDF link. Please try again.' });
    }

    return res.status(201).json({ pdfUrl: directLink });
  } catch (error) {
    console.error(`[pdf] PUT /api/enquiries/${reference}/pdf failed:`, error);
    return res.status(500).json({ error: 'Unable to upload the PDF.' });
  }
}
