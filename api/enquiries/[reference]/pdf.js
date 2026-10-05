import { put, list } from '@vercel/blob';

const REFERENCE_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;
const blobPath = (reference) => `enquiries/${reference}.pdf`;

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

    if (req.method === 'PUT') {
      const body = await readRawBody(req);
      if (!Buffer.isBuffer(body) || body.length === 0 || body.subarray(0, 5).toString('latin1') !== '%PDF-') {
        return res.status(400).json({ error: 'A valid PDF file is required.' });
      }
      await put(blobPath(reference), body, {
        access: 'public',
        contentType: 'application/pdf',
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      const proto = req.headers['x-forwarded-proto'] || 'https';
      return res.status(201).json({
        pdfUrl: `${proto}://${req.headers.host}/api/enquiries/${reference}/pdf`,
      });
    }

    if (req.method === 'GET') {
      const { blobs } = await list({ prefix: blobPath(reference) });
      const hit = blobs.find((blob) => blob.pathname === blobPath(reference));
      if (!hit) return res.status(404).json({ error: 'Enquiry PDF not found.' });
      const upstream = await fetch(hit.url);
      if (!upstream.ok) return res.status(404).json({ error: 'Enquiry PDF not found.' });
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${reference}.pdf"`);
      res.setHeader('Content-Length', buf.length);
      res.setHeader('Cache-Control', 'public, max-age=60');
      return res.status(200).send(buf);
    }

    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (error) {
    console.error(`[pdf] ${req.method} /api/enquiries/${reference}/pdf failed:`, error);
    return res.status(500).json({ error: 'Unable to process the enquiry PDF.' });
  }
}
