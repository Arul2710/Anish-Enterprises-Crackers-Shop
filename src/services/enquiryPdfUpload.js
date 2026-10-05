import { enquiryPdfBlob, enquiryPdfFileName } from '../utils/enquiryPdf';

/**
 * Stores the fully-generated enquiry PDF and returns its public URL.
 *
 * Preferred path: the project's own Node server (/api/enquiries/:reference/pdf)
 * which stores the file and streams it back with
 * Content-Disposition: attachment so clicking the link downloads the PDF.
 *
 * Vercel fallback: Vercel cannot run the persistent Express server, so when
 * the API route is unavailable we upload to GoFile instead and return its
 * public URL. The PDF is still publicly accessible; the difference is that the
 * GoFile URL lands on a download page instead of auto-starting the download.
 */

const uploadToNodeServer = async (enquiry, blob) => {
  const reference = encodeURIComponent(enquiry.reference);
  let response;
  try {
    response = await fetch(`/api/enquiries/${reference}/pdf`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf', 'X-File-Name': enquiryPdfFileName(enquiry) },
      body: blob,
    });
  } catch {
    return null; // server not reachable — caller falls back to GoFile
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.pdfUrl) return null;
  return payload.pdfUrl;
};

const uploadToGoFile = async (enquiry, blob) => {
  const serversResponse = await fetch('https://api.gofile.io/servers');
  const serversPayload = await serversResponse.json().catch(() => null);
  const server = serversPayload?.data?.servers?.[0]?.name;
  if (!serversResponse.ok || !server) {
    throw new Error('Unable to prepare your enquiry PDF. Please try again.');
  }
  const formData = new FormData();
  formData.append('file', blob, enquiryPdfFileName(enquiry));
  const response = await fetch(`https://${server}.gofile.io/uploadfile`, { method: 'POST', body: formData });
  const payload = await response.json().catch(() => null);
  const downloadPage = payload?.data?.downloadPage;
  if (!response.ok || !downloadPage || !/^https:\/\/gofile\.io\//.test(downloadPage)) {
    console.error('GoFile upload failed:', response.status, payload);
    throw new Error('Unable to prepare your enquiry PDF. Please try again.');
  }
  return downloadPage;
};

export const uploadEnquiryPdf = async (enquiry) => {
  const blob = enquiryPdfBlob(enquiry);
  const serverUrl = await uploadToNodeServer(enquiry, blob);
  if (serverUrl) return serverUrl;

  console.warn('Enquiry PDF API unavailable (static deploy?) — uploading to GoFile instead.');
  try {
    return await uploadToGoFile(enquiry, blob);
  } catch (error) {
    console.error('PDF upload failed:', error);
    throw error;
  }
};
