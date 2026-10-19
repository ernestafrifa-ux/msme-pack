// Monthly target and budget, savings goals.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { pool } = require('../src/db');
const { migrate } = require('../db/migrate');
const { todayInGhana } = require('../src/dates');
const { userToken, createBusinessFor } = require('./helpers');

const app = createApp();
const month = todayInGhana().slice(0, 7);
let token, biz, cash;
const api = (method, path, body) => {
  const r = request(app)[method](`/api/businesses/${biz}${path}`).set('Authorization', `Bearer ${token}`);
  return body === undefined ? r : r.send(body);
};
const ok = async (p, code = 200) => { const r = await p; assert.equal(r.status, code, JSON.stringify(r.body)); return r.body; };

before(async () => {
  const { rows } = await pool.query('SELECT current_database() AS db');
  if (!rows[0].db.endsWith('_test')) throw new Error(`Refusing to run tests against "${rows[0].db}".`);
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate({ log: () => {} });
  token = await userToken(app, { fullName: 'Adwoa Mensah', phone: '0244567890', password: 'books-2026' });
  biz = (await createBusinessFor(app, token, { name: 'Adom Books', cashOpeningBalance: 1000 })).body.business.id;
  cash = (await api('get', '/accounts')).body.accounts[0].id;
});
after(() => pool.end());

test('a sales target and spending budget with progress', async () => {
  const cats = (await api('get', '/categories')).body.categories;
  const rent = cats.find((c) => c.name === 'Rent').id;
  const transport = cats.find((c) => c.name === 'Transport').id;
  await ok(api('post', '/transactions', { kind: 'sale', accountId: cash, amount: 1500 }), 201);
  await ok(api('post', '/transactions', { kind: 'expense', accountId: cash, amount: 400, categoryId: rent }), 201);
  await ok(api('post', '/transactions', { kind: 'expense', accountId: cash, amount: 120, categoryId: transport }), 201);
  let p = await ok(api('get', '/plan'));
  assert.equal(p.plan, null);
  assert.equal(p.sales, '1500.00');
  assert.equal(p.spent, '520.00');
  p = await ok(api('put', '/plan', { month, salesTarget: 6000, expenseLimit: 1500, categoryLimits: { [transport]: 100 } }));
  assert.equal(p.plan.salesTarget, '6000.00');
  assert.equal(p.plan.carriedFrom, null);
  assert.equal(p.categories.find((c) => c.name === 'Transport').limit, '100.00');
  assert.equal(p.categories.find((c) => c.name === 'Rent').limit, null);
  assert.equal((await api('get', '/dashboard')).body.plan.expenseLimit, '1500.00');

  // Next month: last month's plan carries over until changed.
  const d = new Date(`${month}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1);
  const next = d.toISOString().slice(0, 7);
  p = await ok(api('get', `/plan?month=${next}`));
  assert.equal(p.plan.salesTarget, '6000.00');
  assert.equal(p.plan.carriedFrom, month);
  assert.equal(p.sales, '0.00');
});

test('savings goals follow the balance of the savings account', async () => {
  const acc = await ok(api('post', '/accounts', { kind: 'cash', name: 'Savings box' }), 201);
  let g = await ok(api('post', '/goals', { name: 'New photocopier', target: 3000, accountId: acc.id }), 201);
  assert.equal(g.goals[0].saved, '0.00');
  assert.equal(g.goals[0].pct, 0);
  await ok(api('post', '/transactions', { kind: 'transfer', accountId: cash, toAccountId: acc.id, amount: 750 }), 201);
  g = await ok(api('get', '/goals'));
  assert.equal(g.goals[0].saved, '750.00');
  assert.equal(g.goals[0].left, '2250.00');
  assert.equal(g.goals[0].pct, 25);
  assert.equal(g.goals[0].reached, false);
  assert.equal((await api('post', '/goals', { name: 'X', target: 0, accountId: acc.id })).status, 400);
  g = await ok(api('delete', `/goals/${g.goals[0].id}`));
  assert.equal(g.goals.length, 0);
});
