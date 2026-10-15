// Applies every .sql file in db/migrations that hasn't run yet, in name order.
// Usage: npm run migrate
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db');
const { seedContent } = require('./seed');
const { normaliseGhanaPhone } = require('../src/phone');

async function migrate({ log = console.log } = {}) {
  const client = await pool.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    const done = new Set(
      (await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name)
    );
    const dir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      log(`Applying ${file}…`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${err.message}`);
      }
    }
    // Guides and health check questions from server/content/.
    await client.query('BEGIN');
    try {
      await seedContent(client, { log });
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Loading content failed: ${err.message}`);
    }
    // Content admins named in the ADMIN_PHONES setting (handy on hosts without a terminal).
    for (const raw of (process.env.ADMIN_PHONES || '').split(',').map((x) => x.trim()).filter(Boolean)) {
      const phone = normaliseGhanaPhone(raw);
      if (!phone) { log(`ADMIN_PHONES: "${raw}" is not a Ghana phone number, skipped.`); continue; }
      const { rowCount } = await client.query(
        `UPDATE users SET platform_role = 'admin', updated_at = now() WHERE phone = $1 AND platform_role <> 'admin'`, [phone]
      );
      if (rowCount) log(`${phone} is now a content admin.`);
    }
    log('Database is up to date.');
  } finally {
    client.release();
  }
}

if (require.main === module) {
  migrate()
    .then(() => pool.end())
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}

module.exports = { migrate };
