// Three trades that use products in their work: a hair salon (sells wigs and extensions,
// uses relaxer and extensions on clients), a beauty therapist (sells and uses nail polish),
// and a bakery (makes bread from flour, sugar and margarine).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { pool } = require('../src/db');
const { migrate } = require('../db/migrate');
const { userToken, createBusinessFor } = require('./helpers');

const app = createApp();
after(() => pool.end());
before(async () => {
  const { rows } = await pool.query('SELECT current_database() AS db');
  if (!rows[0].db.endsWith('_test')) throw new Error(`Refusing to run tests against "${rows[0].db}".`);
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate({ log: () => {} });
});

async function business(name, phone, sectorCode) {
  const token = await userToken(app, { fullName: `${name} Owner`, phone, password: 'trade-2026' });
  const biz = (await createBusinessFor(app, token, { name, sectorCode, cashOpeningBalance: 3000 })).body.business.id;
  const api = (method, path, body) => {
    const r = request(app)[method](`/api/businesses/${biz}${path}`).set('Authorization', `Bearer ${token}`);
    return body === undefined ? r : r.send(body);
  };
  const ok = async (call, status = [200, 201, 204]) => {
    const r = await call;
    assert.ok(status.includes(r.status), `${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  };
  const cash = (await api('get', '/accounts')).body.accounts[0].id;
  const product = async (body) => (await ok(api('post', '/products', body))).product.id;
  const pl = async () => ok(api('get', '/reports/profit-loss'));
  return { api, ok, cash, product, pl };
}

test('hair salon: wigs sold are cost of goods; relaxer and extensions used on clients are cost of sales, not losses', async () => {
  const { api, ok, cash, product, pl } = await business('Glamour Touch Salon', '0241110001', 'BEAUTY');
  const relaxer = await product({ name: 'Relaxer', kind: 'supply', unit: 'tub', costPrice: 45 });
  const packs = await product({ name: 'Braid extensions', unit: 'pack', costPrice: 12, sellingPrice: 20 });
  const wig = await product({ name: 'Human hair wig', unit: 'piece', costPrice: 400, sellingPrice: 650 });
  const braiding = await product({ name: 'Braiding', kind: 'service', unit: 'client', sellingPrice: 150 });
  const relaxing = await product({ name: 'Relaxing', kind: 'service', unit: 'client', sellingPrice: 80 });

  // Supplies are bought into stock like anything else.
  await ok(api('post', '/transactions', { kind: 'purchase', accountId: cash, items: [
    { productId: relaxer, quantity: 10, unitPrice: 45 }, { productId: packs, quantity: 40, unitPrice: 12 },
    { productId: wig, quantity: 5, unitPrice: 400 }] }));
  // ...but a supply cannot be sold or invoiced.
  let r = await api('post', '/transactions', { kind: 'sale', accountId: cash, items: [{ productId: relaxer, quantity: 1, unitPrice: 60 }] });
  assert.equal(r.status, 400);
  r = await api('post', '/invoices', { newContact: { name: 'Ama' }, items: [{ productId: relaxer, description: 'Relaxer', quantity: 1, unitPrice: 60 }] });
  assert.equal(r.status, 400);

  await ok(api('post', '/transactions', { kind: 'sale', accountId: cash, items: [{ productId: wig, quantity: 1, unitPrice: 650 }] }));
  await ok(api('post', '/transactions', { kind: 'sale', accountId: cash, items: [
    { productId: braiding, quantity: 3, unitPrice: 150 }, { productId: relaxing, quantity: 5, unitPrice: 80 }] }));
  // Extensions used on the braiding clients (12 packs) and relaxer used (2 tubs).
  await ok(api('post', `/products/${packs}/adjust`, { reason: 'used', quantity: 12 }));
  await ok(api('post', `/products/${relaxer}/adjust`, { reason: 'used', quantity: 2 }));

  const p = await pl();
  assert.equal(p.totals.income, '1500.00');
  assert.equal(p.totals.costOfGoods, '400.00', 'the wig sold');
  assert.equal(p.totals.materialsUsed, '234.00', '12 packs × 12 + 2 tubs × 45');
  assert.equal(p.totals.costOfSales, '634.00');
  assert.equal(p.totals.grossProfit, '866.00');
  assert.equal(p.expenses.find((e) => e.line === 'stock_losses'), undefined, 'products used are not a loss');
  assert.equal(p.totals.netProfit, '866.00');

  const s = (await api('get', '/dashboard')).body.summary;
  assert.equal(s.materialsUsed, '234.00');
  assert.equal(s.costOfSales, '634.00');
  assert.equal(s.stockLosses, '0.00');

  const st = (await api('get', '/reports/stock')).body.items;
  const rel = st.find((i) => i.name === 'Relaxer');
  assert.equal(rel.used, '2');
  assert.equal(rel.closing, '8');
  assert.equal(rel.slow, false, 'a supply is never "not selling"');
});

test('beauty therapist: a supply counted short was used; polish both sold and used', async () => {
  const { api, ok, cash, product, pl } = await business('Serene Skin & Nails', '0241110002', 'BEAUTY');
  const polish = await product({ name: 'Nail polish', unit: 'bottle', costPrice: 15, sellingPrice: 25 });
  const powder = await product({ name: 'Acrylic powder', kind: 'supply', unit: 'jar', costPrice: 120 });
  const manicure = await product({ name: 'Manicure', kind: 'service', unit: 'client', sellingPrice: 60 });
  const acrylic = await product({ name: 'Acrylic nails', kind: 'service', unit: 'client', sellingPrice: 150 });
  await ok(api('post', '/transactions', { kind: 'purchase', accountId: cash, items: [
    { productId: polish, quantity: 20, unitPrice: 15 }, { productId: powder, quantity: 2, unitPrice: 120 }] }));
  await ok(api('post', '/transactions', { kind: 'sale', accountId: cash, items: [
    { productId: polish, quantity: 2, unitPrice: 25 }, { productId: manicure, quantity: 4, unitPrice: 60 },
    { productId: acrylic, quantity: 2, unitPrice: 150 }] }));
  await ok(api('post', `/products/${polish}/adjust`, { reason: 'used', quantity: 3 }));
  // Weekly count: 1.5 jars of powder left of 2, so half a jar was used.
  const c = await ok(api('post', '/stock-count', { counts: [{ productId: powder, counted: 1.5 }] }));
  assert.equal(c.changed[0].used, true);
  // A product for sale counted short is still a loss (it should have been sold).
  await ok(api('post', '/stock-count', { counts: [{ productId: polish, counted: 14 }] }));

  const p = await pl();
  assert.equal(p.totals.income, '590.00');
  assert.equal(p.totals.costOfGoods, '30.00');
  assert.equal(p.totals.materialsUsed, '105.00', '3 bottles × 15 + half a jar × 120');
  assert.equal(p.expenses.find((e) => e.line === 'stock_losses').amount, '15.00', 'one bottle missing');
  assert.equal(p.totals.netProfit, '440.00');

  // A product for sale can be turned into a supply (and back).
  const r = await ok(api('patch', `/products/${polish}`, { kind: 'supply' }));
  assert.equal(r.product.kind, 'supply');
  assert.equal((await api('patch', `/products/${manicure}`, { kind: 'supply' })).status, 400);
});

test('bakery: ingredients made into bread count once, when the bread is sold', async () => {
  const { api, ok, cash, product, pl } = await business('Sweet Crumbs Bakery', '0241110003', 'FOOD');
  const flour = await product({ name: 'Flour', kind: 'supply', unit: 'kg', costPrice: 13 });
  const sugar = await product({ name: 'Sugar', kind: 'supply', unit: 'kg', costPrice: 12 });
  const marg = await product({ name: 'Margarine', kind: 'supply', unit: 'tub', costPrice: 30 });
  const bread = await product({ name: 'Bread', unit: 'loaf', sellingPrice: 15 });
  await ok(api('post', '/transactions', { kind: 'purchase', accountId: cash, items: [
    { productId: flour, quantity: 50, unitPrice: 13 }, { productId: sugar, quantity: 10, unitPrice: 12 },
    { productId: marg, quantity: 5, unitPrice: 30 }] }));

  const made = await ok(api('post', `/products/${bread}/make`, { quantity: 40, used: [
    { productId: flour, quantity: 20 }, { productId: sugar, quantity: 2 }, { productId: marg, quantity: 1 }] }));
  assert.equal(made.batchCost, '314.00', '20 × 13 + 2 × 12 + 1 × 30');
  assert.equal(made.unitCost, '7.85');
  assert.equal(made.product.costPrice, '7.85');
  assert.equal(Number(made.product.onHand), 40);

  // Making moves value between items: nothing is a cost yet.
  let p = await pl();
  assert.equal(p.totals.costOfSales, '0.00');
  assert.equal(p.totals.netProfit, '0.00');

  await ok(api('post', '/transactions', { kind: 'sale', accountId: cash, items: [{ productId: bread, quantity: 30, unitPrice: 15 }] }));
  p = await pl();
  assert.equal(p.totals.income, '450.00');
  assert.equal(p.totals.costOfSales, '235.50', '30 loaves × 7.85');
  assert.equal(p.totals.netProfit, '214.50');

  // Stock still adds up: 920 bought − 235.50 sold = 684.50 left.
  const st = (await api('get', '/reports/stock')).body;
  assert.equal(st.totals.value, '684.50');
  assert.equal(st.items.find((i) => i.name === 'Flour').used, '20');

  // A second batch at a different cost averages with the 10 loaves left.
  const second = await ok(api('post', `/products/${bread}/make`, { quantity: 10, used: [{ productId: flour, quantity: 10 }] }));
  assert.equal(second.unitCost, '13.00');
  assert.equal(second.product.costPrice, '10.43', '(10 × 7.85 + 130) / 20');

  // Making without listing ingredients keeps the cost price (ingredients bought as expenses).
  const plain = await ok(api('post', `/products/${bread}/make`, { quantity: 5 }));
  assert.equal(plain.unitCost, '10.43');

  // Guards.
  assert.equal((await api('post', `/products/${bread}/make`, { quantity: 2, used: [{ productId: bread, quantity: 1 }] })).status, 400);
  assert.equal((await api('post', `/products/${flour}/make`, { quantity: 2 })).status, 400, 'a supply is not made');
});
