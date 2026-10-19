# MSME Pack: what changed

Newest first. Each version lists what owners and the team will notice, then what to do when deploying it.
On Railway, database changes and guide edits are applied automatically when the app starts.

## 0.22.1 · 19 October 2026 · Twi for the newer screens reviewed

- A fluent Asante Twi speaker checked all 762 new Twi lines: 751 approved as written, 11 corrected (for example "Ɛso ati" for a cash shortage, "mane" for sending on WhatsApp and SMS). The corrections are applied, and the same words are now used on the matching lines and the lines are no longer marked as drafts.
- Deploy: no database change.

## 0.22 · 19 October 2026 · Twi for the newer screens (drafts)

- Everything added from 0.10 to 0.21 now shows in **Twi** when Twi is chosen: Close the day, Who recorded what, Customers who owe, receipts, Target & budget, Savings goals, Price checker, Registrations, Tax, Check against MoMo, Messages, people and logo settings, password change, the offline banner and the new Home cards (550 phrases and 212 labels).
- **All this Twi is a draft** that a fluent speaker still needs to check (the older, reviewed Twi is unchanged, so the app does not show a draft notice). The review spreadsheet `msme-pack-twi-review-v0.22.xlsx` has a sheet for each part (Phrases and Keys), with "Correct?" and "Correction" columns.
- Admin screens, the loan-ready pack and everything a customer receives (invoices, receipts, WhatsApp and SMS texts) stay in English.
- For developers: newer screens use `tt('English text')`, which looks up `client/src/i18n/phrases.tw.js` and shows the English when there is no Twi line yet.
- Deploy: no database change.

## 0.21 · 19 October 2026 · Text messages (SMS), ready to switch on

- SMS can be sent through a Ghanaian SMS provider (**Arkesel** or **Hubtel**) once its account keys are added on Railway (see "Text messages (SMS)" in the README). Until then nothing changes and the admin screen says SMS is off.
- When on:
  - **Admin messages**: "Also send a text message to each business owner", with the number sent and failed.
  - **New owners and staff**: "Send the login details by SMS" (phone number and temporary password).
  - **Customers who owe**: "Send a reminder by SMS", next to WhatsApp.
  - **Receipts**: "Send by SMS" with the receipt link.
- Each business can send up to 30 SMS a day (reminders, receipts, logins; `SMS_DAILY_LIMIT`), to keep the cost under control. Admin messages don't count.
- Every SMS is logged; the admin screen shows how many were sent this month.
- Deploy: database change `017_sms.sql`. New optional settings: `SMS_PROVIDER`, `SMS_SENDER`, `SMS_API_KEY` (Arkesel) or `HUBTEL_CLIENT_ID` and `HUBTEL_CLIENT_SECRET` (Hubtel), `SMS_DAILY_LIMIT`, `APP_URL`.

## 0.20 · 19 October 2026 · Works with no data, MoMo check, faster loading

- **Record with no connection**: the app opens without data (every screen is kept on the phone). On the Record screen, sales, expenses, stock bought and transfers made offline are **saved on the phone** and sent automatically when the connection returns (or with "Send now"). Home shows how many are waiting, and the last figures it had. A record the server refuses later (for example an account that was removed) stays on the list with the reason, to fix or remove. Selling on credit still needs a connection.
- **Check against MoMo** (from Close the day): paste MoMo SMS messages or open a downloaded statement (CSV). The app finds each payment, matches it with the records (by MoMo transaction ID, or same amount within 3 days), lists payments not yet recorded with "Add as a sale" / "Add as an expense", and records that are not on MoMo. Statement formats differ by network; the reader looks for amounts in GHS, words like received/sent, dates and transaction IDs.
- **Faster first load**: the app is split so phones download less before Home appears (about 94 KB compressed instead of 143 KB); other screens load in the background and are kept for offline use.
- Deploy: no database change.

## 0.19 · 19 October 2026 · Programme tools: groups, dashboard, questions

For the MSME Pack admin:
- **Groups**: put businesses in groups (a programme intake, a district, a training class), choose groups when setting up a business, filter the business list by group, and send a message to one or more groups.
- **Programme dashboard**: for all businesses, a group, a region or a sector, over 1 to 12 months: how many are set up and active, records each month, and each business's records and last record. **Money figures (sales, profit, health check score) appear only for businesses whose owner agreed to share them**, with totals, average sales, how many are profitable, median sales growth and the average health score. Download for a spreadsheet.
- **Questions on messages**: add a question with 2 to 6 answers (for example "Will you attend?" Yes / No / Not sure). Each business answers once and can change it; the admin sees the count for each answer.

