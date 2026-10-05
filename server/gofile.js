const GOFILE_API = 'https://api.gofile.io';

/**
 * Server-side GoFile upload + direct-link creation.
 *
 * Uses the account token from GOFILE_TOKEN so the direct-link API is allowed
 * to create a link for the freshly uploaded content. Guest uploads are
 * rejected by the direct-link endpoint (error-notPremium), so the token is
 * required — without it we surface an error instead of sending a folder link.
 */
export const uploadPdfToGoFile = async (pdfBuffer, fileName) => {
  const token = process.env.GOFILE_TOKEN;
  if (!token) {
    throw new Error('GOFILE_TOKEN environment variable is not set.');
  }

  const serversResponse = await fetch(`${GOFILE_API}/servers`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const serversPayload = await serversResponse.json().catch(() => null);
  const server = serversPayload?.data?.servers?.[0]?.name;
  if (!serversResponse.ok || !server) {
    throw new Error('Unable to reach GoFile servers.');
  }

  const form = new FormData();
  form.append('file', new Blob([pdfBuffer], { type: 'application/pdf' }), fileName);

  const uploadResponse = await fetch(`https://${server}.gofile.io/uploadfile`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const uploadPayload = await uploadResponse.json().catch(() => null);
  if (uploadPayload?.status !== 'ok' || !uploadPayload?.data?.id) {
    console.error('GoFile upload failed:', uploadPayload);
    throw new Error('Unable to upload the PDF.');
  }

  const contentId = uploadPayload.data.id;
  const directLinkResponse = await fetch(`${GOFILE_API}/contents/${contentId}/directlinks`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  const directLinkPayload = await directLinkResponse.json().catch(() => null);
  const directLink = directLinkPayload?.data?.directLink;
  if (directLinkPayload?.status !== 'ok' || !directLink) {
    console.error('GoFile direct link creation failed:', directLinkPayload);
    throw new Error('Unable to create PDF link.');
  }

  return directLink;
};
