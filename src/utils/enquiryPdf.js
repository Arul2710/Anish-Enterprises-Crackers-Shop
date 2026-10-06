import { business } from '../config/business';
import { formatCurrency, formatDateTime } from './format';
import { buildPdf, PDF_HEADER } from './pdf';
import { productImageCandidates } from './images';

const pdfCurrency = (value) => formatCurrency(value).replace('₹', 'Rs.');

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const RIGHT = PAGE_WIDTH - MARGIN;

const INK = [0.13, 0.11, 0.09];
const MUTED = [0.45, 0.42, 0.38];
const LINE = [0.85, 0.83, 0.79];
const BAND = [0.97, 0.96, 0.93];

const wrapText = (text, size, maxWidth) => {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  const widthOf = (value) => value.length * size * 0.5;
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (widthOf(candidate) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
};

const widthOfText = (value, size) => String(value).length * size * 0.5;

/** Load a product photo and re-encode it as a right-sized JPEG for the PDF. */
const loadProductImage = async (item) => {
  const candidates = productImageCandidates(item);
  for (const src of candidates) {
    try {
      const response = await fetch(encodeURI(src));
      if (!response.ok) continue;
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);
      const maxSide = 320;
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      const base64 = dataUrl.split(',')[1];
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      return { data: bytes, width, height };
    } catch {
      // try the next candidate path
    }
  }
  return null;
};

/**
 * Builds the pages for the professional enquiry PDF. Async because product
 * photos are fetched and embedded. Uses the exact saved enquiry object.
 */
