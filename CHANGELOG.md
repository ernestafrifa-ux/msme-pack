# MSME Pack: what changed

Newest first. Each version lists what owners and the team will notice, then what to do when deploying it.
On Railway, database changes and guide edits are applied automatically when the app starts.

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
