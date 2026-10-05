import { business } from '../config/business';
import { formatCurrency, formatDateTime } from './format';
import { buildPdf, PDF_HEADER } from './pdf';

const pdfCurrency = (value) => formatCurrency(value).replace('₹', 'Rs.');

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 36;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

// Compact column grid for the products table.
const COL_SNO = MARGIN;
const COL_PRODUCT = MARGIN + 34;
const COL_QTY = MARGIN + 320;
const COL_PRICE = MARGIN + 400;
const PRODUCT_MAX_WIDTH = COL_QTY - COL_PRODUCT - 8;

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

const truncate = (text, size, maxWidth) => {
  let value = String(text ?? '');
  while (value.length * size * 0.5 > maxWidth && value.length > 1) value = `${value.slice(0, -4)}...`;
  return value;
};

/**
 * Builds the page data (arrays of text runs) for the compact enquiry PDF.
 * Uses the exact saved enquiry object — no separate data shape.
 */
export const enquiryPdfPages = (enquiry) => {
  const pages = [[]];
  let page = pages[0];
  let y = MARGIN;
  let pageNumber = 1;
  let justStartedPage = false;
  let inTable = false;

  const newPage = () => {
    page = [];
    pages.push(page);
    pageNumber += 1;
    y = MARGIN;
    page.push({ text: `${business.name} - Enquiry ${enquiry.reference} (page ${pageNumber})`, x: MARGIN, y, size: 8, bold: true });
    y += 14;
    justStartedPage = true;
  };

  const ensure = (needed = 12) => {
    if (y + needed > PAGE_HEIGHT - MARGIN) newPage();
  };

  const text = (value, { size = 9, bold = false, x = MARGIN, maxWidth = CONTENT_WIDTH - (x - MARGIN) } = {}) => {
    for (const line of wrapText(value, size, maxWidth)) {
      ensure(size + 3);
      page.push({ text: line, x, y, size, bold });
      y += size + 3;
    }
  };

  const gap = (amount = 4) => {
    y += amount;
  };

  const rule = (size = 7) => text('-'.repeat(Math.max(20, Math.floor(CONTENT_WIDTH / (size * 0.34)))), { size });

  const rowText = (cells) => {
    ensure(11);
    for (const cell of cells) page.push({ text: cell.text, x: cell.x, y, size: 9, bold: cell.bold });
    y += 11;
  };

  const tableHeader = () => {
    rowText([
      { text: 'S.No', x: COL_SNO, bold: true },
      { text: 'Product Name', x: COL_PRODUCT, bold: true },
      { text: 'Quantity', x: COL_QTY, bold: true },
      { text: 'Price', x: COL_PRICE, bold: true },
    ]);
    rule();
  };

  text(business.name.toUpperCase(), { size: 14, bold: true });
  text('Wholesale Crackers - Sivakasi', { size: 9 });
  text(`Phone / WhatsApp: ${business.phone}${business.email ? `  |  ${business.email}` : ''}`, { size: 8 });
  text(business.address, { size: 8 });
  gap(2);
  rule();
  gap(2);

  text('ENQUIRY DETAILS', { size: 10, bold: true });
  text(`Enquiry No: ${enquiry.reference}`);
  text(`Enquiry Date: ${formatDateTime(enquiry.createdAt)}`);
  gap(2);

  text('CUSTOMER DETAILS', { size: 10, bold: true });
  text(`Name: ${enquiry.name || '-'}`);
  text(`Mobile: ${enquiry.mobile || '-'}`);
  text(`Email: ${enquiry.email || '-'}`);
  text(`City: ${enquiry.city || '-'}`);
  text(`Delivery Address: ${enquiry.address || '-'}`);
  text(`PIN Code: ${enquiry.pin || '-'}`);
  text(`Occasion: ${enquiry.occasion || '-'}`);
  text(`Preferred Contact: ${enquiry.preferredContact || '-'}`);
  gap(2);

  text('SELECTED PRODUCTS', { size: 10, bold: true });
  inTable = true;
  tableHeader();
  (enquiry.items || []).forEach((item, index) => {
    if (justStartedPage) {
      tableHeader();
      justStartedPage = false;
    }
    ensure(11);
    const nameLines = wrapText(item.name, 9, PRODUCT_MAX_WIDTH);
    for (let i = 0; i < nameLines.length; i += 1) {
      ensure(11);
      if (justStartedPage) {
        tableHeader();
        justStartedPage = false;
      }
      page.push({ text: i === 0 ? String(index + 1) : '', x: COL_SNO, y, size: 9 });
      page.push({ text: nameLines[i], x: COL_PRODUCT, y, size: 9 });
      if (i === nameLines.length - 1) {
        page.push({ text: String(item.quantity), x: COL_QTY, y, size: 9 });
        page.push({ text: pdfCurrency(item.price * item.quantity), x: COL_PRICE, y, size: 9 });
      }
      y += 11;
    }
    if (item.packSize) {
      ensure(11);
      page.push({ text: `(${item.packSize})`, x: COL_PRODUCT, y, size: 8 });
      y += 10;
    }
  });
  inTable = false;

  gap(2);
  const totalUnits = (enquiry.items || []).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const total =
    Number(enquiry.indicativeTotal) > 0
      ? Number(enquiry.indicativeTotal)
      : (enquiry.items || []).reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0), 0);

  text('ORDER SUMMARY', { size: 10, bold: true });
  text(`Total Units: ${totalUnits}`, { bold: true });
  text(`Total Amount: ${pdfCurrency(total)}`, { size: 11, bold: true });
  gap(2);

  text('ADDITIONAL MESSAGE', { size: 10, bold: true });
  text(enquiry.notes && enquiry.notes.trim() ? enquiry.notes : '-');
  gap(2);

  text('BUSINESS DETAILS', { size: 10, bold: true });
  text(`${business.name}`, { bold: true });
  text(`Sivakasi${business.address ? `, ${business.address}` : ''}`);
  text(`Phone / WhatsApp: ${business.phone}`);
  if (business.email) text(`Email: ${business.email}`);
  gap(6);
  rule();
  text('Thank you.', { size: 8 });
  text(`Generated on ${formatDateTime(enquiry.createdAt)} via the ${business.name} website.`, { size: 7 });

  return pages;
};

/** Full PDF text for the saved enquiry — the exact data that was stored. */
export const enquiryPdfDocument = (enquiry) => buildPdf(enquiryPdfPages(enquiry));

export const enquiryPdfBlob = (enquiry) =>
  new Blob([enquiryPdfDocument(enquiry)], { type: 'application/pdf' });

export const enquiryPdfFileName = (enquiry) => `${enquiry.reference || 'enquiry'}.pdf`;

export const PDF_CONTENT_TYPE = 'application/pdf';

export { PDF_HEADER };
