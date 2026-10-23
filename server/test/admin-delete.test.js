// The admin deletes a test business: it leaves every list, its people can no longer open it,
// its customer links stop working, and the admin can restore it.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { pool } = require('../src/db');
const { migrate } = require('../db/migrate');
const { userToken, adminToken, createBusinessFor } = require('./helpers');

const app = createApp();
let admin, owner, biz;
const as = (tok, method, path, body) => {
  const r = request(app)[method](path).set('Authorization', `Bearer ${tok}`);
  return body === undefined ? r : r.send(body);
};

before(async () => {
  const { rows } = await pool.query('SELECT current_database() AS db');
  if (!rows[0].db.endsWith('_test')) throw new Error(`Refusing to run tests against "${rows[0].db}".`);
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate({ log: () => {} });
  owner = await userToken(app, { fullName: 'Test Owner', phone: '0241110041', password: 'test-2026-x' });
  biz = (await createBusinessFor(app, owner, { name: 'Test  Shop One', cashOpeningBalance: 100 })).body.business.id;
  admin = await adminToken(app);
});
after(() => pool.end());

test('only the admin can delete, and only by typing the name', async () => {
  let r = await as(owner, 'delete', `/api/admin/businesses/${biz}`, { confirmName: 'Test Shop One' });
  assert.equal(r.status, 403);
  r = await as(admin, 'delete', `/api/admin/businesses/${biz}`, { confirmName: 'Test Shop' });
  assert.equal(r.status, 400);
  assert.match(r.body.fields.confirmName, /Test {2}Shop One/);
  r = await as(admin, 'delete', `/api/admin/businesses/${biz}`, {});
  assert.equal(r.status, 400);
});

test('a deleted business disappears and can be restored', async () => {
  // A sale with a receipt link, to check customer links stop working
  const accts = (await as(owner, 'get', `/api/businesses/${biz}/accounts`)).body.accounts;
  const sale = (await as(owner, 'post', `/api/businesses/${biz}/transactions`, { kind: 'sale', accountId: accts[0].id, amount: 20 })).body.transaction;
  const rec = (await as(owner, 'post', `/api/businesses/${biz}/transactions/${sale.id}/receipt`, {})).body;
  const tokenLink = rec.token || rec.receiptToken || (rec.url || '').split('/').pop();

  let r = await as(admin, 'delete', `/api/admin/businesses/${biz}`, { confirmName: '  test shop one ' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await as(admin, 'get', '/api/admin/businesses')).body.businesses.length, 0);
  const deleted = (await as(admin, 'get', '/api/admin/businesses/deleted')).body.businesses;
  assert.deepEqual(deleted.map((b) => [b.name, b.owners, b.deletedBy]), [['Test  Shop One', 'Test Owner', 'MSME Pack Admin']]);
  assert.equal((await as(owner, 'get', '/api/auth/me')).body.businesses.length, 0, 'the owner no longer sees it');
  r = await as(owner, 'get', `/api/businesses/${biz}/dashboard`);
  assert.ok([403, 404].includes(r.status), `got ${r.status}`);
  if (tokenLink) assert.equal((await request(app).get(`/api/public/receipts/${tokenLink}`)).status, 404);
  // Deleting again: not found
  assert.equal((await as(admin, 'delete', `/api/admin/businesses/${biz}`, { confirmName: 'Test Shop One' })).status, 404);

  r = await as(admin, 'post', `/api/admin/businesses/${biz}/restore`, {});
  assert.equal(r.status, 200);
  assert.equal((await as(admin, 'get', '/api/admin/businesses')).body.businesses.length, 1);
  assert.equal((await as(admin, 'get', '/api/admin/businesses/deleted')).body.businesses.length, 0);
  assert.equal((await as(owner, 'get', `/api/businesses/${biz}/dashboard`)).status, 200);
});
