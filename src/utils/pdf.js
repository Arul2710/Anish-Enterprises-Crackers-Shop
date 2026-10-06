/**
 * Minimal dependency-free PDF writer (single document, Helvetica base font).
 * Produces a real, spec-valid PDF string/bytes that every reader can open.
 *
 * A page is an array of runs:
 *   text  : { text, x, y, size, bold, color }
 *   rect  : { rect: { x, y, w, h, fill?, stroke?, lineWidth? } }
 *   line  : { line: { x1, y1, x2, y2, color?, width? } }
 *   image : { image: { data, width, height, x, y, w, h } }
 *
 * x/y are measured from the TOP of the page. `image.data` must be raw JPEG
 * bytes and `width`/`height` its pixel dimensions.
 *
 * `buildPdf` returns a string when the document is text-only (so the smoke
 * scripts that inspect it directly keep working) and a Uint8Array when it
 * embeds images.
 */

export const PDF_HEADER = '%PDF-1.4';

const escapeText = (value) =>
  String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');

const textEncoder = new TextEncoder();
const byteLength = (value) => (typeof value === 'string' ? textEncoder.encode(value).length : value.length);

const runCommands = (run, height, imageNameOf) => {
  if (run.image) {
    const { x, y, w, h } = run.image;
    const pdfY = height - (y + h);
    return `q\n${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${pdfY.toFixed(2)} cm\n/${imageNameOf.get(run.image)} Do\nQ`;
  }
  if (run.rect) {
    const { x, y, w, h, fill, stroke, lineWidth } = run.rect;
    const pdfY = height - (y + h);
    const parts = [];
    if (lineWidth) parts.push(`${Number(lineWidth)} w`);
    if (fill) parts.push(`${fill.join(' ')} rg`);
    if (stroke) parts.push(`${stroke.join(' ')} RG`);
    parts.push(`${x.toFixed(2)} ${pdfY.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re`);
    parts.push(fill && stroke ? 'B' : fill ? 'f' : 'S');
    if (fill) parts.push('0 0 0 rg');
    if (stroke) parts.push('0 0 0 RG');
    return parts.join('\n');
  }
  if (run.line) {
    const { x1, y1, x2, y2, color, width } = run.line;
    const parts = [];
    if (width) parts.push(`${Number(width)} w`);
    if (color) parts.push(`${color.join(' ')} RG`);
    parts.push(`${x1.toFixed(2)} ${(height - y1).toFixed(2)} m`);
    parts.push(`${x2.toFixed(2)} ${(height - y2).toFixed(2)} l`);
    parts.push('S');
    if (color) parts.push('0 0 0 RG');
    return parts.join('\n');
  }
  const font = run.bold ? '/F2' : '/F1';
  const size = Number(run.size) || 10;
  const x = Number(run.x) || 0;
  const y = height - (Number(run.y) || 0);
  const commands = ['BT'];
  commands.push(`${font} ${size} Tf`);
  if (run.color) commands.push(`${run.color.join(' ')} rg`);
  commands.push(`1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm`);
  commands.push(`(${escapeText(run.text)}) Tj`);
  commands.push('ET');
  if (run.color) commands.push('0 0 0 rg');
  return commands.join('\n');
};

