/**
 * Checks the contact values the app actually publishes.
 *
 * The WhatsApp link and the tel: links are assembled from src/config/business.js
 * at runtime rather than stored as literals, so this asserts the assembled output
 * is correct: the primary number first, no duplicated country code, and no
 * leftover reference to the number the shop used before.
 *
 * Usage: node scripts/verify-business-contact.mjs
 */
import { createServer } from 'vite';

const vite = await createServer({
  configFile: false,
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true },
});

const { business, internationalNumber, whatsappUrl, telHref, businessPhoneLines, businessContact } =
  await vite.ssrLoadModule('/src/config/business.js');

const { siteContentDefaults, contactPhoneLines } = await vite.ssrLoadModule('/src/data/siteContent.js');

const problems = [];
const check = (ok, message) => {
  if (!ok) problems.push(message);
};

console.log('business.phone      :', business.phone);
console.log('business.phoneAlt   :', business.phoneAlt);
console.log('internationalNumber :', internationalNumber(business.phone));
console.log('whatsappUrl         :', whatsappUrl(business.phone));
console.log('telHref             :', telHref(business.phone));
console.log('phone lines         :', businessPhoneLines().map((l) => `${l.label}=${l.value}`).join(' | '));
console.log('siteContent.contact.phone :', siteContentDefaults.contact.phone);
console.log('siteContent.social.whatsapp:', siteContentDefaults.social.whatsapp);

check(business.phone === '9488821144', `primary phone is ${business.phone}, expected 9488821144`);
check(business.phoneAlt === '9442521144', `secondary phone is ${business.phoneAlt}, expected 9442521144`);
check(business.email.endsWith('@gmail.com'), `unexpected email ${business.email}`);
check(business.whatsapp === business.phone, 'the WhatsApp button is not on the primary line');
check(internationalNumber(business.phone) === '919488821144', `international number is ${internationalNumber(business.phone)}`);
check(whatsappUrl(business.phone) === 'https://wa.me/919488821144', `whatsapp url is ${whatsappUrl(business.phone)}`);
check(telHref(business.phone) === 'tel:9488821144', `tel href is ${telHref(business.phone)}`);
check(telHref('') === '', 'an empty number still produces a tel: link');

// A number that already carries the country code must not get a second 91.
check(internationalNumber('919488821144') === '919488821144', 'an already internationalised number was changed');
check(whatsappUrl('919488821144') === 'https://wa.me/919488821144', 'whatsapp url double-prefixed the country code');
check(whatsappUrl('') === '', 'an empty number still produces a whatsapp url');

const lines = businessPhoneLines().map((line) => line.value);
check(lines[0] === '9488821144', `primary number is not listed first (${lines[0]})`);
check(lines.includes('9442521144'), 'secondary number is missing');

check(siteContentDefaults.contact.phone === '9488821144', `site content phone is ${siteContentDefaults.contact.phone}`);
check(siteContentDefaults.social.whatsapp === 'https://wa.me/919488821144', `site content whatsapp is ${siteContentDefaults.social.whatsapp}`);

const storedLines = contactPhoneLines(siteContentDefaults.contact).map((line) => line.value);
console.log('stored contact lines:', contactPhoneLines(siteContentDefaults.contact).map((l) => `${l.label}=${l.value}`).join(' | '));
check(storedLines[0] === '9488821144', `stored contact lists ${storedLines[0]} first, expected the primary line`);

const contact = businessContact();
check(contact.phone === business.phone, 'businessContact() phone does not match business.phone');

await vite.close();

console.log(problems.length ? `\nFAILED (${problems.length}):\n  ${problems.join('\n  ')}` : '\nAll contact checks passed.');
process.exit(problems.length ? 1 : 0);