export const enquiryPdfPages = async (enquiry) => {
  const items = Array.isArray(enquiry.items) ? enquiry.items : [];

  // Pre-load all product photos once; failures simply leave no image cell.
  const images = await Promise.all(items.map((item) => loadProductImage(item)));

  const pages = [[]];
  let page = pages[0];
  let y = MARGIN;

  const newPage = () => {
    page = [];
    pages.push(page);
    y = MARGIN;
  };

  const ensure = (needed = 12) => {
    if (y + needed > PAGE_HEIGHT - MARGIN - 24) newPage();
  };

  const text = (value, { size = 9, bold = false, x = MARGIN, maxWidth = RIGHT - x, color } = {}) => {
    for (const line of wrapText(value, size, maxWidth)) {
      ensure(size + 3);
      page.push({ text: line, x, y, size, bold, ...(color ? { color } : {}) });
      y += size + 3;
    }
  };

  const rawText = (value, options) => page.push({ text: value, ...options });

  const gap = (amount = 4) => {
    y += amount;
  };

  const hline = (color = LINE, width = 0.7) => {
    ensure(8);
    page.push({ line: { x1: MARGIN, y1: y, x2: RIGHT, y2: y, color, width } });
    y += 6;
  };

  // Column grid (sums to CONTENT_WIDTH).
  const COL = {
    image: { x: MARGIN, w: 52 },
    product: { x: MARGIN + 60, w: 168 },
    category: { x: MARGIN + 236, w: 92 },
    qty: { x: MARGIN + 336, w: 40 },
    price: { x: MARGIN + 384, w: 60 },
    total: { x: MARGIN + 452, w: 63.28 },
  };
  const ROW_H = 62;
  const IMG_BOX = 46;

  const tableHeader = () => {
    ensure(18);
    page.push({ rect: { x: MARGIN, y: y - 3, w: CONTENT_WIDTH, h: 18, fill: BAND } });
    const cells = [
      ['Product Image', COL.image.x, COL.image.w, 'left'],
      ['Product', COL.product.x, COL.product.w, 'left'],
      ['Category', COL.category.x, COL.category.w, 'left'],
      ['Qty', COL.qty.x, COL.qty.w, 'right'],
      ['Price', COL.price.x, COL.price.w, 'right'],
      ['Total', COL.total.x, COL.total.w, 'right'],
    ];
    for (const [label, x, w, align] of cells) {
      const tx = align === 'right' ? x + w - widthOfText(label, 8.5) : x;
      page.push({ text: label, x: tx, y, size: 8.5, bold: true });
    }
    y += 18;
    page.push({ line: { x1: MARGIN, y1: y, x2: RIGHT, y2: y, color: LINE, width: 0.7 } });
    y += 4;
  };

  // ---- Header block ----
  page.push({ rect: { x: 0, y: 0, w: PAGE_WIDTH, h: 118, fill: BAND } });
  rawText(business.name, { x: MARGIN, y: MARGIN + 2, size: 20, bold: true, color: INK });
  rawText('WHOLESALE CRACKERS', { x: MARGIN, y: MARGIN + 26, size: 11, bold: true, color: MUTED });
  y = MARGIN + 48;
  rawText(`Mobile Number: ${business.phone}${business.phoneAlt ? `, ${business.phoneAlt}` : ''}`, { x: MARGIN, y, size: 9, color: INK });
  y += 13;
  rawText(`Email ID: ${business.email}`, { x: MARGIN, y, size: 9, color: INK });
  y += 13;
  // Address can wrap to two lines; measure manually to keep within the band.
  const addressLines = wrapText(`Address: ${business.address}${business.city ? `, ${business.city}` : ''}`, 9, CONTENT_WIDTH);
  for (const line of addressLines.slice(0, 2)) {
    rawText(line, { x: MARGIN, y, size: 9, color: INK });
    y += 12;
  }
  y = 118 + MARGIN;

  // ---- Enquiry meta ----
  hline();
  text(`Customer Enquiry No: ${enquiry.reference}`, { size: 10, bold: true });
  text(`Date: ${formatDateTime(enquiry.createdAt)}`, { size: 9, color: MUTED });
  const twoCol = (left, right) => {
    ensure(12);
    page.push({ text: left, x: MARGIN, y, size: 9 });
    page.push({ text: right, x: MARGIN + 280, y, size: 9 });
    y += 12;
  };
  twoCol(`Name: ${enquiry.name || '-'}`, `Mobile: ${enquiry.mobile || '-'}`);
  twoCol(`City: ${enquiry.city || '-'}`, `Occasion: ${enquiry.occasion || '-'}`);
  if (enquiry.address) text(`Delivery Address: ${enquiry.address}`, { size: 9, color: MUTED });
  gap(2);
  hline();

  // ---- Products table ----
  text('CUSTOMER ENQUIRY / PRODUCT DETAILS', { size: 11, bold: true });
  gap(2);
  tableHeader();
  items.forEach((item, index) => {
    if (y + ROW_H > PAGE_HEIGHT - MARGIN - 24) {
      newPage();
      tableHeader();
    }
    ensure(ROW_H);
    rowStart(index, item);
    y += ROW_H;
    page.push({ line: { x1: MARGIN, y1: y - 6, x2: RIGHT, y2: y - 6, color: LINE, width: 0.5 } });
  });

  function rowStart(index, item) {
    const image = images[index];
    if (image) {
      // Contain-fit inside the image box so the photo keeps its proportions.
      const scale = Math.min(IMG_BOX / image.width, IMG_BOX / image.height);
      const w = image.width * scale;
      const h = image.height * scale;
      const ix = COL.image.x + (IMG_BOX - w) / 2;
      const iy = y + (IMG_BOX - h) / 2;
      page.push({ image: { data: image.data, width: image.width, height: image.height, x: ix, y: iy, w, h } });
    } else {
      page.push({ rect: { x: COL.image.x, y, w: IMG_BOX, h: IMG_BOX, fill: BAND } });
      page.push({ text: 'No image', x: COL.image.x + 4, y: y + IMG_BOX / 2 - 4, size: 7, color: MUTED });
    }
    const nameLines = wrapText(item.name, 9.5, COL.product.w);
    let ty = y + 2;
    nameLines.slice(0, 3).forEach((line, i) => {
      page.push({ text: line, x: COL.product.x, y: ty, size: 9.5, bold: i === 0 });
      ty += 12;
    });
    if (item.packSize) {
      page.push({ text: String(item.packSize), x: COL.product.x, y: ty, size: 8, color: MUTED });
      ty += 10;
    }
    page.push({ text: String(item.category || item.categoryLabel || '-'), x: COL.category.x, y: y + 2, size: 9 });
    const qtyText = String(item.quantity);
    page.push({ text: qtyText, x: COL.qty.x + COL.qty.w - widthOfText(qtyText, 9.5), y: y + 2, size: 9.5 });
    const priceText = pdfCurrency(item.price);
    page.push({ text: priceText, x: COL.price.x + COL.price.w - widthOfText(priceText, 9.5), y: y + 2, size: 9.5 });
    const totalText = pdfCurrency(item.price * item.quantity);
    page.push({ text: totalText, x: COL.total.x + COL.total.w - widthOfText(totalText, 9.5), y: y + 2, size: 9.5, bold: true });
  }

  // ---- Totals ----
  gap(4);
  ensure(40);
  const totalUnits = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const total =
    Number(enquiry.indicativeTotal) > 0
      ? Number(enquiry.indicativeTotal)
      : items.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0), 0);
  page.push({ rect: { x: MARGIN, y: y - 4, w: CONTENT_WIDTH, h: 22, fill: BAND } });
  page.push({ text: `Total units: ${totalUnits}`, x: MARGIN + 6, y, size: 10, bold: true });
  const totalText = `Total: ${pdfCurrency(total)}`;
  page.push({ text: totalText, x: RIGHT - widthOfText(totalText, 10), y, size: 10, bold: true });
  y += 26;
  gap(2);

  // ---- Notes ----
  if (enquiry.notes && enquiry.notes.trim()) {
    text('Additional Message:', { size: 10, bold: true });
    text(enquiry.notes);
    gap(2);
  }

  // ---- Business footer ----
  hline();
  text(`${business.name} — Wholesale Crackers`, { size: 9.5, bold: true });
  text(`Mobile: ${business.phone}${business.phoneAlt ? ` / ${business.phoneAlt}` : ''}  |  Email: ${business.email}`, { size: 8.5, color: MUTED });
  text(business.address, { size: 8.5, color: MUTED });
  text('Thank you for your enquiry. We will get back to you shortly.', { size: 8.5, color: MUTED });

  // ---- Page numbers ----
  const pageCount = pages.length;
  pages.forEach((p, i) => {
    p.push({ text: `Page ${i + 1} of ${pageCount}`, x: RIGHT - widthOfText(`Page ${i + 1} of ${pageCount}`, 8), y: PAGE_HEIGHT - 24, size: 8, color: MUTED });
  });

  return pages;
};

/** Full PDF for the saved enquiry — the exact data that was stored. */
export const enquiryPdfDocument = async (enquiry) => buildPdf(await enquiryPdfPages(enquiry));

export const enquiryPdfBlob = async (enquiry) =>
  new Blob([await enquiryPdfDocument(enquiry)], { type: 'application/pdf' });

export const enquiryPdfFileName = (enquiry) => `Anish-Enterprise-Enquiry-${enquiry.reference || 'enquiry'}.pdf`;

export const PDF_CONTENT_TYPE = 'application/pdf';

export { PDF_HEADER };
