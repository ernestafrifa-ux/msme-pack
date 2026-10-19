# MSME Pack: what changed

Newest first. Each version lists what owners and the team will notice, then what to do when deploying it.
On Railway, database changes and guide edits are applied automatically when the app starts.

## 0.13.2 · 19 October 2026 · Log out from Home

- **Log out** is now a button at the top of Home, beside the messages bell and settings. It asks "Log out of MSME Pack on this phone?" first, so a stray tap doesn't log anyone out.
- The Log out button has been removed from Settings; the settings button on Home is now labelled "Business details" (Twi: "W'adwuma ho nsɛm").
- Deploy: no database change.

## 0.13.1 · 19 October 2026 · Bigger logo on Home

- The logo on Home is now large (about twice the size) and sits on its own row beside the business name, with the greeting, messages bell and settings above it.
- Logos on Home are shown whole on a white rounded tile instead of being cropped to a circle, so wide logos and logos with text are not cut off.
- Deploy: no database change.

## 0.13 · 19 October 2026 · Business logos and messages from the admin

- **Business logo**: Settings → Business details → **Upload logo** (owner or manager). The phone shrinks the picture before uploading, so it is quick on mobile data. PNG, JPEG or WebP; change or remove it any time.
  - The logo shows on Home (initials in a circle until there is one), on invoices and the customer's invoice link, on every statement, and in the admin's list of businesses.
- **Messages from the MSME Pack team**:
  - The admin writes a message (title, text and an optional link to an app page such as a guide, or a web page) under Admin → **Send a message**.
  - Send to all businesses, by region, by sector, or to chosen businesses. Before sending, it shows how many businesses and people it reaches.
  - Businesses see a bell with the number of new messages on Home and a banner with the newest one. Opening **Messages** marks them as read for that person.
  - The admin sees each sent message with "read in X of Y businesses", and can withdraw one so it disappears.
- New screens are in English for now.
- Deploy: database change `011_notices.sql`. Logos are saved with the guide audio (on Railway, the `/data` volume), so they survive redeploys.

## 0.12 · 19 October 2026 · Closed sign-up: the admin sets up businesses, owners add their people

- **No more open sign-up.** Anyone who finds the site can no longer create an account. The login page tells new people that their account is made for them.
- **The first account is the admin.** On a new installation, the login page offers "Create the admin account" until an admin exists (when `ADMIN_PHONES` is set, only those numbers may create it). Numbers in `ADMIN_PHONES` are made admins at every start, as before.
- **Admin screen** (Settings → MSME Pack admin, or the home screen for an admin with no business of their own):
  - **Set up a new business**: business details, the owner's name, phone, language and a temporary password. Today's balances can be entered then (sitting with the owner) or left for the owner.
  - Every business with its owner, number of people, last record and "waiting for owner" until balances are entered.
  - Give an owner a new temporary password, or switch an account off and on.
  - The admin does not see any business's records.
- **Temporary passwords**: anyone given an account (by the admin or an owner) must choose their own password at first login before they can do anything else. "Change my password" is in Settings for everyone.
- **First login for an owner**: after choosing a password, the owner counts the cash box, MoMo and bank and starts keeping records.
- **People who use this business** (Settings), for the owner only:
  - Add a manager, staff member or advisor with their phone number, language and a temporary password. Someone who already has an account keeps their own password.
  - Change a person's role, give a new temporary password, or remove them. Each person sees only the businesses they were added to.
  - An owner can reset passwords only for people who use their business alone, so no owner can take over an account used elsewhere.
- Login protection now counts only failed attempts, so a shop where several people log in is not locked out.
- The new screens are in English for now.
- Deploy: database change `010_access_control.sql`. Check that **ADMIN_PHONES** on Railway holds your number: after this version, it is how the admin account is recognised.

## 0.11 · 19 October 2026 · Registrations: bank account and VAT later

