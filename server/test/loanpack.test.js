// The loan-ready pack.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { pool } = require('../src/db');
const { migrate } = require('../db/migrate');
const { todayInGhana } = require('../src/dates');
const { monthsBack } = require('../src/routes/loanpack');
const { userToken, createBusinessFor } = require('./helpers');

const app = createApp();
let token, staff, biz, cash;
const api = (method, path, body, t = token) => {
  const r = request(app)[method](`/api/businesses/${biz}${path}`).set('Authorization', `Bearer ${t}`);
  return body === undefined ? r : r.send(body);
};

before(async () => {
  const { rows } = await pool.query('SELECT current_database() AS db');
  if (!rows[0].db.endsWith('_test')) throw new Error(`Refusing to run tests against "${rows[0].db}".`);
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate({ log: () => {} });
  token = await userToken(app, { fullName: 'Adwoa Mensah', phone: '0244567890', password: 'books-2026' });
  biz = (await createBusinessFor(app, token, { name: 'Adom Books', regionCode: 'ASH', sectorCode: 'RETAIL', cashOpeningBalance: 1000 })).body.business.id;
  cash = (await api('get', '/accounts')).body.accounts[0].id;
  staff = await userToken(app, { fullName: 'Yaw', phone: '0245556666', password: 'yaw-pass-01' });
  await pool.query(`INSERT INTO business_members (business_id, user_id, role) SELECT $1, id, 'staff' FROM users WHERE phone = '+233245556666'`, [biz]);
  await api('post', '/transactions', { kind: 'sale', accountId: cash, amount: 2000 });
  await api('post', '/transactions', { kind: 'expense', accountId: cash, amount: 500 });
  await api('post', '/transactions', { kind: 'owner_draw', accountId: cash, amount: 300 });
});
after(() => pool.end());

test('months run back from this month', () => {
  const m = monthsBack('2026-10-19', 3);
  assert.deepEqual(m.map((x) => x.month), ['2026-08', '2026-09', '2026-10']);
  assert.equal(m[0].end, '2026-08-31');
  assert.equal(m[2].end, '2026-10-19');
});

test('the pack summarises the business for a lender', async () => {
  assert.equal((await api('get', '/reports/loan-pack', undefined, staff)).status, 403);
  const r = await api('get', '/reports/loan-pack?months=3');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const p = r.body;
  assert.equal(p.business.name, 'Adom Books');
  assert.equal(p.business.owners[0].name, 'Adwoa Mensah');
  assert.equal(p.months.length, 1, 'only months since records began');
  assert.equal(p.requestedMonths, 3);
  const now = p.months[0];
  assert.equal(now.month, todayInGhana().slice(0, 7));
  assert.equal(now.sales, '2000.00');
  assert.equal(now.netProfit, '1500.00');
  assert.equal(now.ownerPay, '300.00');
  assert.equal(now.cashIn, '2000.00');
  assert.equal(now.cashOut, '800.00');
  assert.equal(now.closingCash, '2200.00');
  assert.equal(now.records, 3);
  assert.equal(p.totals.sales, '2000.00');
  assert.equal(p.averages.netMargin, 75);
  assert.equal(p.recordKeeping.monthsWithRecords, 1);
  assert.equal(p.balanceSheet.equity, '2200.00');
  assert.equal(p.health, null);
  assert.equal((await api('get', '/reports/loan-pack?months=5')).status, 400);
});
