// Loans, supplier credit and equipment. Money borrowed into an account, repayments and
// equipment bought from an account are cash book records, so balances stay right.
// Mounted at /api/businesses/:businessId.
const express = require('express');
const { z } = require('zod');
const { query, withTransaction } = require('../db');
const { requireMember } = require('../auth');
const { HttpError, validate } = require('../http');
const { todayInGhana, addDays } = require('../dates');
const { insertTransaction, checkAccounts } = require('./cashbook');

const router = express.Router({ mergeParams: true });
const canView = requireMember();
const canManage = requireMember(['owner', 'manager']);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15.');
const amount = z.coerce.number({ message: 'Enter an amount.' }).positive('Amount must be more than zero.').max(1e11)
  .transform((n) => Math.round(n * 100) / 100);
const money = (n) => (Math.round(Number(n || 0) * 100) / 100).toFixed(2);
const isUuid = (id) => /^[0-9a-f-]{36}$/i.test(id || '');

function checkDate(date) {
  if (date > addDays(todayInGhana(), 1)) throw new HttpError(400, 'The date cannot be in the future.', { date: 'Date is in the future.' });
}

// ---- Debts ---------------------------------------------------------------------------

async function loadDebts(businessId, id = null) {
  const { rows } = await query(
    `SELECT d.*, COALESCE(SUM(t.amount - t.interest_amount) FILTER (WHERE t.kind = 'loan_repayment'), 0) AS repaid,
            COALESCE(SUM(t.interest_amount) FILTER (WHERE t.kind = 'loan_repayment'), 0) AS interest_paid,
            MAX(t.txn_date) FILTER (WHERE t.kind = 'loan_repayment') AS last_paid,
            MAX(a.name) FILTER (WHERE t.kind = 'loan_received') AS received_into
       FROM debts d
       LEFT JOIN transactions t ON t.debt_id = d.id AND t.deleted_at IS NULL
       LEFT JOIN payment_accounts a ON a.id = t.account_id
      WHERE d.business_id = $1 AND d.deleted_at IS NULL AND ($2::uuid IS NULL OR d.id = $2)
      GROUP BY d.id
      ORDER BY (d.amount - COALESCE(SUM(t.amount - t.interest_amount) FILTER (WHERE t.kind = 'loan_repayment'), 0)) <= 0,
               d.start_date DESC`,
    [businessId, id]
  );
  return rows.map((d) => ({
    id: d.id, lender: d.lender, kind: d.kind, amount: money(d.amount), startDate: d.start_date, note: d.note,
    repaid: money(d.repaid), interestPaid: money(d.interest_paid), balance: money(Number(d.amount) - Number(d.repaid)),
    lastPaid: d.last_paid, receivedInto: d.received_into || null, boughtOnCredit: !!d.purchase_txn_id,
  }));
}

router.get('/debts', canView, async (req, res) => {
  const debts = await loadDebts(req.businessId);
  const total = debts.reduce((s, d) => s + Math.max(0, Number(d.balance)), 0);
  res.json({ debts, totalOwed: money(total) });
});

router.get('/debts/:debtId', canView, async (req, res) => {
  if (!isUuid(req.params.debtId)) throw new HttpError(404, 'Not found.');
  const [debt] = await loadDebts(req.businessId, req.params.debtId);
  if (!debt) throw new HttpError(404, 'Not found.');
  const { rows } = await query(
    `SELECT t.id, t.txn_date, t.amount, t.interest_amount, t.momo_fee, t.note, a.name AS account_name
       FROM transactions t JOIN payment_accounts a ON a.id = t.account_id
      WHERE t.debt_id = $1 AND t.kind = 'loan_repayment' AND t.deleted_at IS NULL
      ORDER BY t.txn_date DESC, t.created_at DESC`,
    [debt.id]
  );
  res.json({
    debt,
    repayments: rows.map((r) => ({
      id: r.id, date: r.txn_date, amount: money(r.amount), interest: money(r.interest_amount),
      principal: money(Number(r.amount) - Number(r.interest_amount)), accountName: r.account_name, note: r.note,
    })),
  });
});

const debtSchema = z.object({
  lender: z.string().trim().min(2, 'Enter who lent the money.').max(120),
  kind: z.enum(['bank', 'microfinance', 'susu', 'supplier', 'family', 'other']),
  amount,
  startDate: isoDate.optional(),
  // Where the borrowed money went. Empty: the money is already spent or was never in the app (an old loan).
  accountId: z.uuid().optional().nullable(),
  note: z.string().trim().max(300).optional().nullable(),
});

