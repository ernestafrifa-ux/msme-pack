import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../session.jsx';
import { useT } from '../i18n.jsx';
import { Field, FormError, TopBar } from '../components.jsx';
import { money, longDate, todayGhana } from '../format';

export default function LoanDetail() {
  const { debtId } = useParams();
  const navigate = useNavigate();
  const { business } = useSession();
  const { t, tt } = useT();
  const [data, setData] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [f, setF] = useState({ amount: '', interest: '', accountId: '', date: todayGhana() });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [flash, setFlash] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    Promise.all([api(`/businesses/${business.id}/debts/${debtId}`), api(`/businesses/${business.id}/accounts`)])
      .then(([d, a]) => {
        setData(d); setAccounts(a.accounts);
        setF((x) => ({ ...x, accountId: x.accountId || a.accounts[0]?.id || '' }));
      })
      .catch((err) => setMessage(err.message));
  }, [business.id, debtId]);
  useEffect(() => { load(); }, [load]);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function pay(e) {
    e.preventDefault();
    setBusy(true); setErrors({}); setMessage(''); setFlash('');
    try {
      await api(`/businesses/${business.id}/debts/${debtId}/repayments`, { method: 'POST', body: { ...f, interest: f.interest || 0 } });
      setFlash(t('loans.paidSaved', { amount: money(f.amount) }));
      setF({ ...f, amount: '', interest: '' });
      load();
    } catch (err) { setErrors(err.fields || {}); setMessage(err.message); } finally { setBusy(false); }
  }
  async function remove() {
    if (!window.confirm(t('loans.confirmDelete'))) return;
    try {
      await api(`/businesses/${business.id}/debts/${debtId}`, { method: 'DELETE' });
      navigate('/loans');
    } catch (err) { setMessage(err.message); }
  }

  if (!data) return <main className="screen"><TopBar title={t('loans.title')} back="/loans" /><FormError message={message} /></main>;
  const d = data.debt;
  const open = Number(d.balance) > 0;
  return (
    <main className="screen">
      <TopBar title={d.lender} back="/loans" />
      <section className="card">
        <div className="muted small">{t(`loans.kind.${d.kind}`)}{d.boughtOnCredit ? ` · ${t('loans.fromCredit')}` : ''}</div>
        <div className="stats">
          <div><div className="muted small">{t('loans.borrowed')}</div><div className="stat">{money(d.amount)}</div></div>
          <div><div className="muted small">{t('loans.repaid')}</div><div className="stat">{money(d.repaid)}</div></div>
          <div><div className="muted small">{t('loans.balance')}</div><div className="stat neg">{money(d.balance)}</div></div>
        </div>
        <p className="muted small">
          {t('loans.since', { date: longDate(d.startDate, t) })}
          {d.receivedInto ? ` · ${t('loans.intoN', { name: d.receivedInto })}` : ''}
          {Number(d.interestPaid) > 0 ? ` · ${t('loans.interestN', { amount: money(d.interestPaid) })}` : ''}
        </p>
        {open && (
          <label className="field">
            <span className="field-label">{tt('Pay by, or next payment due')}</span>
            <input type="date" value={d.dueDate || ''} onChange={async (e) => {
              const r = await api(`/businesses/${business.id}/debts/${d.id}`, { method: 'PATCH', body: { dueDate: e.target.value || null } });
              setData({ ...data, debt: r.debt });
              setFlash(r.debt.dueDate ? tt('Reminder set for {date}.', { date: longDate(r.debt.dueDate, t) }) : tt('Reminder removed.'));
            }} />
          </label>
        )}
      </section>

      {flash && <div className="flash" role="status">{flash}</div>}
      {open && (
        <form className="card stack" onSubmit={pay} noValidate>
          <h2>{t('loans.recordPayment')}</h2>
          <FormError message={message} />
          <div className="grid-2">
            <Field label={t('loans.paid')} error={errors.amount}>{(p) => <input {...p} type="number" inputMode="decimal" min="0" step="0.01" value={f.amount} onChange={set('amount')} />}</Field>
            <Field label={t('loans.ofWhichInterest')} error={errors.interest}>{(p) => <input {...p} type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={f.interest} onChange={set('interest')} />}</Field>
          </div>
          <p className="muted small">{t('loans.interestHint')}</p>
          <div className="grid-2">
            <Field label={t('record.whereFrom')} error={errors.accountId}>
              {(p) => <select {...p} value={f.accountId} onChange={set('accountId')}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>}
            </Field>
            <Field label={t('common.date')} error={errors.date}>{(p) => <input {...p} type="date" max={todayGhana()} value={f.date} onChange={set('date')} />}</Field>
          </div>
          <button className="btn btn-primary btn-block" disabled={busy || !accounts.length}>{busy ? t('common.saving') : t('loans.savePayment')}</button>
        </form>
      )}
      {!open && <FormError message={message} />}

      <h2 className="date-head">{t('loans.payments')}</h2>
      {!data.repayments.length && <div className="empty">{t('loans.noPayments')}</div>}
      <ul className="txn-list">
        {data.repayments.map((r) => (
          <li key={r.id} className="txn">
            <span className="txn-main">
              <span className="txn-title">{longDate(r.date, t)}</span>
              <span className="small muted">
                {r.accountName}{Number(r.interest) > 0 ? ` · ${t('loans.splitN', { principal: money(r.principal), interest: money(r.interest) })}` : ''}
              </span>
            </span>
            <span className="txn-amt">−{money(r.amount)}</span>
          </li>
        ))}
      </ul>
      {!data.repayments.length && !d.boughtOnCredit && (
        <button type="button" className="btn btn-ghost btn-block danger" onClick={remove}>{t('loans.delete')}</button>
      )}
    </main>
  );
}
