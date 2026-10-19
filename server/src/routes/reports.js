// Financial statements, all built from the records the owner already keeps:
// receipts and payments, profit and loss, stock report, debtors, sales by product
// and the balance sheet. Mounted at /api/businesses/:businessId.
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
const asOfSchema = z.object({ asOf: isoDate.optional() });

const money = (n) => (Math.round(Number(n || 0) * 100) / 100).toFixed(2);
const num = (n) => Number(n || 0);
const sum = (rows, key) => rows.reduce((s, r) => s + num(r[key]), 0);

function period(req) {
  const today = todayInGhana();
  const from = req.valid.query.from || `${today.slice(0, 7)}-01`;
  const to = req.valid.query.to || today;
  if (to < from) throw new HttpError(400, 'The end date is before the start date.', { to: 'Before the start date.' });
  return { from, to };
}

const businessHeader = (businessId) =>
  query('SELECT name, town, phone, logo_url AS "logoUrl" FROM businesses WHERE id = $1', [businessId]).then((r) => r.rows[0]);

// How a transaction changes the account it is recorded against (same rule as v_account_balances).
const EFFECT_SQL = `
  CASE
    WHEN t.account_id = a.id AND t.kind IN ('sale','other_income','owner_capital','loan_received') THEN t.amount - t.momo_fee
    WHEN t.account_id = a.id AND t.kind IN ('expense','purchase','owner_draw','transfer','loan_repayment','equipment','vat_payment')
      THEN -(t.amount + t.momo_fee)
    WHEN t.to_account_id = a.id AND t.kind = 'transfer' THEN t.amount
  END`;

// Each place money is kept: balance before `from` (brought forward) and at the end of `to`.
function accountBalances(businessId, from, to) {
  return query(
    `SELECT a.id, a.name, a.kind, a.opening_date,
            a.opening_balance + COALESCE(SUM(${EFFECT_SQL}) FILTER (WHERE t.txn_date < $2), 0) AS opening,
            a.opening_balance + COALESCE(SUM(${EFFECT_SQL}) FILTER (WHERE t.txn_date <= $3), 0) AS closing
       FROM payment_accounts a
       LEFT JOIN transactions t
              ON (t.account_id = a.id OR t.to_account_id = a.id)
             AND t.deleted_at IS NULL AND t.is_credit = FALSE AND t.txn_date >= a.opening_date
      WHERE a.business_id = $1 AND a.deleted_at IS NULL AND a.opening_date <= $3
      GROUP BY a.id
      ORDER BY CASE a.kind WHEN 'cash' THEN 0 WHEN 'mobile_money' THEN 1 ELSE 2 END, a.created_at`,
    [businessId, from, to]
  ).then((r) => r.rows);
}

// What customers owed at the end of `asOf`: invoices sent by then, less payments received by then.
function openInvoices(businessId, asOf) {
  return query(
    `SELECT inv.id, inv.number, inv.issue_date, inv.due_date, inv.total,
            c.name AS customer, c.phone,
            inv.total - COALESCE(SUM(t.amount) FILTER (WHERE t.deleted_at IS NULL AND NOT t.is_credit AND t.txn_date <= $2), 0)
              AS outstanding
       FROM invoices inv
       LEFT JOIN contacts c ON c.id = inv.contact_id
       LEFT JOIN transactions t ON t.invoice_id = inv.id
      WHERE inv.business_id = $1 AND inv.doc_type = 'invoice' AND inv.deleted_at IS NULL
        AND inv.status NOT IN ('draft', 'void') AND inv.issue_date <= $2
      GROUP BY inv.id, c.name, c.phone
     HAVING inv.total - COALESCE(SUM(t.amount) FILTER (WHERE t.deleted_at IS NULL AND NOT t.is_credit AND t.txn_date <= $2), 0) > 0
      ORDER BY c.name NULLS LAST, inv.issue_date`,
    [businessId, asOf]
  ).then((r) => r.rows);
}

