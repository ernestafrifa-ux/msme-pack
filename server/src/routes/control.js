// Keeping control when staff record too: closing the day with a cash count, and who recorded
// (or deleted) what. Mounted at /api/businesses/:businessId.
const express = require('express');
const { z } = require('zod');
const { query, withTransaction } = require('../db');
const { requireMember } = require('../auth');
const { HttpError, validate } = require('../http');
const { todayInGhana } = require('../dates');
const { insertTransaction } = require('./cashbook');

const router = express.Router({ mergeParams: true });
const canRecord = requireMember(['owner', 'manager', 'staff']);
const canManage = requireMember(['owner', 'manager']);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15.');
const money = (n) => (Math.round(Number(n || 0) * 100) / 100).toFixed(2);

function publicCount(c) {
  return {
    id: c.id, accountId: c.account_id, accountName: c.account_name, date: c.count_date,
    expected: money(c.expected), counted: money(c.counted), difference: money(Number(c.counted) - Number(c.expected)),
    note: c.note, recorded: !!c.adjustment_txn_id, countedBy: c.counted_by_name, at: c.created_at,
  };
}

// Each account with what the records say it holds now, and the last count.
router.get('/cash-counts', canRecord, async (req, res) => {
  const [accounts, history] = await Promise.all([
    query(
      `SELECT b.account_id AS id, b.account_name AS name, b.kind, b.balance
         FROM v_account_balances b WHERE b.business_id = $1
        ORDER BY CASE b.kind WHEN 'cash' THEN 0 WHEN 'mobile_money' THEN 1 ELSE 2 END, b.account_name`,
      [req.businessId]
    ),
    query(
      `SELECT c.*, a.name AS account_name, u.full_name AS counted_by_name
         FROM cash_counts c JOIN payment_accounts a ON a.id = c.account_id JOIN users u ON u.id = c.counted_by
        WHERE c.business_id = $1 ORDER BY c.created_at DESC LIMIT 60`,
      [req.businessId]
    ),
  ]);
  const today = todayInGhana();
  res.json({
    accounts: accounts.rows.map((a) => ({ id: a.id, name: a.name, kind: a.kind, expected: money(a.balance) })),
    countedToday: history.rows.some((c) => c.count_date === today),
    history: history.rows.map(publicCount),
  });
});

const countSchema = z.object({
  counts: z.array(z.object({
    accountId: z.uuid(),
    counted: z.coerce.number().min(0, 'Cannot be negative.').max(1e11).transform((n) => Math.round(n * 100) / 100),
  })).min(1, 'Count at least one account.').max(20),
  // Record shortages as a cost and extra money as income, so the balances match what is there.
  recordDifference: z.boolean().default(true),
  note: z.string().trim().max(300).optional().nullable(),
});

