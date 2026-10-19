// The phone-side reader for MoMo SMS messages and statements (client/src/momoParse.js).
const { test } = require('node:test');
const path = require('path');
const assert = require('node:assert/strict');

test('MoMo statements and SMS are read into payments', async () => {
  const { parseMomo, parseDate } = await import(path.join(__dirname, '..', '..', 'client', 'src', 'momoParse.js'));
assert.equal(parseDate('19/10/2026 14:02'), '2026-10-19');
assert.equal(parseDate('2026-10-19 10:00'), '2026-10-19');
assert.equal(parseDate('19-Oct-2026'), '2026-10-19');
const sms = `Payment received for GHS 50.00 from KOFI MENSAH Current Balance: GHS 1,234.00 . Available Balance: GHS 1,234.00. Reference: books. Transaction ID: 51234567890. TRANSACTION FEE: 0.00 on 2026-10-19 09:15

Payment made for GHS 120.00 to KEJETIA WHOLESALE. Current Balance: GHS 1,114.00. Transaction ID: 51234567999 on 19/10/2026

Your account balance is GHS 1,114.00`;
const r = parseMomo(sms);
assert.equal(r.length, 2);
assert.deepEqual(r[0], { date: '2026-10-19', amount: 50, direction: 'in', ref: '51234567890', name: 'KOFI MENSAH' });
assert.equal(r[1].direction, 'out');
assert.equal(r[1].amount, 120);
assert.equal(r[1].name, 'KEJETIA WHOLESALE');
const csv = `Statement for 0244560077
TRANSACTION DATE,FROM NAME,TRANS. TYPE,AMOUNT,FEES,BAL AFTER,TO NAME,F_ID
19-10-2026 09:15,KOFI MENSAH,Payment Received,50.00,0.00,1234.00,ADWOA MENSAH,51234567890
19-10-2026 11:00,ADWOA MENSAH,Payment Sent,"1,200.00",1.00,34.00,KEJETIA,51234567999`;
const c = parseMomo(csv);
assert.equal(c.length, 2);
assert.deepEqual(c[0], { date: '2026-10-19', amount: 50, direction: 'in', ref: '51234567890', name: 'KOFI MENSAH' });
assert.equal(c[1].amount, 1200);
assert.equal(c[1].direction, 'out');
const csv2 = `Date,Description,Debit,Credit,Balance
2026-10-18,Cash in,,300.00,300.00
2026-10-18,Merchant payment,45.50,,254.50`;
const d = parseMomo(csv2);
assert.deepEqual(d.map((x) => [x.direction, x.amount]), [['in', 300], ['out', 45.5]]);
});
