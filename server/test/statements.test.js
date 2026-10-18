// Profit and loss, stock report, debtors, sales by product, loans, equipment and the balance sheet.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { pool } = require('../src/db');
const { migrate } = require('../db/migrate');
const { todayInGhana, addDays } = require('../src/dates');

const app = createApp();
const today = todayInGhana();
let token, other, biz, cash;
const ids = {};
const api = (method, path, body, t = token) => {
  const r = request(app)[method](`/api/businesses/${biz}${path}`).set('Authorization', `Bearer ${t}`);
  return body === undefined ? r : r.send(body);
};
const ok = async (p, code = 201) => { const r = await p; assert.equal(r.status, code, JSON.stringify(r.body)); return r.body; };

before(async () => {
  const { rows } = await pool.query('SELECT current_database() AS db');
  if (!rows[0].db.endsWith('_test')) throw new Error(`Refusing to run tests against "${rows[0].db}".`);
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate({ log: () => {} });
  token = (await request(app).post('/api/auth/signup').send({ fullName: 'Adwoa Mensah', phone: '0244567890', password: 'books-2026' })).body.token;
  other = (await request(app).post('/api/auth/signup').send({ fullName: 'Kofi', phone: '0209998888', password: 'kofi-pass-1' })).body.token;
  biz = (await request(app).post('/api/businesses').set('Authorization', `Bearer ${token}`)
    .send({ name: 'Adom Books', cashOpeningBalance: 1000 })).body.business.id;
  cash = (await api('get', '/accounts')).body.accounts[0].id;
  const cats = (await api('get', '/categories')).body.categories;
  const rent = cats.find((c) => c.name === 'Rent').id;
  ids.a = (await ok(api('post', '/products', { name: 'Exercise book', costPrice: 10, sellingPrice: 20, openingQty: 50, reorderLevel: 5 }))).product.id;
  ids.s = (await ok(api('post', '/products', { name: 'Photocopying', kind: 'service', unit: 'page', sellingPrice: 5 }))).product.id;

  await ok(api('post', '/transactions', { kind: 'sale', accountId: cash,
    items: [{ productId: ids.a, quantity: 5, unitPrice: 20 }, { productId: ids.s, quantity: 4, unitPrice: 5 }] }));
  await ok(api('post', '/transactions', { kind: 'expense', accountId: cash, amount: 30, categoryId: rent }));
  await ok(api('post', `/products/${ids.a}/adjust`, { reason: 'damaged', quantity: 1 }));
  ids.credit = (await ok(api('post', '/transactions', { kind: 'purchase', accountId: cash,
    items: [{ productId: ids.a, quantity: 10, unitPrice: 12 }], onCredit: { supplier: 'Kejetia Wholesale' } }))).transaction;
});
after(() => pool.end());

test('stock bought on credit adds stock and a supplier debt, but moves no money', async () => {
  assert.equal(ids.credit.isCredit, true);
  assert.equal(ids.credit.lender, 'Kejetia Wholesale');
  const d = (await api('get', '/dashboard')).body;
  assert.equal(d.totalBalance, '1090.00', '1000 + 120 sale − 30 rent; the credit purchase moved no money');
  const debts = (await api('get', '/debts')).body;
  assert.equal(debts.debts.length, 1);
  assert.equal(debts.debts[0].kind, 'supplier');
  assert.equal(debts.debts[0].balance, '120.00');
  assert.equal(debts.debts[0].boughtOnCredit, true);
  ids.supplierDebt = debts.debts[0].id;
});

