import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../session.jsx';
import { useT } from '../i18n.jsx';
import { Field, FormError, Icon, TopBar } from '../components.jsx';
import { money, friendlyDate, longDate, todayGhana, whatsappLink } from '../format';
import { normalisePhone } from '../phone';

export default function CustomerDetail() {
  const { contactId } = useParams();
  const { business, features } = useSession();
  const { t, tt } = useT();
  const [data, setData] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [paying, setPaying] = useState(false);
  const [f, setF] = useState({ amount: '', accountId: '', date: todayGhana(), momoFee: '', paymentRef: '' });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const location = useLocation();
  const [flash, setFlash] = useState(location.state?.flash || '');
  const [busy, setBusy] = useState(false);
  const base = `/businesses/${business.id}`;

  useEffect(() => {
    api(`${base}/customers/${contactId}`).then(setData).catch((err) => setMessage(err.message));
    api(`${base}/accounts`).then((d) => setAccounts(d.accounts)).catch(() => {});
  }, [base, contactId]);

  const account = accounts.find((a) => a.id === f.accountId);
  async function pay(e) {
    e.preventDefault();
    setBusy(true); setErrors({}); setMessage(''); setFlash('');
    try {
      const d = await api(`${base}/customers/${contactId}/payments`, { method: 'POST',
        body: { amount: f.amount, accountId: f.accountId, date: f.date, momoFee: f.momoFee || 0, paymentRef: f.paymentRef || null } });
      setData(d);
      setPaying(false);
      setFlash(Number(d.owes) > 0 ? tt('GHS {amount} received. Still owed: GHS {amount2}.', { amount: money(f.amount), amount2: money(d.owes) }) : tt('GHS {amount} received. Nothing is owed now.', { amount: money(f.amount) }));
    } catch (err) { setErrors(err.fields || {}); setMessage(err.message); } finally { setBusy(false); }
  }

  if (!data) return <main className="screen"><TopBar title={tt('Customer')} back="/customers" />{message ? <div className="form-error">{message}</div> : <p className="muted">{tt('Loading…')}</p>}</main>;
  const c = data.customer;
  const owes = Number(data.owes);
  const phone = normalisePhone(c.phone);
  const reminder = `Hello ${c.name.split(' ')[0]}, this is ${business.name}. A friendly reminder: GHS ${money(data.owes)} is still to pay. Thank you.`;

  return (
    <main className="screen">
      <TopBar title={c.name} back="/customers" />
      {flash && <div className="flash" role="status">{flash}</div>}
      <section className="money-card small-card">
        <div className="money-label">{owes > 0 ? tt('Owes you') : tt('Owes nothing')}</div>
        <div className="money-total">GHS {money(data.owes)}</div>
        {c.phone && <div className="money-label">{c.phone.replace('+233', '0')}</div>}
      </section>

      {owes > 0 && !paying && (
        <div className="stack">
          <button type="button" className="btn btn-primary btn-block" onClick={() => {
            setF({ amount: data.owes, accountId: (accounts.find((a) => a.isDefault) || accounts[0])?.id || '', date: todayGhana(), momoFee: '', paymentRef: '' });
            setPaying(true);
          }}>{tt('Record money received')}</button>
          <a className="btn btn-ghost btn-block" href={whatsappLink(phone || '', reminder)} target="_blank" rel="noopener noreferrer">
            <Icon name="share" size={20} /> {tt('Send a reminder on WhatsApp')}</a>
          {features?.sms && c.phone && ['owner', 'manager'].includes(business.role) && (
            <button type="button" className="btn btn-ghost btn-block" onClick={() => api(`${base}/customers/${contactId}/sms-reminder`, { method: 'POST' })
              .then(() => setFlash(tt('Reminder sent by SMS to {value}.', { value: c.phone.replace('+233', '0') }))).catch((err) => setFlash(err.message))}>{tt('Send a reminder by SMS')}</button>
          )}
        </div>
      )}

      {paying && (
        <form className="card stack" onSubmit={pay} noValidate>
          <h2>{tt('Money received')}</h2>
          <FormError message={message} />
          <Field label={tt('Amount (GHS) · {amount} owed', { amount: money(data.owes) })} error={errors.amount} hint={tt('It pays the oldest sales first')}>
            {(p) => <input {...p} className="amount-input" type="number" inputMode="decimal" min="0" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />}
          </Field>
          <fieldset className="field">
            <legend>{tt('Where did the money go?')}</legend>
            <div className="chips">
              {accounts.map((a) => (
                <label key={a.id} className={'chip chip-lg' + (f.accountId === a.id ? ' chip-on' : '')}>
                  <input type="radio" name="custAccount" value={a.id} checked={f.accountId === a.id} onChange={() => setF({ ...f, accountId: a.id })} />
                  {a.name}
                </label>
              ))}
            </div>
            {errors.accountId && <div className="field-error">{errors.accountId}</div>}
          </fieldset>
          {account?.kind === 'mobile_money' && (
            <div className="grid-2">
              <Field label={tt('MoMo ID (optional)')}>{(p) => <input {...p} value={f.paymentRef} onChange={(e) => setF({ ...f, paymentRef: e.target.value })} />}</Field>
              <Field label={tt('MoMo fee (optional)')}>{(p) => <input {...p} type="number" inputMode="decimal" min="0" step="0.01" value={f.momoFee} onChange={(e) => setF({ ...f, momoFee: e.target.value })} />}</Field>
            </div>
          )}
          <Field label={tt('Date')} error={errors.date}>
            {(p) => <input {...p} type="date" max={todayGhana()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />}
          </Field>
          <div className="grid-2">
            <button type="button" className="btn btn-ghost" onClick={() => setPaying(false)}>{tt('Cancel')}</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? tt('Saving…') : tt('Save')}</button>
          </div>
        </form>
      )}

      {data.open.length > 0 && (
        <section>
          <div className="card-head"><h2>{tt('Still to pay')}</h2></div>
          <ul className="txn-list">
            {data.open.map((o) => (
              <li key={o.id}>
                <Link to={`/invoices/${o.id}`} className="txn report-link">
                  <span className="txn-main">
                    <span className="txn-title">{o.number} · {longDate(o.issueDate, t)}</span>
                    <span className={'small ' + (o.status === 'overdue' ? 'warn-text' : 'muted')}>
                      GHS {money(o.total)}{o.dueDate ? tt(' · pay by {date}', { date: longDate(o.dueDate, t) }) : ''}{o.status === 'overdue' ? tt(' · late') : ''}
                    </span>
                  </span>
                  <span className="txn-amt">{money(o.outstanding)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.payments.length > 0 && (
        <section>
          <div className="card-head"><h2>{tt('Payments')}</h2></div>
          <ul className="txn-list">
            {data.payments.map((p) => (
              <li key={p.id} className="txn">
                <div className="txn-main">
                  <div className="txn-title">{p.kind === 'wht' ? tt('Tax withheld') : p.accountName}</div>
                  <div className="muted small">{friendlyDate(p.date, t)}{p.invoiceNumber ? ` · ${p.invoiceNumber}` : ''}</div>
                </div>
                <div className="txn-amt pos">+{money(p.amount)}</div>
                {p.kind === 'sale' && <Link to={`/receipt/${p.id}`} className="icon-btn small-btn" aria-label={tt('Receipt for GHS {amount}', { amount: money(p.amount) })}><Icon name="print" size={18} /></Link>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