router.post('/debts', canManage, validate(debtSchema), async (req, res) => {
  const d = req.valid.body;
  const date = d.startDate || todayInGhana();
  checkDate(date);
  const id = await withTransaction(async (db) => {
    if (d.accountId) await checkAccounts(db, req.businessId, [d.accountId], date);
    const { rows } = await db.query(
      `INSERT INTO debts (business_id, lender, kind, amount, start_date, note, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [req.businessId, d.lender, d.kind, d.amount, date, d.note || null, req.user.id]
    );
    if (d.accountId) {
      await insertTransaction(db, {
        businessId: req.businessId, userId: req.user.id, kind: 'loan_received', date, amount: d.amount,
        accountId: d.accountId, note: `Loan from ${d.lender}`, debtId: rows[0].id,
      });
    }
    return rows[0].id;
  });
  const [debt] = await loadDebts(req.businessId, id);
  res.status(201).json({ debt });
});

const repaySchema = z.object({
  amount,
  interest: z.coerce.number().min(0, 'Cannot be negative.').max(1e11).default(0).transform((n) => Math.round(n * 100) / 100),
  accountId: z.uuid('Choose where the money came from.'),
  date: isoDate.optional(),
  momoFee: z.coerce.number().min(0).max(1e6).optional().default(0),
  note: z.string().trim().max(300).optional().nullable(),
});

router.post('/debts/:debtId/repayments', canManage, validate(repaySchema), async (req, res) => {
  if (!isUuid(req.params.debtId)) throw new HttpError(404, 'Not found.');
  const p = req.valid.body;
  const date = p.date || todayInGhana();
  checkDate(date);
  if (p.interest > p.amount) {
    throw new HttpError(400, 'The interest cannot be more than the payment.', { interest: 'At most the amount paid.' });
  }
  await withTransaction(async (db) => {
    const { rows } = await db.query(
      'SELECT id, lender, start_date FROM debts WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL FOR UPDATE',
      [req.params.debtId, req.businessId]
    );
    if (!rows[0]) throw new HttpError(404, 'Not found.');
    const [debt] = await loadDebts(req.businessId, rows[0].id);
    const principal = Math.round((p.amount - p.interest) * 100) / 100;
    if (principal > Number(debt.balance) + 0.004) {
      throw new HttpError(400, `Only GHS ${debt.balance} of the loan itself is still owed. Put anything above that as interest.`,
        { amount: `Loan part at most ${debt.balance}.` });
    }
    if (date < rows[0].start_date) {
      throw new HttpError(400, 'The payment date is before the loan started.', { date: `On or after ${rows[0].start_date}.` });
    }
    await checkAccounts(db, req.businessId, [p.accountId], date);
    await insertTransaction(db, {
      businessId: req.businessId, userId: req.user.id, kind: 'loan_repayment', date, amount: p.amount,
      accountId: p.accountId, momoFee: p.momoFee, note: p.note || `Repayment to ${rows[0].lender}`,
      debtId: rows[0].id, interest: p.interest,
    });
  });
  const [debt] = await loadDebts(req.businessId, req.params.debtId);
  res.status(201).json({ debt });
});

router.delete('/debts/:debtId', canManage, async (req, res) => {
  if (!isUuid(req.params.debtId)) throw new HttpError(404, 'Not found.');
  await withTransaction(async (db) => {
    const { rows } = await db.query(
      `SELECT d.id, d.purchase_txn_id,
              (SELECT COUNT(*) FROM transactions t WHERE t.debt_id = d.id AND t.kind = 'loan_repayment' AND t.deleted_at IS NULL) AS repayments
         FROM debts d WHERE d.id = $1 AND d.business_id = $2 AND d.deleted_at IS NULL`,
      [req.params.debtId, req.businessId]
    );
    if (!rows[0]) throw new HttpError(404, 'Not found.');
    if (Number(rows[0].repayments) > 0) {
      throw new HttpError(409, 'This loan has repayments. Delete them first (in Records), then delete the loan.');
    }
    if (rows[0].purchase_txn_id) {
      throw new HttpError(409, 'This came from stock bought on credit. Delete that purchase in Records instead.');
    }
    await db.query('UPDATE debts SET deleted_at = now(), updated_at = now() WHERE id = $1', [rows[0].id]);
    await db.query(
      `UPDATE transactions SET deleted_at = now(), updated_at = now()
        WHERE debt_id = $1 AND kind = 'loan_received' AND deleted_at IS NULL`,
      [rows[0].id]
    );
  });
  res.status(204).end();
});

// ---- Equipment ------------------------------------------------------------------------

function publicAsset(a) {
  return {
    id: a.id, name: a.name, cost: money(a.cost), currentValue: money(a.current_value),
    boughtOn: a.bought_on, disposedOn: a.disposed_on, note: a.note, paidFrom: a.paid_from || null,
  };
}

router.get('/assets', canView, async (req, res) => {
  const { rows } = await query(
    `SELECT s.*, (SELECT a.name FROM transactions t JOIN payment_accounts a ON a.id = t.account_id
                   WHERE t.asset_id = s.id AND t.deleted_at IS NULL LIMIT 1) AS paid_from
       FROM assets s WHERE s.business_id = $1 AND s.deleted_at IS NULL
      ORDER BY s.disposed_on IS NOT NULL, s.bought_on DESC, s.name`,
    [req.businessId]
  );
  const assets = rows.map(publicAsset);
  const total = assets.filter((a) => !a.disposedOn).reduce((s, a) => s + Number(a.currentValue), 0);
  res.json({ assets, totalValue: money(total) });
});

const assetSchema = z.object({
  name: z.string().trim().min(2, 'Enter what it is.').max(120),
  cost: z.coerce.number().min(0, 'Cannot be negative.').max(1e11).transform((n) => Math.round(n * 100) / 100),
  currentValue: z.coerce.number().min(0, 'Cannot be negative.').max(1e11).optional()
    .transform((n) => (n === undefined ? undefined : Math.round(n * 100) / 100)),
  boughtOn: isoDate.optional(),
  // Paid for now from this account. Empty: bought before using the app.
  accountId: z.uuid().optional().nullable(),
  note: z.string().trim().max(300).optional().nullable(),
});

router.post('/assets', canManage, validate(assetSchema), async (req, res) => {
  const a = req.valid.body;
  const date = a.boughtOn || todayInGhana();
  checkDate(date);
  if (a.accountId && a.cost <= 0) throw new HttpError(400, 'Enter what you paid.', { cost: 'More than zero.' });
  const id = await withTransaction(async (db) => {
    if (a.accountId) await checkAccounts(db, req.businessId, [a.accountId], date);
    const { rows } = await db.query(
      `INSERT INTO assets (business_id, name, cost, current_value, bought_on, note, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [req.businessId, a.name, a.cost, a.currentValue ?? a.cost, date, a.note || null, req.user.id]
    );
    if (a.accountId) {
      await insertTransaction(db, {
        businessId: req.businessId, userId: req.user.id, kind: 'equipment', date, amount: a.cost,
        accountId: a.accountId, note: a.name, assetId: rows[0].id,
      });
    }
    return rows[0].id;
  });
  const { rows } = await query('SELECT * FROM assets WHERE id = $1', [id]);
  res.status(201).json({ asset: publicAsset(rows[0]) });
});

const assetPatch = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  currentValue: z.coerce.number().min(0, 'Cannot be negative.').max(1e11).optional()
    .transform((n) => (n === undefined ? undefined : Math.round(n * 100) / 100)),
  disposedOn: isoDate.optional().nullable(),
  note: z.string().trim().max(300).optional().nullable(),
});

