import { uploadPdfToGoFile } from '../../../server/gofile.js';

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
