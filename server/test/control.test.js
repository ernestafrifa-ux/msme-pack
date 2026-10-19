// Closing the day with a cash count, and who recorded or deleted what.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { pool } = require('../src/db');
const { migrate } = require('../db/migrate');
const { userToken, createBusinessFor } = require('./helpers');

const app = createApp();
let owner, staff, biz, cash, momo;
const as = (t) => (method, path, body) => {
  const r = request(app)[method](`/api/businesses/${biz}${path}`).set('Authorization', `Bearer ${t}`);
  return body === undefined ? r : r.send(body);
};
const ok = async (p, code = 201) => { const r = await p; assert.equal(r.status, code, JSON.stringify(r.body)); return r.body; };

before(async () => {
  const { rows } = await pool.query('SELECT current_database() AS db');
  if (!rows[0].db.endsWith('_test')) throw new Error(`Refusing to run tests against "${rows[0].db}".`);
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate({ log: () => {} });
  owner = await userToken(app, { fullName: 'Adwoa Mensah', phone: '0244567890', password: 'books-2026' });
  biz = (await createBusinessFor(app, owner, { name: 'Adom Books', cashOpeningBalance: 500, momo: { provider: 'MTN', openingBalance: 100 } })).body.business.id;
  staff = await userToken(app, { fullName: 'Yaw Sarpong', phone: '0245556666', password: 'yaw-pass-01' });
  await pool.query(`INSERT INTO business_members (business_id, user_id, role) SELECT $1, id, 'staff' FROM users WHERE phone = '+233245556666'`, [biz]);
  const accts = (await as(owner)('get', '/accounts')).body.accounts;
  cash = accts.find((a) => a.kind === 'cash').id;
  momo = accts.find((a) => a.kind === 'mobile_money').id;
});
after(() => pool.end());

test('staff record sales; the owner sees who did what, including deletions', async () => {
  await ok(as(staff)('post', '/transactions', { kind: 'sale', accountId: cash, amount: 80 }));
  await ok(as(staff)('post', '/transactions', { kind: 'sale', accountId: cash, amount: 20 }));
  const wrong = (await ok(as(staff)('post', '/transactions', { kind: 'sale', accountId: cash, amount: 50 }))).transaction;
  await ok(as(owner)('post', '/transactions', { kind: 'expense', accountId: cash, amount: 30 }));
  await ok(as(owner)('delete', `/transactions/${wrong.id}`), 204);
  assert.equal((await as(staff)('get', '/activity')).status, 403, 'staff do not see the activity report');
  const a = (await ok(as(owner)('get', '/activity'), 200));
  const yaw = a.people.find((p) => p.fullName === 'Yaw Sarpong');
  assert.equal(yaw.records, 2);
  assert.equal(yaw.sales, '100.00');
  const adwoa = a.people.find((p) => p.fullName === 'Adwoa Mensah');
  assert.equal(adwoa.spent, '30.00');
  assert.equal(adwoa.deleted, 1);
  assert.equal(a.deletions.length, 1);
  assert.equal(a.deletions[0].amount, '50.00');
  assert.equal(a.deletions[0].recordedBy, 'Yaw Sarpong');
  assert.equal(a.deletions[0].deletedBy, 'Adwoa Mensah');
});

test('closing count: a shortage is recorded as a cost and the balance then matches', async () => {
  let c = (await ok(as(staff)('get', '/cash-counts'), 200));
  assert.equal(c.countedToday, false);
  assert.equal(c.accounts.find((x) => x.id === cash).expected, '570.00'); // 500 + 100 − 30
  const r = await ok(as(staff)('post', '/cash-counts', { counts: [{ accountId: cash, counted: 565 }, { accountId: momo, counted: 100 }], note: 'Counted with Adwoa' }));
  const cashCount = r.counts.find((x) => x.accountId === cash);
  assert.equal(cashCount.difference, '-5.00');
  assert.equal(cashCount.recorded, true);
  assert.equal(r.counts.find((x) => x.accountId === momo).difference, '0.00');
  c = (await ok(as(staff)('get', '/cash-counts'), 200));
  assert.equal(c.countedToday, true);
  assert.equal(c.accounts.find((x) => x.id === cash).expected, '565.00');
  const d = (await as(owner)('get', '/dashboard')).body;
  assert.equal(d.summary.expenses, '35.00', 'the shortage is a cost');

  // Extra money, not recorded: only noted.
  const r2 = await ok(as(owner)('post', '/cash-counts', { counts: [{ accountId: cash, counted: 570 }], recordDifference: false }));
  assert.equal(r2.counts[0].difference, '5.00');
  assert.equal(r2.counts[0].recorded, false);
  assert.equal((await as(owner)('get', '/activity')).body.differences.length, 2);
});