- A business can start with only the cash box and MoMo. Setup now says a bank account and VAT can come later.
- New **Registrations** screen (Settings → Registrations, or Reports → Registrations), with one card each for a **business bank account** and **VAT registration with GRA**:
  - Status: not started, in progress (since when) or done.
  - **What to bring**: a checklist of documents (Ghana Card, ORC business registration certificate, TIN, proof of address, photos, first deposit; for VAT also sales records and bank details). Ticks are saved, so the owner can gather them over weeks.
  - **Does the business have to register for VAT?** The owner says whether it sells goods, services or both (the app suggests "both" when the product list has a service such as photocopying). Services: must register whatever the sales. Goods: the app compares sales for the last 12 months (or the yearly pace for a newer business) with GHS 750,000, shows how close the business is, and warns from 80%.
  - Steps to register with GRA, and to take to the bank.
  - **The account is open**: enter the bank and balance, and it is added as a place the business keeps money from today.
  - **GRA has registered us**: enter the VAT number and start date from the certificate, and VAT switches on for new invoices (the VAT number is also used as the TIN if none was set).
- A bank account added any other way, or VAT ticked in Business details, shows as done here too.
- The screen is in English for now.
- Deploy: database change `009_registrations.sql`.

## 0.10 · 19 October 2026 · VAT and withholding tax

- **VAT-registered businesses**: tick "registered for VAT" in Settings → Business details. New invoices then add **NHIL 2.5%, GETFund 2.5% and VAT 15%** (20% in all, on the price before tax, as from January 2026) and show each on its own line. It can be switched off for one invoice.
- **Tax on invoices is not income.** Profit and loss, Home and the balance sheet leave out the tax share of each invoice payment; the balance sheet shows **VAT, NHIL & GETFund owed to GRA**. This also applies to any tax line on older invoices.
- **Withholding tax on invoice payments**: tick "The customer kept back withholding tax" when recording money received. Buttons suggest goods 3% or services 7.5% of the amount before tax (only above GHS 2,000). The tax withheld settles the invoice, counts as income, moves no money, and appears on the balance sheet as a credit against income tax.
- New **Reports → Tax** screen: tax charged on invoices for the month, payments to GRA (record them here), what is owed, tax withheld by customers, and a **VAT & WHT calculator** that follows GRA's computation sheet (amount with or before tax, goods or services, what to pay a supplier).
- Receipts and payments shows "VAT, NHIL & GETFund paid to GRA". Records label withheld tax and VAT payments.
- The tax guide is updated: 2026 rates, services must register for VAT whatever their sales, goods from GHS 750,000, and withholding tax explained.
- Not yet covered: VAT on everyday sales recorded without an invoice, and VAT paid on purchases (input VAT).
- Deploy: database change `008_vat_and_wht.sql`.

## 0.9 · 19 October 2026 · Bank accounts

- **Bank account at setup**: alongside the cash box and MoMo, tick "The business has a bank account" and enter the bank's name (for example GCB) and today's balance. It appears as "GCB account".
- **Add accounts later**: Settings → **Where you keep money** lists every account with its balance and adds a bank account, another MoMo number or a second cash box at any time (its balance starts from that day).
- A bank account works everywhere the cash box and MoMo do: recording sales and expenses, transfers, invoice payments, loans and all the reports.
- Home and the reports list accounts as cash box, MoMo, then bank. With three accounts, the third card on Home spans the full width.
- New Twi lines for setup and Settings are waiting for review.
- Deploy: no database change.

## 0.8.1 · 19 October 2026 · Owner pay on the profit and loss

- The profit and loss statement now shows owner pay **after** the net profit, then **Profit kept in the business** (net profit − owner pay), with a plain explanation that owner pay comes out of the profit rather than being a cost.
- If the owner took out more than the business made, the line reads "Taken out beyond the profit" with a short warning.
- Deploy: no database change.

## 0.8 · 19 October 2026 · Financial statements, loans and equipment

- New **Reports** screen (Records → Reports) with six statements, each for a month or chosen dates, printable or saved as PDF, and downloadable for a spreadsheet:
  - **Profit and loss**: income, cost of goods sold, gross profit, expenses (with loan interest, MoMo charges and stock losses), net profit and gross margin. Same rules as Home.
  - **Receipts and payments** (from 0.7), now including loans received, repayments and equipment bought.
  - **Balance sheet**: what the business owns (cash and MoMo, stock at cost, money customers owe, equipment), what it owes (loans and suppliers) and the owner's share.
  - **Stock report**: for each product, stock at the start, in, sold, lost, count differences, at the end and its value; flags low and not-selling items.
  - **Who owes you** (debtors): unpaid invoices by customer, grouped as not yet due, 1–30, 31–60 and over 60 days late.
  - **Sales by product**: quantity, sales, cost, profit and margin for each product and service.
