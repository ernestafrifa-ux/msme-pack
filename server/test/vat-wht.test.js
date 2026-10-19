// VAT (NHIL 2.5% + GETFund 2.5% + VAT 15%) on invoices, tax withheld by customers (WHT),
// VAT paid to GRA, and how each shows on the statements.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { pool } = require('../src/db');
const { migrate } = require('../db/migrate');
const { userToken, createBusinessFor } = require('./helpers');
const { vatOn, vatFromInclusive, whtOn } = require('../src/tax');

const app = createApp();
let token, biz, cash;
const ids = {};
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
  token = await userToken(app, { fullName: 'Ama Owusu', phone: '0244111222', password: 'print-2026' });
  biz = (await createBusinessFor(app, token, { name: 'Owusu Print House', cashOpeningBalance: 1000 })).body.business.id;
  cash = (await api('get', '/accounts')).body.accounts[0].id;
  ids.print = (await ok(api('post', '/products', { name: 'Banner printing', kind: 'service', unit: 'job', sellingPrice: 2000 }))).product.id;
  ids.paper = (await ok(api('post', '/products', { name: 'A4 paper ream', costPrice: 10, sellingPrice: 20, openingQty: 200 }))).product.id;
});
after(() => pool.end());

test('the calculator matches the 2026 rates', () => {
  assert.deepEqual(vatOn(2000), { exclusive: 2000, nhil: 50, getfund: 50, vat: 300, tax: 400, inclusive: 2400 });
  assert.equal(vatFromInclusive(2400).exclusive, 2000);
  assert.equal(vatFromInclusive(1000).tax, 166.67);
  assert.equal(whtOn(2000, 'services'), 0, 'GHS 2,000 and below: no withholding');
  assert.equal(whtOn(2000.01, 'services'), 150);
  assert.equal(whtOn(3000, 'goods'), 90);
});

test('a VAT-registered business adds NHIL, GETFund and VAT to its invoices', async () => {
  let d = (await api('get', '/invoices/defaults')).body;
  assert.equal(d.vatRegistered, false);
  assert.equal(d.taxScheme, 'none');
  const b = await ok(api('patch', '', { vatRegistered: true }), 200);
  assert.equal(b.business.vatRegistered, true);
  d = (await api('get', '/invoices/defaults')).body;
  assert.equal(d.taxScheme, 'vat');

  const inv = (await ok(api('post', '/invoices', { newContact: { name: 'Kumasi Metro Assembly' }, taxScheme: 'vat',
    items: [{ productId: ids.print, description: 'Banner printing', quantity: 1, unitPrice: 2000 }] }))).invoice;
  assert.equal(inv.taxScheme, 'vat');
  assert.equal(inv.taxLabel, 'VAT, NHIL & GETFund');
  assert.equal(inv.taxable, '2000.00');
  assert.equal(inv.nhil, '50.00');
  assert.equal(inv.getfund, '50.00');
  assert.equal(inv.vat, '300.00');
  assert.equal(inv.taxAmount, '400.00');
  assert.equal(inv.total, '2400.00');
  ids.inv = inv;
  await ok(api('post', `/invoices/${inv.id}/send`, {}), 200);
  const pub = (await request(app).get(`/api/public/invoices/${inv.shareToken}`)).body;
  assert.equal(pub.invoice.nhil, '50.00');

  // Before payment: the balance sheet owes the whole tax to GRA.
  const bs = (await api('get', '/reports/balance-sheet')).body;
  assert.equal(bs.liabilities.taxOwed, '400.00');
  assert.equal(bs.assets.debtors, '2400.00');
});

test('tax withheld by the customer settles the invoice without moving money', async () => {
  let r = await api('post', `/invoices/${ids.inv.id}/payments`, { amount: 2300, wht: 150, accountId: cash });
  assert.equal(r.status, 400, 'money plus tax withheld is more than owed');
  r = await ok(api('post', `/invoices/${ids.inv.id}/payments`, { amount: 2250, wht: 150, accountId: cash }));
  assert.equal(r.invoice.status, 'paid');
  assert.equal(r.invoice.outstanding, '0.00');

  const dash = (await api('get', '/dashboard')).body;
  assert.equal(dash.totalBalance, '3250.00', 'only the 2,250 received');
  const whts = (await api('get', '/transactions?kind=wht')).body.transactions;
  assert.equal(whts.length, 1);
  assert.equal(whts[0].amount, '150.00');

  const pl = (await api('get', '/reports/profit-loss')).body;
  assert.equal(pl.totals.income, '2000.00', 'tax-exclusive: 2,250 + 150 withheld − 400 tax');
  assert.equal(pl.taxLeftOut, '400.00');
  assert.equal(pl.whtIncluded, '150.00');

  const rp = (await api('get', '/reports/receipts-payments')).body;
  assert.equal(rp.totals.receipts, '2250.00');
  assert.ok(!rp.receipts.some((x) => x.line === 'wht'));
  assert.equal(rp.totals.balanced, true);

  const bs = (await api('get', '/reports/balance-sheet')).body;
  assert.equal(bs.assets.whtCredit, '150.00');
  assert.equal(bs.assets.debtors, '0.00');
  assert.equal(bs.liabilities.taxOwed, '400.00');
  assert.equal(bs.equity, '5000.00', '1,000 cash + 2,000 opening stock + 2,000 profit');
});

