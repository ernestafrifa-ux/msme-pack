// The MSME Pack admin: creates each business with its owner, sees every business, and
// resets passwords or switches off accounts. The admin does not see a business's records.
// Mounted at /api/admin.
const express = require('express');
const { z } = require('zod');
const { query, withTransaction } = require('../db');
const { requireAdmin } = require('../auth');
const { HttpError, validate } = require('../http');
const { personSchema, passwordField, findOrCreateUser, setTemporaryPassword, smsLoginDetails } = require('../users');
const { smsEnabled, sendSms, provider } = require('../sms');
const { createSchema, createBusiness, publicBusiness } = require('./businesses');

const router = express.Router();
router.use(requireAdmin);

router.get('/businesses', async (req, res) => {
  const { rows } = await query(
    `SELECT b.id, b.name, b.town, b.created_at, b.setup_done, b.logo_url, b.region_code, b.sector_code, b.share_with_programme,
            COALESCE((SELECT json_agg(g.id) FROM business_group_members gm JOIN business_groups g ON g.id = gm.group_id AND g.deleted_at IS NULL
                       WHERE gm.business_id = b.id), '[]') AS group_ids, s.name AS sector, r.name AS region,
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
      setupDone: b.setup_done, logoUrl: b.logo_url, regionCode: b.region_code, sectorCode: b.sector_code, people: b.people,
      sharing: b.share_with_programme, groupIds: b.group_ids, lastRecord: b.last_record, owners: b.owners,
    })),
  });
});

const createWithOwnerSchema = createSchema.extend({
  owner: personSchema,
  // false: leave today's balances for the owner to enter at first login.
  withMoney: z.boolean().default(false),
  groupIds: z.array(z.uuid()).max(20).optional(),
  sendSms: z.boolean().optional(),
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
    if (v.groupIds?.length) {
      await db.query(
        `INSERT INTO business_group_members (group_id, business_id)
         SELECT g.id, $2 FROM business_groups g WHERE g.id = ANY($1::uuid[]) AND g.deleted_at IS NULL`,
        [v.groupIds, biz.id]
      );
    }
    return { business: publicBusiness(biz, 'owner'), owner: { userId: found.user.id, fullName: found.user.full_name, isNew: found.isNew, phone: found.user.phone } };
  });
  if (v.sendSms && out.owner.isNew) {
    out.sms = await smsLoginDetails(req, { phone: out.owner.phone, password: v.owner.password, businessName: out.business.name, businessId: out.business.id })
      .then((r) => ({ sent: r.sent > 0 })).catch((err) => ({ sent: false, error: err.message }));
  }
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
  z.object({ type: z.literal('group'), groupIds: z.array(z.uuid()).min(1, 'Choose at least one group.') }),
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
  // An optional question with 2 to 6 answers to choose from, e.g. "Will you attend?" Yes / No.
  question: z.string().trim().max(200).optional().nullable(),
  options: z.array(z.string().trim().min(1).max(60)).max(6).optional().nullable(),
  // Also send a short text message (SMS) to each business's owner.
  sms: z.boolean().optional(),
}).refine((v) => !v.question || (v.options && v.options.length >= 2), { message: 'Give at least two answers to choose from.', path: ['options'] });

// Which businesses an audience means, right now.
function audienceQuery(a) {
  const base = 'SELECT id FROM businesses WHERE deleted_at IS NULL';
  if (a.type === 'all') return [base, []];
  if (a.type === 'region') return [`${base} AND region_code = ANY($1)`, [a.codes]];
  if (a.type === 'sector') return [`${base} AND sector_code = ANY($1)`, [a.codes]];
  if (a.type === 'group') {
    return [`${base} AND id IN (SELECT gm.business_id FROM business_group_members gm JOIN business_groups g ON g.id = gm.group_id
                                 WHERE g.id = ANY($1::uuid[]) AND g.deleted_at IS NULL)`, [a.groupIds]];
  }
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
      `INSERT INTO notices (title, body, link_url, audience, created_by, question, options) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [v.title, v.body, v.linkUrl || null, JSON.stringify(v.audience), req.user.id,
       v.question || null, v.question ? JSON.stringify(v.options) : null]
    );
    await db.query(
      `INSERT INTO notice_businesses (notice_id, business_id) SELECT $1, unnest($2::uuid[])`,
      [rows[0].id, targets.map((t) => t.id)]
    );
    return { id: rows[0].id, businesses: targets.length, targetIds: targets.map((t) => t.id) };
  });
  if (v.sms) {
    if (!smsEnabled()) throw new HttpError(409, 'The message was sent in the app, but SMS is not set up.');
    const { rows: owners } = await query(
      `SELECT m.business_id, u.phone FROM business_members m JOIN users u ON u.id = m.user_id AND u.is_active
        WHERE m.role = 'owner' AND m.business_id = ANY($1::uuid[])`,
      [out.targetIds]
    );
    const short = v.body.length > 240 ? `${v.body.slice(0, 237)}…` : v.body;
    const text = `MSME Pack: ${v.title}. ${short}${v.question ? ' Answer in the app.' : ''}`;
    let sent = 0; let failed = 0;
    for (const o of owners) {
      const r = await sendSms({ to: o.phone, text, purpose: 'notice', businessId: o.business_id, userId: req.user.id })
        .catch(() => ({ sent: 0, failed: 1 }));
      sent += r.sent; failed += r.failed;
    }
    out.sms = { sent, failed };
  }
  delete out.targetIds;
  res.status(201).json(out);
});

