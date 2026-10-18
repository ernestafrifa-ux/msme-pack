// Registrations a business can do later: opening a bank account and registering for VAT.
// The owner tracks the documents, then switches each on in the app when it is done.
// Mounted at /api/businesses/:businessId.
const express = require('express');
const { z } = require('zod');
const { query, withTransaction } = require('../db');
const { requireMember } = require('../auth');
const { HttpError, validate } = require('../http');
const { todayInGhana } = require('../dates');

const router = express.Router({ mergeParams: true });
const canView = requireMember();
const canManage = requireMember(['owner', 'manager']);

const VAT_GOODS_THRESHOLD = 750000; // GHS a year, from 1 January 2026
const KINDS = ['bank', 'vat'];
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15.');
const money = (n) => (Math.round(Number(n || 0) * 100) / 100).toFixed(2);

function publicRegistration(r, kind) {
  return {
    kind,
    status: r?.status || 'not_started',
    startedOn: r?.started_on || null,
    doneOn: r?.done_on || null,
    reference: r?.reference || null,
    details: r?.details || {},
    checklist: r?.checklist || [],
  };
}

// Sales over the last 12 months, and a yearly figure at the current pace for a newer business.
async function salesPace(businessId) {
  const today = todayInGhana();
  const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 11);
  const since = d.toISOString().slice(0, 10);
  const { rows } = await query(
    `SELECT COALESCE(SUM(s.sales), 0) AS sales,
            (SELECT MIN(opening_date) FROM payment_accounts WHERE business_id = $1 AND deleted_at IS NULL) AS first_day
       FROM v_monthly_summary s WHERE s.business_id = $1 AND s.month >= $2::date`,
    [businessId, since]
  );
  const sales = Number(rows[0].sales);
  const first = rows[0].first_day && rows[0].first_day > since ? rows[0].first_day : since;
  const days = Math.max(1, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 86400000) + 1);
  const yearly = days >= 360 ? sales : (sales / days) * 365;
  return { sales, since: first, days: Math.min(days, 365), yearly };
}

// Does the business have to register for VAT? Services: always. Goods: above GHS 750,000 a year.
function vatAdvice(sells, pace) {
  const pct = Math.round((pace.yearly / VAT_GOODS_THRESHOLD) * 1000) / 10;
  if (sells === 'services' || sells === 'both') return { mustRegister: true, reason: 'services', pct };
  if (!sells) return { mustRegister: null, reason: 'unknown', pct };
  if (pace.yearly >= VAT_GOODS_THRESHOLD) return { mustRegister: true, reason: 'over', pct };
  if (pct >= 80) return { mustRegister: false, reason: 'close', pct };
  return { mustRegister: false, reason: 'under', pct };
}

async function loadAll(businessId) {
  const [regs, biz, banks, services, pace] = await Promise.all([
    query('SELECT * FROM registrations WHERE business_id = $1', [businessId]),
    query('SELECT vat_registered, vat_number, vat_effective_date, tin FROM businesses WHERE id = $1', [businessId]),
    query(
      `SELECT a.id, a.name, a.opening_date, b.balance FROM payment_accounts a
         JOIN v_account_balances b ON b.account_id = a.id
        WHERE a.business_id = $1 AND a.kind = 'bank' AND a.deleted_at IS NULL ORDER BY a.created_at`,
      [businessId]
    ),
    query(
      `SELECT name FROM products WHERE business_id = $1 AND kind = 'service' AND deleted_at IS NULL ORDER BY name LIMIT 5`,
      [businessId]
    ),
    salesPace(businessId),
  ]);
  const byKind = Object.fromEntries(regs.rows.map((r) => [r.kind, r]));
  const b = biz.rows[0];

  // A bank account added any other way (at setup, in Settings) also counts as done.
  const bank = publicRegistration(byKind.bank, 'bank');
  if (banks.rows.length) {
    bank.status = 'done';
    bank.doneOn = bank.doneOn || banks.rows[0].opening_date;
  } else if (bank.status === 'done') {
    bank.status = 'in_progress'; // the bank account was removed
  }
  bank.accounts = banks.rows.map((a) => ({ id: a.id, name: a.name, openedOn: a.opening_date, balance: money(a.balance) }));

  const vat = publicRegistration(byKind.vat, 'vat');
  if (b.vat_registered) {
    vat.status = 'done';
    vat.doneOn = b.vat_effective_date || vat.doneOn;
    vat.reference = b.vat_number || vat.reference || b.tin;
  } else if (vat.status === 'done') {
    vat.status = 'in_progress'; // VAT was switched off in Settings
  }
  const serviceNames = services.rows.map((r) => r.name);
  // Suggest what the business sells from its product list until the owner says.
  const sells = vat.details.sells || null;
  vat.suggestedSells = serviceNames.length ? 'both' : null;
  vat.serviceProducts = serviceNames;
  vat.salesLast12 = money(pace.sales);
  vat.salesSince = pace.since;
  vat.daysOfRecords = pace.days;
  vat.yearlyPace = money(pace.yearly);
  vat.threshold = money(VAT_GOODS_THRESHOLD);
  vat.tin = b.tin;
  Object.assign(vat, vatAdvice(sells, pace));
  return { bank, vat };
}

