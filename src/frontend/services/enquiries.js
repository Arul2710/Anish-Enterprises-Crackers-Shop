import { readArray, writeStorage } from '../utils/storage';
import { enquiryService } from './api';
import { createOrderFromEnquiry } from './orders';

export const enquirySubmissionStorageKey = 'spark-shine-enquiries';

const sanitizeEnquiry = (value) => {
  if (!value || typeof value !== 'object' || !value.reference) return null;
  return {
    reference: String(value.reference),
    createdAt: value.createdAt || new Date().toISOString(),
    name: String(value.name || ''),
    mobile: String(value.mobile || ''),
    email: String(value.email || ''),
    address: String(value.address || ''),
    pin: String(value.pin || ''),
    city: String(value.city || ''),
    occasion: String(value.occasion || ''),
    notes: String(value.notes || ''),
    preferredContact: String(value.preferredContact || 'Phone call'),
    items: Array.isArray(value.items)
      ? value.items.map((item) => ({
          id: String(item.id || ''),
          name: String(item.name || ''),
          category: String(item.category || ''),
          packSize: String(item.packSize || ''),
          quantity: Number(item.quantity) || 0,
          customerPrice: Number(item.customerPrice) || 0,
        }))
      : [],
    indicativeTotal: Number(value.indicativeTotal) || 0,
    status: String(value.status || 'Received'),
    // Whether the API has acknowledged this enquiry. False means it is saved in this
    // browser only, so the panel can tell the operator it still needs sending.
    synced: value.synced === true,
  };
};

export const listEnquiries = () => readArray(enquirySubmissionStorageKey).map(sanitizeEnquiry).filter(Boolean);

export const createReference = () => {
  const stamp = Date.now().toString(36).toUpperCase().slice(-5);
  const suffix = Math.random().toString(36).toUpperCase().slice(2, 5);
  return `ENQ-${stamp}${suffix}`;
};

export const submitEnquiry = async (payload) => {
  const enquiry = sanitizeEnquiry({ ...payload, reference: payload.reference || createReference(), createdAt: new Date().toISOString() });
  if (!enquiry) throw new Error('Enquiry details are incomplete.');

  const stored = listEnquiries();
  writeStorage(enquirySubmissionStorageKey, [enquiry, ...stored]);
  // Every storefront enquiry also lands in admin order management as a new order.
  createOrderFromEnquiry(enquiry);

  // The API records it in MongoDB so it survives this browser. A failure here must not
  // cost the customer their enquiry: the local copy is already saved, so only the
  // "reached the server" flag changes and the reference the customer was given holds.
  try {
    await enquiryService.submit(enquiry);
    setSynced(enquiry.reference, true);
  } catch {
    setSynced(enquiry.reference, false);
  }

  return enquiry;
};

export const updateEnquiryStatus = (reference, status) => {
  const next = listEnquiries().map((enquiry) => (enquiry.reference === reference ? { ...enquiry, status } : enquiry));
  writeStorage(enquirySubmissionStorageKey, next);
  return next;
};

/** Records whether the API has taken a copy, without touching its other fields. */
export const setSynced = (reference, synced) => {
  const next = listEnquiries().map((enquiry) => (enquiry.reference === reference ? { ...enquiry, synced: Boolean(synced) } : enquiry));
  writeStorage(enquirySubmissionStorageKey, next);
  return next;
};
