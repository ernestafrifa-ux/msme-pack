// Stock and invoices, end to end against a real PostgreSQL test database.
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
const ids = {};

const api = (method, path, body) => {
  const r = request(app)[method](`/api/businesses/${biz}${path}`).set('Authorization', `Bearer ${token}`);
  return body === undefined ? r : r.send(body);
};
const stockOf = async (productId) => Number((await api('get', `/products/${productId}`)).body.product.onHand);

before(async () => {
  const { rows } = await pool.query('SELECT current_database() AS db');
  if (!rows[0].db.endsWith('_test')) throw new Error(`Refusing to run tests against "${rows[0].db}".`);
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate({ log: () => {} });

  let r = await request(app).post('/api/auth/signup').send({ fullName: 'Ama Mensah', phone: '0241112222', password: 'shito-2026' });
  token = r.body.token;
  r = await request(app).post('/api/auth/signup').send({ fullName: 'Kofi', phone: '0209998888', password: 'kofi-pass-1' });
  other = r.body.token;
  r = await request(app).post('/api/businesses').set('Authorization', `Bearer ${token}`)
    .send({ name: "Ama's Shito", cashOpeningBalance: 1000, momo: { provider: 'MTN', openingBalance: 0 } });
  biz = r.body.business.id;
  const accts = (await api('get', '/accounts')).body.accounts;
  cash = accts.find((a) => a.kind === 'cash').id;
  momo = accts.find((a) => a.kind === 'mobile_money').id;
});
after(() => pool.end());

test('create products with opening stock', async () => {
  let r = await api('post', '/products', { name: 'Shito 250ml jar', unit: 'jar', costPrice: 12, sellingPrice: 25, reorderLevel: 20, openingQty: 50 });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  ids.shito = r.body.product.id;
  assert.equal(r.body.product.onHand, '50.000');
  assert.equal(r.body.product.valueAtCost, '600.00');

  r = await api('post', '/products', { name: 'Ground pepper 100g', unit: 'sachet', costPrice: 7, sellingPrice: 15, reorderLevel: 10, openingQty: 40 });
  ids.pepper = r.body.product.id;

  r = await api('post', '/products', { name: 'Catering (per tray)', kind: 'service', sellingPrice: 100 });
  ids.catering = r.body.product.id;
  assert.equal(r.body.product.onHand, null, 'services have no stock');

  r = await api('post', '/products', { name: 'X', costPrice: -1 });
  assert.equal(r.status, 400);

  r = await api('get', '/products');
  assert.equal(r.body.products.length, 3);
  assert.equal(r.body.summary.valueAtCost, '880.00'); // 50×12 + 40×7
});

