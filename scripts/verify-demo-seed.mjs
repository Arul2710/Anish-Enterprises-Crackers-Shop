/**
 * Verifies the admin demo seed and the order documents against the real code.
 *
 * The modules are loaded through Vite's SSR module runner, so the exact code the browser
 * runs is exercised, including the extensionless imports that plain Node ESM cannot
 * resolve. localStorage is shimmed so the seed runs headlessly.
 *
 * Checks that seedDemoOrders writes a full set of valid orders, that the totals agree with
 * the line items, that only the four current statuses are used, that a browser with its own
 * orders is left alone but has its retired statuses migrated, and that the order sheet PDF
 * and the WhatsApp link are well formed.
 *
 * Usage: node scripts/verify-demo-seed.mjs
 */
import { createServer } from 'vite';

const makeStorage = () => {
  const map = new Map();
  return {
    map,
    localStorage: {
      getItem: (key) => (map.has(key) ? map.get(key) : null),
      setItem: (key, value) => map.set(key, String(value)),
      removeItem: (key) => map.delete(key),
      clear: () => map.clear(),
    },
  };
};

const problems = [];
const check = (ok, message) => {
  if (!ok) problems.push(message);
};
const round = (n) => Math.round(n * 100) / 100;

const vite = await createServer({
  configFile: false,
  logLevel: 'error',
  // Nothing here needs a browser bundle, so skip dependency pre-bundling: it only
  // adds a background esbuild scan that races with vite.close().
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true },
});

// Loaded once and shared: the order service reads localStorage at call time, so swapping
// the global between runs is enough to point it at a different browser.
const { ORDER_STATUS } = await vite.ssrLoadModule('/src/services/orders.js');
const orderDocuments = { ...(await vite.ssrLoadModule('/src/utils/orderDocuments.js')), pdf: await vite.ssrLoadModule('/src/utils/pdf.js') };

/**
 * The order sheet is real PDF bytes, so it can be checked without a browser: the header,
 * the cross-reference table and the trailer all have to be where the spec says they are.
 */
const verifyPdf = (order) => {
  const { buildPdf } = orderDocuments.pdf;
  const { orderPdfPages } = orderDocuments;
  const id = order.reference;

  const pdf = buildPdf(orderPdfPages(order));
  check(pdf.startsWith('%PDF-1.4'), `${id}: PDF does not start with a %PDF header`);
  check(pdf.trimEnd().endsWith('%%EOF'), `${id}: PDF does not end with %%EOF`);

  const startxref = pdf.match(/startxref\n(\d+)\n%%EOF$/);
  check(Boolean(startxref), `${id}: PDF has no startxref offset`);
  if (startxref) {
    check(pdf.slice(Number(startxref[1]), Number(startxref[1]) + 4) === 'xref', `${id}: startxref does not point at the xref table`);
  }

  // Every object must sit at the offset the xref table claims for it, or a reader
  // silently refuses the file. Row i of the table describes object i, and row 0 is the
  // free entry that is always kept.
  const table = pdf.slice(Number(startxref?.[1] || 0)).split('\n');
  const count = Number(table[1]?.split(' ')[1] || 0);
  check(count > 1, `${id}: xref table is empty`);
  table.slice(2, 2 + count).forEach((row, index) => {
    if (!row.endsWith(' n ')) return;
    const offset = Number(row.slice(0, 10));
    check(pdf.slice(offset).startsWith(`${index} 0 obj`), `${id}: xref entry ${index} does not point at object ${index}`);
  });

  check(pdf.includes('Anish Enterprises'), `${id}: PDF is missing the business name`);
  check(pdf.includes('9488821144'), `${id}: PDF is missing the business phone number`);
  check(pdf.includes(order.reference), `${id}: PDF is missing the order reference`);
  check(!pdf.includes('₹'), `${id}: PDF contains a rupee glyph the base fonts cannot encode`);

  // The declared stream length has to be the real byte count or the reader stops early
  // and the sheet comes out blank from that point on.
  for (const [, declared, stream] of pdf.matchAll(/<< \/Length (\d+) >>\nstream\n([\s\S]*?)endstream/g)) {
    check(Number(declared) === stream.length, `${id}: stream /Length ${declared} != actual ${stream.length}`);
  }

  return pdf;
};

