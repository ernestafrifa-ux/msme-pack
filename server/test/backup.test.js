// Backups: the owner downloads every record of the business as an Excel workbook; the admin
// downloads all the app's data as gzipped JSON. Staff and other businesses cannot.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('zlib');
const request = require('supertest');
const ExcelJS = require('exceljs');
const { createApp } = require('../src/app');
const { pool } = require('../src/db');
const { migrate } = require('../db/migrate');
const { userToken, adminToken, createBusinessFor } = require('./helpers');

const app = createApp();
let owner, staff, other, biz;
const binary = (res, cb) => { const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks))); };
const as = (tok, method, path, body) => {
  const r = request(app)[method](path).set('Authorization', `Bearer ${tok}`);
  return body === undefined ? r : r.send(body);
};

before(async () => {
  const { rows } = await pool.query('SELECT current_database() AS db');
  if (!rows[0].db.endsWith('_test')) throw new Error(`Refusing to run tests against "${rows[0].db}".`);
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate({ log: () => {} });
  owner = await userToken(app, { fullName: 'Ama Owusu', phone: '0241110061', password: 'shop-2026-x' });
  biz = (await createBusinessFor(app, owner, { name: 'Ama’s Provisions', cashOpeningBalance: 400 })).body.business.id;
  const p = (path) => `/api/businesses/${biz}${path}`;
  const cash = (await as(owner, 'get', p('/accounts'))).body.accounts.find((a) => a.kind === 'cash').id;
  const rice = (await as(owner, 'post', p('/products'), { name: 'Rice 5kg', unit: 'bag', costPrice: 80, sellingPrice: 100 })).body.product.id;
  await as(owner, 'post', p('/transactions'), { kind: 'purchase', accountId: cash, items: [{ productId: rice, quantity: 3, unitPrice: 80 }] });
  await as(owner, 'post', p('/transactions'), { kind: 'sale', accountId: cash, items: [{ productId: rice, quantity: 1, unitPrice: 100 }], note: 'Auntie Esi' });
  await as(owner, 'post', p('/assets'), { name: 'Freezer', cost: 3000, boughtOn: '2025-01-05', depreciationRate: 10 });
  await as(owner, 'post', p('/members'), { fullName: 'Kojo Staff', phone: '0241110062', role: 'staff', password: 'temp-pass-9' });
  staff = await (async () => {
    await pool.query("UPDATE users SET must_change_password = FALSE WHERE phone LIKE '%241110062'");
    const r = await request(app).post('/api/auth/login').send({ phone: '0241110062', password: 'temp-pass-9' });
    return r.body.token;
  })();
  other = await userToken(app, { fullName: 'Other Owner', phone: '0241110063', password: 'other-2026-x' });
  await createBusinessFor(app, other, { name: 'Other Shop', cashOpeningBalance: 10 });
});
after(() => pool.end());

test('the owner downloads the business backup as an Excel workbook', async () => {
  const r = await as(owner, 'get', `/api/businesses/${biz}/backup`).buffer(true).parse(binary);
  assert.equal(r.status, 200);
  assert.match(r.headers['content-disposition'], /attachment; filename="MSME-Pack-backup-Ama-s-Provisions-\d{4}-\d{2}-\d{2}\.xlsx"/);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(r.body);
  assert.deepEqual(wb.worksheets.map((w) => w.name),
    ['About', 'Money records', 'Accounts', 'Stock items', 'Stock changes', 'Customers', 'Invoices', 'Invoice lines', 'Loans', 'Equipment']);
  const rows = (name) => { const out = []; wb.getWorksheet(name).eachRow((row, i) => { if (i > 1) out.push(row.values.slice(1)); }); return out; };
  const money = rows('Money records');
  assert.deepEqual(money.map((x) => [x[1], x[2]]), [['Stock bought', 240], ['Sale', 100]]);
  assert.equal(money[1][16], 'Auntie Esi');
  assert.equal(money[1][17], 'Ama Owusu');
  assert.deepEqual(rows('Accounts')[0].slice(0, 1).concat(rows('Accounts')[0].slice(3, 5)), ['Cash box', 400, 260]);
  const item = rows('Stock items')[0];
  assert.deepEqual([item[0], item[1], item[5], item[7]], ['Rice 5kg', 'For sale', 2, 160]);
  assert.equal(rows('Stock changes').length, 2);
  const eq = rows('Equipment')[0];
  assert.deepEqual([eq[0], eq[2], eq[3]], ['Freezer', 3000, 10]);
  assert.ok(eq[4] < 3000, 'value after depreciation');
});

test('staff and other businesses cannot download it', async () => {
  assert.equal((await as(staff, 'get', `/api/businesses/${biz}/backup`)).status, 403);
  assert.ok([403, 404].includes((await as(other, 'get', `/api/businesses/${biz}/backup`)).status));
  assert.equal((await as(owner, 'get', '/api/admin/backup')).status, 403);
});

test('the admin downloads a full backup of every table', async () => {
  const r = await as(await adminToken(app), 'get', '/api/admin/backup').buffer(true).parse(binary);
  assert.equal(r.status, 200);
  assert.match(r.headers['content-disposition'], /MSME-Pack-full-backup-\d{4}-\d{2}-\d{2}\.json\.gz/);
  const data = JSON.parse(zlib.gunzipSync(r.body).toString('utf8'));
  assert.equal(data.app, 'MSME Pack');
  assert.equal(data.madeBy, 'MSME Pack Admin');
  assert.deepEqual(data.tables.businesses.map((b) => b.name).sort(), ['Ama’s Provisions', 'Other Shop']);
  assert.equal(data.tables.transactions.filter((t) => t.business_id === biz).length, 2);
  assert.ok(data.tables.users.length >= 4);
  assert.ok('stock_movements' in data.tables && 'assets' in data.tables && 'invoices' in data.tables);
});
