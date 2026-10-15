// Gives a user content-admin rights (upload guide audio).
// Usage: npm run make-admin -- 0244123456
//        npm run make-admin -- 0244123456 --remove
const { pool } = require('../src/db');
const { normaliseGhanaPhone } = require('../src/phone');

async function main() {
  const [raw, flag] = process.argv.slice(2);
  const phone = normaliseGhanaPhone(raw || '');
  if (!phone) throw new Error('Give the phone number of an existing account, e.g. npm run make-admin -- 0244123456');
  const role = flag === '--remove' ? 'user' : 'admin';
  const { rows } = await pool.query(
    'UPDATE users SET platform_role = $2, updated_at = now() WHERE phone = $1 RETURNING full_name', [phone, role]
  );
  if (!rows[0]) throw new Error(`No account with phone ${phone}. Sign up in the app first.`);
  console.log(`${rows[0].full_name} (${phone}) is now ${role === 'admin' ? 'a content admin' : 'a normal user'}.`);
}

main().then(() => pool.end()).catch((err) => { console.error(err.message); process.exit(1); });
