import { Enquiry } from '../models/Enquiry.js';
import { ApiError } from '../utils/ApiError.js';
import { safePattern } from '../utils/sanitize.js';
import { getPagination } from '../utils/pagination.js';
import { roundMoney } from '../utils/money.js';
import { ENQUIRY_STATUS_TRANSITIONS } from '../config/constants.js';

/** Turns validated query parameters into a Mongo filter. */
export const buildEnquiryFilter = (query = {}) => {
  const filter = {};

  if (query.status) filter.status = query.status;
  if (query.search) {
    // Escaped so a search term can never act as a regex injection vector.
    const pattern = new RegExp(safePattern(query.search), 'i');
    filter.$or = [{ reference: pattern }, { 'customer.name': pattern }, { 'customer.phone': pattern }, { 'customer.email': pattern }];
  }

  return filter;
};

export const listEnquiries = async (query = {}) => {
  const { page, pageSize, skip } = getPagination(query);
  const filter = buildEnquiryFilter(query);

  const [items, total] = await Promise.all([
    Enquiry.find(filter).sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean({ virtuals: true }),
    Enquiry.countDocuments(filter),
  ]);

  return { items, total, page, pageSize };
};

export const findEnquiryByReference = async (reference) => {
  const enquiry = await Enquiry.findOne({ reference: String(reference || '').trim() });
  if (!enquiry) throw ApiError.notFound('That enquiry could not be found.', { code: 'enquiry_not_found' });
  return enquiry;
};

/**
 * Records an enquiry, keyed on the reference the customer was given.
 *
 * A storefront that loses the response and retries reuses its reference, so the
 * retry updates the existing record instead of creating a second enquiry. The
 * customer's own copy of the enquiry is therefore never duplicated behind their back.
 */
export const createEnquiry = async (payload) => {
  const reference = String(payload.reference).trim();

  const enquiry = {
    reference,
    customer: {
      name: payload.name,
      phone: payload.mobile,
      email: payload.email || '',
      address: payload.address || '',
      city: payload.city || '',
      state: payload.state || '',
      pin: payload.pin || '',
    },
    occasion: payload.occasion || '',
    preferredContact: payload.preferredContact || 'Phone call',
    notes: payload.notes || '',
    indicativeTotal: roundMoney(payload.indicativeTotal || 0),
    items: (payload.items || []).map((item) => ({
      id: item.id || '',
      name: item.name,
      category: item.category || '',
      kind: item.kind || 'Product',
      packSize: item.packSize || '',
      quantity: item.quantity,
      unitPrice: item.unitPrice || 0,
      lineTotal: item.lineTotal || 0,
    })),
  };

  const saved = await Enquiry.findOneAndUpdate(
    { reference },
    { $set: enquiry, $setOnInsert: { history: [] } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );

  saved.history.push({
    at: new Date(),
    by: null,
    actorName: 'storefront',
    field: 'received',
    from: '',
    to: saved.status,
    note: 'Enquiry received from the website.',
  });
  await saved.save();

  return saved;
};

export const assertEnquiryTransitionAllowed = (current, next) => {
  const allowed = ENQUIRY_STATUS_TRANSITIONS[current] || [];
  if (!allowed.includes(next)) {
    throw ApiError.unprocessable(
      `An enquiry cannot move from ${current} to ${next}. Allowed next steps: ${allowed.length ? allowed.join(', ') : 'none'}.`,
      { code: 'invalid_status_transition', details: { from: current, to: next, allowed } },
    );
  }
};

export const updateEnquiryStatus = async (enquiry, { status, note, admin }) => {
  assertEnquiryTransitionAllowed(enquiry.status, status);

  const from = enquiry.status;
  enquiry.status = status;
  enquiry.statusUpdatedAt = new Date();
  enquiry.history.push({
    at: new Date(),
    by: admin?._id || null,
    actorName: admin?.name || 'system',
    field: 'status',
    from,
    to: status,
    note: note || '',
  });
  await enquiry.save();

  return enquiry;
};