test('loans: money in, repayments with interest, limits and deleting', async () => {
  let r = await ok(api('post', '/debts', { lender: 'Opportunity Microfinance', kind: 'microfinance', amount: 500, accountId: cash }));
  ids.loan = r.debt.id;
  assert.equal(r.debt.receivedInto, 'Cash box');
  assert.equal((await api('get', '/dashboard')).body.totalBalance, '1590.00');

  r = await api('post', `/debts/${ids.loan}/repayments`, { amount: 610, interest: 10, accountId: cash });
  assert.equal(r.status, 400, 'more than the loan itself');
  r = await api('post', `/debts/${ids.loan}/repayments`, { amount: 10, interest: 20, accountId: cash });
  assert.equal(r.status, 400, 'interest above the payment');
  r = await ok(api('post', `/debts/${ids.loan}/repayments`, { amount: 110, interest: 10, accountId: cash }));
  assert.equal(r.debt.balance, '400.00');
  assert.equal(r.debt.interestPaid, '10.00');
  await ok(api('post', `/debts/${ids.supplierDebt}/repayments`, { amount: 50, accountId: cash }));

  // A loan with repayments, or one from a credit purchase, cannot simply be deleted.
  assert.equal((await api('delete', `/debts/${ids.loan}`)).status, 409);
  assert.equal((await api('delete', `/debts/${ids.supplierDebt}`)).status, 409);
  assert.equal((await api('delete', `/transactions/${ids.credit.id}`)).status, 409, 'part of it has been paid');
  // The money received cannot be deleted from Records either.
  const recs = (await api('get', '/transactions?kind=loan_received')).body.transactions;
  assert.equal((await api('delete', `/transactions/${recs[0].id}`)).status, 409);

  // An old loan, not received through the app, deletes cleanly.
  const old = await ok(api('post', '/debts', { lender: 'Uncle Kwame', kind: 'family', amount: 200 }));
  assert.equal(old.debt.receivedInto, null);
  await ok(api('delete', `/debts/${old.debt.id}`), 204);

  const list = (await api('get', '/debts')).body;
  assert.equal(list.totalOwed, '470.00'); // 400 microfinance + 70 supplier
  const detail = (await api('get', `/debts/${ids.loan}`)).body;
  assert.equal(detail.repayments.length, 1);
  assert.equal(detail.repayments[0].principal, '100.00');
});

test('equipment: paid from cash or bought earlier, value updated, mistakes deleted', async () => {
  const p = await ok(api('post', '/assets', { name: 'Photocopier', cost: 300, accountId: cash }));
  assert.equal(p.asset.currentValue, '300.00');
  await ok(api('patch', `/assets/${p.asset.id}`, { currentValue: 250 }), 200);
  await ok(api('post', '/assets', { name: 'Shelves', cost: 80 }));
  const wrong = await ok(api('post', '/assets', { name: 'Typo', cost: 40, accountId: cash }));
  await ok(api('delete', `/assets/${wrong.asset.id}`), 204);
  const list = (await api('get', '/assets')).body;
  assert.equal(list.assets.length, 2);
  assert.equal(list.totalValue, '330.00');
  assert.equal(list.assets.find((a) => a.name === 'Photocopier').paidFrom, 'Cash box');

  // Invoices: one paid now, one due in 10 days and unpaid.
  const i1 = (await ok(api('post', '/invoices', { newContact: { name: 'Bright Future Academy' }, dueDate: addDays(today, 10),
    items: [{ productId: ids.a, description: 'Exercise book', quantity: 2, unitPrice: 20 }] }))).invoice;
  await ok(api('post', `/invoices/${i1.id}/send`, {}), 200);
  const i2 = (await ok(api('post', '/invoices', { newContact: { name: 'Akua Boateng' }, dueDate: addDays(today, 14),
    items: [{ productId: ids.a, description: 'Exercise book', quantity: 1, unitPrice: 20 }] }))).invoice;
  await ok(api('post', `/invoices/${i2.id}/send`, {}), 200);
  await ok(api('post', `/invoices/${i2.id}/payments`, { amount: 20, accountId: cash }));
  assert.equal((await api('get', '/dashboard')).body.totalBalance, '1150.00');
});

