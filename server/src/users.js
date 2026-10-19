// Creating accounts for other people (the admin for owners, owners for their staff).
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { normaliseGhanaPhone } = require('./phone');

const phoneField = z.string().transform((v, ctx) => {
  const p = normaliseGhanaPhone(v);
  if (!p) {
    ctx.addIssue({ code: 'custom', message: 'Enter a valid Ghana phone number, e.g. 024 123 4567.' });
    return z.NEVER;
  }
  return p;
});
const passwordField = z.string().min(8, 'Use at least 8 characters.').max(200);

// A new person, or someone who already has an account (found by phone number).
const personSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter their full name.').max(120),
  phone: phoneField,
  password: passwordField.optional(),
  preferredLanguage: z.enum(['en', 'tw', 'ee', 'gaa', 'dag', 'ha']).default('en'),
});

// Returns { user, isNew }. An existing account keeps its own password.
async function findOrCreateUser(db, p, createdBy) {
  const { rows } = await db.query('SELECT id, full_name, phone, platform_role, is_active FROM users WHERE phone = $1', [p.phone]);
  if (rows[0]) return { user: rows[0], isNew: false };
  if (!p.password) {
    const err = new Error('password needed');
    err.needsPassword = true;
    throw err;
  }
  const hash = await bcrypt.hash(p.password, 12);
  const created = await db.query(
    `INSERT INTO users (full_name, phone, password_hash, must_change_password, created_by, preferred_language)
     VALUES ($1, $2, $3, TRUE, $4, $5) RETURNING id, full_name, phone, platform_role, is_active`,
    [p.fullName, p.phone, hash, createdBy, p.preferredLanguage || 'en']
  );
  return { user: created.rows[0], isNew: true };
}

async function setTemporaryPassword(db, userId, password) {
  const hash = await bcrypt.hash(password, 12);
  await db.query(
    'UPDATE users SET password_hash = $2, must_change_password = TRUE, updated_at = now() WHERE id = $1',
    [userId, hash]
  );
}

// The web address people open, for links in text messages.
function appOrigin(req) {
  return process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
}

// Tells a new person by SMS how to log in (only when SMS is set up and they asked for it).
async function smsLoginDetails(req, { phone, password, businessName, businessId }) {
  const { sendSms } = require('./sms');
  const text = `MSME Pack: you can now use ${businessName}. Open ${appOrigin(req)} and log in with ${phone.replace('+233', '0')} and the temporary password ${password}. You will then choose your own.`;
  return sendSms({ to: phone, text, purpose: 'login', businessId, userId: req.user.id });
}

module.exports = { phoneField, passwordField, personSchema, findOrCreateUser, setTemporaryPassword, appOrigin, smsLoginDetails };
