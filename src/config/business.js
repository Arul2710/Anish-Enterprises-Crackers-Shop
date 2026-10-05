/**
 * The one place the business contact details live.
 *
 * Every screen that shows or dials the shop reads from here: the footer, the
 * contact page, the enquiry form, the WhatsApp button, the printed order sheet,
 * the PDF/invoice masthead and the admin contact screen. Change a number in this
 * file and the whole site follows, with no component holding its own copy.
 *
 * Nothing in this file is a secret and nothing here talks to a server - it is
 * plain frontend configuration.
 */

/** International dialling code, needed to build a wa.me deep link. */
export const countryCode = '91';

export const business = {
  name: 'Anish Enterprises',

  /** Primary line. Shown first everywhere and opens the dialler. */
  phone: '9488821144',
  /** The second published shop line. Shown below the primary number. */
  phoneAlt: '9442521144',

  /** The number behind the floating WhatsApp button. */
  whatsapp: '9488821144',

  email: 'anishenterprisessvk@gmail.com',
  address: 'Kamak Road, Near Kamavar Kalyanamandapam',
  city: '',
  state: '',
  businessHours: 'Sunday to Saturday 8.00 AM to 8.00 PM',

  mapUrl: 'https://maps.app.goo.gl/n8QT6EUq98P87LnV9?g_st=ac',
  // Google blocks framing maps.app.goo.gl share links, so the contact page embeds
  // this pre-resolved coordinates URL instead. Update both together if the shop moves.
  mapEmbedUrl: 'https://www.google.com/maps?q=9.446091,77.8052485&z=16&output=embed',
};

const digitsOnly = (value) => String(value ?? '').replace(/\D/g, '');

/** Full international digits for a shop line, used to build a wa.me link. */
export const internationalNumber = (value = business.whatsapp) => {
  const digits = digitsOnly(value);
  if (!digits) return '';
  // An Indian number with the country code already dialled in (91 + 10 digits) is
  // used as it is; anything else gets 91 prefixed.
  return digits.length === 12 && digits.startsWith(countryCode) ? digits : `${countryCode}${digits}`;
};

/** The wa.me deep link the WhatsApp button and contact links open. */
export const whatsappUrl = (value = business.whatsapp) =>
  internationalNumber(value) ? `https://wa.me/${internationalNumber(value)}` : '';

/** A tel: href for a shop line. Returns '' for an empty number so no dead link renders. */
export const telHref = (value) => (digitsOnly(value) ? `tel:${digitsOnly(value)}` : '');

/**
 * Every published phone line in the order it should be read. The contact page,
 * the footer and the admin contact screen all use this, so they cannot drift
 * apart and start listing the numbers the other way round.
 */
export const businessPhoneLines = () =>
  [
    { label: 'Call or WhatsApp', value: business.phone },
    { label: 'Call the shop', value: business.phoneAlt },
  ]
    .map((line) => ({ ...line, value: String(line.value || '').trim() }))
    .filter((line, index, all) => line.value && all.findIndex((other) => other.value === line.value) === index);

/** The contact shape the printed order sheet, invoice and report mastheads expect. */
export const businessContact = () => ({
  businessName: business.name,
  phone: business.phone,
  email: business.email,
  address: business.address,
  city: business.city,
  state: business.state,
});

export default business;