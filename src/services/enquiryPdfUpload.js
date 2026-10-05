import { enquiryPdfBlob, enquiryPdfFileName } from '../utils/enquiryPdf';

/**
 * Stores the fully-generated enquiry PDF on the project's own server and
 * returns its real, publicly reachable download URL. The server always sends
 * Content-Disposition: attachment, so clicking the link in WhatsApp downloads
 * the PDF directly.
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
    throw new Error('Unable to prepare your enquiry PDF. Please try again.');
  }

  return payload.pdfUrl;
};
