# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start with nodemon (auto-reload)
npm start            # Production start (node server.js)
npm run test-labels  # Generate sample Excel file with mock data — no Zoho creds required
npm run verify       # Smoke-test the Zoho API connection using current credentials
```

There is no build, lint, or test framework. `vercel-build` is a stub that just echoes.

Standalone diagnostic scripts (run with `node <file>.js`) probe specific Zoho behaviors against the live API: `check-delivery-schedule.js`, `check-invoice-structure.js`, `check-recent-invoices.js`, `check-schedule.js`, `check-today-invoices.js`, `get-invoice-details.js`, `debug-zoho.js`, `refresh-token.js`, `test-token-refresh.js`. Use these (or copy their patterns) when debugging Zoho data shape rather than adding logging to `server.js`.

Engines field pins **Node 24.x** — Vercel will reject older versions.

## Architecture

This is a single-file Express app (`server.js`, ~1500 lines) plus a static dashboard (`public/index.html`). It runs identically on a local machine and on Vercel; serverless-specific branches key off `process.env.VERCEL`.

### Four cooperating classes in `server.js`

1. **`CredentialsManager`** — persists Zoho credentials to `credentials.json` (gitignored). Lets warehouse staff configure the app via the web UI without editing `.env`.
2. **`TokenManager`** — owns the Zoho OAuth lifecycle. Reads `credentials.json` first, falls back to `.env`. The Zoho refresh token **rotates on every refresh**, so the new value is written back to both `process.env` and `credentials.json`. Two refresh paths:
   - **Long-running (local/PM2):** `setInterval` refreshes every 50 min.
   - **Serverless (Vercel):** `setInterval` is unreliable, so `getAccessToken()` calls `ensureValidToken()` on each request and refreshes when <5 min remain.
3. **`ZohoBooksAPI`** — talks to the Zoho **Billing** API at `https://www.zohoapis.com.au/billing/v1` (AU region; auth host is `accounts.zoho.com.au`). Two non-obvious behaviors:
   - The list endpoint must be called with `sort_column: 'date'` to make custom fields (`cf_delivery_date`, `cf_delivery_pick_up`) appear in the response — sorting by other columns silently strips them.
   - Date filtering and delivery/pickup filtering are done **client-side** after fetch (Zoho's server-side filtering on custom fields is not used). Date strings come in as either ISO (`YYYY-MM-DD`) or AU (`DD/MM/YYYY`) and both branches must be handled.
   - `enrichDeliveriesWithCustomerData()` falls back to `/contacts/{id}` when an invoice's address or phone is missing — needed because Zoho invoices often don't carry the full address.
4. **`DeliveryLabelGenerator`** — Avery 5162 layout (99.1mm × 38.1mm, 2 cols × 7 rows = 14 per A4 sheet) built with ExcelJS. The address rendering walks a five-step fallback chain (invoice shipping → invoice billing → customer shipping → customer billing → `attention` field); preserve this order when modifying. Line items are split into `products` vs `services` by regex (`/instal|remov/i`) and filtered against `feeKeywords` and `excludeKeywords` (warranty/damaged/etc.).

### Routes

- `GET /` — dashboard (`public/index.html`)
- `GET /api/generate-labels` — tomorrow's deliveries → `.xlsx` download
- `GET /api/generate-labels-today` — today's deliveries (renames the file post-generation since the generator hardcodes tomorrow's date in the filename)
- `GET /sold-tag-form` and `GET /sold-tag?invoice=<id>` — separate flow that renders a print-ready A5 HTML "SOLD" tag from an invoice ID. The fridge/freezer warning block is conditionally inserted based on line-item names.
- `GET /api/setup/status` and `POST /api/setup/save` — credential setup endpoints used by the dashboard
- `GET /api/debug/invoices` — raw Zoho invoice dump for troubleshooting

### Filesystem behavior

Generated Excel files go to `./output/` locally and `/tmp/` on Vercel (auto-cleaned). The `output/` directory is gitignored. The same path branching applies to the `/download/:filename` and `/api/files` endpoints.

## Configuration knobs

- **Custom field names** (`cf_delivery_date`, `cf_delivery_date_unformatted`, `cf_delivery_pick_up`) are referenced in `getDeliveriesForDate()`. Renaming the field in Zoho means updating these strings.
- **Pickup vs delivery filter** — only invoices where `cf_delivery_pick_up` matches `delivery` or `'d'` are included. Pickups are excluded.
- **Region** — code is hardcoded to `.com.au` Zoho endpoints. Other regions need both `authBaseUrl` and `baseUrl` updated.
- **Credentials precedence** — `credentials.json` always wins over `.env`. When both exist and disagree, the file is authoritative.

## Vercel deployment

`vercel.json` routes everything except static assets to `server.js`. Environment variables go in the Vercel dashboard (no `.env` is uploaded). Files are written to `/tmp` and disappear after the response — this is expected, not a bug.
