// Messages from the MSME Pack admin, as the people in a business see them.
// Mounted at /api/businesses/:businessId.
const express = require('express');
const { query } = require('../db');
const { requireMember } = require('../auth');
const { HttpError } = require('../http');

const router = express.Router({ mergeParams: true });

function publicNotice(n) {
  return { id: n.id, title: n.title, body: n.body, linkUrl: n.link_url, sentAt: n.created_at, read: !!n.read_at };
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
    `SELECT n.*, r.read_at FROM notices n
       JOIN notice_businesses nb ON nb.notice_id = n.id AND nb.business_id = $1
       LEFT JOIN notice_reads r ON r.notice_id = n.id AND r.user_id = $2
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

module.exports = { router, unreadCount };