const run = async (label, storage) => {
  globalThis.window = { localStorage: storage.localStorage };
  globalThis.localStorage = storage.localStorage;
  globalThis.dispatchEvent = () => {};
  globalThis.addEventListener = () => {};

  const { seedDemoOrders, demoOrderCount } = await vite.ssrLoadModule('/src/data/dashboardData.js');
  const { listOrders, getOrderStats, listCustomers, orderStorageKey, orderStatuses } = await vite.ssrLoadModule('/src/services/orders.js');

  console.log(`\n=== ${label} ===`);
  const seeded = seedDemoOrders();
  console.log(`seedDemoOrders() -> ${seeded}   (payloads defined: ${demoOrderCount})`);

  const orders = listOrders();
  const raw = JSON.parse(storage.map.get(orderStorageKey) ?? '[]');
  console.log(`listOrders(): ${orders.length}   raw localStorage rows: ${raw.length}`);

  if (seeded) {
    check(orders.length === demoOrderCount, `seeded ${orders.length} orders, expected ${demoOrderCount}`);
    check(raw.length === demoOrderCount, `stored ${raw.length} rows, expected ${demoOrderCount}`);

    for (const order of orders) {
      const id = order.reference || '(no reference)';
      check(Boolean(order.reference), 'an order has no reference');
      check(Number.isFinite(new Date(order.createdAt).getTime()), `${id}: createdAt is not a valid date (${order.createdAt})`);
      check(orderStatuses.includes(order.status), `${id}: status "${order.status}" is not one of ${orderStatuses.join(', ')}`);
      check(Boolean(order.customer?.name), `${id}: missing customer name`);
      check(/^\d{10}$/.test(order.customer?.mobile ?? ''), `${id}: mobile "${order.customer?.mobile}" is not 10 digits`);
      check(Boolean(order.customer?.whatsapp), `${id}: no WhatsApp number on the customer block`);
      check(Boolean(order.channel), `${id}: no channel recorded`);
      check(Array.isArray(order.items) && order.items.length > 0, `${id}: no items`);

      const itemsTotal = round(order.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0));
      check(round(order.totals?.itemsTotal) === itemsTotal, `${id}: itemsTotal ${order.totals?.itemsTotal} != line sum ${itemsTotal}`);
      check(round(order.totals?.grandTotal) === round(itemsTotal + (Number(order.deliveryFee) || 0)), `${id}: grandTotal does not agree with the lines and delivery`);

      order.items.forEach((item) => {
        check(item.quantity > 0, `${id}: item "${item.name}" has quantity ${item.quantity}`);
        check(item.unitPrice > 0, `${id}: item "${item.name}" has unitPrice ${item.unitPrice}`);
        check(!String(item.name).startsWith('Catalog item '), `${id}: item id ${item.id} did not resolve to a real product`);
      });

      verifyPdf(order);

      const { orderWhatsAppUrl, orderWhatsAppMessage } = orderDocuments;
      const url = orderWhatsAppUrl(order);
      check(url.startsWith('https://wa.me/919488821144?text='), `${id}: WhatsApp link is not on the shop number (${url.slice(0, 40)})`);
      const message = orderWhatsAppMessage(order);
      check(message.includes(order.reference), `${id}: WhatsApp message has no order reference`);
      check(decodeURIComponent(url.split('text=')[1]) === message, `${id}: the WhatsApp link text does not match the message`);
    }

    const stats = getOrderStats(orders);
    console.log(`stats ${JSON.stringify(stats)}`);
    console.log(`customers derived: ${listCustomers(orders).length}`);
    console.log(`statuses present: ${[...new Set(orders.map((o) => o.status))].join(', ')}`);
    console.log(`date range ${orders.reduce((m, o) => (o.createdAt < m ? o.createdAt : m), orders[0].createdAt).slice(0, 10)} .. ${orders.reduce((m, o) => (o.createdAt > m ? o.createdAt : m), orders[0].createdAt).slice(0, 10)}`);

    // A rejected order is never business, so it must not appear in the order value.
    const revenueOrders = orders.filter((order) => order.status !== ORDER_STATUS.REJECTED);
    check(round(stats.orderValue) === round(revenueOrders.reduce((sum, order) => sum + order.totals.grandTotal, 0)), 'order value does not match the non-rejected orders');
  }

  return { orders, seeded };
};

// 1. Empty browser: the demo data should be written exactly once.
const fresh = makeStorage();
const first = await run('fresh browser, first run', fresh);
const second = await run('same browser, second run', fresh);
check(second.seeded === false, 'demo seed ran twice on the second visit');
check(second.orders.length === first.orders.length, 'order count changed on the second run');

