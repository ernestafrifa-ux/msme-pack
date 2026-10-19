import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../session.jsx';
import { useT } from '../i18n.jsx';
import { Field, FormError, TopBar } from '../components.jsx';
import { money, friendlyDate } from '../format';

// Close the day: count what is really in the cash box (and check MoMo) against the records.
export default function CloseDay() {
  const { business } = useSession();
  const { t } = useT();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [counted, setCounted] = useState({});
  const [record, setRecord] = useState(true);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/businesses/${business.id}/cash-counts`).then(setData).catch((err) => setMessage(err.message));
  }, [business.id]);

  const entered = data ? data.accounts.filter((a) => counted[a.id] !== undefined && counted[a.id] !== '') : [];
  async function save(e) {
    e.preventDefault();
    setBusy(true); setMessage('');
    try {
      const r = await api(`/businesses/${business.id}/cash-counts`, { method: 'POST', body: {
        counts: entered.map((a) => ({ accountId: a.id, counted: counted[a.id] })), recordDifference: record, note: note || null } });
      const off = r.counts.filter((c) => Number(c.difference) !== 0);
      const msg = !off.length ? 'Day closed. Everything matches the records.'
        : off.map((c) => `${c.accountName}: ${Number(c.difference) < 0 ? 'short' : 'extra'} GHS ${money(Math.abs(Number(c.difference)))}`).join('; ')
          + (record ? '. Recorded so the balances match what is there.' : '. Noted only.');
      navigate('/', { state: { flash: msg } });
    } catch (err) { setMessage(err.message); } finally { setBusy(false); }
  }

  return (
    <main className="screen">
      <TopBar title="Close the day" back="/" />
      <p className="lead">Count the money in the cash box and check the MoMo balance on the phone. Enter what is really there.</p>
      <FormError message={message} />
      {data && (
        <form className="stack" onSubmit={save} noValidate>
          {data.accounts.map((a) => {
            const v = counted[a.id];
            const diff = v === undefined || v === '' ? null : Math.round((Number(v) - Number(a.expected)) * 100) / 100;
            return (
              <div key={a.id} className="card stack-tight">
                <div className="statement-row"><span className="strong">{a.name}</span><span className="muted small">Records say GHS {money(a.expected)}</span></div>
                <Field label={a.kind === 'cash' ? `Counted in ${a.name} (GHS)` : `Balance on the phone or statement (GHS)`}>
                  {(p) => <input {...p} type="number" inputMode="decimal" min="0" step="0.01" placeholder={a.kind === 'cash' ? 'Count it' : 'Optional'}
                    value={v ?? ''} onChange={(e) => setCounted({ ...counted, [a.id]: e.target.value })} />}
                </Field>
                {diff !== null && (
                  <p className={'small strong ' + (diff === 0 ? 'pos-text' : 'warn-text')}>
                    {diff === 0 ? 'Matches the records.' : diff < 0 ? `Short by GHS ${money(-diff)}` : `Extra GHS ${money(diff)}`}
                  </p>
                )}
              </div>
            );
          })}
          <label className="check-row top">
            <input type="checkbox" checked={record} onChange={(e) => setRecord(e.target.checked)} />
            <span>Record any difference
              <span className="small muted block">A shortage becomes a cost (&ldquo;Cash shortage&rdquo;) and extra money becomes income, so the balances match what is really there. Untick to only note it.</span>
            </span>
          </label>
          <Field label="Note (optional)" hint="e.g. who counted, or why it is short">
            {(p) => <input {...p} value={note} onChange={(e) => setNote(e.target.value)} />}
          </Field>
          <button className="btn btn-primary btn-block" disabled={busy || !entered.length}>{busy ? 'Saving…' : 'Close the day'}</button>
        </form>
      )}
      {data && data.history.length > 0 && (
        <section>
          <div className="card-head"><h2>Earlier counts</h2></div>
          <ul className="txn-list">
            {data.history.slice(0, 20).map((c) => (
              <li key={c.id} className="txn">
                <div className="txn-main">
                  <div className="txn-title">{c.accountName} · {friendlyDate(c.date, t)}</div>
                  <div className="muted small">Counted {money(c.counted)} by {c.countedBy}{c.note ? ` · ${c.note}` : ''}{Number(c.difference) !== 0 && !c.recorded ? ' · noted only' : ''}</div>
                </div>
                <div className={'txn-amt ' + (Number(c.difference) < 0 ? 'neg' : Number(c.difference) > 0 ? 'pos' : '')}>
                  {Number(c.difference) === 0 ? '✓' : `${Number(c.difference) > 0 ? '+' : '−'}${money(Math.abs(Number(c.difference)))}`}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
