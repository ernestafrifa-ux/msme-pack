// Text messages (SMS): off by default; with a provider, used for logins, reminders, receipts and admin messages.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { pool } = require('../src/db');
const { migrate } = require('../db/migrate');
const { intl } = require('../src/sms');
const { userToken, adminToken, createBusinessFor } = require('./helpers');

const app = createApp();
let admin, owner, biz, cash;
const as = (t) => (method, p, body) => {
  const r = request(app)[method](`/api${p}`).set('Authorization', `Bearer ${t}`);
  return body === undefined ? r : r.send(body);
};
const smsSent = async (purpose) => (await pool.query('SELECT * FROM sms_log WHERE purpose = $1 ORDER BY id', [purpose])).rows;

before(async () => {
  const { rows } = await pool.query('SELECT current_database() AS db');
  if (!rows[0].db.endsWith('_test')) throw new Error(`Refusing to run tests against "${rows[0].db}".`);
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate({ log: () => {} });
  admin = await adminToken(app);
  owner = await userToken(app, { fullName: 'Adwoa Mensah', phone: '0244567890', password: 'books-2026' });
  biz = (await createBusinessFor(app, owner, { name: 'Adom Books', cashOpeningBalance: 100 })).body.business.id;
  cash = (await as(owner)('get', `/businesses/${biz}/accounts`)).body.accounts[0].id;
});
after(() => { delete process.env.SMS_PROVIDER; return pool.end(); });

test('numbers in the international format', () => {
  assert.equal(intl('024 456 7890'), '233244567890');
  assert.equal(intl('+233244567890'), '233244567890');
  assert.equal(intl('12345'), null);
});

test('without a provider, SMS is off and says so', async () => {
  delete process.env.SMS_PROVIDER;
  assert.equal((await as(owner)('get', '/auth/me')).body.features.sms, false);
  const r = await as(admin)('post', '/admin/notices', { title: 'Hello', body: 'Testing', audience: { type: 'all' }, sms: true });
  assert.equal(r.status, 409, 'sent in the app, but not by SMS');
  assert.equal((await as(admin)('get', '/admin/sms')).body.enabled, false);
});

test('with a provider: login details, admin messages, reminders and receipts', async () => {
  process.env.SMS_PROVIDER = 'log';
  assert.equal((await as(owner)('get', '/auth/me')).body.features.sms, true);

  // Login details for a new staff member.
  let r = await as(owner)('post', `/businesses/${biz}/members`, { fullName: 'Yaw', phone: '0245556666', role: 'staff', password: 'temp-yaw-01', sendSms: true });
  assert.equal(r.status, 201);
  assert.equal(r.body.sms.sent, true);
  const login = await smsSent('login');
  assert.equal(login[0].to_phone, '233245556666');
  assert.match(login[0].message, /temp-yaw-01/);

  // An admin message to owners.
  r = await as(admin)('post', '/admin/notices', { title: 'Training Friday', body: 'At the GEA office.', audience: { type: 'all' }, sms: true });
  assert.equal(r.status, 201);
  assert.deepEqual(r.body.sms, { sent: 1, failed: 0 });
  assert.match((await smsSent('notice'))[0].message, /^MSME Pack: Training Friday/);

  // A reminder to a customer who owes.
  const inv = (await as(owner)('post', `/businesses/${biz}/credit-sales`, { newContact: { name: 'Auntie Akos', phone: '0241231234' }, amount: 80 })).body.invoice;
  r = await as(owner)('post', `/businesses/${biz}/customers/${inv.contact.id}/sms-reminder`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.match((await smsSent('reminder'))[0].message, /GHS 80.00 is still to pay/);

  // A receipt link.
  const sale = (await as(owner)('post', `/businesses/${biz}/transactions`, { kind: 'sale', accountId: cash, amount: 35 })).body.transaction;
  await as(owner)('post', `/businesses/${biz}/transactions/${sale.id}/receipt`);
  r = await as(owner)('post', `/businesses/${biz}/transactions/${sale.id}/receipt/sms`, { phone: '0201112222' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.match((await smsSent('receipt'))[0].message, /\/r\/[A-Za-z0-9_-]+$/);

  const status = (await as(admin)('get', '/admin/sms')).body;
  assert.equal(status.enabled, true);
  assert.equal(status.thisMonth.sent, 4);
});

test('a daily limit per business keeps the cost down', async () => {
  process.env.SMS_PROVIDER = 'log';
  process.env.SMS_DAILY_LIMIT = '3';
  const sale = (await as(owner)('post', `/businesses/${biz}/transactions`, { kind: 'sale', accountId: cash, amount: 10 })).body.transaction;
  await as(owner)('post', `/businesses/${biz}/transactions/${sale.id}/receipt`);
  const r = await as(owner)('post', `/businesses/${biz}/transactions/${sale.id}/receipt/sms`, { phone: '0201112222' });
  assert.equal(r.status, 429);
  delete process.env.SMS_DAILY_LIMIT;
});

test('Arkesel: the request the provider expects', async () => {
  process.env.SMS_PROVIDER = 'arkesel';
  process.env.SMS_API_KEY = 'test-key';
  process.env.SMS_SENDER = 'AdomBooks';
  const realFetch = global.fetch;
  let seen;
  global.fetch = async (url, opts) => { seen = { url, opts }; return { ok: true, status: 200, json: async () => ({ status: 'success', data: [{ recipient: '233244567890', id: 'abc' }] }) }; };
  try {
    const { sendSms } = require('../src/sms');
    const r = await sendSms({ to: '0244567890', text: 'Hello', purpose: 'login' });
    assert.equal(r.sent, 1);
    assert.equal(seen.url, 'https://sms.arkesel.com/api/v2/sms/send');
    assert.equal(seen.opts.headers['api-key'], 'test-key');
    assert.deepEqual(JSON.parse(seen.opts.body), { sender: 'AdomBooks', message: 'Hello', recipients: ['233244567890'] });
  } finally {
    global.fetch = realFetch;
    delete process.env.SMS_API_KEY; delete process.env.SMS_SENDER; process.env.SMS_PROVIDER = 'log';
  }
});