router.post('/cash-counts', canRecord, validate(countSchema), async (req, res) => {
  const v = req.valid.body;
  const today = todayInGhana();
  const saved = await withTransaction(async (db) => {
    const { rows: cats } = await db.query(
      `SELECT id, name FROM categories WHERE business_id IS NULL AND name IN ('Cash shortage', 'Cash over')`
    );
    const catId = (name) => cats.find((c) => c.name === name)?.id;
    const out = [];
    for (const c of v.counts) {
      const { rows } = await db.query(
        'SELECT balance FROM v_account_balances WHERE account_id = $1 AND business_id = $2', [c.accountId, req.businessId]
      );
      if (!rows[0]) throw new HttpError(400, 'That account was not found.', { counts: 'Check the accounts.' });
      const expected = Number(rows[0].balance);
      const diff = Math.round((c.counted - expected) * 100) / 100;
      let adjId = null;
      if (v.recordDifference && diff !== 0) {
        adjId = await insertTransaction(db, {
          businessId: req.businessId, userId: req.user.id, date: today, accountId: c.accountId,
          kind: diff < 0 ? 'expense' : 'other_income', amount: Math.abs(diff),
          categoryId: catId(diff < 0 ? 'Cash shortage' : 'Cash over'),
          note: `${diff < 0 ? 'Short' : 'Extra'} at closing count${v.note ? `: ${v.note}` : ''}`,
        });
      }
      const ins = await db.query(
        `INSERT INTO cash_counts (business_id, account_id, count_date, expected, counted, note, adjustment_txn_id, counted_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [req.businessId, c.accountId, today, expected, c.counted, v.note || null, adjId, req.user.id]
      );
      out.push(ins.rows[0].id);
    }
    return out;
  });
  const { rows } = await query(
    `SELECT c.*, a.name AS account_name, u.full_name AS counted_by_name
       FROM cash_counts c JOIN payment_accounts a ON a.id = c.account_id JOIN users u ON u.id = c.counted_by
      WHERE c.id = ANY($1::uuid[]) ORDER BY a.name`,
    [saved]
  );
  res.status(201).json({ counts: rows.map(publicCount) });
});

// ---- Who recorded what ----------------------------------------------------------------

const activitySchema = z.object({ from: isoDate.optional(), to: isoDate.optional() });

router.get('/activity', canManage, validate(activitySchema, 'query'), async (req, res) => {
  const today = todayInGhana();
  const from = req.valid.query.from || `${today.slice(0, 7)}-01`;
  const to = req.valid.query.to || today;
  const args = [req.businessId, from, to];
  const [people, deletions, shortages] = await Promise.all([
    query(
      `SELECT u.id, u.full_name, m.role,
              COUNT(t.id) FILTER (WHERE t.deleted_at IS NULL)::int AS records,
              COALESCE(SUM(t.amount) FILTER (WHERE t.deleted_at IS NULL AND t.kind = 'sale'), 0) AS sales,
              COUNT(t.id) FILTER (WHERE t.deleted_at IS NULL AND t.kind = 'sale')::int AS sales_n,
              COALESCE(SUM(t.amount) FILTER (WHERE t.deleted_at IS NULL AND t.kind IN ('expense', 'purchase')), 0) AS spent,
              (SELECT COUNT(*)::int FROM audit_log l WHERE l.business_id = $1 AND l.user_id = u.id
                  AND l.action = 'delete' AND l.entity = 'transaction' AND l.created_at::date BETWEEN $2 AND $3) AS deleted,
              MAX(t.created_at) AS last_at
         FROM business_members m JOIN users u ON u.id = m.user_id
         LEFT JOIN transactions t ON t.business_id = m.business_id AND t.created_by = u.id AND t.txn_date BETWEEN $2 AND $3
        WHERE m.business_id = $1
        GROUP BY u.id, u.full_name, m.role
        ORDER BY COUNT(t.id) DESC, u.full_name`,
      args
    ),
    query(
      `SELECT l.created_at, du.full_name AS deleted_by, t.kind, t.amount, t.txn_date, t.note, cu.full_name AS recorded_by,
              (SELECT string_agg(p.name || ' ×' || trim(trailing '.' from trim(trailing '0' from ti.quantity::text)), ', ')
                 FROM transaction_items ti JOIN products p ON p.id = ti.product_id WHERE ti.transaction_id = t.id) AS items
         FROM audit_log l
         JOIN transactions t ON t.id = l.entity_id
         LEFT JOIN users du ON du.id = l.user_id
         LEFT JOIN users cu ON cu.id = t.created_by
        WHERE l.business_id = $1 AND l.action = 'delete' AND l.entity = 'transaction' AND l.created_at::date BETWEEN $2 AND $3
        ORDER BY l.created_at DESC LIMIT 100`,
      args
    ),
    query(
      `SELECT c.count_date, c.expected, c.counted, a.name AS account_name, u.full_name
         FROM cash_counts c JOIN payment_accounts a ON a.id = c.account_id JOIN users u ON u.id = c.counted_by
        WHERE c.business_id = $1 AND c.count_date BETWEEN $2 AND $3 AND c.counted <> c.expected
        ORDER BY c.count_date DESC, c.created_at DESC`,
      args
    ),
  ]);
  res.json({
    from, to,
    people: people.rows.map((p) => ({ userId: p.id, fullName: p.full_name, role: p.role, records: p.records,
      sales: money(p.sales), salesCount: p.sales_n, spent: money(p.spent), deleted: p.deleted, lastAt: p.last_at })),
    deletions: deletions.rows.map((d) => ({ at: d.created_at, deletedBy: d.deleted_by, kind: d.kind, amount: money(d.amount),
      date: d.txn_date, note: d.note, items: d.items, recordedBy: d.recorded_by })),
    differences: shortages.rows.map((s) => ({ date: s.count_date, account: s.account_name, countedBy: s.full_name,
      difference: money(Number(s.counted) - Number(s.expected)) })),
  });
});

module.exports = { router };
