const { Pool, types } = require('pg');
const config = require('./config');

// Return DATE columns as plain 'YYYY-MM-DD' strings instead of JS Date
// objects, so dates never shift because of server time zones.
types.setTypeParser(1082, (v) => v);

const pool = new Pool({ connectionString: config.databaseUrl });

async function query(text, params) {
  return pool.query(text, params);
}

// Run fn(client) inside a transaction; rolls back on any error.
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction };
