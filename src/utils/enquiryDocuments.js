import { business, internationalNumber } from '../config/business';
import { formatCurrency } from './format';

/**
 * The WhatsApp hand-off for a storefront enquiry. There is no PDF and no server:
 * a saved enquiry is opened directly in WhatsApp as a wa.me link whose message box
 * is already filled with the complete enquiry.
 */

const unitsOf = (enquiry) => (enquiry.items || []).reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);

const totalOf = (enquiry) =>
  Number(enquiry.indicativeTotal) > 0
    ? Number(enquiry.indicativeTotal)
    : (enquiry.items || []).reduce((sum, line) => sum + (Number(line.price) || 0) * (Number(line.quantity) || 0), 0);

export const enquiryWhatsAppMessage = (enquiry) => {
  const placed = enquiry.createdAt && !Number.isNaN(new Date(enquiry.createdAt).getTime())
    ? new Date(enquiry.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
    : 'Not recorded';

  const lines = [
    'New Enquiry',
    '',
    `Enquiry No: ${enquiry.reference}`,
    '',
    'Customer Details:',
    '',
    `Name: ${enquiry.name || '-'}`,
    `Mobile: ${enquiry.mobile || '-'}`,
    `Email: ${enquiry.email || '-'}`,
    `City: ${enquiry.city || '-'}`,
    `Delivery Address: ${enquiry.address || '-'}`,
    `PIN Code: ${enquiry.pin || '-'}`,
    `Occasion: ${enquiry.occasion || '-'}`,
    '',
    'Preferred Contact:',
    enquiry.preferredContact || '-',
    '',
    'Selected Products:',
    '',
    ...(enquiry.items || []).flatMap((line, index) => [
      `${index + 1}. ${line.name} × ${line.quantity}`,
      `   ${line.packSize || line.categoryLabel || '-'}`,
      `   Price: ${formatCurrency(line.price * line.quantity)}`,
      '',
    ]),
    `Total Units: ${unitsOf(enquiry)}`,
    '',
    `Total: ${formatCurrency(totalOf(enquiry))}`,
    '',
    'Additional Message:',
    enquiry.notes || '-',
    '',
    'Enquiry Date:',
    placed,
  ];

  if (enquiry.pdfUrl) {
    lines.push('', 'View / Download Enquiry PDF:', enquiry.pdfUrl);
  }

  return lines.join('\n');
};

/** The wa.me deep link that opens WhatsApp with the message above already typed. */
export const enquiryWhatsAppUrl = (enquiry) => {
  const to = internationalNumber(business.whatsapp);
  if (!to || !enquiry) return '';
  return `https://wa.me/${to}?text=${encodeURIComponent(enquiryWhatsAppMessage(enquiry))}`;
};
