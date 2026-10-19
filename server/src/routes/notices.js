// Messages from the MSME Pack admin, as the people in a business see them.
// Mounted at /api/businesses/:businessId.
const express = require('express');
const { query } = require('../db');
const { requireMember } = require('../auth');
const { HttpError } = require('../http');

const router = express.Router({ mergeParams: true });

function publicNotice(n) {
  return {
    id: n.id, title: n.title, body: n.body, linkUrl: n.link_url, sentAt: n.created_at, read: !!n.read_at,
    question: n.question, options: n.options, answer: n.option_index ?? null,
  };
}

async function unreadCount(businessId, userId) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS n FROM notices n
       JOIN notice_businesses nb ON nb.notice_id = n.id AND nb.business_id = $1
       LEFT JOIN notice_reads r ON r.notice_id = n.id AND r.user_id = $2
      WHERE n.deleted_at IS NULL AND r.notice_id IS NULL`,
    [businessId, userId]
  );
  return rows[0].n;
}

router.get('/notices', requireMember(), async (req, res) => {
  const { rows } = await query(
    `SELECT n.*, r.read_at, a.option_index FROM notices n
       JOIN notice_businesses nb ON nb.notice_id = n.id AND nb.business_id = $1
       LEFT JOIN notice_reads r ON r.notice_id = n.id AND r.user_id = $2
       LEFT JOIN notice_answers a ON a.notice_id = n.id AND a.business_id = $1
      WHERE n.deleted_at IS NULL
      ORDER BY n.created_at DESC LIMIT 50`,
    [req.businessId, req.user.id]
  );
  res.json({ notices: rows.map(publicNotice), unread: rows.filter((n) => !n.read_at).length });
});

// Mark one message (or, without an id, all of them) as read by this person.
router.post(['/notices/read', '/notices/:noticeId/read'], requireMember(), async (req, res) => {
  const one = req.params.noticeId;
  if (one && !/^[0-9a-f-]{36}$/i.test(one)) throw new HttpError(404, 'Message not found.');
  await query(
    `INSERT INTO notice_reads (notice_id, user_id)
     SELECT n.id, $2 FROM notices n JOIN notice_businesses nb ON nb.notice_id = n.id AND nb.business_id = $1
      WHERE n.deleted_at IS NULL AND ($3::uuid IS NULL OR n.id = $3::uuid)
     ON CONFLICT DO NOTHING`,
    [req.businessId, req.user.id, one || null]
  );
  res.json({ unread: await unreadCount(req.businessId, req.user.id) });
});

// Answer the question on a message, for the business (anyone in it can change the answer).
router.post('/notices/:noticeId/answer', requireMember(),
  require('../http').validate(require('zod').z.object({ option: require('zod').z.number().int().min(0).max(9) })),
  async (req, res) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.noticeId)) throw new HttpError(404, 'Message not found.');
    const { rows } = await query(
      `SELECT n.options FROM notices n JOIN notice_businesses nb ON nb.notice_id = n.id AND nb.business_id = $2
        WHERE n.id = $1 AND n.deleted_at IS NULL`,
      [req.params.noticeId, req.businessId]
    );
    if (!rows[0]) throw new HttpError(404, 'Message not found.');
    if (!rows[0].options || req.valid.body.option >= rows[0].options.length) throw new HttpError(400, 'Choose one of the answers.');
    await query(
      `INSERT INTO notice_answers (notice_id, business_id, user_id, option_index) VALUES ($1, $2, $3, $4)
       ON CONFLICT (notice_id, business_id) DO UPDATE SET option_index = EXCLUDED.option_index, user_id = EXCLUDED.user_id, answered_at = now()`,
      [req.params.noticeId, req.businessId, req.user.id, req.valid.body.option]
    );
    res.json({ answer: req.valid.body.option });
  });

module.exports = { router, unreadCount };