For owners:
- **Help the programme** (Settings): the owner chooses whether to share summary figures with the MSME Pack team, and can turn it off at any time. Nobody else in the business can change it.
- Messages with a question show the answers as buttons.
- Deploy: database change `016_groups_sharing_surveys.sql`. Every business starts with sharing off.

## 0.18 · 19 October 2026 · Loan-ready pack

- **Loan-ready pack** (top of Reports, for owners, managers and advisors): a printable business summary for a bank, microfinance or support programme, for the last 3, 6 or 12 months (only months since the business began keeping records here):
  - the business: owner, sector, location, registration, TIN, VAT number, contact, records since when;
  - key figures: average sales and profit a month, net margin, sales growth, cash and bank now, what it owes, the owner's share;
  - month by month: sales, gross profit, expenses, net profit, owner pay, cash at month end; and money in and out each month;
  - what it owns and owes today; loans and supplier credit, with repayments made;
  - record keeping: days with records, months covered, and the health check score;
  - a note that the figures are the owner's own records (not audited) and lines for signature and date.
- Print it or save it as a PDF; or download the monthly figures for a spreadsheet.
- Deploy: no database change.

## 0.17 · 19 October 2026 · Target, budget, savings goals and price checker

New "Plan and grow" section in Reports:
- **Target & budget**: a sales target and a spending budget for the month, with optional limits for some costs (for example transport). Progress bars on Home and on the plan; a warning when sales are behind for the share of the month gone, and when spending passes 90%. A plan carries over to later months until changed.
- **Savings goals**: save for something (a photocopier, next year's rent) in a separate place money is kept, such as a "Savings box", susu or bank account. Progress follows that account's balance; "Put money aside" opens a transfer into it; with a date, it shows about how much to save each month.
- **Price checker**: cost plus other costs per item, then either a suggested price for the margin wanted (rounded up to the next 50 pesewas) or a check of your own price: profit on each, margin, markup, the price with VAT for VAT-registered businesses, and how many to sell to cover monthly running costs. With a product chosen, the suggested price can be saved as its selling price.
- Deploy: database change `015_plans_and_goals.sql`.

## 0.16 · 19 October 2026 · Close the day, and who recorded what

- **Close the day** (Home, or Reports): count the cash box and check the MoMo balance; the app shows "Short by" or "Extra" against the records. A difference is recorded (a shortage as the cost "Cash shortage", extra as "Cash over") so balances match what is really there, or can be noted only. Earlier counts are listed with who counted. Home shows "Day closed" once counted.
- **Who recorded what** (Reports, owner and manager only): for a month or chosen dates, each person's records, sales and spending, anything deleted (what, by whom, when, and who had recorded it), and every cash count that did not match.
- **Records** now say "by Yaw" on records someone else made.
- Deploy: database change `014_cash_counts.sql`.

## 0.15 · 19 October 2026 · Customers who owe, receipts, bills and reminders

- **Sell now, paid later**: on Record → Sale, tick "Paid later (the customer owes)", choose or add the customer and an optional pay-by date. Goods leave stock now; the sale counts as the customer pays.
- **Customers who owe** (Home's "Customers owe you", Reports, Invoices): every customer with what they owe and how late. On a customer: record money received (it settles the oldest sales first), send a WhatsApp reminder, see their payments.
- **Receipts**: after a sale, Home offers "Send a receipt"; any sale in Records has a receipt button. Receipts are numbered (0001, 0002…), carry the logo and VAT number, and are sent on WhatsApp or printed. The customer opens a link, like an invoice.
- **Supplier bills and loans with due dates**: Buy stock on credit and new loans take a "Pay by" date; a loan's page can change it.
- **Reminders on Home**: money due to suppliers and lenders within a week (or late), and, for VAT-registered businesses from the 15th, the VAT return with the amount owed and the last working day to pay.
- Deploy: database change `013_receipts_credit_bills.sql`.

## 0.14 · 19 October 2026 · VAT on everyday sales and on purchases

For VAT-registered businesses:
- **Everyday sales**: Record → Sale has "Price includes VAT, NHIL & GETFund (20%)", ticked by default. It shows how much of the money is tax for GRA; only the rest counts as the sale.
- **Costs**: Expense and Buy stock have "The supplier gave a VAT invoice". The VAT inside (20/120 of the amount) is VAT to claim back: costs and stock are counted without it.
- **Reports → Tax** now shows VAT on invoices, on everyday sales and on what you bought, the total for the period, payments to GRA and what is owed (or what GRA owes you).
- The balance sheet shows VAT owed to GRA, or "VAT to claim back from GRA" when purchases carried more VAT than sales.
- Deploy: database change `012_vat_on_records.sql`.

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