test('goods invoice with VAT and 3% withheld: the full cost of goods counts', async () => {
  const inv = (await ok(api('post', '/invoices', { newContact: { name: 'Prempeh College' }, taxScheme: 'vat',
    items: [{ productId: ids.paper, description: 'A4 paper ream', quantity: 150, unitPrice: 20 }] }))).invoice;
  assert.equal(inv.total, '3600.00');
  await ok(api('post', `/invoices/${inv.id}/send`, {}), 200);
  await ok(api('post', `/invoices/${inv.id}/payments`, { amount: 3510, wht: 90, accountId: cash }));
  const pl = (await api('get', '/reports/profit-loss')).body;
  assert.equal(pl.totals.income, '5000.00');
  assert.equal(pl.totals.costOfSales, '1500.00');
  const dash = (await api('get', '/dashboard')).body;
  assert.equal(dash.summary.sales, '5000.00');
});

test('tax summary and paying VAT to GRA', async () => {
  let s = (await api('get', '/tax/summary')).body;
  assert.equal(s.vatRegistered, true);
  assert.equal(s.charged.invoices, 2);
  assert.equal(s.charged.taxable, '5000.00');
  assert.equal(s.charged.nhil, '125.00');
  assert.equal(s.charged.getfund, '125.00');
  assert.equal(s.charged.vat, '750.00');
  assert.equal(s.charged.total, '1000.00');
  assert.equal(s.owed, '1000.00');
  assert.equal(s.withheld.total, '240.00');

  assert.equal((await api('post', '/tax/vat-payments', { amount: 0, accountId: cash })).status, 400);
  await ok(api('post', '/tax/vat-payments', { amount: 1000, accountId: cash, paymentRef: 'GRA-123' }));
  s = (await api('get', '/tax/summary')).body;
  assert.equal(s.owed, '0.00');
  assert.equal(s.paid.total, '1000.00');
  assert.equal((await api('get', '/dashboard')).body.totalBalance, '5760.00'); // 3,250 + 3,510 − 1,000

  const rp = (await api('get', '/reports/receipts-payments')).body;
  assert.equal(rp.payments.find((x) => x.line === 'vat_payment').amount, '1000.00');
  assert.equal(rp.totals.balanced, true);
  const pl = (await api('get', '/reports/profit-loss')).body;
  assert.equal(pl.totals.netProfit, '3500.00', 'paying VAT is not an expense');
  const bs = (await api('get', '/reports/balance-sheet')).body;
  assert.equal(bs.liabilities.taxOwed, '0.00');
  assert.equal(bs.equity, '6500.00', '1,000 cash + 2,000 opening stock + 3,500 profit');
});

test('a business that is not VAT-registered keeps its own tax line', async () => {
  await ok(api('patch', '', { vatRegistered: false }), 200);
  const inv = (await ok(api('post', '/invoices', { newContact: { name: 'Akua' }, taxScheme: 'custom', taxLabel: 'Levy', taxRate: 10,
    items: [{ description: 'Design', quantity: 1, unitPrice: 100 }] }))).invoice;
  assert.equal(inv.taxScheme, 'custom');
  assert.equal(inv.total, '110.00');
  const plain = (await ok(api('post', '/invoices', { contactId: inv.contact?.id || undefined, newContact: inv.contact?.id ? undefined : { name: 'Yaw' },
    items: [{ description: 'Design', quantity: 1, unitPrice: 100 }] }))).invoice;
  assert.equal(plain.taxScheme, 'none');
  assert.equal(plain.total, '100.00');
});

test('VAT on everyday sales and on purchases (input VAT)', async () => {
  // Not registered (switched off in the previous test): refused.
  let r = await api('post', '/transactions', { kind: 'sale', accountId: cash, amount: 120, vat: true });
  assert.equal(r.status, 400);
  await ok(api('patch', '', { vatRegistered: true }), 200);
  const before = (await api('get', '/tax/summary')).body;
  const bsBefore = (await api('get', '/reports/balance-sheet')).body;

  // A cash sale of 1,200 including VAT: 1,000 sales + 200 tax for GRA.
  r = await ok(api('post', '/transactions', { kind: 'sale', accountId: cash, amount: 1200, vat: true }));
  assert.equal(r.transaction.taxAmount, '200.00');
  // Rent with a VAT invoice: 600 = 500 cost + 100 to claim back.
  const cats = (await api('get', '/categories')).body.categories;
  r = await ok(api('post', '/transactions', { kind: 'expense', accountId: cash, amount: 600, vat: true,
    categoryId: cats.find((c) => c.name === 'Rent').id }));
  assert.equal(r.transaction.taxAmount, '100.00');
  // 10 packs of envelopes at 24 with VAT: stock worth 20 each.
  const env = (await ok(api('post', '/products', { name: 'Envelopes', costPrice: 20, sellingPrice: 30 }))).product.id;
  r = await ok(api('post', '/transactions', { kind: 'purchase', accountId: cash, vat: true,
    items: [{ productId: env, quantity: 10, unitPrice: 24 }] }));
  assert.equal(r.transaction.taxAmount, '40.00');
  const p = (await api('get', `/products/${env}`)).body.product;
  assert.equal(p.costPrice, '20.00');
  assert.equal((await api('post', '/transactions', { kind: 'transfer', accountId: cash, toAccountId: cash, amount: 1, vat: true })).status, 400);

  const s = (await api('get', '/tax/summary')).body;
  assert.equal(s.cashSales.tax, '200.00');
  assert.equal(s.cashSales.base, '1000.00');
  assert.equal(s.input.tax, '140.00');
  assert.equal(s.owed, money2(Number(before.owed) + 200 - 140));

  const pl = (await api('get', '/reports/profit-loss')).body;
  assert.equal(pl.expenses.find((x) => x.category === 'Rent').amount, '500.00');
  const bs = (await api('get', '/reports/balance-sheet')).body;
  // Equity moves by profit only: +1,000 sale − 500 rent (the stock purchase just swaps cash for stock).
  assert.equal(bs.equity, money2(Number(bsBefore.equity) + 1000 - 500));
});

function money2(n) { return (Math.round(n * 100) / 100).toFixed(2); }
