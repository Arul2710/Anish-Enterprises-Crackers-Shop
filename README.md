# Anish Enterprises — Crackers Shop

Enquiry-based storefront and admin panel for a wholesale crackers outlet in
Sivakasi. Storefront and admin run as one React app; a small Node server stores
the generated enquiry PDFs and serves the auto-download PDF links.

| Layer | Where it lives | Stack |
|---|---|---|
| Storefront + admin panel | `src/` | React 18, Vite 6, Tailwind 3, React Router 6 |
| Runtime data | Browser `localStorage` | catalogue, orders, enquiries, cart |
| Enquiry PDFs | `server/index.js` + `uploads/enquiries/` | Express, same-origin API |

There is no separate API database: enquiries, orders and products live in the
browser's localStorage. The only server-side state is the enquiry PDF files
written to `uploads/enquiries/`, which are public via the download route.

---

## 1. Prerequisites

| Requirement | Version |
|---|---|
| Node.js | >= 20 |
| npm | >= 10 |

No database server and no environment file are needed.

---

## 2. Quick start

```bash
npm install
npm run dev
```

Then open the URL Vite prints, normally <http://localhost:5173>.

The admin workspace is at `/admin` and opens directly — there is no login page,
no password, and no session. It has four screens: **Dashboard**, **Products**,
**Orders** and **Customers**.

---

## 3. Running it

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server on port 5173, with hot module replacement |
| `npm run build` | production bundle into `dist/` |
| `npm run start` / `npm run api` | Node server: serves `dist/` plus the enquiry PDF API on port 8080 |
| `npm run preview` | serves the built `dist/` locally to check the production output |
| `npm run manifest` | regenerates `src/data/imageManifest.json` from `public/` |
| `npm run verify:demo` | exercises the order service, the demo seed, the order sheet PDF and the WhatsApp link |

`predev` and `prebuild` run `npm run manifest` first, so the image manifest is
always in step with the files in `public/`.

For the enquiry PDF flow in development, run both `npm run api` and
`npm run dev`; Vite proxies `/api` to the Node server. In production, build
first and then run `npm start` — one process serves the site and the PDFs.

### Deploying

`npm run build` produces a static `dist/`. Because the app uses
`BrowserRouter`, the host must fall back to `index.html` for unknown paths,
otherwise a deep link such as `/admin/orders` or a page refresh returns 404.
Any static host can do this with a rewrite of all paths to `/index.html`.

---

## 4. Where the data lives

```
Browser ──► React app (:5173) ──► localStorage
Browser ──► /api/enquiries/:reference/pdf ──► uploads/enquiries/*.pdf
```

Every module that stores data goes through `src/utils/storage.js`, and the keys
are all prefixed `spark-shine-`:

| Key | Contents |
|---|---|
| `spark-shine-products` | catalogue, including admin edits |
| `spark-shine-categories` | categories and their display order |
| `spark-shine-packs` | combo and gift packs |
| `spark-shine-orders` | orders created from the storefront and admin |
| `spark-shine-enquiries` | enquiries and their status |
| `spark-shine-site-content` | business details, social links, page copy |
| `spark-shine-faqs`, `spark-shine-testimonials` | FAQ and review entries |

Consequences worth being explicit about:

- Data is per browser and per device. Two visitors do not see each other's orders,
  and clearing site data removes everything.
- The catalogue is seeded from `src/data/products.js` on first run and editable
  afterwards from the admin panel. Edits are browser-local.
- There is no login, so the admin panel is simply open. Anyone who can reach the
  URL can edit the catalogue and read the local orders. That is fine for a
  demonstration on a personal machine; do not publish it as-is to the internet.
- Sample orders are written once on first run so the dashboard and the order list
  are not empty panels. They are not re-added if you clear them.

---

## 5. The admin workspace

`/admin` is a plain React screen, not a protected area. It has four screens and
nothing else:

| Screen | Route | What it is for |
|---|---|---|
| Dashboard | `/admin` | Six figures taken from the stored orders and the live catalogue, plus the orders waiting to be answered |
| Products | `/admin/products` | The catalogue the storefront renders: prices, stock and visibility |
| Orders | `/admin/orders` | The order desk — the screen the shop actually runs on |
| Customers | `/admin/customers` | Everyone who has ordered, derived from the order records |

Any other `/admin/...` path lands on the dashboard rather than a 404.

### Order statuses

An order is in exactly one of four states:

| Status | Meaning |
|---|---|
| `Pending Confirmation` | An enquiry has arrived and is waiting on the shop |
| `Confirmed` | Confirmed by the shop, ready to pack |
| `Completed` | Delivered and closed |
| `Rejected` | The shop could not take it on. Left out of the order value |

Orders written by an earlier build used a longer pipeline. They are mapped onto
these four on first read (`New`/`Pending` → Pending Confirmation,
`Processing`/`Shipped` → Confirmed, `Delivered` → Completed, `Cancelled` →
Rejected) rather than discarded.

There is no payment tracking. Prices are the NET RAT values from the price sheet
and are settled by phone with the customer.

### Order documents

Two things can be produced from an open order, both built in the browser with no
library and no server:

- **Download order sheet** — a real `.pdf` file saved to the browser's downloads
  folder, built byte by byte in `src/utils/pdf.js`. It carries the shop masthead,
  the customer block, every line with quantity and rate, the totals and the status
  the order was in at the time of download. A long order spills onto further sheets
  with the column headings repeated. Amounts are printed as `Rs.` because the two
  base fonts every PDF reader carries have no rupee glyph.
- **Send on WhatsApp** — a `wa.me` deep link to the shop's own number with the
  whole order already typed out, so the customer's reply arrives against the same
  record.

### Confirming an order

Changing a status is the only write the admin makes. Each change is stamped and
appended to that order's history, and every screen listening for order updates
re-renders from the new value, so the panel never shows a stale row.

---

## 6. Business contact details

`src/config/business.js` is the single source for the shop's details. The
published phone number, the WhatsApp link and every printed document derive from
it, so changing the number in one place updates the contact page, the footer,
the admin panel and generated PDFs together.

Anything saved from **Admin > Products** is written to `localStorage` and wins over
these defaults; clearing that entry falls back to this file.

---

## 7. Repository layout

```
crackers/
├── src/
│   ├── pages/        storefront screens
│   ├── admin/        the four admin screens + AdminLayout shell + AdminUI primitives
│   ├── layouts/      storefront shell
│   ├── components/   shared UI, catalog/ sub-components
│   ├── context/      Content, Catalog, Cart providers
│   ├── hooks/        useCatalog, useCart, useOrders, useSeo, ...
│   ├── services/     orders, enquiries
│   ├── config/       business.js — shared contact details
│   ├── data/         catalog seed, site content, FAQ, testimonials, demo orders
│   ├── routes/       AppRoutes
│   └── utils/        storage, format, images, documents, pdf, orderDocuments
├── server/index.js  Node + Express server: static dist/ hosting and the
│                    enquiry PDF store/download API (uploads/enquiries/)
├── public/           images/, bg/, favicons
├── scripts/          image-manifest.mjs, verify-demo-seed.mjs,
│                     verify-business-contact.mjs
├── index.html        Vite entry, loads /src/main.jsx
├── vite.config.js    output is dist/, dev server on 5173, /api proxy to :8080
└── package.json
```

---

## 8. Notes

- Prices are the catalog **NET RAT** values from the supplied order sheet and are
  labelled indicative until a selling price is confirmed. **RATE** is kept and
  shown on the product page for transparency.
- Products are seeded with no customer-facing image; artwork is generated per
  category so the grid stays consistent until real photos are assigned.
- Spreadsheet exports and order-sheet PDFs are generated in the browser with no
  server round trip and no third-party PDF or spreadsheet package.
- Run `npm run verify:demo` after changing the order service, the demo seed or the
  PDF writer. It seeds into a scratch storage key, checks the totals, the status
  migration, the PDF object table and a deliberately long order that must paginate.