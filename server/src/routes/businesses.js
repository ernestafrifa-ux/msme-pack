const express = require('express');
const { z } = require('zod');
const { query, withTransaction } = require('../db');
const { requireMember } = require('../auth');
const { HttpError, validate } = require('../http');
const { normaliseGhanaPhone } = require('../phone');
const { todayInGhana } = require('../dates');

const router = express.Router();

const money = z.coerce
  .number()
  .min(0, 'Cannot be negative.')
  .max(1e11, 'Amount is too large.')
  .transform((n) => Math.round(n * 100) / 100);

const createSchema = z.object({
  name: z.string().trim().min(2, 'Enter the business name.').max(150),
  sectorCode: z.string().max(20).optional().nullable(),
  regionCode: z.string().max(5).optional().nullable(),
  town: z.string().trim().max(100).optional().nullable(),
  legalForm: z
    .enum(['unregistered', 'sole_proprietorship', 'partnership', 'company_ltd_shares',
           'company_ltd_guarantee', 'cooperative'])
    .default('unregistered'),
  sizeTier: z.enum(['micro', 'small', 'medium']).default('micro'),
  cashOpeningBalance: money.default(0),
  momo: z
    .object({
      provider: z.enum(['MTN', 'Telecel', 'AT']),
      openingBalance: money.default(0),
    })
    .optional()
    .nullable(),
  bank: z
    .object({
      name: z.string().trim().min(2, 'Enter the bank name.').max(50),
      openingBalance: money.default(0),
    })
    .optional()
    .nullable(),
});

// "GCB" -> "GCB account"; "Ecobank" -> "Ecobank account"; "GCB Bank" stays "GCB Bank".
function bankAccountName(name) {
  return /\b(bank|account)\b/i.test(name) ? name : `${name} account`;
}

function publicBusiness(b, role) {
  return {
    id: b.id,
    name: b.name,
    sectorCode: b.sector_code,
    regionCode: b.region_code,
    town: b.town,
    legalForm: b.legal_form,
    sizeTier: b.size_tier,
    currency: b.currency,
    phone: b.phone,
    email: b.email,
    digitalAddress: b.digital_address,
    vatRegistered: b.vat_registered,
    setupDone: b.setup_done,
    vatNumber: b.vat_number,
    vatEffectiveDate: b.vat_effective_date,
    tin: b.tin,
    invoicePrefix: b.invoice_prefix,
    role,
  };
}

// Lookup lists for the setup form.
router.get('/lookups', async (req, res) => {
  const [regions, sectors, languages] = await Promise.all([
    query('SELECT code, name FROM regions ORDER BY name'),
    query(`SELECT code, name FROM sectors ORDER BY (code = 'OTHER'), name`),
    query('SELECT code, name FROM languages ORDER BY name'),
  ]);
  res.json({ regions: regions.rows, sectors: sectors.rows, languages: languages.rows });
});

// Only the admin creates businesses (see routes/admin.js).
router.post('/', (req, res) => {
  throw new HttpError(403, 'Businesses are set up by the MSME Pack admin.');
});

// Inserts the places money is kept: the cash box, and MoMo and a bank account if used.
async function addMoneyAccounts(db, businessId, b, today) {
  await db.query(
    `INSERT INTO payment_accounts (business_id, name, kind, opening_balance, opening_date, is_default)
     VALUES ($1, 'Cash box', 'cash', $2, $3, TRUE)`,
    [businessId, b.cashOpeningBalance || 0, today]
  );
  if (b.momo) {
    await db.query(
      `INSERT INTO payment_accounts (business_id, name, kind, provider, opening_balance, opening_date)
       VALUES ($1, $2, 'mobile_money', $3, $4, $5)`,
      [businessId, `${b.momo.provider} MoMo`, b.momo.provider, b.momo.openingBalance, today]
    );
  }
  if (b.bank) {
    await db.query(
      `INSERT INTO payment_accounts (business_id, name, kind, provider, opening_balance, opening_date)
       VALUES ($1, $2, 'bank', $3, $4, $5)`,
      [businessId, bankAccountName(b.bank.name), b.bank.name, b.bank.openingBalance, today]
    );
  }
}

