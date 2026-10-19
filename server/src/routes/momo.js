// Checking a Mobile Money statement against the records. The phone reads the statement
// (pasted SMS messages or a downloaded file) into lines; this matches each line to a record.
// Mounted at /api/businesses/:businessId.
const express = require('express');
const { z } = require('zod');
const { query } = require('../db');
const { requireMember } = require('../auth');
const { HttpError, validate } = require('../http');
const { addDays } = require('../dates');

const router = express.Router({ mergeParams: true });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const matchSchema = z.object({
  accountId: z.uuid('Choose the MoMo account.'),
  lines: z.array(z.object({
    date: isoDate,
    amount: z.coerce.number().positive().max(1e9),
    direction: z.enum(['in', 'out']),
    ref: z.string().trim().max(60).optional().nullable(),
    name: z.string().trim().max(120).optional().nullable(),
  })).min(1, 'No MoMo payments were found in what you gave.').max(1000),
});

const IN_KINDS = ['sale', 'other_income', 'owner_capital', 'loan_received'];
const OUT_KINDS = ['expense', 'purchase', 'owner_draw', 'loan_repayment', 'equipment', 'vat_payment', 'transfer'];
const cents = (n) => Math.round(Number(n) * 100);

router.post('/momo/match', requireMember(['owner', 'manager', 'staff']), validate(matchSchema), async (req, res) => {
  const v = req.valid.body;
  const { rows: acc } = await query('SELECT id, name FROM payment_accounts WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL', [v.accountId, req.businessId]);
  if (!acc[0]) throw new HttpError(400, 'That account was not found.', { accountId: 'Choose one of your accounts.' });
  const dates = v.lines.map((l) => l.date).sort();
  const from = dates[0];
  const to = dates[dates.length - 1];
  const { rows: recs } = await query(
    `SELECT t.id, t.kind, t.txn_date, t.amount, t.payment_ref, t.note, t.account_id, t.to_account_id, c.name AS category, ct.name AS contact
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       LEFT JOIN contacts ct ON ct.id = t.contact_id
      WHERE t.business_id = $1 AND t.deleted_at IS NULL AND NOT t.is_credit
        AND (t.account_id = $2 OR t.to_account_id = $2) AND t.txn_date BETWEEN $3 AND $4`,
    [req.businessId, v.accountId, addDays(from, -3), addDays(to, 3)]
  );
  const dir = (r) => (r.to_account_id === v.accountId && r.kind === 'transfer' ? 'in'
    : IN_KINDS.includes(r.kind) ? 'in' : OUT_KINDS.includes(r.kind) ? 'out' : null);
  const used = new Set();
  const days = (a, b) => Math.abs((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
  const summary = (r) => ({ id: r.id, kind: r.kind, date: r.txn_date, amount: Number(r.amount).toFixed(2),
    what: r.contact || r.category || r.note || null, ref: r.payment_ref });

  const results = v.lines.map((l) => {
    // 1. The same MoMo transaction ID.
    let hit = l.ref ? recs.find((r) => !used.has(r.id) && r.payment_ref && r.payment_ref === l.ref) : null;
    // 2. Same amount, same direction, closest date within 3 days.
    if (!hit) {
      hit = recs.filter((r) => !used.has(r.id) && dir(r) === l.direction && cents(r.amount) === cents(l.amount) && days(r.txn_date, l.date) <= 3)
        .sort((a, b) => days(a.txn_date, l.date) - days(b.txn_date, l.date))[0];
    }
    if (hit) used.add(hit.id);
    return { ...l, amount: Number(l.amount).toFixed(2), status: hit ? 'matched' : 'missing', record: hit ? summary(hit) : null };
  });
  const notOnStatement = recs.filter((r) => !used.has(r.id) && r.txn_date >= from && r.txn_date <= to && dir(r)).map(summary);
  res.json({
    account: acc[0].name, from, to,
    lines: results,
    counts: { lines: results.length, matched: results.filter((r) => r.status === 'matched').length,
      missing: results.filter((r) => r.status === 'missing').length, notOnStatement: notOnStatement.length },
    notOnStatement,
  });
});

module.exports = { router };
