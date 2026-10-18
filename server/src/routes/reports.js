// Receipts and payments account: a simple cash statement for any period.
// Balance brought forward + money received − money paid out = balance carried forward,
// for each place money is kept. Built from the cash book, so it always matches Home.
// Mounted at /api/businesses/:businessId.
const express = require('express');
const { z } = require('zod');
const { query } = require('../db');
const { requireMember } = require('../auth');
const { HttpError, validate } = require('../http');
const { todayInGhana } = require('../dates');

const router = express.Router({ mergeParams: true });
const canView = requireMember();

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15.');
const periodSchema = z.object({ from: isoDate.optional(), to: isoDate.optional() });

const money = (n) => (Math.round(Number(n || 0) * 100) / 100).toFixed(2);

// How a transaction changes the account it is recorded against (same rule as v_account_balances).
const EFFECT_SQL = `
  CASE
    WHEN t.account_id = a.id AND t.kind IN ('sale','other_income','owner_capital') THEN t.amount - t.momo_fee
    WHEN t.account_id = a.id AND t.kind IN ('expense','purchase','owner_draw','transfer') THEN -(t.amount + t.momo_fee)
    WHEN t.to_account_id = a.id AND t.kind = 'transfer' THEN t.amount
  END`;

router.get('/reports/receipts-payments', canView, validate(periodSchema, 'query'), async (req, res) => {
  const today = todayInGhana();
  const from = req.valid.query.from || `${today.slice(0, 7)}-01`;
  const to = req.valid.query.to || today;
  if (to < from) throw new HttpError(400, 'The end date is before the start date.', { to: 'Before the start date.' });

  const [accounts, lines, fees, transfers, biz] = await Promise.all([
    // Each place money is kept: balance brought forward (for an account opened during the
    // period, the amount it started with) and balance carried forward.
    query(
      `SELECT a.id, a.name, a.kind, a.opening_date,
              a.opening_balance + COALESCE(SUM(${EFFECT_SQL}) FILTER (WHERE t.txn_date < $2), 0) AS opening,
              a.opening_balance + COALESCE(SUM(${EFFECT_SQL}) FILTER (WHERE t.txn_date <= $3), 0) AS closing
         FROM payment_accounts a
         LEFT JOIN transactions t
                ON (t.account_id = a.id OR t.to_account_id = a.id)
               AND t.deleted_at IS NULL AND t.is_credit = FALSE AND t.txn_date >= a.opening_date
        WHERE a.business_id = $1 AND a.deleted_at IS NULL AND a.opening_date <= $3
        GROUP BY a.id
        ORDER BY a.kind, a.name`,
      [req.businessId, from, to]
    ),
    // Money in and out, grouped into the lines of the statement.
    query(
      `SELECT CASE WHEN t.kind IN ('sale','other_income','owner_capital') THEN 'receipt' ELSE 'payment' END AS side,
              CASE
                WHEN t.kind = 'sale' AND t.invoice_id IS NOT NULL THEN 'invoice'
                WHEN t.kind = 'sale' THEN 'sale'
                ELSE t.kind
              END AS line,
              c.name AS category,
              SUM(t.amount) AS total,
              COUNT(*) AS n
         FROM transactions t
         LEFT JOIN categories c ON c.id = t.category_id
        WHERE t.business_id = $1 AND t.deleted_at IS NULL AND t.is_credit = FALSE
          AND t.kind <> 'transfer' AND t.txn_date BETWEEN $2 AND $3
        GROUP BY 1, 2, 3
        ORDER BY 1 DESC, 2, SUM(t.amount) DESC`,
      [req.businessId, from, to]
    ),
    query(
      `SELECT COALESCE(SUM(momo_fee), 0) AS total FROM transactions
        WHERE business_id = $1 AND deleted_at IS NULL AND is_credit = FALSE AND txn_date BETWEEN $2 AND $3`,
      [req.businessId, from, to]
    ),
    query(
      `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS n FROM transactions
        WHERE business_id = $1 AND deleted_at IS NULL AND kind = 'transfer' AND txn_date BETWEEN $2 AND $3`,
      [req.businessId, from, to]
    ),
    query('SELECT name, town, phone FROM businesses WHERE id = $1', [req.businessId]),
  ]);

  const receipts = [];
  const payments = [];
  for (const r of lines.rows) {
    const item = { line: r.line, category: r.category, amount: money(r.total), count: Number(r.n) };
    (r.side === 'receipt' ? receipts : payments).push(item);
  }
  if (Number(fees.rows[0].total) > 0) {
    payments.push({ line: 'momo_fees', category: null, amount: money(fees.rows[0].total), count: null });
  }
  // Order the lines the way a receipts and payments account reads.
  const RECEIPT_ORDER = ['sale', 'invoice', 'other_income', 'owner_capital'];
  const PAYMENT_ORDER = ['purchase', 'expense', 'momo_fees', 'owner_draw'];
  const sortBy = (order) => (x, y) => order.indexOf(x.line) - order.indexOf(y.line);
  receipts.sort(sortBy(RECEIPT_ORDER));
  payments.sort(sortBy(PAYMENT_ORDER));

  const sum = (rows, key) => rows.reduce((s, r) => s + Number(r[key]), 0);
  const openingTotal = sum(accounts.rows, 'opening');
  const receiptsTotal = sum(receipts, 'amount');
  const paymentsTotal = sum(payments, 'amount');
  const closingTotal = sum(accounts.rows, 'closing');

  res.json({
    business: biz.rows[0],
    from,
    to,
    accounts: accounts.rows.map((a) => ({
      id: a.id, name: a.name, kind: a.kind,
      openedOn: a.opening_date, opening: money(a.opening), closing: money(a.closing),
    })),
    receipts,
    payments,
    totals: {
      opening: money(openingTotal),
      receipts: money(receiptsTotal),
      payments: money(paymentsTotal),
      closing: money(closingTotal),
      // Brought forward + receipts − payments must equal the balances carried forward.
      balanced: Math.abs(openingTotal + receiptsTotal - paymentsTotal - closingTotal) < 0.005,
    },
    transfers: { amount: money(transfers.rows[0].total), count: Number(transfers.rows[0].n) },
  });
});

module.exports = { router };