export const buildPdf = (pages, { width = 595.28, height = 841.89 } = {}) => {
  // Stable reference per distinct image object, shared across pages.
  const imageList = [];
  const imageNameOf = new Map();
  for (const page of pages) {
    for (const run of page) {
      if (run.image && !imageNameOf.has(run.image)) {
        imageNameOf.set(run.image, `Im${imageList.length + 1}`);
        imageList.push(run.image);
      }
    }
  }
  const hasImages = imageList.length > 0;

  const C = pages.length; // content streams
  const P = pages.length;
  const pagesNumber = C + P + 1;
  const catalogNumber = C + P + 2;
  const font1Number = C + P + 3;
  const font2Number = C + P + 4;
  const firstImageNumber = C + P + 5;
  const imageObjectNumber = (image) => firstImageNumber + imageList.indexOf(image);

  const streams = pages.map((page) =>
    page.map((run) => runCommands(run, height, imageNameOf)).join('\n'),
  );

  const chunks = [];
  const currentLength = () => chunks.reduce((sum, chunk) => sum + byteLength(chunk), 0);
  const offsets = [];
  let objectNumber = 0;
  const add = (bodyChunks) => {
    objectNumber += 1;
    offsets[objectNumber] = currentLength() + 0; // offset of 'N 0 obj' header start
    chunks.push(`${objectNumber} 0 obj\n`);
    if (Array.isArray(bodyChunks)) chunks.push(...bodyChunks);
    else chunks.push(bodyChunks);
    chunks.push(`\nendobj\n`);
    return objectNumber;
  };

  chunks.push(`${PDF_HEADER}\n`);

  const contentRefs = streams.map((stream) => {
    const streamBytes = textEncoder.encode(stream);
    objectNumber += 1;
    offsets[objectNumber] = currentLength();
    chunks.push(`${objectNumber} 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n`, streamBytes, `\nendstream\nendobj\n`);
    return objectNumber;
  });

  const pageRefs = contentRefs.map((contentRef, index) => {
    const seen = new Set();
    const xObjects = [];
    for (const run of pages[index]) {
      if (run.image && !seen.has(run.image)) {
        seen.add(run.image);
        xObjects.push(`/${imageNameOf.get(run.image)} ${imageObjectNumber(run.image)} 0 R`);
      }
    }
    const xObjectClause = xObjects.length ? ` /XObject << ${xObjects.join(' ')} >>` : '';
    objectNumber += 1;
    offsets[objectNumber] = currentLength();
    chunks.push(
      `${objectNumber} 0 obj\n<< /Type /Page /Parent ${pagesNumber} 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 ${font1Number} 0 R /F2 ${font2Number} 0 R >>${xObjectClause} >> /Contents ${contentRef} 0 R >>\nendobj\n`,
    );
    return objectNumber;
  });

  objectNumber += 1;
  offsets[objectNumber] = currentLength();
  chunks.push(`${objectNumber} 0 obj\n<< /Type /Pages /Kids [${pageRefs.map((ref) => `${ref} 0 R`).join(' ')}] /Count ${P} >>\nendobj\n`);

  objectNumber += 1;
  offsets[objectNumber] = currentLength();
  chunks.push(`${objectNumber} 0 obj\n<< /Type /Catalog /Pages ${pagesNumber} 0 R >>\nendobj\n`);

  objectNumber += 1;
  offsets[objectNumber] = currentLength();
  chunks.push(`${objectNumber} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`);

  objectNumber += 1;
  offsets[objectNumber] = currentLength();
  chunks.push(`${objectNumber} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n`);

  for (const image of imageList) {
    objectNumber += 1;
    offsets[objectNumber] = currentLength();
    const bytes = image.data instanceof Uint8Array ? image.data : new Uint8Array(image.data);
    chunks.push(
      `${objectNumber} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`,
      bytes,
      `\nendstream\nendobj\n`,
    );
  }

  const xrefStart = currentLength();
  const xrefLines = [`xref\n0 ${objectNumber + 1}\n`, '0000000000 65535 f \n'];
  for (let i = 1; i <= objectNumber; i += 1) {
    xrefLines.push(`${String(offsets[i] ?? 0).padStart(10, '0')} 00000 n \n`);
  }
  chunks.push(xrefLines.join(''), `trailer\n<< /Size ${objectNumber + 1} /Root ${catalogNumber} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  let total = 0;
  for (const chunk of chunks) total += byteLength(chunk);
  const out = new Uint8Array(total);
  let position = 0;
  for (const chunk of chunks) {
    const bytes = typeof chunk === 'string' ? textEncoder.encode(chunk) : chunk;
    out.set(bytes, position);
    position += bytes.length;
  }
  return hasImages ? out : new TextDecoder('latin1').decode(out);
};
