// Matching MoMo statement lines with the records.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { pool } = require('../src/db');
const { migrate } = require('../db/migrate');
const { todayInGhana, addDays } = require('../src/dates');
const { userToken, createBusinessFor } = require('./helpers');

const app = createApp();
const today = todayInGhana();
let token, biz, momo, cash;
const api = (method, path, body) => {
  const r = request(app)[method](`/api/businesses/${biz}${path}`).set('Authorization', `Bearer ${token}`);
  return body === undefined ? r : r.send(body);
};

before(async () => {
  const { rows } = await pool.query('SELECT current_database() AS db');
  if (!rows[0].db.endsWith('_test')) throw new Error(`Refusing to run tests against "${rows[0].db}".`);
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate({ log: () => {} });
  token = await userToken(app, { fullName: 'Adwoa', phone: '0244567890', password: 'books-2026' });
  biz = (await createBusinessFor(app, token, { name: 'Adom Books', cashOpeningBalance: 100, momo: { provider: 'MTN', openingBalance: 0 } })).body.business.id;
  const accts = (await api('get', '/accounts')).body.accounts;
  momo = accts.find((a) => a.kind === 'mobile_money').id;
  cash = accts.find((a) => a.kind === 'cash').id;
  await api('post', '/transactions', { kind: 'sale', accountId: momo, amount: 50, paymentRef: '51234567890' });
  await api('post', '/transactions', { kind: 'sale', accountId: momo, amount: 75 });
  await api('post', '/transactions', { kind: 'expense', accountId: momo, amount: 20 });
  await api('post', '/transactions', { kind: 'transfer', accountId: cash, toAccountId: momo, amount: 30 });
});
after(() => pool.end());

test('lines are matched by ID, then by amount and date; the rest are listed both ways', async () => {
  const r = await api('post', '/momo/match', { accountId: momo, lines: [
    { date: today, amount: 50, direction: 'in', ref: '51234567890' },
    { date: addDays(today, -1), amount: 75, direction: 'in', ref: '999' },
    { date: today, amount: 30, direction: 'in' },
    { date: today, amount: 200, direction: 'in', ref: '777', name: 'AKUA' },
    { date: today, amount: 75, direction: 'out' },
  ] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const s = r.body.lines.map((l) => l.status);
  assert.deepEqual(s, ['matched', 'matched', 'matched', 'missing', 'missing']);
  assert.equal(r.body.lines[0].record.ref, '51234567890');
  assert.equal(r.body.lines[2].record.kind, 'transfer');
  assert.equal(r.body.counts.missing, 2);
  assert.equal(r.body.notOnStatement.length, 1, 'the 20 expense is in the records but not on the statement');
  assert.equal(r.body.notOnStatement[0].amount, '20.00');
  assert.equal((await api('post', '/momo/match', { accountId: momo, lines: [] })).status, 400);
});
