// Statement of cash flows: every movement of money sorted into operating, investing and
// financing, ending on the same balances as Receipts and payments.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { pool } = require('../src/db');
const { migrate } = require('../db/migrate');
const { userToken, createBusinessFor } = require('./helpers');

const app = createApp();
let token, biz, cash, momo;
const api = (method, path, body) => {
  const r = request(app)[method](`/api/businesses/${biz}${path}`).set('Authorization', `Bearer ${token}`);
  return body === undefined ? r : r.send(body);
};
const ok = async (p) => { const r = await p; assert.ok(r.status < 300, `${r.status} ${JSON.stringify(r.body)}`); return r.body; };
const T = (b) => ok(api('post', '/transactions', b));

before(async () => {
  const { rows } = await pool.query('SELECT current_database() AS db');
  if (!rows[0].db.endsWith('_test')) throw new Error(`Refusing to run tests against "${rows[0].db}".`);
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate({ log: () => {} });
  token = await userToken(app, { fullName: 'Afia Asantewaa', phone: '0241110004', password: 'sew-2026-x' });
  biz = (await createBusinessFor(app, token, { name: 'Afia Couture', cashOpeningBalance: 1000, momo: { provider: 'MTN', openingBalance: 500 } })).body.business.id;
  const accts = (await api('get', '/accounts')).body.accounts;
  cash = accts.find((a) => a.kind === 'cash').id;
  momo = accts.find((a) => a.kind === 'mobile_money').id;
  const cats = (await api('get', '/categories')).body.categories;
  const cat = (n) => cats.find((c) => c.name === n).id;
  const fabric = (await ok(api('post', '/products', { name: 'Fabric', kind: 'supply', unit: 'yard', costPrice: 20 }))).product.id;

  await T({ kind: 'sale', accountId: cash, amount: 300, categoryId: cat('Service income') });
  await T({ kind: 'other_income', accountId: cash, amount: 50 });
  await T({ kind: 'purchase', accountId: cash, items: [{ productId: fabric, quantity: 5, unitPrice: 20 }] });
  await T({ kind: 'expense', accountId: momo, amount: 80, momoFee: 2, categoryId: cat('Rent') });
  await T({ kind: 'owner_capital', accountId: momo, amount: 400 });
  await T({ kind: 'owner_draw', accountId: cash, amount: 70 });
  await T({ kind: 'transfer', accountId: cash, toAccountId: momo, amount: 100, momoFee: 1 });
  // A bank loan into MoMo, part repaid with interest
  const loan = (await ok(api('post', '/debts', { lender: 'GCB Bank', kind: 'bank', amount: 1000, accountId: momo }))).debt;
  await ok(api('post', `/debts/${loan.id}/repayments`, { amount: 150, interest: 30, accountId: momo }));
  // Fabric on credit from a supplier, part paid: paying a supplier is operating, not financing
  await T({ kind: 'purchase', accountId: cash, onCredit: { supplier: 'Kejetia Textiles' }, items: [{ productId: fabric, quantity: 10, unitPrice: 20 }] });
  const sup = (await api('get', '/debts')).body.debts.find((d) => d.kind === 'supplier');
  await ok(api('post', `/debts/${sup.id}/repayments`, { amount: 120, accountId: cash }));
  // A sewing machine
  await ok(api('post', '/assets', { name: 'Sewing machine', cost: 600, accountId: cash }));
  // An invoice paid by MoMo counts as money from customers
  const inv = (await ok(api('post', '/invoices', { newContact: { name: 'Adwoa Darko' }, items: [{ description: 'Dress sewing', quantity: 2, unitPrice: 100 }] }))).invoice;
  await ok(api('post', `/invoices/${inv.id}/send`, {}));
  await ok(api('post', `/invoices/${inv.id}/payments`, { amount: 200, accountId: momo }));
});
after(() => pool.end());

test('cash flows are sorted into operating, investing and financing and end on the balances', async () => {
  const s = await ok(api('get', '/reports/cash-flow'));
  const by = (rows) => Object.fromEntries(rows.map((r) => [r.line, r.amount]));
  assert.deepEqual(by(s.operating), {
    customers: '500.00', // 300 cash sale + 200 invoice payment
    other_income: '50.00',
    suppliers: '-220.00', // 100 fabric bought + 120 paid to the supplier for fabric bought on credit
    expenses: '-80.00',
    momo_fees: '-3.00', // 2 on the rent + 1 on the transfer
    interest: '-30.00',
  });
  assert.deepEqual(by(s.investing), { equipment: '-600.00' });
  assert.deepEqual(by(s.financing), {
    owner_capital: '400.00', loans_received: '1000.00', loans_repaid: '-120.00', owner_draw: '-70.00',
  });
  assert.equal(s.totals.operating, '217.00');
  assert.equal(s.totals.investing, '-600.00');
  assert.equal(s.totals.financing, '1210.00');
  assert.equal(s.totals.change, '827.00');
  assert.equal(s.totals.opening, '1500.00', 'the cash box and MoMo balances the business started with');
  assert.equal(s.totals.closing, '2327.00');
  assert.equal(s.totals.balanced, true);
  // Same end balances as Receipts and payments and Home.
  const rp = (await api('get', '/reports/receipts-payments')).body;
  assert.equal(s.totals.closing, rp.totals.closing);
  const home = (await api('get', '/dashboard')).body;
  assert.equal(s.totals.closing, Number(home.totalBalance).toFixed(2));
});
