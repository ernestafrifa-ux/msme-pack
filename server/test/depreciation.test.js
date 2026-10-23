// Equipment depreciation: a yearly rate taken off at each 31 December (months owned in the year
// it was bought), never below zero, stopping when the item is sold or thrown away. Shows in the
// equipment list, the balance sheet and the profit and loss.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { pool } = require('../src/db');
const { migrate } = require('../db/migrate');
const { userToken, createBusinessFor } = require('./helpers');
const dep = require('../src/depreciation');

const app = createApp();
let token, biz;
const api = (method, path, body) => {
  const r = request(app)[method](`/api/businesses/${biz}${path}`).set('Authorization', `Bearer ${token}`);
  return body === undefined ? r : r.send(body);
};
const ok = async (p) => { const r = await p; assert.ok(r.status < 300, `${r.status} ${JSON.stringify(r.body)}`); return r.body; };

before(async () => {
  const { rows } = await pool.query('SELECT current_database() AS db');
  if (!rows[0].db.endsWith('_test')) throw new Error(`Refusing to run tests against "${rows[0].db}".`);
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate({ log: () => {} });
  token = await userToken(app, { fullName: 'Kofi Asare', phone: '0241110031', password: 'print-2026-x' });
  biz = (await createBusinessFor(app, token, { name: 'Asare Printing', cashOpeningBalance: 500 })).body.business.id;
});
after(() => pool.end());

test('the yearly charges: part of the first year, then full years, never below zero', () => {
  const a = { cost: 6000, depreciation_rate: 20, bought_on: '2024-10-15' };
  assert.deepEqual(dep.charges(a, '2026-10-23'), [
    { yearEnd: '2024-12-31', charge: 300 }, // October to December: 3 of 12 months
    { yearEnd: '2025-12-31', charge: 1200 },
  ]);
  assert.equal(dep.valueOn(a, '2024-12-30'), 6000, 'nothing is taken off before the year end');
  assert.equal(dep.valueOn(a, '2024-12-31'), 5700);
  assert.equal(dep.valueOn(a, '2026-10-23'), 4500);
  assert.equal(dep.nextCharge(a, '2026-10-23'), 1200);
  assert.equal(dep.chargedBetween(a, '2025-12-01', '2025-12-31'), 1200);
  assert.equal(dep.chargedBetween(a, '2025-11-01', '2025-11-30'), 0);
  // Worn out: stops at zero
  const b = { cost: 1000, depreciation_rate: 50, bought_on: '2023-01-10' };
  assert.deepEqual(dep.charges(b, '2026-12-31').map((c) => c.charge), [500, 500]);
  assert.equal(dep.valueOn(b, '2026-12-31'), 0);
  // Sold before the year end: no charge for that year
  const c = { cost: 1200, depreciation_rate: 25, bought_on: '2025-01-01', disposed_on: '2025-06-30' };
  assert.deepEqual(dep.charges(c, '2026-12-31'), []);
  // No rate: the owner's estimate
  assert.equal(dep.valueOn({ cost: 800, current_value: 650, bought_on: '2025-03-01' }, '2026-10-23'), 650);
});

test('equipment with a rate: the list, the balance sheet and the profit and loss', async () => {
  const press = (await ok(api('post', '/assets', { name: 'Printing press', cost: 6000, boughtOn: '2024-10-15', depreciationRate: 20 }))).asset;
  await ok(api('post', '/assets', { name: 'Shelves', cost: 800, currentValue: 650, boughtOn: '2025-03-01' }));
  const today = new Date().toISOString().slice(0, 10);
  const yearsDone = Number(today.slice(0, 4)) - 2026; // full years after 2025 that have ended (0 in 2026)
  const expected = Math.max(0, 6000 - 300 - 1200 - 1200 * yearsDone);

  const list = await ok(api('get', '/assets'));
  const p = list.assets.find((a) => a.name === 'Printing press');
  assert.equal(p.depreciationRate, 20);
  assert.equal(p.currentValue, expected.toFixed(2));
  assert.equal(p.depreciatedSoFar, (6000 - expected).toFixed(2));
  assert.equal(p.nextCharge, '1200.00');
  assert.equal(list.assets.find((a) => a.name === 'Shelves').depreciationRate, null);
  assert.equal(list.totalValue, (expected + 650).toFixed(2));

  const bs = await ok(api('get', '/reports/balance-sheet?asOf=2025-12-31'));
  assert.deepEqual(bs.assets.equipment.map((e) => [e.name, e.amount]), [['Printing press', '4500.00'], ['Shelves', '650.00']]);
  const bsBefore = await ok(api('get', '/reports/balance-sheet?asOf=2025-12-30'));
  assert.equal(bsBefore.assets.equipment[0].amount, '5700.00');

  const year = await ok(api('get', '/reports/profit-loss?from=2025-01-01&to=2025-12-31'));
  const line = year.expenses.find((e) => e.line === 'depreciation');
  assert.equal(line.amount, '1200.00');
  assert.equal(year.totals.netProfit, '-1200.00', 'depreciation is a cost of running the business');
  const nov = await ok(api('get', '/reports/profit-loss?from=2025-11-01&to=2025-11-30'));
  assert.equal(nov.expenses.find((e) => e.line === 'depreciation'), undefined, 'charged only at the year end');
  const first = await ok(api('get', '/reports/profit-loss?from=2024-12-01&to=2024-12-31'));
  assert.equal(first.expenses.find((e) => e.line === 'depreciation').amount, '300.00');

  // Change the rate, then stop depreciating and keep a value of your own
  const changed = (await ok(api('patch', `/assets/${press.id}`, { depreciationRate: 10 }))).asset;
  assert.equal(changed.depreciationRate, 10);
  assert.equal((await ok(api('get', '/reports/balance-sheet?asOf=2025-12-31'))).assets.equipment[0].amount, '5250.00'); // 150 + 600
  const stopped = (await ok(api('patch', `/assets/${press.id}`, { depreciationRate: null, currentValue: 5000 }))).asset;
  assert.equal(stopped.depreciationRate, null);
  assert.equal(stopped.currentValue, '5000.00');
  const r = await api('patch', `/assets/${press.id}`, { depreciationRate: 150 });
  assert.equal(r.status, 400);
});
