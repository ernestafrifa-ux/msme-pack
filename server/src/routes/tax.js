// Tax: VAT (with NHIL and GETFund) charged on invoices and paid to GRA, and tax that
// customers withheld (WHT). Mounted at /api/businesses/:businessId.
const express = require('express');
const { z } = require('zod');
const { query, withTransaction } = require('../db');
const { requireMember } = require('../auth');
const { HttpError, validate } = require('../http');
const { todayInGhana } = require('../dates');
const { insertTransaction, checkAccounts, checkDate, TXN_SELECT, publicTxn } = require('./cashbook');
const { taxPosition } = require('./reports');

const router = express.Router({ mergeParams: true });
const canView = requireMember();
const canManage = requireMember(['owner', 'manager']);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15.');
const money = (n) => (Math.round(Number(n || 0) * 100) / 100).toFixed(2);
const num = (n) => Number(n || 0);

const periodSchema = z.object({ from: isoDate.optional(), to: isoDate.optional() });

// For a period: tax charged on invoices sent, VAT paid to GRA, tax withheld by customers;
// and what is owed to GRA at the end of the period.
router.get('/tax/summary', canView, validate(periodSchema, 'query'), async (req, res) => {
  const today = todayInGhana();
  const from = req.valid.query.from || `${today.slice(0, 7)}-01`;
  const to = req.valid.query.to || today;
  if (to < from) throw new HttpError(400, 'The end date is before the start date.', { to: 'Before the start date.' });
  const args = [req.businessId, from, to];
  const [charged, paid, withheld, position, biz, records] = await Promise.all([
    query(
      `SELECT tax_scheme, COUNT(*) AS n,
              COALESCE(SUM(subtotal - discount), 0) AS taxable,
              COALESCE(SUM(nhil_amount), 0) AS nhil, COALESCE(SUM(getfund_amount), 0) AS getfund,
              COALESCE(SUM(vat_amount), 0) AS vat, COALESCE(SUM(tax_amount), 0) AS tax
         FROM invoices
        WHERE business_id = $1 AND doc_type = 'invoice' AND deleted_at IS NULL
          AND status NOT IN ('draft', 'void') AND tax_amount > 0 AND issue_date BETWEEN $2 AND $3
        GROUP BY tax_scheme`,
      args
    ),
    query(
      `${TXN_SELECT} WHERE t.business_id = $1 AND t.deleted_at IS NULL AND t.kind = 'vat_payment'
         AND t.txn_date BETWEEN $2 AND $3 ORDER BY t.txn_date DESC, t.id DESC`,
      args
    ),
    query(
      `${TXN_SELECT} WHERE t.business_id = $1 AND t.deleted_at IS NULL AND t.kind = 'wht'
         AND t.txn_date BETWEEN $2 AND $3 ORDER BY t.txn_date DESC, t.id DESC`,
      args
    ),
    taxPosition(req.businessId, to),
    query('SELECT vat_registered, tin FROM businesses WHERE id = $1', [req.businessId]),
    query(
      `SELECT COUNT(*) FILTER (WHERE kind = 'sale' AND invoice_id IS NULL AND tax_amount > 0)::int AS sales_n,
              COALESCE(SUM(amount - tax_amount) FILTER (WHERE kind = 'sale' AND invoice_id IS NULL AND tax_amount > 0), 0) AS sales_base,
              COALESCE(SUM(tax_amount) FILTER (WHERE kind = 'sale' AND invoice_id IS NULL), 0) AS sales_tax,
              COUNT(*) FILTER (WHERE kind IN ('expense', 'purchase') AND tax_amount > 0)::int AS input_n,
              COALESCE(SUM(tax_amount) FILTER (WHERE kind IN ('expense', 'purchase')), 0) AS input_tax
         FROM transactions WHERE business_id = $1 AND deleted_at IS NULL AND txn_date BETWEEN $2 AND $3`,
      args
    ),
  ]);
  const rec = records.rows[0];
  const vat = charged.rows.find((r) => r.tax_scheme === 'vat') || {};
  const other = charged.rows.find((r) => r.tax_scheme === 'custom') || {};
  const paidTotal = paid.rows.reduce((s, r) => s + num(r.amount), 0);
  const whtTotal = withheld.rows.reduce((s, r) => s + num(r.amount), 0);
  res.json({
    from, to,
    vatRegistered: biz.rows[0].vat_registered,
    tin: biz.rows[0].tin,
    charged: {
      invoices: Number(vat.n || 0),
      taxable: money(vat.taxable), nhil: money(vat.nhil), getfund: money(vat.getfund), vat: money(vat.vat),
      total: money(vat.tax),
      otherTax: money(other.tax), otherInvoices: Number(other.n || 0),
    },
    cashSales: { count: rec.sales_n, base: money(rec.sales_base), tax: money(rec.sales_tax) },
    input: { count: rec.input_n, tax: money(rec.input_tax) },
    // This period: tax charged on invoices and everyday sales, less VAT on purchases.
    netForPeriod: money(num(vat.tax) + num(other.tax) + num(rec.sales_tax) - num(rec.input_tax)),
    paid: { total: money(paidTotal), records: paid.rows.map(publicTxn) },
    owed: money(position.owed),
    withheld: { total: money(whtTotal), toDate: money(position.whtCredit), records: withheld.rows.map(publicTxn) },
  });
});

const vatPaymentSchema = z.object({
  amount: z.coerce.number().positive('Enter the amount paid.').max(1e11).transform((n) => Math.round(n * 100) / 100),
  accountId: z.uuid('Choose where the money came from.'),
  date: isoDate.optional(),
  paymentRef: z.string().trim().max(60).optional().nullable(),
  momoFee: z.coerce.number().min(0).max(1e6).default(0),
  note: z.string().trim().max(500).optional().nullable(),
});

// Money paid to GRA for VAT, NHIL and GETFund.
router.post('/tax/vat-payments', canManage, validate(vatPaymentSchema), async (req, res) => {
  const p = req.valid.body;
  const date = p.date || todayInGhana();
  checkDate(date);
  const id = await withTransaction(async (db) => {
    await checkAccounts(db, req.businessId, [p.accountId], date);
    return insertTransaction(db, {
      businessId: req.businessId, userId: req.user.id, kind: 'vat_payment', date, amount: p.amount,
      accountId: p.accountId, paymentRef: p.paymentRef, momoFee: p.momoFee,
      note: p.note || 'VAT, NHIL & GETFund paid to GRA',
    });
  });
  const { rows } = await query(`${TXN_SELECT} WHERE t.id = $1`, [id]);
  res.status(201).json({ transaction: publicTxn(rows[0]) });
});

module.exports = { router };
