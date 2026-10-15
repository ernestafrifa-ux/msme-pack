// The guide library. Mounted at /api/guides (login required).
// Guides are shown in the user's language when a version exists, otherwise English.
const express = require('express');
const { z } = require('zod');
const { query } = require('../db');
const { HttpError, validate } = require('../http');

const router = express.Router();

const GUIDE_SELECT = `
  SELECT ge.slug, ge.area_code, a.name AS area_name, a.sort_order AS area_order,
         COALESCE(gl.language_code, 'en') AS language_code,
         COALESCE(gl.title, ge.title) AS title, COALESCE(gl.summary, ge.summary) AS summary,
         COALESCE(gl.read_minutes, ge.read_minutes) AS read_minutes,
         COALESCE(gl.audio_url, ge.audio_url) AS audio_url,
         ge.tool_path, COALESCE(gl.tool_label, ge.tool_label) AS tool_label,
         COALESCE(gl.reviewed_at, ge.reviewed_at) AS reviewed_at,
         p.status AS progress
    FROM guides ge
    JOIN hc_areas a ON a.code = ge.area_code
    LEFT JOIN guides gl ON gl.slug = ge.slug AND gl.language_code = $1 AND gl.is_published AND $1 <> 'en'
    LEFT JOIN guide_progress p ON p.guide_id = ge.id AND p.user_id = $2
   WHERE ge.language_code = 'en' AND ge.is_published`;

function publicGuide(g) {
  return {
    slug: g.slug,
    title: g.title,
    summary: g.summary,
    areaCode: g.area_code,
    areaName: g.area_name,
    readMinutes: g.read_minutes,
    language: g.language_code,
    audioUrl: g.audio_url,
    toolPath: g.tool_path,
    toolLabel: g.tool_label,
    reviewedAt: g.reviewed_at,
    progress: g.progress || null,
  };
}

router.get('/', async (req, res) => {
  const { rows } = await query(`${GUIDE_SELECT} ORDER BY a.sort_order, ge.title`, [req.user.preferred_language, req.user.id]);
  res.json({ guides: rows.map(publicGuide) });
});

router.get('/:slug', async (req, res) => {
  const { rows } = await query(`${GUIDE_SELECT} AND ge.slug = $3`, [req.user.preferred_language, req.user.id, req.params.slug]);
  if (!rows[0]) throw new HttpError(404, 'Guide not found.');
  const g = rows[0];
  const body = await query(
    `SELECT COALESCE(gl.body_md, ge.body_md) AS body_md, ge.id
       FROM guides ge
       LEFT JOIN guides gl ON gl.slug = ge.slug AND gl.language_code = $2 AND gl.is_published AND $2 <> 'en'
      WHERE ge.slug = $1 AND ge.language_code = 'en'`,
    [g.slug, req.user.preferred_language]
  );
  // Opening a guide marks it started (never downgrades "completed").
  await query(
    `INSERT INTO guide_progress (user_id, guide_id, status) VALUES ($1, $2, 'started')
     ON CONFLICT (user_id, guide_id) DO UPDATE SET updated_at = now()`,
    [req.user.id, body.rows[0].id]
  );
  res.json({ guide: { ...publicGuide(g), progress: g.progress || 'started', body: body.rows[0].body_md } });
});

const completeSchema = z.object({ done: z.boolean().default(true) });

// Mark read (or unread). Also ticks it off the recommendations of the user's businesses.
router.post('/:slug/complete', validate(completeSchema), async (req, res) => {
  const { rows } = await query(`SELECT id FROM guides WHERE slug = $1 AND language_code = 'en'`, [req.params.slug]);
  if (!rows[0]) throw new HttpError(404, 'Guide not found.');
  const done = req.valid.body.done;
  await query(
    `INSERT INTO guide_progress (user_id, guide_id, status) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, guide_id) DO UPDATE SET status = EXCLUDED.status, updated_at = now()`,
    [req.user.id, rows[0].id, done ? 'completed' : 'started']
  );
  await query(
    `UPDATE recommendations r SET status = $3, updated_at = now()
       FROM business_members m
      WHERE m.business_id = r.business_id AND m.user_id = $1 AND m.role IN ('owner','manager')
        AND r.guide_slug = $2 AND r.status <> 'dismissed'`,
    [req.user.id, req.params.slug, done ? 'done' : 'open']
  );
  res.json({ progress: done ? 'completed' : 'started' });
});

module.exports = { router };
