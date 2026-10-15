const express = require('express');
const { z } = require('zod');
const { query, withTransaction } = require('../db');
const { requireMember } = require('../auth');
const { validate } = require('../http');
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
});

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

// Create a business, make the current user its owner, and set up the
// places money is kept (cash box, and MoMo if they use it).
router.post('/', validate(createSchema), async (req, res) => {
  const b = req.valid.body;
  const today = todayInGhana();
  const business = await withTransaction(async (db) => {
    const { rows } = await db.query(
      `INSERT INTO businesses (name, sector_code, region_code, town, legal_form, size_tier, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [b.name, b.sectorCode || null, b.regionCode || null, b.town || null,
       b.legalForm, b.sizeTier, req.user.id]
    );
    const biz = rows[0];
    await db.query(
      `INSERT INTO business_members (business_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [biz.id, req.user.id]
    );
    await db.query(
      `INSERT INTO payment_accounts (business_id, name, kind, opening_balance, opening_date, is_default)
       VALUES ($1, 'Cash box', 'cash', $2, $3, TRUE)`,
      [biz.id, b.cashOpeningBalance, today]
    );
    if (b.momo) {
      await db.query(
        `INSERT INTO payment_accounts (business_id, name, kind, provider, opening_balance, opening_date)
         VALUES ($1, $2, 'mobile_money', $3, $4, $5)`,
        [biz.id, `${b.momo.provider} MoMo`, b.momo.provider, b.momo.openingBalance, today]
      );
    }
    await db.query(
      `INSERT INTO audit_log (business_id, user_id, action, entity, entity_id)
       VALUES ($1, $2, 'create', 'business', $1)`,
      [biz.id, req.user.id]
    );
    return biz;
  });
  res.status(201).json({ business: publicBusiness(business, 'owner') });
});

router.get('/:businessId', requireMember(), async (req, res) => {
  const { rows } = await query('SELECT * FROM businesses WHERE id = $1', [req.businessId]);
  res.json({ business: publicBusiness(rows[0], req.memberRole) });
});

// Everything under /api/businesses/:businessId/… (accounts, transactions, dashboard).
router.use('/:businessId', require('./cashbook').router);

module.exports = { router };
