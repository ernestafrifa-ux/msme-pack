// Cash book: where money is kept (accounts), categories, and the record of
// every sale, expense and transfer. Mounted at /api/businesses/:businessId.
const express = require('express');
const { z } = require('zod');
const { query, withTransaction } = require('../db');
const { requireMember } = require('../auth');
const { HttpError, validate } = require('../http');
const { todayInGhana, addDays } = require('../dates');
const { refreshInvoiceStatus } = require('../invoiceStatus');

const router = express.Router({ mergeParams: true });

const canView = requireMember();
const canRecord = requireMember(['owner', 'manager', 'staff']);
const canManage = requireMember(['owner', 'manager']);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15.');
const amount = z.coerce
  .number({ message: 'Enter an amount.' })
  .positive('Amount must be more than zero.')
  .max(1e11, 'Amount is too large.')
  .transform((n) => Math.round(n * 100) / 100);

// Which category kind each transaction kind may use.
const CATEGORY_KIND = { sale: 'income', other_income: 'income', expense: 'expense', purchase: 'expense' };

function publicTxn(t) {
  return {
    id: t.id,
    kind: t.kind,
    date: t.txn_date,
    amount: t.amount,
    accountId: t.account_id,
    accountName: t.account_name,
    toAccountId: t.to_account_id,
    toAccountName: t.to_account_name,
    categoryId: t.category_id,
    categoryName: t.category_name,
    paymentRef: t.payment_ref,
    momoFee: t.momo_fee,
    note: t.note,
    itemsSummary: t.items_summary || null,
    invoiceId: t.invoice_id,
    invoiceNumber: t.invoice_number || null,
    contactName: t.contact_name || null,
    createdBy: t.created_by_name,
    createdAt: t.created_at,
  };
}

// items_summary reads like "Shito 250ml jar ×4, Ground pepper ×2".
const TXN_SELECT = `
  SELECT t.*, a.name AS account_name, ta.name AS to_account_name,
         c.name AS category_name, u.full_name AS created_by_name,
         inv.number AS invoice_number, ct.name AS contact_name,
         (SELECT string_agg(p.name || ' ×' || trim_scale(i.quantity), ', ' ORDER BY p.name)
            FROM transaction_items i JOIN products p ON p.id = i.product_id
           WHERE i.transaction_id = t.id) AS items_summary
    FROM transactions t
    JOIN payment_accounts a ON a.id = t.account_id
    LEFT JOIN payment_accounts ta ON ta.id = t.to_account_id
    LEFT JOIN categories c ON c.id = t.category_id
    LEFT JOIN invoices inv ON inv.id = t.invoice_id
    LEFT JOIN contacts ct ON ct.id = t.contact_id
    JOIN users u ON u.id = t.created_by`;

// ---- Accounts -------------------------------------------------------------

router.get('/accounts', canView, async (req, res) => {
  const { rows } = await query(
    `SELECT a.id, a.name, a.kind, a.provider, a.opening_balance, a.opening_date, a.is_default,
            v.balance
       FROM payment_accounts a JOIN v_account_balances v ON v.account_id = a.id
      WHERE a.business_id = $1 AND a.deleted_at IS NULL
      ORDER BY a.is_default DESC, a.created_at`,
    [req.businessId]
  );
  res.json({
    accounts: rows.map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind,
      provider: a.provider,
      openingBalance: a.opening_balance,
      openingDate: a.opening_date,
      isDefault: a.is_default,
      balance: a.balance,
    })),
  });
});

const accountSchema = z.object({
  name: z.string().trim().min(2).max(60),
  kind: z.enum(['cash', 'mobile_money', 'bank']),
  provider: z.string().trim().max(60).optional().nullable(),
  lastDigits: z.string().regex(/^\d{0,4}$/, 'Only the last 4 digits, please.').optional().nullable(),
  openingBalance: z.coerce.number().min(0).max(1e11).default(0),
});

