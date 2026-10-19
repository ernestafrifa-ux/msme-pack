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

// Slow down password guessing: 20 failed attempts per 15 minutes per IP.
// (Successful logins don't count, so a shop where several staff log in is not locked out.)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
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
    mustChangePassword: !!u.must_change_password,
  };
}

// Public sign-up is only for the very first account, which becomes the admin.
async function adminExists() {
  const { rows } = await query(`SELECT 1 FROM users WHERE platform_role = 'admin' LIMIT 1`);
  return rows.length > 0;
}

router.get('/status', async (req, res) => {
  res.json({ signupOpen: !(await adminExists()) });
});

router.post('/signup', authLimiter, validate(signupSchema), async (req, res) => {
  const { fullName, phone, password, preferredLanguage } = req.valid.body;
  if (await adminExists()) {
    throw new HttpError(403, 'New accounts are made by the MSME Pack admin, or by a business owner for their staff. Ask them to add you.');
  }
  // When ADMIN_PHONES is set, only those numbers may create the first (admin) account.
  const allowed = (process.env.ADMIN_PHONES || '').split(',').map((x) => normaliseGhanaPhone(x.trim())).filter(Boolean);
  if (allowed.length && !allowed.includes(phone)) {
    throw new HttpError(403, 'This number is not set up as the MSME Pack admin.', { phone: 'Not an admin number.' });
  }
  const hash = await bcrypt.hash(password, 12);
  let user;
  try {
    const { rows } = await query(
      `INSERT INTO users (full_name, phone, password_hash, preferred_language, last_login_at, platform_role)
       VALUES ($1, $2, $3, $4, now(), 'admin')
       RETURNING id, full_name, phone, preferred_language, platform_role, must_change_password`,
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
    `SELECT id, full_name, phone, preferred_language, platform_role, password_hash, must_change_password
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
    `SELECT b.id, b.name, b.sector_code, b.region_code, b.town, b.legal_form, b.size_tier, b.setup_done, b.logo_url, m.role
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
    setupDone: b.setup_done,
    logoUrl: b.logo_url,
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
      RETURNING id, full_name, phone, preferred_language, platform_role, must_change_password`,
    [req.user.id, v.fullName ?? null, v.preferredLanguage ?? null]
  );
  res.json({ user: publicUser(rows[0]) });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password.'),
  newPassword: z.string().min(8, 'Use at least 8 characters.').max(200),
});

// Choose your own password (required after being given a temporary one).
router.post('/change-password', requireAuth, authLimiter, validate(changePasswordSchema), async (req, res) => {
  const v = req.valid.body;
  const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!(await bcrypt.compare(v.currentPassword, rows[0].password_hash))) {
    throw new HttpError(400, 'Your current password is not correct.', { currentPassword: 'Not correct.' });
  }
  if (v.currentPassword === v.newPassword) {
    throw new HttpError(400, 'Choose a password different from the temporary one.', { newPassword: 'Must be different.' });
  }
  const hash = await bcrypt.hash(v.newPassword, 12);
  const u = await query(
    `UPDATE users SET password_hash = $2, must_change_password = FALSE, updated_at = now() WHERE id = $1
     RETURNING id, full_name, phone, preferred_language, platform_role, must_change_password`,
    [req.user.id, hash]
  );
  res.json({ user: publicUser(u.rows[0]) });
});

module.exports = { router, listBusinesses };
