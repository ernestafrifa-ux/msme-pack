# MSME Pack

A mobile-first web app for micro, small and medium enterprises in Ghana: keep business records, see your money, and (in later phases) get guides and tools matched to your business.

Built so far: **sign-up, business setup, the cash book, stock, invoices, the business health check and the first guides**.

**Cash book**

- Sign up and log in with a Ghana phone number (any format: `024…`, `+233…`, `233…`)
- Set up the business, with a cash box and optionally a MoMo wallet and their opening balances
- Record sales, expenses and transfers (e.g. cash deposited to MoMo), with MoMo transaction IDs and fees
- Home dashboard: money in each account, this month's sales, expenses and estimated profit, latest records
- Records list grouped by day, filter by type, load older records, delete (owners and managers)
- Installable on a phone's home screen (PWA); opens without a connection

**Stock**
- Products (with stock) and services (no stock), cost and selling price, profit per item shown as you type
- Sales can list products: the total is worked out and stock goes down automatically
- "Buy stock" records money out and stock in, and updates the cost price
- Other changes: made / produced, returned, damaged, expired, own use, each with a history
- Stock count: type what's on the shelf; only the differences are saved
- "Running low" warnings on the Stock screen and Home

**Invoices**
- Create with saved or new customers, products or free-text items, discount, optional tax, and how to pay you
- Drafts don't touch stock; sending takes the products out of stock
- Send on WhatsApp (pre-written message with a link), copy the link, or print / save as PDF
- The customer's link opens a clean invoice page without logging in, showing what's still owed
- Record part or full payments to cash or MoMo; each is a sale in the cash book
- Overdue invoices flagged; Home shows how much customers owe
- Cancelling a sent invoice puts the products back; deleting a payment makes the invoice owed again
- Business details on invoices (phone, digital address, TIN, invoice number prefix) under the settings icon on Home

**Business health check**
- 18 questions across six areas: money and records, registration and compliance, stock and operations, marketing and customers, staff, and access to finance
- One question per screen; every answer is saved at once, so leaving halfway loses nothing
- A score out of 100 overall and per area, compared with the last check
- "Your next steps": guides chosen from the weak answers, weakest area first
- Retaking the check clears steps for areas that have improved

**Guides (Learn)**
- 11 short, practical guides written for Ghanaian small businesses, grouped by area
- Each links to the matching screen in the app ("Try it now"), e.g. a stock count or a new invoice
- Mark as read; reading a recommended guide ticks it off your next steps
- Shown in the user's language when a translation exists, otherwise English; audio can be attached per guide

## Folders

| Folder | What it is |
|---|---|
| `server/` | Express API (Node 20+) and the PostgreSQL schema |
| `server/db/migrations/` | Database schema; `001_initial.sql` is the full MVP data model, `002_…` adds stock and invoice changes |
| `server/content/` | Guide texts (`guides/en/*.md`) and health check questions (`health-check.js`) |
| `server/test/` | API tests against a real database |
| `client/` | React app (Vite) |
| `e2e/` | Browser test of the whole flow (Python + Playwright) |

## Run it on your computer

You need **Node.js 20+** and **PostgreSQL 14+**.

1. Create a database user and two databases (one for the app, one for tests):

   ```sql
   CREATE USER msme WITH PASSWORD 'choose-a-password';
   CREATE DATABASE msme_pack OWNER msme;
   CREATE DATABASE msme_pack_test OWNER msme;
   ```

2. Set up and start the API:

   ```bash
   cd server
   cp .env.example .env        # then edit .env: DATABASE_URL and JWT_SECRET
   npm install
   npm run migrate             # creates the tables
   npm run dev                 # API on http://localhost:4000
   ```

3. In a second terminal, start the React app:

   ```bash
   cd client
   npm install
   npm run dev                 # open http://localhost:5173
   ```

   The React dev server forwards `/api` calls to the API, so nothing else is needed.

## Tests

```bash
# API tests. They WIPE the database they run on, so they refuse to run
# unless its name ends in _test.
cd server
DATABASE_URL=postgres://msme:choose-a-password@localhost:5432/msme_pack_test npm test

# Browser tests (optional): build the client, start the server on a fresh database, then
pip install playwright && playwright install chromium
python e2e/test_flow.py              # sign-up and cash book
python e2e/test_stock_invoices.py    # stock and invoices
python e2e/test_health_guides.py     # health check and guides
python e2e/test_twi_audio.py         # Twi interface, Twi guides, audio (reset the database between each)
```

## Deploying

The API serves the built React app, so one Node service is enough:

