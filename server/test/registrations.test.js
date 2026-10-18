// Starting without a bank account or VAT, and registering for them later.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { pool } = require('../src/db');
const { migrate } = require('../db/migrate');
const { todayInGhana } = require('../src/dates');

const app = createApp();
const today = todayInGhana();
let token, staff, biz, cash;
const api = (method, path, body, t = token) => {
  const r = request(app)[method](`/api/businesses/${biz}${path}`).set('Authorization', `Bearer ${t}`);
  return body === undefined ? r : r.send(body);
};
const ok = async (p, code = 200) => { const r = await p; assert.equal(r.status, code, JSON.stringify(r.body)); return r.body; };

before(async () => {
  const { rows } = await pool.query('SELECT current_database() AS db');
  if (!rows[0].db.endsWith('_test')) throw new Error(`Refusing to run tests against "${rows[0].db}".`);
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate({ log: () => {} });
  token = (await request(app).post('/api/auth/signup').send({ fullName: 'Adwoa Mensah', phone: '0244567890', password: 'books-2026' })).body.token;
  biz = (await request(app).post('/api/businesses').set('Authorization', `Bearer ${token}`)
    .send({ name: 'Adom Books & Stationery', cashOpeningBalance: 1000 })).body.business.id;
  cash = (await api('get', '/accounts')).body.accounts[0].id;
  await ok(api('post', '/transactions', { kind: 'sale', accountId: cash, amount: 500 }), 201);
});
after(() => pool.end());

test('a new business starts with neither', async () => {
  const r = await ok(api('get', '/registrations'));
  assert.equal(r.bank.status, 'not_started');
  assert.equal(r.bank.accounts.length, 0);
  assert.equal(r.vat.status, 'not_started');
  assert.equal(r.vat.mustRegister, null, 'until the owner says what the business sells');
  assert.equal(r.vat.salesLast12, '500.00');
  assert.equal(r.vat.threshold, '750000.00');
});

test('VAT advice: goods below the threshold, services always', async () => {
  let r = await ok(api('patch', '/registrations/vat', { sells: 'goods' }));
  assert.equal(r.vat.mustRegister, false);
  assert.equal(r.vat.reason, 'under');
  await ok(api('post', '/products', { name: 'Photocopying', kind: 'service', unit: 'page', sellingPrice: 1 }), 201);
  r = await ok(api('get', '/registrations'));
  assert.equal(r.vat.suggestedSells, 'both');
  assert.deepEqual(r.vat.serviceProducts, ['Photocopying']);
  r = await ok(api('patch', '/registrations/vat', { sells: 'both' }));
  assert.equal(r.vat.mustRegister, true);
  assert.equal(r.vat.reason, 'services');
});

test('bank: start, tick documents, then add the account', async () => {
  let r = await ok(api('patch', '/registrations/bank', { status: 'in_progress', checklist: ['ghana_card', 'orc', 'ghana_card'] }));
  assert.equal(r.bank.status, 'in_progress');
  assert.equal(r.bank.startedOn, today);
  assert.deepEqual(r.bank.checklist, ['ghana_card', 'orc']);
  assert.equal((await api('patch', '/registrations/bank', { checklist: ['Bad id!'] })).status, 400);
  assert.equal((await api('post', '/registrations/bank/done', { bankName: '' })).status, 400);

  r = await ok(api('post', '/registrations/bank/done', { bankName: 'GCB', openingBalance: 300, lastDigits: '4521' }), 201);
  assert.equal(r.bank.status, 'done');
  assert.equal(r.bank.accounts[0].name, 'GCB account');
  assert.equal(r.bank.accounts[0].balance, '300.00');
  const accounts = (await api('get', '/accounts')).body.accounts;
  assert.ok(accounts.some((a) => a.kind === 'bank' && a.name === 'GCB account'));
  assert.equal((await api('get', '/dashboard')).body.totalBalance, '1800.00');
  assert.equal((await api('patch', '/registrations/bank', { status: 'not_started' })).status, 409);
});

test('VAT: registered with GRA switches VAT on for invoices', async () => {
  await ok(api('patch', '/registrations/vat', { status: 'in_progress' }));
  assert.equal((await api('post', '/registrations/vat/done', { vatNumber: 'x', effectiveDate: today })).status, 400);
  const r = await ok(api('post', '/registrations/vat/done', { vatNumber: 'p0012345678', effectiveDate: today }), 201);
  assert.equal(r.vat.status, 'done');
  assert.equal(r.vat.reference, 'P0012345678');
  const b = (await api('get', '')).body.business;
  assert.equal(b.vatRegistered, true);
  assert.equal(b.vatNumber, 'P0012345678');
  assert.equal(b.tin, 'P0012345678', 'used as the TIN when none was set');
  assert.equal((await api('get', '/invoices/defaults')).body.taxScheme, 'vat');

  // Switching VAT off in Settings puts the registration back to "in progress".
  await ok(api('patch', '', { vatRegistered: false }));
  assert.equal((await api('get', '/registrations')).body.vat.status, 'in_progress');
});

test('someone outside the business cannot change them', async () => {
  staff = (await request(app).post('/api/auth/signup').send({ fullName: 'Kojo', phone: '0201112222', password: 'kojo-pass-1' })).body.token;
  assert.equal((await api('patch', '/registrations/bank', { status: 'in_progress' }, staff)).status, 404);
});
