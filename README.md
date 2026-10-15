# MSME Pack

A mobile-first web app for micro, small and medium enterprises in Ghana: keep business records, see your money, and (in later phases) get guides and tools matched to your business.

Built so far: **sign-up, business setup, the cash book, stock and invoices**.

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

## Folders

| Folder | What it is |
|---|---|
| `server/` | Express API (Node 20+) and the PostgreSQL schema |
| `server/db/migrations/` | Database schema; `001_initial.sql` is the full MVP data model, `002_…` adds stock and invoice changes |
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
python e2e/test_stock_invoices.py    # stock and invoices (reset the database between the two)
```

## Deploying

The API serves the built React app, so one Node service is enough:

```bash
cd client && npm install && npm run build      # creates client/dist
cd ../server && npm install --omit=dev && npm run migrate && npm start
```

Set `NODE_ENV=production`, `DATABASE_URL` and a long random `JWT_SECRET` in the host's environment settings (never commit `.env`). Serve over HTTPS; the PWA install and offline features need it.

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

`POST /transactions` also accepts `items: [{ productId, quantity, unitPrice }]` for sales and stock purchases (`kind: "purchase"`).

## How it protects data

- Every business route checks the user belongs to that business; other users get "not found".
- Passwords are hashed with bcrypt; login is rate-limited (20 tries per 15 minutes).
- Deleting a record hides it from totals but keeps it in the audit log.
- Each record carries an ID made on the phone (`clientRef`), so retrying a save after a dropped connection never records it twice. This is also the base for full offline saving later.
- Only nicknames and last 4 digits of accounts are stored, never full account numbers.

## How profit is counted

The month's estimated profit is money received (sales and other income), minus expenses and MoMo charges, minus the cost of products that left stock that month (from itemised sales and sent invoices, at their cost price). Money is counted when it moves; the cost of goods when they leave stock.

If a business doesn't track products, it can record stock it buys as an expense ("Stock / raw materials") instead. Do one or the other for the same goods, not both, or the cost is counted twice.

## Next steps

The business health check and guides, then full offline saving.