```bash
cd client && npm install && npm run build      # creates client/dist
cd ../server && npm install --omit=dev && npm run migrate && npm start
```

Set `NODE_ENV=production`, `DATABASE_URL` and a long random `JWT_SECRET` in the host's environment settings (never commit `.env`). Serve over HTTPS; the PWA install and offline features need it.

### Railway

The root `package.json` and `railway.json` do the above automatically: `npm run build` installs both parts and builds the client; `npm start` runs migrations, then the server. Health check: `/api/health`.

1. New project from this GitHub repo, plus a PostgreSQL database.
2. Add a volume to the app service, mounted at `/data`.
3. Variables on the app service:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   - `JWT_SECRET` = a random string of 64+ characters
   - `NODE_ENV` = `production`
   - `MEDIA_DIR` = `/data/media`
   - `ADMIN_PHONES` = your phone number (after you sign up), to upload guide audio
4. Settings → Networking → Generate Domain.

Every push to `main` redeploys; new migrations and guide edits are applied on start.

## API overview

All routes except sign-up and login need `Authorization: Bearer <token>`.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/signup` | Create an account |
| POST | `/api/auth/login` | Log in |
| GET | `/api/auth/me` | Current user and their businesses |
| GET | `/api/businesses/lookups` | Regions, sectors, languages |
| POST | `/api/businesses` | Create a business (with cash and MoMo accounts) |
| GET | `/api/businesses/:id/accounts` | Accounts with current balances |
| POST | `/api/businesses/:id/accounts` | Add an account (owner/manager) |
| GET | `/api/businesses/:id/categories` | Income and expense categories |
| POST | `/api/businesses/:id/categories` | Add a category (owner/manager) |
| GET | `/api/businesses/:id/transactions` | List, with `kind`, `from`, `to`, `accountId`, paging |
| POST | `/api/businesses/:id/transactions` | Record a sale, expense or transfer |
| DELETE | `/api/businesses/:id/transactions/:txnId` | Delete a record (owner/manager) |
| GET | `/api/businesses/:id/dashboard` | Balances, month summary, latest records, low stock, money owed |
| PATCH | `/api/businesses/:id` | Business details shown on invoices (owner/manager) |
| GET, POST | `/api/businesses/:id/products` | List (with stock on hand) / add a product or service |
| GET, PATCH, DELETE | `/api/businesses/:id/products/:productId` | Details with stock history / edit / remove |
| POST | `/api/businesses/:id/products/:productId/adjust` | Made, returned, damaged, expired, own use |
| POST | `/api/businesses/:id/stock-count` | Save a physical count |
| GET, POST | `/api/businesses/:id/contacts` | Customers |
| GET, POST | `/api/businesses/:id/invoices` | List with totals owed / create a draft |
| GET | `/api/businesses/:id/invoices/defaults` | Dates and payment details to start a new invoice |
| GET, PUT, DELETE | `/api/businesses/:id/invoices/:invoiceId` | Details / edit draft / delete draft |
| POST | `/api/businesses/:id/invoices/:invoiceId/send` | Mark as sent (products leave stock) |
| POST | `/api/businesses/:id/invoices/:invoiceId/payments` | Record money received |
| POST | `/api/businesses/:id/invoices/:invoiceId/void` | Cancel (products return to stock) |
| GET | `/api/public/invoices/:token` | The customer's read-only view (no login) |
| GET | `/api/businesses/:id/health` | Latest score, check in progress, open recommendations |
| POST | `/api/businesses/:id/health` | Start or continue a health check (questions and saved answers) |
| PUT | `/api/businesses/:id/health/:checkId/answers` | Save one answer |
| POST | `/api/businesses/:id/health/:checkId/complete` | Score it and work out recommendations |
| PATCH | `/api/businesses/:id/recommendations/:slug` | Mark a recommendation done, dismissed or open |
| GET | `/api/guides` | Guide library with the user's reading progress |
| GET | `/api/guides/:slug` | One guide (marks it started) |
| POST | `/api/guides/:slug/complete` | Mark read or unread |
| PATCH | `/api/auth/me` | Change name or language |
| PUT | `/api/guides/:slug/audio?lang=tw` | Upload or replace a recording (admins; body is the audio file) |
| PATCH | `/api/guides/:slug/audio/:lang` | Mark a recording reviewed / draft (admins) |
| DELETE | `/api/guides/:slug/audio/:lang` | Remove a recording (admins) |

`POST /transactions` also accepts `items: [{ productId, quantity, unitPrice }]` for sales and stock purchases (`kind: "purchase"`).

## How it protects data

- Every business route checks the user belongs to that business; other users get "not found".
- Passwords are hashed with bcrypt; login is rate-limited (20 tries per 15 minutes).
- Deleting a record hides it from totals but keeps it in the audit log.
- Each record carries an ID made on the phone (`clientRef`), so retrying a save after a dropped connection never records it twice. This is also the base for full offline saving later.
- Only nicknames and last 4 digits of accounts are stored, never full account numbers.

## Languages

The app interface is available in **English** and **Asante Twi**. The Twi is a **draft for review**: the app says so in a banner, on every Twi guide, and on Twi recordings, until a fluent speaker has checked it.

- Users choose a language at sign-up, on the log-in screen (English | Twi), or later in Settings (gear icon on Home). The choice is saved to their account.
- Screens translated so far: log in, sign-up, business setup, Home, Record, Records, health check, Learn, guide reader and the language setting. Stock, invoices and business details are still in English. Messages coming from the server (e.g. form errors) are still in English.
- Word lists: `client/src/i18n/en.js` (master) and `client/src/i18n/tw.js`. A missing Twi line falls back to English. To add a language, copy `tw.js`, translate, and add it to `DICTS` and `UI_LANGUAGES` in `client/src/i18n.jsx`.
- Twi guides: `server/content/guides/tw/`. Three are drafted (separate business money, daily records, pricing for profit), each with `draft: true`. Remove that line once a reviewer has approved a guide, then run `npm run migrate`.
- Readers of a Twi guide can open the English original underneath.
- **Review workbook:** `MSME-Pack-Twi-review.xlsx` lists every Twi line next to the English, with columns for the reviewer's verdict and corrections, a key-terms sheet to settle first, and a progress count.

## Guide audio

Each guide can have one recording per language. A Twi reader hears the Twi recording first; a guide can have Twi audio even while its text is only in English.

- **Who can add audio:** content admins. Make someone an admin (after they've signed up): `npm run make-admin -- 0244123456` in `server` (add `--remove` to undo).
- **How:** an admin opens any guide and uses the "Audio (content admin)" box at the bottom to record straight from the phone's microphone or upload a file (MP3, M4A, OGG, WebM or WAV, up to 20 MB). New recordings are marked draft until "Mark as reviewed" is pressed. Uploading again replaces the old recording.
- **Where files are kept:** `server/media/audio/` by default, or the folder in the `MEDIA_DIR` setting. On hosts whose disk is wiped on each deploy (e.g. Render's free tier), point `MEDIA_DIR` at a persistent disk, or the recordings will be lost.

## Editing guides and health check questions

Content lives in plain files, so non-programmers can help write it.

- **Guides:** one Markdown file per guide in `server/content/guides/en/`. The top section (between `---` lines) holds the title, area (`FIN`, `COMP`, `OPS`, `MKT`, `PEOPLE` or `FUND`), summary, reading time, an optional app screen to link to (`toolPath`, `toolLabel`) and the date the facts were last checked (`reviewed`). The text supports `##` headings, `-` lists, `1.` lists, `- [ ]` checklists, `>` notes and `**bold**`.
- **Translations:** add the same file name under a language folder, e.g. `server/content/guides/tw/tax-basics.md`. Users who chose that language see it; everyone else sees English.
- **Questions:** `server/content/health-check.js`. Each question has four answers scored 0 to 4, and can point to guides to recommend when the answer is weak. Keep a question's `code` unchanged once people have answered it.

After editing, run `npm run migrate` in `server`. It loads the changes and is safe to run any number of times.

Guides about tax, SSNIT and registration were checked against GRA and SSNIT information in October 2026. Rules change, so review them at least once a year and update the `reviewed` date.

## How profit is counted

The month's estimated profit is money received (sales and other income), minus expenses and MoMo charges, minus the cost of the goods sold, minus stock losses. Owner pay, transfers and stock purchases are not counted against profit.

- **Goods sold directly** (a sale with products): their cost counts the day of the sale.
- **Goods on an invoice**: stock leaves when the invoice is sent, but the cost counts when the customer pays, in proportion to each payment. An unpaid invoice therefore never pulls profit down, and deleting a payment takes its share of the cost back out.
- **Stock losses**: damaged, expired and own-use stock, and stock-count differences, count at cost price. A count that finds more than the records reduces the losses.
- **Services** can be sold from the product list; they have no stock and no stock cost.

If a business doesn't track products, it can record stock it buys as an expense ("Stock / raw materials") instead. Do one or the other for the same goods, not both, or the cost is counted twice.

## Next steps

Full offline saving (record sales with no connection and sync later), then the compliance calendar with SMS/WhatsApp reminders, payroll, and an advisor view for programmes supporting many businesses.
