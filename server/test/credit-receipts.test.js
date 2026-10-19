// Selling on credit (customers who owe), receipts, and due dates with reminders.
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
let token, biz, cash, momo, book;
const api = (method, path, body) => {
  const r = request(app)[method](`/api/businesses/${biz}${path}`).set('Authorization', `Bearer ${token}`);
  return body === undefined ? r : r.send(body);
};
const ok = async (p, code = 201) => { const r = await p; assert.equal(r.status, code, JSON.stringify(r.body)); return r.body; };

before(async () => {
  const { rows } = await pool.query('SELECT current_database() AS db');
  if (!rows[0].db.endsWith('_test')) throw new Error(`Refusing to run tests against "${rows[0].db}".`);
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate({ log: () => {} });
  token = await userToken(app, { fullName: 'Adwoa Mensah', phone: '0244567890', password: 'books-2026' });
  biz = (await createBusinessFor(app, token, { name: 'Adom Books', cashOpeningBalance: 500, momo: { provider: 'MTN', openingBalance: 0 } })).body.business.id;
  const accts = (await api('get', '/accounts')).body.accounts;
  cash = accts.find((a) => a.kind === 'cash').id;
  momo = accts.find((a) => a.kind === 'mobile_money').id;
  book = (await ok(api('post', '/products', { name: 'Exercise book', costPrice: 10, sellingPrice: 20, openingQty: 50 }))).product.id;
});
after(() => pool.end());

test('a sale paid later: stock leaves now, the customer owes, income counts as they pay', async () => {
  let r = await ok(api('post', '/credit-sales', { newContact: { name: 'Auntie Akos', phone: '0241231234' },
    items: [{ productId: book, quantity: 5, unitPrice: 20 }], dueDate: addDays(today, 7) }));
  assert.equal(r.invoice.total, '100.00');
  assert.equal(r.invoice.status, 'sent');
  const akos = r.invoice.contact.id;
  r = await ok(api('post', '/credit-sales', { contactId: akos, amount: 30, note: 'Pens' }));
  assert.equal(r.invoice.items[0].description, 'Pens');
  assert.equal((await api('post', '/credit-sales', { contactId: akos })).status, 400);

  assert.equal((await api('get', `/products/${book}`)).body.product.onHand, '45.000');
  let d = (await api('get', '/dashboard')).body;
  assert.equal(d.summary.sales, '0.00', 'nothing received yet');
  assert.equal(d.owed.total, '130.00');

  let c = (await api('get', '/customers')).body;
  assert.equal(c.customers[0].name, 'Auntie Akos');
  assert.equal(c.customers[0].owes, '130.00');
  assert.equal(c.totalOwed, '130.00');

  // She pays 110: settles the oldest (100) and 10 of the pens.
  assert.equal((await api('post', `/customers/${akos}/payments`, { amount: 200, accountId: cash })).status, 400);
  r = await ok(api('post', `/customers/${akos}/payments`, { amount: 110, accountId: momo, momoFee: 1 }));
  assert.equal(r.owes, '20.00');
  assert.equal(r.open.length, 1);
  assert.equal(r.payments.length, 2);
  d = (await api('get', '/dashboard')).body;
  assert.equal(d.summary.sales, '110.00');
  assert.equal(d.summary.costOfSales, '50.00', 'the books are fully paid: their cost counts');
  assert.equal(d.summary.momoFees, '1.00');
  r = await ok(api('post', `/customers/${akos}/payments`, { amount: 20, accountId: cash }));
  assert.equal(r.owes, '0.00');
  assert.equal((await api('post', `/customers/${akos}/payments`, { amount: 1, accountId: cash })).status, 409);
});

test('receipts: numbered once, shown to the customer by link', async () => {
  const sale = (await ok(api('post', '/transactions', { kind: 'sale', accountId: cash, items: [{ productId: book, quantity: 2, unitPrice: 20 }] }))).transaction;
  let r = await ok(api('post', `/transactions/${sale.id}/receipt`), 200);
  assert.equal(r.number, 1);
  const again = await ok(api('post', `/transactions/${sale.id}/receipt`), 200);
  assert.deepEqual(again, r, 'asking twice gives the same receipt');
  const pub = (await request(app).get(`/api/public/receipts/${r.token}`)).body;
  assert.equal(pub.business.name, 'Adom Books');
  assert.equal(pub.receipt.amount, '40.00');
  assert.equal(pub.receipt.items[0].name, 'Exercise book');
  assert.equal(pub.receipt.paidBy, 'cash');
  const exp = (await ok(api('post', '/transactions', { kind: 'expense', accountId: cash, amount: 5 }))).transaction;
  assert.equal((await api('post', `/transactions/${exp.id}/receipt`)).status, 400);
  const next = await ok(api('post', `/transactions/${(await ok(api('post', '/transactions', { kind: 'sale', accountId: cash, amount: 15 }))).transaction.id}/receipt`), 200);
  assert.equal(next.number, 2);
  assert.equal((await request(app).get('/api/public/receipts/not-a-real-token-123')).status, 404);
});

test('due dates on supplier bills and loans become reminders on Home', async () => {
  await ok(api('post', '/transactions', { kind: 'purchase', accountId: cash, items: [{ productId: book, quantity: 10, unitPrice: 10 }],
    onCredit: { supplier: 'Kejetia Wholesale', dueDate: addDays(today, 3) } }));
  const loan = (await ok(api('post', '/debts', { lender: 'Opportunity Microfinance', kind: 'microfinance', amount: 300, dueDate: addDays(today, 30) }))).debt;
  let rem = (await api('get', '/dashboard')).body.reminders;
  assert.equal(rem.length, 1);
  assert.equal(rem[0].lender, 'Kejetia Wholesale');
  assert.equal(rem[0].balance, '100.00');
  assert.equal(rem[0].overdue, false);
  await ok(api('patch', `/debts/${loan.id}`, { dueDate: addDays(today, -1) }), 200);
  rem = (await api('get', '/dashboard')).body.reminders;
  assert.equal(rem[0].lender, 'Opportunity Microfinance');
  assert.equal(rem[0].overdue, true);
  const debts = (await api('get', '/debts')).body.debts;
  assert.equal(debts.find((x) => x.lender === 'Kejetia Wholesale').dueDate, addDays(today, 3));
});
