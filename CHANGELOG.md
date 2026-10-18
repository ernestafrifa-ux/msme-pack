# MSME Pack: what changed

Newest first. Each version lists what owners and the team will notice, then what to do when deploying it.
On Railway, database changes and guide edits are applied automatically when the app starts.

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
