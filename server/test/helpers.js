// Test helpers for the closed sign-up: accounts and businesses are made the way the admin
// and owners make them, then logged in.
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { pool } = require('../src/db');
const { normaliseGhanaPhone } = require('../src/phone');

const HASH_CACHE = new Map();
async function hash(pw) {
  if (!HASH_CACHE.has(pw)) HASH_CACHE.set(pw, await bcrypt.hash(pw, 4));
  return HASH_CACHE.get(pw);
}

// A person with an account (no business yet), logged in. role: 'user' or 'admin'.
async function userToken(app, { fullName, phone, password, preferredLanguage = 'en' }, role = 'user') {
  await pool.query(
    `INSERT INTO users (full_name, phone, password_hash, platform_role, preferred_language) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (phone) DO NOTHING`,
    [fullName, normaliseGhanaPhone(phone), await hash(password), role, preferredLanguage]
  );
  const r = await request(app).post('/api/auth/login').send({ phone, password });
  if (r.status !== 200) throw new Error(`login failed: ${JSON.stringify(r.body)}`);
  return r.body.token;
}

const adminToken = (app) => userToken(app, { fullName: 'MSME Pack Admin', phone: '0559990000', password: 'admin-pass-1' }, 'admin');

// What POST /api/businesses used to do: the admin creates the business with this user as owner.
async function createBusinessFor(app, token, body) {
  const me = (await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)).body.user;
  return request(app).post('/api/admin/businesses').set('Authorization', `Bearer ${await adminToken(app)}`)
    .send({ withMoney: true, ...body, owner: { fullName: me.fullName, phone: me.phone } });
}

module.exports = { userToken, adminToken, createBusinessFor };
