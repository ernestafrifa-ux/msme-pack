// Health check scoring, recommendations and the guide library.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { pool } = require('../src/db');
const { migrate } = require('../db/migrate');
const { userToken, createBusinessFor } = require('./helpers');

const app = createApp();
let token, other, biz, firstId, questions;

const as = (t) => (method, path, body) => {
  const r = request(app)[method](`/api${path}`).set('Authorization', `Bearer ${t}`);
  return body === undefined ? r : r.send(body);
};
let api;

before(async () => {
  const { rows } = await pool.query('SELECT current_database() AS db');
  if (!rows[0].db.endsWith('_test')) throw new Error(`Refusing to run tests against "${rows[0].db}".`);
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate({ log: () => {} });
  let r = { body: { token: await userToken(app, { fullName: 'Ama Mensah', phone: '0241112222', password: 'shito-2026' }) } };
  token = r.body.token;
  api = as(token);
  r = { body: { token: await userToken(app, { fullName: 'Kofi', phone: '0209998888', password: 'kofi-pass-1' }) } };
  other = r.body.token;
  r = await createBusinessFor(app, token, { name: "Ama's Shito" });
  biz = r.body.business.id;
});
after(() => pool.end());

test('guide library lists all guides, opening one marks it started', async () => {
  let r = await api('get', '/guides');
  assert.equal(r.status, 200);
  assert.equal(r.body.guides.length, 11);
  const sep = r.body.guides.find((g) => g.slug === 'separate-business-money');
  assert.equal(sep.areaName, 'Money & records');
  assert.equal(sep.progress, null);

  r = await api('get', '/guides/separate-business-money');
  assert.equal(r.status, 200);
  assert.match(r.body.guide.body, /## 1\. Give the business its own place for money/);
  assert.equal(r.body.guide.toolPath, '/record/sale');
  assert.equal(r.body.guide.progress, 'started');

  assert.equal((await api('get', '/guides/no-such-guide')).status, 404);
  assert.equal((await request(app).get('/api/guides')).status, 401, 'login required');
});

test('a guide in the user\'s language falls back to English when none exists', async () => {
  const twi = as(await userToken(app, { fullName: 'Yaw Twi', phone: '0277000111', password: 'yaw-pass-1', preferredLanguage: 'tw' }));
  const r = await twi('get', '/guides/tax-basics');
  assert.equal(r.status, 200);
  assert.equal(r.body.guide.language, 'en');
});

test('starting the health check gives 18 questions in 6 areas, and resumes', async () => {
  let r = await api('post', `/businesses/${biz}/health`);
  assert.equal(r.status, 201);
  firstId = r.body.id;
  questions = r.body.questions;
  assert.equal(questions.length, 18);
  assert.equal(new Set(questions.map((q) => q.areaCode)).size, 6);
  assert.ok(questions.every((q) => q.options.length === 4));
  assert.ok(!('score' in questions[0].options[0]), 'scores are not sent to the phone');

  await api('put', `/businesses/${biz}/health/${firstId}/answers`, { questionId: questions[0].id, optionId: questions[0].options[2].id });
  r = await api('post', `/businesses/${biz}/health`);
  assert.equal(r.body.id, firstId, 'same check continues');
  assert.equal(r.body.answers[questions[0].id], questions[0].options[2].id);
});

test('answers are checked and every question must be answered', async () => {
  let r = await api('put', `/businesses/${biz}/health/${firstId}/answers`,
    { questionId: questions[0].id, optionId: questions[1].options[0].id });
  assert.equal(r.status, 400, 'option from another question');
  r = await api('post', `/businesses/${biz}/health/${firstId}/complete`);
  assert.equal(r.status, 400);
  assert.match(r.body.error, /17 left/);
});

test('scores per area and recommendations, weakest area first', async () => {
  // Money & records: worst answers. Registration: "renewal is late" (2 of 4). Everything else: best answers.
  for (const q of questions) {
    let pick = 3;
    if (q.areaCode === 'FIN') pick = 0;
    if (q.code === 'comp_registered') pick = 2;
    await api('put', `/businesses/${biz}/health/${firstId}/answers`, { questionId: q.id, optionId: q.options[pick].id });
  }
  const r = await api('post', `/businesses/${biz}/health/${firstId}/complete`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const areas = Object.fromEntries(r.body.result.areas.map((a) => [a.code, a.score]));
  assert.deepEqual(areas, { FIN: 0, COMP: 83, OPS: 100, MKT: 100, PEOPLE: 100, FUND: 100 });
  assert.equal(r.body.result.overallScore, 81); // (0 + 83.3 + 4×100) / 6

  const slugs = r.body.recommendations.map((x) => x.slug);
  assert.equal(slugs.length, 4);
  assert.deepEqual(new Set(slugs.slice(0, 3)), new Set(['separate-business-money', 'keep-daily-records', 'price-for-profit']));
  assert.equal(slugs[3], 'register-your-business');
  assert.equal(r.body.recommendations[0].priority, 1);
  assert.equal(r.body.recommendations[3].priority, 4);

  assert.equal((await api('post', `/businesses/${biz}/health/${firstId}/complete`)).status, 409, 'cannot finish twice');
});

test('finishing a guide ticks it off the recommendations', async () => {
  let r = await api('post', '/guides/separate-business-money/complete', { done: true });
  assert.equal(r.body.progress, 'completed');
  r = await api('get', `/businesses/${biz}/health`);
  assert.equal(r.body.latest.overallScore, 81);
  assert.equal(r.body.recommendations.length, 3);
  assert.ok(!r.body.recommendations.some((x) => x.slug === 'separate-business-money'));
  r = await api('get', '/guides');
  assert.equal(r.body.guides.find((g) => g.slug === 'separate-business-money').progress, 'completed');

  await api('patch', `/businesses/${biz}/recommendations/price-for-profit`, { status: 'dismissed' });
  r = await api('get', `/businesses/${biz}/health`);
  assert.equal(r.body.recommendations.length, 2);
});

test('retaking the check: improved areas clear their recommendations', async () => {
  let r = await api('post', `/businesses/${biz}/health`);
  assert.notEqual(r.body.id, firstId);
  const id = r.body.id;
  for (const q of r.body.questions) {
    await api('put', `/businesses/${biz}/health/${id}/answers`, { questionId: q.id, optionId: q.options[3].id });
  }
  r = await api('post', `/businesses/${biz}/health/${id}/complete`);
  assert.equal(r.body.result.overallScore, 100);
  assert.deepEqual(r.body.recommendations, []);
  r = await api('get', `/businesses/${biz}/health`);
  assert.equal(r.body.latest.previousScore, 81);
  assert.equal(r.body.inProgress, null);
});

test("another user can't see or answer this business's health check", async () => {
  const o = as(other);
  assert.equal((await o('get', `/businesses/${biz}/health`)).status, 404);
  assert.equal((await o('post', `/businesses/${biz}/health`)).status, 404);
});

test('content files are valid', () => {
  const { loadGuides } = require('../db/seed');
  const questionsFile = require('../content/health-check.js');
  const slugs = new Set(loadGuides().map((g) => g.slug));
  for (const q of questionsFile) {
    assert.equal(q.options.length, 4, q.code);
    for (const g of q.guides || []) assert.ok(slugs.has(g.slug), `${q.code} → ${g.slug}`);
  }
});
