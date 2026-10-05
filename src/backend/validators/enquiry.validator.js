import { z } from 'zod';
import { ENQUIRY_STATUSES } from '../config/constants.js';
import { email, identifier, money, phone, quantity, requiredText, trimmed } from './common.validator.js';

const enquiryItemSchema = z.object({
  id: trimmed(80).optional().default(''),
  name: requiredText(300, 'Item name'),
  category: trimmed(120).optional().default(''),
  kind: trimmed(40).optional().default('Product'),
  packSize: trimmed(120).optional().default(''),
  quantity,
  unitPrice: money.optional().default(0),
  lineTotal: money.optional().default(0),
});

/**
 * An enquiry is a request for a quote, not an order, so this schema accepts the
 * indicative total the customer was shown. It is stored as stated and is never
 * treated as an agreed price - only an order carries binding, server-computed money.
 */
export const createEnquirySchema = z.object({
  body: z.object({
    reference: requiredText(40, 'Reference'),
    customer: z
      .object({
        name: requiredText(120, 'Name'),
        phone,
        email: email.optional().default(''),
      })
      .optional(),
    // The storefront posts these at the top level; both shapes are accepted so the
    // endpoint is usable from a plain form post as well as from the React app.
    name: requiredText(120, 'Name'),
    mobile: phone,
    email: email.optional().default(''),
    address: trimmed(250).optional().default(''),
    city: trimmed(120).optional().default(''),
    state: trimmed(120).optional().default(''),
    pin: trimmed(12).optional().default(''),
    occasion: trimmed(120).optional().default(''),
    preferredContact: trimmed(60).optional().default('Phone call'),
    notes: trimmed(2000).optional().default(''),
    indicativeTotal: money.optional().default(0),
    items: z.array(enquiryItemSchema).optional().default([]),
  }),
});

export const listEnquiriesQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    status: trimmed(40).optional(),
    search: trimmed(120).optional(),
  }),
});

export const enquiryReferenceParamSchema = z.object({ reference: identifier });

export const updateEnquiryStatusSchema = z.object({
  body: z.object({
    status: z.enum(ENQUIRY_STATUSES),
    note: trimmed(500).optional().default(''),
  }),
  params: z.object({ reference: identifier }),
});