async function saveRegistration(db, businessId, kind, fields, userId) {
  const cols = Object.keys(fields);
  const vals = Object.values(fields);
  await db.query(
    `INSERT INTO registrations (business_id, kind, ${cols.join(', ')}, updated_by)
     VALUES ($1, $2, ${cols.map((_, i) => `$${i + 3}`).join(', ')}, $${cols.length + 3})
     ON CONFLICT (business_id, kind) DO UPDATE
       SET ${cols.map((c) => `${c} = EXCLUDED.${c}`).join(', ')}, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [businessId, kind, ...vals, userId]
  );
}

router.get('/registrations', canView, async (req, res) => {
  res.json(await loadAll(req.businessId));
});

const patchSchema = z.object({
  status: z.enum(['not_started', 'in_progress']).optional(),
  checklist: z.array(z.string().regex(/^[a-z0-9_]{1,40}$/)).max(30).optional(),
  sells: z.enum(['goods', 'services', 'both']).optional(),
  startedOn: isoDate.optional(),
});

// Start (or stop) working on a registration, tick documents, say what the business sells.
router.patch('/registrations/:kind', canManage, validate(patchSchema), async (req, res) => {
  const kind = req.params.kind;
  if (!KINDS.includes(kind)) throw new HttpError(404, 'Not found.');
  const v = req.valid.body;
  await withTransaction(async (db) => {
    const { rows } = await db.query('SELECT * FROM registrations WHERE business_id = $1 AND kind = $2 FOR UPDATE', [req.businessId, kind]);
    const cur = rows[0];
    if (cur?.status === 'done' && v.status) throw new HttpError(409, 'This is already done.');
    const fields = {};
    if (v.status) {
      fields.status = v.status;
      fields.started_on = v.status === 'in_progress' ? v.startedOn || cur?.started_on || todayInGhana() : null;
    }
    if (v.checklist) fields.checklist = JSON.stringify([...new Set(v.checklist)]);
    if (v.sells) fields.details = JSON.stringify({ ...(cur?.details || {}), sells: v.sells });
    if (Object.keys(fields).length) await saveRegistration(db, req.businessId, kind, fields, req.user.id);
  });
  res.json(await loadAll(req.businessId));
});

const bankDoneSchema = z.object({
  bankName: z.string().trim().min(2, 'Enter the name of the bank.').max(50),
  openingBalance: z.coerce.number().min(0).max(1e11).default(0),
  lastDigits: z.string().regex(/^\d{0,4}$/, 'Only the last 4 digits, please.').optional().nullable(),
});

// The account is open: add it as a place the business keeps money, from today.
router.post('/registrations/bank/done', canManage, validate(bankDoneSchema), async (req, res) => {
  const v = req.valid.body;
  const name = /\b(bank|account)\b/i.test(v.bankName) ? v.bankName : `${v.bankName} account`;
  const today = todayInGhana();
  await withTransaction(async (db) => {
    try {
      await db.query(
        `INSERT INTO payment_accounts (business_id, name, kind, provider, last_digits, opening_balance, opening_date)
         VALUES ($1, $2, 'bank', $3, $4, $5, $6)`,
        [req.businessId, name, v.bankName, v.lastDigits || null, v.openingBalance, today]
      );
    } catch (err) {
      if (err.code === '23505') throw new HttpError(409, 'You already have an account with that name.', { bankName: 'Already used.' });
      throw err;
    }
    await saveRegistration(db, req.businessId, 'bank',
      { status: 'done', done_on: today, reference: v.bankName }, req.user.id);
  });
  res.status(201).json(await loadAll(req.businessId));
});

const vatDoneSchema = z.object({
  vatNumber: z.string().trim().min(5, 'Enter the number on your VAT certificate.').max(20)
    .regex(/^[A-Za-z0-9-]+$/, 'Letters, numbers and dashes only.'),
  effectiveDate: isoDate,
});

// GRA has registered the business: invoices from now on add NHIL, GETFund and VAT.
router.post('/registrations/vat/done', canManage, validate(vatDoneSchema), async (req, res) => {
  const v = req.valid.body;
  const vatNumber = v.vatNumber.toUpperCase();
  await withTransaction(async (db) => {
    await db.query(
      `UPDATE businesses SET vat_registered = TRUE, vat_number = $2, vat_effective_date = $3,
              tin = COALESCE(NULLIF(tin, ''), $2), updated_at = now()
        WHERE id = $1`,
      [req.businessId, vatNumber, v.effectiveDate]
    );
    await saveRegistration(db, req.businessId, 'vat',
      { status: 'done', done_on: v.effectiveDate, reference: vatNumber }, req.user.id);
  });
  res.status(201).json(await loadAll(req.businessId));
});

module.exports = { router, VAT_GOODS_THRESHOLD };