router.post('/accounts', canManage, validate(accountSchema), async (req, res) => {
  const a = req.valid.body;
  try {
    const { rows } = await query(
      `INSERT INTO payment_accounts (business_id, name, kind, provider, last_digits, opening_balance, opening_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [req.businessId, a.name, a.kind, a.provider || null, a.lastDigits || null,
       a.openingBalance, todayInGhana()]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, 'You already have an account with that name.', { name: 'Already used.' });
    throw err;
  }
});

// ---- Categories -----------------------------------------------------------

router.get('/categories', canView, async (req, res) => {
  const { rows } = await query(
    `SELECT id, kind, name, business_id IS NULL AS is_system
       FROM categories
      WHERE (business_id IS NULL OR business_id = $1) AND deleted_at IS NULL
      ORDER BY kind, is_system DESC, sort_order, name`,
    [req.businessId]
  );
  res.json({ categories: rows.map((c) => ({ id: c.id, kind: c.kind, name: c.name, isSystem: c.is_system })) });
});

const categorySchema = z.object({
  kind: z.enum(['income', 'expense']),
  name: z.string().trim().min(2).max(60),
});

router.post('/categories', canManage, validate(categorySchema), async (req, res) => {
  const c = req.valid.body;
  try {
    const { rows } = await query(
      `INSERT INTO categories (business_id, kind, name, sort_order) VALUES ($1, $2, $3, 100) RETURNING id`,
      [req.businessId, c.kind, c.name]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, 'That category already exists.', { name: 'Already used.' });
    throw err;
  }
});

// ---- Transactions ---------------------------------------------------------

const itemSchema = z.object({
  productId: z.uuid('Choose a product.'),
  quantity: z.coerce.number().positive('Must be more than zero.').max(1e9)
    .transform((n) => Math.round(n * 1000) / 1000),
  unitPrice: z.coerce.number().min(0, 'Cannot be negative.').max(1e9)
    .transform((n) => Math.round(n * 100) / 100),
});

const txnSchema = z
  .object({
    kind: z.enum(['sale', 'other_income', 'expense', 'purchase', 'transfer', 'owner_draw', 'owner_capital']),
    date: isoDate.optional(),
    // Optional when items are given: the total is then worked out from them.
    amount: amount.optional(),
    accountId: z.uuid('Choose where the money went or came from.'),
    toAccountId: z.uuid().optional().nullable(),
    categoryId: z.uuid().optional().nullable(),
    contactId: z.uuid().optional().nullable(),
    paymentRef: z.string().trim().max(80).optional().nullable(),
    momoFee: z.coerce.number().min(0).max(1e6).optional().default(0),
    note: z.string().trim().max(500).optional().nullable(),
    // Products sold (sale) or bought for stock (purchase); moves stock automatically.
    items: z.array(itemSchema).max(100).optional().nullable(),
    // Generated on the phone; makes saving safe to retry after a dropped connection.
    clientRef: z.uuid().optional().nullable(),
  })
  .superRefine((t, ctx) => {
    if (t.kind === 'transfer' && !t.toAccountId) {
      ctx.addIssue({ code: 'custom', path: ['toAccountId'], message: 'Choose where the money is going.' });
    }
    if (t.kind === 'transfer' && t.toAccountId === t.accountId) {
      ctx.addIssue({ code: 'custom', path: ['toAccountId'], message: 'Choose a different account.' });
    }
    if (t.kind !== 'transfer' && t.toAccountId) {
      ctx.addIssue({ code: 'custom', path: ['toAccountId'], message: 'Only transfers have a second account.' });
    }
    const hasItems = t.items && t.items.length > 0;
    if (hasItems && !['sale', 'purchase'].includes(t.kind)) {
      ctx.addIssue({ code: 'custom', path: ['items'], message: 'Only sales and stock purchases can list products.' });
    }
    if (t.kind === 'purchase' && !hasItems) {
      ctx.addIssue({ code: 'custom', path: ['items'], message: 'Add the products you bought.' });
    }
    if (!hasItems && t.amount === undefined) {
      ctx.addIssue({ code: 'custom', path: ['amount'], message: 'Enter an amount.' });
    }
  });

// Checks the accounts belong to the business and the date isn't before they were opened.
async function checkAccounts(db, businessId, ids, date) {
  const { rows } = await db.query(
    `SELECT id, opening_date FROM payment_accounts
      WHERE business_id = $1 AND id = ANY($2::uuid[]) AND deleted_at IS NULL`,
    [businessId, ids]
  );
  if (rows.length !== ids.length) {
    throw new HttpError(400, 'That account was not found.', { accountId: 'Choose one of your accounts.' });
  }
  const earliest = rows.map((a) => a.opening_date).sort().pop();
  if (date < earliest) {
    throw new HttpError(400, `This account's records start on ${earliest}. Choose that date or later.`, {
      date: `On or after ${earliest}.`,
    });
  }
}

