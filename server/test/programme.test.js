// Admin programme tools: groups, figures shared only with consent, questions on messages.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { pool } = require('../src/db');
const { migrate } = require('../db/migrate');
const { userToken, adminToken, createBusinessFor } = require('./helpers');

const app = createApp();
let admin, ama, kofi, esi, amaBiz, kofiBiz, esiBiz, group;
const as = (t) => (method, p, body) => {
  const r = request(app)[method](`/api${p}`).set('Authorization', `Bearer ${t}`);
  return body === undefined ? r : r.send(body);
};
const ok = async (p, code = 200) => { const r = await p; assert.equal(r.status, code, JSON.stringify(r.body)); return r.body; };

before(async () => {
  const { rows } = await pool.query('SELECT current_database() AS db');
  if (!rows[0].db.endsWith('_test')) throw new Error(`Refusing to run tests against "${rows[0].db}".`);
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate({ log: () => {} });
  admin = await adminToken(app);
  ama = await userToken(app, { fullName: 'Ama', phone: '0241112222', password: 'shito-2026' });
  kofi = await userToken(app, { fullName: 'Kofi', phone: '0209998888', password: 'kofi-pass-1' });
  esi = await userToken(app, { fullName: 'Esi', phone: '0271234567', password: 'esi-pass-01' });
  amaBiz = (await createBusinessFor(app, ama, { name: "Ama's Shito", regionCode: 'EAS', cashOpeningBalance: 100 })).body.business.id;
  kofiBiz = (await createBusinessFor(app, kofi, { name: 'Kofi Electricals', regionCode: 'EAS', cashOpeningBalance: 100 })).body.business.id;
  esiBiz = (await createBusinessFor(app, esi, { name: 'Esi Fashions', regionCode: 'GAR', cashOpeningBalance: 100 })).body.business.id;
  for (const [t, b, amount] of [[ama, amaBiz, 900], [kofi, kofiBiz, 400]]) {
    const cash = (await as(t)('get', `/businesses/${b}/accounts`)).body.accounts[0].id;
    await ok(as(t)('post', `/businesses/${b}/transactions`, { kind: 'sale', accountId: cash, amount }), 201);
  }
});
after(() => pool.end());

test('groups of businesses', async () => {
  let g = await ok(as(admin)('post', '/admin/groups', { name: 'BizBox Kwahu West 2026', businessIds: [amaBiz, kofiBiz] }), 201);
  group = g.groups[0];
  assert.equal(group.businesses, 2);
  assert.equal((await as(admin)('post', '/admin/groups', { name: 'bizbox kwahu west 2026' })).status, 409);
  assert.equal((await as(ama)('get', '/admin/groups')).status, 403);
  const list = (await as(admin)('get', '/admin/businesses')).body.businesses;
  assert.deepEqual(list.find((b) => b.id === amaBiz).groupIds, [group.id]);
  // A new business can join a group when it is set up.
  const r = await ok(as(admin)('post', '/admin/businesses', { name: 'Yaw Tailoring', groupIds: [group.id],
    owner: { fullName: 'Yaw', phone: '0245556666', password: 'temp-yaw-01' } }), 201);
  g = await ok(as(admin)('get', '/admin/groups'));
  assert.equal(g.groups[0].businesses, 3);
  g = await ok(as(admin)('put', `/admin/groups/${group.id}`, { name: 'BizBox Kwahu West 2026', businessIds: [amaBiz, kofiBiz] }));
  assert.equal(g.groups[0].businesses, 2);
  assert.ok(r.business.id);
});

test('money figures appear only for businesses that agree to share', async () => {
  let d = await ok(as(admin)('get', `/admin/dashboard?groupId=${group.id}`));
  assert.equal(d.counts.businesses, 2);
  assert.equal(d.counts.records, 2);
  assert.equal(d.counts.sharing, 0);
  assert.equal(d.businesses.find((b) => b.id === amaBiz).sales, null, 'not shared: no money figures');
  assert.equal(d.businesses.find((b) => b.id === amaBiz).records, 1, 'activity is always visible');

  // Only the owner can turn sharing on.
  assert.equal((await as(ama)('patch', `/businesses/${amaBiz}`, { shareWithProgramme: true })).body.business.shareWithProgramme, true);
  d = await ok(as(admin)('get', `/admin/dashboard?groupId=${group.id}`));
  assert.equal(d.counts.sharing, 1);
  assert.equal(d.businesses.find((b) => b.id === amaBiz).sales, '900.00');
  assert.equal(d.businesses.find((b) => b.id === kofiBiz).sales, null);
  assert.equal(d.shared.totalSales, '900.00');
  assert.equal(d.shared.profitable, 1);
  d = await ok(as(admin)('get', '/admin/dashboard?regionCode=GAR'));
  assert.equal(d.counts.businesses, 1);
  assert.equal((await as(ama)('get', '/admin/dashboard')).status, 403);
});

test('a question on a message, answered once per business', async () => {
  assert.equal((await as(admin)('post', '/admin/notices', { title: 'Training', body: 'Friday 10am', question: 'Will you attend?', options: ['Yes'],
    audience: { type: 'group', groupIds: [group.id] } })).status, 400);
  const r = await ok(as(admin)('post', '/admin/notices', { title: 'Training', body: 'Friday 10am at the GEA office.',
    question: 'Will you attend?', options: ['Yes', 'No', 'Not sure'], audience: { type: 'group', groupIds: [group.id] } }), 201);
  assert.equal(r.businesses, 2);
  let n = (await as(ama)('get', `/businesses/${amaBiz}/notices`)).body.notices[0];
  assert.deepEqual(n.options, ['Yes', 'No', 'Not sure']);
  assert.equal(n.answer, null);
  await ok(as(ama)('post', `/businesses/${amaBiz}/notices/${r.id}/answer`, { option: 2 }));
  await ok(as(ama)('post', `/businesses/${amaBiz}/notices/${r.id}/answer`, { option: 0 }));
  await ok(as(kofi)('post', `/businesses/${kofiBiz}/notices/${r.id}/answer`, { option: 1 }));
  assert.equal((await as(kofi)('post', `/businesses/${kofiBiz}/notices/${r.id}/answer`, { option: 5 })).status, 400);
  assert.equal((await as(esi)('post', `/businesses/${esiBiz}/notices/${r.id}/answer`, { option: 0 })).status, 404, 'not sent to Esi');
  n = (await as(ama)('get', `/businesses/${amaBiz}/notices`)).body.notices[0];
  assert.equal(n.answer, 0);
  const sent = (await as(admin)('get', '/admin/notices')).body.notices[0];
  assert.deepEqual(sent.answers, [{ option: 'Yes', count: 1 }, { option: 'No', count: 1 }, { option: 'Not sure', count: 0 }]);
});
