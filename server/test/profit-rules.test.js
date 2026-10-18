// Profit rules from the bookshop test run: invoice cost follows payments,
// stock losses count against profit, and services can be sold from the product list.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { pool } = require('../src/db');
const { migrate } = require('../db/migrate');
const { userToken, createBusinessFor } = require('./helpers');

const app = createApp();
let token, biz, cash;
const ids = {};
const api = (method, path, body) => {
  const r = request(app)[method](`/api/businesses/${biz}${path}`).set('Authorization', `Bearer ${token}`);
  return body === undefined ? r : r.send(body);
};
const summary = async () => (await api('get', '/dashboard')).body.summary;

before(async () => {
  const { rows } = await pool.query('SELECT current_database() AS db');
  if (!rows[0].db.endsWith('_test')) throw new Error(`Refusing to run tests against "${rows[0].db}".`);
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate({ log: () => {} });
  token = await userToken(app, { fullName: 'Adwoa Mensah', phone: '0244567890', password: 'books-2026' });
  biz = (await createBusinessFor(app, token, { name: 'Adom Books', cashOpeningBalance: 500 })).body.business.id;
  cash = (await api('get', '/accounts')).body.accounts[0].id;
  ids.book = (await api('post', '/products', { name: 'Exercise book', costPrice: 10, sellingPrice: 20, openingQty: 50 })).body.product.id;
  ids.copy = (await api('post', '/products', { name: 'Photocopying', kind: 'service', unit: 'page', sellingPrice: 0.5 })).body.product.id;
});
after(() => pool.end());

test('an unpaid invoice does not pull profit down; cost follows each payment', async () => {
  let r = await api('post', '/invoices', {
    newContact: { name: 'Bright Future Academy' },
    items: [{ productId: ids.book, description: 'Exercise book', quantity: 10, unitPrice: 20 }],
  });
  ids.inv = r.body.invoice.id;
  await api('post', `/invoices/${ids.inv}/send`, {});
  let s = await summary();
  assert.equal(s.costOfSales, '0.00', 'nothing paid yet, so no cost yet');
  assert.equal(s.netProfitEstimate, '0.00');
  assert.equal(Number((await api('get', `/products/${ids.book}`)).body.product.onHand), 40, 'stock still leaves on sending');

  r = await api('post', `/invoices/${ids.inv}/payments`, { amount: 50, accountId: cash });
  ids.pay1 = r.body.invoice.payments[0].id;
  s = await summary();
  assert.equal(s.sales, '50.00');
  assert.equal(s.costOfSales, '25.00', 'a quarter paid, a quarter of the 100 cost');
  assert.equal(s.netProfitEstimate, '25.00');

  await api('post', `/invoices/${ids.inv}/payments`, { amount: 150, accountId: cash });
  s = await summary();
  assert.equal(s.costOfSales, '100.00');
  assert.equal(s.netProfitEstimate, '100.00');

  // Deleting a payment takes its share of the cost back out.
  r = await api('delete', `/transactions/${ids.pay1}`);
  assert.equal(r.status, 204);
  s = await summary();
  assert.equal(s.sales, '150.00');
  assert.equal(s.costOfSales, '75.00');
  assert.equal(s.netProfitEstimate, '75.00');
});

test('damaged stock and count differences count against profit, at cost', async () => {
  await api('post', `/products/${ids.book}/adjust`, { reason: 'damaged', quantity: 2 });
  let s = await summary();
  assert.equal(s.stockLosses, '20.00');
  assert.equal(s.netProfitEstimate, '55.00'); // 75 − 20

  // A count finding 1 more than the records (39 on the books after the damage) reduces the losses.
  await api('post', '/stock-count', { counts: [{ productId: ids.book, counted: 39 }] });
  s = await summary();
  assert.equal(s.stockLosses, '10.00');
  assert.equal(s.netProfitEstimate, '65.00');
});

test('services can be sold from the product list, but not bought as stock', async () => {
  let r = await api('post', '/transactions', { kind: 'sale', accountId: cash, items: [{ productId: ids.copy, quantity: 120, unitPrice: 0.5 }] });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.transaction.amount, '60.00');
  const s = await summary();
  assert.equal(s.costOfSales, '75.00', 'a service has no stock cost');
  assert.equal(s.netProfitEstimate, '125.00');

  r = await api('post', '/transactions', { kind: 'purchase', accountId: cash, items: [{ productId: ids.copy, quantity: 10, unitPrice: 1 }] });
  assert.equal(r.status, 400, 'services are not stock');
});
