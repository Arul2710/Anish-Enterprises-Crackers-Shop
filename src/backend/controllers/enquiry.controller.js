import { asyncHandler } from '../utils/asyncHandler.js';
import { sendCreated, sendPaginated, sendSuccess } from '../utils/response.js';
import { createEnquiry, findEnquiryByReference, listEnquiries, updateEnquiryStatus } from '../services/enquiry.service.js';

// ------------------------------------------------------------------ public
/**
 * Records a storefront enquiry and echoes back the stored record. The customer is
 * answered from MongoDB rather than from the request body, so what they are told
 * matches what the shop will actually see.
 */
export const submitEnquiry = asyncHandler(async (req, res) => {
  const enquiry = await createEnquiry(req.body);
  return sendCreated(res, { enquiry });
});

// ------------------------------------------------------------------- admin
export const adminListEnquiries = asyncHandler(async (req, res) => {
  const { items, total, page, pageSize } = await listEnquiries(req.query);
  return sendPaginated(res, items, { page, pageSize, total });
});

export const adminGetEnquiry = asyncHandler(async (req, res) =>
  sendSuccess(res, { enquiry: await findEnquiryByReference(req.params.reference) }),
);

export const adminSetEnquiryStatus = asyncHandler(async (req, res) => {
  const enquiry = await findEnquiryByReference(req.params.reference);
  const updated = await updateEnquiryStatus(enquiry, { ...req.body, admin: req.admin });
  return sendSuccess(res, { enquiry: updated });
});