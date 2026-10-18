// The MSME Pack admin: creates each business with its owner, sees every business, and
// resets passwords or switches off accounts. The admin does not see a business's records.
// Mounted at /api/admin.
const express = require('express');
const { z } = require('zod');
const { query, withTransaction } = require('../db');
const { requireAdmin } = require('../auth');
const { HttpError, validate } = require('../http');
const { personSchema, passwordField, findOrCreateUser, setTemporaryPassword } = require('../users');
const { createSchema, createBusiness, publicBusiness } = require('./businesses');

const router = express.Router();
router.use(requireAdmin);

router.get('/businesses', async (req, res) => {
  const { rows } = await query(
    `SELECT b.id, b.name, b.town, b.created_at, b.setup_done, s.name AS sector, r.name AS region,
            (SELECT COUNT(*)::int FROM business_members m WHERE m.business_id = b.id) AS people,
            (SELECT MAX(t.txn_date) FROM transactions t WHERE t.business_id = b.id AND t.deleted_at IS NULL) AS last_record,
            COALESCE((SELECT json_agg(json_build_object('userId', u.id, 'fullName', u.full_name, 'phone', u.phone,
                                                        'isActive', u.is_active, 'mustChangePassword', u.must_change_password,
                                                        'lastLoginAt', u.last_login_at) ORDER BY u.full_name)
                        FROM business_members m JOIN users u ON u.id = m.user_id
                       WHERE m.business_id = b.id AND m.role = 'owner'), '[]') AS owners
       FROM businesses b
       LEFT JOIN sectors s ON s.code = b.sector_code
       LEFT JOIN regions r ON r.code = b.region_code
      WHERE b.deleted_at IS NULL
      ORDER BY b.created_at DESC`
  );
  res.json({
    businesses: rows.map((b) => ({
      id: b.id, name: b.name, town: b.town, sector: b.sector, region: b.region, createdAt: b.created_at,
      setupDone: b.setup_done, people: b.people, lastRecord: b.last_record, owners: b.owners,
    })),
  });
});

const createWithOwnerSchema = createSchema.extend({
  owner: personSchema,
  // false: leave today's balances for the owner to enter at first login.
  withMoney: z.boolean().default(false),
});

router.post('/businesses', validate(createWithOwnerSchema), async (req, res) => {
  const v = req.valid.body;
  const out = await withTransaction(async (db) => {
    let found;
    try {
      found = await findOrCreateUser(db, v.owner, req.user.id);
    } catch (err) {
      if (err.needsPassword) throw new HttpError(400, 'Give the owner a temporary password.', { 'owner.password': 'Needed for a new person.' });
      throw err;
    }
    if (!found.user.is_active) throw new HttpError(409, 'This phone number belongs to an account that is switched off. Switch it on first.');
    const biz = await createBusiness(db, v, { ownerId: found.user.id, ownerPhone: found.user.phone, createdBy: req.user.id, withMoney: v.withMoney });
    return { business: publicBusiness(biz, 'owner'), owner: { userId: found.user.id, fullName: found.user.full_name, isNew: found.isNew } };
  });
  res.status(201).json(out);
});

async function loadUser(req) {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.userId)) throw new HttpError(404, 'Person not found.');
  if (req.params.userId === req.user.id) throw new HttpError(409, 'Change your own account from Settings.');
  const { rows } = await query('SELECT id, platform_role FROM users WHERE id = $1', [req.params.userId]);
  if (!rows[0]) throw new HttpError(404, 'Person not found.');
  return rows[0];
}

router.post('/users/:userId/reset-password', validate(z.object({ password: passwordField })), async (req, res) => {
  await loadUser(req);
  await withTransaction((db) => setTemporaryPassword(db, req.params.userId, req.valid.body.password));
  res.json({ ok: true });
});

// Switch an account off (it can no longer log in) or back on.
router.patch('/users/:userId', validate(z.object({ isActive: z.boolean() })), async (req, res) => {
  await loadUser(req);
  await query('UPDATE users SET is_active = $2, updated_at = now() WHERE id = $1', [req.params.userId, req.valid.body.isActive]);
  res.json({ ok: true });
});

module.exports = { router };
