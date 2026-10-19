// Sending text messages (SMS) through a Ghanaian SMS provider. Off until it is set up:
//   SMS_PROVIDER = arkesel | hubtel      (or "log" for testing: nothing is sent)
//   SMS_SENDER   = the sender ID registered with the provider (up to 11 letters), e.g. MSMEPack
//   Arkesel: SMS_API_KEY          Hubtel: HUBTEL_CLIENT_ID and HUBTEL_CLIENT_SECRET
//   SMS_DAILY_LIMIT = most SMS one business may send in a day (default 30), to control the cost.
const { query } = require('./db');

const provider = () => (process.env.SMS_PROVIDER || '').toLowerCase();
const sender = () => (process.env.SMS_SENDER || 'MSMEPack').slice(0, 11);
const dailyLimit = () => Number(process.env.SMS_DAILY_LIMIT) || 30;

function smsEnabled() {
  const p = provider();
  if (p === 'log') return true;
  if (p === 'arkesel') return !!process.env.SMS_API_KEY;
  if (p === 'hubtel') return !!(process.env.HUBTEL_CLIENT_ID && process.env.HUBTEL_CLIENT_SECRET);
  return false;
}

// "+233241234567" or "0241234567" -> "233241234567"
function intl(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (/^0\d{9}$/.test(d)) return `233${d.slice(1)}`;
  if (/^233\d{9}$/.test(d)) return d;
  return null;
}

// Sends one message to one or more numbers. Returns [{ to, ok, ref, error }].
async function deliver(numbers, text) {
  const p = provider();
  if (p === 'log') return numbers.map((to) => ({ to, ok: true, ref: `log-${Date.now()}` }));
  if (p === 'arkesel') {
    // https://sms.arkesel.com/api/v2/sms/send — header api-key; body { sender, message, recipients }
    const res = await fetch('https://sms.arkesel.com/api/v2/sms/send', {
      method: 'POST',
      headers: { 'api-key': process.env.SMS_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ sender: sender(), message: text, recipients: numbers }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    const ok = res.ok && (data.status === 'success' || data.code === 'ok' || data.status === 'ok');
    return numbers.map((to) => ({ to, ok, ref: ok ? JSON.stringify(data.data || '').slice(0, 200) : null, error: ok ? null : (data.message || `HTTP ${res.status}`) }));
  }
  if (p === 'hubtel') {
    // Hubtel SMS: POST https://smsc.hubtel.com/v1/messages/send with Basic auth (client id : secret), one number at a time.
    const auth = Buffer.from(`${process.env.HUBTEL_CLIENT_ID}:${process.env.HUBTEL_CLIENT_SECRET}`).toString('base64');
    const out = [];
    for (const to of numbers) {
      const res = await fetch('https://smsc.hubtel.com/v1/messages/send', {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ From: sender(), To: to, Content: text }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await res.json().catch(() => ({}));
      out.push({ to, ok: res.ok, ref: data.messageId || data.MessageId || null, error: res.ok ? null : (data.message || data.Message || `HTTP ${res.status}`) });
    }
    return out;
  }
  throw new Error('SMS is not set up.');
}

// Sends and records in sms_log. `businessId` counts against that business's daily limit
// (null for messages from the MSME Pack admin). Throws a friendly error when not possible.
async function sendSms({ to, text, purpose, businessId = null, userId = null }) {
  if (!smsEnabled()) {
    const e = new Error('Text messages (SMS) are not set up yet.');
    e.status = 409;
    throw e;
  }
  const numbers = [...new Set((Array.isArray(to) ? to : [to]).map(intl).filter(Boolean))];
  if (!numbers.length) {
    const e = new Error('There is no valid phone number to send to.');
    e.status = 400;
    throw e;
  }
  if (businessId) {
    const { rows } = await query(
      `SELECT COUNT(*)::int AS n FROM sms_log WHERE business_id = $1 AND created_at > now() - interval '1 day' AND purpose <> 'notice'`,
      [businessId]
    );
    if (rows[0].n + numbers.length > dailyLimit()) {
      const e = new Error(`The daily limit of ${dailyLimit()} text messages has been reached. Use WhatsApp, or try again tomorrow.`);
      e.status = 429;
      throw e;
    }
  }
  let results;
  try {
    results = await deliver(numbers, text);
  } catch (err) {
    results = numbers.map((n) => ({ to: n, ok: false, error: err.message }));
  }
  for (const r of results) {
    await query(
      `INSERT INTO sms_log (business_id, to_phone, message, purpose, status, provider_ref, error, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [businessId, r.to, text, purpose, r.ok ? 'sent' : 'failed', r.ref || null, r.error || null, userId]
    );
  }
  return { sent: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results };
}

module.exports = { smsEnabled, sendSms, intl, provider };
