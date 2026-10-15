// End-to-end API tests against a real PostgreSQL database.
// Uses DATABASE_URL from the environment — point it at an EMPTY test database:
//   DATABASE_URL=postgres://…/msme_pack_test npm test
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { pool } = require('../src/db');
const { migrate } = require('../db/migrate');
const { normaliseGhanaPhone } = require('../src/phone');
const { todayInGhana, addDays } = require('../src/dates');

const app = createApp();
const today = todayInGhana();
let ama, kofi, biz, cash, momo, transportCat, salesCat;

before(async () => {
  // These tests wipe the database. Refuse unless its name ends in _test.
  const { rows } = await pool.query('SELECT current_database() AS db');
  if (!rows[0].db.endsWith('_test')) {
    throw new Error(`Refusing to run tests against "${rows[0].db}": use a database whose name ends in _test.`);
  }
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate({ log: () => {} });
});
after(() => pool.end());

test('phone numbers are normalised to +233 format', () => {
  assert.equal(normaliseGhanaPhone('024 123 4567'), '+233241234567');
  assert.equal(normaliseGhanaPhone('+233 24-123-4567'), '+233241234567');
  assert.equal(normaliseGhanaPhone('233501234567'), '+233501234567');
  assert.equal(normaliseGhanaPhone('12345'), null);
  assert.equal(normaliseGhanaPhone('0841234567'), null);
});