// Creates a business with `ownerId` as its owner. With `withMoney`, today's balances are set
// now; otherwise the owner enters them at first login.
async function createBusiness(db, b, { ownerId, ownerPhone, createdBy, withMoney }) {
  const { rows } = await db.query(
    `INSERT INTO businesses (name, sector_code, region_code, town, legal_form, size_tier, phone, created_by, setup_done)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [b.name, b.sectorCode || null, b.regionCode || null, b.town || null,
     b.legalForm, b.sizeTier, ownerPhone, createdBy, !!withMoney]
  );
  const biz = rows[0];
  await db.query(
    `INSERT INTO business_members (business_id, user_id, role, invited_by) VALUES ($1, $2, 'owner', $3)`,
    [biz.id, ownerId, createdBy]
  );
  if (withMoney) await addMoneyAccounts(db, biz.id, b, todayInGhana());
  await db.query(
    `INSERT INTO audit_log (business_id, user_id, action, entity, entity_id)
     VALUES ($1, $2, 'create', 'business', $1)`,
    [biz.id, createdBy]
  );
  return biz;
}

const setupSchema = createSchema.pick({ cashOpeningBalance: true, momo: true, bank: true });

// The owner's first step on a business the admin created: where money is kept today.
router.post('/:businessId/setup', requireMember(['owner']), validate(setupSchema), async (req, res) => {
  const v = req.valid.body;
  const biz = await withTransaction(async (db) => {
    const { rows } = await db.query('SELECT * FROM businesses WHERE id = $1 FOR UPDATE', [req.businessId]);
    if (rows[0].setup_done) throw new HttpError(409, 'This business is already set up.');
    await addMoneyAccounts(db, req.businessId, v, todayInGhana());
    const u = await db.query('UPDATE businesses SET setup_done = TRUE, updated_at = now() WHERE id = $1 RETURNING *', [req.businessId]);
    return u.rows[0];
  });
  res.json({ business: publicBusiness(biz, req.memberRole) });
});

router.get('/:businessId', requireMember(), async (req, res) => {
  const { rows } = await query('SELECT * FROM businesses WHERE id = $1', [req.businessId]);
  res.json({ business: publicBusiness(rows[0], req.memberRole) });
});

const settingsSchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  phone: z.string().trim().max(30).optional().nullable(),
  email: z.union([z.email('Enter a valid email.'), z.literal('')]).optional().nullable(),
  town: z.string().trim().max(100).optional().nullable(),
  digitalAddress: z.string().trim().max(20).optional().nullable(),
  tin: z.string().trim().max(20).optional().nullable(),
  invoicePrefix: z.string().trim().regex(/^[A-Za-z0-9]{1,8}$/, 'Letters and numbers only, up to 8.').optional(),
  vatRegistered: z.boolean().optional(),
});

// Business details shown on invoices (owner and manager).
router.patch('/:businessId', requireMember(['owner', 'manager']), validate(settingsSchema), async (req, res) => {
  const v = req.valid.body;
  if (v.phone) {
    const p = normaliseGhanaPhone(v.phone);
    if (!p) throw new HttpError(400, 'Please check the highlighted fields.', { phone: 'Enter a valid Ghana phone number.' });
    v.phone = p;
  }
  const cols = { name: v.name, phone: v.phone, email: v.email, town: v.town,
    digital_address: v.digitalAddress, tin: v.tin, invoice_prefix: v.invoicePrefix?.toUpperCase(), vat_registered: v.vatRegistered };
  const sets = [];
  const params = [req.businessId];
  for (const [col, val] of Object.entries(cols)) {
    if (val === undefined) continue;
    params.push(val === '' ? null : val);
    sets.push(`${col} = $${params.length}`);
  }
  if (sets.length) await query(`UPDATE businesses SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, params);
  const { rows } = await query('SELECT * FROM businesses WHERE id = $1', [req.businessId]);
  res.json({ business: publicBusiness(rows[0], req.memberRole) });
});

// Everything under /api/businesses/:businessId/… (accounts, transactions, stock, invoices, dashboard).
router.use('/:businessId', require('./cashbook').router);
router.use('/:businessId', require('./stock').router);
router.use('/:businessId', require('./invoices').router);
router.use('/:businessId', require('./health').router);
router.use('/:businessId', require('./reports').router);
router.use('/:businessId', require('./loans').router);
router.use('/:businessId', require('./tax').router);
router.use('/:businessId', require('./registrations').router);
router.use('/:businessId', require('./members').router);

module.exports = { router, createSchema, createBusiness, publicBusiness };
