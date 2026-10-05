/**
 * Minimal dependency-free PDF writer (single document, Helvetica base font).
 * Produces a real, spec-valid PDF string that every reader can open.
 */

export const PDF_HEADER = '%PDF-1.4';

const escapeText = (value) =>
  String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');

/**
 * pages: array of pages; each page is an array of run objects:
 *   { text, x, y, size, bold, color: [r, g, b] }
 * x/y are points, y measured from the top of the page.
 */
export const buildPdf = (pages, { width = 595.28, height = 841.89 } = {}) => {
  const contentStreams = pages.map((page) => {
    const commands = [];
    let lastFont = null;
    let lastSize = null;
    for (const run of page) {
      const font = run.bold ? '/F2' : '/F1';
      const size = Number(run.size) || 10;
      commands.push('BT');
      if (font !== lastFont || size !== lastSize) {
        commands.push(`${font} ${size} Tf`);
        lastFont = font;
        lastSize = size;
      }
      if (run.color) commands.push(`${run.color.join(' ')} rg`);
      const x = Number(run.x) || 0;
      const y = height - (Number(run.y) || 0);
      commands.push(`1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm`);
      commands.push(`(${escapeText(run.text)}) Tj`);
      commands.push('ET');
      if (run.color) commands.push('0 0 0 rg');
    }
    return commands.join('\n');
  });

  const C = contentStreams.length;
  const P = pages.length;
  const contentBase = 0; // content objects: 1..C
  const pageBase = C; // pages: C+1..C+P
  const pagesNumber = C + P + 1;
  const catalogNumber = C + P + 2;
  const font1Number = C + P + 3;
  const font2Number = C + P + 4;

  let pdf = `${PDF_HEADER}\n`;
  const offsets = [];
  let objectNumber = 0;
  const addObject = (body) => {
    objectNumber += 1;
    offsets[objectNumber] = pdf.length;
    pdf += `${objectNumber} 0 obj\n${body}\nendobj\n`;
    return objectNumber;
  };

  const contentRefs = contentStreams.map((stream) =>
    addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`),
  );

  const pageRefs = contentRefs.map((contentRef) =>
    addObject(
      `<< /Type /Page /Parent ${pagesNumber} 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 ${font1Number} 0 R /F2 ${font2Number} 0 R >> >> /Contents ${contentRef} 0 R >>`,
    ),
  );

  addObject(
    `<< /Type /Pages /Kids [${pageRefs.map((ref) => `${ref} 0 R`).join(' ')}] /Count ${pageRefs.length} >>`,
  );
  addObject(`<< /Type /Catalog /Pages ${pagesNumber} 0 R >>`);
  addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objectNumber + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objectNumber; i += 1) {
    pdf += `${String(offsets[i] ?? 0).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objectNumber + 1} /Root ${catalogNumber} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return pdf;
};
