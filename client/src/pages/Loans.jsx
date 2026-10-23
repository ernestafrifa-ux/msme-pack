import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../session.jsx';
import { useT } from '../i18n.jsx';
import { Field, FormError, Icon, TopBar } from '../components.jsx';
import { money, longDate, todayGhana } from '../format';

const KINDS = ['bank', 'microfinance', 'susu', 'supplier', 'family', 'other'];

function LoanForm({ accounts, onSaved, onCancel }) {
  const { business } = useSession();
  const { t, tt } = useT();
  const [f, setF] = useState({ lender: '', kind: 'microfinance', amount: '', startDate: todayGhana(), accountId: accounts[0]?.id || '', note: '', dueDate: '' });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save(e) {
    e.preventDefault();
    setBusy(true); setErrors({}); setMessage('');
    try {
      await api(`/businesses/${business.id}/debts`, { method: 'POST', body: { ...f, accountId: f.accountId || null, note: f.note || null, dueDate: f.dueDate || null } });
      onSaved();
    } catch (err) { setErrors(err.fields || {}); setMessage(err.message); } finally { setBusy(false); }
  }
  return (
    <form className="card stack" onSubmit={save} noValidate>
      <FormError message={message} />
      <Field label={t('loans.lender')} error={errors.lender}>{(p) => <input {...p} value={f.lender} onChange={set('lender')} placeholder={t('loans.lenderPh')} />}</Field>
      <Field label={t('loans.kind')} error={errors.kind}>
        {(p) => <select {...p} value={f.kind} onChange={set('kind')}>{KINDS.map((k) => <option key={k} value={k}>{t(`loans.kind.${k}`)}</option>)}</select>}
      </Field>
      <div className="grid-2">
        <Field label={t('loans.amount')} error={errors.amount}>{(p) => <input {...p} type="number" inputMode="decimal" min="0" step="0.01" value={f.amount} onChange={set('amount')} />}</Field>
        <Field label={t('common.date')} error={errors.startDate}>{(p) => <input {...p} type="date" max={todayGhana()} value={f.startDate} onChange={set('startDate')} />}</Field>
      </div>
      <Field label={t('loans.into')} error={errors.accountId} hint={t('loans.intoHint')}>
        {(p) => (
          <select {...p} value={f.accountId} onChange={set('accountId')}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            <option value="">{t('loans.notThroughApp')}</option>
          </select>
        )}
      </Field>
      <Field label={tt('Pay by, or next payment due (optional)')} error={errors.dueDate} hint={tt('You get a reminder on Home a week before')}>
        {(p) => <input {...p} type="date" value={f.dueDate} onChange={set('dueDate')} />}
      </Field>
      <Field label={t('common.noteOptional')}>{(p) => <input {...p} value={f.note} onChange={set('note')} />}</Field>
      <button className="btn btn-primary btn-block" disabled={busy}>{busy ? t('common.saving') : t('loans.save')}</button>
      <button type="button" className="btn btn-ghost btn-block" onClick={onCancel}>{t('common.cancel')}</button>
    </form>
  );
}