test('sign up, reject duplicate, log in', async () => {
  let r = await request(app).post('/api/auth/signup')
    .send({ fullName: 'Ama Mensah', phone: '0241112222', password: 'shito-2026' });
  assert.equal(r.status, 201);
  assert.equal(r.body.user.phone, '+233241112222');
  ama = r.body.token;

  r = await request(app).post('/api/auth/signup')
    .send({ fullName: 'Ama Again', phone: '+233241112222', password: 'another-pass' });
  assert.equal(r.status, 409);

  r = await request(app).post('/api/auth/signup').send({ fullName: 'A', phone: '123', password: 'short' });
  assert.equal(r.status, 400);
  assert.ok(r.body.fields.phone && r.body.fields.password && r.body.fields.fullName);

  r = await request(app).post('/api/auth/login').send({ phone: '024 111 2222', password: 'wrong-pass' });
  assert.equal(r.status, 401);

  r = await request(app).post('/api/auth/login').send({ phone: '024 111 2222', password: 'shito-2026' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.businesses, []);

  r = await request(app).post('/api/auth/signup')
    .send({ fullName: 'Kofi Boateng', phone: '0209998888', password: 'kofi-pass-1' });
  kofi = r.body.token;
});

test('protected routes need a valid token', async () => {
  assert.equal((await request(app).get('/api/auth/me')).status, 401);
  assert.equal((await request(app).get('/api/auth/me').set('Authorization', 'Bearer nonsense')).status, 401);
});

test('create a business with cash and MoMo accounts', async () => {
  const lookups = await request(app).get('/api/businesses/lookups').set('Authorization', `Bearer ${ama}`);
  assert.equal(lookups.body.regions.length, 16);

  const r = await request(app).post('/api/businesses').set('Authorization', `Bearer ${ama}`).send({
    name: "Ama's Shito & Spices", sectorCode: 'AGRO', regionCode: 'ASH', town: 'Kumasi',
    legalForm: 'sole_proprietorship', cashOpeningBalance: 500, momo: { provider: 'MTN', openingBalance: '200' },
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  biz = r.body.business.id;

  const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${ama}`);
  assert.equal(me.body.businesses[0].role, 'owner');

  const accts = await request(app).get(`/api/businesses/${biz}/accounts`).set('Authorization', `Bearer ${ama}`);
  assert.equal(accts.body.accounts.length, 2);
  cash = accts.body.accounts.find((a) => a.kind === 'cash');
  momo = accts.body.accounts.find((a) => a.kind === 'mobile_money');
  assert.equal(cash.balance, '500.00');
  assert.equal(momo.name, 'MTN MoMo');

  const cats = await request(app).get(`/api/businesses/${biz}/categories`).set('Authorization', `Bearer ${ama}`);
  transportCat = cats.body.categories.find((c) => c.name === 'Transport').id;
  salesCat = cats.body.categories.find((c) => c.name === 'Product sales').id;
});

test('another user cannot see or change this business', async () => {
  const auth = `Bearer ${kofi}`;
  assert.equal((await request(app).get(`/api/businesses/${biz}`).set('Authorization', auth)).status, 404);
  assert.equal((await request(app).get(`/api/businesses/${biz}/dashboard`).set('Authorization', auth)).status, 404);
  const r = await request(app).post(`/api/businesses/${biz}/transactions`).set('Authorization', auth)
    .send({ kind: 'sale', amount: 10, accountId: cash.id });
  assert.equal(r.status, 404);
});

test('record sales, an expense and a transfer; balances add up', async () => {
  const post = (body) => request(app).post(`/api/businesses/${biz}/transactions`)
    .set('Authorization', `Bearer ${ama}`).send(body);

  let r = await post({ kind: 'sale', amount: 250, accountId: cash.id, categoryId: salesCat, note: '10 jars' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.transaction.accountName, 'Cash box');

  r = await post({ kind: 'sale', amount: '625', accountId: momo.id, momoFee: 2.5, paymentRef: 'MP261015.1234' });
  assert.equal(r.status, 201);

  r = await post({ kind: 'expense', amount: 40, accountId: cash.id, categoryId: transportCat });
  assert.equal(r.status, 201);

  r = await post({ kind: 'transfer', amount: 300, accountId: cash.id, toAccountId: momo.id });
  assert.equal(r.status, 201);

  const d = await request(app).get(`/api/businesses/${biz}/dashboard`).set('Authorization', `Bearer ${ama}`);
  assert.equal(d.status, 200);
  const bal = Object.fromEntries(d.body.accounts.map((a) => [a.name, a.balance]));
  assert.equal(bal['Cash box'], '410.00');   // 500 + 250 − 40 − 300
  assert.equal(bal['MTN MoMo'], '1122.50');  // 200 + 625 − 2.50 + 300
  assert.equal(d.body.totalBalance, '1532.50');
  assert.equal(d.body.summary.sales, '875.00');
  assert.equal(d.body.summary.expenses, '40.00');
  assert.equal(d.body.summary.netProfitEstimate, '832.50'); // 875 − 40 − 2.50
  assert.equal(d.body.recent.length, 4);
});

test('bad records are rejected with clear messages', async () => {
  const post = (body) => request(app).post(`/api/businesses/${biz}/transactions`)
    .set('Authorization', `Bearer ${ama}`).send(body);

  let r = await post({ kind: 'sale', amount: -5, accountId: cash.id });
  assert.equal(r.status, 400);
  assert.ok(r.body.fields.amount);

  r = await post({ kind: 'transfer', amount: 5, accountId: cash.id });
  assert.equal(r.status, 400);
  assert.ok(r.body.fields.toAccountId);

  r = await post({ kind: 'sale', amount: 5, accountId: cash.id, categoryId: transportCat });
  assert.equal(r.status, 400, 'an expense category on a sale');

  r = await post({ kind: 'sale', amount: 5, accountId: cash.id, date: addDays(today, 5) });
  assert.equal(r.status, 400, 'future date');

  r = await post({ kind: 'sale', amount: 5, accountId: cash.id, date: addDays(today, -30) });
  assert.equal(r.status, 400, 'before the account was opened');

  r = await post({ kind: 'sale', amount: 5, accountId: '00000000-0000-4000-8000-000000000000' });
  assert.equal(r.status, 400, 'unknown account');
});

test('retrying a save with the same clientRef does not double-count', async () => {
  const clientRef = '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b';
  const send = () => request(app).post(`/api/businesses/${biz}/transactions`)
    .set('Authorization', `Bearer ${ama}`)
    .send({ kind: 'sale', amount: 50, accountId: cash.id, clientRef });
  const first = await send();
  const second = await send();
  assert.equal(first.status, 201);
  assert.equal(second.status, 200);
  assert.equal(second.body.duplicate, true);
  assert.equal(first.body.transaction.id, second.body.transaction.id);
});

test('list with paging and filter, then delete', async () => {
  const auth = `Bearer ${ama}`;
  let r = await request(app).get(`/api/businesses/${biz}/transactions?limit=3`).set('Authorization', auth);
  assert.equal(r.body.transactions.length, 3);
  assert.equal(r.body.hasMore, true);
  const last = r.body.transactions.at(-1);
  r = await request(app)
    .get(`/api/businesses/${biz}/transactions?limit=3&beforeDate=${last.date}&beforeId=${last.id}`)
    .set('Authorization', auth);
  assert.equal(r.body.transactions.length, 2);
  assert.equal(r.body.hasMore, false);

  r = await request(app).get(`/api/businesses/${biz}/transactions?kind=expense`).set('Authorization', auth);
  assert.equal(r.body.transactions.length, 1);
  const expenseId = r.body.transactions[0].id;

  r = await request(app).delete(`/api/businesses/${biz}/transactions/${expenseId}`).set('Authorization', auth);
  assert.equal(r.status, 204);
  r = await request(app).delete(`/api/businesses/${biz}/transactions/${expenseId}`).set('Authorization', auth);
  assert.equal(r.status, 404);

  const d = await request(app).get(`/api/businesses/${biz}/dashboard`).set('Authorization', auth);
  assert.equal(d.body.summary.expenses, '0.00');
  assert.equal(d.body.accounts.find((a) => a.name === 'Cash box').balance, '500.00'); // 410 + 40 back + 50
});
