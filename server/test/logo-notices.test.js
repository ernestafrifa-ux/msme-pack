// Business logos, and messages from the admin to businesses.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createApp } = require('../src/app');
const { pool } = require('../src/db');
const { migrate } = require('../db/migrate');
const config = require('../src/config');
const { userToken, adminToken, createBusinessFor } = require('./helpers');

const app = createApp();
let admin, ama, kofi, staff, amaBiz, kofiBiz;
const as = (token) => (method, p, body) => {
  const r = request(app)[method](`/api${p}`).set('Authorization', `Bearer ${token}`);
  return body === undefined ? r : r.send(body);
};
// A 1×1 PNG.
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4e00000000049454e44ae426082', 'hex');

before(async () => {
  const { rows } = await pool.query('SELECT current_database() AS db');
  if (!rows[0].db.endsWith('_test')) throw new Error(`Refusing to run tests against "${rows[0].db}".`);
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate({ log: () => {} });
  admin = await adminToken(app);
  ama = await userToken(app, { fullName: 'Ama Mensah', phone: '0241112222', password: 'shito-2026' });
  kofi = await userToken(app, { fullName: 'Kofi Boateng', phone: '0209998888', password: 'kofi-pass-1' });
  amaBiz = (await createBusinessFor(app, ama, { name: "Ama's Shito", regionCode: 'ASH', sectorCode: 'AGRO' })).body.business.id;
  kofiBiz = (await createBusinessFor(app, kofi, { name: 'Kofi Electricals', regionCode: 'GAR' })).body.business.id;
  staff = await userToken(app, { fullName: 'Yaw', phone: '0245556666', password: 'yaw-pass-01' });
  await pool.query(`INSERT INTO business_members (business_id, user_id, role)
                    SELECT $1, id, 'staff' FROM users WHERE phone = '+233245556666'`, [amaBiz]);
});
after(() => pool.end());

test('the owner uploads a logo; it shows on the business, invoices and statements', async () => {
  const up = (token, buf, biz = amaBiz) => request(app).post(`/api/businesses/${biz}/logo`)
    .set('Authorization', `Bearer ${token}`).set('Content-Type', 'application/octet-stream').send(buf);
  assert.equal((await up(ama, Buffer.from('<svg onload="alert(1)"></svg>'))).status, 400, 'no SVG or other files');
  assert.equal((await up(staff, PNG)).status, 403, 'staff cannot change it');
  assert.equal((await up(kofi, PNG)).status, 404, 'another business cannot');
  let r = await up(ama, PNG);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const first = r.body.logoUrl;
  assert.match(first, /^\/media\/logos\/.+\.png$/);
  assert.ok(fs.existsSync(path.join(config.mediaDir, 'logos', path.basename(first))));
  assert.equal((await request(app).get(first)).status, 200);

  assert.equal((await as(ama)('get', `/businesses/${amaBiz}`)).body.business.logoUrl, first);
  assert.equal((await as(ama)('get', '/auth/me')).body.businesses[0].logoUrl, first);
  assert.equal((await as(ama)('get', `/businesses/${amaBiz}/reports/profit-loss`)).body.business.logoUrl, first);

  // A new logo replaces the old file.
  r = await up(ama, PNG);
  assert.notEqual(r.body.logoUrl, first);
  await new Promise((ok) => setTimeout(ok, 50));
  assert.ok(!fs.existsSync(path.join(config.mediaDir, 'logos', path.basename(first))));
  assert.equal((await as(ama)('delete', `/businesses/${amaBiz}/logo`)).status, 204);
  assert.equal((await as(ama)('get', `/businesses/${amaBiz}`)).body.business.logoUrl, null);
  await up(ama, PNG);
});

test('the admin sends messages to all, by region, or to chosen businesses', async () => {
  assert.equal((await as(ama)('post', '/admin/notices', { title: 'Hi', body: 'x', audience: { type: 'all' } })).status, 403);
  let r = await as(admin)('post', '/admin/notices/preview', { audience: { type: 'all' } });
  assert.deepEqual(r.body, { businesses: 2, people: 3 });
  r = await as(admin)('post', '/admin/notices', { title: 'Hi', body: 'Hello', linkUrl: 'javascript:alert(1)', audience: { type: 'all' } });
  assert.equal(r.status, 400, 'only app pages or https links');
  r = await as(admin)('post', '/admin/notices', { title: 'Hi', body: 'Hello', audience: { type: 'region', codes: ['VR'] } });
  assert.equal(r.status, 400, 'nobody in that region');

  r = await as(admin)('post', '/admin/notices', { title: 'GEA training on record keeping',
    body: 'Free training at the GEA office, Kumasi, on Friday at 10 am.', linkUrl: '/learn/keep-daily-records', audience: { type: 'all' } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.businesses, 2);
  r = await as(admin)('post', '/admin/notices', { title: 'Ashanti traders fair', body: 'Stalls available.',
    linkUrl: 'https://example.com/fair', audience: { type: 'region', codes: ['ASH'] } });
  assert.equal(r.body.businesses, 1);
  const fairId = r.body.id;
  r = await as(admin)('post', '/admin/notices', { title: 'For Kofi', body: 'Your certificate is ready.', audience: { type: 'selected', businessIds: [kofiBiz] } });
  assert.equal(r.body.businesses, 1);

  // Ama's business gets 2, Kofi's 2.
  let n = (await as(ama)('get', `/businesses/${amaBiz}/notices`)).body;
  assert.equal(n.notices.length, 2);
  assert.equal(n.unread, 2);
  assert.equal(n.notices[0].title, 'Ashanti traders fair');
  assert.equal((await as(ama)('get', `/businesses/${amaBiz}/dashboard`)).body.notices.unread, 2);
  assert.equal((await as(kofi)('get', `/businesses/${kofiBiz}/notices`)).body.notices.map((x) => x.title).includes('For Kofi'), true);
  assert.equal((await as(kofi)('get', `/businesses/${amaBiz}/notices`)).status, 404);

  // Reading is per person.
  r = await as(ama)('post', `/businesses/${amaBiz}/notices/${fairId}/read`);
  assert.equal(r.body.unread, 1);
  assert.equal((await as(staff)('get', `/businesses/${amaBiz}/notices`)).body.unread, 2);
  r = await as(ama)('post', `/businesses/${amaBiz}/notices/read`);
  assert.equal(r.body.unread, 0);
  assert.equal((await as(ama)('get', `/businesses/${amaBiz}/dashboard`)).body.notices.latest, null);

  let sent = (await as(admin)('get', '/admin/notices')).body.notices;
  const fair = sent.find((x) => x.id === fairId);
  assert.equal(fair.businesses, 1);
  assert.equal(fair.readBy, 1);
  assert.equal(sent.find((x) => x.title === 'For Kofi').readBy, 0);

  // Withdrawn messages disappear.
  assert.equal((await as(admin)('delete', `/admin/notices/${fairId}`)).status, 204);
  n = (await as(staff)('get', `/businesses/${amaBiz}/notices`)).body;
  assert.equal(n.notices.length, 1);
  sent = (await as(admin)('get', '/admin/notices')).body.notices;
  assert.equal(sent.find((x) => x.id === fairId).withdrawn, true);
});
