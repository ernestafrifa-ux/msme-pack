// The people who use one business: the owner adds managers, staff and advisors, changes
// their role, resets their password and removes them. Mounted at /api/businesses/:businessId.
const express = require('express');
const { z } = require('zod');
const { query, withTransaction } = require('../db');
const { requireMember } = require('../auth');
const { HttpError, validate } = require('../http');
const { personSchema, passwordField, findOrCreateUser, setTemporaryPassword, smsLoginDetails } = require('../users');

const router = express.Router({ mergeParams: true });
const ownerOnly = requireMember(['owner']);
const ROLES = ['manager', 'staff', 'advisor'];

function publicMember(m) {
  return {
    userId: m.user_id,
    fullName: m.full_name,
    phone: m.phone,
    role: m.role,
    isActive: m.is_active,
    mustChangePassword: m.must_change_password,
    lastLoginAt: m.last_login_at,
    addedAt: m.created_at,
  };
}

async function listMembers(businessId) {
  const { rows } = await query(
    `SELECT m.user_id, m.role, m.created_at, u.full_name, u.phone, u.is_active, u.must_change_password, u.last_login_at
       FROM business_members m JOIN users u ON u.id = m.user_id
      WHERE m.business_id = $1
      ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 WHEN 'staff' THEN 2 ELSE 3 END, u.full_name`,
    [businessId]
  );
  return rows.map(publicMember);
}

// Everyone in the business can see who else uses it.
router.get('/members', requireMember(), async (req, res) => {
  res.json({ members: await listMembers(req.businessId) });
});

const addSchema = personSchema.extend({ role: z.enum(ROLES), sendSms: z.boolean().optional() });

router.post('/members', ownerOnly, validate(addSchema), async (req, res) => {
  const v = req.valid.body;
  const result = await withTransaction(async (db) => {
    let found;
    try {
      found = await findOrCreateUser(db, v, req.user.id);
    } catch (err) {
      if (err.needsPassword) throw new HttpError(400, 'Give them a temporary password.', { password: 'Needed for a new person.' });
      throw err;
    }
    const { user, isNew } = found;
    if (!user.is_active) throw new HttpError(409, 'This phone number belongs to an account that has been switched off. Ask the MSME Pack admin.');
    const exists = await db.query('SELECT 1 FROM business_members WHERE business_id = $1 AND user_id = $2', [req.businessId, user.id]);
    if (exists.rows[0]) throw new HttpError(409, 'This person is already part of the business.', { phone: 'Already added.' });
    await db.query(
      'INSERT INTO business_members (business_id, user_id, role, invited_by) VALUES ($1, $2, $3, $4)',
      [req.businessId, user.id, v.role, req.user.id]
    );
    await db.query(
      `INSERT INTO audit_log (business_id, user_id, action, entity, entity_id, changes)
       VALUES ($1, $2, 'create', 'member', $3, $4)`,
      [req.businessId, req.user.id, user.id, JSON.stringify({ role: v.role, newAccount: isNew })]
    );
    return { isNew, name: user.full_name, phone: user.phone };
  });
  let sms = null;
  if (v.sendSms && result.isNew) {
    const { rows } = await query('SELECT name FROM businesses WHERE id = $1', [req.businessId]);
    sms = await smsLoginDetails(req, { phone: result.phone, password: v.password, businessName: rows[0].name, businessId: req.businessId })
      .then((r) => ({ sent: r.sent > 0 })).catch((err) => ({ sent: false, error: err.message }));
  }
  res.status(201).json({ ...result, sms, members: await listMembers(req.businessId) });
});

// The person must belong to this business, and must not be the owner making the change.
async function loadMember(db, req) {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.userId)) throw new HttpError(404, 'Person not found.');
  const { rows } = await db.query(
    `SELECT m.role, u.platform_role FROM business_members m JOIN users u ON u.id = m.user_id
      WHERE m.business_id = $1 AND m.user_id = $2`,
    [req.businessId, req.params.userId]
  );
  if (!rows[0]) throw new HttpError(404, 'Person not found.');
  if (req.params.userId === req.user.id) throw new HttpError(409, 'You cannot change your own access here.');
  if (rows[0].role === 'owner') throw new HttpError(409, 'Another owner can only be changed by the MSME Pack admin.');
  return rows[0];
}

router.patch('/members/:userId', ownerOnly, validate(z.object({ role: z.enum(ROLES) })), async (req, res) => {
  await withTransaction(async (db) => {
    await loadMember(db, req);
    await db.query('UPDATE business_members SET role = $3 WHERE business_id = $1 AND user_id = $2',
      [req.businessId, req.params.userId, req.valid.body.role]);
  });
  res.json({ members: await listMembers(req.businessId) });
});

router.delete('/members/:userId', ownerOnly, async (req, res) => {
  await withTransaction(async (db) => {
    await loadMember(db, req);
    await db.query('DELETE FROM business_members WHERE business_id = $1 AND user_id = $2', [req.businessId, req.params.userId]);
    await db.query(
      `INSERT INTO audit_log (business_id, user_id, action, entity, entity_id) VALUES ($1, $2, 'delete', 'member', $3)`,
      [req.businessId, req.user.id, req.params.userId]
    );
  });
  res.json({ members: await listMembers(req.businessId) });
});

// A forgotten password: the owner gives a new temporary one. Only for people who use this
// business alone, so an owner can never take over an account used elsewhere.
router.post('/members/:userId/reset-password', ownerOnly, validate(z.object({ password: passwordField })), async (req, res) => {
  await withTransaction(async (db) => {
    const m = await loadMember(db, req);
    if (m.platform_role !== 'user') throw new HttpError(409, 'Ask the MSME Pack admin to reset this password.');
    const { rows } = await db.query(
      'SELECT COUNT(*)::int AS n FROM business_members WHERE user_id = $1 AND business_id <> $2', [req.params.userId, req.businessId]
    );
    if (rows[0].n > 0) throw new HttpError(409, 'This person also uses another business. Ask the MSME Pack admin to reset the password.');
    await setTemporaryPassword(db, req.params.userId, req.valid.body.password);
  });
  res.json({ members: await listMembers(req.businessId) });
});

module.exports = { router };