- New **Loans & equipment** screen:
  - Loans from a bank, microfinance, susu, family or others: the money can go into an account, and repayments record the interest separately (interest is an expense; the rest reduces the loan).
  - Equipment such as a photocopier: paid from an account or already owned, with a current value the owner updates.
- **Buy stock on credit**: tick "Paid later" on Buy stock. Stock goes in, no money moves, and the supplier appears as money owed until paid.
- The new screens are in English only for now; Twi follows after review.
- Deploy: database change `007_loans_and_equipment.sql`.

## 0.7 · 19 October 2026 · Receipts and payments account

- New **Receipts & payments** statement, opened from the Records screen. For any month, or any dates chosen, it shows: balance brought forward for each place money is kept, money received (sales, customer payments on invoices, other income, money put in), money paid out (stock bought, expenses by category, MoMo charges, owner pay) and balance carried forward.
- Built from the cash book, so it always matches Home. Transfers between your own accounts are shown in a note but not counted.
- Print it or save it as a PDF, or download it for a spreadsheet (CSV).
- In English and Twi (the Twi lines are waiting for review).
- Deploy: no database change.

## 0.6 · 19 October 2026 · Profit fixes and services on sales

Found in the bookshop test run.

- **Invoices no longer pull profit down while unpaid.** Goods still leave stock when an invoice is sent, but their cost counts as the customer pays, in proportion to each payment. Deleting a payment takes its share of the cost back out.
- **Stock losses count against profit.** Damaged, expired and own-use stock, and stock-count shortfalls, count at cost. Home shows "Includes GHS … of damaged or missing stock". A count that finds extra stock reduces the losses.
- **Services can be sold from the product list** (for example photocopying, per page). They cannot be bought as stock.
- Home's profit note explains the new rules, in English and Twi (Twi reviewed and approved).
- Deploy: database change `006_matched_cost_and_stock_losses.sql`. Profit figures for the current month change for any business with invoices or stock adjustments.

## 0.5 · 16 October 2026 · Online on Railway

- Root `package.json` and `railway.json`: one service builds the app and runs the API; migrations run on every start; health check `/api/health`.
- `ADMIN_PHONES` setting makes content admins without a terminal.
- `MEDIA_DIR` points guide audio at a Railway volume (`/data/media`).

## 0.4 · 16 October 2026 · Owner pay

- New record type **Owner pay** ("Wo ho akatua"): money the owner takes for themselves or their home. It leaves the cash box or MoMo but does not lower profit.
- Home shows "You paid yourself GHS … this month"; Records has an Owner pay filter.
- Record tabs sit in two rows so long Twi labels fit on small phones.
- Deploy: database change `005_owner_pay.sql`.

## 0.3 · 16 October 2026 · Twi reviewed

- Two review rounds by a fluent Asante Twi speaker applied: Save is "Sie", Transfer is "Sika a akɔ baabi foforɔ", Strong is "Ɛyɛ papa", Twi month names.
- All three Twi guides approved; the Twi interface is no longer marked as a draft.
- Long labels wrap instead of running off narrow screens.

## 0.2 · 15 October 2026 · Twi, guides, health check, stock and invoices

- Asante Twi interface and three Twi guides (separate your money, daily records, pricing for profit).
- Guide audio: content admins upload or record in the browser; recordings are marked draft until reviewed.
- Business health check: 18 questions in 6 areas, a score per area and the guides to read next.
- 11 English guides.
- Stock: products, opening stock, reorder levels, adjustments and stock counts.
- Invoices: draft, send by WhatsApp or link, part and full payments, cancel.
- Deploy: database changes `002` to `004`.

## 0.1 · 15 October 2026 · First version

- Sign up with a Ghana phone number, set up a business with a cash box and MoMo.
- Cash book: sales, expenses, stock bought, transfers; balances and the month's estimated profit on Home.
