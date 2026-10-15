// The guide library. Mounted at /api/guides (login required).
// Guides are shown in the user's language when a version exists, otherwise English.
// Audio: one recording per guide per language, uploaded by platform admins.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { z } = require('zod');
const { query } = require('../db');
const config = require('../config');
const { HttpError, validate } = require('../http');

const router = express.Router();
const AUDIO_DIR = path.join(config.mediaDir, 'audio');
const MAX_AUDIO_BYTES = 20 * 1024 * 1024; // about 20 minutes of phone-quality speech
const LANGS = ['en', 'tw', 'ee', 'gaa', 'dag', 'ha'];

const GUIDE_SELECT = `
  SELECT ge.slug, ge.area_code, a.name AS area_name, a.sort_order AS area_order,
         COALESCE(gl.language_code, 'en') AS language_code,
         COALESCE(gl.title, ge.title) AS title, COALESCE(gl.summary, ge.summary) AS summary,
         COALESCE(gl.read_minutes, ge.read_minutes) AS read_minutes,
         COALESCE(gl.is_draft, ge.is_draft) AS is_draft,
         ge.tool_path, COALESCE(gl.tool_label, ge.tool_label) AS tool_label,
         COALESCE(gl.reviewed_at, ge.reviewed_at) AS reviewed_at,
         p.status AS progress,
         (SELECT json_agg(json_build_object('language', au.language_code, 'url', '/media/audio/' || au.file_name,
                                            'isDraft', au.is_draft)
                          ORDER BY (au.language_code = $1) DESC, au.language_code)
            FROM guide_audio au WHERE au.guide_slug = ge.slug) AS audio
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
    isDraft: g.is_draft,
    audio: g.audio || [],
    toolPath: g.tool_path,
    toolLabel: g.tool_label,
    reviewedAt: g.reviewed_at,
    progress: g.progress || null,
  };
}

function requireAdmin(req, res, next) {
  if (req.user.platform_role !== 'admin') return next(new HttpError(403, 'Only content admins can do this.'));
  next();
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
  const result = { ...publicGuide(g), progress: g.progress || 'started', body: body.rows[0].body_md };
  // The English original, so a reader of a draft translation can compare.
  if (req.query.original === '1' && g.language_code !== 'en') {
    const { rows: en } = await query(`SELECT title, body_md FROM guides WHERE slug = $1 AND language_code = 'en'`, [g.slug]);
    result.original = { title: en[0].title, body: en[0].body_md };
  }
  res.json({ guide: result });
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

// ---- Audio (content admins) -------------------------------------------------------

// Identify the format from the file's first bytes, not just what the browser claims.
function sniffAudio(buf) {
  const ascii = (start, end) => buf.subarray(start, end).toString('latin1');
  if (buf.length < 12) return null;
  if (ascii(0, 3) === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return { ext: 'mp3', mime: 'audio/mpeg' };
  if (ascii(4, 8) === 'ftyp') return { ext: 'm4a', mime: 'audio/mp4' };
  if (ascii(0, 4) === 'OggS') return { ext: 'ogg', mime: 'audio/ogg' };
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return { ext: 'webm', mime: 'audio/webm' };
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return { ext: 'wav', mime: 'audio/wav' };
  return null;
}

async function guideExists(slug) {
  const { rows } = await query(`SELECT 1 FROM guides WHERE slug = $1 AND language_code = 'en'`, [slug]);
  return !!rows[0];
}

// Body is the raw audio file. ?lang=tw  (&draft=0 once a reviewer has approved it)
router.put(
  '/:slug/audio',
  requireAdmin,
  express.raw({ type: () => true, limit: MAX_AUDIO_BYTES }),
  async (req, res) => {
    const lang = String(req.query.lang || '');
    if (!LANGS.includes(lang)) throw new HttpError(400, 'Choose a language for the recording.');
    if (!(await guideExists(req.params.slug))) throw new HttpError(404, 'Guide not found.');
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const kind = sniffAudio(buf);
    if (!kind) throw new HttpError(400, 'That file is not a supported audio format (MP3, M4A, OGG, WebM or WAV).');

    fs.mkdirSync(AUDIO_DIR, { recursive: true });
    const fileName = `${req.params.slug}-${lang}-${crypto.randomBytes(6).toString('hex')}.${kind.ext}`;
    fs.writeFileSync(path.join(AUDIO_DIR, fileName), buf);

    const { rows: old } = await query(
      'SELECT file_name FROM guide_audio WHERE guide_slug = $1 AND language_code = $2', [req.params.slug, lang]
    );
    await query(
      `INSERT INTO guide_audio (guide_slug, language_code, file_name, mime_type, size_bytes, is_draft, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (guide_slug, language_code) DO UPDATE SET file_name = EXCLUDED.file_name,
         mime_type = EXCLUDED.mime_type, size_bytes = EXCLUDED.size_bytes, is_draft = EXCLUDED.is_draft,
         uploaded_by = EXCLUDED.uploaded_by, created_at = now()`,
      [req.params.slug, lang, fileName, kind.mime, buf.length, req.query.draft !== '0', req.user.id]
    );
    // Remove the recording this one replaced.
    if (old[0]) fs.rm(path.join(AUDIO_DIR, old[0].file_name), { force: true }, () => {});
    res.status(201).json({ audio: { language: lang, url: `/media/audio/${fileName}`, isDraft: req.query.draft !== '0' } });
  }
);

// Mark a recording reviewed (or back to draft) without uploading again.
router.patch('/:slug/audio/:lang', requireAdmin, validate(z.object({ isDraft: z.boolean() })), async (req, res) => {
  const { rowCount } = await query(
    'UPDATE guide_audio SET is_draft = $3 WHERE guide_slug = $1 AND language_code = $2',
    [req.params.slug, req.params.lang, req.valid.body.isDraft]
  );
  if (!rowCount) throw new HttpError(404, 'No recording for that language.');
  res.status(204).end();
});

router.delete('/:slug/audio/:lang', requireAdmin, async (req, res) => {
  const { rows } = await query(
    'DELETE FROM guide_audio WHERE guide_slug = $1 AND language_code = $2 RETURNING file_name',
    [req.params.slug, req.params.lang]
  );
  if (!rows[0]) throw new HttpError(404, 'No recording for that language.');
  fs.rm(path.join(AUDIO_DIR, rows[0].file_name), { force: true }, () => {});
  res.status(204).end();
});

module.exports = { router, sniffAudio };