// 2. Browser with its own orders: must be left alone, but brought onto the current statuses.
const existing = makeStorage();
existing.map.set('spark-shine-orders', JSON.stringify([
  {
    reference: 'REAL-001',
    createdAt: new Date().toISOString(),
    status: 'Pending',
    channel: 'Storefront enquiry',
    customer: { name: 'Real Customer', mobile: '9000000000' },
    items: [{ id: 'excel-1', name: '7 cm Electric', quantity: 2, unitPrice: 10 }],
    deliveryFee: 0,
  },
]));
const third = await run('browser that already has its own orders', existing);
check(third.seeded === false, 'demo seed overwrote a browser that already had orders');
check(third.orders.length === 1 && third.orders[0].reference === 'REAL-001', 'pre-existing orders were not preserved');
check(third.orders[0].status === ORDER_STATUS.PENDING, `retired status "Pending" migrated to "${third.orders[0].status}" instead of ${ORDER_STATUS.PENDING}`);
check(third.orders[0].customer.whatsapp === '9000000000', 'the customer WhatsApp number did not fall back to the mobile number');

// 3. A retired pipeline is mapped onto the four current statuses rather than dropped.
const retired = makeStorage();
retired.map.set('spark-shine-orders', JSON.stringify([
  { reference: 'OLD-1', createdAt: new Date().toISOString(), status: 'Processing', customer: { name: 'A', mobile: '9000000001' }, items: [{ id: 'excel-1', name: '7 cm Electric', quantity: 1, unitPrice: 10 }] },
  { reference: 'OLD-2', createdAt: new Date().toISOString(), status: 'Delivered', customer: { name: 'B', mobile: '9000000002' }, items: [{ id: 'excel-1', name: '7 cm Electric', quantity: 1, unitPrice: 10 }] },
  { reference: 'OLD-3', createdAt: new Date().toISOString(), status: 'Cancelled', customer: { name: 'C', mobile: '9000000003' }, items: [{ id: 'excel-1', name: '7 cm Electric', quantity: 1, unitPrice: 10 }] },
]));
globalThis.window = { localStorage: retired.localStorage };
globalThis.localStorage = retired.localStorage;
const { listOrders: readRetired } = await vite.ssrLoadModule('/src/services/orders.js');
const migrated = readRetired();
console.log('\n=== retired status migration ===');
console.log(migrated.map((order) => `${order.reference}: ${order.status}`).join(' | '));
check(migrated.length === 3, `migration dropped orders (${migrated.length} of 3 left)`);
check(migrated.find((order) => order.reference === 'OLD-1')?.status === ORDER_STATUS.CONFIRMED, 'Processing did not migrate to Confirmed');
check(migrated.find((order) => order.reference === 'OLD-2')?.status === ORDER_STATUS.COMPLETED, 'Delivered did not migrate to Completed');
check(migrated.find((order) => order.reference === 'OLD-3')?.status === ORDER_STATUS.REJECTED, 'Cancelled did not migrate to Rejected');

// 4. A long order has to spill onto further sheets, with the column headings repeated and
//    the totals left on the last one.
const long = {
  reference: 'LONG-001',
  createdAt: new Date().toISOString(),
  status: ORDER_STATUS.PENDING,
  channel: 'Phone call',
  notes: 'Please pack in two separate cartons and deliver before Friday morning.',
  customer: { name: 'Sivakasi Wholesale Traders with a very long trading name', mobile: '9000000004', whatsapp: '9000000004', address: '14/2 North Chithirai Street, near the old bus stand, opposite the temple', city: 'Sivakasi', pin: '626124' },
  items: Array.from({ length: 34 }, (_, index) => ({
    id: `excel-${index + 1}`,
    name: `Product number ${index + 1} with a deliberately long product name to force wrapping`,
    category: 'Fireworks',
    kind: 'Product',
    packSize: '1 Box',
    quantity: index + 1,
    unitPrice: 120 + index,
    lineTotal: (index + 1) * (120 + index),
  })),
  deliveryFee: 250,
};
globalThis.window = { localStorage: fresh.localStorage };
globalThis.localStorage = fresh.localStorage;
const longPages = orderDocuments.orderPdfPages(long);
const longPdf = orderDocuments.pdf.buildPdf(longPages);
console.log(`\n=== long order pagination ===`);
console.log(`${long.items.length} lines -> ${longPages.length} page(s), ${longPdf.length} bytes`);
check(longPages.length > 1, `a ${long.items.length}-line order was squeezed onto ${longPages.length} page`);
check(longPages.length === longPdf.match(/\/Type \/Page[^s]/g).length, 'the page objects do not match the pages that were laid out');
check(longPdf.includes('Grand total'), 'the totals block is missing from the long order');
check(longPdf.includes('Rs. 250.00'), 'the delivery charge is missing from the long order');
check(longPdf.includes('Customer notes'), 'the customer note is missing from the long order');
long.items.forEach((item, index) => check(longPdf.includes(item.name.split(' ').slice(0, 3).join(' ')), `line ${index + 1} is missing from the sheet`));

await vite.close();

console.log(problems.length ? `\nFAILED (${problems.length}):\n  ${problems.join('\n  ')}` : '\nAll demo-seed checks passed.');
process.exit(problems.length ? 1 : 0);