test('itemised sale takes stock out and the total is worked out', async () => {
  const r = await api('post', '/transactions', {
    kind: 'sale', accountId: cash,
    items: [{ productId: ids.shito, quantity: 10, unitPrice: 25 }, { productId: ids.pepper, quantity: 2, unitPrice: 15 }],
    amount: 1, // ignored when items are given
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  ids.itemSale = r.body.transaction.id;
  assert.equal(r.body.transaction.amount, '280.00');
  assert.match(r.body.transaction.itemsSummary, /Shito 250ml jar ×10/);
  assert.equal(await stockOf(ids.shito), 40);
  assert.equal(await stockOf(ids.pepper), 38);
});

test('buying stock adds it and updates the cost price', async () => {
  let r = await api('post', '/transactions', {
    kind: 'purchase', accountId: cash, items: [{ productId: ids.shito, quantity: 20, unitPrice: 13 }],
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.transaction.amount, '260.00');
  assert.equal(await stockOf(ids.shito), 60);
  r = await api('get', `/products/${ids.shito}`);
  assert.equal(r.body.product.costPrice, '13.00');

  r = await api('post', '/transactions', { kind: 'purchase', accountId: cash, amount: 50 });
  assert.equal(r.status, 400, 'a stock purchase needs products');
  r = await api('post', '/transactions', { kind: 'expense', accountId: cash, items: [{ productId: ids.shito, quantity: 1, unitPrice: 1 }] });
  assert.equal(r.status, 400, 'expenses cannot list products');
  r = await api('post', '/transactions', { kind: 'purchase', accountId: cash, items: [{ productId: ids.catering, quantity: 1, unitPrice: 100 }] });
  assert.equal(r.status, 400, 'services cannot be bought as stock');
});

test('adjustments, made-here stock and a stock count', async () => {
  let r = await api('post', `/products/${ids.shito}/adjust`, { reason: 'produced', quantity: 5, note: 'Cooked a batch' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.product.onHand, '65.000');
  r = await api('post', `/products/${ids.shito}/adjust`, { reason: 'damaged', quantity: 2 });
  assert.equal(r.body.product.onHand, '63.000');
  r = await api('post', `/products/${ids.shito}/adjust`, { reason: 'sale', quantity: 1 });
  assert.equal(r.status, 400, 'sales go through the cash book');

  r = await api('post', '/stock-count', { counts: [{ productId: ids.shito, counted: 60 }, { productId: ids.pepper, counted: 38 }] });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.changed.length, 1, 'only the item that differed');
  assert.equal(r.body.changed[0].difference, -3);
  assert.equal(await stockOf(ids.shito), 60);

  r = await api('get', `/products/${ids.shito}`);
  const reasons = r.body.movements.map((m) => m.reason);
  for (const reason of ['opening', 'sale', 'purchase', 'produced', 'damaged', 'count_adjustment']) {
    assert.ok(reasons.includes(reason), `history shows ${reason}`);
  }
});

test('invoice: draft leaves stock alone, editing recalculates, sending takes stock out', async () => {
  let r = await api('post', '/invoices', {
    newContact: { name: 'Adwoa Provisions', phone: '020 123 4567' },
    dueDate: addDays(today, 14),
    items: [
      { productId: ids.shito, description: 'Shito 250ml jar', quantity: 20, unitPrice: 25 },
      { productId: ids.catering, description: 'Catering tray', quantity: 1, unitPrice: 100 },
    ],
    discount: 20,
    paymentTerms: 'MoMo 024 111 2222 (Ama Mensah)',
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const inv = r.body.invoice;
  ids.inv1 = inv.id;
  ids.adwoa = inv.contact.id;
  assert.equal(inv.number, 'INV-0001');
  assert.equal(inv.status, 'draft');
  assert.equal(inv.subtotal, '600.00');
  assert.equal(inv.total, '580.00');
  assert.equal(inv.contact.phone, '+233201234567');
  assert.equal(await stockOf(ids.shito), 60, 'a draft does not touch stock');

  r = await request(app).get(`/api/public/invoices/${inv.shareToken}`);
  assert.equal(r.status, 404, 'drafts are not visible to the customer');
  r = await api('post', `/invoices/${inv.id}/payments`, { amount: 10, accountId: cash });
  assert.equal(r.status, 409, 'no payments on a draft');

  r = await api('put', `/invoices/${inv.id}`, {
    contactId: ids.adwoa, dueDate: addDays(today, 14),
    items: [
      { productId: ids.shito, description: 'Shito 250ml jar', quantity: 10, unitPrice: 25 },
      { productId: ids.catering, description: 'Catering tray', quantity: 1, unitPrice: 100 },
    ],
    discount: 20, taxLabel: 'VAT', taxRate: 0,
    paymentTerms: 'MoMo 024 111 2222 (Ama Mensah)',
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.invoice.total, '330.00');

  r = await api('post', `/invoices/${inv.id}/send`, { via: 'whatsapp' });
  assert.equal(r.body.invoice.status, 'sent');
  assert.equal(await stockOf(ids.shito), 50, '10 jars left stock on sending');
  r = await api('put', `/invoices/${inv.id}`, { contactId: ids.adwoa, items: [{ description: 'x', quantity: 1, unitPrice: 1 }] });
  assert.equal(r.status, 409, 'sent invoices cannot be edited');
});

test('customer link shows the invoice without internal details', async () => {
  const inv = (await api('get', `/invoices/${ids.inv1}`)).body.invoice;
  const r = await request(app).get(`/api/public/invoices/${inv.shareToken}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.business.name, "Ama's Shito");
  assert.equal(r.body.business.phone, '+233241112222');
  assert.equal(r.body.invoice.total, '330.00');
  assert.equal(r.body.invoice.items.length, 2);
  const text = JSON.stringify(r.body);
  assert.ok(!text.includes(biz) && !text.includes(ids.inv1) && !text.includes(cash), 'no internal ids');
  assert.equal((await request(app).get('/api/public/invoices/not-a-real-token-123456')).status, 404);
});

test('payments: overpaying is refused, part then full payment', async () => {
  let r = await api('post', `/invoices/${ids.inv1}/payments`, { amount: 400, accountId: cash });
  assert.equal(r.status, 400);
  r = await api('post', `/invoices/${ids.inv1}/payments`, { amount: 130, accountId: momo, paymentRef: 'MP1', momoFee: 1 });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.invoice.status, 'part_paid');
  assert.equal(r.body.invoice.outstanding, '200.00');
  ids.payment1 = r.body.invoice.payments[0].id;
  assert.equal(r.body.invoice.payments[0].invoiceNumber, 'INV-0001');

  let d = (await api('get', '/dashboard')).body;
  assert.equal(d.owed.total, '200.00');

  r = await api('post', `/invoices/${ids.inv1}/payments`, { amount: 200, accountId: cash });
  assert.equal(r.body.invoice.status, 'paid');
  assert.equal(r.body.invoice.outstanding, '0.00');
  r = await api('post', `/invoices/${ids.inv1}/payments`, { amount: 1, accountId: cash });
  assert.equal(r.status, 409, 'already paid');

  d = (await api('get', '/dashboard')).body;
  assert.equal(d.owed.total, '0.00');
  // Sales: 280 itemised + 330 invoice payments. Cost of sales: 10×12 + 2×7 (sale) + 10×13 (invoice).
  assert.equal(d.summary.sales, '610.00');
  assert.equal(d.summary.costOfSales, '264.00');
  // Stock losses: 2 damaged jars + 3 short at the count, at 13.00 each = 65.00.
  assert.equal(d.summary.stockLosses, '65.00');
  assert.equal(d.summary.netProfitEstimate, '280.00'); // 610 − 264 − 1 MoMo fee − 65 losses
});

test('deleting a payment makes the invoice owed again; paid invoices cannot be voided', async () => {
  let r = await api('post', `/invoices/${ids.inv1}/void`);
  assert.equal(r.status, 409);
  r = await api('delete', `/transactions/${ids.payment1}`);
  assert.equal(r.status, 204);
  r = await api('get', `/invoices/${ids.inv1}`);
  assert.equal(r.body.invoice.status, 'part_paid');
  assert.equal(r.body.invoice.outstanding, '130.00');
});

test('voiding a sent invoice puts the goods back; drafts can be deleted', async () => {
  let r = await api('post', '/invoices', {
    contactId: ids.adwoa, items: [{ productId: ids.pepper, description: 'Pepper', quantity: 8, unitPrice: 15 }],
  });
  const id = r.body.invoice.id;
  assert.equal(r.body.invoice.number, 'INV-0002');
  await api('post', `/invoices/${id}/send`);
  assert.equal(await stockOf(ids.pepper), 30);
  r = await api('post', `/invoices/${id}/void`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.invoice.status, 'void');
  assert.equal(await stockOf(ids.pepper), 38);

  r = await api('post', '/invoices', { contactId: ids.adwoa, items: [{ description: 'Delivery', quantity: 1, unitPrice: 20 }] });
  assert.equal((await api('delete', `/invoices/${r.body.invoice.id}`)).status, 204);
  assert.equal((await api('delete', `/invoices/${ids.inv1}`)).status, 409, 'sent invoices are cancelled, not deleted');
});

test('overdue invoices are flagged', async () => {
  let r = await api('post', '/invoices', {
    contactId: ids.adwoa, issueDate: addDays(today, -10), dueDate: addDays(today, -3),
    items: [{ description: 'Old order', quantity: 1, unitPrice: 50 }],
  });
  await api('post', `/invoices/${r.body.invoice.id}/send`);
  r = await api('get', '/invoices?status=overdue');
  assert.equal(r.body.invoices.length, 1);
  assert.equal(r.body.summary.overdueCount, 1);
  const d = (await api('get', '/dashboard')).body;
  assert.equal(d.owed.overdueCount, 1);
  assert.equal(d.owed.total, '180.00'); // 130 still on INV-0001 + 50
  assert.deepEqual(d.lowStock, [], 'nothing is below its reorder level yet');
});

test('deleting an itemised sale puts its stock back', async () => {
  const before = await stockOf(ids.shito);
  assert.equal((await api('delete', `/transactions/${ids.itemSale}`)).status, 204);
  assert.equal(await stockOf(ids.shito), before + 10);
});

test("another business's products and invoices stay private", async () => {
  const auth = `Bearer ${other}`;
  assert.equal((await request(app).get(`/api/businesses/${biz}/products`).set('Authorization', auth)).status, 404);
  assert.equal((await request(app).get(`/api/businesses/${biz}/invoices/${ids.inv1}`).set('Authorization', auth)).status, 404);
});

test('business details for invoices can be updated', async () => {
  let r = await request(app).patch(`/api/businesses/${biz}`).set('Authorization', `Bearer ${token}`)
    .send({ phone: '0551234567', digitalAddress: 'AK-039-5028', invoicePrefix: 'ama' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.business.phone, '+233551234567');
  assert.equal(r.body.business.invoicePrefix, 'AMA');
  r = await request(app).patch(`/api/businesses/${biz}`).set('Authorization', `Bearer ${token}`).send({ phone: '123' });
  assert.equal(r.status, 400);
});
