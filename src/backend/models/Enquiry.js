import mongoose from 'mongoose';
import { ENQUIRY_STATUS, ENQUIRY_STATUSES, MAX_CART_QUANTITY } from '../config/constants.js';
import { roundMoney } from '../utils/money.js';

const { Schema, model } = mongoose;

/**
 * A line as the customer saw it when they enquired. Deliberately denormalised: an
 * enquiry is a request for a quote, not a transaction, so it must still read
 * correctly after the catalogue is renamed or repriced.
 */
const enquiryItemSchema = new Schema(
  {
    id: { type: String, default: '', maxlength: 80 },
    name: { type: String, required: true, maxlength: 300 },
    category: { type: String, default: '', maxlength: 120 },
    kind: { type: String, default: 'Product', maxlength: 40 },
    packSize: { type: String, default: '', maxlength: 120 },
    quantity: { type: Number, required: true, min: 1, max: MAX_CART_QUANTITY },
    unitPrice: { type: Number, default: 0, min: 0 },
    lineTotal: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const enquiryHistorySchema = new Schema(
  {
    at: { type: Date, default: Date.now },
    by: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
    actorName: { type: String, default: 'system' },
    field: { type: String, required: true, maxlength: 40 },
    from: { type: String, default: '' },
    to: { type: String, default: '' },
    note: { type: String, default: '', maxlength: 500 },
  },
  { _id: false },
);

const enquirySchema = new Schema(
  {
    // Issued by the storefront and quoted back to the customer, so it is the handle
    // both sides use. Retrying a submission reuses it instead of duplicating.
    reference: { type: String, required: true, unique: true, index: true },

    customer: {
      name: { type: String, required: true, maxlength: 120 },
      phone: { type: String, required: true, maxlength: 32 },
      email: { type: String, default: '', maxlength: 254 },
      address: { type: String, default: '', maxlength: 250 },
      city: { type: String, default: '', maxlength: 120 },
      state: { type: String, default: '', maxlength: 120 },
      pin: { type: String, default: '', maxlength: 12 },
    },
    occasion: { type: String, default: '', maxlength: 120 },
    preferredContact: { type: String, default: 'Phone call', maxlength: 60 },
    notes: { type: String, default: '', maxlength: 2000 },
    internalNotes: { type: String, default: '', maxlength: 2000, select: false },

    items: { type: [enquiryItemSchema], default: [] },

    /**
     * Indicative only. An enquiry asks "what would this cost?", so the figure the
     * customer saw is recorded as stated and is never treated as an agreed price.
     * Only an order carries server-computed, binding money.
     */
    indicativeTotal: { type: Number, default: 0, min: 0 },

    status: { type: String, enum: ENQUIRY_STATUSES, default: ENQUIRY_STATUS.RECEIVED, index: true },
    statusUpdatedAt: { type: Date, default: Date.now },

    history: { type: [enquiryHistorySchema], default: [] },
  },
  { timestamps: true, versionKey: false },
);

enquirySchema.index({ status: 1, createdAt: -1 });
enquirySchema.index({ 'customer.phone': 1, createdAt: -1 });
enquirySchema.index({ createdAt: -1 });

enquirySchema.pre('validate', function normaliseEnquiry(next) {
  for (const item of this.items) {
    if (!item.lineTotal) item.lineTotal = roundMoney(item.unitPrice * item.quantity);
  }
  if (this.isModified('indicativeTotal')) this.indicativeTotal = roundMoney(this.indicativeTotal);
  next();
});

export const Enquiry = model('Enquiry', enquirySchema);
export default Enquiry;
