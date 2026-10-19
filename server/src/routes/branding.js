// The business's logo, shown on Home, invoices and statements. Mounted at /api/businesses/:businessId.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const config = require('../config');
const { query } = require('../db');
const { requireMember } = require('../auth');
const { HttpError } = require('../http');

const router = express.Router({ mergeParams: true });
const LOGO_DIR = path.join(config.mediaDir, 'logos');
const MAX_LOGO_BYTES = 1024 * 1024; // the phone shrinks the picture before uploading

// Only real images: PNG, JPEG or WebP, checked from the file's first bytes (no SVG: it can carry scripts).
function imageKind(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

function removeFile(url) {
  if (!url || !url.startsWith('/media/logos/')) return;
  fs.rm(path.join(LOGO_DIR, path.basename(url)), { force: true }, () => {});
}

router.post(
  '/logo',
  requireMember(['owner', 'manager']),
  express.raw({ type: () => true, limit: MAX_LOGO_BYTES }),
  async (req, res) => {
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const kind = imageKind(buf);
    if (!kind) throw new HttpError(400, 'Choose a picture (PNG, JPEG or WebP).');
    fs.mkdirSync(LOGO_DIR, { recursive: true });
    // A new name each time, so phones and browsers never show an old cached logo.
    const fileName = `${req.businessId}-${crypto.randomBytes(6).toString('hex')}.${kind}`;
    fs.writeFileSync(path.join(LOGO_DIR, fileName), buf);
    const url = `/media/logos/${fileName}`;
    const { rows } = await query(
      `UPDATE businesses b SET logo_url = $2, updated_at = now()
         FROM (SELECT logo_url AS old FROM businesses WHERE id = $1) o
        WHERE b.id = $1 RETURNING o.old`,
      [req.businessId, url]
    );
    removeFile(rows[0]?.old);
    res.status(201).json({ logoUrl: url });
  }
);

router.delete('/logo', requireMember(['owner', 'manager']), async (req, res) => {
  const { rows } = await query(
    `UPDATE businesses b SET logo_url = NULL, updated_at = now()
       FROM (SELECT logo_url AS old FROM businesses WHERE id = $1) o
      WHERE b.id = $1 RETURNING o.old`,
    [req.businessId]
  );
  removeFile(rows[0]?.old);
  res.status(204).end();
});

module.exports = { router };
