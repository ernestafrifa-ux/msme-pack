const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { query } = require('../db');
const { signToken, requireAuth } = require('../auth');
const { HttpError, validate } = require('../http');
const { normaliseGhanaPhone } = require('../phone');

const router = express.Router();

// Used to spend the same time on a login for an unknown phone number.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

// Slow down password guessing: 20 attempts per 15 minutes per IP.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});

const phoneField = z
  .string()
  .transform((v, ctx) => {
    const p = normaliseGhanaPhone(v);
    if (!p) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid Ghana phone number, e.g. 024 123 4567.' });
      return z.NEVER;
    }
    return p;
  });

const signupSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name.').max(120),
  phone: phoneField,
  password: z.string().min(8, 'Use at least 8 characters.').max(200),
  preferredLanguage: z.enum(['en', 'tw', 'ee', 'gaa', 'dag', 'ha']).default('en'),
});

const loginSchema = z.object({
  phone: phoneField,
  password: z.string().min(1, 'Enter your password.'),
});

function publicUser(u) {
  return {
    id: u.id,
    fullName: u.full_name,
    phone: u.phone,
    preferredLanguage: u.preferred_language,
    isAdmin: u.platform_role === 'admin',
  };
}

router.post('/signup', authLimiter, validate(signupSchema), async (req, res) => {
  const { fullName, phone, password, preferredLanguage } = req.valid.body;
  const hash = await bcrypt.hash(password, 12);
  let user;
  try {
    const { rows } = await query(
      `INSERT INTO users (full_name, phone, password_hash, preferred_language, last_login_at)
       VALUES ($1, $2, $3, $4, now())
       RETURNING id, full_name, phone, preferred_language, platform_role`,
      [fullName, phone, hash, preferredLanguage]
    );
    user = rows[0];
  } catch (err) {
    if (err.code === '23505') {
      throw new HttpError(409, 'An account with this phone number already exists. Try logging in.', {
        phone: 'Already registered.',
      });
    }
    throw err;
  }
  res.status(201).json({ token: signToken(user), user: publicUser(user), businesses: [] });
});

router.post('/login', authLimiter, validate(loginSchema), async (req, res) => {
  const { phone, password } = req.valid.body;
  const { rows } = await query(
    `SELECT id, full_name, phone, preferred_language, platform_role, password_hash
       FROM users WHERE phone = $1 AND is_active`,
    [phone]
  );
  const user = rows[0];
  // Compare even when the user doesn't exist, so response time doesn't reveal it.
  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, 'Phone number or password is not correct.');
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
  res.json({ token: signToken(user), user: publicUser(user), businesses: await listBusinesses(user.id) });
});

async function listBusinesses(userId) {
  const { rows } = await query(
    `SELECT b.id, b.name, b.sector_code, b.region_code, b.town, b.legal_form, b.size_tier, m.role
       FROM businesses b JOIN business_members m ON m.business_id = b.id
      WHERE m.user_id = $1 AND b.deleted_at IS NULL
      ORDER BY b.created_at`,
    [userId]
  );
  return rows.map((b) => ({
    id: b.id,
    name: b.name,
    sectorCode: b.sector_code,
    regionCode: b.region_code,
    town: b.town,
    legalForm: b.legal_form,
    sizeTier: b.size_tier,
    role: b.role,
  }));
}

router.get('/me', requireAuth, async (req, res) => {
  res.json({ user: publicUser(req.user), businesses: await listBusinesses(req.user.id) });
});

const meSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name.').max(120).optional(),
  preferredLanguage: z.enum(['en', 'tw', 'ee', 'gaa', 'dag', 'ha']).optional(),
});

// Change your name or the language the app and guides use.
router.patch('/me', requireAuth, validate(meSchema), async (req, res) => {
  const v = req.valid.body;
  const { rows } = await query(
    `UPDATE users SET full_name = COALESCE($2, full_name), preferred_language = COALESCE($3, preferred_language),
            updated_at = now()
      WHERE id = $1
      RETURNING id, full_name, phone, preferred_language, platform_role`,
    [req.user.id, v.fullName ?? null, v.preferredLanguage ?? null]
  );
  res.json({ user: publicUser(rows[0]) });
});

module.exports = { router, listBusinesses };
