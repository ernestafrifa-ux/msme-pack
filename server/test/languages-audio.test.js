// Language choice, Twi draft guides and guide audio.
const os = require('os');
const fs = require('fs');
const path = require('path');
process.env.MEDIA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'msme-media-'));

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { pool } = require('../src/db');
const { migrate } = require('../db/migrate');
const { sniffAudio } = require('../src/routes/guides');

const app = createApp();
let user, admin;

// A tiny valid WAV file: 0.1 s of silence.
function wav(seconds = 0.1) {
  const rate = 8000;
  const samples = Math.round(rate * seconds);
  const b = Buffer.alloc(44 + samples * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + samples * 2, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(samples * 2, 40);
  return b;
}

before(async () => {
  const { rows } = await pool.query('SELECT current_database() AS db');
  if (!rows[0].db.endsWith('_test')) throw new Error(`Refusing to run tests against "${rows[0].db}".`);
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate({ log: () => {} });
  user = (await request(app).post('/api/auth/signup').send({ fullName: 'Ama Mensah', phone: '0241112222', password: 'shito-2026' })).body.token;
  admin = (await request(app).post('/api/auth/signup').send({ fullName: 'Content Admin', phone: '0501112222', password: 'admin-pass-1' })).body.token;
  await pool.query(`UPDATE users SET platform_role = 'admin' WHERE phone = '+233501112222'`);
});
after(async () => {
  await pool.end();
  fs.rmSync(process.env.MEDIA_DIR, { recursive: true, force: true });
});

const get = (t, p) => request(app).get(`/api${p}`).set('Authorization', `Bearer ${t}`);

test('switching to Twi shows the Twi drafts, marked as drafts, and English for the rest', async () => {
  let r = await request(app).patch('/api/auth/me').set('Authorization', `Bearer ${user}`).send({ preferredLanguage: 'tw' });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.preferredLanguage, 'tw');
  assert.equal(r.body.user.isAdmin, false);

  r = await get(user, '/guides');
  const bySlug = Object.fromEntries(r.body.guides.map((g) => [g.slug, g]));
  assert.equal(bySlug['separate-business-money'].title, 'Tew adwuma sika ne fie sika mu');
  assert.equal(bySlug['separate-business-money'].language, 'tw');
  assert.equal(bySlug['separate-business-money'].isDraft, true);
  assert.equal(bySlug['tax-basics'].language, 'en');
  assert.equal(bySlug['tax-basics'].isDraft, false);

  r = await get(user, '/guides/price-for-profit?original=1');
  assert.match(r.body.guide.body, /Anammɔn 1/);
  assert.equal(r.body.guide.toolPath, '/stock/new', 'Twi guide keeps the app link');
  assert.equal(r.body.guide.toolLabel, 'Fa adeɛ ka ho ne ne boɔ');
  assert.equal(r.body.guide.original.title, 'Price your products for profit');

  r = await request(app).patch('/api/auth/me').set('Authorization', `Bearer ${user}`).send({ preferredLanguage: 'xx' });
  assert.equal(r.status, 400);
});

test('audio files are recognised by their content', () => {
  assert.equal(sniffAudio(wav()).ext, 'wav');
  assert.equal(sniffAudio(Buffer.from('ID3\u0004\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000', 'latin1')).ext, 'mp3');
  assert.equal(sniffAudio(Buffer.from('\u0000\u0000\u0000 ftypM4A \u0000\u0000', 'latin1')).ext, 'm4a');
  assert.equal(sniffAudio(Buffer.from('<html><body>not audio</body></html>')), null);
});

test('only content admins can upload audio', async () => {
  const r = await request(app).put('/api/guides/separate-business-money/audio?lang=tw')
    .set('Authorization', `Bearer ${user}`).set('Content-Type', 'audio/wav').send(wav());
  assert.equal(r.status, 403);
});

test('upload, play, replace, approve and delete a Twi recording', async () => {
  const put = (body, type = 'audio/wav', q = 'lang=tw') =>
    request(app).put(`/api/guides/separate-business-money/audio?${q}`)
      .set('Authorization', `Bearer ${admin}`).set('Content-Type', type).send(body);

  let r = await put(Buffer.from('<script>alert(1)</script> pretending to be audio'));
  assert.equal(r.status, 400, 'not audio');
  r = await put(wav(), 'audio/wav', 'lang=zz');
  assert.equal(r.status, 400, 'unknown language');
  r = await request(app).put('/api/guides/no-such-guide/audio?lang=tw')
    .set('Authorization', `Bearer ${admin}`).set('Content-Type', 'audio/wav').send(wav());
  assert.equal(r.status, 404);

  r = await put(wav());
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const firstUrl = r.body.audio.url;
  assert.match(firstUrl, /^\/media\/audio\/separate-business-money-tw-[0-9a-f]+\.wav$/);
  assert.equal(r.body.audio.isDraft, true);

  // It plays, including partial (range) requests used by phones to skip through.
  r = await request(app).get(firstUrl);
  assert.equal(r.status, 200);
  assert.match(r.headers['content-type'], /audio\/(wav|wave|x-wav)/);
  r = await request(app).get(firstUrl).set('Range', 'bytes=0-9');
  assert.equal(r.status, 206);

  // The Twi reader sees it first.
  r = await get(user, '/guides/separate-business-money');
  assert.equal(r.body.guide.audio.length, 1);
  assert.equal(r.body.guide.audio[0].language, 'tw');
  assert.equal(r.body.guide.audio[0].isDraft, true);

  // Replacing removes the old file.
  r = await put(wav(0.2));
  const secondUrl = r.body.audio.url;
  assert.notEqual(secondUrl, firstUrl);
  await new Promise((done) => setTimeout(done, 100));
  assert.equal((await request(app).get(firstUrl)).status, 404);

  // Reviewer approves it.
  r = await request(app).patch('/api/guides/separate-business-money/audio/tw')
    .set('Authorization', `Bearer ${admin}`).send({ isDraft: false });
  assert.equal(r.status, 204);
  r = await get(user, '/guides/separate-business-money');
  assert.equal(r.body.guide.audio[0].isDraft, false);

  // English audio can exist alongside; a Twi reader still gets Twi first.
  await put(wav(), 'audio/wav', 'lang=en');
  r = await get(user, '/guides/separate-business-money');
  assert.deepEqual(r.body.guide.audio.map((a) => a.language), ['tw', 'en']);

  r = await request(app).delete('/api/guides/separate-business-money/audio/tw').set('Authorization', `Bearer ${admin}`);
  assert.equal(r.status, 204);
  await new Promise((done) => setTimeout(done, 100));
  assert.equal((await request(app).get(secondUrl)).status, 404);
});

test('a guide with English text can still have Twi audio', async () => {
  const r = await request(app).put('/api/guides/tax-basics/audio?lang=tw')
    .set('Authorization', `Bearer ${admin}`).set('Content-Type', 'audio/wav').send(wav());
  assert.equal(r.status, 201);
  const g = (await get(user, '/guides/tax-basics')).body.guide;
  assert.equal(g.language, 'en');
  assert.equal(g.audio[0].language, 'tw');
});

test('files that are too big are refused with a clear message', async () => {
  const big = Buffer.concat([wav(), Buffer.alloc(21 * 1024 * 1024)]);
  const r = await request(app).put('/api/guides/tax-basics/audio?lang=tw')
    .set('Authorization', `Bearer ${admin}`).set('Content-Type', 'audio/wav').send(big);
  assert.equal(r.status, 413);
  assert.match(r.body.error, /too big/);
});
