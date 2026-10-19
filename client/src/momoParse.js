// Reads Mobile Money payments from pasted SMS messages or a downloaded statement (CSV).
// Formats differ between networks and change over time, so this looks for the usual
// signs: an amount in GHS, words like "received" or "sent", a date and a transaction ID.
// Returns [{ date: 'YYYY-MM-DD', amount, direction: 'in' | 'out', ref, name }].

const IN_WORDS = /(receiv|cash ?in|deposit|credited|credit\b|money in|incoming)/i;
const OUT_WORDS = /(payment made|you have paid|paid to|sent|transfer(?:red)? to|cash ?out|withdraw|debited|debit\b|money out|purchase|airtime|bill)/i;
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

const pad = (n) => String(n).padStart(2, '0');
function toIso(y, m, d) {
  y = Number(y); m = Number(m); d = Number(d);
  if (y < 100) y += 2000;
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function parseDate(text) {
  if (!text) return null;
  let m = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return toIso(m[1], m[2], m[3]);
  m = text.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/); // Ghana writes day/month/year
  if (m) return toIso(m[3], m[2], m[1]);
  m = text.match(/(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*[\s,-]*(\d{2,4})/);
  if (m && MONTHS[m[2].toLowerCase()]) return toIso(m[3], MONTHS[m[2].toLowerCase()], m[1]);
  return null;
}

const money = (s) => Number(String(s).replace(/[^0-9.-]/g, ''));

function splitCsvLine(line) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function parseCsv(text) {
  const rows = text.split(/\r?\n/).filter((l) => l.trim()).map(splitCsvLine);
  const headerAt = rows.findIndex((r) => r.some((c) => /date/i.test(c)) && r.some((c) => /amount|credit|debit/i.test(c)));
  if (headerAt < 0) return [];
  const h = rows[headerAt].map((c) => c.toLowerCase());
  const col = (re, not) => h.findIndex((c) => re.test(c) && !(not && not.test(c)));
  const iDate = col(/date|time/);
  const iAmount = col(/^amount$|^amt|amount \(|trans.*amount/);
  const iAmount2 = iAmount < 0 ? col(/amount/, /fee|levy|bal/) : iAmount;
  const iCredit = col(/credit|money in|received/);
  const iDebit = col(/debit|money out|sent/);
  const iType = col(/type|description|details|narration|remark/);
  const iRef = col(/transaction id|trans\.? id|^id$|f_id|ref/);
  const iName = col(/name|counterparty|from|to /);
  const out = [];
  for (const r of rows.slice(headerAt + 1)) {
    const date = parseDate(r[iDate]);
    if (!date) continue;
    let amount = 0; let direction = null;
    if (iCredit >= 0 && money(r[iCredit]) > 0) { amount = money(r[iCredit]); direction = 'in'; }
    else if (iDebit >= 0 && money(r[iDebit]) > 0) { amount = money(r[iDebit]); direction = 'out'; }
    else if (iAmount2 >= 0) {
      const a = money(r[iAmount2]);
      amount = Math.abs(a);
      const type = iType >= 0 ? r[iType] : r.join(' ');
      direction = a < 0 ? 'out' : IN_WORDS.test(type) ? 'in' : OUT_WORDS.test(type) ? 'out' : null;
    }
    if (!(amount > 0) || !direction) continue;
    out.push({ date, amount: Math.round(amount * 100) / 100, direction, ref: iRef >= 0 ? r[iRef] || null : null, name: iName >= 0 ? r[iName] || null : null });
  }
  return out;
}

function parseSms(text) {
  // One message per paragraph, or per line when they were pasted line by line.
  const chunks = text.split(/\n\s*\n/).flatMap((c) => (c.split('\n').filter((l) => /GH[S¢C]/i.test(l)).length > 1 ? c.split('\n') : [c]));
  const out = [];
  for (const c of chunks) {
    const amt = c.match(/GH(?:S|¢|C)\s?([\d,]+(?:\.\d{1,2})?)/i);
    if (!amt) continue;
    const direction = IN_WORDS.test(c) ? 'in' : OUT_WORDS.test(c) ? 'out' : null;
    if (!direction) continue;
    const date = parseDate(c);
    if (!date) continue;
    const ref = (c.match(/(?:financial\s+)?trans(?:action)?\.?\s*id[:\s]*([A-Za-z0-9.]+)/i) || c.match(/ref(?:erence)?[:\s]+([A-Za-z0-9.]{4,})/i) || [])[1] || null;
    // Names are usually in capitals ("from KOFI MENSAH"); otherwise take capitalised words before the next keyword.
    let name = (c.match(/(?:from|to)\s+([A-Z][A-Z.'-]+(?:\s+[A-Z][A-Z.'-]+){0,3})\b/) || [])[1] || null;
    if (!name) {
      const m = c.match(/(?:from|to)\s+([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,3})/);
      if (m) name = m[1].replace(/\s+(Current|Available|Your|Ref|Reference|Transaction|Balance|On|At)\b.*$/, '') || null;
    }
    out.push({ date, amount: Math.round(money(amt[1]) * 100) / 100, direction, ref: ref ? ref.replace(/\.$/, '') : null, name });
  }
  return out;
}

export function parseMomo(text) {
  const t = String(text || '').trim();
  if (!t) return [];
  const firstLines = t.split(/\r?\n/).slice(0, 5).join('\n');
  const looksCsv = (firstLines.match(/,/g) || []).length >= 3 && /date/i.test(firstLines);
  return looksCsv ? parseCsv(t) : parseSms(t);
}