test('profit and loss uses the same rules as Home, with loan interest as an expense', async () => {
  const s = (await api('get', '/reports/profit-loss')).body;
  assert.equal(s.totals.income, '140.00'); // 120 sales + 20 invoice payment
  assert.equal(s.totals.costOfSales, '62.00'); // 5 × 10 + paid invoice 1 × 12
  assert.equal(s.totals.grossProfit, '78.00');
  const line = (l, c = null) => s.expenses.find((x) => x.line === l && x.category === c)?.amount;
  assert.equal(line('expense', 'Rent'), '30.00');
  assert.equal(line('interest'), '10.00');
  assert.equal(line('stock_losses'), '10.00');
  assert.equal(s.totals.expenses, '50.00');
  assert.equal(s.totals.netProfit, '28.00');
  const d = (await api('get', '/dashboard')).body;
  assert.equal(d.summary.netProfitEstimate, s.totals.netProfit, 'matches Home');
});

test('receipts and payments include the loan, repayments and equipment', async () => {
  const s = (await api('get', '/reports/receipts-payments')).body;
  const line = (rows, l) => rows.filter((x) => x.line === l).reduce((t, x) => t + Number(x.amount), 0);
  assert.equal(line(s.receipts, 'loan_received'), 500);
  assert.equal(line(s.payments, 'loan_repayment'), 160);
  assert.equal(line(s.payments, 'equipment'), 300);
  assert.equal(line(s.payments, 'purchase'), 0, 'the credit purchase moved no money');
  assert.deepEqual(s.totals, { opening: '1000.00', receipts: '640.00', payments: '490.00', closing: '1150.00', balanced: true });
});

test('stock report and sales by product', async () => {
  const s = (await api('get', '/reports/stock')).body;
  assert.equal(s.items.length, 1, 'services have no stock');
  const a = s.items[0];
  assert.deepEqual([a.stockIn, a.sold, a.lost, a.counted, a.closing], ['60', '8', '1', '0', '51']);
  assert.equal(a.value, '612.00'); // 51 × 12
  assert.equal(s.totals.value, '612.00');

  const p = (await api('get', '/reports/sales-by-product')).body;
  assert.deepEqual(p.items.map((i) => i.name), ['Exercise book', 'Photocopying']);
  assert.deepEqual([p.items[0].qty, p.items[0].sales, p.items[0].cost, p.items[0].profit], ['8', '160.00', '86.00', '74.00']);
  assert.deepEqual([p.items[1].qty, p.items[1].sales, p.items[1].cost, p.items[1].margin], ['4', '20.00', '0.00', 100]);
  assert.equal(p.totals.sales, '180.00');
});

test('debtors are grouped by customer and by how late they are', async () => {
  let s = (await api('get', '/reports/debtors')).body;
  assert.equal(s.customers.length, 1);
  assert.equal(s.customers[0].customer, 'Bright Future Academy');
  assert.equal(s.totals.notDue, '40.00');
  assert.equal(s.totals.total, '40.00');
  s = (await api('get', `/reports/debtors?asOf=${addDays(today, 45)}`)).body;
  assert.equal(s.totals.d31_60, '40.00', '35 days late');
  assert.equal(s.customers[0].invoices[0].daysOverdue, 35);
});

test('balance sheet: what the business owns, what it owes, and the difference', async () => {
  const s = (await api('get', '/reports/balance-sheet')).body;
  assert.equal(s.assets.cashTotal, '1150.00');
  assert.equal(s.assets.stock, '612.00');
  assert.equal(s.assets.debtors, '40.00');
  assert.equal(s.assets.equipmentTotal, '330.00');
  assert.equal(s.assets.total, '2132.00');
  assert.deepEqual(s.liabilities.debts.map((d) => [d.name, d.amount]).sort(),
    [['Kejetia Wholesale', '70.00'], ['Opportunity Microfinance', '400.00']]);
  assert.equal(s.liabilities.total, '470.00');
  assert.equal(s.equity, '1662.00');

  // Before the business started there is nothing.
  const empty = (await api('get', `/reports/balance-sheet?asOf=${addDays(today, -1)}`)).body;
  assert.equal(empty.assets.total, '0.00');
});

test('other businesses cannot see these', async () => {
  for (const path of ['/reports/profit-loss', '/reports/stock', '/reports/debtors', '/reports/sales-by-product',
    '/reports/balance-sheet', '/debts', '/assets']) {
    assert.equal((await api('get', path, undefined, other)).status, 404, path);
  }
});
