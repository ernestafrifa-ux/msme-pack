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
    `SELECT b.id, b.name, b.town, b.created_at, b.setup_done, b.logo_url, b.region_code, b.sector_code, s.name AS sector, r.name AS region,
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
      setupDone: b.setup_done, logoUrl: b.logo_url, regionCode: b.region_code, sectorCode: b.sector_code, people: b.people, lastRecord: b.last_record, owners: b.owners,
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

// ---- Messages to businesses -------------------------------------------------------

const audienceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('all') }),
  z.object({ type: z.literal('region'), codes: z.array(z.string().max(5)).min(1, 'Choose at least one region.') }),
  z.object({ type: z.literal('sector'), codes: z.array(z.string().max(20)).min(1, 'Choose at least one sector.') }),
  z.object({ type: z.literal('selected'), businessIds: z.array(z.uuid()).min(1, 'Choose at least one business.') }),
]);

const noticeSchema = z.object({
  title: z.string().trim().min(3, 'Give the message a short title.').max(120),
  body: z.string().trim().min(3, 'Write the message.').max(2000),
  // An app page such as /learn/tax-basics, or a web link starting https://
  linkUrl: z.union([
    z.string().trim().regex(/^\/[A-Za-z0-9/_\-?=&.#]*$/, 'Use an app page like /learn/tax-basics or a link starting https://'),
    z.url({ protocol: /^https$/, message: 'Use an app page like /learn/tax-basics or a link starting https://' }),
    z.literal(''),
  ]).optional().nullable(),
  audience: audienceSchema,
});

// Which businesses an audience means, right now.
function audienceQuery(a) {
  const base = 'SELECT id FROM businesses WHERE deleted_at IS NULL';
  if (a.type === 'all') return [base, []];
  if (a.type === 'region') return [`${base} AND region_code = ANY($1)`, [a.codes]];
  if (a.type === 'sector') return [`${base} AND sector_code = ANY($1)`, [a.codes]];
  return [`${base} AND id = ANY($1::uuid[])`, [a.businessIds]];
}

// How many businesses (and people) a message would reach, before sending.
router.post('/notices/preview', validate(z.object({ audience: audienceSchema })), async (req, res) => {
  const [sql, params] = audienceQuery(req.valid.body.audience);
  const { rows } = await query(
    `SELECT COUNT(DISTINCT b.id)::int AS businesses, COUNT(DISTINCT m.user_id)::int AS people
       FROM (${sql}) b LEFT JOIN business_members m ON m.business_id = b.id`,
    params
  );
  res.json(rows[0]);
});

router.post('/notices', validate(noticeSchema), async (req, res) => {
  const v = req.valid.body;
  const out = await withTransaction(async (db) => {
    const [sql, params] = audienceQuery(v.audience);
    const targets = (await db.query(sql, params)).rows;
    if (!targets.length) throw new HttpError(400, 'No business matches who you chose to send to.');
    const { rows } = await db.query(
      `INSERT INTO notices (title, body, link_url, audience, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [v.title, v.body, v.linkUrl || null, JSON.stringify(v.audience), req.user.id]
    );
    await db.query(
      `INSERT INTO notice_businesses (notice_id, business_id) SELECT $1, unnest($2::uuid[])`,
      [rows[0].id, targets.map((t) => t.id)]
    );
    return { id: rows[0].id, businesses: targets.length };
  });
  res.status(201).json(out);
});

// Sent messages: how many businesses received each, and in how many someone has read it.
router.get('/notices', async (req, res) => {
  const { rows } = await query(
    `SELECT n.id, n.title, n.body, n.link_url, n.audience, n.created_at, n.deleted_at,
            (SELECT COUNT(*)::int FROM notice_businesses nb WHERE nb.notice_id = n.id) AS businesses,
            (SELECT COUNT(DISTINCT nb.business_id)::int FROM notice_businesses nb
               JOIN business_members m ON m.business_id = nb.business_id
               JOIN notice_reads r ON r.notice_id = n.id AND r.user_id = m.user_id
              WHERE nb.notice_id = n.id) AS read_by
       FROM notices n ORDER BY n.created_at DESC LIMIT 100`
  );
  res.json({
    notices: rows.map((n) => ({
      id: n.id, title: n.title, body: n.body, linkUrl: n.link_url, audience: n.audience, sentAt: n.created_at,
      withdrawn: !!n.deleted_at, businesses: n.businesses, readBy: n.read_by,
    })),
  });
});

// Withdraw a message: it disappears for the businesses.
router.delete('/notices/:noticeId', async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.noticeId)) throw new HttpError(404, 'Message not found.');
  const { rowCount } = await query('UPDATE notices SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL', [req.params.noticeId]);
  if (!rowCount) throw new HttpError(404, 'Message not found.');
  res.status(204).end();
});

module.exports = { router };
