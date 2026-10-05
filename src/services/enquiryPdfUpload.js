import { enquiryPdfBlob, enquiryPdfFileName } from '../utils/enquiryPdf';

/**
 * Stores the generated enquiry PDF through the project's own API and returns
 * its direct public URL (https://<domain>/api/enquiries/<reference>/pdf).
 * The same-origin API persists the PDF — on the Node server via the local
 * filesystem, on Vercel via Vercel Blob — and serves it back inline from the
 * same URL, so WhatsApp recipients view it without any third-party redirect.
 */
export const uploadEnquiryPdf = async (enquiry) => {
  const blob = enquiryPdfBlob(enquiry);
  const reference = encodeURIComponent(enquiry.reference);

  let response;
  try {
    response = await fetch(`/api/enquiries/${reference}/pdf`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf', 'X-File-Name': enquiryPdfFileName(enquiry) },
      body: blob,
    });
  } catch (networkError) {
    console.error('PDF upload network error:', networkError);
    throw new Error('Unable to prepare your enquiry PDF. Please try again.');
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch (parseError) {
    console.error('PDF upload returned a non-JSON response:', parseError);
  }

  if (!response.ok || !payload?.pdfUrl) {
    console.error('PDF upload failed:', response.status, payload);
    throw new Error(payload?.error || 'PDF upload failed. Please try again.');
  }

  return payload.pdfUrl;
};
