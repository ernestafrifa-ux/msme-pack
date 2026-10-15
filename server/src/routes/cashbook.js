// Cash book: where money is kept (accounts), categories, and the record of
// every sale, expense and transfer. Mounted at /api/businesses/:businessId.
const express = require('express');
const { z } = require('zod');
const { query, withTransaction } = require('../db');
const { requireMember } = require('../auth');
const { HttpError, validate } = require('../http');
const { todayInGhana, addDays } = require('../dates');

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
    createdBy: t.created_by_name,
    createdAt: t.created_at,
  };
}

const TXN_SELECT = `
  SELECT t.*, a.name AS account_name, ta.name AS to_account_name,
         c.name AS category_name, u.full_name AS created_by_name
    FROM transactions t
    JOIN payment_accounts a ON a.id = t.account_id
    LEFT JOIN payment_accounts ta ON ta.id = t.to_account_id
    LEFT JOIN categories c ON c.id = t.category_id
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

const txnSchema = z
  .object({
    kind: z.enum(['sale', 'other_income', 'expense', 'purchase', 'transfer', 'owner_draw', 'owner_capital']),
    date: isoDate.optional(),
    amount,
    accountId: z.uuid('Choose where the money went or came from.'),
    toAccountId: z.uuid().optional().nullable(),
    categoryId: z.uuid().optional().nullable(),
    paymentRef: z.string().trim().max(80).optional().nullable(),
    momoFee: z.coerce.number().min(0).max(1e6).optional().default(0),
    note: z.string().trim().max(500).optional().nullable(),
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
  });

router.post('/transactions', canRecord, validate(txnSchema), async (req, res) => {
  const t = req.valid.body;
  const today = todayInGhana();
  const date = t.date || today;
  if (date > addDays(today, 1)) {
    throw new HttpError(400, 'The date cannot be in the future.', { date: 'Date is in the future.' });
  }

  // Retried save from the phone: return the record already saved.
  if (t.clientRef) {
    const { rows } = await query(`${TXN_SELECT} WHERE t.client_ref = $1 AND t.business_id = $2`, [t.clientRef, req.businessId]);
    if (rows[0]) return res.status(200).json({ transaction: publicTxn(rows[0]), duplicate: true });
  }

  const ids = [t.accountId, t.toAccountId].filter(Boolean);
  const { rows: accts } = await query(
    `SELECT id, opening_date FROM payment_accounts
      WHERE business_id = $1 AND id = ANY($2::uuid[]) AND deleted_at IS NULL`,
    [req.businessId, ids]
  );
  if (accts.length !== ids.length) {
    throw new HttpError(400, 'That account was not found.', { accountId: 'Choose one of your accounts.' });
  }
  const earliest = accts.map((a) => a.opening_date).sort().pop();
  if (date < earliest) {
    throw new HttpError(400, `This account's records start on ${earliest}. Choose that date or later.`, {
      date: `On or after ${earliest}.`,
    });
  }

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

  const saved = await withTransaction(async (db) => {
    const { rows } = await db.query(
      `INSERT INTO transactions (business_id, kind, txn_date, amount, account_id, to_account_id,
                                 category_id, payment_ref, momo_fee, note, client_ref, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [req.businessId, t.kind, date, t.amount, t.accountId, t.toAccountId || null,
       t.categoryId || null, t.paymentRef || null, t.momoFee || 0, t.note || null,
       t.clientRef || null, req.user.id]
    );
    await db.query(
      `INSERT INTO audit_log (business_id, user_id, action, entity, entity_id, changes)
       VALUES ($1, $2, 'create', 'transaction', $3, $4)`,
      [req.businessId, req.user.id, rows[0].id, JSON.stringify({ kind: t.kind, amount: t.amount, date })]
    );
    return rows[0].id;
  });

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
        WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL`,
      [req.params.id, req.businessId]
    );
    if (r.rowCount) {
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
  const [accounts, summary, recent] = await Promise.all([
    query(
      `SELECT account_id, account_name, kind, balance FROM v_account_balances
        WHERE business_id = $1 ORDER BY kind, account_name`,
      [req.businessId]
    ),
    query(
      `SELECT sales, other_income, expenses, stock_purchases, momo_fees,
              cost_of_sales, gross_profit, net_profit_estimate
         FROM v_monthly_summary WHERE business_id = $1 AND month = $2::date`,
      [req.businessId, monthStart]
    ),
    query(`${TXN_SELECT} WHERE t.business_id = $1 AND t.deleted_at IS NULL
           ORDER BY t.txn_date DESC, t.created_at DESC LIMIT 5`, [req.businessId]),
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
    },
    recent: recent.rows.map(publicTxn),
  });
});

module.exports = { router };