router.patch('/assets/:assetId', canManage, validate(assetPatch), async (req, res) => {
  if (!isUuid(req.params.assetId)) throw new HttpError(404, 'Not found.');
  const a = req.valid.body;
  const { rows } = await query(
    `UPDATE assets SET name = COALESCE($3, name), current_value = COALESCE($4, current_value),
            disposed_on = CASE WHEN $5::boolean THEN $6::date ELSE disposed_on END,
            note = CASE WHEN $7::boolean THEN $8 ELSE note END, updated_at = now()
      WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL RETURNING *`,
    [req.params.assetId, req.businessId, a.name ?? null, a.currentValue ?? null,
     'disposedOn' in a, a.disposedOn ?? null, 'note' in a, a.note ?? null]
  );
  if (!rows[0]) throw new HttpError(404, 'Not found.');
  res.json({ asset: publicAsset(rows[0]) });
});

// Deleting removes a mistake: if it was paid from an account, the money goes back.
router.delete('/assets/:assetId', canManage, async (req, res) => {
  if (!isUuid(req.params.assetId)) throw new HttpError(404, 'Not found.');
  const { rowCount } = await withTransaction(async (db) => {
    const r = await db.query(
      'UPDATE assets SET deleted_at = now(), updated_at = now() WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL',
      [req.params.assetId, req.businessId]
    );
    if (r.rowCount) {
      await db.query('UPDATE transactions SET deleted_at = now(), updated_at = now() WHERE asset_id = $1 AND deleted_at IS NULL',
        [req.params.assetId]);
    }
    return r;
  });
  if (!rowCount) throw new HttpError(404, 'Not found.');
  res.status(204).end();
});

module.exports = { router };
