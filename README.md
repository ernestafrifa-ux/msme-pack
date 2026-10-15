# MSME Pack

A mobile-first web app for micro, small and medium enterprises in Ghana: keep business records, see your money, and (in later phases) get guides and tools matched to your business.

This first step covers **sign-up, business setup and the cash book**:

- Sign up and log in with a Ghana phone number (any format: `024…`, `+233…`, `233…`)
- Set up the business, with a cash box and optionally a MoMo wallet and their opening balances
- Record sales, expenses and transfers (e.g. cash deposited to MoMo), with MoMo transaction IDs and fees
- Home dashboard: money in each account, this month's sales, expenses and estimated profit, latest records
- Records list grouped by day, filter by type, load older records, delete (owners and managers)
- Installable on a phone's home screen (PWA); opens without a connection

## Folders

| Folder | What it is |
|---|---|
| `server/` | Express API (Node 20+) and the PostgreSQL schema |
| `server/db/migrations/` | Database schema; `001_initial.sql` is the full MVP data model |
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

# Browser test (optional): build the client, start the server on a fresh database, then
pip install playwright && playwright install chromium
python e2e/test_flow.py
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
| GET | `/api/businesses/:id/dashboard` | Balances, month summary, latest records |

## How it protects data

- Every business route checks the user belongs to that business; other users get "not found".
- Passwords are hashed with bcrypt; login is rate-limited (20 tries per 15 minutes).
- Deleting a record hides it from totals but keeps it in the audit log.
- Each record carries an ID made on the phone (`clientRef`), so retrying a save after a dropped connection never records it twice. This is also the base for full offline saving later.
- Only nicknames and last 4 digits of accounts are stored, never full account numbers.

## Next steps

Stock and invoices, then the health check and guides, then full offline saving (see the build phases agreed earlier).
