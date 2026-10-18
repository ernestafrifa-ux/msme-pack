// End-to-end API tests against a real PostgreSQL database.
// Uses DATABASE_URL from the environment — point it at an EMPTY test database:
//   DATABASE_URL=postgres://…/msme_pack_test npm test
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { pool } = require('../src/db');
const { migrate } = require('../db/migrate');
const { normaliseGhanaPhone } = require('../src/phone');
const { todayInGhana, addDays } = require('../src/dates');

const app = createApp();
const today = todayInGhana();
let ama, kofi, biz, cash, momo, transportCat, salesCat;

before(async () => {
  // These tests wipe the database. Refuse unless its name ends in _test.
  const { rows } = await pool.query('SELECT current_database() AS db');
  if (!rows[0].db.endsWith('_test')) {
    throw new Error(`Refusing to run tests against "${rows[0].db}": use a database whose name ends in _test.`);
  }
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate({ log: () => {} });
});
after(() => pool.end());

test('phone numbers are normalised to +233 format', () => {
  assert.equal(normaliseGhanaPhone('024 123 4567'), '+233241234567');
  assert.equal(normaliseGhanaPhone('+233 24-123-4567'), '+233241234567');
  assert.equal(normaliseGhanaPhone('233501234567'), '+233501234567');
  assert.equal(normaliseGhanaPhone('12345'), null);
  assert.equal(normaliseGhanaPhone('0841234567'), null);
});

let admin;
const as = (token) => (method, path, body) => {
  const r = request(app)[method](`/api${path}`).set('Authorization', `Bearer ${token}`);
  return body === undefined ? r : r.send(body);
};
async function chooseOwnPassword(phone, temp, mine) {
  const t = (await request(app).post('/api/auth/login').send({ phone, password: temp })).body.token;
  const r = await as(t)('post', '/auth/change-password', { currentPassword: temp, newPassword: mine });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return (await request(app).post('/api/auth/login').send({ phone, password: mine })).body.token;
}

