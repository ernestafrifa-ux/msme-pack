// Cash book: where money is kept (accounts), categories, and the record of
// every sale, expense and transfer. Mounted at /api/businesses/:businessId.
const express = require('express');
const { z } = require('zod');
const { query, withTransaction } = require('../db');
const { requireMember } = require('../auth');
const { HttpError, validate } = require('../http');
const { todayInGhana, addDays } = require('../dates');
const { refreshInvoiceStatus } = require('../invoiceStatus');
const { vatFromInclusive } = require('../tax');

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
    isCredit: t.is_credit,
    debtId: t.debt_id || null,
    lender: t.lender || null,
    assetName: t.asset_name || null,
    interest: t.interest_amount,
    taxAmount: t.tax_amount,
  };
}

// items_summary reads like "Shito 250ml jar ×4, Ground pepper ×2".
const TXN_SELECT = `
  SELECT t.*, a.name AS account_name, ta.name AS to_account_name,
         c.name AS category_name, u.full_name AS created_by_name,
         inv.number AS invoice_number, ct.name AS contact_name,
         COALESCE(d.lender, cd.lender) AS lender, ast.name AS asset_name,
         (SELECT string_agg(p.name || ' ×' || trim_scale(i.quantity), ', ' ORDER BY p.name)
            FROM transaction_items i JOIN products p ON p.id = i.product_id
           WHERE i.transaction_id = t.id) AS items_summary
    FROM transactions t
    JOIN payment_accounts a ON a.id = t.account_id
    LEFT JOIN payment_accounts ta ON ta.id = t.to_account_id
    LEFT JOIN categories c ON c.id = t.category_id
    LEFT JOIN invoices inv ON inv.id = t.invoice_id
    LEFT JOIN contacts ct ON ct.id = t.contact_id
    LEFT JOIN debts d ON d.id = t.debt_id
    LEFT JOIN debts cd ON cd.purchase_txn_id = t.id AND cd.deleted_at IS NULL
    LEFT JOIN assets ast ON ast.id = t.asset_id
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
    // Stock bought now and paid for later: no money moves; the supplier becomes a debt.
    onCredit: z.object({
      supplier: z.string().trim().min(2, 'Enter the supplier\'s name.').max(120),
      dueDate: isoDate.optional().nullable(),
    }).optional().nullable(),
    // VAT-registered businesses: the amount includes VAT, NHIL and GETFund (20%).
    // A sale: tax collected for GRA. An expense or stock bought: VAT on a supplier's VAT invoice, to claim back.
    vat: z.boolean().optional().default(false),
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
    if (t.onCredit && t.kind !== 'purchase') {
      ctx.addIssue({ code: 'custom', path: ['onCredit'], message: 'Only stock can be bought on credit.' });
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
  categoryId, contactId, invoiceId, paymentRef, momoFee, note, clientRef, items,
  isCredit = false, debtId = null, assetId = null, interest = 0, taxAmount = 0 }) {
  const { rows } = await db.query(
    `INSERT INTO transactions (business_id, kind, txn_date, amount, account_id, to_account_id, category_id,
                               contact_id, invoice_id, payment_ref, momo_fee, note, client_ref, created_by,
                               is_credit, debt_id, asset_id, interest_amount, tax_amount)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id`,
    [businessId, kind, date, amount, accountId, toAccountId || null, categoryId || null, contactId || null,
     invoiceId || null, paymentRef || null, momoFee || 0, note || null, clientRef || null, userId,
     isCredit, debtId, assetId, interest || 0, taxAmount || 0]
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
      // A sale can include services (no stock) but not supplies (kept for use, not for sale);
      // stock bought is products or supplies.
      `SELECT id FROM products WHERE business_id = $1 AND id = ANY($2::uuid[]) AND deleted_at IS NULL
         AND kind = ANY($3::text[])`,
      [req.businessId, ids, t.kind === 'sale' ? ['product', 'service'] : ['product', 'supply']]
    );
    if (rows.length !== ids.length) {
      throw new HttpError(400, t.kind === 'sale'
        ? 'One of the items was not found, or is a supply (kept for use in the work, not for sale).'
        : 'One of the products was not found.', { items: 'Check the products.' });
    }
    total = Math.round(items.reduce((s, i) => s + Math.round(i.quantity * i.unitPrice * 100), 0)) / 100;
    if (total <= 0) throw new HttpError(400, 'The total must be more than zero.', { items: 'Check the prices.' });
  }

  let taxAmount = 0;
  if (t.vat) {
    if (!['sale', 'expense', 'purchase'].includes(t.kind)) {
      throw new HttpError(400, 'VAT applies only to sales, expenses and stock bought.', { vat: 'Not for this record.' });
    }
    const { rows } = await query('SELECT vat_registered FROM businesses WHERE id = $1', [req.businessId]);
    if (!rows[0].vat_registered) {
      throw new HttpError(400, 'Only a VAT-registered business records VAT. Switch it on in Registrations.', { vat: 'Not registered for VAT.' });
    }
    taxAmount = vatFromInclusive(total).tax;
  }

  const saved = await withTransaction(async (db) => {
    const id = await insertTransaction(db, {
      businessId: req.businessId, userId: req.user.id, kind: t.kind, date, amount: total,
      accountId: t.accountId, toAccountId: t.toAccountId, categoryId: t.categoryId, contactId: t.contactId,
      paymentRef: t.paymentRef, momoFee: t.onCredit ? 0 : t.momoFee, note: t.note, clientRef: t.clientRef, items,
      isCredit: !!t.onCredit, taxAmount,
    });
    if (taxAmount && t.kind === 'purchase') {
      // Stock is worth its price before VAT: the VAT is claimed back from GRA.
      const share = (total - taxAmount) / total;
      await db.query(
        `UPDATE stock_movements SET unit_cost = round(unit_cost * $2, 4)
          WHERE transaction_item_id IN (SELECT id FROM transaction_items WHERE transaction_id = $1)`,
        [id, share]
      );
      await db.query(
        `UPDATE products p SET cost_price = round(ti.unit_price * $2, 2)
           FROM transaction_items ti WHERE ti.transaction_id = $1 AND ti.product_id = p.id`,
        [id, share]
      );
    }
    if (t.onCredit) {
      await db.query(
        `INSERT INTO debts (business_id, lender, kind, amount, start_date, purchase_txn_id, note, created_by, due_date)
         VALUES ($1, $2, 'supplier', $3, $4, $5, $6, $7, $8)`,
        [req.businessId, t.onCredit.supplier, total, date, id, t.note || null, req.user.id, t.onCredit.dueDate || null]
      );
    }
    return id;
  });

  const { rows } = await query(`${TXN_SELECT} WHERE t.id = $1`, [saved]);
  res.status(201).json({ transaction: publicTxn(rows[0]) });
});

const listSchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  kind: z.enum(['sale', 'other_income', 'expense', 'purchase', 'transfer', 'owner_draw', 'owner_capital',
    'loan_received', 'loan_repayment', 'equipment', 'wht', 'vat_payment']).optional(),
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

// ---- Receipts --------------------------------------------------------------------------
// A receipt for money received (a sale or a payment on an invoice): numbered the first time
// it is asked for, and shared with the customer as a link like an invoice.

router.post('/transactions/:id/receipt', canRecord, async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw new HttpError(404, 'Record not found.');
  const out = await withTransaction(async (db) => {
    const { rows } = await db.query(
      `SELECT id, kind, receipt_no, receipt_token FROM transactions
        WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL FOR UPDATE`,
      [req.params.id, req.businessId]
    );
    const t = rows[0];
    if (!t) throw new HttpError(404, 'Record not found.');
    if (t.kind !== 'sale') throw new HttpError(400, 'Receipts are for money received from customers.');
    if (t.receipt_token) return { number: t.receipt_no, token: t.receipt_token };
    const { rows: b } = await db.query(
      'UPDATE businesses SET next_receipt_no = next_receipt_no + 1 WHERE id = $1 RETURNING next_receipt_no - 1 AS n',
      [req.businessId]
    );
    const token = require('crypto').randomBytes(16).toString('base64url');
    await db.query('UPDATE transactions SET receipt_no = $2, receipt_token = $3 WHERE id = $1', [t.id, b[0].n, token]);
    return { number: b[0].n, token };
  });
  res.json(out);
});

// Send the receipt link by SMS (when SMS is set up).
router.post('/transactions/:id/receipt/sms', canRecord,
  validate(z.object({ phone: z.string().trim().min(9).max(20) })), async (req, res) => {
    const { rows } = await query(
      `SELECT t.receipt_no, t.receipt_token, t.amount, b.name FROM transactions t JOIN businesses b ON b.id = t.business_id
        WHERE t.id = $1 AND t.business_id = $2 AND t.deleted_at IS NULL`,
      [req.params.id, req.businessId]
    );
    if (!rows[0]?.receipt_token) throw new HttpError(404, 'Receipt not found.');
    const { appOrigin } = require('../users');
    const { sendSms } = require('../sms');
    const r = rows[0];
    const text = `${r.name}: thank you. Receipt No. ${String(r.receipt_no).padStart(4, '0')} for GHS ${Number(r.amount).toFixed(2)}: ${appOrigin(req)}/r/${r.receipt_token}`;
    const out = await sendSms({ to: req.valid.body.phone, text, purpose: 'receipt', businessId: req.businessId, userId: req.user.id });
    if (!out.sent) throw new HttpError(502, 'The SMS could not be sent. Try WhatsApp instead.');
    res.json({ sent: true });
  });

const publicRouter = express.Router();

// The customer's view of a receipt (no login).
publicRouter.get('/receipts/:token', async (req, res) => {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(req.params.token)) throw new HttpError(404, 'Receipt not found.');
  const { rows } = await query(
    `SELECT t.id, t.business_id, t.txn_date, t.amount, t.tax_amount, t.receipt_no, t.note, t.payment_ref,
            a.kind AS account_kind, a.name AS account_name, inv.number AS invoice_number, ct.name AS customer,
            b.name, b.phone, b.town, b.tin, b.vat_number, b.vat_registered, b.logo_url, b.digital_address, r.name AS region
       FROM transactions t
       JOIN businesses b ON b.id = t.business_id
       LEFT JOIN regions r ON r.code = b.region_code
       LEFT JOIN payment_accounts a ON a.id = t.account_id
       LEFT JOIN invoices inv ON inv.id = t.invoice_id
       LEFT JOIN contacts ct ON ct.id = t.contact_id
      WHERE t.receipt_token = $1 AND t.deleted_at IS NULL`,
    [req.params.token]
  );
  const t = rows[0];
  if (!t) throw new HttpError(404, 'Receipt not found.');
  const { rows: items } = await query(
    `SELECT p.name, ti.quantity, ti.unit_price, ti.line_total, p.unit FROM transaction_items ti
       JOIN products p ON p.id = ti.product_id WHERE ti.transaction_id = $1 ORDER BY ti.id`,
    [t.id]
  );
  res.set('Cache-Control', 'no-store');
  res.json({
    business: { name: t.name, phone: t.phone, town: t.town, region: t.region, tin: t.tin, digitalAddress: t.digital_address,
      vatNumber: t.vat_registered ? t.vat_number : null, logoUrl: t.logo_url },
    receipt: {
      number: t.receipt_no, date: t.txn_date, amount: t.amount, tax: t.tax_amount, note: t.note, paymentRef: t.payment_ref,
      paidBy: t.account_kind, invoiceNumber: t.invoice_number, customer: t.customer,
      items: items.map((i) => ({ name: i.name, quantity: i.quantity, unitPrice: i.unit_price, lineTotal: i.line_total, unit: i.unit })),
    },
  });
});

// Last working day of the month containing `iso` (weekends skipped; public holidays not).
function lastWorkingDay(iso) {
  const d = new Date(`${iso.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Things coming due: money owed to suppliers and lenders, and the monthly VAT return.
async function reminders(businessId) {
  const today = todayInGhana();
  const out = [];
  const { rows: debts } = await query(
    `SELECT d.id, d.lender, d.kind, d.due_date,
            d.amount - COALESCE((SELECT SUM(t.amount - t.interest_amount) FROM transactions t
                                  WHERE t.debt_id = d.id AND t.kind = 'loan_repayment' AND t.deleted_at IS NULL), 0) AS balance
       FROM debts d
      WHERE d.business_id = $1 AND d.deleted_at IS NULL AND d.due_date IS NOT NULL AND d.due_date <= $2
      ORDER BY d.due_date`,
    [businessId, addDays(today, 7)]
  );
  for (const d of debts) {
    if (Number(d.balance) <= 0.004) continue;
    out.push({ type: 'debt', id: d.id, lender: d.lender, kind: d.kind, dueDate: d.due_date,
      balance: Number(d.balance).toFixed(2), overdue: d.due_date < today });
  }
  const { rows: b } = await query('SELECT vat_registered FROM businesses WHERE id = $1', [businessId]);
  if (b[0].vat_registered && Number(today.slice(8, 10)) >= 15) {
    const { taxPosition } = require('./reports');
    const pos = await taxPosition(businessId, today);
    if (pos.owed > 0) out.push({ type: 'vat', owed: pos.owed.toFixed(2), dueDate: lastWorkingDay(today) });
  }
  return out;
}

async function latestNotice(businessId, userId) {
  const { rows } = await query(
    `SELECT n.id, n.title, COUNT(*) OVER () AS unread FROM notices n
       JOIN notice_businesses nb ON nb.notice_id = n.id AND nb.business_id = $1
       LEFT JOIN notice_reads r ON r.notice_id = n.id AND r.user_id = $2
      WHERE n.deleted_at IS NULL AND r.notice_id IS NULL
      ORDER BY n.created_at DESC LIMIT 1`,
    [businessId, userId]
  );
  return { unread: rows[0] ? Number(rows[0].unread) : 0, latest: rows[0] ? { id: rows[0].id, title: rows[0].title } : null };
}

// Soft delete: the record disappears from totals but stays in the audit trail.
router.delete('/transactions/:id', canManage, async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw new HttpError(404, 'Record not found.');
  const { rowCount } = await withTransaction(async (db) => {
    const { rows: found } = await db.query(
      'SELECT kind, is_credit FROM transactions WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL',
      [req.params.id, req.businessId]
    );
    if (found[0] && ['loan_received', 'equipment'].includes(found[0].kind)) {
      throw new HttpError(409, 'This record belongs to a loan or a piece of equipment. Change it in Loans & equipment.');
    }
    if (found[0]?.is_credit) {
      // Stock bought on credit: remove the supplier debt too, unless some of it has been paid.
      const { rows: debt } = await db.query(
        `SELECT d.id, (SELECT COUNT(*) FROM transactions r WHERE r.debt_id = d.id AND r.deleted_at IS NULL) AS paid
           FROM debts d WHERE d.purchase_txn_id = $1 AND d.deleted_at IS NULL`,
        [req.params.id]
      );
      if (debt[0] && Number(debt[0].paid) > 0) {
        throw new HttpError(409, 'Some of this has been paid to the supplier. Delete those payments in Loans & equipment first.');
      }
      if (debt[0]) await db.query('UPDATE debts SET deleted_at = now() WHERE id = $1', [debt[0].id]);
    }
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
        WHERE business_id = $1
        ORDER BY CASE kind WHEN 'cash' THEN 0 WHEN 'mobile_money' THEN 1 ELSE 2 END, account_name`,
      [req.businessId]
    ),
    query(
      `SELECT sales, other_income, expenses, stock_purchases, momo_fees,
              cost_of_sales, gross_profit, net_profit_estimate, owner_pay, stock_losses, materials_used
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
      expenses: Number(s.expenses || 0).toFixed(2),
      stockPurchases: s.stock_purchases || '0.00',
      momoFees: s.momo_fees || '0.00',
      costOfSales: s.cost_of_sales || '0.00',
      grossProfit: s.gross_profit || '0.00',
      netProfitEstimate: s.net_profit_estimate || '0.00',
      ownerPay: Number(s.owner_pay || 0).toFixed(2),
      stockLosses: Number(s.stock_losses || 0).toFixed(2),
      materialsUsed: Number(s.materials_used || 0).toFixed(2),
    },
    recent: recent.rows.map(publicTxn),
    // The newest message from the MSME Pack team that this person has not read.
    notices: await latestNotice(req.businessId, req.user.id),
    reminders: await reminders(req.businessId),
    plan: (await require('./planning').planSummary(req.businessId, month)).plan,
    countedToday: (await query('SELECT 1 FROM cash_counts WHERE business_id = $1 AND count_date = $2 LIMIT 1',
      [req.businessId, todayInGhana()])).rows.length > 0,
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

module.exports = { router, publicRouter, insertTransaction, checkAccounts, checkDate, TXN_SELECT, publicTxn };
