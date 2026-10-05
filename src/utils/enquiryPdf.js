import { business } from '../config/business';
import { formatCurrency, formatDateTime } from './format';
import { buildPdf, PDF_HEADER } from './pdf';

const pdfCurrency = (value) => formatCurrency(value).replace('₹', 'Rs.');

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

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

/**
 * Builds the page data (arrays of text runs) for the complete enquiry PDF.
 * Uses the exact saved enquiry object — no separate data shape.
 */
export const enquiryPdfPages = (enquiry) => {
  const pages = [[]];
  let page = pages[0];
  let y = MARGIN + 4;
  let pageNumber = 1;

  const newPage = () => {
    page = [];
    pages.push(page);
    pageNumber += 1;
    y = MARGIN + 4;
    page.push({ text: `${business.name} — Enquiry ${enquiry.reference} (page ${pageNumber})`, x: MARGIN, y, size: 8, bold: true });
    y += 18;
  };

  const ensure = (needed = 14) => {
    if (y + needed > PAGE_HEIGHT - MARGIN) newPage();
  };

  const text = (value, { size = 10, bold = false, x = MARGIN } = {}) => {
    for (const line of wrapText(value, size, CONTENT_WIDTH - (x - MARGIN))) {
      ensure(size + 5);
      page.push({ text: line, x, y, size, bold });
      y += size + 5;
    }
  };

  const gap = (amount = 8) => {
    y += amount;
  };

  const section = (title) => {
    ensure(30);
    gap(6);
    text(title.toUpperCase(), { size: 10, bold: true });
    text('-'.repeat(46), { size: 8 });
    gap(2);
  };

  text(business.name, { size: 18, bold: true });
  gap(2);
  text(`${business.address}${business.city ? `, ${business.city}` : ''}  |  Phone: ${business.phone}  |  ${business.email}`, { size: 9 });
  gap(4);
  text('-'.repeat(74), { size: 8 });
  gap(6);
  text('Enquiry Sheet', { size: 14, bold: true });
  gap(4);

  section('Enquiry Details');
  text(`Enquiry Number: ${enquiry.reference}`);
  text(`Enquiry Date/Time: ${formatDateTime(enquiry.createdAt)}`);

  section('Customer Details');
  text(`Full Name: ${enquiry.name || '-'}`);
  text(`Mobile Number: ${enquiry.mobile || '-'}`);
  text(`Email: ${enquiry.email || '-'}`);
  text(`City / Town: ${enquiry.city || '-'}`);
  text(`Delivery Address: ${enquiry.address || '-'}`);
  text(`PIN Code: ${enquiry.pin || '-'}`);
  text(`Occasion: ${enquiry.occasion || '-'}`);
  text(`Preferred Contact Method: ${enquiry.preferredContact || '-'}`);

  section('Selected Products');
  (enquiry.items || []).forEach((item, index) => {
    ensure(34);
    text(`${index + 1}. ${item.name}`, { bold: true });
    text(`   Quantity: ${item.quantity}    Box/Unit: ${item.packSize || '-'}    Price: ${pdfCurrency(item.price)}    Total: ${pdfCurrency(item.price * item.quantity)}`, { size: 9 });
    gap(2);
  });

  const totalUnits = (enquiry.items || []).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const total =
    Number(enquiry.indicativeTotal) > 0
      ? Number(enquiry.indicativeTotal)
      : (enquiry.items || []).reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0), 0);

  text('-'.repeat(46), { size: 8 });
  text(`Total Units: ${totalUnits}`, { bold: true });
  text(`Grand Total: ${pdfCurrency(total)}`, { size: 12, bold: true });

  section('Additional Customer Message');
  text(enquiry.notes || '-');

  gap(16);
  text(`Enquiry generated on ${formatDateTime(enquiry.createdAt)} via the ${business.name} website.`, { size: 8 });

  return pages;
};

/** Full PDF text for the saved enquiry — the exact data that was stored. */
export const enquiryPdfDocument = (enquiry) => buildPdf(enquiryPdfPages(enquiry));

export const enquiryPdfBlob = (enquiry) =>
  new Blob([enquiryPdfDocument(enquiry)], { type: 'application/pdf' });

export const enquiryPdfFileName = (enquiry) => `${enquiry.reference || 'enquiry'}.pdf`;

export const PDF_CONTENT_TYPE = 'application/pdf';

export { PDF_HEADER };