// What the business still owes on each debt at the end of `asOf`.
function debtBalances(businessId, asOf) {
  return query(
    `SELECT d.id, d.lender, d.kind, d.amount, d.start_date,
            COALESCE(SUM(t.amount - t.interest_amount) FILTER (WHERE t.txn_date <= $2), 0) AS repaid,
            COALESCE(SUM(t.interest_amount) FILTER (WHERE t.txn_date <= $2), 0) AS interest_paid
       FROM debts d
       LEFT JOIN transactions t ON t.debt_id = d.id AND t.kind = 'loan_repayment' AND t.deleted_at IS NULL
      WHERE d.business_id = $1 AND d.deleted_at IS NULL AND d.start_date <= $2
      GROUP BY d.id
      ORDER BY d.start_date, d.lender`,
    [businessId, asOf]
  ).then((r) => r.rows.map((d) => ({ ...d, balance: num(d.amount) - num(d.repaid) })));
}

// Tax at the end of `asOf`: tax charged on invoices sent by then less what was paid to GRA
// (owed, a liability), and tax customers withheld (a credit against income tax, an asset).
async function taxPosition(businessId, asOf) {
  const { rows } = await query(
    `SELECT
       (SELECT COALESCE(SUM(tax_amount), 0) FROM invoices
         WHERE business_id = $1 AND doc_type = 'invoice' AND deleted_at IS NULL
           AND status NOT IN ('draft', 'void') AND issue_date <= $2) AS charged,
       (SELECT COALESCE(SUM(tax_amount), 0) FROM transactions
         WHERE business_id = $1 AND deleted_at IS NULL AND kind = 'sale' AND invoice_id IS NULL AND txn_date <= $2) AS cash_sales,
       (SELECT COALESCE(SUM(tax_amount), 0) FROM transactions
         WHERE business_id = $1 AND deleted_at IS NULL AND kind IN ('expense', 'purchase') AND txn_date <= $2) AS input,
       (SELECT COALESCE(SUM(amount), 0) FROM transactions
         WHERE business_id = $1 AND deleted_at IS NULL AND kind = 'vat_payment' AND txn_date <= $2) AS paid,
       (SELECT COALESCE(SUM(amount), 0) FROM transactions
         WHERE business_id = $1 AND deleted_at IS NULL AND kind = 'wht' AND txn_date <= $2) AS wht`,
    [businessId, asOf]
  );
  const r = rows[0];
  // Owed = tax charged on invoices and everyday sales − VAT paid on purchases − payments to GRA.
  // Below zero, GRA owes the business (a credit to claim back or carry forward).
  const owed = Math.round((num(r.charged) + num(r.cash_sales) - num(r.input) - num(r.paid)) * 100) / 100;
  return {
    charged: num(r.charged), cashSales: num(r.cash_sales), input: num(r.input), paid: num(r.paid),
    owed, whtCredit: num(r.wht),
  };
}

// ---- Receipts and payments ---------------------------------------------------

