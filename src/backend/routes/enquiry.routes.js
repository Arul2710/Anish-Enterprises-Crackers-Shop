import { Router } from 'express';
import {
  submitEnquiry,
  adminListEnquiries,
  adminGetEnquiry,
  adminSetEnquiryStatus,
} from '../controllers/enquiry.controller.js';
import { requireAuth, requirePermission } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { enquiryLimiter, writeLimiter } from '../middleware/rateLimit.middleware.js';
import { PERMISSION } from '../config/constants.js';
import {
  createEnquirySchema,
  enquiryReferenceParamSchema,
  listEnquiriesQuerySchema,
  updateEnquiryStatusSchema,
} from '../validators/enquiry.validator.js';

const router = Router();

// ------------------------------------------------------------------ public
// Rate limited harder than reads: this is a public, unauthenticated write.
router.post('/', enquiryLimiter, validate(createEnquirySchema), submitEnquiry);

// ------------------------------------------------------------------- admin
// Enquiries are handled alongside orders in the same panel, so they share the
// order permissions rather than inventing a parallel set the UI would not use.
router.get('/', requireAuth, requirePermission(PERMISSION.ORDERS_VIEW), validate(listEnquiriesQuerySchema), adminListEnquiries);

router.get(
  '/:reference',
  requireAuth,
  requirePermission(PERMISSION.ORDERS_VIEW),
  validate(enquiryReferenceParamSchema, 'params'),
  adminGetEnquiry,
);

router.patch(
  '/:reference/status',
  requireAuth,
  requirePermission(PERMISSION.ORDERS_WRITE),
  writeLimiter,
  validate(updateEnquiryStatusSchema),
  adminSetEnquiryStatus,
);

export default router;