function checkDate(date) {
  if (date > addDays(todayInGhana(), 1)) {
    throw new HttpError(400, 'The date cannot be in the future.', { date: 'Date is in the future.' });
  }
}

// Inserts one transaction (and its items) inside an open db transaction. Returns its id.
async function insertTransaction(db, { businessId, userId, kind, date, amount, accountId, toAccountId,
  categoryId, contactId, invoiceId, paymentRef, momoFee, note, clientRef, items }) {
  const { rows } = await db.query(
    `INSERT INTO transactions (business_id, kind, txn_date, amount, account_id, to_account_id, category_id,
                               contact_id, invoice_id, payment_ref, momo_fee, note, client_ref, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
    [businessId, kind, date, amount, accountId, toAccountId || null, categoryId || null, contactId || null,
     invoiceId || null, paymentRef || null, momoFee || 0, note || null, clientRef || null, userId]
  );
  const id = rows[0].id;
  for (const it of items || []) {
    // The stock trigger records the movement in or out of stock.
    await db.query(
      `INSERT INTO transaction_items (transaction_id, product_id, quantity, unit_price) VALUES ($1,$2,$3,$4)`,
      [id, it.productId, it.quantity, it.unitPrice]
    );
    // A stock purchase updates the product's cost to the latest price paid.
    if (kind === 'purchase') {
      await db.query('UPDATE products SET cost_price = $1, updated_at = now() WHERE id = $2', [it.unitPrice, it.productId]);
    }
  }
  await db.query(
    `INSERT INTO audit_log (business_id, user_id, action, entity, entity_id, changes)
     VALUES ($1, $2, 'create', 'transaction', $3, $4)`,
    [businessId, userId, id, JSON.stringify({ kind, amount, date, invoiceId: invoiceId || undefined })]
  );
  return id;
}

router.post('/transactions', canRecord, validate(txnSchema), async (req, res) => {
  const t = req.valid.body;
  const date = t.date || todayInGhana();
  checkDate(date);

  // Retried save from the phone: return the record already saved.
  if (t.clientRef) {
    const { rows } = await query(`${TXN_SELECT} WHERE t.client_ref = $1 AND t.business_id = $2`, [t.clientRef, req.businessId]);
    if (rows[0]) return res.status(200).json({ transaction: publicTxn(rows[0]), duplicate: true });
  }

  await checkAccounts({ query }, req.businessId, [t.accountId, t.toAccountId].filter(Boolean), date);

  if (t.categoryId) {
    const { rows } = await query(
      `SELECT kind FROM categories
        WHERE id = $1 AND (business_id IS NULL OR business_id = $2) AND deleted_at IS NULL`,
      [t.categoryId, req.businessId]
    );
    const expected = CATEGORY_KIND[t.kind];
    if (!rows[0] || !expected || rows[0].kind !== expected) {
      throw new HttpError(400, 'That category does not fit this record.', { categoryId: 'Choose another category.' });
    }
  }
  if (t.contactId) {
    const { rows } = await query('SELECT 1 FROM contacts WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL',
      [t.contactId, req.businessId]);
    if (!rows[0]) throw new HttpError(400, 'That customer was not found.', { contactId: 'Choose another.' });
  }

  let total = t.amount;
  const items = t.items && t.items.length ? t.items : null;
  if (items) {
    const ids = [...new Set(items.map((i) => i.productId))];
    const { rows } = await query(
      // A sale can include services (no stock); buying stock is for products only.
      `SELECT id FROM products WHERE business_id = $1 AND id = ANY($2::uuid[]) AND deleted_at IS NULL
         AND (kind = 'product' OR $3::boolean)`,
      [req.businessId, ids, t.kind === 'sale']
    );
    if (rows.length !== ids.length) throw new HttpError(400, 'One of the products was not found.', { items: 'Check the products.' });
    total = Math.round(items.reduce((s, i) => s + Math.round(i.quantity * i.unitPrice * 100), 0)) / 100;
    if (total <= 0) throw new HttpError(400, 'The total must be more than zero.', { items: 'Check the prices.' });
  }

  const saved = await withTransaction((db) =>
    insertTransaction(db, {
      businessId: req.businessId, userId: req.user.id, kind: t.kind, date, amount: total,
      accountId: t.accountId, toAccountId: t.toAccountId, categoryId: t.categoryId, contactId: t.contactId,
      paymentRef: t.paymentRef, momoFee: t.momoFee, note: t.note, clientRef: t.clientRef, items,
    })
  );

  const { rows } = await query(`${TXN_SELECT} WHERE t.id = $1`, [saved]);
  res.status(201).json({ transaction: publicTxn(rows[0]) });
});

const listSchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  kind: z.enum(['sale', 'other_income', 'expense', 'purchase', 'transfer', 'owner_draw', 'owner_capital']).optional(),
  accountId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  // Keyset pagination: pass the last row's date and id to get the next page.
  beforeDate: isoDate.optional(),
  beforeId: z.uuid().optional(),
});

router.get('/transactions', canView, validate(listSchema, 'query'), async (req, res) => {
  const q = req.valid.query;
  const where = ['t.business_id = $1', 't.deleted_at IS NULL'];
  const params = [req.businessId];
  const add = (sql, v) => {
    params.push(v);
    where.push(sql.replace('?', '$' + params.length));
  };
  if (q.from) add('t.txn_date >= ?', q.from);
  if (q.to) add('t.txn_date <= ?', q.to);
  if (q.kind) add('t.kind = ?', q.kind);
  if (q.accountId) {
    params.push(q.accountId);
    where.push(`(t.account_id = $${params.length} OR t.to_account_id = $${params.length})`);
  }
  if (q.beforeDate && q.beforeId) {
    params.push(q.beforeDate, q.beforeId);
    where.push(`(t.txn_date, t.id) < ($${params.length - 1}, $${params.length})`);
  }
  params.push(q.limit + 1);
  const { rows } = await query(
    `${TXN_SELECT} WHERE ${where.join(' AND ')}
     ORDER BY t.txn_date DESC, t.id DESC LIMIT $${params.length}`,
    params
  );
  const hasMore = rows.length > q.limit;
  res.json({ transactions: rows.slice(0, q.limit).map(publicTxn), hasMore });
});

// Soft delete: the record disappears from totals but stays in the audit trail.
router.delete('/transactions/:id', canManage, async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw new HttpError(404, 'Record not found.');
  const { rowCount } = await withTransaction(async (db) => {
    const r = await db.query(
      `UPDATE transactions SET deleted_at = now(), updated_at = now()
        WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL
        RETURNING invoice_id`,
      [req.params.id, req.businessId]
    );
    if (r.rowCount) {
      // Put back any stock this sale took out (or take out what a purchase added).
      await db.query(
        `DELETE FROM stock_movements
          WHERE transaction_item_id IN (SELECT id FROM transaction_items WHERE transaction_id = $1)`,
        [req.params.id]
      );
      // A deleted invoice payment makes the invoice owed again.
      if (r.rows[0].invoice_id) await refreshInvoiceStatus(db, r.rows[0].invoice_id);
      await db.query(
        `INSERT INTO audit_log (business_id, user_id, action, entity, entity_id)
         VALUES ($1, $2, 'delete', 'transaction', $3)`,
        [req.businessId, req.user.id, req.params.id]
      );
    }
    return r;
  });
  if (!rowCount) throw new HttpError(404, 'Record not found.');
  res.status(204).end();
});

// ---- Dashboard ------------------------------------------------------------

const dashSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Use a month like 2026-10.').optional(),
});

router.get('/dashboard', canView, validate(dashSchema, 'query'), async (req, res) => {
  const month = req.valid.query.month || todayInGhana().slice(0, 7);
  const monthStart = `${month}-01`;
  const [accounts, summary, recent, lowStock, owed] = await Promise.all([
    query(
      `SELECT account_id, account_name, kind, balance FROM v_account_balances
        WHERE business_id = $1 ORDER BY kind, account_name`,
      [req.businessId]
    ),
    query(
      `SELECT sales, other_income, expenses, stock_purchases, momo_fees,
              cost_of_sales, gross_profit, net_profit_estimate, owner_pay, stock_losses
         FROM v_monthly_summary WHERE business_id = $1 AND month = $2::date`,
      [req.businessId, monthStart]
    ),
    query(`${TXN_SELECT} WHERE t.business_id = $1 AND t.deleted_at IS NULL
           ORDER BY t.txn_date DESC, t.created_at DESC LIMIT 5`, [req.businessId]),
    query(
      `SELECT product_id, name, unit, on_hand, reorder_level FROM v_stock_levels
        WHERE business_id = $1 AND is_low ORDER BY on_hand - reorder_level, name LIMIT 5`,
      [req.businessId]
    ),
    query(
      `SELECT COALESCE(SUM(b.outstanding), 0) AS total,
              COUNT(*) FILTER (WHERE b.computed_status = 'overdue') AS overdue_count,
              COALESCE(SUM(b.outstanding) FILTER (WHERE b.computed_status = 'overdue'), 0) AS overdue_total
         FROM v_invoice_balances b JOIN invoices i ON i.id = b.invoice_id
        WHERE b.business_id = $1 AND i.status NOT IN ('draft', 'void') AND b.outstanding > 0`,
      [req.businessId]
    ),
  ]);
  const s = summary.rows[0] || {};
  const total = accounts.rows.reduce((sum, a) => sum + Number(a.balance), 0);
  res.json({
    month,
    totalBalance: total.toFixed(2),
    accounts: accounts.rows.map((a) => ({ id: a.account_id, name: a.account_name, kind: a.kind, balance: a.balance })),
    summary: {
      sales: s.sales || '0.00',
      otherIncome: s.other_income || '0.00',
      expenses: s.expenses || '0.00',
      stockPurchases: s.stock_purchases || '0.00',
      momoFees: s.momo_fees || '0.00',
      costOfSales: s.cost_of_sales || '0.00',
      grossProfit: s.gross_profit || '0.00',
      netProfitEstimate: s.net_profit_estimate || '0.00',
      ownerPay: Number(s.owner_pay || 0).toFixed(2),
      stockLosses: Number(s.stock_losses || 0).toFixed(2),
    },
    recent: recent.rows.map(publicTxn),
    lowStock: lowStock.rows.map((p) => ({
      id: p.product_id, name: p.name, unit: p.unit, onHand: p.on_hand, reorderLevel: p.reorder_level,
    })),
    owed: {
      total: Number(owed.rows[0].total).toFixed(2),
      overdueCount: Number(owed.rows[0].overdue_count),
      overdueTotal: Number(owed.rows[0].overdue_total).toFixed(2),
    },
  });
});

module.exports = { router, insertTransaction, checkAccounts, checkDate, TXN_SELECT, publicTxn };
