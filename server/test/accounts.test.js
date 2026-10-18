// Bank accounts alongside the cash box and MoMo.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { pool } = require('../src/db');
const { migrate } = require('../db/migrate');
const { userToken, createBusinessFor } = require('./helpers');

const app = createApp();
let token, biz;
const api = (method, path, body) => {
  const r = request(app)[method](`/api/businesses/${biz}${path}`).set('Authorization', `Bearer ${token}`);
  return body === undefined ? r : r.send(body);
};

before(async () => {
  const { rows } = await pool.query('SELECT current_database() AS db');
  if (!rows[0].db.endsWith('_test')) throw new Error(`Refusing to run tests against "${rows[0].db}".`);
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate({ log: () => {} });
  token = await userToken(app, { fullName: 'Adwoa Mensah', phone: '0244567890', password: 'books-2026' });
});
after(() => pool.end());

test('a bank account can be set up with the business', async () => {
  const r = await createBusinessFor(app, token, {
    name: 'Adom Books', cashOpeningBalance: 500, momo: { provider: 'MTN', openingBalance: 200 },
    bank: { name: 'GCB', openingBalance: 1000 },
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  biz = r.body.business.id;
  const accts = (await api('get', '/accounts')).body.accounts;
  assert.deepEqual(accts.map((a) => [a.name, a.kind, a.balance]).sort(),
    [['Cash box', 'cash', '500.00'], ['GCB account', 'bank', '1000.00'], ['MTN MoMo', 'mobile_money', '200.00']]);
  assert.equal((await api('get', '/dashboard')).body.totalBalance, '1700.00');
});

test('more accounts can be added later; names must differ', async () => {
  let r = await api('post', '/accounts', { kind: 'bank', name: 'Ecobank account', provider: 'Ecobank', lastDigits: '4321', openingBalance: 300 });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  r = await api('post', '/accounts', { kind: 'bank', name: 'Ecobank account', openingBalance: 0 });
  assert.equal(r.status, 409);
  r = await api('post', '/accounts', { kind: 'bank', name: 'Bad digits', lastDigits: '12345' });
  assert.equal(r.status, 400);
  const accts = (await api('get', '/accounts')).body.accounts;
  const gcb = accts.find((a) => a.name === 'GCB account').id;
  const cash = accts.find((a) => a.kind === 'cash').id;

  // Money moves to and from the bank like any account.
  r = await api('post', '/transactions', { kind: 'transfer', accountId: cash, toAccountId: gcb, amount: 200 });
  assert.equal(r.status, 201);
  const bs = (await api('get', '/reports/balance-sheet')).body;
  const line = Object.fromEntries(bs.assets.cash.map((c) => [c.name, c.amount]));
  assert.equal(line['GCB account'], '1200.00');
  assert.equal(line['Cash box'], '300.00');
  assert.equal(bs.assets.cashTotal, '2000.00'); // 500 + 200 + 1000 + 300
});