test('the first sign-up makes the admin, then sign-up closes', async () => {
  assert.equal((await request(app).get('/api/auth/status')).body.signupOpen, true);
  let r = await request(app).post('/api/auth/signup').send({ fullName: 'Ernest Admin', phone: '0551110000', password: 'admin-pass-1' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.user.isAdmin, true);
  admin = r.body.token;
  assert.equal((await request(app).get('/api/auth/status')).body.signupOpen, false);

  r = await request(app).post('/api/auth/signup').send({ fullName: 'Ama Mensah', phone: '0241112222', password: 'shito-2026' });
  assert.equal(r.status, 403, 'anyone with the link can no longer sign up');
  r = await request(app).post('/api/auth/signup').send({ fullName: 'A', phone: '123', password: 'short' });
  assert.equal(r.status, 400);
  assert.ok(r.body.fields.phone && r.body.fields.password && r.body.fields.fullName);
});

test('protected routes need a valid token', async () => {
  assert.equal((await request(app).get('/api/auth/me')).status, 401);
  assert.equal((await request(app).get('/api/auth/me').set('Authorization', 'Bearer nonsense')).status, 401);
});

test('the admin creates a business with its owner, who must choose a password', async () => {
  const lookups = await as(admin)('get', '/businesses/lookups');
  assert.equal(lookups.body.regions.length, 16);
  const body = {
    name: "Ama's Shito & Spices", sectorCode: 'AGRO', regionCode: 'ASH', town: 'Kumasi',
    legalForm: 'sole_proprietorship', withMoney: true, cashOpeningBalance: 500, momo: { provider: 'MTN', openingBalance: '200' },
    owner: { fullName: 'Ama Mensah', phone: '024 111 2222' },
  };
  let r = await as(admin)('post', '/admin/businesses', body);
  assert.equal(r.status, 400, 'a new owner needs a temporary password');
  assert.ok(r.body.fields['owner.password']);
  r = await as(admin)('post', '/admin/businesses', { ...body, owner: { ...body.owner, password: 'temp-pass-1' } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.owner.isNew, true);
  biz = r.body.business.id;

  // The admin does not see the business's records.
  assert.equal((await as(admin)('get', `/businesses/${biz}/dashboard`)).status, 404);

  r = await request(app).post('/api/auth/login').send({ phone: '024 111 2222', password: 'wrong-pass' });
  assert.equal(r.status, 401);
  r = await request(app).post('/api/auth/login').send({ phone: '024 111 2222', password: 'temp-pass-1' });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.mustChangePassword, true);
  const temp = as(r.body.token);
  r = await temp('get', `/businesses/${biz}`);
  assert.equal(r.status, 403);
  assert.equal(r.body.code, 'PASSWORD_CHANGE_REQUIRED');
  assert.equal((await temp('post', '/auth/change-password', { currentPassword: 'nope', newPassword: 'shito-2026' })).status, 400);
  assert.equal((await temp('post', '/auth/change-password', { currentPassword: 'temp-pass-1', newPassword: 'temp-pass-1' })).status, 400);
  ama = await chooseOwnPassword('0241112222', 'temp-pass-1', 'shito-2026');

  const me = await as(ama)('get', '/auth/me');
  assert.equal(me.body.user.mustChangePassword, false);
  assert.equal(me.body.businesses[0].role, 'owner');
  assert.equal(me.body.businesses[0].setupDone, true);

  // Owners cannot create businesses or use the admin screens.
  assert.equal((await as(ama)('post', '/businesses', { name: 'Second shop' })).status, 403);
  assert.equal((await as(ama)('get', '/admin/businesses')).status, 403);

  const accts = await as(ama)('get', `/businesses/${biz}/accounts`);
  assert.equal(accts.body.accounts.length, 2);
  cash = accts.body.accounts.find((a) => a.kind === 'cash');
  momo = accts.body.accounts.find((a) => a.kind === 'mobile_money');
  assert.equal(cash.balance, '500.00');
  assert.equal(momo.name, 'MTN MoMo');

  const cats = await as(ama)('get', `/businesses/${biz}/categories`);
  transportCat = cats.body.categories.find((c) => c.name === 'Transport').id;
  salesCat = cats.body.categories.find((c) => c.name === 'Product sales').id;

  // Kofi owns another business.
  r = await as(admin)('post', '/admin/businesses', { name: 'Kofi Electricals', withMoney: true,
    owner: { fullName: 'Kofi Boateng', phone: '0209998888', password: 'temp-kofi-1' } });
  assert.equal(r.status, 201);
  kofi = await chooseOwnPassword('0209998888', 'temp-kofi-1', 'kofi-pass-1');
});

test('a business created without balances: the owner enters them at first login', async () => {
  let r = await as(admin)('post', '/admin/businesses', { name: 'Esi Fashions',
    owner: { fullName: 'Esi Owusu', phone: '0271234567', password: 'temp-esi-01' } });
  assert.equal(r.status, 201);
  const esiBiz = r.body.business.id;
  const esi = as(await chooseOwnPassword('0271234567', 'temp-esi-01', 'esi-pass-01'));
  r = await esi('get', '/auth/me');
  assert.equal(r.body.businesses[0].setupDone, false);
  assert.equal((await esi('get', `/businesses/${esiBiz}/accounts`)).body.accounts.length, 0);
  r = await esi('post', `/businesses/${esiBiz}/setup`, { cashOpeningBalance: 300, bank: { name: 'GCB', openingBalance: 1000 } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.business.setupDone, true);
  assert.equal((await esi('get', `/businesses/${esiBiz}/dashboard`)).body.totalBalance, '1300.00');
  assert.equal((await esi('post', `/businesses/${esiBiz}/setup`, { cashOpeningBalance: 1 })).status, 409);
});

test('the owner adds people to the business, and only to it', async () => {
  const owner = as(ama);
  let r = await owner('post', `/businesses/${biz}/members`, { fullName: 'Yaa Asantewaa', phone: '0245556666', role: 'staff' });
  assert.equal(r.status, 400, 'a new person needs a temporary password');
  r = await owner('post', `/businesses/${biz}/members`, { fullName: 'Yaa Asantewaa', phone: '0245556666', role: 'owner', password: 'temp-yaa-01' });
  assert.equal(r.status, 400, 'owners are made by the admin');
  r = await owner('post', `/businesses/${biz}/members`, { fullName: 'Yaa Asantewaa', phone: '0245556666', role: 'staff', password: 'temp-yaa-01' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.isNew, true);
  const yaaId = r.body.members.find((m) => m.fullName === 'Yaa Asantewaa').userId;
  assert.equal((await owner('post', `/businesses/${biz}/members`, { fullName: 'Yaa', phone: '0245556666', role: 'staff' })).status, 409);

  const yaa = as(await chooseOwnPassword('0245556666', 'temp-yaa-01', 'yaa-pass-01'));
  r = await yaa('get', '/auth/me');
  assert.deepEqual(r.body.businesses.map((b) => [b.name, b.role]), [["Ama's Shito & Spices", 'staff']]);
  assert.equal((await yaa('post', `/businesses/${biz}/transactions`, { kind: 'sale', amount: 5, accountId: cash.id })).status, 201);
  assert.equal((await yaa('post', `/businesses/${biz}/members`, { fullName: 'X Y', phone: '0240000001', role: 'staff', password: 'temp-pass-9' })).status, 403);
  assert.equal((await yaa('get', `/businesses/${biz}/members`)).body.members.length, 2);
  const sale = (await yaa('get', `/businesses/${biz}/transactions`)).body.transactions[0];
  assert.equal((await owner('delete', `/businesses/${biz}/transactions/${sale.id}`)).status, 204);

  r = await owner('patch', `/businesses/${biz}/members/${yaaId}`, { role: 'manager' });
  assert.equal(r.body.members.find((m) => m.userId === yaaId).role, 'manager');
  r = await owner('post', `/businesses/${biz}/members/${yaaId}/reset-password`, { password: 'temp-yaa-02' });
  assert.equal(r.status, 200);
  r = await request(app).post('/api/auth/login').send({ phone: '0245556666', password: 'temp-yaa-02' });
  assert.equal(r.body.user.mustChangePassword, true);

  const amaId = (await owner('get', '/auth/me')).body.user.id;
  assert.equal((await owner('delete', `/businesses/${biz}/members/${amaId}`)).status, 409, 'not yourself');

  // Someone with an account already (Kofi owns another business) keeps his own password.
  r = await owner('post', `/businesses/${biz}/members`, { fullName: 'Kofi', phone: '0209998888', role: 'advisor' });
  assert.equal(r.status, 201);
  assert.equal(r.body.isNew, false);
  const kofiId = r.body.members.find((m) => m.phone === '+233209998888').userId;
  assert.equal((await owner('post', `/businesses/${biz}/members/${kofiId}/reset-password`, { password: 'hijack-pass' })).status, 409);
  assert.equal((await as(kofi)('get', `/businesses/${biz}/dashboard`)).status, 200);
  assert.equal((await as(kofi)('post', `/businesses/${biz}/transactions`, { kind: 'sale', amount: 5, accountId: cash.id })).status, 403);
  assert.equal((await owner('delete', `/businesses/${biz}/members/${kofiId}`)).status, 200);
});

test('the admin lists businesses, resets passwords and switches accounts off', async () => {
  const r = await as(admin)('get', '/admin/businesses');
  assert.equal(r.body.businesses.length, 3);
  const ama1 = r.body.businesses.find((b) => b.id === biz);
  assert.equal(ama1.owners[0].fullName, 'Ama Mensah');
  assert.equal(ama1.people, 2);
  const yaaId = (await as(ama)('get', `/businesses/${biz}/members`)).body.members.find((m) => m.role === 'manager').userId;

  assert.equal((await as(admin)('patch', `/admin/users/${yaaId}`, { isActive: false })).status, 200);
  assert.equal((await request(app).post('/api/auth/login').send({ phone: '0245556666', password: 'temp-yaa-02' })).status, 401);
  await as(admin)('patch', `/admin/users/${yaaId}`, { isActive: true });
  assert.equal((await as(admin)('post', `/admin/users/${yaaId}/reset-password`, { password: 'temp-yaa-03' })).status, 200);
  assert.equal((await request(app).post('/api/auth/login').send({ phone: '0245556666', password: 'temp-yaa-03' })).status, 200);
});

test('another user cannot see or change this business', async () => {
  const auth = `Bearer ${kofi}`;
  assert.equal((await request(app).get(`/api/businesses/${biz}`).set('Authorization', auth)).status, 404);
  assert.equal((await request(app).get(`/api/businesses/${biz}/dashboard`).set('Authorization', auth)).status, 404);
  const r = await request(app).post(`/api/businesses/${biz}/transactions`).set('Authorization', auth)
    .send({ kind: 'sale', amount: 10, accountId: cash.id });
  assert.equal(r.status, 404);
});

test('record sales, an expense and a transfer; balances add up', async () => {
  const post = (body) => request(app).post(`/api/businesses/${biz}/transactions`)
    .set('Authorization', `Bearer ${ama}`).send(body);

  let r = await post({ kind: 'sale', amount: 250, accountId: cash.id, categoryId: salesCat, note: '10 jars' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.transaction.accountName, 'Cash box');

  r = await post({ kind: 'sale', amount: '625', accountId: momo.id, momoFee: 2.5, paymentRef: 'MP261015.1234' });
  assert.equal(r.status, 201);

  r = await post({ kind: 'expense', amount: 40, accountId: cash.id, categoryId: transportCat });
  assert.equal(r.status, 201);

  r = await post({ kind: 'transfer', amount: 300, accountId: cash.id, toAccountId: momo.id });
  assert.equal(r.status, 201);

  const d = await request(app).get(`/api/businesses/${biz}/dashboard`).set('Authorization', `Bearer ${ama}`);
  assert.equal(d.status, 200);
  const bal = Object.fromEntries(d.body.accounts.map((a) => [a.name, a.balance]));
  assert.equal(bal['Cash box'], '410.00');   // 500 + 250 − 40 − 300
  assert.equal(bal['MTN MoMo'], '1122.50');  // 200 + 625 − 2.50 + 300
  assert.equal(d.body.totalBalance, '1532.50');
  assert.equal(d.body.summary.sales, '875.00');
  assert.equal(d.body.summary.expenses, '40.00');
  assert.equal(d.body.summary.netProfitEstimate, '832.50'); // 875 − 40 − 2.50
  assert.equal(d.body.recent.length, 4);
});

test('bad records are rejected with clear messages', async () => {
  const post = (body) => request(app).post(`/api/businesses/${biz}/transactions`)
    .set('Authorization', `Bearer ${ama}`).send(body);

  let r = await post({ kind: 'sale', amount: -5, accountId: cash.id });
  assert.equal(r.status, 400);
  assert.ok(r.body.fields.amount);

  r = await post({ kind: 'transfer', amount: 5, accountId: cash.id });
  assert.equal(r.status, 400);
  assert.ok(r.body.fields.toAccountId);

  r = await post({ kind: 'sale', amount: 5, accountId: cash.id, categoryId: transportCat });
  assert.equal(r.status, 400, 'an expense category on a sale');

  r = await post({ kind: 'sale', amount: 5, accountId: cash.id, date: addDays(today, 5) });
  assert.equal(r.status, 400, 'future date');

  r = await post({ kind: 'sale', amount: 5, accountId: cash.id, date: addDays(today, -30) });
  assert.equal(r.status, 400, 'before the account was opened');

  r = await post({ kind: 'sale', amount: 5, accountId: '00000000-0000-4000-8000-000000000000' });
  assert.equal(r.status, 400, 'unknown account');
});

test('retrying a save with the same clientRef does not double-count', async () => {
  const clientRef = '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b';
  const send = () => request(app).post(`/api/businesses/${biz}/transactions`)
    .set('Authorization', `Bearer ${ama}`)
    .send({ kind: 'sale', amount: 50, accountId: cash.id, clientRef });
  const first = await send();
  const second = await send();
  assert.equal(first.status, 201);
  assert.equal(second.status, 200);
  assert.equal(second.body.duplicate, true);
  assert.equal(first.body.transaction.id, second.body.transaction.id);
});

test('list with paging and filter, then delete', async () => {
  const auth = `Bearer ${ama}`;
  let r = await request(app).get(`/api/businesses/${biz}/transactions?limit=3`).set('Authorization', auth);
  assert.equal(r.body.transactions.length, 3);
  assert.equal(r.body.hasMore, true);
  const last = r.body.transactions.at(-1);
  r = await request(app)
    .get(`/api/businesses/${biz}/transactions?limit=3&beforeDate=${last.date}&beforeId=${last.id}`)
    .set('Authorization', auth);
  assert.equal(r.body.transactions.length, 2);
  assert.equal(r.body.hasMore, false);

  r = await request(app).get(`/api/businesses/${biz}/transactions?kind=expense`).set('Authorization', auth);
  assert.equal(r.body.transactions.length, 1);
  const expenseId = r.body.transactions[0].id;

  r = await request(app).delete(`/api/businesses/${biz}/transactions/${expenseId}`).set('Authorization', auth);
  assert.equal(r.status, 204);
  r = await request(app).delete(`/api/businesses/${biz}/transactions/${expenseId}`).set('Authorization', auth);
  assert.equal(r.status, 404);

  const d = await request(app).get(`/api/businesses/${biz}/dashboard`).set('Authorization', auth);
  assert.equal(d.body.summary.expenses, '0.00');
  assert.equal(d.body.accounts.find((a) => a.name === 'Cash box').balance, '500.00'); // 410 + 40 back + 50
});

test('owner pay leaves the accounts but does not lower profit', async () => {
  const auth = `Bearer ${ama}`;
  const before = (await request(app).get(`/api/businesses/${biz}/dashboard`).set('Authorization', auth)).body;
  assert.equal(before.summary.ownerPay, '0.00');

  let r = await request(app).post(`/api/businesses/${biz}/transactions`).set('Authorization', auth)
    .send({ kind: 'owner_draw', amount: 120, accountId: cash.id, note: 'weekly pay' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.transaction.kind, 'owner_draw');

  r = await request(app).post(`/api/businesses/${biz}/transactions`).set('Authorization', auth)
    .send({ kind: 'owner_draw', amount: 10, accountId: cash.id, categoryId: transportCat });
  assert.equal(r.status, 400, 'owner pay takes no category');

  const after = (await request(app).get(`/api/businesses/${biz}/dashboard`).set('Authorization', auth)).body;
  assert.equal(after.summary.ownerPay, '120.00');
  assert.equal(after.summary.netProfitEstimate, before.summary.netProfitEstimate, 'profit unchanged');
  assert.equal(after.summary.expenses, before.summary.expenses);
  assert.equal(after.accounts.find((a) => a.name === 'Cash box').balance, '380.00'); // 500 − 120
  assert.equal(Number(after.totalBalance), Number(before.totalBalance) - 120);

  r = await request(app).get(`/api/businesses/${biz}/transactions?kind=owner_draw`).set('Authorization', auth);
  assert.equal(r.body.transactions.length, 1);
  assert.equal(r.body.transactions[0].note, 'weekly pay');
});
