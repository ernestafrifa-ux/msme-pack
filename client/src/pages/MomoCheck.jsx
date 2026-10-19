import { useEffect, useState } from 'react';
import { api, newClientRef } from '../api';
import { useSession } from '../session.jsx';
import { useT } from '../i18n.jsx';
import { Field, FormError, TopBar } from '../components.jsx';
import { money, friendlyDate } from '../format';
import { parseMomo } from '../momoParse';

const KIND = { sale: 'Sale', other_income: 'Other income', owner_capital: 'Money put in', loan_received: 'Loan received',
  expense: 'Expense', purchase: 'Stock bought', owner_draw: 'Owner pay', loan_repayment: 'Loan repayment', equipment: 'Equipment',
  vat_payment: 'VAT paid', transfer: 'Transfer' };

// Check MoMo payments against the records: paste the SMS messages or open a downloaded statement.
export default function MomoCheck() {
  const { business } = useSession();
  const { t } = useT();
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState('');
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [added, setAdded] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/businesses/${business.id}/accounts`).then((d) => {
      setAccounts(d.accounts);
      setAccountId((d.accounts.find((a) => a.kind === 'mobile_money') || d.accounts[0])?.id || '');
    }).catch((err) => setMessage(err.message));
  }, [business.id]);

  async function check(e) {
    e?.preventDefault();
    setMessage(''); setResult(null); setAdded({});
    const lines = parseMomo(text);
    if (!lines.length) { setMessage('No MoMo payments were found. Paste the SMS messages as they are, or open the statement file (CSV).'); return; }
    setBusy(true);
    try { setResult(await api(`/businesses/${business.id}/momo/match`, { method: 'POST', body: { accountId, lines } })); }
    catch (err) { setMessage(err.message); } finally { setBusy(false); }
  }
  async function openFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) setText(await file.text());
  }
  async function add(line, i) {
    const body = { kind: line.direction === 'in' ? 'sale' : 'expense', accountId, date: line.date, amount: line.amount,
      paymentRef: line.ref || null, note: line.name ? `MoMo ${line.direction === 'in' ? 'from' : 'to'} ${line.name}` : 'From MoMo statement',
      clientRef: newClientRef() };
    try {
      await api(`/businesses/${business.id}/transactions`, { method: 'POST', body });
      setAdded({ ...added, [i]: body.kind });
    } catch (err) { setMessage(err.message); }
  }

  const missing = result ? result.lines.map((l, i) => ({ ...l, i })).filter((l) => l.status === 'missing') : [];
  return (
    <main className="screen">
      <TopBar title="Check against MoMo" back="/close-day" />
      <p className="lead">See which MoMo payments are not in your records yet, and which records are not on MoMo.</p>
      <FormError message={message} />
      <form className="card stack" onSubmit={check} noValidate>
        <Field label="MoMo account">
          {(p) => <select {...p} value={accountId} onChange={(e) => setAccountId(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>}
        </Field>
        <Field label="Paste the MoMo SMS messages, or a statement" hint="Copy several messages at once from your SMS app and paste them here.">
          {(p) => <textarea {...p} rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder="Payment received for GHS 50.00 from KOFI MENSAH… Transaction ID: …" />}
        </Field>
        <label className="btn btn-ghost btn-block file-btn">
          Open a statement file (CSV)
          <input type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={openFile} />
        </label>
        <button className="btn btn-primary btn-block" disabled={busy || !text.trim()}>{busy ? 'Checking…' : 'Check'}</button>
      </form>

      {result && (
        <>
          <section className="card stack-tight">
            <h2>{result.account}: {friendlyDate(result.from, t)}{result.to !== result.from ? ` to ${friendlyDate(result.to, t)}` : ''}</h2>
            <div className="statement-row"><span>MoMo payments found</span><span className="strong">{result.counts.lines}</span></div>
            <div className="statement-row"><span>Already in your records</span><span className="strong pos-text">{result.counts.matched}</span></div>
            <div className="statement-row"><span>Not in your records</span><span className={'strong ' + (result.counts.missing ? 'warn-text' : '')}>{result.counts.missing}</span></div>
            <div className="statement-row"><span>In records, not on MoMo</span><span className={'strong ' + (result.counts.notOnStatement ? 'warn-text' : '')}>{result.counts.notOnStatement}</span></div>
          </section>

          {missing.length > 0 && (
            <section>
              <div className="card-head"><h2>Not in your records</h2></div>
              <ul className="txn-list">
                {missing.map((l) => (
                  <li key={l.i} className="txn momo-line">
                    <div className="txn-main">
                      <div className="txn-title">{l.direction === 'in' ? 'Received' : 'Paid out'} GHS {money(l.amount)}</div>
                      <div className="muted small">{friendlyDate(l.date, t)}{l.name ? ` · ${l.name}` : ''}{l.ref ? ` · ID ${l.ref}` : ''}</div>
                    </div>
                    {added[l.i]
                      ? <span className="small pos-text strong">Added as {added[l.i] === 'sale' ? 'a sale' : 'an expense'}</span>
                      : <button type="button" className="btn btn-ghost btn-small" onClick={() => add(l, l.i)}>{l.direction === 'in' ? 'Add as a sale' : 'Add as an expense'}</button>}
                  </li>
                ))}
              </ul>
              <p className="muted small">Not a sale or an expense (for example money you moved to the cash box)? Record it on the Record screen instead.</p>
            </section>
          )}

          {result.notOnStatement.length > 0 && (
            <section>
              <div className="card-head"><h2>In your records, not on MoMo</h2></div>
              <p className="muted small">Check these were really paid through MoMo, or whether the statement covers those days.</p>
              <ul className="txn-list">
                {result.notOnStatement.map((r) => (
                  <li key={r.id} className="txn">
                    <div className="txn-main">
                      <div className="txn-title">{KIND[r.kind] || r.kind} GHS {money(r.amount)}</div>
                      <div className="muted small">{friendlyDate(r.date, t)}{r.what ? ` · ${r.what}` : ''}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {!missing.length && !result.notOnStatement.length && <div className="flash">Everything matches.</div>}
        </>
      )}
    </main>
  );
}