function AssetForm({ accounts, onSaved, onCancel }) {
  const { business } = useSession();
  const { t } = useT();
  const [f, setF] = useState({ name: '', cost: '', boughtOn: todayGhana(), accountId: '', currentValue: '', depreciationRate: '' });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save(e) {
    e.preventDefault();
    setBusy(true); setErrors({}); setMessage('');
    try {
      const body = { name: f.name, cost: f.cost || 0, boughtOn: f.boughtOn, accountId: f.accountId || null };
      if (f.depreciationRate !== '') body.depreciationRate = f.depreciationRate;
      else if (f.currentValue !== '') body.currentValue = f.currentValue;
      await api(`/businesses/${business.id}/assets`, { method: 'POST', body });
      onSaved();
    } catch (err) { setErrors(err.fields || {}); setMessage(err.message); } finally { setBusy(false); }
  }
  return (
    <form className="card stack" onSubmit={save} noValidate>
      <FormError message={message} />
      <Field label={t('assets.name')} error={errors.name}>{(p) => <input {...p} value={f.name} onChange={set('name')} placeholder={t('assets.namePh')} />}</Field>
      <div className="grid-2">
        <Field label={t('assets.cost')} error={errors.cost}>{(p) => <input {...p} type="number" inputMode="decimal" min="0" step="0.01" value={f.cost} onChange={set('cost')} />}</Field>
        <Field label={t('assets.bought')} error={errors.boughtOn}>{(p) => <input {...p} type="date" max={todayGhana()} value={f.boughtOn} onChange={set('boughtOn')} />}</Field>
      </div>
      <Field label={t('assets.paidFrom')} error={errors.accountId} hint={t('assets.paidFromHint')}>
        {(p) => (
          <select {...p} value={f.accountId} onChange={set('accountId')}>
            <option value="">{t('assets.before')}</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
      </Field>
      <Field label={t('assets.rate')} error={errors.depreciationRate} hint={t('assets.rateHint')}>
        {(p) => <input {...p} type="number" inputMode="decimal" min="0" max="100" step="0.5" value={f.depreciationRate} onChange={set('depreciationRate')} placeholder="e.g. 20" />}
      </Field>
      {f.depreciationRate === '' && (
        <Field label={t('assets.value')} error={errors.currentValue} hint={t('assets.valueHint')}>
          {(p) => <input {...p} type="number" inputMode="decimal" min="0" step="0.01" value={f.currentValue} onChange={set('currentValue')} placeholder={f.cost || '0.00'} />}
        </Field>
      )}
      <button className="btn btn-primary btn-block" disabled={busy}>{busy ? t('common.saving') : t('assets.save')}</button>
      <button type="button" className="btn btn-ghost btn-block" onClick={onCancel}>{t('common.cancel')}</button>
    </form>
  );
}

function AssetRow({ a, onChanged }) {
  const { business } = useSession();
  const { t } = useT();
  const [editing, setEditing] = useState(''); // '' | 'value' | 'rate'
  const [value, setValue] = useState(a.currentValue);
  const [rate, setRate] = useState(a.depreciationRate ?? '');
  const [message, setMessage] = useState('');
  async function saveValue(e) {
    e.preventDefault();
    try {
      const body = editing === 'rate'
        ? (rate === '' ? { depreciationRate: null, currentValue: a.currentValue } : { depreciationRate: rate })
        : { currentValue: value };
      await api(`/businesses/${business.id}/assets/${a.id}`, { method: 'PATCH', body });
      setEditing(''); onChanged();
    } catch (err) { setMessage(err.message); }
  }
  async function patch(body) { await api(`/businesses/${business.id}/assets/${a.id}`, { method: 'PATCH', body }); onChanged(); }
  async function remove() {
    if (!window.confirm(t('assets.confirmDelete', { name: a.name }))) return;
    await api(`/businesses/${business.id}/assets/${a.id}`, { method: 'DELETE' }); onChanged();
  }
  return (
    <li className="txn asset-row">
      <span className="txn-main">
        <span className="txn-title wrap">{a.name}{a.disposedOn && <span className="tag">{t('assets.gone')}</span>}</span>
        <span className="small muted">
          {t('assets.line', { cost: money(a.cost), date: longDate(a.boughtOn, t) })}
          {a.paidFrom ? ` · ${t('assets.paidFromN', { name: a.paidFrom })}` : ''}
        </span>
        {a.depreciationRate != null && (
          <span className="small muted">
            {t('assets.rateLine', { rate: a.depreciationRate })}
            {Number(a.depreciatedSoFar) > 0 ? ` · ${t('assets.depSoFar', { amount: money(a.depreciatedSoFar) })}` : ''}
            {Number(a.nextCharge) > 0 ? ` · ${t('assets.depNext', { amount: money(a.nextCharge) })}` : ''}
          </span>
        )}
        {editing === 'value' && (
          <form className="inline-form" onSubmit={saveValue}>
            <input aria-label={t('assets.value')} type="number" inputMode="decimal" min="0" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} />
            <button className="btn btn-primary">{t('common.save')}</button>
          </form>
        )}
        {editing === 'rate' && (
          <form className="stack-tight" onSubmit={saveValue}>
            <span className="inline-form">
              <input aria-label={t('assets.rateLabel')} type="number" inputMode="decimal" min="0" max="100" step="0.5" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="e.g. 20" />
              <button className="btn btn-primary">{t('common.save')}</button>
              <button type="button" className="btn btn-ghost" onClick={() => setEditing('')}>{t('common.cancel')}</button>
            </span>
            {a.depreciationRate != null && <span className="small muted">{t('assets.rateClear')}</span>}
          </form>
        )}
        {!editing && (
          <span className="asset-actions">
            {a.depreciationRate == null && <button type="button" className="btn-link small" onClick={() => setEditing('value')}>{t('assets.updateValue')}</button>}
            <button type="button" className="btn-link small" onClick={() => setEditing('rate')}>{a.depreciationRate == null ? t('assets.setRate') : t('assets.changeRate')}</button>
            {!a.disposedOn
              ? <button type="button" className="btn-link small" onClick={() => patch({ disposedOn: todayGhana() })}>{t('assets.markGone')}</button>
              : <button type="button" className="btn-link small" onClick={() => patch({ disposedOn: null })}>{t('assets.markBack')}</button>}
            <button type="button" className="btn-link small danger" onClick={remove}>{t('assets.delete')}</button>
          </span>
        )}
        {message && <span className="field-error">{message}</span>}
      </span>
      <span className="txn-amt">{money(a.currentValue)}</span>
    </li>
  );
}

export default function Loans() {
  const { business } = useSession();
  const { t, tt } = useT();
  const [debts, setDebts] = useState(null);
  const [assets, setAssets] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [adding, setAdding] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    Promise.all([
      api(`/businesses/${business.id}/debts`),
      api(`/businesses/${business.id}/assets`),
      api(`/businesses/${business.id}/accounts`),
    ]).then(([d, a, acc]) => { setDebts(d); setAssets(a); setAccounts(acc.accounts); })
      .catch((err) => setError(err.message));
  }, [business.id]);
  useEffect(() => { load(); }, [load]);
  const saved = () => { setAdding(''); load(); };

  return (
    <main className="screen">
      <TopBar title={t('loans.title')} back="/reports" />
      {error && <div className="form-error" role="alert">{error}</div>}

      <div className="card-head"><h2>{t('loans.owe')}</h2>{debts && <span className="num strong">GHS {money(debts.totalOwed)}</span>}</div>
      <p className="muted small">{t('loans.oweLead')}</p>
      {adding === 'loan' ? <LoanForm accounts={accounts} onSaved={saved} onCancel={() => setAdding('')} /> : (
        <button type="button" className="btn btn-ghost btn-block dashed" onClick={() => setAdding('loan')}>
          <Icon name="plus" size={18} /> {t('loans.add')}
        </button>
      )}
      {debts && debts.debts.length > 0 && (
        <ul className="txn-list">
          {debts.debts.map((d) => (
            <li key={d.id}>
              <Link to={`/loans/${d.id}`} className="txn report-link">
                <span className="txn-main">
                  <span className="txn-title wrap">{d.lender}</span>
                  <span className="small muted">
                    {t(`loans.kind.${d.kind}`)} · {t('loans.borrowedN', { amount: money(d.amount), date: longDate(d.startDate, t) })}
                  </span>
                  {d.dueDate && Number(d.balance) > 0 && (
                    <span className={'small ' + (d.dueDate < todayGhana() ? 'warn-text' : 'muted')}>{tt('Pay by {date}', { date: longDate(d.dueDate, t) })}</span>
                  )}
                </span>
                <span className="txn-amt">{Number(d.balance) > 0 ? money(d.balance) : t('loans.paidOff')}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="card-head"><h2>{t('assets.title')}</h2>{assets && <span className="num strong">GHS {money(assets.totalValue)}</span>}</div>
      <p className="muted small">{t('assets.lead')}</p>
      {adding === 'asset' ? <AssetForm accounts={accounts} onSaved={saved} onCancel={() => setAdding('')} /> : (
        <button type="button" className="btn btn-ghost btn-block dashed" onClick={() => setAdding('asset')}>
          <Icon name="plus" size={18} /> {t('assets.add')}
        </button>
      )}
      {assets && assets.assets.length > 0 && (
        <ul className="txn-list">{assets.assets.map((a) => <AssetRow key={a.id} a={a} onChanged={load} />)}</ul>
      )}
    </main>
  );
}