// Sent messages: how many businesses received each, and in how many someone has read it.
router.get('/notices', async (req, res) => {
  const { rows } = await query(
    `SELECT n.id, n.title, n.body, n.link_url, n.audience, n.created_at, n.deleted_at, n.question, n.options,
            (SELECT json_agg(json_build_object('option', a.option_index, 'n', a.n)) FROM
               (SELECT option_index, COUNT(*)::int AS n FROM notice_answers WHERE notice_id = n.id GROUP BY option_index) a) AS answers,
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
      question: n.question, options: n.options,
      answers: n.options ? n.options.map((o, i) => ({ option: o, count: (n.answers || []).find((x) => x.option === i)?.n || 0 })) : null,
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

// ---- Groups -------------------------------------------------------------------------

async function listGroups() {
  const { rows } = await query(
    `SELECT g.id, g.name, g.description, g.created_at,
            (SELECT COUNT(*)::int FROM business_group_members gm JOIN businesses b ON b.id = gm.business_id AND b.deleted_at IS NULL
              WHERE gm.group_id = g.id) AS businesses
       FROM business_groups g WHERE g.deleted_at IS NULL ORDER BY g.name`
  );
  return rows.map((g) => ({ id: g.id, name: g.name, description: g.description, businesses: g.businesses }));
}

router.get('/groups', async (req, res) => res.json({ groups: await listGroups() }));

const groupSchema = z.object({
  name: z.string().trim().min(2, 'Name the group, e.g. BizBox Kwahu West 2026.').max(80),
  description: z.string().trim().max(300).optional().nullable(),
  businessIds: z.array(z.uuid()).max(5000).optional(),
});

async function setGroupBusinesses(db, groupId, ids) {
  await db.query('DELETE FROM business_group_members WHERE group_id = $1', [groupId]);
  if (ids.length) {
    await db.query(
      `INSERT INTO business_group_members (group_id, business_id)
       SELECT $1, b.id FROM businesses b WHERE b.id = ANY($2::uuid[]) AND b.deleted_at IS NULL`,
      [groupId, ids]
    );
  }
}

router.post('/groups', validate(groupSchema), async (req, res) => {
  const v = req.valid.body;
  try {
    await withTransaction(async (db) => {
      const { rows } = await db.query(
        'INSERT INTO business_groups (name, description, created_by) VALUES ($1, $2, $3) RETURNING id',
        [v.name, v.description || null, req.user.id]
      );
      if (v.businessIds) await setGroupBusinesses(db, rows[0].id, v.businessIds);
    });
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, 'There is already a group with that name.', { name: 'Already used.' });
    throw err;
  }
  res.status(201).json({ groups: await listGroups() });
});

router.put('/groups/:groupId', validate(groupSchema), async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.groupId)) throw new HttpError(404, 'Group not found.');
  const v = req.valid.body;
  await withTransaction(async (db) => {
    const { rowCount } = await db.query(
      'UPDATE business_groups SET name = $2, description = $3 WHERE id = $1 AND deleted_at IS NULL',
      [req.params.groupId, v.name, v.description || null]
    );
    if (!rowCount) throw new HttpError(404, 'Group not found.');
    if (v.businessIds) await setGroupBusinesses(db, req.params.groupId, v.businessIds);
  });
  res.json({ groups: await listGroups() });
});

router.delete('/groups/:groupId', async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.groupId)) throw new HttpError(404, 'Group not found.');
  await query('UPDATE business_groups SET deleted_at = now() WHERE id = $1', [req.params.groupId]);
  res.json({ groups: await listGroups() });
});

// ---- Programme dashboard --------------------------------------------------------------
// Activity (records, last record) for every business in scope; money figures only for
// businesses whose owner chose to share them.

const dashSchema = z.object({
  groupId: z.uuid().optional(),
  regionCode: z.string().max(5).optional(),
  sectorCode: z.string().max(20).optional(),
  months: z.coerce.number().int().refine((m) => [1, 3, 6, 12].includes(m)).default(3),
});

router.get('/dashboard', validate(dashSchema, 'query'), async (req, res) => {
  const q = req.valid.query;
  const today = require('../dates').todayInGhana();
  const start = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
  start.setUTCMonth(start.getUTCMonth() - (q.months - 1));
  const from = start.toISOString().slice(0, 10);
  const where = ['b.deleted_at IS NULL'];
  const params = [from, today];
  if (q.groupId) { params.push(q.groupId); where.push(`b.id IN (SELECT business_id FROM business_group_members WHERE group_id = $${params.length})`); }
  if (q.regionCode) { params.push(q.regionCode); where.push(`b.region_code = $${params.length}`); }
  if (q.sectorCode) { params.push(q.sectorCode); where.push(`b.sector_code = $${params.length}`); }
  const { rows } = await query(
    `SELECT b.id, b.name, b.town, b.share_with_programme AS sharing, b.setup_done, r.name AS region, s.name AS sector,
            (SELECT COUNT(*)::int FROM transactions t WHERE t.business_id = b.id AND t.deleted_at IS NULL AND t.txn_date BETWEEN $1 AND $2) AS records,
            (SELECT COUNT(DISTINCT t.txn_date)::int FROM transactions t WHERE t.business_id = b.id AND t.deleted_at IS NULL AND t.txn_date BETWEEN $1 AND $2) AS days,
            (SELECT MAX(t.txn_date) FROM transactions t WHERE t.business_id = b.id AND t.deleted_at IS NULL) AS last_record,
            ms.sales, ms.profit, ms.first_half, ms.second_half,
            h.overall_score AS health
       FROM businesses b
       LEFT JOIN regions r ON r.code = b.region_code
       LEFT JOIN sectors s ON s.code = b.sector_code
       LEFT JOIN LATERAL (
         SELECT SUM(m.sales) AS sales, SUM(m.net_profit_estimate) AS profit,
                SUM(m.sales) FILTER (WHERE m.month < ($1::date + ($2::date - $1::date) / 2)) AS first_half,
                SUM(m.sales) FILTER (WHERE m.month >= ($1::date + ($2::date - $1::date) / 2)) AS second_half
           FROM v_monthly_summary m WHERE m.business_id = b.id AND m.month >= $1::date AND b.share_with_programme) ms ON TRUE
       LEFT JOIN v_latest_health h ON h.business_id = b.id AND b.share_with_programme
      WHERE ${where.join(' AND ')}
      ORDER BY b.name`,
    params
  );
  const monthly = await query(
    `SELECT to_char(date_trunc('month', t.txn_date), 'YYYY-MM') AS month, COUNT(*)::int AS records, COUNT(DISTINCT t.business_id)::int AS businesses
       FROM transactions t JOIN businesses b ON b.id = t.business_id
      WHERE t.deleted_at IS NULL AND t.txn_date BETWEEN $1 AND $2 AND ${where.join(' AND ')}
      GROUP BY 1 ORDER BY 1`,
    params
  );
  const recent = require('../dates').addDays(today, -30);
  const sharing = rows.filter((b) => b.sharing);
  const withSales = sharing.filter((b) => Number(b.sales || 0) > 0);
  const totalSales = sharing.reduce((s, b) => s + Number(b.sales || 0), 0);
  const growth = sharing.filter((b) => Number(b.first_half) > 0).map((b) => (Number(b.second_half || 0) - Number(b.first_half)) / Number(b.first_half));
  growth.sort((a, b) => a - b);
  const median = growth.length ? growth[Math.floor(growth.length / 2)] : null;
  const healthScores = sharing.filter((b) => b.health !== null).map((b) => Number(b.health));
  const m2 = (n) => (Math.round(Number(n || 0) * 100) / 100).toFixed(2);
  res.json({
    from, to: today, months: q.months,
    counts: {
      businesses: rows.length,
      setUp: rows.filter((b) => b.setup_done).length,
      active30: rows.filter((b) => b.last_record && b.last_record >= recent).length,
      sharing: sharing.length,
      records: rows.reduce((s, b) => s + b.records, 0),
    },
    monthly: monthly.rows,
    shared: {
      totalSales: m2(totalSales),
      averageSales: m2(sharing.length ? totalSales / sharing.length : 0),
      profitable: sharing.filter((b) => Number(b.profit || 0) > 0).length,
      withSales: withSales.length,
      medianGrowth: median === null ? null : Math.round(median * 1000) / 10,
      averageHealth: healthScores.length ? Math.round(healthScores.reduce((a, b) => a + b, 0) / healthScores.length) : null,
      healthCount: healthScores.length,
    },
    businesses: rows.map((b) => ({
      id: b.id, name: b.name, town: b.town, region: b.region, sector: b.sector, sharing: b.sharing, setupDone: b.setup_done,
      records: b.records, daysRecorded: b.days, lastRecord: b.last_record,
      sales: b.sharing ? m2(b.sales) : null, profit: b.sharing ? m2(b.profit) : null, health: b.sharing && b.health !== null ? Number(b.health) : null,
    })),
  });
});

// ---- SMS status ---------------------------------------------------------------------------

router.get('/sms', async (req, res) => {
  const { rows } = await query(
    `SELECT COUNT(*) FILTER (WHERE status = 'sent')::int AS sent, COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
       FROM sms_log WHERE created_at >= date_trunc('month', now())`
  );
  const recent = await query(
    `SELECT l.to_phone, l.purpose, l.status, l.error, l.created_at, b.name AS business
       FROM sms_log l LEFT JOIN businesses b ON b.id = l.business_id ORDER BY l.created_at DESC LIMIT 20`
  );
  res.json({ enabled: smsEnabled(), provider: provider() || null, thisMonth: rows[0],
    recent: recent.rows.map((r) => ({ to: r.to_phone, purpose: r.purpose, status: r.status, error: r.error, at: r.created_at, business: r.business })) });
});

module.exports = { router };