router.get('/reports/receipts-payments', canView, validate(periodSchema, 'query'), async (req, res) => {
  const { from, to } = period(req);
  const [accounts, lines, fees, transfers, business] = await Promise.all([
    accountBalances(req.businessId, from, to),
    query(
      `SELECT CASE WHEN t.kind IN ('sale','other_income','owner_capital','loan_received') THEN 'receipt' ELSE 'payment' END AS side,
              CASE
                WHEN t.kind = 'sale' AND t.invoice_id IS NOT NULL THEN 'invoice'
                WHEN t.kind = 'sale' THEN 'sale'
                ELSE t.kind
              END AS line,
              CASE WHEN t.kind IN ('sale','other_income','expense') THEN c.name END AS category,
              SUM(t.amount) AS total,
              COUNT(*) AS n
         FROM transactions t
         LEFT JOIN categories c ON c.id = t.category_id
        WHERE t.business_id = $1 AND t.deleted_at IS NULL AND t.is_credit = FALSE
          AND t.kind NOT IN ('transfer', 'wht') AND t.txn_date BETWEEN $2 AND $3
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
    businessHeader(req.businessId),
  ]);

  const receipts = [];
  const payments = [];
  for (const r of lines.rows) {
    const item = { line: r.line, category: r.category, amount: money(r.total), count: Number(r.n) };
    (r.side === 'receipt' ? receipts : payments).push(item);
  }
  if (num(fees.rows[0].total) > 0) {
    payments.push({ line: 'momo_fees', category: null, amount: money(fees.rows[0].total), count: null });
  }
  // Order the lines the way a receipts and payments account reads.
  const RECEIPT_ORDER = ['sale', 'invoice', 'other_income', 'owner_capital', 'loan_received'];
  const PAYMENT_ORDER = ['purchase', 'expense', 'momo_fees', 'vat_payment', 'loan_repayment', 'equipment', 'owner_draw'];
  const sortBy = (order) => (x, y) => order.indexOf(x.line) - order.indexOf(y.line);
  receipts.sort(sortBy(RECEIPT_ORDER));
  payments.sort(sortBy(PAYMENT_ORDER));

  const openingTotal = sum(accounts, 'opening');
  const receiptsTotal = sum(receipts, 'amount');
  const paymentsTotal = sum(payments, 'amount');
  const closingTotal = sum(accounts, 'closing');

  res.json({
    business, from, to,
    accounts: accounts.map((a) => ({
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

// ---- Profit and loss -----------------------------------------------------------
// Same rules as Home: money received, the cost of goods sold (invoice goods as they are paid for),
// expenses (with loan interest), MoMo charges and stock losses.

router.get('/reports/profit-loss', canView, validate(periodSchema, 'query'), async (req, res) => {
  const { from, to } = period(req);
  const args = [req.businessId, from, to];
  const [income, expenses, other, cogs, losses, business] = await Promise.all([
    query(
      // Tax on invoices belongs to GRA, so each payment's share of it is left out.
      // Tax a customer withheld (wht) settled part of the invoice, so it counts.
      `SELECT CASE WHEN t.invoice_id IS NOT NULL THEN 'invoice' ELSE t.kind END AS line,
              CASE WHEN t.invoice_id IS NULL THEN c.name END AS category,
              SUM(t.amount - COALESCE(t.amount * inv.tax_amount / NULLIF(inv.total, 0), t.tax_amount)) AS total,
              SUM(COALESCE(t.amount * inv.tax_amount / NULLIF(inv.total, 0), t.tax_amount)) AS tax,
              SUM(t.amount) FILTER (WHERE t.kind = 'wht') AS wht
         FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
         LEFT JOIN invoices inv ON inv.id = t.invoice_id
        WHERE t.business_id = $1 AND t.deleted_at IS NULL AND NOT t.is_credit
          AND t.kind IN ('sale', 'other_income', 'wht') AND t.txn_date BETWEEN $2 AND $3
        GROUP BY 1, 2 ORDER BY 1 DESC, 3 DESC`,
      args
    ),
    query(
      `SELECT COALESCE(c.name, 'Other expenses') AS category, SUM(t.amount - t.tax_amount) AS total
         FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
        WHERE t.business_id = $1 AND t.deleted_at IS NULL AND NOT t.is_credit
          AND t.kind = 'expense' AND t.txn_date BETWEEN $2 AND $3
        GROUP BY 1 ORDER BY 2 DESC`,
      args
    ),
    query(
      `SELECT COALESCE(SUM(t.momo_fee), 0) AS momo_fees,
              COALESCE(SUM(t.interest_amount) FILTER (WHERE t.kind = 'loan_repayment'), 0) AS interest,
              COALESCE(SUM(t.amount) FILTER (WHERE t.kind = 'owner_draw'), 0) AS owner_pay
         FROM transactions t
        WHERE t.business_id = $1 AND t.deleted_at IS NULL AND NOT t.is_credit AND t.txn_date BETWEEN $2 AND $3`,
      args
    ),
    query(
      `SELECT
         (SELECT COALESCE(SUM(-m.quantity * COALESCE(m.unit_cost, 0)), 0) FROM stock_movements m
           WHERE m.business_id = $1 AND m.reason = 'sale' AND m.invoice_item_id IS NULL
             AND m.movement_date BETWEEN $2 AND $3) AS direct,
         (SELECT COALESCE(SUM(ic.cost * t.amount / NULLIF(inv.total, 0)), 0)
            FROM transactions t
            JOIN invoices inv ON inv.id = t.invoice_id
            JOIN (SELECT ii.invoice_id, SUM(-m.quantity * COALESCE(m.unit_cost, 0)) AS cost
                    FROM stock_movements m JOIN invoice_items ii ON ii.id = m.invoice_item_id
                   WHERE m.reason = 'sale' GROUP BY ii.invoice_id) ic ON ic.invoice_id = t.invoice_id
           WHERE t.business_id = $1 AND t.deleted_at IS NULL AND t.kind IN ('sale', 'wht')
             AND t.txn_date BETWEEN $2 AND $3) AS invoiced`,
      args
    ),
    query(
      `SELECT COALESCE(SUM(-m.quantity * COALESCE(m.unit_cost, 0)), 0) AS total
         FROM stock_movements m
        WHERE m.business_id = $1 AND m.reason IN ('damaged', 'expired', 'own_use', 'count_adjustment')
          AND m.movement_date BETWEEN $2 AND $3`,
      args
    ),
    businessHeader(req.businessId),
  ]);

  const incomeLines = income.rows.map((r) => ({ line: r.line, category: r.category, amount: money(r.total) }));
  const incomeTotal = Math.round(sum(income.rows, 'total') * 100) / 100;
  const costOfSales = Math.round((num(cogs.rows[0].direct) + num(cogs.rows[0].invoiced)) * 100) / 100;
  const grossProfit = incomeTotal - costOfSales;
  const o = other.rows[0];
  const stockLosses = Math.round(num(losses.rows[0].total) * 100) / 100;
  const expenseLines = expenses.rows.map((r) => ({ line: 'expense', category: r.category, amount: money(r.total) }));
  if (num(o.interest) > 0) expenseLines.push({ line: 'interest', category: null, amount: money(o.interest) });
  if (num(o.momo_fees) > 0) expenseLines.push({ line: 'momo_fees', category: null, amount: money(o.momo_fees) });
  if (stockLosses !== 0) expenseLines.push({ line: 'stock_losses', category: null, amount: money(stockLosses) });
  const expensesTotal = sum(expenseLines, 'amount');
  const netProfit = grossProfit - expensesTotal;

  res.json({
    business, from, to,
    income: incomeLines,
    totals: {
      income: money(incomeTotal),
      costOfSales: money(costOfSales),
      grossProfit: money(grossProfit),
      expenses: money(expensesTotal),
      netProfit: money(netProfit),
      grossMargin: incomeTotal > 0 ? Math.round((grossProfit / incomeTotal) * 1000) / 10 : null,
    },
    expenses: expenseLines,
    ownerPay: money(o.owner_pay),
    // For the notes under the statement.
    taxLeftOut: money(sum(income.rows, 'tax')),
    whtIncluded: money(sum(income.rows, 'wht')),
  });
});

// ---- Stock report --------------------------------------------------------------------

router.get('/reports/stock', canView, validate(periodSchema, 'query'), async (req, res) => {
  const { from, to } = period(req);
  const [rows, business] = await Promise.all([
    query(
      `SELECT p.id, p.name, p.unit, p.cost_price, p.reorder_level,
              COALESCE(SUM(m.quantity) FILTER (WHERE m.movement_date < $2), 0) AS opening,
              COALESCE(SUM(m.quantity) FILTER (WHERE m.movement_date BETWEEN $2 AND $3
                AND m.reason IN ('opening', 'purchase', 'produced', 'return_in')), 0) AS stock_in,
              COALESCE(-SUM(m.quantity) FILTER (WHERE m.movement_date BETWEEN $2 AND $3 AND m.reason = 'sale'), 0) AS sold,
              COALESCE(-SUM(m.quantity) FILTER (WHERE m.movement_date BETWEEN $2 AND $3
                AND m.reason IN ('damaged', 'expired', 'own_use', 'return_out')), 0) AS lost,
              COALESCE(SUM(m.quantity) FILTER (WHERE m.movement_date BETWEEN $2 AND $3 AND m.reason = 'count_adjustment'), 0) AS counted,
              COALESCE(SUM(m.quantity) FILTER (WHERE m.movement_date <= $3), 0) AS closing
         FROM products p
         LEFT JOIN stock_movements m ON m.product_id = p.id
        WHERE p.business_id = $1 AND p.deleted_at IS NULL AND p.track_stock
        GROUP BY p.id
        ORDER BY p.name`,
      [req.businessId, from, to]
    ),
    businessHeader(req.businessId),
  ]);
  const q = (n) => String(Math.round(num(n) * 1000) / 1000);
  const items = rows.rows.map((p) => ({
    id: p.id, name: p.name, unit: p.unit, costPrice: money(p.cost_price),
    opening: q(p.opening), stockIn: q(p.stock_in), sold: q(p.sold), lost: q(p.lost), counted: q(p.counted),
    closing: q(p.closing), value: money(num(p.closing) * num(p.cost_price)),
    low: num(p.closing) <= num(p.reorder_level),
    slow: num(p.sold) === 0 && num(p.closing) > 0,
  }));
  res.json({
    business, from, to, items,
    totals: {
      value: money(sum(items, 'value')),
      lowCount: items.filter((i) => i.low).length,
      slowCount: items.filter((i) => i.slow).length,
    },
  });
});

// ---- Debtors (who owes you) -------------------------------------------------------------

function ageBucket(dueDate, asOf) {
  if (!dueDate || dueDate >= asOf) return 'notDue';
  const days = Math.round((Date.parse(asOf) - Date.parse(dueDate)) / 864e5);
  if (days <= 30) return 'd1_30';
  if (days <= 60) return 'd31_60';
  return 'd61';
}

router.get('/reports/debtors', canView, validate(asOfSchema, 'query'), async (req, res) => {
  const asOf = req.valid.query.asOf || todayInGhana();
  const [rows, business] = await Promise.all([openInvoices(req.businessId, asOf), businessHeader(req.businessId)]);
  const empty = () => ({ notDue: 0, d1_30: 0, d31_60: 0, d61: 0, total: 0 });
  const totals = empty();
  const byCustomer = new Map();
  for (const r of rows) {
    const bucket = ageBucket(r.due_date, asOf);
    const key = r.customer || '';
    if (!byCustomer.has(key)) byCustomer.set(key, { customer: r.customer, phone: r.phone, invoices: [], ...empty() });
    const c = byCustomer.get(key);
    const owed = num(r.outstanding);
    c.invoices.push({
      id: r.id, number: r.number, issueDate: r.issue_date, dueDate: r.due_date, total: money(r.total),
      outstanding: money(owed), bucket,
      daysOverdue: bucket === 'notDue' ? 0 : Math.round((Date.parse(asOf) - Date.parse(r.due_date)) / 864e5),
    });
    c[bucket] += owed; c.total += owed;
    totals[bucket] += owed; totals.total += owed;
  }
  const fmt = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? money(v) : v]));
  res.json({
    business, asOf,
    customers: [...byCustomer.values()].sort((a, b) => b.total - a.total).map(fmt),
    totals: fmt(totals),
  });
});

// ---- Sales by product ---------------------------------------------------------------------
// Goods counted when they were sold: a sale with products on its date, an invoice when it was sent.

router.get('/reports/sales-by-product', canView, validate(periodSchema, 'query'), async (req, res) => {
  const { from, to } = period(req);
  const args = [req.businessId, from, to];
  const [lines, typed, business] = await Promise.all([
    query(
      `SELECT p.id, p.name, p.unit, p.kind, SUM(x.qty) AS qty, SUM(x.revenue) AS revenue, SUM(x.cost) AS cost
         FROM (
           SELECT ti.product_id, ti.quantity AS qty, ti.line_total * (1 - t.tax_amount / NULLIF(t.amount, 0)) AS revenue,
                  ti.quantity * COALESCE(ti.unit_cost, 0) * (CASE WHEN pp.track_stock THEN 1 ELSE 0 END) AS cost
             FROM transaction_items ti
             JOIN transactions t ON t.id = ti.transaction_id
             JOIN products pp ON pp.id = ti.product_id
            WHERE t.business_id = $1 AND t.kind = 'sale' AND t.deleted_at IS NULL AND t.txn_date BETWEEN $2 AND $3
           UNION ALL
           SELECT ii.product_id, ii.quantity, ii.line_total,
                  COALESCE((SELECT SUM(-m.quantity * COALESCE(m.unit_cost, 0)) FROM stock_movements m
                             WHERE m.invoice_item_id = ii.id AND m.reason = 'sale'), 0)
             FROM invoice_items ii
             JOIN invoices inv ON inv.id = ii.invoice_id
            WHERE inv.business_id = $1 AND inv.doc_type = 'invoice' AND inv.deleted_at IS NULL
              AND inv.status NOT IN ('draft', 'void') AND ii.product_id IS NOT NULL
              AND inv.issue_date BETWEEN $2 AND $3
         ) x
         JOIN products p ON p.id = x.product_id
        GROUP BY p.id
        ORDER BY SUM(x.revenue) - SUM(x.cost) DESC, p.name`,
      args
    ),
    query(
      `SELECT COALESCE(SUM(t.amount - t.tax_amount), 0) AS total FROM transactions t
        WHERE t.business_id = $1 AND t.kind = 'sale' AND t.deleted_at IS NULL AND t.invoice_id IS NULL
          AND t.txn_date BETWEEN $2 AND $3
          AND NOT EXISTS (SELECT 1 FROM transaction_items ti WHERE ti.transaction_id = t.id)`,
      args
    ),
    businessHeader(req.businessId),
  ]);
  const items = lines.rows.map((r) => {
    const revenue = num(r.revenue);
    const cost = num(r.cost);
    return {
      id: r.id, name: r.name, unit: r.unit, kind: r.kind, qty: String(Math.round(num(r.qty) * 1000) / 1000),
      sales: money(revenue), cost: money(cost), profit: money(revenue - cost),
      margin: revenue > 0 ? Math.round(((revenue - cost) / revenue) * 1000) / 10 : null,
    };
  });
  res.json({
    business, from, to, items,
    typedSales: money(typed.rows[0].total),
    totals: { sales: money(sum(items, 'sales')), cost: money(sum(items, 'cost')), profit: money(sum(items, 'profit')) },
  });
});

// ---- Balance sheet ---------------------------------------------------------------------------

router.get('/reports/balance-sheet', canView, validate(asOfSchema, 'query'), async (req, res) => {
  const asOf = req.valid.query.asOf || todayInGhana();
  const [accounts, stock, invoices, equipment, debts, business, tax] = await Promise.all([
    accountBalances(req.businessId, asOf, asOf),
    query(
      `SELECT COALESCE(SUM(q.qty * q.cost_price), 0) AS value FROM (
         SELECT p.cost_price, COALESCE(SUM(m.quantity), 0) AS qty
           FROM products p LEFT JOIN stock_movements m ON m.product_id = p.id AND m.movement_date <= $2
          WHERE p.business_id = $1 AND p.deleted_at IS NULL AND p.track_stock
          GROUP BY p.id) q WHERE q.qty > 0`,
      [req.businessId, asOf]
    ),
    openInvoices(req.businessId, asOf),
    query(
      `SELECT id, name, current_value FROM assets
        WHERE business_id = $1 AND deleted_at IS NULL AND bought_on <= $2
          AND (disposed_on IS NULL OR disposed_on > $2)
        ORDER BY bought_on, name`,
      [req.businessId, asOf]
    ),
    debtBalances(req.businessId, asOf),
    businessHeader(req.businessId),
    taxPosition(req.businessId, asOf),
  ]);
  const cashLines = accounts.map((a) => ({ name: a.name, amount: money(a.closing) }));
  const cashTotal = sum(accounts, 'closing');
  const stockValue = num(stock.rows[0].value);
  const debtorsTotal = sum(invoices, 'outstanding');
  const equipmentLines = equipment.rows.map((e) => ({ name: e.name, amount: money(e.current_value) }));
  const equipmentTotal = sum(equipment.rows, 'current_value');
  const whtCredit = tax.whtCredit;
  const vatCredit = Math.max(0, -tax.owed);
  const assetsTotal = cashTotal + stockValue + debtorsTotal + equipmentTotal + whtCredit + vatCredit;
  const debtLines = debts.filter((d) => d.balance > 0.004).map((d) => ({ name: d.lender, kind: d.kind, amount: money(d.balance) }));
  const taxOwed = Math.max(0, tax.owed);
  const liabilitiesTotal = sum(debtLines, 'amount') + taxOwed;
  res.json({
    business, asOf,
    assets: {
      cash: cashLines, cashTotal: money(cashTotal),
      stock: money(stockValue),
      debtors: money(debtorsTotal),
      equipment: equipmentLines, equipmentTotal: money(equipmentTotal),
      whtCredit: money(whtCredit),
      vatCredit: money(vatCredit),
      total: money(assetsTotal),
    },
    liabilities: { debts: debtLines, taxOwed: money(taxOwed), total: money(liabilitiesTotal) },
    equity: money(assetsTotal - liabilitiesTotal),
  });
});

module.exports = { router, debtBalances, taxPosition };
