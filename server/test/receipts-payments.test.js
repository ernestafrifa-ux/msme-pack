// Receipts and payments account built from the cash book.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { pool } = require('../src/db');
const { migrate } = require('../db/migrate');
const { todayInGhana, addDays } = require('../src/dates');

const app = createApp();
const today = todayInGhana();
let token, other, biz, cash, momo;
const api = (method, path, body, t = token) => {
  const r = request(app)[method](`/api/businesses/${biz}${path}`).set('Authorization', `Bearer ${t}`);
  return body === undefined ? r : r.send(body);
};

before(async () => {
  const { rows } = await pool.query('SELECT current_database() AS db');
  if (!rows[0].db.endsWith('_test')) throw new Error(`Refusing to run tests against "${rows[0].db}".`);
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate({ log: () => {} });
  token = (await request(app).post('/api/auth/signup').send({ fullName: 'Adwoa Mensah', phone: '0244567890', password: 'books-2026' })).body.token;
  other = (await request(app).post('/api/auth/signup').send({ fullName: 'Kofi', phone: '0209998888', password: 'kofi-pass-1' })).body.token;
  biz = (await request(app).post('/api/businesses').set('Authorization', `Bearer ${token}`)
    .send({ name: 'Adom Books', cashOpeningBalance: 500, momo: { provider: 'MTN', openingBalance: 200 } })).body.business.id;
  const accts = (await api('get', '/accounts')).body.accounts;
  cash = accts.find((a) => a.kind === 'cash').id;
  momo = accts.find((a) => a.kind === 'mobile_money').id;
  const cats = (await api('get', '/categories')).body.categories;
  const cat = (n) => cats.find((c) => c.name === n).id;
  const book = (await api('post', '/products', { name: 'Exercise book', costPrice: 10, sellingPrice: 20, openingQty: 10 })).body.product.id;

  const T = (body) => api('post', '/transactions', body);
  await T({ kind: 'sale', accountId: cash, amount: 100, categoryId: cat('Product sales') });
  await T({ kind: 'sale', accountId: momo, amount: 50, momoFee: 1 });
  await T({ kind: 'expense', accountId: cash, amount: 30, categoryId: cat('Transport') });
  await T({ kind: 'expense', accountId: momo, amount: 20, categoryId: cat('Rent') });
  await T({ kind: 'purchase', accountId: cash, items: [{ productId: book, quantity: 2, unitPrice: 10 }] });
  await T({ kind: 'transfer', accountId: cash, toAccountId: momo, amount: 40 });
  await T({ kind: 'owner_draw', accountId: cash, amount: 25 });
  const inv = (await api('post', '/invoices', { newContact: { name: 'Bright Future Academy' },
    items: [{ productId: book, description: 'Exercise book', quantity: 3, unitPrice: 20 }] })).body.invoice;
  await api('post', `/invoices/${inv.id}/send`, {});
  await api('post', `/invoices/${inv.id}/payments`, { amount: 60, accountId: cash });
});
after(() => pool.end());

test('the statement balances: brought forward + receipts − payments = carried forward', async () => {
  const r = await api('get', '/reports/receipts-payments');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const s = r.body;
  assert.equal(s.from, `${today.slice(0, 7)}-01`);
  assert.equal(s.to, today);
  assert.equal(s.business.name, 'Adom Books');

  const bal = Object.fromEntries(s.accounts.map((a) => [a.name, a]));
  assert.equal(bal['Cash box'].opening, '500.00', 'opened this month: starts with its setup balance');
  assert.equal(bal['MTN MoMo'].opening, '200.00');
  assert.equal(bal['Cash box'].closing, '545.00'); // 500 + 100 − 30 − 20 − 40 − 25 + 60
  assert.equal(bal['MTN MoMo'].closing, '269.00'); // 200 + 50 − 1 − 20 + 40

  const line = (rows, l, c = null) => rows.find((x) => x.line === l && x.category === c);
  assert.equal(line(s.receipts, 'sale', 'Product sales').amount, '100.00');
  assert.equal(line(s.receipts, 'sale').amount, '50.00');
  assert.equal(line(s.receipts, 'invoice', 'Product sales').amount, '60.00');
  assert.equal(line(s.payments, 'purchase').amount, '20.00');
  assert.equal(line(s.payments, 'expense', 'Transport').amount, '30.00');
  assert.equal(line(s.payments, 'expense', 'Rent').amount, '20.00');
  assert.equal(line(s.payments, 'momo_fees').amount, '1.00');
  assert.equal(line(s.payments, 'owner_draw').amount, '25.00');
  assert.deepEqual(s.receipts.map((x) => x.line), ['sale', 'sale', 'invoice']);
  assert.deepEqual(s.payments.map((x) => x.line), ['purchase', 'expense', 'expense', 'momo_fees', 'owner_draw']);

  assert.deepEqual(s.totals, { opening: '700.00', receipts: '210.00', payments: '96.00', closing: '814.00', balanced: true });
  assert.deepEqual(s.transfers, { amount: '40.00', count: 1 }, 'transfers are shown but not counted');

  // Same closing figure as Home.
  const d = (await api('get', '/dashboard')).body;
  assert.equal(d.totalBalance, s.totals.closing);
});

test('a later period brings the balances forward', async () => {
  const tomorrow = addDays(today, 1);
  const s = (await api('get', `/reports/receipts-payments?from=${tomorrow}&to=${tomorrow}`)).body;
  assert.equal(s.totals.opening, '814.00');
  assert.equal(s.totals.receipts, '0.00');
  assert.equal(s.totals.closing, '814.00');
  assert.equal(s.totals.balanced, true);
});

test('a period before the business started is empty; bad periods and other users are refused', async () => {
  const y = addDays(today, -1);
  let r = await api('get', `/reports/receipts-payments?from=${y}&to=${y}`);
  assert.equal(r.body.accounts.length, 0);
  assert.equal(r.body.totals.closing, '0.00');
  r = await api('get', `/reports/receipts-payments?from=${today}&to=${y}`);
  assert.equal(r.status, 400);
  r = await api('get', '/reports/receipts-payments?from=15-10-2026');
  assert.equal(r.status, 400);
  r = await api('get', '/reports/receipts-payments', undefined, other);
  assert.equal(r.status, 404);
});
